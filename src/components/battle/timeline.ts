/**
 * Timeline — turns a battle log into a schedule.
 *
 * The engine emits *what happened*, in order, with no notion of time. The scene needs *when*.
 * This module is the bridge, and it is deliberately a pure function: the hard part of animation
 * (does every event get a moment? do they add up to a watchable length?) becomes unit-testable,
 * leaving the React layer to do nothing but draw the current frame.
 *
 * No React, no DOM — only arithmetic over events.
 */

import type { BattleEvent, Side } from '@/engine/combat/types';
import {
  DEFAULT_CHOREO,
  PACE_FLOOR,
  SHAKE_THRESHOLD,
  TARGET_FIGHT_DURATION,
  type BattleChoreo,
} from './battleChoreo';

/** A single event, placed on the clock. */
export interface TimedBeat {
  readonly index: number;
  readonly event: BattleEvent;
  /** Milliseconds from the start of the fight, at ×1 speed. */
  readonly at: number;
  /** How long this beat occupies before the next one starts. */
  readonly duration: number;
}

export interface Timeline {
  readonly beats: readonly TimedBeat[];
  /** Total run time at ×1 speed, including the closing pause. */
  readonly duration: number;
}

/** How long a single event's moment lasts. */
export function beatDuration(event: BattleEvent, choreo: BattleChoreo): number {
  switch (event.t) {
    case 'battle_start':
      return choreo.entryDuration;
    case 'round_start':
      return choreo.roundBeat;
    case 'verse_change':
      return choreo.verseBeat;
    case 'attack': {
      const base = choreo.attackWindUp + choreo.attackImpact + (event.crit ? choreo.critHold : 0);
      return event.followUp ? base * choreo.followUpScale : base;
    }
    case 'damage':
      return choreo.attackRecover;
    case 'blocked':
    case 'dodged':
    case 'missed':
      return choreo.defenceBeat;
    case 'boss_trait':
      return choreo.bossTraitBeat;
    case 'swarm':
      return choreo.swarmBeat;
    case 'heal':
    case 'harden':
      return choreo.bossTickBeat;
    case 'ko':
      return choreo.knockoutBeat;
    case 'battle_end':
      return choreo.finishBeat;
  }
}

/**
 * Beats that carry the ceremony rather than the exchange. They keep their authored length no
 * matter how long the fight is — a rushed knockout is a wasted knockout.
 */
const FIXED_BEATS: ReadonlySet<BattleEvent['t']> = new Set([
  'battle_start',
  // The boss explainer is text to *read*. Compressing it with the exchange would leave a
  // twenty-round fight flashing the one line that could have prevented the next twenty.
  'boss_trait',
  'ko',
  'battle_end',
]);

/**
 * The part of a beat that never compresses.
 *
 * Anticipation and recovery are what a long fight can afford to lose; the frame where the blow
 * *connects* is not, because that frame is the event. Protecting it means a twenty-round fight
 * reads as twenty rounds of hits rather than a smear.
 */
function beatFloor(event: BattleEvent, choreo: BattleChoreo, natural: number): number {
  if (FIXED_BEATS.has(event.t)) return natural;
  if (event.t === 'attack') {
    const impact = choreo.attackImpact;
    return event.followUp ? impact * choreo.followUpScale : impact;
  }
  return 0;
}

export interface TimelineOptions {
  /**
   * Compress the round-by-round beats so the whole fight fits this long (ms at ×1).
   * Pass `null` to play every beat at its authored length.
   */
  readonly targetDuration?: number | null;
  /** Floor on that compression, as a share of the authored timings. */
  readonly minScale?: number;
}

/**
 * Place every event on the clock.
 *
 * Fights range from three rounds to twenty, so a fixed pace either rushes the short ones or
 * drags the long ones. Instead the exchange compresses to fit the target while the entrance,
 * the knockout and the closing beat keep their weight — the same trick a fight scene uses when
 * it cuts faster as the fight wears on. The floor stops that compression before a hit stops
 * reading as a hit.
 */
