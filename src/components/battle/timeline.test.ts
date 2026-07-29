/**
 * Timeline tests.
 *
 * The scene is only as trustworthy as this module: if a beat is missing, mistimed or leaves a
 * fighter at the wrong health, the animation is wrong in a way no amount of CSS can fix. Since
 * `frameAt` is pure, all of that is checkable without rendering anything.
 */

import { describe, expect, it } from 'vitest';
import { CLASSES } from '@/data/classes';
import { ARCHETYPES } from '@/data/monsterArchetypes';
import { buildReferenceCombatant, buildMonsterCombatant } from '@/engine/combat/combatant';
import { fight } from '@/engine/combat/fight';
import type { BattleEvent, CombatantCard } from '@/engine/combat/types';
import {
  DEFAULT_CHOREO,
  PACE_FLOOR,
  REDUCED_CHOREO,
  SHAKE_THRESHOLD,
  TARGET_FIGHT_DURATION,
} from './battleChoreo';
import { beatDuration, buildTimeline, frameAt, timelineDuration } from './timeline';

/** Float accumulation across ~100 beats; a millisecond either way is not a pacing failure. */
const MS_TOLERANCE = 1;

const CARD_A: CombatantCard = {
  id: 'a',
  name: 'Kargath',
  kind: 'Warrior',
  level: 10,
  maxHealth: 400,
};
const CARD_B: CombatantCard = {
  id: 'b',
  name: 'Gutter Rat',
  kind: 'Skirmisher',
  level: 10,
  maxHealth: 200,
};

/** A hand-written fight, so every assertion has an exact expected moment. */
const SCRIPT: BattleEvent[] = [
  { t: 'battle_start', a: CARD_A, b: CARD_B, first: 'a' },
  { t: 'round_start', n: 1 },
  { t: 'attack', source: 'a', raw: 90, final: 80, crit: false },
  { t: 'damage', target: 'b', amount: 80, hpAfter: 120 },
  { t: 'blocked', target: 'a' },
  { t: 'round_start', n: 2 },
  { t: 'attack', source: 'a', raw: 260, final: 120, crit: true },
  { t: 'damage', target: 'b', amount: 120, hpAfter: 0 },
  { t: 'ko', target: 'b' },
  { t: 'battle_end', winner: 'a', rounds: 2, reason: 'knockout' },
];

/** Start of the beat at `index` in SCRIPT. */
function beatStart(index: number, choreo = DEFAULT_CHOREO): number {
  return buildTimeline(SCRIPT, choreo).beats[index]!.at;
}

describe('beatDuration', () => {
  it('gives every event type a moment on screen', () => {
    const events: BattleEvent[] = [
      { t: 'battle_start', a: CARD_A, b: CARD_B, first: 'a' },
      { t: 'round_start', n: 1 },
      { t: 'verse_change', side: 'a', verse: 'battle-hymn' },
      { t: 'attack', source: 'a', raw: 10, final: 10, crit: false },
      { t: 'blocked', target: 'b' },
      { t: 'dodged', target: 'b' },
      { t: 'missed', source: 'a' },
      { t: 'damage', target: 'b', amount: 10, hpAfter: 10 },
      { t: 'ko', target: 'b' },
      { t: 'battle_end', winner: 'a', rounds: 1, reason: 'knockout' },
    ];

    // No event may be silently skipped — a zero-length beat is an invisible event.
    for (const event of events) {
      expect(beatDuration(event, DEFAULT_CHOREO), event.t).toBeGreaterThan(0);
    }
  });

  it('holds longer on a critical hit than a normal one', () => {
    const normal = beatDuration(
      { t: 'attack', source: 'a', raw: 10, final: 10, crit: false },
      DEFAULT_CHOREO,
    );
    const crit = beatDuration(
      { t: 'attack', source: 'a', raw: 10, final: 10, crit: true },
      DEFAULT_CHOREO,
    );

    expect(crit).toBe(normal + DEFAULT_CHOREO.critHold);
  });

  it('rushes a follow-up strike — the second hit of a Flurry lands quicker', () => {
    const first = beatDuration(
      { t: 'attack', source: 'a', raw: 10, final: 10, crit: false },
      DEFAULT_CHOREO,
    );
    const second = beatDuration(
      { t: 'attack', source: 'a', raw: 10, final: 10, crit: false, followUp: true },
      DEFAULT_CHOREO,
    );

    expect(second).toBeCloseTo(first * DEFAULT_CHOREO.followUpScale, 5);
  });
});

