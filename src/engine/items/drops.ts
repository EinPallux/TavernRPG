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

/**
 * Which slot an item drops into, and how often.
 *
 * **Weighted, not uniform** (Phase 6). Damage is linear in the weapon, so a hero whose weapon
 * has fallen behind loses regardless of what else they are wearing — and with ten slots and a
 * one-in-four drop chance, a uniform roll gives a weapon about once every forty missions. Once
 * Phase 6 sped levelling up to its intended pace, that measured out as a hero at level 13 still
 * swinging their level-1 starter blade, and a win rate sliding from 100% to 40% across a week.
 *
 * Weighting the slots that decide a fight is the smallest fix that holds the loop together. It
 * changes nothing the mission card publishes — the card prints *item chance* and *rarity*, both
 * untouched — and it is still seeded, so a mission's drop is as fixed as ever.
 *
 * The real answer is a shop you can buy a weapon from, which is Phase 7.
 */
const SLOT_WEIGHTS: readonly { readonly value: SlotId; readonly weight: number }[] = [
  { value: 'weapon', weight: 22 },
  { value: 'chest', weight: 14 },
  { value: 'offhand', weight: 10 },
  { value: 'helmet', weight: 9 },
  { value: 'gloves', weight: 9 },
  { value: 'boots', weight: 9 },
  { value: 'belt', weight: 9 },
  { value: 'amulet', weight: 6 },
  { value: 'ring', weight: 6 },
  { value: 'trinket', weight: 6 },
];

/**
 * How far behind the hero's weapon may fall before the next drop is guaranteed to be one.
 *
 * Weighting the slot table raises the *rate* of weapon drops but cannot put a floor under it:
 * across a fixed week of missions, some players simply see none, and a hero swinging a level-1
 * blade at level 13 loses every fight regardless of what else they are wearing. Measured at
 * every weapon weight from 22 to 40, at least one class in five still ended a 60-mission run
 * on its starter weapon.
 *
 * Pity is the answer, and it is already this game's answer elsewhere — Fortune's Table has run
 * on a pity counter since the design doc (gacha spec, pity 20). This is the same idea with a
 * smaller number: fall far enough behind and the world stops rolling the dice on you.
 *
 * It becomes largely academic once Bram's Armory opens in Phase 7 and gold can simply buy a
 * weapon; it stays as the floor for a player who never shops.
 */
export const WEAPON_PITY_LEVELS = 5;

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
export interface DropContext {
  /**
   * How many levels the hero's weapon is behind them. Drives the pity floor; omit it and the
   * roll is purely seeded, which is what the drop-rate tests want.
   */
  readonly weaponLevelsBehind?: number;
}

export function rollMissionDrops(
  table: DropTable,
  rng: RngStream,
  context: DropContext = {},
): DropRoll {
  const itemStream = rng.fork('item');
  const gotItem = itemStream.bool(table.itemChance);

  // Pity does not conjure a drop out of nothing — it only decides *what* a drop is. The
  // published item chance is therefore untouched, and the card still tells the truth.
  const pityWeapon = (context.weaponLevelsBehind ?? 0) >= WEAPON_PITY_LEVELS;

  return {
    item: gotItem
      ? {
          slot: pityWeapon ? 'weapon' : itemStream.weighted(SLOT_WEIGHTS),
          rarity: rollRarity(table.rarityWeights, itemStream),
        }
      : null,
    dice: rng.fork('dice').bool(table.diceChance) ? 1 : 0,
    ale: rng.fork('ale').bool(table.aleChance),
  };
}

/* ── Dungeons (balancing §7, dungeons spec §2) ───────────────────────────────────── */

/**
 * A dungeon floor's drops.
 *
 * Two rolls, not one, and that is the point. The **normal** roll is a better mission roll: half
 * the time something drops, weighted toward the good end. The **epic** roll is separate and
 * additive — a quarter of floors hand over an Epic *on top*. A floor you had to gear up for
 * three days to beat has to pay like one, and a single 50% roll that lands Common cannot do
 * that however generous its weights are.
 */
export const DUNGEON_FLOOR_DROPS: DropTable = {
  itemChance: 0.5,
  rarityWeights: { common: 40, uncommon: 32, rare: 20, epic: 8, ...NO_SET },
  // Dungeons are not a Golden Dice faucet — floor 10 pays them, in a lump, for finishing.
  diceChance: 0,
  aleChance: 0,
};

/** The separate Epic roll that rides alongside it on floors 1–9. */
export const DUNGEON_EPIC_CHANCE = 0.25;

/**
 * Floor 10 hands over an Epic, always (spec §2).
 *
 * Published as "Epic **or** Set, 50/50", and it will be once Phase 12 ships the sets. Until then
 * every hit is an Epic — stated here rather than silently, because "odds always visible" means
 * the table and the roll are the same object and neither may quietly promise the other's future.
 */
export const DUNGEON_CLEAR_DROPS: DropTable = {
  itemChance: 1,
  rarityWeights: { common: 0, uncommon: 0, rare: 0, epic: 100, ...NO_SET },
  diceChance: 0,
  aleChance: 0,
};

export function dungeonDropTable(floor: number): DropTable {
  return floor >= 10 ? DUNGEON_CLEAR_DROPS : DUNGEON_FLOOR_DROPS;
}

/**
 * Roll a cleared floor's loot.
 *
 * Returns up to two items: whatever the normal table gave, and the separate Epic. Both are
 * slot-weighted the same way a mission's is, so the weapon that decides the next floor is the
 * likeliest thing to fall out of this one.
 */
export function rollDungeonDrops(
  floor: number,
  rng: RngStream,
  context: DropContext = {},
): readonly { readonly slot: SlotId; readonly rarity: Rarity }[] {
  const table = dungeonDropTable(floor);
  const normal = rollMissionDrops(table, rng.fork('floor'), context);
  const drops = normal.item ? [normal.item] : [];

  // The bonus Epic. Floor 10's guaranteed Epic comes out of the table above instead, so the
  // clear pays one certain Epic rather than one certain plus one likely.
  if (floor < 10 && rng.fork('epic').bool(DUNGEON_EPIC_CHANCE)) {
    drops.push({ slot: rng.fork('epic-slot').weighted(SLOT_WEIGHTS), rarity: 'epic' });
  }

  return drops;
}

/** Published-adjacent: the chance a drop lands in a given slot, for the dev tools. */
export function slotOdds(slot: SlotId): number {
  const total = SLOT_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);
  return (SLOT_WEIGHTS.find((entry) => entry.value === slot)?.weight ?? 0) / total;
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
