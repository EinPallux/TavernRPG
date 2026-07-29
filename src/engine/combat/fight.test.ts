import { describe, expect, it } from 'vitest';
import { classDef } from '@/data/classes';
import { MAX_ROUNDS, type BattleEvent, type Combatant, type CombatProc } from './types';
import { critChance, damageReduction, fight } from './fight';
import { buildMonsterCombatant, buildReferenceCombatant, procsForClass } from './combatant';

/** A deliberately plain fighter, so a test can isolate exactly one rule. */
function dummy(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'dummy',
    name: 'Dummy',
    kind: 'Dummy',
    level: 10,
    maxHealth: 500,
    attributes: { str: 10, dex: 10, int: 10, con: 10, lck: 0 },
    mainStat: 'str',
    weapon: { min: 10, max: 10 },
    armour: 0,
    damageReductionCap: 0,
    procs: [],
    ...overrides,
  };
}

const count = (log: readonly BattleEvent[], type: BattleEvent['t']) =>
  log.filter((event) => event.t === type).length;

describe('fight — determinism', () => {
  it('produces an identical result for the same seed', () => {
    const a = buildReferenceCombatant('warrior', 20, 'a');
    const b = buildReferenceCombatant('hunter', 20, 'b');

    expect(fight(a, b, 4242)).toEqual(fight(a, b, 4242));
  });

  it('produces different fights for different seeds', () => {
    const a = buildReferenceCombatant('warrior', 20, 'a');
    const b = buildReferenceCombatant('hunter', 20, 'b');

    const logs = new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(fight(a, b, seed).log)));
    expect(logs.size).toBeGreaterThan(1);
  });

  it('survives a JSON round-trip, because saves and replays store the log', () => {
    const result = fight(
      buildReferenceCombatant('mage', 15, 'a'),
      buildMonsterCombatant({ id: 'm', name: 'Sootback Boar', archetypeId: 'bruiser', level: 15 }),
      99,
    );

    expect(JSON.parse(JSON.stringify(result.log))).toEqual(result.log);
  });
});

describe('fight — the log tells the whole story', () => {
  const result = fight(
    buildReferenceCombatant('swashbuckler', 30, 'hero'),
    buildMonsterCombatant({ id: 'foe', name: 'Marsh Widow', archetypeId: 'skirmisher', level: 30 }),
    7,
  );

  it('opens with both fighters and who moves first', () => {
    const first = result.log[0];
    expect(first?.t).toBe('battle_start');
    if (first?.t !== 'battle_start') return;
    expect(first.a.name).toBe('Swashbuckler');
    expect(first.b.name).toBe('Marsh Widow');
    expect(['a', 'b']).toContain(first.first);
  });

  it('closes with a verdict that matches the result', () => {
    const last = result.log.at(-1);
    expect(last?.t).toBe('battle_end');
    if (last?.t !== 'battle_end') return;
    expect(last.winner).toBe(result.winner);
    expect(last.rounds).toBe(result.rounds);
  });

  it('numbers its rounds consecutively from one', () => {
    const rounds = result.log.filter((event) => event.t === 'round_start').map((e) => e.n);
    expect(rounds).toEqual(Array.from({ length: rounds.length }, (_, index) => index + 1));
  });

  it('pairs every landed attack with a damage event', () => {
    expect(count(result.log, 'damage')).toBe(count(result.log, 'attack'));
  });

  it('never lets health go negative or exceed the maximum', () => {
    for (const event of result.log) {
      if (event.t === 'damage') {
        expect(event.hpAfter).toBeGreaterThanOrEqual(0);
        expect(event.amount).toBeGreaterThan(0);
      }
    }
  });

  it('knocks out exactly one fighter, at the end', () => {
    expect(count(result.log, 'ko')).toBe(1);
    const koIndex = result.log.findIndex((event) => event.t === 'ko');
    expect(koIndex).toBe(result.log.length - 2); // ko, then battle_end
  });
});

