/**
 * Item types (docs/design/systems/items-and-gear.md, docs/tech/data-models.md).
 *
 * Items are always *generated* instances, never authored content: a sword found at level 12 is
 * a different object from the same base found at level 40. Values computed at generation are
 * stored on the item so a player's stockpile never silently re-prices itself.
 *
 * Pure module.
 */

import type { AttributeId, Attributes } from '@/engine/progression/stats';
import type { IconId } from '@/data/icons';

export const SLOT_IDS = [
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
] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export const SLOT_LABELS: Readonly<Record<SlotId, string>> = {
  weapon: 'Weapon',
  offhand: 'Offhand',
  helmet: 'Helmet',
  chest: 'Chest',
  gloves: 'Gloves',
  boots: 'Boots',
  belt: 'Belt',
  amulet: 'Amulet',
  ring: 'Ring',
  trinket: 'Trinket',
};

/**
 * The plural of each slot, written out rather than made with `+ 's'`.
 *
 * Two of the ten are already plural. The gacha's daily banner said "Bootss" and "Glovess" for
 * three phases because a suffix looked like a safe shortcut, and it is exactly as safe as
 * English ever is.
 */
export const SLOT_PLURALS: Readonly<Record<SlotId, string>> = {
  weapon: 'Weapons',
  offhand: 'Offhands',
  helmet: 'Helmets',
  chest: 'Chest pieces',
  gloves: 'Gloves',
  boots: 'Boots',
  belt: 'Belts',
  amulet: 'Amulets',
  ring: 'Rings',
  trinket: 'Trinkets',
};

/** Slots that carry an armour rating. */
export const ARMOUR_SLOTS: readonly SlotId[] = ['helmet', 'chest', 'gloves', 'boots', 'belt'];
/** Slots whose contents are class-locked (items spec §1, §5). */
export const CLASS_LOCKED_SLOTS: readonly SlotId[] = ['weapon', 'offhand'];
export const JEWELLERY_SLOTS: readonly SlotId[] = ['amulet', 'ring', 'trinket'];

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'set'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_LABELS: Readonly<Record<Rarity, string>> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  set: 'Set',
};

/**
 * The five classes, as a list so callers that need to *enumerate* them (world generation,
 * balance sweeps) do not have to import the whole `CLASSES` data module to get five strings.
 */
export const CLASS_IDS = ['warrior', 'bard', 'mage', 'hunter', 'swashbuckler'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export interface WeaponDamage {
  readonly min: number;
  readonly max: number;
}

/** Small percentage lines that ride on jewellery (items spec §1). */
export interface ItemSpecials {
  readonly goldFind?: number;
  readonly xpBonus?: number;
}

export interface MaterialBundle {
  readonly scrap: number;
  readonly essence: number;
  readonly starmetal: number;
}

export interface Item {
  /** Stable id, minted from the generating RNG stream so it is reproducible. */
  readonly uid: string;
  readonly slot: SlotId;
  readonly rarity: Rarity;
  /** Level at generation — pins budget, value and scrap yield forever. */
  readonly level: number;
  /** Set on weapons, offhands and set pieces only. */
  readonly classLock?: ClassId;
  readonly name: string;
  readonly iconId: IconId;
  /** Which base noun produced this item; the art-override manifest keys off it. */
  readonly baseId: string;
  readonly attrs: Partial<Attributes>;
  readonly weapon?: WeaponDamage;
  readonly armour?: number;
  readonly specials?: ItemSpecials;
  readonly setId?: string;
  readonly value: number;
  readonly scrapYield: MaterialBundle;
  /** Locked items cannot be sold, scrapped or auto-discarded. */
  readonly locked: boolean;
}

/** Attribute lines carried by rarity (items spec §2). */
export const LINES_BY_RARITY: Readonly<Record<Rarity, number>> = {
  common: 1,
  uncommon: 1,
  rare: 2,
  epic: 3,
  set: 3,
};

/** `[TUNE]` balancing §8 — budget multiplier per rarity. */
export const RARITY_FACTOR: Readonly<Record<Rarity, number>> = {
  common: 0.55,
  uncommon: 0.75,
  rare: 1.0,
  epic: 1.35,
  set: 1.5,
};

/** `[TUNE]` balancing §2 — sale value multiplier per rarity. */
export const RARITY_VALUE_MULT: Readonly<Record<Rarity, number>> = {
  common: 1,
  uncommon: 2.2,
  rare: 5,
  epic: 12,
  set: 25,
};

/** `[TUNE]` balancing §8 — budget weight per slot. */
export const SLOT_FACTOR: Readonly<Record<SlotId, number>> = {
  weapon: 1.2,
  offhand: 1.0,
  chest: 1.1,
  helmet: 1.0,
  gloves: 1.0,
  boots: 1.0,
  belt: 1.0,
  amulet: 0.9,
  ring: 0.9,
  trinket: 0.9,
};

/** `[TUNE]` balancing §8 — how armour is distributed across the five armour slots. */
export const ARMOUR_PIECE_WEIGHT: Readonly<Record<string, number>> = {
  helmet: 0.18,
  chest: 0.3,
  gloves: 0.14,
  boots: 0.14,
  belt: 0.12,
  offhand: 0.12,
};

export function isArmourSlot(slot: SlotId): boolean {
  return ARMOUR_SLOTS.includes(slot);
}

export function isClassLockedSlot(slot: SlotId): boolean {
  return CLASS_LOCKED_SLOTS.includes(slot);
}

export function isJewellerySlot(slot: SlotId): boolean {
  return JEWELLERY_SLOTS.includes(slot);
}

export type { AttributeId, Attributes };
