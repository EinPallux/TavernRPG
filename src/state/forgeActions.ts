/**
 * The Emberforge, as save-to-save transitions (crafting spec §2–§3).
 *
 * Same contract as every other actions module: a `SaveFile` in, a new one out, no clock and no
 * store. Three things happen at Torvald's bench — gear goes into the crucible, materials come out
 * as new gear, and a recipe turns materials into a set piece — and each of them is one function
 * that does the whole thing in one write.
 *
 * The daily scrap cap lives in the save and resets through the Reset Engine, like every other
 * daily boundary in the game. Nothing here reads a date.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { addItem as addItemToHero } from '@/engine/hero/actions';
import { disposeItem, quoteDisposal, type DisposeQuote } from '@/engine/items/dispose';
import { ownedSetPieces } from '@/engine/items/sets';
import type { Item, MaterialBundle, SlotId } from '@/engine/items/types';
import { craftItem, craftSetPiece } from '@/engine/forge/craft';
import {
  RECIPE_COST,
  SCRAPS_PER_DAY,
  canAfford,
  forgeTier,
  spend,
  type ForgeTier,
} from '@/engine/forge/forgeConfig';
import { gearSet } from '@/data/gearSets';
import { credit } from './progressActions';
import type { Hero, SaveFile } from '@/engine/save/schema';
import { reforge } from '@/engine/items/legendary';
import { REFORGE_COST } from '@/engine/forge/forgeConfig';

export type ForgeRefusal =
  | { readonly kind: 'no-hero' }
  | { readonly kind: 'no-such-item' }
  | { readonly kind: 'locked' }
  | { readonly kind: 'scrap-limit'; readonly used: number; readonly limit: number }
  | {
      readonly kind: 'insufficient-materials';
      readonly needed: MaterialBundle;
      readonly held: MaterialBundle;
    }
  | { readonly kind: 'no-recipe' }
  | { readonly kind: 'not-legendary' }
  | { readonly kind: 'bags-full' };

const refuse = (refusal: ForgeRefusal) => ({ ok: false as const, refusal });

/** What the crucible would pay for a piece, before anyone commits to it. */
export function quoteScrap(save: SaveFile, uid: string): DisposeQuote | null {
  if (!save.hero) return null;
  const quoted = quoteDisposal(save.hero, uid, 'scrap', {
    scrapsToday: save.forge.scrapsUsedToday,
    scrapLimit: SCRAPS_PER_DAY,
  });
  return quoted.ok ? quoted.quote : null;
}

export interface ScrapTransition {
  readonly ok: true;
  readonly save: SaveFile;
  readonly gained: MaterialBundle;
  readonly item: Item;
}

export type ScrapResult = ScrapTransition | { readonly ok: false; readonly refusal: ForgeRefusal };

/**
 * Into the crucible.
 *
 * The daily cap is checked by `quoteDisposal` rather than here, so the quote the player reads and
 * the refusal they get are decided by the same code — a screen that offers a scrap the action
 * then declines is worse than one that never offered it.
 */
export function scrap(save: SaveFile, uid: string): ScrapResult {
  const { hero } = save;
  if (!hero) return refuse({ kind: 'no-hero' });

  const result = disposeItem(hero, uid, 'scrap', {
    scrapsToday: save.forge.scrapsUsedToday,
    scrapLimit: SCRAPS_PER_DAY,
  });
  if (!result.ok) {
    const { refusal } = result;
    return refuse(
      refusal.kind === 'scrap-limit'
        ? { kind: 'scrap-limit', used: refusal.used, limit: refusal.limit }
        : refusal.kind === 'locked'
          ? { kind: 'locked' }
          : { kind: 'no-such-item' },
    );
  }

  return {
    ok: true,
    /*
     * A melt counts. It had not until Phase 15: `itemsScrapped` was one of six bounty metrics and
     * the only side crediting it was the hall's simulation, so a week that drew "members melt 90
     * pieces" gave the player nothing they could do about it.
     */
    save: credit(
      {
        ...save,
        hero: result.hero,
        forge: { ...save.forge, scrapsUsedToday: save.forge.scrapsUsedToday + 1 },
      },
      'itemsScrapped',
      1,
    ),
    gained: result.quote.materials,
    item: result.quote.item,
  };
}

