/**
 * Fortune's Table, as save-to-save transitions (gacha spec §3–§5).
 *
 * Same contract as every other actions module: a `SaveFile` in, a new one out, no clock and no
 * store. The engine decides *what* a roll produced; this decides where it goes — items into the
 * bags, materials into the purse, gold into the pocket, Ale onto the shelf, shards toward a
 * recipe, and the track's rungs into whatever they promised.
 *
 * **The track pays by arithmetic, not by boundary.** `monthlyPaidThrough` is a high-water mark
 * in *rolls*, and
 * rungs are `Math.floor(rolls / 15)` — so re-running the same state can only ever produce the
 * same answer. The four day-keyed counters elsewhere in the save exist because a reproducible
 * roll is the opposite of an idempotent one (CLAUDE.md); this counter sidesteps that by never
 * being keyed on a day at all.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { addItem as addItemToHero, hasRoom } from '@/engine/hero/actions';
import { addMaterials } from '@/engine/forge/forgeConfig';
import { ownedSetPieces } from '@/engine/items/sets';
import { canDrinkAle } from '@/engine/reset/resetEngine';
import { activeBanner, type ActiveBanner } from '@/engine/gacha/schedule';
import { rollBanner, type GachaResult, type RollContext } from '@/engine/gacha/roll';
import { rungsCrossed, TRACK_STARMETAL, shardsToRecipes } from '@/engine/gacha/track';
import { drawRecipe } from '@/engine/forge/craft';
import {
  GILDED_SNAIL,
  OWL_OF_VESNA,
  ROLL_DICE_COST,
  TEN_ROLL_SIZE,
  type BannerId,
} from '@/data/banners';
import { ROLL_HISTORY_LIMIT, type SaveFile, type StoredRollRecord } from '@/engine/save/schema';
import type { DayKey } from '@/engine/clock';

export type GachaRefusal =
  | { readonly kind: 'no-hero' }
  | { readonly kind: 'insufficient-dice'; readonly needed: number; readonly held: number }
  | { readonly kind: 'bags-full' }
  | { readonly kind: 'no-free-roll' }
  | { readonly kind: 'no-ten-roll' };

const refuse = (refusal: GachaRefusal) => ({ ok: false as const, refusal });

/** What the ceremony needs to show, beyond the cards themselves. */
export interface RollExtras {
  /** Track rungs this spin crossed, in order, already applied. */
  readonly rungs: readonly {
    readonly kind: 'recipe' | 'pet' | 'starmetal';
    readonly label: string;
    readonly detail: string;
    /** Null when a recipe rung had nothing left to give — it pays Starmetal instead. */
    readonly granted: string | null;
  }[];
  /** Recipes the shard counter completed on this spin. */
  readonly shardRecipes: readonly string[];
  /** True when the Gilded Snail turned up on any card of the spin. */
  readonly snail: boolean;
}

export interface RollTransition {
  readonly ok: true;
  readonly save: SaveFile;
  readonly banner: ActiveBanner;
  /** One card, or ten on the Grand Reading's spread. */
  readonly results: readonly GachaResult[];
  readonly extras: RollExtras;
  /** Dice actually spent — zero on the free Daily Draw. */
  readonly spent: number;
}

export type RollResultState =
  RollTransition | { readonly ok: false; readonly refusal: GachaRefusal };

/** The banner as it stands today. Re-derived on every read; nothing about it is stored. */
export function bannerToday(save: SaveFile, id: BannerId, today: DayKey): ActiveBanner | null {
  if (!save.hero) return null;
  return activeBanner(id, today, save.worldSeed, save.hero.classId);
}

/** Whether the Daily Draw's free card is still on the table. */
export function freeRollAvailable(save: SaveFile): boolean {
  return save.gacha.freeRollsToday < 1;
}

/**
 * Pity as the panel shows it: how far along, out of how many, and toward what.
 *
 * Returns the *featured* set's progress rather than the counter's raw value, because those
 * differ whenever the table has turned over — a player twelve rolls into Oathsworn looking at a
 * Wolfblood week is at zero this week, and saying "12/20" under a Wolfblood card would be a lie
 * the meter tells for six days.
 */
export function pityFor(
  save: SaveFile,
  active: ActiveBanner,
): { count: number; of: number } | null {
  const { pity } = active.definition;
  if (pity === 0 || !active.set) return null;
  const matches = save.gacha.weeklyPitySet === active.set.id;
  return { count: matches ? save.gacha.weeklyPity : 0, of: pity };
}

/* ── Applying a result ───────────────────────────────────────────────────────────── */

interface Applied {
  readonly save: SaveFile;
  readonly shards: number;
}

