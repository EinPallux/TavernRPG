'use client';

/**
 * Shops, as store transitions.
 *
 * Save in, save out — the same shape as `missionActions` and `patrolActions`. Nothing here reads
 * a clock or a store; the day key and the timestamp are passed in, which is what lets "does a
 * shelf survive midnight?" be a test with plain objects.
 *
 * The shelf is **drawn lazily**, on the first visit of the day rather than at midnight, so a
 * player who never opens the Armory never has stale stock to explain. The Reset Engine clears
 * the shelves at the boundary; this module notices they are gone and draws new ones.
 */

import { drawStock, REROLL_DICE_COST, type ShopId } from '@/engine/shops/stock';
import {
  disposeItem,
  quoteDisposal,
  type DisposeQuote,
  type DisposeRefusal,
} from '@/engine/items/dispose';
import { addItem as addItemToHero } from '@/engine/hero/actions';
import type { Item } from '@/engine/items/types';
import { credit } from './progressActions';
import type { SaveFile, StoredShopStock } from '@/engine/save/schema';

export type ShopRefusal =
  | { readonly kind: 'no-hero' }
  | { readonly kind: 'no-stock' }
  /** The slot is empty — someone already bought it, or the index is nonsense. */
  | { readonly kind: 'sold-out' }
  | { readonly kind: 'insufficient-gold'; readonly needed: number; readonly available: number }
  | { readonly kind: 'insufficient-dice'; readonly needed: number; readonly available: number }
  /** Backpack and satchel both full. Refusing beats silently eating the purchase. */
  | { readonly kind: 'no-room' }
  | { readonly kind: 'cannot-dispose'; readonly reason: DisposeRefusal };

export type ShopTransition =
  | { readonly ok: true; readonly save: SaveFile }
  | { readonly ok: false; readonly refusal: ShopRefusal };

/** Typed narrowly so it satisfies every transition union in this module, not just one. */
const refuse = (refusal: ShopRefusal): { readonly ok: false; readonly refusal: ShopRefusal } => ({
  ok: false,
  refusal,
});

function withShop(save: SaveFile, shopId: ShopId, stock: StoredShopStock): SaveFile {
  return {
    ...save,
    activity: { ...save.activity, shops: { ...save.activity.shops, [shopId]: stock } },
  };
}

/** Today's shelf, drawing it if the shop has not been visited since the last restock. */
export function refreshShop(save: SaveFile, shopId: ShopId, today: string): SaveFile {
  const { hero, activity } = save;
  if (!hero) return save;

  const existing = activity.shops[shopId];
  if (existing && existing.day === today) return save;

  return withShop(save, shopId, {
    day: today,
    items: drawStock({
      shopId,
      worldSeed: save.worldSeed,
      dayKey: today,
      heroLevel: hero.level,
      classId: hero.classId,
    }),
    sold: [],
    rerollsToday: 0,
  });
}

/** What is on the shelf right now, or null if the shop has not been opened today. */
export function shopStock(save: SaveFile, shopId: ShopId): StoredShopStock | null {
  return save.activity.shops[shopId] ?? null;
}

export interface PurchaseResult {
  readonly save: SaveFile;
  readonly item: Item;
  readonly paid: number;
  /** Where it landed, so the UI can flash the right cell. */
  readonly placement: 'backpack' | 'satchel';
}

export type PurchaseTransition =
  ({ readonly ok: true } & PurchaseResult) | { readonly ok: false; readonly refusal: ShopRefusal };

/**
 * Buy the item in a slot.
 *
 * Two guards worth naming. The **sold set is checked before the purse**, so a double-clicked buy
 * button cannot charge twice for one item. And a **full bag refuses rather than overflows** —
 * `addItem` will discard the oldest satchel item to make room for a *drop*, which is right for
 * loot the player did not ask for and wrong for something they just paid gold for.
 */
export function buyItem(
  save: SaveFile,
  shopId: ShopId,
  index: number,
  price: number,
): PurchaseTransition {
  const { hero } = save;
  if (!hero) return refuse({ kind: 'no-hero' });

  const stock = shopStock(save, shopId);
  if (!stock) return refuse({ kind: 'no-stock' });

  const item = stock.items[index];
  if (!item || stock.sold.includes(index)) return refuse({ kind: 'sold-out' });

  if (hero.gold < price) {
    return refuse({ kind: 'insufficient-gold', needed: price, available: hero.gold });
  }

  const added = addItemToHero(hero, item);
  if (added.placement === 'discarded' || added.discarded) return refuse({ kind: 'no-room' });

  return {
    ok: true,
    save: withShop({ ...save, hero: { ...added.hero, gold: added.hero.gold - price } }, shopId, {
      ...stock,
      sold: [...stock.sold, index],
    }),
    item,
    paid: price,
    placement: added.placement,
  };
}

export interface SaleResult {
  readonly save: SaveFile;
  readonly quote: DisposeQuote;
}

export type SaleTransition =
  ({ readonly ok: true } & SaleResult) | { readonly ok: false; readonly refusal: ShopRefusal };

/**
 * Sell something out of the bags.
 *
 * Both shops route through the same `disposeItem` service, so Bram and Sela cannot disagree
 * about whether a Set piece is merchandise or what a Rare is worth.
 */
export function sellItem(save: SaveFile, uid: string): SaleTransition {
  const { hero } = save;
  if (!hero) return refuse({ kind: 'no-hero' });

  const result = disposeItem(hero, uid, 'sell');
  if (!result.ok) return refuse({ kind: 'cannot-dispose', reason: result.refusal });

  return {
    ok: true,
    save: credit({ ...save, hero: result.hero }, 'itemsSold', 1),
    quote: result.quote,
  };
}

/** What selling would pay and how hard to ask first — read-only, for the confirm dialog. */
export function quoteSale(save: SaveFile, uid: string) {
  if (!save.hero) return null;
  return quoteDisposal(save.hero, uid, 'sell');
}

/**
 * Buy a fresh shelf for a Golden Die.
 *
 * Unlike the mission board there is no free one: the board is the day's *work* and must always
 * be there, while a shop shelf is a convenience. Each reroll is a new seed, so the shelf is
 * genuinely different rather than reshuffled.
 */
export function rerollShop(save: SaveFile, shopId: ShopId, today: string): ShopTransition {
  const { hero } = save;
  if (!hero) return refuse({ kind: 'no-hero' });

  if (hero.dice < REROLL_DICE_COST) {
    return refuse({
      kind: 'insufficient-dice',
      needed: REROLL_DICE_COST,
      available: hero.dice,
    });
  }

  const stock = shopStock(save, shopId);
  const rerollsToday = (stock?.rerollsToday ?? 0) + 1;

  return {
    ok: true,
    save: withShop({ ...save, hero: { ...hero, dice: hero.dice - REROLL_DICE_COST } }, shopId, {
      day: today,
      items: drawStock({
        shopId,
        worldSeed: save.worldSeed,
        dayKey: today,
        heroLevel: hero.level,
        classId: hero.classId,
        rerollCount: rerollsToday,
      }),
      // A reroll is a new shelf, so nothing on it has been sold yet.
      sold: [],
      rerollsToday,
    }),
  };
}
