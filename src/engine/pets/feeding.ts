/**
 * Feeding, levels and rarity (pets spec §2).
 *
 * All the arithmetic of a pet's progress, with none of the save-writing — `state/petActions.ts`
 * does that. Kept pure so the boost curve can be asserted directly rather than through a store.
 *
 * The design constraint the numbers are solved against: **a fully-levelled, fully-upgraded pet
 * must be worth less than one gear upgrade.** The ceiling is +6.4% of one attribute (level 50,
 * Epic frame, full rate); the average Rare chest line at level 30 is +6.6% of a reference hero's
 * main stat. It clears the bar by two tenths of a percent, on purpose, and `pets.test.ts`
 * measures both sides rather than trusting either number. Deliberately unexciting: a pet that
 * mattered would turn twelve collectibles into twelve obligations.
 *
 * Pure module.
 */

import {
  BOOST_BASE,
  BOOST_PER_LEVEL,
  FEEDS_PER_DAY,
  GOLD_PER_FEED_PER_LEVEL,
  HALF_RATE_BOOSTS,
  PET_MAX_LEVEL,
  RARITY_BONUS,
  RARITY_STEPS,
  SCRAPS_PER_FEED,
  type PetDef,
  type PetRarity,
  type RarityStep,
} from '@/data/pets';
import type { MaterialBundle } from '@/engine/items/types';

/** A pet's state. Absent from the save entirely until it has been fed once. */
export interface PetProgress {
  readonly level: number;
  readonly rarity: PetRarity;
  readonly fedToday: number;
}

export const NEW_PET: PetProgress = { level: 1, rarity: 'common', fedToday: 0 };

/** Progress for a pet the save has no entry for — a fresh arrival, not an error. */
export function progressOf(
  progress: Readonly<Record<string, PetProgress>>,
  id: string,
): PetProgress {
  return progress[id] ?? NEW_PET;
}

/* ── The boost ───────────────────────────────────────────────────────────────────── */

export function isHalfRate(definition: PetDef): boolean {
  return HALF_RATE_BOOSTS.includes(definition.boost);
}

/** How many upgrade steps a rarity represents — 0 for common, 3 for epic. */
export function rarityIndex(rarity: PetRarity): number {
  return RARITY_STEPS.findIndex((step) => step.rarity === rarity) + 1;
}

/**
 * What a pet is worth right now, as a share (0.055 = +5.5%).
 *
 * `base + perLevel × (level − 1)`, halved for the three non-attribute boosts, plus a flat
 * `RARITY_BONUS` per upgrade taken. The rarity bonus is **not** halved: it is a fixed
 * half-percent that exists to make the upgrade feel like something, and halving it to a quarter
 * of a percent would make it feel like nothing.
 */
export function boostShare(definition: PetDef, progress: PetProgress): number {
  const level = clampLevel(progress.level);
  const raw = BOOST_BASE + BOOST_PER_LEVEL * (level - 1);
  const scaled = isHalfRate(definition) ? raw / 2 : raw;
  return scaled + RARITY_BONUS * rarityIndex(progress.rarity);
}

export function clampLevel(level: number): number {
  return Math.min(PET_MAX_LEVEL, Math.max(1, Math.floor(level)));
}

/* ── Feeding ─────────────────────────────────────────────────────────────────────── */

/** Gold a feed costs at this level — it climbs, so late levels are a real decision. */
export function feedGoldCost(level: number): number {
  return Math.round(GOLD_PER_FEED_PER_LEVEL * clampLevel(level));
}

export type FeedRefusal =
  | { readonly kind: 'max-level' }
  | { readonly kind: 'fed-out'; readonly used: number; readonly limit: number }
  | { readonly kind: 'no-scraps'; readonly needed: number; readonly held: number }
  | { readonly kind: 'insufficient-gold'; readonly needed: number; readonly held: number };

export interface FeedQuote {
  readonly scraps: number;
  readonly gold: number;
  /** Feeds still allowed today. */
  readonly remaining: number;
  /** The level this feed would produce. */
  readonly toLevel: number;
}