export function buildTimeline(
  log: readonly BattleEvent[],
  choreo: BattleChoreo = DEFAULT_CHOREO,
  { targetDuration = TARGET_FIGHT_DURATION, minScale = PACE_FLOOR }: TimelineOptions = {},
): Timeline {
  const natural = log.map((event) => beatDuration(event, choreo));
  const floors = log.map((event, index) => beatFloor(event, choreo, natural[index]!));

  let scale = 1;
  if (targetDuration !== null && targetDuration > 0) {
    const fixed = floors.reduce((sum, value) => sum + value, 0);
    const elastic = natural.reduce((sum, value, index) => sum + (value - floors[index]!), 0);

    if (elastic > 0 && fixed + elastic > targetDuration) {
      scale = Math.min(1, Math.max(minScale, (targetDuration - fixed) / elastic));
    }
  }

  const beats: TimedBeat[] = [];
  let cursor = 0;

  log.forEach((event, index) => {
    const floor = floors[index]!;
    const duration = floor + (natural[index]! - floor) * scale;
    beats.push({ index, event, at: cursor, duration });
    cursor += duration;
  });

  return { beats, duration: cursor };
}

/**
 * The visual state of the fight at a given moment — everything the scene needs to draw one
 * frame, derived rather than accumulated in React state, so scrubbing and skipping are free.
 */
export interface BattleFrame {
  /** Index of the beat currently playing; -1 before the first. */
  readonly beatIndex: number;
  readonly health: Readonly<Record<Side, number>>;
  /** Trailing "ghost" value that drains toward `health` (combat spec §4 step 3). */
  readonly ghostHealth: Readonly<Record<Side, number>>;
  readonly round: number;
  readonly verse: Readonly<Record<Side, string | null>>;
  /** Which side is mid-swing, and how far through it (0–1). */
  readonly lunging: { side: Side; progress: number; crit: boolean; followUp: boolean } | null;
  /** Momentary reactions to draw on a fighter. */
  readonly reaction: { side: Side; kind: 'blocked' | 'dodged' | 'missed' } | null;
  /** The boss's signature, announced. Non-null only while its beat is playing. */
  readonly trait: { side: Side; label: string; explainer: string } | null;
  /** The swarm's telegraph, the beat before its hit lands. */
  readonly swarm: { side: Side; label: string } | null;
  /** Accumulated hardening per side, 0–1, so the scene can thicken what it draws. */
  readonly hardened: Readonly<Record<Side, number>>;
  readonly floatingDamage: readonly {
    readonly id: string;
    readonly side: Side;
    readonly amount: number;
    readonly crit: boolean;
    /** Healing floats up green and signed; damage floats up red. */
    readonly heal?: boolean;
    /** 0–1 through its lifetime. */
    readonly progress: number;
  }[];
  /** Impact bursts to hand the particle layer this frame. */
  readonly impacts: readonly { readonly id: string; readonly side: Side; readonly crit: boolean }[];
  /** Signed screen-shake offset in px, already oscillating and decaying. 0 when still. */
  readonly shake: number;
  readonly knockedOut: Side | null;
  readonly finished: boolean;
}

const EMPTY_FRAME_HEALTH = { a: 1, b: 1 } as const;

/**
 * Compute the frame at `elapsed` ms. Pure: the same time always yields the same picture, which
 * is what lets playback jump, skip or replay without any state to unwind.
 */
