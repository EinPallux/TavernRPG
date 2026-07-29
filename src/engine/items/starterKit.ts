/**
 * The kit a hero walks out of creation with.
 *
 * Added in Phase 5, when missions first made it matter. Until then a new hero owned nothing at
 * all — which was invisible while there was nothing to fight, and fatal the moment there was:
 * an unarmed hero swings for 1–2 damage and loses to the gentlest thing in the woods. Marla
 * does not send people into the Whispering Woods in their shirtsleeves.
 *
 * Deliberately *common* quality and deliberately partial. It is a floor, not a head start:
 * the first real upgrade should still feel like an upgrade, and the empty slots are what make
 * the paperdoll read as something to fill.
 *
 * Pure module.
 */

import type { RngStream } from '@/engine/rng';
import { generateItem } from './generate';
import type { ClassId, Item, SlotId } from './types';

/**
 * Weapon first, because it is the difference between fighting and flailing; chest second,
 * because a little armour turns the early fights from coin flips into wins.
 */
export const STARTER_SLOTS: readonly SlotId[] = ['weapon', 'chest'];

/** Build the starting kit for a class. Seeded, so a given world always starts the same way. */
export function starterKit(classId: ClassId, rng: RngStream): readonly Item[] {
  return STARTER_SLOTS.map((slot) =>
    generateItem({ slot, rarity: 'common', classId, level: 1, rng: rng.fork(slot) }),
  );
}
