/**
 * City Watch patrol (docs/design/systems/tavern-and-patrol.md §5).
 *
 * The "I'm done for today" button. Patrol exists so a player who is out of Vigor, or simply out
 * of time, can still leave the game earning something — and it is deliberately the *worse* deal
 * (55% of the mission gold rate, a quarter of the XP) so that it never becomes the optimal way
 * to play. It is a floor under a bad day, not a strategy.
 *
 * Two rules do most of the work here:
 *
 * 1. **Accrual is computed, never accumulated.** A shift is a start time, an end time and the
 *    level it was signed at. What it has earned is a function of the clock, which is why closing
 *    the tab for six hours works without a background timer, and why a rewound device clock
 *    cannot mint gold.
 * 2. **Cancelling pays for the time actually served**, rounded down to whole minutes. Quitting
 *    early should cost you the remainder, not the shift.
 *
 * Pure module.
 */

import { goldPatrolPerHour, xpPatrolPerHour } from '@/engine/progression/rewards';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

/** Shift lengths Hildy will sign off on (spec §5). */
export const MIN_SHIFT_HOURS = 1;
export const MAX_SHIFT_HOURS = 12;

/**
 * Vigor above which the tavern warns before sending you on patrol. Enough left for a short
 * mission means you probably did not mean to clock off (spec §5, Q7).
 */
export const OFF_DUTY_WARN_VIGOR = 20;

export interface PatrolShift {
  readonly startedAt: number;
  readonly endsAt: number;
  readonly hours: number;
  /** Level at signing — the shift pays what it was worth when it started. */
  readonly heroLevel: number;
}

export type PatrolRefusal =
  | { readonly kind: 'mission-running' }
  | { readonly kind: 'already-on-duty' }
  | { readonly kind: 'not-on-duty' }
  | { readonly kind: 'bad-shift-length' };

export type StartResult =
  | { readonly ok: true; readonly shift: PatrolShift }
  | { readonly ok: false; readonly refusal: PatrolRefusal };

export interface StartOptions {
  readonly hours: number;
  readonly heroLevel: number;
  readonly now: number;
  readonly missionRunning: boolean;
  readonly alreadyOnDuty: boolean;
}

export function startShift({
  hours,
  heroLevel,
  now,
  missionRunning,
  alreadyOnDuty,
}: StartOptions): StartResult {
  // Exclusivity is a rule, not a UI guard: the hero cannot be in two places at once, and
  // enforcing it here means every caller gets it for free (spec §5).
  if (missionRunning) return { ok: false, refusal: { kind: 'mission-running' } };
  if (alreadyOnDuty) return { ok: false, refusal: { kind: 'already-on-duty' } };

  if (!Number.isFinite(hours) || hours < MIN_SHIFT_HOURS || hours > MAX_SHIFT_HOURS) {
    return { ok: false, refusal: { kind: 'bad-shift-length' } };
  }

  const whole = Math.round(hours);
  return {
    ok: true,
    shift: {
      startedAt: now,
      endsAt: now + whole * MS_PER_HOUR,
      hours: whole,
      heroLevel: Math.max(1, Math.floor(heroLevel)),
    },
  };
}

/** Minutes actually served, floored, and never more than the shift was signed for. */
export function minutesServed(shift: PatrolShift, now: number): number {
  const elapsed = Math.max(0, Math.min(now, shift.endsAt) - shift.startedAt);
  return Math.floor(elapsed / MS_PER_MINUTE);
}

export function isShiftComplete(shift: PatrolShift, now: number): boolean {
  return now >= shift.endsAt;
}

export function msRemaining(shift: PatrolShift, now: number): number {
  return Math.max(0, shift.endsAt - now);
}

/** 0–1 through the shift, for the progress rail. */
export function shiftProgress(shift: PatrolShift, now: number): number {
  const span = shift.endsAt - shift.startedAt;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (now - shift.startedAt) / span));
}

export interface PatrolPayout {
  readonly minutes: number;
  readonly gold: number;
  readonly xp: number;
}

/**
 * What a shift has earned so far.
 *
 * Pro-rated by the minute rather than the hour, so a player who collects at 5h59m is not paid
 * for five. `xpNeededForLevel` is passed in rather than imported so the module stays free of
 * the progression curve's own dependencies.
 */
export function patrolEarnings(
  shift: PatrolShift,
  now: number,
  xpNeededForLevel: number,
): PatrolPayout {
  const minutes = minutesServed(shift, now);
  const hours = minutes / 60;

  return {
    minutes,
    gold: Math.floor(goldPatrolPerHour(shift.heroLevel) * hours),
    xp: Math.floor(xpPatrolPerHour(shift.heroLevel, xpNeededForLevel) * hours),
  };
}

/** The full-shift payout, for the slider's live preview. */
export function previewEarnings(
  hours: number,
  heroLevel: number,
  xpNeededForLevel: number,
): PatrolPayout {
  const whole = Math.max(MIN_SHIFT_HOURS, Math.min(MAX_SHIFT_HOURS, Math.round(hours)));
  return {
    minutes: whole * 60,
    gold: Math.floor(goldPatrolPerHour(heroLevel) * whole),
    xp: Math.floor(xpPatrolPerHour(heroLevel, xpNeededForLevel) * whole),
  };
}