describe('buildTimeline', () => {
  it('lays beats end to end with no gaps and no overlaps', () => {
    const { beats, duration } = buildTimeline(SCRIPT);

    expect(beats).toHaveLength(SCRIPT.length);
    for (let i = 1; i < beats.length; i += 1) {
      expect(beats[i]!.at).toBe(beats[i - 1]!.at + beats[i - 1]!.duration);
    }
    expect(duration).toBe(beats.at(-1)!.at + beats.at(-1)!.duration);
  });

  it('keeps every event under reduced motion, only shorter', () => {
    const full = buildTimeline(SCRIPT, DEFAULT_CHOREO);
    const reduced = buildTimeline(SCRIPT, REDUCED_CHOREO);

    // Following the fight must not require the ceremony.
    expect(reduced.beats).toHaveLength(full.beats.length);
    expect(reduced.duration).toBeLessThan(full.duration);
  });

  it('handles an empty log without inventing a fight', () => {
    expect(buildTimeline([])).toEqual({ beats: [], duration: 0 });
  });
});

describe('frameAt', () => {
  const timeline = buildTimeline(SCRIPT);

  it('opens with both fighters at full health', () => {
    const frame = frameAt(timeline, 0);

    expect(frame.health).toEqual({ a: 400, b: 200 });
    expect(frame.ghostHealth).toEqual({ a: 400, b: 200 });
    expect(frame.knockedOut).toBeNull();
    expect(frame.finished).toBe(false);
  });

  it('applies damage at the moment the damage beat starts, not before', () => {
    const damageAt = beatStart(3);

    expect(frameAt(timeline, damageAt - 1).health.b).toBe(200);
    expect(frameAt(timeline, damageAt).health.b).toBe(120);
  });

  it('drains the ghost bar behind the real one', () => {
    const damageAt = beatStart(3);
    const midDrain = frameAt(timeline, damageAt + DEFAULT_CHOREO.healthGhostDrain / 2);

    // The ghost is still catching up — that gap is the "chunk" the player sees leave.
    expect(midDrain.health.b).toBe(120);
    expect(midDrain.ghostHealth.b).toBeGreaterThan(120);
    expect(midDrain.ghostHealth.b).toBeLessThan(200);

    const settled = frameAt(timeline, damageAt + DEFAULT_CHOREO.healthGhostDrain + 1);
    expect(settled.ghostHealth.b).toBe(120);
  });

  it('never lets the ghost bar sit below the real health', () => {
    const { duration } = timeline;
    for (let t = 0; t <= duration; t += 17) {
      const frame = frameAt(timeline, t);
      expect(frame.ghostHealth.a).toBeGreaterThanOrEqual(frame.health.a);
      expect(frame.ghostHealth.b).toBeGreaterThanOrEqual(frame.health.b);
    }
  });

  it('runs the lunge from 0 to 1 across the attack beat, and only for the attacker', () => {
    const attackAt = beatStart(2);
    const attackFor = timeline.beats[2]!.duration;

    const start = frameAt(timeline, attackAt);
    expect(start.lunging?.side).toBe('a');
    expect(start.lunging?.progress).toBeCloseTo(0, 2);

    const end = frameAt(timeline, attackAt + attackFor * 0.9);
    expect(end.lunging?.progress).toBeGreaterThan(0.8);

    // Once the beat is over there is nothing to lunge.
    expect(frameAt(timeline, attackAt + attackFor + 1).lunging).toBeNull();
  });

  it('shows a block on the fighter who blocked, and only while it is happening', () => {
    const blockAt = beatStart(4);

    expect(frameAt(timeline, blockAt).reaction).toEqual({ side: 'a', kind: 'blocked' });
    expect(frameAt(timeline, blockAt + DEFAULT_CHOREO.defenceBeat + 1).reaction).toBeNull();
  });

  it('floats a damage number for its full life, then drops it', () => {
    const damageAt = beatStart(3);

    const early = frameAt(timeline, damageAt + 10).floatingDamage.find((n) => n.id === 'dmg-3');
    expect(early?.amount).toBe(80);
    expect(early?.crit).toBe(false);
    expect(early?.progress).toBeLessThan(0.1);

    // Numbers overlap by design — a later one being on screen must not keep this one alive.
    const late = frameAt(timeline, damageAt + DEFAULT_CHOREO.damageNumberLife + 1);
    expect(late.floatingDamage.find((n) => n.id === 'dmg-3')).toBeUndefined();
  });

  it('marks the damage number from a critical attack as a crit', () => {
    const critDamageAt = beatStart(7);
    const numbers = frameAt(timeline, critDamageAt + 10).floatingDamage;

    expect(numbers.find((n) => n.id === 'dmg-7')?.crit).toBe(true);
    // …and the earlier ordinary hit, still fading, is not retroactively promoted.
    expect(numbers.find((n) => n.id === 'dmg-3')?.crit).toBe(false);
  });

  it('emits one impact per hit, with a stable id so a burst spawns once', () => {
    const damageAt = beatStart(3);

    const first = frameAt(timeline, damageAt);
    const second = frameAt(timeline, damageAt + 5);

    expect(first.impacts).toHaveLength(1);
    expect(first.impacts[0]!.side).toBe('b');
    expect(second.impacts[0]!.id).toBe(first.impacts[0]!.id);
  });

  it('shakes on a big hit and stays still on a small one', () => {
    // 80 of 200 is 40% — comfortably over the threshold.
    const bigHit = beatStart(3);
    let peak = 0;
    for (let t = bigHit; t < bigHit + DEFAULT_CHOREO.shakeDuration; t += 4) {
      peak = Math.max(peak, Math.abs(frameAt(timeline, t).shake));
    }
    expect(peak).toBeGreaterThan(0);

    // And it settles: no shake once the beat has passed.
    expect(frameAt(timeline, bigHit + DEFAULT_CHOREO.shakeDuration + 1).shake).toBe(0);
  });

  it('leaves a graze unshaken', () => {
    const grazeLog: BattleEvent[] = [
      { t: 'battle_start', a: CARD_A, b: CARD_B, first: 'a' },
      { t: 'attack', source: 'a', raw: 12, final: 10, crit: false },
      // 10 of 200 = 5%, well under the threshold.
      { t: 'damage', target: 'b', amount: 10, hpAfter: 190 },
    ];
    const grazeTimeline = buildTimeline(grazeLog);
    const at = grazeTimeline.beats[2]!.at;

    expect(10 / CARD_B.maxHealth).toBeLessThan(SHAKE_THRESHOLD);
    expect(frameAt(grazeTimeline, at).shake).toBe(0);
  });

  it('never shakes under reduced motion', () => {
    const reduced = buildTimeline(SCRIPT, REDUCED_CHOREO);
    for (let t = 0; t <= reduced.duration; t += 7) {
      expect(frameAt(reduced, t, REDUCED_CHOREO).shake).toBe(0);
    }
  });

  it('knocks the loser out and finishes the fight', () => {
    const end = frameAt(timeline, timeline.duration);

    expect(end.knockedOut).toBe('b');
    expect(end.health.b).toBe(0);
    expect(end.ghostHealth.b).toBe(0);
    expect(end.finished).toBe(true);
  });

  it('does not reveal the result before the closing beat has played', () => {
    const closingAt = beatStart(9);

    expect(frameAt(timeline, closingAt).finished).toBe(false);
    expect(frameAt(timeline, timeline.duration).finished).toBe(true);
  });

  it('tracks the round number', () => {
    expect(frameAt(timeline, beatStart(1)).round).toBe(1);
    expect(frameAt(timeline, beatStart(5)).round).toBe(2);
  });

  it('carries a verse until it changes', () => {
    const verseLog: BattleEvent[] = [
      { t: 'battle_start', a: CARD_A, b: CARD_B, first: 'a' },
      { t: 'verse_change', side: 'a', verse: 'battle-hymn' },
      { t: 'round_start', n: 1 },
      { t: 'verse_change', side: 'a', verse: 'ironsong' },
    ];
    const verseTimeline = buildTimeline(verseLog);

    expect(frameAt(verseTimeline, verseTimeline.beats[1]!.at).verse.a).toBe('battle-hymn');
    expect(frameAt(verseTimeline, verseTimeline.beats[2]!.at).verse.a).toBe('battle-hymn');
    expect(frameAt(verseTimeline, verseTimeline.beats[3]!.at).verse.a).toBe('ironsong');
    expect(frameAt(verseTimeline, verseTimeline.duration).verse.b).toBeNull();
  });

  it('is pure — the same moment always yields the same frame', () => {
    expect(frameAt(timeline, 640)).toEqual(frameAt(timeline, 640));
  });

  it('clamps past the end rather than running off it', () => {
    const past = frameAt(timeline, timeline.duration * 4);
    expect(past.finished).toBe(true);
    expect(past.beatIndex).toBe(SCRIPT.length - 1);
  });
});