export interface CraftTransition {
  readonly ok: true;
  readonly save: SaveFile;
  readonly item: Item;
  /** True when the ember meter paid rather than the dice — the room says so out loud. */
  readonly pitied: boolean;
  /** A set piece from a recipe, and whether it was a refresh of a completed set. */
  readonly refresh?: boolean;
}

export type CraftResultState =
  CraftTransition | { readonly ok: false; readonly refusal: ForgeRefusal };

/**
 * Strike the anvil.
 *
 * Deterministic in `(worldSeed, tier, slot, craftCount)` — the counter is what makes each strike
 * a different one, exactly as the dungeon attempt counter does. Re-running the same craft
 * produces the same item, which is what lets the reveal animation and the grant agree.
 */
export function craft(save: SaveFile, tier: ForgeTier, slot: SlotId): CraftResultState {
  const { hero } = save;
  if (!hero) return refuse({ kind: 'no-hero' });

  const { cost } = forgeTier(tier);
  if (!canAfford(hero.materials, cost)) {
    return refuse({ kind: 'insufficient-materials', needed: cost, held: hero.materials });
  }

  const result = craftItem({
    tier,
    slot,
    classId: hero.classId,
    level: hero.level,
    emberMeter: save.forge.emberMeter,
    rng: createRng(
      deriveSeed(save.worldSeed, 'forge', tier, slot, save.forge.crafted),
      `forge/${tier}/${save.forge.crafted}`,
    ),
  });

  return {
    ok: true,
    save: credit(
      {
        ...save,
        hero: addItemToHero({ ...hero, materials: spend(hero.materials, cost) }, result.item).hero,
        forge: {
          ...save.forge,
          emberMeter: result.emberMeter,
          crafted: save.forge.crafted + 1,
        },
      },
      'itemsForged',
      1,
    ),
    item: result.item,
    pitied: result.pitied,
  };
}

/** A recipe craft: two Starmetal and twenty Essence for a piece of that set, guaranteed. */
export function craftFromRecipe(save: SaveFile, setId: string): CraftResultState {
  const { hero } = save;
  if (!hero) return refuse({ kind: 'no-hero' });

  const definition = gearSet(setId);
  if (!definition || definition.classId !== hero.classId || !save.forge.recipes.includes(setId)) {
    return refuse({ kind: 'no-recipe' });
  }
  if (!canAfford(hero.materials, RECIPE_COST)) {
    return refuse({ kind: 'insufficient-materials', needed: RECIPE_COST, held: hero.materials });
  }

  const made = craftSetPiece({
    setId,
    owned: ownedSetPieces(hero),
    level: hero.level,
    rng: createRng(
      deriveSeed(save.worldSeed, 'recipe', setId, save.forge.crafted),
      `recipe/${setId}/${save.forge.crafted}`,
    ),
  });
  if (!made) return refuse({ kind: 'no-recipe' });

  return {
    ok: true,
    save: credit(
      {
        ...save,
        hero: addItemToHero({ ...hero, materials: spend(hero.materials, RECIPE_COST) }, made.item)
          .hero,
        forge: { ...save.forge, crafted: save.forge.crafted + 1 },
      },
      'itemsForged',
      1,
    ),
    item: made.item,
    pitied: false,
    refresh: made.refresh,
  };
}

/** Hand over a recipe found in a dungeon. Idempotent — a second copy is not a reward. */
export function grantRecipe(save: SaveFile, setId: string): SaveFile {
  if (save.forge.recipes.includes(setId)) return save;
  return { ...save, forge: { ...save.forge, recipes: [...save.forge.recipes, setId] } };
}