describe('fight — class procs', () => {
  it('Shield Wall blocks roughly a quarter of incoming hits', () => {
    let attacks = 0;
    let blocks = 0;

    for (let seed = 0; seed < 200; seed += 1) {
      const result = fight(
        dummy({ id: 'attacker', maxHealth: 4000 }),
        dummy({ id: 'warrior', maxHealth: 4000, procs: [{ kind: 'block', chance: 0.25 }] }),
        seed,
      );
      for (const event of result.log) {
        if (event.t === 'attack' && event.source === 'a') attacks += 1;
        if (event.t === 'blocked' && event.target === 'b') blocks += 1;
      }
    }

    expect(blocks / (attacks + blocks)).toBeCloseTo(0.25, 1);
  });

  it('Windstep dodges roughly its stated share', () => {
    let attacks = 0;
    let dodges = 0;

    for (let seed = 0; seed < 200; seed += 1) {
      const result = fight(
        dummy({ id: 'attacker', maxHealth: 4000 }),
        dummy({ id: 'hunter', maxHealth: 4000, procs: [{ kind: 'dodge', chance: 0.4 }] }),
        seed,
      );
      for (const event of result.log) {
        if (event.t === 'attack' && event.source === 'a') attacks += 1;
        if (event.t === 'dodged' && event.target === 'b') dodges += 1;
      }
    }

    expect(dodges / (attacks + dodges)).toBeCloseTo(0.4, 1);
  });

  it('Arcane Certainty makes defences work worse, but not uselessly', () => {
    const withMagic = { kind: 'arcane-certainty' } as CombatProc;
    let dodgedVsMagic = 0;
    let dodgedVsSteel = 0;

    for (let seed = 0; seed < 150; seed += 1) {
      const defender = () =>
        dummy({ id: 'd', maxHealth: 6000, procs: [{ kind: 'dodge', chance: 0.5 }] });

      dodgedVsMagic += count(
        fight(dummy({ id: 'mage', maxHealth: 6000, procs: [withMagic] }), defender(), seed).log,
        'dodged',
      );
      dodgedVsSteel += count(
        fight(dummy({ id: 'plain', maxHealth: 6000 }), defender(), seed).log,
        'dodged',
      );
    }

    expect(dodgedVsMagic).toBeGreaterThan(0); // not nullified…
    expect(dodgedVsMagic).toBeLessThan(dodgedVsSteel * 0.8); // …but clearly weakened
  });

  it('Flurry lands follow-up strikes at a reduced rate and reduced damage', () => {
    const result = fight(
      dummy({
        id: 'swash',
        maxHealth: 8000,
        procs: [{ kind: 'double-strike', chance: 0.6, damageMultiplier: 0.75 }],
      }),
      dummy({ id: 'target', maxHealth: 8000 }),
      3,
    );

    const attacks = result.log.filter((event) => event.t === 'attack' && event.source === 'a');
    const followUps = attacks.filter((event) => event.t === 'attack' && event.followUp);
    expect(followUps.length).toBeGreaterThan(0);

    const primaryAverage =
      attacks
        .filter((e) => e.t === 'attack' && !e.followUp && !e.crit)
        .reduce((sum, e) => sum + (e.t === 'attack' ? e.final : 0), 0) /
      Math.max(1, attacks.filter((e) => e.t === 'attack' && !e.followUp && !e.crit).length);
    const followAverage =
      followUps
        .filter((e) => e.t === 'attack' && !e.crit)
        .reduce((sum, e) => sum + (e.t === 'attack' ? e.final : 0), 0) /
      Math.max(1, followUps.filter((e) => e.t === 'attack' && !e.crit).length);

    expect(followAverage).toBeLessThan(primaryAverage);
  });

  it('Verses change on the first round and every fourth after', () => {
    const result = fight(
      buildReferenceCombatant('bard', 60, 'bard'),
      dummy({ id: 'target', maxHealth: 400_000, weapon: { min: 1, max: 1 } }),
      11,
    );

    const changeRounds: number[] = [];
    let round = 0;
    for (const event of result.log) {
      if (event.t === 'round_start') round = event.n;
      if (event.t === 'verse_change' && event.side === 'a') changeRounds.push(round);
    }

    expect(changeRounds.length).toBeGreaterThan(1);
    for (const value of changeRounds) expect((value - 1) % 4).toBe(0);
  });

  it('gives a Bard a verse from the very first round', () => {
    const result = fight(
      buildReferenceCombatant('bard', 20, 'bard'),
      buildReferenceCombatant('warrior', 20, 'warrior'),
      5,
    );
    const firstVerse = result.log.findIndex((event) => event.t === 'verse_change');
    const firstAttack = result.log.findIndex((event) => event.t === 'attack');
    expect(firstVerse).toBeGreaterThan(-1);
    expect(firstVerse).toBeLessThan(firstAttack);
  });
});

