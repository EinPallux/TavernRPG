/**
 * The Reset Engine (docs/design/systems/daily-loop-and-retention.md §4).
 *
 * One module owns every daily boundary in the game. The rule it exists to enforce:
 * **no feature checks the clock independently.** That is not tidiness — it is the fix for the
 * classic drift bug where the shop rerolled but the tasks didn't, because two features each
 * decided "is it tomorrow yet?" a few milliseconds apart.
 *
 * Two decisions worth stating outright:
 *
 * 1. **Boundaries are walked, not lumped.** A player returning after nine days gets nine ordered
 *    boundaries. Vigor does not stack (you get one day's worth, not nine), but the login calendar
 *    will need to know how many were missed, and a weekly boundary has to be noticed on the day
 *    it happened. Collapsing the absence into a single "it's a new day" event would make those
 *    impossible to build later without another migration.
 *
 * 2. **Day keys, not elapsed hours.** `YYYY-MM-DD` comparison is the only approach that survives
 *    DST, where a "day" can be 23 or 25 hours long, and it makes the whole module testable with a
 *    fixed clock rather than by waiting for midnight.
 *
 * Pure module: no DOM, no storage, no live clock — the caller passes the time in.
 */

import type { DayKey } from '@/engine/clock';
import { ALE_PER_DAY, VIGOR_PER_DAY } from '@/engine/progression/rewards';

/** The slice of a save the reset engine may touch. */
export interface ResettableState {
  /** Last day boundary already processed. Null on a save that has never seen one. */
  readonly lastProcessedDay: DayKey | null;
  readonly vigor: number;
  /** Ales drunk today, against `ALE_PER_DAY`. */
  readonly alesToday: number;
  /** Free Ales received today, capped at one (balancing §7). */
  readonly freeAlesToday: number;
  /** Board rerolls used today; the first each day is free (tavern spec §3). */
  readonly boardRerollsToday: number;
  /** Day key the current mission board was drawn for. */
  readonly boardDay: DayKey | null;
}

export interface ResetOutcome<T extends ResettableState> {
  readonly state: T;
  /** Boundaries crossed, oldest first. Empty when nothing changed. */
  readonly daysProcessed: readonly DayKey[];
  /** True when at least one boundary was crossed — the cue for the "new day" flourish. */
  readonly didReset: boolean;
  /** Vigor the player forfeited by not spending it. Feeds the "while you slept" card. */
  readonly vigorForfeited: number;
}

/**
 * Advance state to `today`, processing every missed boundary in order.
 *
 * Idempotent: calling it twice with the same day is a no-op, which matters because it runs on
 * every load *and* on a timer while the tab is open.
 */
export function processResets<T extends ResettableState>(
  state: T,
  today: DayKey,
  daysBetween: (from: DayKey, to: DayKey) => readonly DayKey[],
): ResetOutcome<T> {
  // A save that has never been processed adopts today without claiming a reset happened —
  // a brand-new hero has not "missed" anything.
  if (state.lastProcessedDay === null) {
    return {
      state: { ...state, lastProcessedDay: today },
      daysProcessed: [],
      didReset: false,
      vigorForfeited: 0,
    };
  }

  if (state.lastProcessedDay === today) {
    return { state, daysProcessed: [], didReset: false, vigorForfeited: 0 };
  }

  const boundaries = daysBetween(state.lastProcessedDay, today);
  if (boundaries.length === 0) {
    // The clock went backwards, or the keys are out of order. Hold the high-water mark rather
    // than rewinding the player's day — the same stance `GameClock` takes (architecture §Time).
    return { state, daysProcessed: [], didReset: false, vigorForfeited: 0 };
  }

  // Vigor left on the table when the *first* boundary passed. Later boundaries forfeit a full
  // day each, but that is not something the player did — only the first one is theirs.
  const vigorForfeited = Math.max(0, state.vigor);

  return {
    state: {
      ...state,
      lastProcessedDay: boundaries.at(-1)!,
      // One day's worth, however many were missed. Vigor never stacks (tavern spec §2).
      vigor: VIGOR_PER_DAY,
      alesToday: 0,
      freeAlesToday: 0,
      boardRerollsToday: 0,
      // The board is stale the moment the day turns; it redraws on next read.
      boardDay: null,
    },
    daysProcessed: boundaries,
    didReset: true,
    vigorForfeited,
  };
}

/** Vigor ceiling right now: the daily allowance plus whatever Ale has been drunk today. */
export function vigorCeiling(alesToday: number): number {
  return VIGOR_PER_DAY + Math.min(ALE_PER_DAY, Math.max(0, alesToday)) * 20;
}

/** Whether another Ale may be drunk today. */
export function canDrinkAle(alesToday: number): boolean {
  return alesToday < ALE_PER_DAY;
}

/**
 * Milliseconds until the next local midnight — the HUD's reset countdown.
 * Takes `now` rather than reading a clock, so it stays pure and testable.
 */
export function msUntilNextReset(now: number): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - now);
}
