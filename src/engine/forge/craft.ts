/**
 * Striking the anvil (crafting spec §3).
 *
 * Two crafts, and they are opposites on purpose. A **standard forge** is a gamble whose value is
 * that *you* pick the slot: the world decides what drops and where, and this is the one place a
 * player can say "a weapon, please" and be answered. A **recipe craft** is the reverse — the slot
 * is random and the outcome is certain, because a set chase needs a floor under it that dungeon
 * RNG cannot provide.
 *
 * Pure module: every roll takes an `RngStream`, so a craft is as reproducible as a mission's loot.
 */

import type { RngStream } from '@/engine/rng';
import { generateItem, generateSetPiece } from '@/engine/items/generate';
import { RARITIES, type ClassId, type Item, type Rarity, type SlotId } from '@/engine/items/types';
import { gearSet, setsForClass, type SetSlot } from '@/data/gearSets';
import { EMBER_PITY, forgeTier, type ForgeTier } from './forgeConfig';

/** Roll a rarity off a tier's published weights. Set never comes out of a plain forge. */
export function rollForgeRarity(tier: ForgeTier, rng: RngStream): Rarity {
  const { odds } = forgeTier(tier);
  return rng.weighted(
    RARITIES.filter((rarity): rarity is Exclude<Rarity, 'set'> => rarity !== 'set').map(
      (rarity) => ({ value: rarity as Rarity, weight: odds[rarity] }),
    ),
  );
}

export interface CraftResult {
  readonly item: Item;
  /** True when the ember meter paid for this one rather than the dice. */
  readonly pitied: boolean;
  /** The meter after this craft — reset to zero by a pity payout. */
  readonly emberMeter: number;
}

export interface CraftOptions {
  readonly tier: ForgeTier;
  readonly slot: SlotId;
  readonly classId: ClassId;
  readonly level: number;
  readonly emberMeter: number;
  readonly rng: RngStream;
}

/**
 * One standard forge.
 *
 * The pity check happens **before** the roll, not after: a meter that only pays out when the roll
 * would have failed is a meter that quietly steals the Epics you were going to get anyway. At
 * five, the next Master forge is an Epic full stop, and the meter resets whether or not the dice
 * would have obliged.
 */
export function craftItem({
  tier,
  slot,
  classId,
  level,
  emberMeter,
  rng,
}: CraftOptions): CraftResult {
  const definition = forgeTier(tier);
  const pitied = definition.feedsPity && emberMeter >= EMBER_PITY;
  const rarity: Rarity = pitied ? 'epic' : rollForgeRarity(tier, rng.fork('rarity'));

  const item = generateItem({
    slot,
    rarity,
    classId,
    level: Math.max(1, Math.floor(level)),
    rng: rng.fork('item'),
  });

  const next = pitied ? 0 : definition.feedsPity ? emberMeter + 1 : emberMeter;
  return { item, pitied, emberMeter: next };
}

export interface RecipeCraftResult {
  readonly item: Item;
  /** True when the set was already complete and this is a level-refreshed copy. */
  readonly refresh: boolean;
}

/**
 * A recipe craft: a guaranteed piece of the named set (crafting spec §3).
 *
 * Always a *missing* piece while one is missing, so the craft can never be a duplicate — and once
 * the set is complete it rolls a level-refreshed copy instead, which is the documented path for a
 * set the player has out-levelled. Both branches return a piece; there is no way to spend two
 * Starmetal and get nothing.
 */
export function craftSetPiece(options: {
  readonly setId: string;
  readonly owned: ReadonlySet<string>;
  readonly level: number;
  readonly rng: RngStream;
}): RecipeCraftResult | null {
  const definition = gearSet(options.setId);
  if (!definition) return null;

  const missing = definition.pieces.filter(
    (piece) => !options.owned.has(`${definition.id}:${piece.slot}`),
  );
  const refresh = missing.length === 0;
  const pool: readonly { readonly slot: SetSlot }[] = refresh ? definition.pieces : missing;
  const picked = options.rng.fork('piece').pick(pool);
  if (!picked) return null;

  const item = generateSetPiece({
    setId: definition.id,
    slot: picked.slot,
    level: options.level,
    rng: options.rng.fork('make'),
  });
  return item ? { item, refresh } : null;
}

/** Which of a class's sets the player holds a recipe for, and can therefore craft. */
export function craftableSets(classId: ClassId, recipes: readonly string[]): readonly string[] {
  return recipes.filter((id) => gearSet(id)?.classId === classId);
}

/**
 * A recipe drops from dungeon floors 5 and 10 (crafting spec §3).
 *
 * Only ever for a set the player's class can wear and does not already hold the recipe for — a
 * recipe for the other class's Oathsworn is a drop that reads as a reward and is not one. Null
 * when both are held, and the caller pays something else instead.
 */
export function drawRecipe(options: {
  readonly classId: ClassId;
  readonly owned: readonly string[];
  readonly rng: RngStream;
}): string | null {
  const candidates = setsForClass(options.classId)
    .map((definition) => definition.id)
    .filter((id) => !options.owned.includes(id));
  return candidates.length === 0 ? null : (options.rng.pick(candidates) ?? null);
}
