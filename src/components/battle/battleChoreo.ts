/**
 * Battle choreography — every timing in the battle scene, in one file (combat spec §4).
 *
 * The engine decides what happens; this decides how long each beat takes to show. Keeping the
 * two apart means the fight can be re-choreographed without touching a single rule, and that a
 * balance change can never accidentally alter pacing.
 *
 * All durations are milliseconds at ×1 speed, before the reduced-motion pass.
 */

export interface BattleChoreo {
  /** Opening: backdrop settle, fighters slide in, plates and health bars unfurl. */
  readonly entryDuration: number;
  /** Pause on the round number before the first swing of a round. */
  readonly roundBeat: number;
  /** Lunge out, connect, return. */
  readonly attackWindUp: number;
  readonly attackImpact: number;
  readonly attackRecover: number;
  /** Extra hold on a critical hit — the little slow-motion that sells it. */
  readonly critHold: number;
  /** A follow-up strike lands quicker than the swing that set it up. */
  readonly followUpScale: number;
  /** Block, dodge and miss each get their own moment, shorter than a hit. */
  readonly defenceBeat: number;
  /** Verse banner sweeping across the stage. */
  readonly verseBeat: number;
  /** How long a floating damage number lives. */
  readonly damageNumberLife: number;
  /** Health bar chip is instant; the ghost trail behind it drains over this. */
  readonly healthGhostDrain: number;
  /** Knockout: slow-motion, desaturation, the fall. */
  readonly knockoutBeat: number;
  /** Beat after the last blow before the result screen slides in. */
  readonly finishBeat: number;
  /** Screen shake magnitude, px, for a hit worth ≥15% of max health. */
  readonly shakeMagnitude: number;
  readonly shakeDuration: number;
}

export const DEFAULT_CHOREO: BattleChoreo = {
  entryDuration: 1_000,
  roundBeat: 140,
  attackWindUp: 100,
  attackImpact: 70,
  attackRecover: 110,
  critHold: 140,
  followUpScale: 0.65,
  defenceBeat: 200,
  verseBeat: 420,
  damageNumberLife: 900,
  healthGhostDrain: 300,
  knockoutBeat: 620,
  finishBeat: 420,
  shakeMagnitude: 4,
  shakeDuration: 140,
};

/**
 * Target run time for a single fight at ×1 (ROADMAP Phase 4). Fights vary from three rounds to
 * twenty, so the authored timings above are the *comfortable* pace and long fights compress
 * toward this — see `PACE_FLOOR`.
 */
export const TARGET_FIGHT_DURATION = 8_000;

/**
 * How far the *compressible* part of a beat — anticipation, recovery, the pause on a round
 * number — may be squeezed. The frame where a blow connects is never compressed at all, so
 * even at this floor a hit still registers as a hit. A fight long enough to need more than
 * this is allowed to run over target rather than become an unreadable blur.
 */
export const PACE_FLOOR = 0.35;

/**
 * Reduced motion keeps every beat — the player must still be able to follow what happened —
 * but strips anticipation, shake and slow-motion, and shortens everything (style guide §7).
 */
export const REDUCED_CHOREO: BattleChoreo = {
  ...DEFAULT_CHOREO,
  entryDuration: 300,
  roundBeat: 90,
  attackWindUp: 0,
  attackImpact: 70,
  attackRecover: 40,
  critHold: 0,
  defenceBeat: 130,
  verseBeat: 220,
  damageNumberLife: 500,
  healthGhostDrain: 0,
  knockoutBeat: 250,
  finishBeat: 250,
  shakeMagnitude: 0,
  shakeDuration: 0,
};

export const SPEED_OPTIONS = [1, 2, 4] as const;
export type PlaybackSpeed = (typeof SPEED_OPTIONS)[number];

/** A hit worth this much of the target's health earns a screen shake. */
export const SHAKE_THRESHOLD = 0.15;
/** Below this, a health bar pulses in warning. */
export const LOW_HEALTH_THRESHOLD = 0.2;

export function choreoFor(reducedMotion: boolean): BattleChoreo {
  return reducedMotion ? REDUCED_CHOREO : DEFAULT_CHOREO;
}