/**
 * What one feed costs and buys, or why it will not happen.
 *
 * Quoted before it is charged, the same contract the crucible and the shops use: the button a
 * player reads and the action that refuses them are decided by one function, so a screen cannot
 * offer a feed the engine then declines.
 */
export function quoteFeed(
  progress: PetProgress,
  wallet: { readonly scraps: number; readonly gold: number },
):
  | { readonly ok: true; readonly quote: FeedQuote }
  | { readonly ok: false; readonly refusal: FeedRefusal } {
  const level = clampLevel(progress.level);
  if (level >= PET_MAX_LEVEL) return { ok: false, refusal: { kind: 'max-level' } };
  if (progress.fedToday >= FEEDS_PER_DAY) {
    return {
      ok: false,
      refusal: { kind: 'fed-out', used: progress.fedToday, limit: FEEDS_PER_DAY },
    };
  }

  const gold = feedGoldCost(level);
  if (wallet.scraps < SCRAPS_PER_FEED) {
    return {
      ok: false,
      refusal: { kind: 'no-scraps', needed: SCRAPS_PER_FEED, held: wallet.scraps },
    };
  }
  if (wallet.gold < gold) {
    return { ok: false, refusal: { kind: 'insufficient-gold', needed: gold, held: wallet.gold } };
  }

  return {
    ok: true,
    quote: {
      scraps: SCRAPS_PER_FEED,
      gold,
      remaining: FEEDS_PER_DAY - progress.fedToday - 1,
      toLevel: level + 1,
    },
  };
}

/** The progress a fed pet has. One feed, one level — the cap is the pace, not the curve. */
export function afterFeed(progress: PetProgress): PetProgress {
  return {
    ...progress,
    level: clampLevel(progress.level + 1),
    fedToday: progress.fedToday + 1,
  };
}

/* ── Rarity upgrades ─────────────────────────────────────────────────────────────── */

/** The upgrade this pet is eligible for, or null when there is none to take. */
export function nextUpgrade(progress: PetProgress): RarityStep | null {
  const taken = rarityIndex(progress.rarity);
  return RARITY_STEPS[taken] ?? null;
}

export type UpgradeRefusal =
  | { readonly kind: 'fully-upgraded' }
  | { readonly kind: 'level-too-low'; readonly needed: number; readonly level: number }
  | {
      readonly kind: 'insufficient-materials';
      readonly needed: MaterialBundle;
      readonly held: MaterialBundle;
    };

export function upgradeCost(step: RarityStep): MaterialBundle {
  return { scrap: 0, essence: step.essence, starmetal: step.starmetal };
}

export function quoteUpgrade(
  progress: PetProgress,
  materials: MaterialBundle,
):
  | { readonly ok: true; readonly step: RarityStep; readonly cost: MaterialBundle }
  | { readonly ok: false; readonly refusal: UpgradeRefusal } {
  const step = nextUpgrade(progress);
  if (!step) return { ok: false, refusal: { kind: 'fully-upgraded' } };
  if (progress.level < step.atLevel) {
    return {
      ok: false,
      refusal: { kind: 'level-too-low', needed: step.atLevel, level: progress.level },
    };
  }

  const cost = upgradeCost(step);
  if (materials.essence < cost.essence || materials.starmetal < cost.starmetal) {
    return {
      ok: false,
      refusal: { kind: 'insufficient-materials', needed: cost, held: materials },
    };
  }
  return { ok: true, step, cost };
}

/** Midnight: every pet's bowl is empty again. */
export function clearFedToday(
  progress: Readonly<Record<string, PetProgress>>,
): Record<string, PetProgress> {
  const next: Record<string, PetProgress> = {};
  for (const [id, entry] of Object.entries(progress)) {
    next[id] = entry.fedToday === 0 ? entry : { ...entry, fedToday: 0 };
  }
  return next;
}

export { FEEDS_PER_DAY, PET_MAX_LEVEL, SCRAPS_PER_FEED };
