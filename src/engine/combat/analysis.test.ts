/**
 * Battle analysis tests.
 *
 * The numbers on the result screen are the only account of the fight a player ever reads, so
 * they have to be right — and the loss hint has to point at something true, because a hint
 * that blames the wrong thing sends the player shopping for the wrong upgrade.
 */

import { describe, expect, it } from 'vitest';
import { analyseBattle } from './analysis';
import { buildMonsterCombatant, buildReferenceCombatant } from './combatant';
import { fight } from './fight';
import type { BattleEvent, CombatantCard } from './types';

const HERO: CombatantCard = { id: 'a', name: 'Wren', kind: 'Hunter', level: 20, maxHealth: 500 };
const FOE: CombatantCard = {
  id: 'b',
  name: 'Ridge Troll',
  kind: 'Tank',
  level: 20,
  maxHealth: 900,
};

function log(...events: BattleEvent[]): BattleEvent[] {
  return [{ t: 'battle_start', a: HERO, b: FOE, first: 'a' }, ...events];
}

describe('analyseBattle — counting what happened', () => {
  it('counts swings, hits, crits and follow-ups per side', () => {
    const analysis = analyseBattle(
      log(
        { t: 'round_start', n: 1 },
        { t: 'attack', source: 'a', raw: 100, final: 90, crit: false },
        { t: 'damage', target: 'b', amount: 90, hpAfter: 810 },
        { t: 'attack', source: 'a', raw: 60, final: 50, crit: false, followUp: true },
        { t: 'damage', target: 'b', amount: 50, hpAfter: 760 },
        { t: 'attack', source: 'b', raw: 200, final: 180, crit: true },
        { t: 'damage', target: 'a', amount: 180, hpAfter: 320 },
        { t: 'blocked', target: 'b' },
        { t: 'dodged', target: 'b' },
        { t: 'missed', source: 'a' },
        { t: 'battle_end', winner: 'a', rounds: 1, reason: 'knockout' },
      ),
    );

    expect(analysis.stats.a).toMatchObject({
      hits: 2,
      crits: 0,
      followUps: 1,
      // Two landed, plus a block, a dodge and a miss that were all hers.
      swings: 5,
      evaded: 3,
      damageDealt: 140,
      biggestHit: 90,
    });
    expect(analysis.stats.b).toMatchObject({ hits: 1, crits: 1, swings: 1, damageDealt: 180 });
  });

  it('credits a block or dodge against the swinger, not the defender', () => {
    // `blocked` is logged with the *target*; the swing belonged to the other side.
    const analysis = analyseBattle(log({ t: 'blocked', target: 'a' }));

    expect(analysis.stats.b.swings).toBe(1);
    expect(analysis.stats.b.evaded).toBe(1);
    expect(analysis.stats.a.swings).toBe(0);
  });

  it('does not count overkill as damage dealt', () => {
    const analysis = analyseBattle(
      log(
        { t: 'attack', source: 'a', raw: 1_000, final: 950, crit: true },
        { t: 'damage', target: 'b', amount: 950, hpAfter: 0, overkill: 50 },
        { t: 'ko', target: 'b' },
        { t: 'battle_end', winner: 'a', rounds: 1, reason: 'knockout' },
      ),
    );

    expect(analysis.stats.a.damageDealt).toBe(900);
  });

  it('tracks the lowest health each side reached — the closest moment', () => {
    const analysis = analyseBattle(
      log(
        { t: 'attack', source: 'b', raw: 500, final: 460, crit: false },
        { t: 'damage', target: 'a', amount: 460, hpAfter: 40 },
        { t: 'battle_end', winner: 'a', rounds: 2, reason: 'round_limit' },
      ),
    );

    expect(analysis.lowestHealth.a).toBe(40);
    expect(analysis.finalHealth.a).toBe(40);
    expect(analysis.maxHealth).toEqual({ a: 500, b: 900 });
  });

  it('measures how much of your damage armour ate', () => {
    const analysis = analyseBattle(
      log(
        { t: 'attack', source: 'a', raw: 200, final: 100, crit: false },
        { t: 'damage', target: 'b', amount: 100, hpAfter: 800 },
        { t: 'battle_end', winner: 'b', rounds: 1, reason: 'knockout' },
      ),
    );

    expect(analysis.mitigatedShare).toBeCloseTo(0.5, 5);
  });

  it('reads a real engine log without disagreeing with the engine', () => {
    const hero = buildReferenceCombatant('mage', 30, 'hero');
    const monster = buildMonsterCombatant({
      id: 'bruiser',
      name: 'Ridge Troll',
      archetypeId: 'bruiser',
      level: 30,
    });
    const result = fight(hero, monster, 4242);
    const analysis = analyseBattle(result.log, 'a');

    expect(analysis.winner).toBe(result.winner);
    expect(analysis.rounds).toBe(result.rounds);
    expect(analysis.reason).toBe(result.reason);
    expect(analysis.finalHealth.a).toBe(result.remainingHealth.a);
    expect(analysis.finalHealth.b).toBe(result.remainingHealth.b);
    expect(analysis.lowestHealth.a).toBe(result.lowestHealth.a);
    expect(analysis.stats.a.damageDealt).toBe(result.totalDamage.a);
    expect(analysis.stats.b.damageDealt).toBe(result.totalDamage.b);
  });
});

