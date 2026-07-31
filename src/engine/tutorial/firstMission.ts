/**
 * The twenty-second contract (tutorial spec §2, beat 2).
 *
 * Beat 2 has to *end* before beat 3 can begin, and beat 2 ends when the first contract comes
 * home. At the real five-minute floor that is a five-minute wall on the second thing a player
 * has ever done, staring at a progress bar with nothing else unlocked — which is where they
 * close the tab. So the first contract, and only the first, finishes in twenty seconds.
 *
 * Two properties make it a gift rather than a lie:
 *
 * - **The card still prints its real length.** `mission.duration` is untouched; only `endsAt` is
 *   pulled in, so the Vigor cost, the payout and the "10M" on the offer are all the honest
 *   numbers. The player's *next* contract really does take ten minutes, and nothing they read
 *   the first time turns out to have been wrong.
 * - **It says so.** `isQuickened` lets the progress card admit that Marla has put a word in,
 *   because an unexplained short timer is a bug the player will remember when the second one
 *   takes the full ten.
 *
 * Derived, not stored: "have they signed anything before?" is already a number in the save, so
 * there is no first-mission flag to migrate, reconcile or get wrong.
 *
 * Pure module.
 */

import { FIRST_MISSION_MS } from '@/data/tutorial';
import { tallyOf } from '@/data/progress';
import type { SaveFile } from '@/engine/save/schema';

const MS_PER_MINUTE = 60_000;

/** Whether the contract about to be signed is the one that gets the short road. */
export function shortensNextMission(save: SaveFile): boolean {
  if (save.tutorial.optedOut) return false;
  return tallyOf(save.tasks.lifetime, 'missionsAccepted') === 0;
}

/**
 * Whether a running contract is on the short road.
 *
 * Read off the two timestamps rather than a stored flag. The exact-equality check is what keeps
 * it honest against mounts, which also shorten the timer: the fastest mount takes 25% off, and
 * no whole-minute duration times any mount multiplier lands on exactly twenty seconds.
 */
export function isQuickened(mission: {
  readonly startedAt: number;
  readonly endsAt: number;
  readonly duration: number;
}): boolean {
  return (
    mission.endsAt - mission.startedAt === FIRST_MISSION_MS &&
    mission.duration * MS_PER_MINUTE > FIRST_MISSION_MS
  );
}

/** The finish line for a shortened contract. */
export function quickenedEndsAt(now: number): number {
  return now + FIRST_MISSION_MS;
}