/** Put one card's reward where it belongs. Nothing here rolls anything. */
function grant(save: SaveFile, result: GachaResult): Applied {
  const hero = save.hero!;

  switch (result.reward.kind) {
    case 'item':
      return { save: { ...save, hero: addItemToHero(hero, result.reward.item).hero }, shards: 0 };

    case 'materials':
      return {
        save: {
          ...save,
          hero: { ...hero, materials: addMaterials(hero.materials, result.reward.materials) },
        },
        shards: 0,
      };

    case 'gold':
      return {
        save: { ...save, hero: { ...hero, gold: hero.gold + result.reward.gold } },
        shards: 0,
      };

    case 'ale':
      return {
        save: { ...save, activity: { ...save.activity, alesHeld: save.activity.alesHeld + 1 } },
        shards: 0,
      };

    case 'dupe':
      return {
        save: {
          ...save,
          hero: { ...hero, materials: addMaterials(hero.materials, result.reward.materials) },
        },
        shards: result.reward.shards,
      };
  }
}

/**
 * Pay out whatever the track owes, in order.
 *
 * A recipe rung on a player who already holds both patterns pays Starmetal instead — the rung
 * is a promise of *something*, and "you already had it" is the one outcome a published track
 * must never produce.
 */
function payTrack(
  save: SaveFile,
  before: number,
  after: number,
): {
  save: SaveFile;
  rungs: RollExtras['rungs'];
} {
  const crossed = rungsCrossed(before, after);
  if (crossed.length === 0) return { save, rungs: [] };

  let next = save;
  const rungs: RollExtras['rungs'][number][] = [];

  for (const rung of crossed) {
    if (rung.kind === 'recipe') {
      const drawn = drawRecipe({
        classId: next.hero!.classId,
        owned: next.forge.recipes,
        rng: createRng(deriveSeed(next.worldSeed, 'track', rung.at), `track/recipe/${rung.at}`),
      });
      if (drawn) {
        next = { ...next, forge: { ...next.forge, recipes: [...next.forge.recipes, drawn] } };
        rungs.push({ ...rung, granted: drawn });
      } else {
        next = {
          ...next,
          hero: {
            ...next.hero!,
            materials: addMaterials(next.hero!.materials, {
              scrap: 0,
              essence: 0,
              starmetal: TRACK_STARMETAL,
            }),
          },
        };
        rungs.push({
          ...rung,
          label: 'Starmetal, in place of a pattern',
          detail: 'You already hold both of your class’s recipes — she pays in metal instead.',
          granted: null,
        });
      }
      continue;
    }

    if (rung.kind === 'pet') {
      next = next.gacha.pets.includes(OWL_OF_VESNA)
        ? next
        : { ...next, gacha: { ...next.gacha, pets: [...next.gacha.pets, OWL_OF_VESNA] } };
      rungs.push({ ...rung, granted: OWL_OF_VESNA });
      continue;
    }

    next = {
      ...next,
      hero: {
        ...next.hero!,
        materials: addMaterials(next.hero!.materials, {
          scrap: 0,
          essence: 0,
          starmetal: TRACK_STARMETAL,
        }),
      },
    };
    rungs.push({ ...rung, granted: null });
  }

  return { save: { ...next, gacha: { ...next.gacha, monthlyPaidThrough: after } }, rungs };
}

function record(
  result: GachaResult,
  bannerId: BannerId,
  free: boolean,
  at: number,
): StoredRollRecord {
  return {
    at,
    bannerId,
    outcome: result.outcome,
    label: result.label,
    pitied: result.pitied,
    free,
  };
}

/* ── The spin ────────────────────────────────────────────────────────────────────── */

export interface RollOptions {
  readonly bannerId: BannerId;
  readonly today: DayKey;
  readonly now: number;
  /** Ten cards at once, Grand Reading only (spec §3). */
  readonly ten?: boolean;
}

/**
 * Spin the wheel.
 *
 * One function for one card and for ten, because a ten-roll is exactly ten rolls — no discount,
 * no separate table, and the pity counter advancing card by card the way it would if they were
 * spun one at a time. The spread is presentation; the arithmetic must not know about it.
 */
