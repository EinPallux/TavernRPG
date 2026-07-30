/**
 * Drop tables (docs/design/balancing-formulas.md §7).
 *
 * The odds are written here exactly as they are published to the player — the game promises
 * "odds always visible" (CLAUDE.md rule 6), and the only way that promise stays true is if the
 * UI and the roll read the same table. `MISSION_DROPS` is what the mission card shows *and*
 * what the roll uses; they cannot drift.
 *
 * Every roll takes an `RngStream`, so a mission's loot is fixed the moment its seed is committed
 * at accept. Re-rolling the page, reloading mid-timer or watching the fight twice cannot change
 * what drops.
 *
 * Pure module.
 */

import type { RngStream } from '@/engine/rng';
import { RARITIES, type Rarity, type SlotId } from './types';

/** Relative weights over the five rarities, in `RARITIES` order. */
export type RarityWeights = Readonly<Record<Rarity, number>>;

export interface DropTable {
  /** Chance an item drops at all, 0–1. */
  readonly itemChance: number;
  readonly rarityWeights: RarityWeights;
  /** Chance of a Golden Die — the only way premium currency enters from missions. */
  readonly diceChance: number;
  /** Chance of a free Ale, itself capped at one a day by the caller. */
  readonly aleChance: number;
}

const NO_SET: Pick<RarityWeights, 'set'> = { set: 0 };

/**
 * Mission drops by duration. The 20-minute run does not pay more gold or XP per Vigor — it pays
 * *better odds*, which is what keeps long missions attractive without making short ones a
 * mistake (§6).
 */
export const MISSION_DROPS: Readonly<Record<number, DropTable>> = {
  5: {
    itemChance: 0.25,
    rarityWeights: { common: 62, uncommon: 26, rare: 9.5, epic: 2.5, ...NO_SET },
    diceChance: 0.006,
    aleChance: 0.02,
  },
  10: {
    itemChance: 0.25,
    rarityWeights: { common: 62, uncommon: 26, rare: 9.5, epic: 2.5, ...NO_SET },
    diceChance: 0.006,
    aleChance: 0.02,
  },
  15: {
    itemChance: 0.25,
    rarityWeights: { common: 62, uncommon: 26, rare: 9.5, epic: 2.5, ...NO_SET },
    diceChance: 0.006,
    aleChance: 0.02,
  },
  20: {
    itemChance: 0.38,
    rarityWeights: { common: 55, uncommon: 28, rare: 13, epic: 4, ...NO_SET },
    diceChance: 0.015,
    aleChance: 0.02,
  },
};

export function missionDropTable(duration: number): DropTable {
  return MISSION_DROPS[duration] ?? MISSION_DROPS[5]!;
}

/** Every slot an item can drop into. Weapons and offhands lock to the hero's class downstream. */
const DROPPABLE_SLOTS: readonly SlotId[] = [
  'weapon',
  'offhand',
  'helmet',
  'chest',
  'gloves',
  'boots',
  'belt',
  'amulet',
  'ring',
  'trinket',
];

export interface DropRoll {
  /** Null when nothing dropped, which is the common case. */
  readonly item: { readonly slot: SlotId; readonly rarity: Rarity } | null;
  readonly dice: number;
  readonly ale: boolean;
}

/**
 * Roll one mission's drops.
 *
 * Each roll draws from its own forked stream, so adding a new drop type later cannot shift the
 * results of the existing ones — the same reason the RNG forks by name rather than by position.
 */
export function rollMissionDrops(table: DropTable, rng: RngStream): DropRoll {
  const itemStream = rng.fork('item');
  const gotItem = itemStream.bool(table.itemChance);

  return {
    item: gotItem
      ? {
          slot: itemStream.pick(DROPPABLE_SLOTS),
          rarity: rollRarity(table.rarityWeights, itemStream),
        }
      : null,
    dice: rng.fork('dice').bool(table.diceChance) ? 1 : 0,
    ale: rng.fork('ale').bool(table.aleChance),
  };
}

export function rollRarity(weights: RarityWeights, rng: RngStream): Rarity {
  return rng.weighted(RARITIES.map((rarity) => ({ value: rarity, weight: weights[rarity] })));
}

/** The published odds for one rarity, as a percentage — what the card actually prints. */
export function rarityOdds(table: DropTable, rarity: Rarity): number {
  const total = RARITIES.reduce((sum, id) => sum + table.rarityWeights[id], 0);
  if (total <= 0) return 0;
  return (table.itemChance * table.rarityWeights[rarity] * 100) / total;
}
