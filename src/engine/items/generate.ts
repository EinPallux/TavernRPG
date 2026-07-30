/**
 * Item generation — every piece of gear in the game comes through here.
 *
 * Formulas are balancing §8; drop-rate tables belong to the *sources* (missions, shops, forge),
 * which pass in the rarity they rolled. One choke point matters for two reasons:
 *  - **Class restriction is enforced in exactly one place** (items spec §5): weapons and
 *    offhands generate only for the owning class, so wrong-class loot cannot exist.
 *  - **Determinism**: all randomness comes from the caller's seeded stream, so the same mission
 *    seed always yields the same sword.
 *
 * Pure module.
 */

import type { RngStream } from '@/engine/rng';
import { classDef } from '@/data/classes';
import {
  ATTRIBUTE_SUFFIXES,
  GENERAL_BASES,
  RARITY_PREFIXES,
  offhandBasesFor,
  weaponBasesFor,
  type ItemBase,
} from '@/data/itemBases';
import { ATTRIBUTE_IDS, type AttributeId, type Attributes } from '@/engine/progression/stats';
import {
  ARMOUR_PIECE_WEIGHT,
  LINES_BY_RARITY,
  RARITY_FACTOR,
  RARITY_VALUE_MULT,
  SLOT_FACTOR,
  isArmourSlot,
  isClassLockedSlot,
  isJewellerySlot,
  type ClassId,
  type Item,
  type MaterialBundle,
  type Rarity,
  type SlotId,
} from './types';
import { gearSet, setPiece, type SetSlot } from '@/data/gearSets';

/** `[TUNE]` balancing §8 — attribute points available to an item. */
export function itemBudget(level: number, rarity: Rarity, slot: SlotId): number {
  const raw = (2 + 1.05 * Math.max(1, level)) * RARITY_FACTOR[rarity] * SLOT_FACTOR[slot];
  return Math.max(1, Math.round(raw));
}

/** `[TUNE]` balancing §2 — what a shop pays for it. */
export function itemValue(level: number, rarity: Rarity): number {
  const base = 6 * Math.max(1, level) ** 1.35;
  return Math.max(1, Math.round(base * RARITY_VALUE_MULT[rarity]));
}

/** `[TUNE]` balancing §8 — armour rating for an armour piece. */
export function armourValue(level: number, rarity: Rarity, slot: SlotId): number {
  const weight = ARMOUR_PIECE_WEIGHT[slot] ?? 0;
  return Math.max(1, Math.round(Math.max(1, level) * 7 * RARITY_FACTOR[rarity] * weight * 5));
}

/**
 * `[TUNE]` balancing §8 — weapon damage band.
 *
 * The class factor is what pays for the survivability spread (see `ClassDef.weaponDamageFactor`):
 * a Warrior's one-hander hits softly behind its shield, a Mage's staff hits like a falling tree.
 */
export function weaponDamage(
  level: number,
  rarity: Rarity,
  classId: ClassId,
): { min: number; max: number } {
  const definition = classDef(classId);
  const average =
    (4 + 2.4 * Math.max(1, level)) * RARITY_FACTOR[rarity] * definition.weaponDamageFactor;
  const spread = definition.weaponSpread;
  return {
    min: Math.max(1, Math.round(average * (1 - spread))),
    max: Math.max(2, Math.round(average * (1 + spread))),
  };
}

/** `[TUNE]` crafting spec §1 — what scrapping this item returns. */
export function scrapYieldFor(rarity: Rarity, rng: RngStream): MaterialBundle {
  switch (rarity) {
    case 'common':
      return { scrap: rng.int(3, 5), essence: 0, starmetal: 0 };
    case 'uncommon':
      return { scrap: rng.int(6, 9), essence: 0, starmetal: 0 };
    case 'rare':
      return { scrap: 0, essence: rng.int(4, 6), starmetal: 0 };
    case 'epic':
      return { scrap: 0, essence: rng.int(9, 14), starmetal: rng.int(0, 1) };
    case 'set':
      return { scrap: 0, essence: 10, starmetal: 3 };
  }
}

/**
 * Split a budget across `lines` attributes. The dominant line always takes the largest share so
 * an item reads as "a Strength piece" rather than as five equal crumbs.
 */
