/**
 * `disposeItem` — the one way an item leaves the bags (shops spec §5).
 *
 * Selling and scrapping are the same act with different payouts, and they share every rule that
 * matters: a locked item is protected, an equipped item is not in the bags, a Set piece is not
 * merchandise, and anything Rare or better asks before it goes. Writing that once means the
 * Armory, the Facet and (Phase 12) the Emberforge cannot disagree about what is safe to destroy.
 *
 * The service **quotes before it acts**. `quoteDisposal` answers "what would happen, and how
 * hard should I ask first?" without touching the hero, so the UI renders the confirm from the
 * same rule that enforces it. A screen can neither invent a confirmation the engine does not
 * want nor skip one it does.
 *
 * Pure module.
 */

import type { Hero } from '@/engine/save/schema';
import { discardItem } from '@/engine/hero/actions';
import type { Item, MaterialBundle, Rarity } from './types';

export type DisposeIntent = 'sell' | 'scrap';

/**
 * How hard to ask before doing it.
 *
 * `none` for junk — a confirm on every Common turns the dialog into furniture the player clicks
 * through without reading, which is how a Rare gets sold by accident.
 */
export type ConfirmLevel = 'none' | 'confirm' | 'double';

export type DisposeRefusal =
  /** Not in the backpack or satchel — either equipped, or gone already. */
  | { readonly kind: 'not-held' }
  | { readonly kind: 'locked' }
  /** Set pieces are earned; Bram will not put an heirloom on his shelf (§1). */
  | { readonly kind: 'set-piece' }
  /** Scrapping is capped per day (crafting spec §2). */
  | { readonly kind: 'scrap-limit'; readonly used: number; readonly limit: number };

export interface DisposeQuote {
  readonly intent: DisposeIntent;
  readonly item: Item;
  readonly confirm: ConfirmLevel;
  /** Gold the sale pays. Zero when scrapping. */
  readonly gold: number;
  /** Materials the scrap yields. All zero when selling. */
  readonly materials: MaterialBundle;
}

export type DisposeQuoteResult =
  | { readonly ok: true; readonly quote: DisposeQuote }
  | { readonly ok: false; readonly refusal: DisposeRefusal };

const NOTHING: MaterialBundle = { scrap: 0, essence: 0, starmetal: 0 };

/** Rarities worth pausing over. Junk goes without ceremony; good gear does not. */
const ASKS_FIRST: readonly Rarity[] = ['rare', 'epic', 'set'];

export interface DisposeOptions {
  /** Scraps already performed today, for the daily cap (crafting spec §2). */
  readonly scrapsToday?: number;
  /** The cap itself. Passed in rather than assumed — the Emberforge owns this number. */
  readonly scrapLimit?: number;
}

/** Find an item in the bags. Equipment is deliberately not searched (see `not-held`). */
export function heldItem(hero: Hero, uid: string): Item | null {
  return (
    hero.backpack.find((entry) => entry?.uid === uid) ??
    hero.satchel.find((entry) => entry.uid === uid) ??
    null
  );
}

/**
 * What would happen if this item were sold or scrapped, and how hard to ask first.
 *
 * Pure: the hero is read, never written.
 */
export function quoteDisposal(
  hero: Hero,
  uid: string,
  intent: DisposeIntent,
  { scrapsToday = 0, scrapLimit = Number.POSITIVE_INFINITY }: DisposeOptions = {},
): DisposeQuoteResult {
  const item = heldItem(hero, uid);
  if (!item) return { ok: false, refusal: { kind: 'not-held' } };
  if (item.locked) return { ok: false, refusal: { kind: 'locked' } };

  if (intent === 'sell') {
    // The one thing money cannot buy its way out of.
    if (item.rarity === 'set') return { ok: false, refusal: { kind: 'set-piece' } };

    return {
      ok: true,
      quote: {
        intent,
        item,
        confirm: ASKS_FIRST.includes(item.rarity) ? 'confirm' : 'none',
        gold: item.value,
        materials: NOTHING,
      },
    };
  }

  if (scrapsToday >= scrapLimit) {
    return { ok: false, refusal: { kind: 'scrap-limit', used: scrapsToday, limit: scrapLimit } };
  }

  return {
    ok: true,
    quote: {
      intent,
      item,
      // A Set piece is unrecoverable and probably part of a collection in progress: ask twice.
      confirm:
        item.rarity === 'set' ? 'double' : ASKS_FIRST.includes(item.rarity) ? 'confirm' : 'none',
      gold: 0,
      // Yields were rolled at generation and stored on the item, so scrapping the same piece
      // always returns the same materials however long it sat in the bag (crafting spec §1).
      materials: item.scrapYield,
    },
  };
}

export interface DisposeResult {
  readonly hero: Hero;
  readonly quote: DisposeQuote;
}

export type DisposeOutcome =
  | ({ readonly ok: true } & DisposeResult)
  | { readonly ok: false; readonly refusal: DisposeRefusal };

/**
 * Do it: remove the item from the bags and hand back what it was worth.
 *
 * Gold is credited here because it is the hero's own purse. Materials are *reported*, not
 * credited — the materials wallet arrives with the Emberforge in Phase 12, and inventing a
 * half-wallet now would be a persisted shape to migrate away from later.
 */
export function disposeItem(
  hero: Hero,
  uid: string,
  intent: DisposeIntent,
  options: DisposeOptions = {},
): DisposeOutcome {
  const quoted = quoteDisposal(hero, uid, intent, options);
  if (!quoted.ok) return quoted;

  const { quote } = quoted;
  const stripped = discardItem(hero, uid);

  return {
    ok: true,
    quote,
    hero: quote.gold > 0 ? { ...stripped, gold: stripped.gold + quote.gold } : stripped,
  };
}

/** Total gold a batch of items would fetch — the "sell all junk" preview. */
export function sellValueOf(items: readonly Item[]): number {
  return items
    .filter((item) => !item.locked && item.rarity !== 'set')
    .reduce((sum, item) => sum + item.value, 0);
}
