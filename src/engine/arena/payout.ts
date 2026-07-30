/**
 * The weekly ladder payout (arena spec §3).
 *
 * Sunday midnight, Golden Dice by bracket, plus a Weekly Legends snapshot for the Crier. The
 * acceptance criterion is the whole design brief: **fires exactly once**, across a clock change
 * and across an absence of any length.
 *
 * That rules out the obvious implementations. "Is it Sunday?" fires repeatedly through Sunday.
 * "Has 7 × 24h elapsed?" drifts an hour twice a year and eventually pays on a Saturday. What
 * survives both is a **week key** — the calendar date of the Sunday a week belongs to — compared
 * against the last key paid. A key is either new or it is not; DST cannot make a date ambiguous,
 * and a fortnight away yields two keys, not fourteen.
 *
 * Pure module.
 */

import { weekKeyFor, type DayKey } from '@/engine/clock';

/** Dice by finishing bracket (spec §3). */
export const PAYOUT_BRACKETS: readonly { readonly maxRank: number; readonly dice: number }[] = [
  { maxRank: 1, dice: 5 },
  { maxRank: 10, dice: 3 },
  { maxRank: 100, dice: 2 },
  { maxRank: 500, dice: 1 },
];

/** Heroes archived in each week's Legends snapshot. */
export const LEGENDS_SNAPSHOT_SIZE = 10;

/**
 * Re-exported so the arena's own tests and callers keep one import.
 *
 * The function itself moved to `engine/clock.ts` in Phase 10, when the guild bounty needed the
 * same answer: two implementations of "which week is this?" is the drift bug the Reset Engine
 * exists to prevent, one layer up.
 */
export { weekKeyFor };

export function diceForRank(rank: number): number {
  if (rank <= 0) return 0;
  return PAYOUT_BRACKETS.find((bracket) => rank <= bracket.maxRank)?.dice ?? 0;
}

export interface WeeklyPayout {
  readonly weekKey: string;
  readonly rank: number;
  readonly dice: number;
  /** Bot ids holding the top ten at the moment of payout, for the Legends archive. */
  readonly legends: readonly number[];
}

export interface PayoutOptions {
  /** Day boundaries crossed since the last check, oldest first. */
  readonly daysProcessed: readonly DayKey[];
  /** Week key already paid, or null for a save that has never seen one. */
  readonly lastPaidWeek: string | null;
  readonly playerRank: number;
  readonly ladder: readonly number[];
}

/**
 * Which weeks became payable, in order.
 *
 * Takes the day boundaries the Reset Engine already walked rather than reading a clock — the
 * whole point of that module is that one owner decides it is tomorrow. A month away yields four
 * payouts because four Sundays passed, not because a timer fired four times.
 */
export function weeklyPayouts({
  daysProcessed,
  lastPaidWeek,
  playerRank,
  ladder,
}: PayoutOptions): WeeklyPayout[] {
  if (daysProcessed.length === 0) return [];

  const payouts: WeeklyPayout[] = [];
  let paid = lastPaidWeek;

  for (const day of daysProcessed) {
    const week = weekKeyFor(day);
    // A week is only payable once it has actually *ended* — the key names the Sunday, so the
    // week closes on the day whose key is itself.
    if (day !== week) continue;
    if (paid === week) continue;

    payouts.push({
      weekKey: week,
      rank: playerRank,
      dice: diceForRank(playerRank),
      legends: ladder.slice(0, LEGENDS_SNAPSHOT_SIZE),
    });
    paid = week;
  }

  return payouts;
}

/** Total dice owed across a run of payouts. */
export function totalDice(payouts: readonly WeeklyPayout[]): number {
  return payouts.reduce((sum, payout) => sum + payout.dice, 0);
}
