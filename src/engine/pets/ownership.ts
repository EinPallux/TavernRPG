/**
 * Who lives in the Menagerie (pets spec §1).
 *
 * **Ownership is derived, not stored.** There is no "pets owned" list anywhere in the save;
 * `ownedPets()` answers the question from the facts that *earned* each pet — floors cleared,
 * missions run, best ladder rank, what Vesna handed over, what hatched. Every one of those was
 * already in the save before this phase existed.
 *
 * Three things that buys, none of which a second list would:
 *
 * 1. **Retroactive.** A player who cleared Barrowdeep's fifth floor back in Phase 11 owns the
 *    Gloom Cat the moment this room opens, with no migration and no reconciliation pass.
 * 2. **Nothing to drift.** A stored list can disagree with the history that produced it. This
 *    cannot, because there is only one copy of the fact.
 * 3. **No idempotency bug to have.** The counters are totals, not increments on a boundary — the
 *    failure mode CLAUDE.md warns about five times over simply has nowhere to live here.
 *
 * The cost is that granting a pet means *making its source true*, which for the two luck-based
 * ones means storing the luck: an egg found is a fact, not a derivation. Those live in
 * `pets.eggs` and `gacha.pets`, beside the systems that produce them.
 *
 * Pure module.
 */

import { PETS, type PetDef, type PetId, type PetSource } from '@/data/pets';
import type { SaveFile } from '@/engine/save/schema';

/** Whether the save already contains the fact that earns this pet. */
export function isEarned(source: PetSource, save: SaveFile): boolean {
  switch (source.kind) {
    case 'dungeon-floor':
      return (save.dungeons.progress[source.dungeonId]?.floorsCleared ?? 0) >= source.floor;

    case 'missions':
      return save.activity.missionsCompleted >= source.count;

    case 'zone-missions':
      return (save.activity.zoneMissions[source.zoneId] ?? 0) >= source.count;

    // Rank 0 means "not on the ladder yet", not "rank zero" — the player is seeded at world-raise
    // and `bestRank` stays 0 until they hold one. Guarding on it is what stops a brand-new hero
    // being handed the Sooty Raven for a rank they have never had.
    case 'arena-rank':
      return save.arena.bestRank > 0 && save.arena.bestRank <= source.rank;

    case 'gacha':
      return false;

    case 'egg':
      return false;

    // The login calendar and the Notice Board's task streak are Phase 15's. Until they exist the
    // honest answer is no — and the stall says exactly where the pet will come from, which is a
    // better empty slot than an unexplained one.
    case 'daily-loop':
      return false;
  }
}

/**
 * Every pet the hero has, in roster order.
 *
 * The two *granted* kinds — Vesna's and the egg — are read from their own lists rather than
 * through `isEarned`, because for those the grant is the fact. Everything else is a derivation.
 */
export function ownedPets(save: SaveFile): readonly PetDef[] {
  const granted = new Set<string>([...save.gacha.pets, ...save.pets.eggs]);
  return PETS.filter((entry) => granted.has(entry.id) || isEarned(entry.source, save));
}

export function ownsPet(save: SaveFile, id: PetId): boolean {
  return ownedPets(save).some((entry) => entry.id === id);
}

/** The collection counter, `X/12`. */
export function collectionProgress(save: SaveFile): { owned: number; of: number } {
  return { owned: ownedPets(save).length, of: PETS.length };
}

/**
 * Pets that became available since a remembered count — the "something new is in the Menagerie"
 * cue for the nav rail.
 *
 * Takes a count rather than a list for the same reason the track does: a number cannot disagree
 * with itself, and the alternative is storing a second copy of ownership to diff against.
 */
export function newArrivals(save: SaveFile): number {
  return Math.max(0, ownedPets(save).length - save.pets.seenCount);
}