export function frameAt(
  timeline: Timeline,
  elapsed: number,
  choreo: BattleChoreo = DEFAULT_CHOREO,
): BattleFrame {
  const maxHealth: Record<Side, number> = { a: 1, b: 1 };
  const health: Record<Side, number> = { ...EMPTY_FRAME_HEALTH };
  const ghost: Record<Side, number> = { ...EMPTY_FRAME_HEALTH };
  const verse: Record<Side, string | null> = { a: null, b: null };

  let beatIndex = -1;
  let round = 0;
  let lunging: BattleFrame['lunging'] = null;
  let reaction: BattleFrame['reaction'] = null;
  let trait: BattleFrame['trait'] = null;
  let swarm: BattleFrame['swarm'] = null;
  const hardened: Record<Side, number> = { a: 0, b: 0 };
  let knockedOut: Side | null = null;
  let finished = false;
  let shake = 0;
  const floatingDamage: {
    id: string;
    side: Side;
    amount: number;
    crit: boolean;
    heal?: boolean;
    progress: number;
  }[] = [];
  const impacts: { id: string; side: Side; crit: boolean }[] = [];

  /** The attack that produced the damage event currently being processed. */
  let lastAttackWasCrit = false;

  for (const beat of timeline.beats) {
    if (beat.at > elapsed) break;
    beatIndex = beat.index;

    const event = beat.event;
    const sinceStart = elapsed - beat.at;
    const active = sinceStart < beat.duration;

    switch (event.t) {
      case 'battle_start':
        maxHealth.a = event.a.maxHealth;
        maxHealth.b = event.b.maxHealth;
        health.a = event.a.maxHealth;
        health.b = event.b.maxHealth;
        ghost.a = event.a.maxHealth;
        ghost.b = event.b.maxHealth;
        break;

      case 'round_start':
        round = event.n;
        break;

      case 'verse_change':
        verse[event.side] = event.verse;
        break;

      case 'attack':
        lastAttackWasCrit = event.crit;
        if (active) {
          lunging = {
            side: event.source,
            progress: Math.min(1, sinceStart / Math.max(1, beat.duration)),
            crit: event.crit,
            followUp: event.followUp === true,
          };
        }
        break;

      case 'blocked':
      case 'dodged':
        if (active) reaction = { side: event.target, kind: event.t };
        break;

      case 'missed':
        if (active) reaction = { side: event.source, kind: 'missed' };
        break;

      case 'boss_trait':
        if (active) trait = { side: event.side, label: event.label, explainer: event.explainer };
        break;

      case 'swarm':
        if (active) swarm = { side: event.source, label: event.label };
        break;

      case 'harden':
        hardened[event.side] = event.reduction;
        break;

      case 'heal': {
        health[event.target] = event.hpAfter;
        // The ghost trails a bar going *down*; a bar going up simply catches it, or the boss
        // would appear to heal and then un-heal as the trail drained back over it.
        ghost[event.target] = Math.max(ghost[event.target], event.hpAfter);

        const life = choreo.damageNumberLife;
        if (sinceStart < life) {
          floatingDamage.push({
            id: `heal-${beat.index}`,
            side: event.target,
            amount: event.amount,
            crit: false,
            heal: true,
            progress: sinceStart / life,
          });
        }
        break;
      }

      case 'damage': {
        health[event.target] = event.hpAfter;

        // The ghost bar lags behind, draining toward the real value.
        const drain = choreo.healthGhostDrain;
        const ghostProgress = drain <= 0 ? 1 : Math.min(1, sinceStart / drain);
        const previous = ghost[event.target];
        ghost[event.target] = previous + (event.hpAfter - previous) * ghostProgress;

        const life = choreo.damageNumberLife;
        if (sinceStart < life) {
          floatingDamage.push({
            id: `dmg-${beat.index}`,
            side: event.target,
            amount: event.amount,
            crit: lastAttackWasCrit,
            progress: sinceStart / life,
          });
        }

        // Impacts fire once, at the moment of connection.
        if (active) {
          impacts.push({ id: `hit-${beat.index}`, side: event.target, crit: lastAttackWasCrit });

          const share = event.amount / Math.max(1, maxHealth[event.target]);
          if (share >= SHAKE_THRESHOLD && sinceStart < choreo.shakeDuration) {
            const phase = sinceStart / Math.max(1, choreo.shakeDuration);
            const decay = 1 - phase;
            const amplitude = choreo.shakeMagnitude * decay * Math.min(2, 1 + share);
            // Signed and oscillating (three cycles across the beat) so it reads as a shake
            // rather than a shove. The scene applies it straight to a transform.
            shake = amplitude * Math.sin(phase * Math.PI * 6);
          }
        }
        break;
      }

      case 'ko':
        knockedOut = event.target;
        health[event.target] = 0;
        if (!active) ghost[event.target] = 0;
        break;

      case 'battle_end':
        finished = sinceStart >= beat.duration * 0.4;
        break;
    }
  }

  // Ghost bars settle to the real value once their beat has passed.
  for (const side of ['a', 'b'] as Side[]) {
    if (ghost[side] < health[side]) ghost[side] = health[side];
  }

  return {
    beatIndex,
    health,
    ghostHealth: ghost,
    round,
    verse,
    lunging,
    reaction,
    trait,
    swarm,
    hardened,
    floatingDamage,
    impacts,
    shake,
    knockedOut,
    finished,
  };
}

/** Total run time at a given speed — what the "≤8 seconds" target is measured against. */
export function timelineDuration(timeline: Timeline, speed: number): number {
  return timeline.duration / Math.max(0.1, speed);
}
