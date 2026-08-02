/**
 * Every number the Emberforge runs on (crafting spec §1–§3, balancing §7).
 *
 * One file, on purpose. The forge is a slot machine, and this game's promise is that its odds are
 * always visible (CLAUDE.md rule 6) — a promise that only stays true if the tile the player reads
 * and the roll the engine makes are the *same object*. The crafting screen renders these tables
 * directly; nothing anywhere else may hold a second copy.
 *
 * Pure data module.
 */

import type { MaterialBundle, RolledRarity } from '@/engine/items/types';

export const FORGE_TIERS = ['rough', 'fine', 'master'] as const;
export type ForgeTier = (typeof FORGE_TIERS)[number];

export interface ForgeTierDef {
  readonly id: ForgeTier;
  readonly name: string;
  /** One line from Torvald, on the tile. */
  readonly blurb: string;
  readonly cost: MaterialBundle;
  /** Relative weights over the four rolled rarities. Neither chase tier comes from a plain forge. */
  readonly odds: Readonly<Record<RolledRarity, number>>;
  /** Only the Master forge feeds the pity meter — it is the tier you are gambling on. */
  readonly feedsPity: boolean;
}

const TIER_LIST = [
  {
    id: 'rough',
    name: 'Rough forge',
    blurb: 'A handful of scrap and a hopeful expression.',
    cost: { scrap: 12, essence: 0, starmetal: 0 },
    odds: { common: 45, uncommon: 40, rare: 14, epic: 1 },
    feedsPity: false,
  },
  {
    id: 'fine',
    name: 'Fine forge',
    blurb: 'Proper stock, properly worked. Torvald stops humming.',
    cost: { scrap: 30, essence: 6, starmetal: 0 },
    odds: { common: 10, uncommon: 45, rare: 36, epic: 9 },
    feedsPity: false,
  },
  {
    id: 'master',
    name: 'Master forge',
    blurb: 'Starmetal. He clears the bench and shuts the door.',
    cost: { scrap: 0, essence: 12, starmetal: 1 },
    odds: { common: 0, uncommon: 25, rare: 52, epic: 23 },
    feedsPity: true,
  },
] as const satisfies readonly ForgeTierDef[];

export const FORGE_TIER_DEFS: readonly ForgeTierDef[] = TIER_LIST;

export function forgeTier(id: ForgeTier): ForgeTierDef {
  return FORGE_TIER_DEFS.find((tier) => tier.id === id)!;
}

/**
 * `[TUNE]` Master forges before the next one is a guaranteed Epic (crafting spec §3).
 *
 * The forge's whole pitch is "better odds than the world", and 23% is better odds than anything
 * else in the game — but 23% still means a player can spend five Starmetal and see five Rares.
 * The ember meter is the floor under that, and it is *published* on the tile like everything
 * else here, because a pity track nobody can see is indistinguishable from good luck.
 */
export const EMBER_PITY = 5;

/** `[TUNE]` Scraps a day (crafting spec §2) — the cap that makes sell-vs-scrap a real choice. */
export const SCRAPS_PER_DAY = 10;

/**
 * `[TUNE]` A set recipe's price (crafting spec §3).
 *
 * Steep, and deliberately steeper than a Master forge: a recipe craft is a *guaranteed* set piece
 * and the only path that cannot hand you something you already own. The dungeons are the chase;
 * this is the mercy.
 */
export const RECIPE_COST: MaterialBundle = { scrap: 0, essence: 20, starmetal: 2 };

/** Published odds for one rarity at one tier, as a percentage — what the tile prints. */
export function forgeOdds(tier: ForgeTierDef, rarity: RolledRarity): number {
  const total = Object.values(tier.odds).reduce((sum, weight) => sum + weight, 0);
  return total === 0 ? 0 : (tier.odds[rarity] * 100) / total;
}

/** Whether a wallet can pay a cost. */
export function canAfford(wallet: MaterialBundle, cost: MaterialBundle): boolean {
  return (
    wallet.scrap >= cost.scrap &&
    wallet.essence >= cost.essence &&
    wallet.starmetal >= cost.starmetal
  );
}

export function spend(wallet: MaterialBundle, cost: MaterialBundle): MaterialBundle {
  return {
    scrap: Math.max(0, wallet.scrap - cost.scrap),
    essence: Math.max(0, wallet.essence - cost.essence),
    starmetal: Math.max(0, wallet.starmetal - cost.starmetal),
  };
}

export function addMaterials(wallet: MaterialBundle, gained: MaterialBundle): MaterialBundle {
  return {
    scrap: wallet.scrap + gained.scrap,
    essence: wallet.essence + gained.essence,
    starmetal: wallet.starmetal + gained.starmetal,
  };
}

export const MATERIAL_LABELS: Readonly<Record<keyof MaterialBundle, string>> = {
  scrap: 'Scrap',
  essence: 'Essence',
  starmetal: 'Starmetal',
};
