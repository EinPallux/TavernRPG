/**
 * Dungeon keys (dungeons spec §1, balancing §7).
 *
 * A key is the *only* thing standing between a level-gated player and a dungeon, and it drops
 * from ordinary missions at six percent — which means the Rat Cellars open, on average, about
 * seventeen missions after level 10. Long enough to be an event; short enough that nobody is
 * still waiting at level 20.
 *
 * Three rules keep it from being a lottery anyone can lose:
 *
 * - **Only one key is ever in the pool.** The lowest dungeon whose gate the hero has reached and
 *   whose key they do not own. Rolling for all three at once would hand a level-55 hero the Bone
 *   Key they already had a use for two dungeons ago, and would triple the drop rate by accident.
 * - **The roll stops the moment the key is owned.** A key is a one-time unlock and the door stays
 *   open (spec §1), so a second one would be a drop the player cannot use — the worst kind.
 * - **It never displaces the normal drop.** The key rides alongside the item roll on its own
 *   forked stream, so the published item chance is untouched and a key is never a consolation
 *   prize for the sword you did not get.
 *
 * Pure module.
 */

import type { RngStream } from '@/engine/rng';
import { DUNGEONS, type DungeonDef, type DungeonKeyId } from '@/data/dungeons';

/** `[TUNE]` balancing §7 — chance per mission, once the gate is reached and until it is owned. */
export const KEY_DROP_CHANCE = 0.06;

/**
 * The key a hero of this level could currently find, or null.
 *
 * Lowest-first: a hero past all three gates who owns none is offered the Rusty Key, because the
 * dungeons are meant to be walked in order and the Emberdeep would eat them.
 */
export function keyInPlay(heroLevel: number, owned: readonly string[]): DungeonDef | null {
  return (
    DUNGEONS.find(
      (entry) => heroLevel >= entry.gateLevel && !owned.includes(entry.keyId),
    ) ?? null
  );
}

/**
 * Roll for a key at the end of a mission.
 *
 * Takes its own stream so it composes with `rollMissionDrops` without shifting a single existing
 * result — the same reason the RNG forks by name rather than by position.
 */
export function rollKeyDrop(options: {
  readonly heroLevel: number;
  readonly owned: readonly string[];
  readonly rng: RngStream;
}): DungeonKeyId | null {
  const candidate = keyInPlay(options.heroLevel, options.owned);
  if (!candidate) return null;
  return options.rng.bool(KEY_DROP_CHANCE) ? candidate.keyId : null;
}