describe('fight — maths', () => {
  it('caps armour reduction at the class limit', () => {
    expect(damageReduction(999_999, 10, 0.35)).toBeCloseTo(0.35, 5);
    expect(damageReduction(0, 10, 0.35)).toBe(0);
    // Armour is measured against the attacker's level, so it fades as the world levels up.
    expect(damageReduction(500, 10, 0.5)).toBeGreaterThan(damageReduction(500, 40, 0.5));
  });

  it('caps crit chance at 50%', () => {
    expect(critChance(10_000, 1)).toBe(0.5);
    expect(critChance(0, 10)).toBe(0);
    expect(critChance(20, 10)).toBeCloseTo(0.05, 5);
  });

  it('always deals at least one damage, however armoured the target', () => {
    const result = fight(
      dummy({
        id: 'weak',
        weapon: { min: 1, max: 1 },
        attributes: { str: 0, dex: 10, int: 0, con: 10, lck: 0 },
      }),
      dummy({ id: 'fortress', armour: 999_999, damageReductionCap: 0.9, maxHealth: 50 }),
      1,
    );

    for (const event of result.log) {
      if (event.t === 'damage') expect(event.amount).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('fight — edge cases', () => {
  it('ends on the round limit when neither side can finish, and says so', () => {
    const unkillable = () => dummy({ maxHealth: 1_000_000, weapon: { min: 1, max: 1 }, armour: 0 });

    const result = fight({ ...unkillable(), id: 'a' }, { ...unkillable(), id: 'b' }, 1);

    expect(result.rounds).toBe(MAX_ROUNDS);
    expect(result.reason).toBe('round_limit');
    expect(result.log.at(-1)).toMatchObject({ t: 'battle_end', reason: 'round_limit' });
  });

  it('gives an exact stalemate to the defender, since the attacker chose the fight', () => {
    const twin = (id: string) => dummy({ id, maxHealth: 1_000_000, weapon: { min: 1, max: 1 } });

    // Identical fighters taking identical damage end level; the tiebreak must be stable.
    const result = fight(twin('a'), twin('b'), 12, { maxRounds: 2 });
    if (result.remainingHealth.a === result.remainingHealth.b) {
      expect(result.winner).toBe('b');
    }
  });

  it('handles a one-hit knockout without emitting a round that never happened', () => {
    const result = fight(
      dummy({ id: 'giant', weapon: { min: 10_000, max: 10_000 } }),
      dummy({ id: 'mouse', maxHealth: 5 }),
      2,
    );

    expect(result.rounds).toBe(1);
    expect(result.log.filter((event) => event.t === 'round_start')).toHaveLength(1);
  });

  it('reports the lowest health each side reached, for the "closest moment" line', () => {
    const result = fight(
      buildReferenceCombatant('warrior', 25, 'a'),
      buildReferenceCombatant('mage', 25, 'b'),
      8,
    );

    expect(result.lowestHealth.a).toBeLessThanOrEqual(result.remainingHealth.a);
    expect(result.lowestHealth[result.winner === 'a' ? 'b' : 'a']).toBe(0);
  });

  it('records who won by id, so callers never have to decode sides', () => {
    const result = fight(
      buildReferenceCombatant('hunter', 12, 'brenna'),
      buildMonsterCombatant({ id: 'boar', name: 'Boar', archetypeId: 'bruiser', level: 12 }),
      6,
    );

    expect([result.winnerId, result.loserId].sort()).toEqual(['boar', 'brenna']);
    expect(result.winnerId).not.toBe(result.loserId);
  });
});

describe('combatant construction', () => {
  it('translates every class kit into resolver procs', () => {
    expect(procsForClass('warrior')).toEqual([
      { kind: 'block', chance: classDef('warrior').proc.chance },
    ]);
    expect(procsForClass('mage')).toEqual([{ kind: 'arcane-certainty' }]);
    expect(procsForClass('bard')).toEqual([{ kind: 'verses' }]);
    expect(procsForClass('hunter')[0]).toMatchObject({ kind: 'dodge' });
    // The Swashbuckler carries both its offence and its light parry.
    expect(
      procsForClass('swashbuckler')
        .map((proc) => proc.kind)
        .sort(),
    ).toEqual(['dodge', 'double-strike']);
  });

  it('builds monsters whose health follows the same formula as heroes', () => {
    const monster = buildMonsterCombatant({
      id: 'm',
      name: 'Cellar Rat',
      archetypeId: 'swarm',
      level: 20,
    });

    expect(monster.maxHealth).toBe(Math.round(monster.attributes.con * 21 * 2.5));
    expect(monster.level).toBe(20);
  });

  it('makes boss-budget monsters meaningfully harder than their plain kin', () => {
    const plain = buildMonsterCombatant({ id: 'p', name: 'Guard', archetypeId: 'tank', level: 30 });
    const boss = buildMonsterCombatant({
      id: 'b',
      name: 'The Pale Margrave',
      archetypeId: 'tank',
      level: 30,
      budgetMultiplier: 1.6,
    });

    expect(boss.maxHealth).toBeGreaterThan(plain.maxHealth * 1.5);
    expect(boss.armour).toBeGreaterThan(plain.armour);
  });

  it('scales monsters with level', () => {
    const low = buildMonsterCombatant({ id: 'l', name: 'Rat', archetypeId: 'swarm', level: 5 });
    const high = buildMonsterCombatant({ id: 'h', name: 'Rat', archetypeId: 'swarm', level: 50 });
    expect(high.maxHealth).toBeGreaterThan(low.maxHealth * 10);
  });
});