describe('pacing — ROADMAP Phase 4 acceptance', () => {
  /** A representative mission fight: hero versus a level-appropriate monster. */
  function missionFight(seed: number) {
    const hero = buildReferenceCombatant('warrior', 25, 'hero');
    const monster = buildMonsterCombatant({
      id: 'bruiser',
      name: 'Ridge Troll',
      archetypeId: 'bruiser',
      level: 25,
    });
    return fight(hero, monster, seed);
  }

  it('keeps a mission fight inside 8 seconds at ×1', () => {
    const lengths: number[] = [];

    for (let seed = 1; seed <= 60; seed += 1) {
      const timeline = buildTimeline(missionFight(seed).log);
      lengths.push(timelineDuration(timeline, 1) / 1000);
    }

    // Warrior versus bruiser is one of the longest mission matchups there is — if it fits,
    // the criterion holds where it is hardest.
    expect(Math.max(...lengths)).toBeLessThanOrEqual(8 + MS_TOLERANCE / 1000);
  });

  it('holds the target across every class, archetype and level band', () => {
    const lengths: number[] = [];

    for (const level of [1, 10, 25, 50, 100]) {
      for (const definition of CLASSES) {
        for (const template of ARCHETYPES) {
          for (let seed = 1; seed <= 8; seed += 1) {
            const result = fight(
              buildReferenceCombatant(definition.id, level, 'hero'),
              buildMonsterCombatant({
                id: template.id,
                name: template.name,
                archetypeId: template.id,
                level,
              }),
              seed,
            );
            lengths.push(buildTimeline(result.log).duration / 1000);
          }
        }
      }
    }

    lengths.sort((a, b) => a - b);
    const median = lengths[Math.floor((lengths.length - 1) * 0.5)]!;
    const p99 = lengths[Math.floor((lengths.length - 1) * 0.99)]!;

    // A typical fight should be well clear of the ceiling, or every fight feels long.
    expect(median).toBeLessThan(6);
    // The target is a promise about fights players actually see…
    expect(p99).toBeLessThanOrEqual(8 + MS_TOLERANCE / 1000);
    // …and the twenty-round outlier is allowed to run a little over rather than compress into
    // an unreadable blur (see PACE_FLOOR).
    expect(lengths.at(-1)!).toBeLessThan(9);
  });

  it('compresses a long fight toward the target without touching a short one', () => {
    const short = buildTimeline(SCRIPT);
    const naturalShort = buildTimeline(SCRIPT, DEFAULT_CHOREO, { targetDuration: null });

    // A ten-event fight is nowhere near the target, so it plays at its authored pace.
    expect(short.duration).toBeCloseTo(naturalShort.duration, 5);

    // A twenty-round grind does get squeezed.
    const long = missionFight(35);
    const natural = buildTimeline(long.log, DEFAULT_CHOREO, { targetDuration: null });
    const paced = buildTimeline(long.log);

    if (natural.duration > TARGET_FIGHT_DURATION) {
      expect(paced.duration).toBeLessThan(natural.duration);
      // …but never below the floor, whatever the target says.
      const floored = buildTimeline(long.log, DEFAULT_CHOREO, { targetDuration: 1 });
      expect(floored.duration).toBeGreaterThan(natural.duration * PACE_FLOOR);
    }
  });

  it('never compresses the knockout or the closing beat', () => {
    const paced = buildTimeline(SCRIPT, DEFAULT_CHOREO, { targetDuration: 1 });

    const ko = paced.beats.find((beat) => beat.event.t === 'ko')!;
    const end = paced.beats.find((beat) => beat.event.t === 'battle_end')!;
    const opening = paced.beats[0]!;

    expect(ko.duration).toBe(DEFAULT_CHOREO.knockoutBeat);
    expect(end.duration).toBe(DEFAULT_CHOREO.finishBeat);
    expect(opening.duration).toBe(DEFAULT_CHOREO.entryDuration);
  });

  it('keeps the moment of impact readable even under maximum compression', () => {
    const paced = buildTimeline(SCRIPT, DEFAULT_CHOREO, { targetDuration: 1 });
    const attack = paced.beats.find((beat) => beat.event.t === 'attack' && !beat.event.crit)!;

    // Anticipation and recovery can go; the connect frame cannot.
    expect(attack.duration).toBeGreaterThanOrEqual(DEFAULT_CHOREO.attackImpact);
  });

  it('actually gets faster at ×2 and ×4', () => {
    const timeline = buildTimeline(missionFight(3).log);

    expect(timelineDuration(timeline, 2)).toBeCloseTo(timeline.duration / 2, 5);
    expect(timelineDuration(timeline, 4)).toBeCloseTo(timeline.duration / 4, 5);
  });

  it('renders a real engine log end to end without losing a fighter', () => {
    const result = missionFight(11);
    const timeline = buildTimeline(result.log);

    // Health at the final frame must match what the engine said happened.
    const end = frameAt(timeline, timeline.duration);
    expect(end.health.a).toBe(result.remainingHealth.a);
    expect(end.health.b).toBe(result.remainingHealth.b);
    expect(end.knockedOut).toBe(result.winner === 'a' ? 'b' : 'a');
  });
});