export function roll(save: SaveFile, options: RollOptions): RollResultState {
  const { hero } = save;
  if (!hero) return refuse({ kind: 'no-hero' });

  const active = activeBanner(options.bannerId, options.today, save.worldSeed, hero.classId);
  const count = options.ten ? TEN_ROLL_SIZE : 1;
  if (options.ten && !active.definition.allowsTenRoll) return refuse({ kind: 'no-ten-roll' });

  // The Daily Draw's card is free once a day; everything else is a die each.
  const free = active.definition.freeRollPerDay && !options.ten && freeRollAvailable(save);
  const cost = free ? 0 : count * ROLL_DICE_COST;
  if (hero.dice < cost) return refuse({ kind: 'insufficient-dice', needed: cost, held: hero.dice });

  // A roll can hand over gear, and gear needs somewhere to go. Checked once for the whole
  // spread rather than per card: a ten-roll that stops halfway is worse than one that never
  // started, and the player can always clear a slot and come back.
  if (!hasRoom(hero, count)) return refuse({ kind: 'bags-full' });

  let next: SaveFile = { ...save, hero: { ...hero, dice: hero.dice - cost } };
  const results: GachaResult[] = [];
  const history: StoredRollRecord[] = [];
  let shards = next.gacha.shards;
  let pity = next.gacha.weeklyPity;
  let pitySet = next.gacha.weeklyPitySet;
  let snail = false;

  for (let index = 0; index < count; index += 1) {
    const heroNow = next.hero!;
    const context: RollContext = {
      classId: heroNow.classId,
      level: heroNow.level,
      ownedSetPieces: ownedSetPieces(heroNow),
      pityCount: active.set && pitySet === active.set.id ? pity : 0,
      pityMatchesFeatured: Boolean(active.set) && pitySet === active.set?.id,
      aleCapped: !canDrinkAle(next.activity.alesToday) || next.activity.alesHeld >= 3,
      ...(free ? { free: true } : {}),
    };

    const result = rollBanner(
      active,
      context,
      createRng(
        deriveSeed(next.worldSeed, 'gacha', options.bannerId, next.gacha.rolls + index),
        `gacha/${options.bannerId}/${next.gacha.rolls + index}`,
      ),
    );

    const applied = grant(next, result);
    next = applied.save;
    shards += applied.shards;
    results.push(result);
    history.push(record(result, options.bannerId, free, options.now));
    snail = snail || result.snail;

    // The counter follows the set, not the week: rolling on a different set adopts it, which is
    // what makes "12/20 toward Oathsworn" survive a Wolfblood week rather than being spent by it.
    if (active.definition.pity > 0 && active.set) {
      if (pitySet !== active.set.id && !free) pitySet = active.set.id;
      if (pitySet === active.set.id) pity = result.pityCount;
    }
  }

  // Shards, then the track. Both are counters that pay in batches, and both are computed from
  // totals rather than incremented on a boundary.
  const { recipes: earned, remainder } = shardsToRecipes(shards);
  const shardRecipes: string[] = [];
  for (let i = 0; i < earned; i += 1) {
    const drawn = drawRecipe({
      classId: next.hero!.classId,
      owned: [...next.forge.recipes, ...shardRecipes],
      rng: createRng(
        deriveSeed(next.worldSeed, 'shard', next.gacha.rolls + i),
        `shard/${next.gacha.rolls + i}`,
      ),
    });
    if (!drawn) break;
    shardRecipes.push(drawn);
  }
  if (shardRecipes.length > 0) {
    next = { ...next, forge: { ...next.forge, recipes: [...next.forge.recipes, ...shardRecipes] } };
  }

  const monthlyBefore = next.gacha.monthlyRolls;
  const monthlyAfter = options.bannerId === 'monthly' ? monthlyBefore + count : monthlyBefore;

  next = {
    ...next,
    gacha: {
      ...next.gacha,
      weeklyPity: pity,
      weeklyPitySet: pitySet,
      monthlyRolls: monthlyAfter,
      // Shards that did not complete a recipe stay banked; ones that did are spent.
      shards: shardRecipes.length > 0 ? remainder : shards,
      freeRollsToday: next.gacha.freeRollsToday + (free ? 1 : 0),
      rolls: next.gacha.rolls + count,
      history: [...history.reverse(), ...next.gacha.history].slice(0, ROLL_HISTORY_LIMIT),
    },
  };

  // Paid from the *mark*, not from `monthlyBefore`: if a rung ever failed to land, the next
  // roll catches it up rather than skipping it forever.
  const paid = payTrack(next, next.gacha.monthlyPaidThrough, monthlyAfter);
  next = paid.save;

  // The one-in-a-hundred snail, on top of everything else (pets spec §1).
  if (snail && !next.gacha.pets.includes(GILDED_SNAIL)) {
    next = { ...next, gacha: { ...next.gacha, pets: [...next.gacha.pets, GILDED_SNAIL] } };
  }

  return {
    ok: true,
    save: next,
    banner: active,
    results,
    extras: { rungs: paid.rungs, shardRecipes, snail },
    spent: cost,
  };
}

/** Midnight: the free card is back on the table (spec §3). */
export function refreshGachaDay(save: SaveFile): SaveFile {
  if (save.gacha.freeRollsToday === 0) return save;
  return { ...save, gacha: { ...save.gacha, freeRollsToday: 0 } };
}

export { ROLL_DICE_COST, TEN_ROLL_SIZE };
