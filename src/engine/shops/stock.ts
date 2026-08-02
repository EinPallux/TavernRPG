/**
 * Shop stock (docs/design/systems/shops-and-stables.md §1–§3).
 *
 * Six items on a shelf, drawn from `(worldSeed, dayKey, shopId, rerollCount)`. Same day, same
 * seed, same shelf — which is the whole reason the reroll costs a Golden Die. If the stock
 * redrew on every page load, refreshing would be a free reroll and the sink would be a joke.
 *
 * **The mix is guaranteed, not rolled.** A shop that can offer six pairs of boots is a shop the
 * player learns to skip. Bram always has a weapon and an offhand for your class; Sela always has
 * two rings, two amulets and a trinket. Only the sixth slot is a wildcard, and it is there so
 * the shelf is not identical furniture every day.
 *
 * Pure module.
 */

import { createRng, deriveSeed, type RngStream } from '@/engine/rng';
import { generateItem } from '@/engine/items/generate';
import { rollRarity, type RarityWeights } from '@/engine/items/drops';
import {
  ARMOUR_SLOTS,
  JEWELLERY_SLOTS,
  type ClassId,
  type Item,
  type SlotId,
} from '@/engine/items/types';

/** Items on a shelf (spec §1). */
export const STOCK_SIZE = 6;
/** Every reroll after the shop opens costs this, however many you buy (§1, balancing §9). */
export const REROLL_DICE_COST = 1;

/** The two shops that sell gear. Both share this backend (spec §2). */
export const SHOP_IDS = ['armory', 'facet'] as const;
export type ShopId = (typeof SHOP_IDS)[number];

/**
 * Shop rarity weights (balancing §7, "Shops stock" row).
 *
 * Better than a mission drop on average, and **never Set or Legendary** — both chase tiers are
 * earned, not bought, which is the line that keeps the gear chase meaningful (gear-sets spec §1,
 * legendaries spec §4).
 */
export const SHOP_RARITY_WEIGHTS: RarityWeights = {
  common: 30,
  uncommon: 38,
  rare: 24,
  epic: 8,
  set: 0,
  legendary: 0,
};

/** Buying is a splurge; selling is income (balancing §2). */
export const SHOP_PRICE_MULTIPLIER = 3.2;

/** What Bram or Sela is asking for an item. */
export function shopPrice(item: Item): number {
  return Math.round(item.value * SHOP_PRICE_MULTIPLIER);
}

/**
 * The slots a shop guarantees, in shelf order, plus the pool its wildcard draws from.
 *
 * Written as data rather than branches so "what does this shop sell?" has one answer, and so a
 * third shop is a table entry rather than a new code path.
 */
interface ShopPlan {
  /** Slots always present, in the order they appear on the shelf. */
  readonly guaranteed: readonly SlotId[];
  /** The wildcard's pool. */
  readonly wildcard: readonly SlotId[];
}

const SHOP_PLANS: Readonly<Record<ShopId, ShopPlan>> = {
  // 1 weapon + 1 offhand (class-locked) + 3 armour + 1 wildcard (§1).
  armory: {
    guaranteed: ['weapon', 'offhand'],
    wildcard: [...ARMOUR_SLOTS, 'weapon', 'offhand'],
  },
  // 2 rings + 2 amulets + 1 trinket + 1 wildcard jewellery (§2).
  facet: {
    guaranteed: ['ring', 'ring', 'amulet', 'amulet', 'trinket'],
    wildcard: JEWELLERY_SLOTS,
  },
};

/** Armour slots the Armory fills its middle three shelves from — three *distinct* pieces. */
function pickArmourTrio(rng: RngStream): SlotId[] {
  return rng.shuffle(ARMOUR_SLOTS).slice(0, 3);
}

/** The six slots this shop is stocking today, in shelf order. */
function planSlots(shopId: ShopId, rng: RngStream): SlotId[] {
  const plan = SHOP_PLANS[shopId];
  const slots: SlotId[] = [...plan.guaranteed];
  if (shopId === 'armory') slots.push(...pickArmourTrio(rng));
  slots.push(rng.pick(plan.wildcard));
  return slots;
}

export interface StockOptions {
  readonly shopId: ShopId;
  readonly worldSeed: number;
  readonly dayKey: string;
  readonly heroLevel: number;
  readonly classId: ClassId;
  /** Rerolls bought today. Part of the seed, so each one is a genuinely different shelf. */
  readonly rerollCount?: number;
}

/**
 * Draw a shop's stock for a day. Deterministic for a given
 * `(worldSeed, dayKey, shopId, rerollCount)` — the hero's level and class shape the goods but do
 * not reshuffle them, so levelling up mid-browse does not swap the shelf under the player.
 */
export function drawStock({
  shopId,
  worldSeed,
  dayKey,
  heroLevel,
  classId,
  rerollCount = 0,
}: StockOptions): Item[] {
  const level = Math.max(1, Math.floor(heroLevel));
  const rng = createRng(
    deriveSeed(worldSeed, 'shop', shopId, dayKey, rerollCount),
    `shop:${shopId}:${dayKey}:${rerollCount}`,
  );

  // Slots first, from one stream, so the shelf's shape is fixed before any item is built.
  const slots = planSlots(shopId, rng);

  return slots.map((slot, index) => {
    // Each shelf gets its own fork: an item's roll then depends on its position, not on how many
    // numbers the items before it happened to draw. Keeps a shelf stable if generation ever
    // changes how much randomness one item consumes.
    const itemRng = rng.fork(`slot:${index}`);
    return generateItem({
      level,
      slot,
      rarity: rollRarity(SHOP_RARITY_WEIGHTS, itemRng),
      classId,
      rng: itemRng,
    });
  });
}

/**
 * How much of the shelf is still there.
 *
 * Sold slots are recorded by index rather than removed, so the gap stays where the item was —
 * the spec asks for a wrapped parcel in the hole until restock (§3), and an array that closed
 * up behind each sale would slide the remaining goods around under the player's cursor.
 */
export function remainingStock(stock: readonly Item[], sold: readonly number[]): Item[] {
  const gone = new Set(sold);
  return stock.filter((_, index) => !gone.has(index));
}

/** Total gold value of what is left, for Bram's "browse" bark and the dev harness. */
export function shelfValue(stock: readonly Item[], sold: readonly number[]): number {
  return remainingStock(stock, sold).reduce((sum, item) => sum + shopPrice(item), 0);
}
