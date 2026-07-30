/**
 * The Grand Reading's track, and the shards a duplicate leaves behind (gacha spec §4–§5).
 *
 * Two small pieces of arithmetic that exist for the same reason: **a roll must never be nothing.**
 * The monthly banner has no featured pity, so its floor is the track — fifteen rolls always buy a
 * rung, whatever the cards did. And a duplicate set piece cannot be handed over, so it leaves
 * Starmetal and a shard, and five shards are a recipe.
 *
 * Both are counters, and counters that pay out are exactly the shape of bug CLAUDE.md warns
 * about: a day-keyed roll is reproducible, which is the opposite of idempotent. Neither of these
 * is day-keyed — they are *roll*-keyed, which is monotonic and therefore safe. Advancing is
 * `rolls → rungs` arithmetic rather than "add one if we crossed a boundary", so replaying it can
 * only ever produce the same answer.
 *
 * Pure module.
 */

import {
  MONTHLY_TRACK,
  MONTHLY_TRACK_STEP,
  SHARDS_PER_RECIPE,
  TRACK_STARMETAL,
  type TrackRung,
} from '@/data/banners';

export const TRACK_RUNGS = MONTHLY_TRACK.length;

/** How many rungs `rolls` rolls have earned. Caps at the last rung — the track does not loop. */
export function rungsEarned(rolls: number): number {
  return Math.min(TRACK_RUNGS, Math.floor(Math.max(0, rolls) / MONTHLY_TRACK_STEP));
}

/** Rolls still to go before the next rung, or null once the track is finished. */
export function rollsToNextRung(rolls: number): number | null {
  const earned = rungsEarned(rolls);
  if (earned >= TRACK_RUNGS) return null;
  return MONTHLY_TRACK_STEP - (Math.max(0, rolls) % MONTHLY_TRACK_STEP);
}

/** The rung a given index describes, 1-based to match `TrackRung.at`. */
export function rungAt(index: number): TrackRung | null {
  return MONTHLY_TRACK.find((rung) => rung.at === index) ?? null;
}

/**
 * Which rungs a roll just crossed.
 *
 * Takes both counts rather than a delta so it stays a pure comparison of two positions — the
 * caller can hand it any before/after pair (a single roll, a ten-roll spread, a replay) and get
 * the same answer. Empty for the overwhelming majority of rolls.
 */
export function rungsCrossed(before: number, after: number): readonly TrackRung[] {
  const from = rungsEarned(before);
  const to = rungsEarned(after);
  if (to <= from) return [];
  return MONTHLY_TRACK.filter((rung) => rung.at > from && rung.at <= to);
}

/** Recipes five-shard batches have completed, and what is left over. */
export function shardsToRecipes(shards: number): {
  readonly recipes: number;
  readonly remainder: number;
} {
  const safe = Math.max(0, Math.floor(shards));
  return { recipes: Math.floor(safe / SHARDS_PER_RECIPE), remainder: safe % SHARDS_PER_RECIPE };
}

export { MONTHLY_TRACK, MONTHLY_TRACK_STEP, SHARDS_PER_RECIPE, TRACK_STARMETAL };