/** Midnight: the crucible cools and the ten scraps come back (crafting spec §2). */
export function refreshForgeDay(save: SaveFile): SaveFile {
  if (save.forge.scrapsUsedToday === 0) return save;
  return { ...save, forge: { ...save.forge, scrapsUsedToday: 0 } };
}

export { SCRAPS_PER_DAY };

/* ── The reforge bench (legendaries spec §6) ─────────────────────────────────────── */

/** Every legendary the hero holds anywhere — the bench's shelf. */
export function reforgeable(save: SaveFile): readonly Item[] {
  const { hero } = save;
  if (!hero) return [];
  return [...Object.values(hero.equipment), ...hero.backpack, ...hero.satchel].filter(
    (item): item is Item => !!item && item.rarity === 'legendary' && !!item.legendary,
  );
}

export interface ReforgeTransition {
  readonly ok: true;
  readonly save: SaveFile;
  /** What it was, so the room can show the trade rather than only the result. */
  readonly before: Item;
  readonly after: Item;
}

export type ReforgeResult =
  ReforgeTransition | { readonly ok: false; readonly refusal: ForgeRefusal };

/**
 * Re-roll a legendary's two affixes.
 *
 * It **replaces**, and the card shows what you have before the press — a re-roll you cannot lose
 * is not a decision (spec §6). The uid does not change, so an item being worn stays worn and one
 * in the bags stays where it was; only the payload moves.
 *
 * Deterministic in `(worldSeed, uid, reforges)`. The counter is the item's own, which means two
 * legendaries reforged the same number of times still roll differently, and replaying a reforge
 * cannot produce a second outcome — the same shape `craft` gets from `forge.crafted`.
 */
export function reforgeItem(save: SaveFile, uid: string): ReforgeResult {
  const { hero } = save;
  if (!hero) return refuse({ kind: 'no-hero' });

  const before = reforgeable(save).find((item) => item.uid === uid);
  if (!before) {
    // Told apart on purpose: "there is no such item" and "that is not a legendary" are different
    // things to say to a player, and a bench that says the wrong one reads as broken.
    const exists = [...Object.values(hero.equipment), ...hero.backpack, ...hero.satchel].some(
      (item) => item?.uid === uid,
    );
    return refuse(exists ? { kind: 'not-legendary' } : { kind: 'no-such-item' });
  }

  if (!canAfford(hero.materials, REFORGE_COST)) {
    return refuse({ kind: 'insufficient-materials', needed: REFORGE_COST, held: hero.materials });
  }

  const after = reforge(
    before,
    createRng(
      deriveSeed(save.worldSeed, 'reforge', uid, before.legendary!.reforges),
      `reforge/${uid}/${before.legendary!.reforges}`,
    ),
  );
  if (!after) return refuse({ kind: 'not-legendary' });

  return {
    ok: true,
    save: {
      ...save,
      hero: {
        ...replaceItem(hero, after),
        materials: spend(hero.materials, REFORGE_COST),
      },
    },
    before,
    after,
  };
}

/**
 * Put an item back wherever it already was, by uid.
 *
 * A legendary can be worn, bagged or in the satchel, and the bench must not care which — an
 * "unequip, re-add" round trip would drop a worn piece into the bags, and a full backpack would
 * then lose it. Three places, one pass, no movement.
 */
function replaceItem(hero: Hero, item: Item): Hero {
  const equipment = { ...hero.equipment };
  for (const [slot, worn] of Object.entries(equipment)) {
    if (worn?.uid === item.uid) equipment[slot as SlotId] = item;
  }
  return {
    ...hero,
    equipment,
    backpack: hero.backpack.map((entry) => (entry?.uid === item.uid ? item : entry)),
    satchel: hero.satchel.map((entry) => (entry.uid === item.uid ? item : entry)),
  };
}
