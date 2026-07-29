/**
 * Derived hero stats — what the character screen shows and what Phase 3's combat engine will
 * turn into a `Combatant`.
 *
 * All formulas are balancing §4. Nothing here rolls dice: these are the *expected* values a
 * player reads before a fight, so the numbers on the character sheet and the numbers in the
 * battle log come from the same place.
 *
 * Pure module.
 */

import { classDef } from '@/data/classes';
import {
  addAttributes,
  emptyAttributes,
  type AttributeId,
  type Attributes,
} from '@/engine/progression/stats';
import type { ClassId, Item, SlotId } from '@/engine/items/types';

export type Equipment = Partial<Record<SlotId, Item>>;

export interface StatBreakdown {
  /** Points bought with gold. */
  readonly trained: number;
  /** The class's innate starting spread. */
  readonly base: number;
  /** Sum of everything equipped. */
  readonly gear: number;
  readonly total: number;
}

export interface DerivedStats {
  readonly attributes: Attributes;
  readonly breakdown: Record<AttributeId, StatBreakdown>;
  readonly health: number;
  readonly damage: { min: number; max: number; average: number };
  readonly critChance: number;
  readonly critMultiplier: number;
  readonly armour: number;
  /** Damage actually absorbed against a same-level opponent, after the class cap. */
  readonly damageReduction: number;
  readonly damageReductionCap: number;
  readonly mainStat: AttributeId;
  readonly goldFind: number;
  readonly xpBonus: number;
}

const CRIT_MULTIPLIER = 2.0;
const CRIT_CAP = 0.5;

export function equipmentAttributes(equipment: Equipment): Attributes {
  let total = emptyAttributes();
  for (const item of Object.values(equipment)) {
    if (item) total = addAttributes(total, item.attrs);
  }
  return total;
}

export function equipmentArmour(equipment: Equipment): number {
  let total = 0;
  for (const item of Object.values(equipment)) {
    total += item?.armour ?? 0;
  }
  return total;
}

export interface DeriveInput {
  readonly classId: ClassId;
  readonly level: number;
  readonly trained: Attributes;
  readonly equipment: Equipment;
}

/**
 * Armour absorbs `armour / (opponentLevel · 50)` of a hit, capped by class (balancing §4).
 * Shown against a same-level opponent, because that is the fight the player is being paced for.
 */
export function damageReductionAgainst(armour: number, opponentLevel: number, cap: number): number {
  const raw = armour / (Math.max(1, opponentLevel) * 50);
  return Math.min(cap, Math.max(0, raw));
}

/** Crit chance = luck·5 / (2·opponentLevel), capped at 50% (balancing §4). */
export function critChanceAgainst(luck: number, opponentLevel: number): number {
  const raw = (luck * 5) / (2 * Math.max(1, opponentLevel));
  return Math.min(CRIT_CAP, Math.max(0, raw / 100));
}

export function deriveStats({ classId, level, trained, equipment }: DeriveInput): DerivedStats {
  const definition = classDef(classId);
  const base = definition.startingStats;
  const gear = equipmentAttributes(equipment);

  const attributes: Attributes = {
    str: base.str + trained.str + gear.str,
    dex: base.dex + trained.dex + gear.dex,
    int: base.int + trained.int + gear.int,
    con: base.con + trained.con + gear.con,
    lck: base.lck + trained.lck + gear.lck,
  };

  const breakdown = Object.fromEntries(
    (Object.keys(attributes) as AttributeId[]).map((id) => [
      id,
      { trained: trained[id], base: base[id], gear: gear[id], total: attributes[id] },
    ]),
  ) as Record<AttributeId, StatBreakdown>;

  const health = Math.round(attributes.con * (level + 1) * definition.hpFactor);

  // Damage = weapon roll × (1 + mainStat/10). Bare-handed still swings, just badly.
  const weapon = equipment.weapon?.weapon ?? { min: 1, max: 2 };
  const mainStatValue = attributes[definition.mainStat];
  const multiplier = 1 + mainStatValue / 10;
  const damage = {
    min: Math.round(weapon.min * multiplier),
    max: Math.round(weapon.max * multiplier),
    average: Math.round(((weapon.min + weapon.max) / 2) * multiplier),
  };

  const armour = equipmentArmour(equipment);

  let goldFind = 0;
  let xpBonus = 0;
  for (const item of Object.values(equipment)) {
    goldFind += item?.specials?.goldFind ?? 0;
    xpBonus += item?.specials?.xpBonus ?? 0;
  }

  return {
    attributes,
    breakdown,
    health,
    damage,
    critChance: critChanceAgainst(attributes.lck, level),
    critMultiplier: CRIT_MULTIPLIER,
    armour,
    damageReduction: damageReductionAgainst(armour, level, definition.drCap),
    damageReductionCap: definition.drCap,
    mainStat: definition.mainStat,
    goldFind,
    xpBonus,
  };
}

/**
 * What changes if this item is equipped — the compare tooltip's whole job.
 * Returns deltas against the currently equipped piece in the same slot (items spec §4).
 */
export interface ComparisonDelta {
  readonly health: number;
  readonly damageAverage: number;
  readonly critChance: number;
  readonly armour: number;
  readonly attributes: Attributes;
  /** True when the slot is empty, so the UI can say "equip" rather than "replace". */
  readonly slotWasEmpty: boolean;
}

export function compareItem(input: DeriveInput, candidate: Item): ComparisonDelta {
  const current = deriveStats(input);
  const replaced = input.equipment[candidate.slot];

  const next = deriveStats({
    ...input,
    equipment: { ...input.equipment, [candidate.slot]: candidate },
  });

  return {
    health: next.health - current.health,
    damageAverage: next.damage.average - current.damage.average,
    critChance: next.critChance - current.critChance,
    armour: next.armour - current.armour,
    attributes: {
      str: next.attributes.str - current.attributes.str,
      dex: next.attributes.dex - current.attributes.dex,
      int: next.attributes.int - current.attributes.int,
      con: next.attributes.con - current.attributes.con,
      lck: next.attributes.lck - current.attributes.lck,
    },
    slotWasEmpty: replaced === undefined,
  };
}