function splitBudget(budget: number, lines: number, rng: RngStream): number[] {
  if (lines <= 1) return [budget];

  const weights = Array.from({ length: lines }, (_, index) =>
    index === 0 ? rng.float(0.45, 0.6) : rng.float(0.15, 0.35),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  const shares = weights.map((weight) => Math.max(1, Math.round((budget * weight) / total)));
  // Nudge the dominant line so the parts sum exactly to the budget.
  const drift = budget - shares.reduce((sum, share) => sum + share, 0);
  shares[0] = Math.max(1, (shares[0] ?? 1) + drift);
  return shares;
}

function pickBase(slot: SlotId, classId: ClassId, rng: RngStream): ItemBase {
  if (slot === 'weapon') return rng.pick(weaponBasesFor(classId));
  if (slot === 'offhand') return rng.pick(offhandBasesFor(classId));
  return rng.pick(GENERAL_BASES[slot as Exclude<SlotId, 'weapon' | 'offhand'>]);
}

function buildName(base: ItemBase, rarity: Rarity, dominant: AttributeId, rng: RngStream): string {
  const prefix = rng.pick(RARITY_PREFIXES[rarity]);
  const suffix = rng.pick(ATTRIBUTE_SUFFIXES[dominant]);
  // Commons stay plain: "Worn Coif" reads as junk at a glance, which is the point.
  return rarity === 'common' ? `${prefix} ${base.noun}` : `${prefix} ${base.noun} ${suffix}`;
}

export interface GenerateItemOptions {
  readonly level: number;
  readonly slot: SlotId;
  readonly rarity: Rarity;
  /** Whose class the item is generated for. Weapons/offhands lock to it. */
  readonly classId: ClassId;
  readonly rng: RngStream;
  /** Bias the dominant attribute — used so class weapons favour their own stat. */
  readonly preferredAttribute?: AttributeId;
}

export function generateItem({
  level,
  slot,
  rarity,
  classId,
  rng,
  preferredAttribute,
}: GenerateItemOptions): Item {
  const safeLevel = Math.max(1, Math.floor(level));
  const base = pickBase(slot, classId, rng);
  const budget = itemBudget(safeLevel, rarity, slot);
  const lines = LINES_BY_RARITY[rarity];

  // Choose which attributes appear; the first is dominant and names the item.
  const pool = rng.shuffle(ATTRIBUTE_IDS);
  const chosen: AttributeId[] = [];
  if (preferredAttribute) chosen.push(preferredAttribute);
  for (const attribute of pool) {
    if (chosen.length >= lines) break;
    if (!chosen.includes(attribute)) chosen.push(attribute);
  }

  const shares = splitBudget(budget, chosen.length, rng);
  const attrs: Partial<Attributes> = {};
  chosen.forEach((attribute, index) => {
    attrs[attribute] = shares[index] ?? 1;
  });

  const dominant = chosen[0] ?? 'con';
  const item: Item = {
    uid: `itm-${rng.int(0, 0xffffff).toString(36)}-${rng.int(0, 0xffffff).toString(36)}`,
    slot,
    rarity,
    level: safeLevel,
    ...(isClassLockedSlot(slot) ? { classLock: classId } : {}),
    name: buildName(base, rarity, dominant, rng),
    iconId: base.iconId,
    baseId: base.id,
    attrs,
    ...(slot === 'weapon' ? { weapon: weaponDamage(safeLevel, rarity, classId) } : {}),
    ...(isArmourSlot(slot) || slot === 'offhand'
      ? { armour: armourValue(safeLevel, rarity, slot) }
      : {}),
    ...(isJewellerySlot(slot) ? { specials: rollSpecials(slot, rarity, rng) } : {}),
    value: itemValue(safeLevel, rarity),
    scrapYield: scrapYieldFor(rarity, rng),
    locked: false,
  };

  return item;
}

/** Jewellery carries small economy lines — the reason to gear for gold or XP (items spec §1). */
function rollSpecials(slot: SlotId, rarity: Rarity, rng: RngStream) {
  // 25% of jewellery rolls a special line (items spec §3 step 4).
  if (!rng.bool(0.25)) return undefined;

  const magnitude = 1 + Math.round(RARITY_FACTOR[rarity] * 2);
  if (slot === 'trinket') return { goldFind: magnitude };
  if (slot === 'amulet') return { xpBonus: magnitude };
  return rng.bool(0.5) ? { goldFind: magnitude } : { xpBonus: magnitude };
}

/* ── Set pieces (gear-sets spec §1) ──────────────────────────────────────────────── */

export interface GenerateSetPieceOptions {
  readonly setId: string;
  readonly slot: SetSlot;
  readonly level: number;
  readonly rng: RngStream;
}

/**
 * A curated set piece, at the level it was found.
 *
 * The one item in the game whose *shape* is authored: an ordinary drop shuffles the attribute
 * pool and splits the budget randomly, while a set piece spends the same Set-rarity budget over
 * the exact attributes its set was designed around. That is the whole point — a set is a build,
 * and a build cannot be a shrug of the dice.
 *
 * The size is still level-scaled like everything else (spec §1), so a piece found at level 30 is
 * a level-30 piece forever. Out-levelled sets are refreshed at the forge, not retro-fitted.
 */
export function generateSetPiece({ setId, slot, level, rng }: GenerateSetPieceOptions): Item | null {
  const definition = gearSet(setId);
  const piece = definition ? setPiece(setId, slot) : null;
  if (!definition || !piece) return null;

  const safeLevel = Math.max(1, Math.floor(level));
  const budget = itemBudget(safeLevel, 'set', slot);

  // Curated: the weights say where the budget goes, and they sum to one by construction.
  const attrs: Partial<Attributes> = {};
  for (const [attribute, weight] of Object.entries(piece.weights) as [AttributeId, number][]) {
    attrs[attribute] = Math.max(1, Math.round(budget * weight));
  }

  const base = pickBase(slot, definition.classId, rng);
  return {
    uid: `set-${rng.int(0, 0xffffff).toString(36)}-${rng.int(0, 0xffffff).toString(36)}`,
    slot,
    rarity: 'set',
    level: safeLevel,
    // Class-locked even though the slot is not: a set is its class's, and wearing half an
    // Oathsworn kit as a Mage would be the loudest possible balance hole.
    classLock: definition.classId,
    name: piece.name,
    iconId: base.iconId,
    baseId: base.id,
    attrs,
    armour: armourValue(safeLevel, 'set', slot),
    setId,
    value: itemValue(safeLevel, 'set'),
    scrapYield: scrapYieldFor('set', rng),
    locked: false,
  };
}