describe('loss hints', () => {
  it('says nothing at all when the player won', () => {
    const analysis = analyseBattle(
      log({ t: 'battle_end', winner: 'a', rounds: 3, reason: 'knockout' }),
      'a',
    );

    expect(analysis.hints).toEqual([]);
  });

  it('blames armour when armour was the problem', () => {
    const analysis = analyseBattle(
      log(
        { t: 'attack', source: 'a', raw: 300, final: 90, crit: false },
        { t: 'damage', target: 'b', amount: 90, hpAfter: 810 },
        { t: 'battle_end', winner: 'b', rounds: 6, reason: 'knockout' },
      ),
      'a',
    );

    const armour = analysis.hints.find((hint) => hint.kind === 'armour');
    expect(armour).toBeDefined();
    expect(armour?.kind === 'armour' && armour.mitigatedShare).toBeCloseTo(0.7, 5);
  });

  it('blames evasion when the swings simply were not landing', () => {
    const analysis = analyseBattle(
      log(
        { t: 'blocked', target: 'b' },
        { t: 'dodged', target: 'b' },
        { t: 'missed', source: 'a' },
        { t: 'attack', source: 'a', raw: 100, final: 100, crit: false },
        { t: 'damage', target: 'b', amount: 100, hpAfter: 800 },
        { t: 'battle_end', winner: 'b', rounds: 6, reason: 'knockout' },
      ),
      'a',
    );

    const evaded = analysis.hints.find((hint) => hint.kind === 'evaded');
    expect(evaded).toMatchObject({ kind: 'evaded', evaded: 3, swings: 4 });
  });

  it('leads with the encouraging line when the fight was nearly won', () => {
    const analysis = analyseBattle(
      log(
        { t: 'attack', source: 'a', raw: 900, final: 880, crit: false },
        { t: 'damage', target: 'b', amount: 880, hpAfter: 20 },
        { t: 'attack', source: 'b', raw: 520, final: 500, crit: true },
        { t: 'damage', target: 'a', amount: 500, hpAfter: 0 },
        { t: 'ko', target: 'a' },
        { t: 'battle_end', winner: 'b', rounds: 2, reason: 'knockout' },
      ),
      'a',
    );

    expect(analysis.hints[0]).toMatchObject({ kind: 'so-close', theirRemaining: 20 });
  });

  it('explains a fight that ran out of rounds', () => {
    const analysis = analyseBattle(
      log({ t: 'battle_end', winner: 'b', rounds: 100, reason: 'round_limit' }),
      'a',
    );

    expect(analysis.hints.some((hint) => hint.kind === 'round-limit')).toBe(true);
  });

  it('writes the hints from the loser’s seat, whichever seat that is', () => {
    const events = log(
      { t: 'attack', source: 'b', raw: 400, final: 120, crit: false },
      { t: 'damage', target: 'a', amount: 120, hpAfter: 380 },
      { t: 'battle_end', winner: 'a', rounds: 5, reason: 'knockout' },
    );

    // Seat A won, so A gets no hints and B is told their damage was being absorbed.
    expect(analyseBattle(events, 'a').hints).toEqual([]);
    expect(analyseBattle(events, 'b').hints.some((hint) => hint.kind === 'armour')).toBe(true);
  });

  it('always has something to say after a loss', () => {
    // Whatever shape the defeat took, silence is the one unacceptable answer.
    for (let seed = 1; seed <= 40; seed += 1) {
      const hero = buildReferenceCombatant('mage', 10, 'hero');
      const monster = buildMonsterCombatant({
        id: 'tank',
        name: 'Ridge Troll',
        archetypeId: 'tank',
        level: 40,
      });
      const result = fight(hero, monster, seed);
      if (result.winner === 'a') continue;

      expect(analyseBattle(result.log, 'a').hints.length).toBeGreaterThan(0);
    }
  });
});
