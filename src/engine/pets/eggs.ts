/**
 * Tavern Scraps and the one egg (pets spec §1–§2).
 *
 * Two drops that ride on the mission stream, and both take the same shape as the dungeon key
 * added in Phase 11: **their own fork**, so introducing them cannot shift a single existing roll.
 * A mission's gold, XP and gear are identical before and after this file existed, which is what
 * lets the golden mission fixtures stand.
 *
 * The egg is the only 0.5% thing in the game, and it is the one pet whose ownership has to be
 * *stored* rather than derived — for a coin-flip that lands once in two hundred, the luck itself
 * is the fact, and there is nothing else in the save to read it back from.
 *
 * Pure module.
 */

import { PETS, SCRAPS_PER_DROP, SCRAP_DROP_CHANCE, type PetId } from '@/data/pets';
import type { RngStream } from '@/engine/rng';

/** Every pet that hatches from an egg, with the zones it turns up in. */
const EGG_PETS = PETS.flatMap((entry) =>
  entry.source.kind === 'egg' ? [{ id: entry.id, source: entry.source }] : [],
);

/** Scraps a mission turned up, or zero. */
export function rollScraps(rng: RngStream): number {
  return rng.bool(SCRAP_DROP_CHANCE) ? SCRAPS_PER_DROP : 0;
}

/**
 * An egg, or null.
 *
 * Only in the zones the pet is documented to live in, and never one already held — a second
 * Frost Fox egg would be the rarest nothing in the game.
 */
export function rollEgg(options: {
  readonly zoneId: string;
  readonly owned: readonly string[];
  readonly rng: RngStream;
}): PetId | null {
  for (const candidate of EGG_PETS) {
    if (options.owned.includes(candidate.id)) continue;
    if (!candidate.source.zoneIds.includes(options.zoneId)) continue;
    if (options.rng.fork(candidate.id).bool(candidate.source.chance)) return candidate.id;
  }
  return null;
}

export { SCRAPS_PER_DROP, SCRAP_DROP_CHANCE };
