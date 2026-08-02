/**
 * Rolling and re-rolling the named arms (docs/design/systems/legendaries.md).
 *
 * Two entry points, and they are the same roll twice: `rollLegendary()` mints one, `reforge()`
 * draws its affixes again. Everything else here exists so the item card and the reforge bench can
 * say what happened without either of them holding a second copy of a number.
 *
 * Pure module — every roll takes an `RngStream`, so a legendary out of a dungeon floor is as
 * fixed as the floor's seed and reloading cannot re-roll it.
 */

import type { RngStream } from '@/engine/rng';
import type { SetEffect } from '@/data/gearSets';
import type { AttributeId, Attributes } from '@/engine/progression/stats';
import {
  LEGENDARIES,
  LEGENDARY_AFFIX_COUNT,
  legendariesFor,
  legendaryAffix,
  legendaryDef,
  magnitudeSteps,
  type LegendaryDef,
} from '@/data/legendaries';
import { armourValue, itemBudget, itemValue, scrapYieldFor, weaponDamage } from './generate';
import { ARMOUR_SLOTS, type ClassId, type Item, type LegendaryAffix, type SlotId } from './types';

/**
 * Roll one affix's magnitude.
 *
 * On the band's *grain*, not anywhere inside it: a share rolled as a raw float prints
 * "+6.999999%" and makes two identical items look different. `magnitudeSteps()` is the size of
 * the space, and the reforge bench prints it.
 */
export function rollMagnitude(affixId: string, rng: RngStream): number {
  const definition = legendaryAffix(affixId);
  if (!definition) return 0;
  const { min, step } = definition.band;
  const index = rng.int(0, magnitudeSteps(definition.band) - 1);
  // Re-rounded because `min + index * step` on floats gives 0.060000000000000005.
  return Number((min + index * step).toFixed(6));
}

/**
 * Draw `LEGENDARY_AFFIX_COUNT` affixes out of a legendary's pool, without replacement.
 *
 * Without replacement matters: two rolls of the same lever would fold into one doubled number and
 * read on the card as a duplicated line, which looks like a bug whether or not it is one.
 */
export function rollAffixes(definition: LegendaryDef, rng: RngStream): readonly LegendaryAffix[] {
  const pool = rng.shuffle(definition.affixPool).slice(0, LEGENDARY_AFFIX_COUNT);
  return pool.map((affixId, index) => ({
    id: affixId,
    magnitude: rollMagnitude(affixId, rng.fork(`m${index}`)),
  }));
}

export interface RollLegendaryOptions {
  readonly classId: ClassId;
  readonly level: number;
  readonly rng: RngStream;
  /** Restrict the draw to one legendary, by id — the Sundered Anvil's floor-10 reward does this. */
  readonly defId?: string;
  /** Slots the caller would rather not hand over again. Advisory: ignored if it empties the pool. */
  readonly avoidSlots?: readonly SlotId[];
}

/**
 * Mint a legendary.
 *
 * The statline is a set piece's — `itemBudget(level, 'legendary', slot)` and
 * `RARITY_FACTOR.legendary` are both 1.5, deliberately (balancing §22.2). What the player is
 * being handed is the two affixes.
 *
 * `avoidSlots` is a courtesy, not a rule. A player wearing a legendary helmet would rather the
 * next one were not another helmet, but a hard exclusion means a full paperdoll produces *null*
 * from the game's rarest drop, which is worse than a duplicate slot by a wide margin.
 */
export function rollLegendary({
  classId,
  level,
  rng,
  defId,
  avoidSlots = [],
}: RollLegendaryOptions): Item | null {
  const eligible = legendariesFor(classId);
  const named = defId ? eligible.filter((entry) => entry.id === defId) : eligible;
  if (named.length === 0) return null;

  const preferred = named.filter((entry) => !avoidSlots.includes(entry.slot));
  const definition = rng.fork('which').pick(preferred.length > 0 ? preferred : named);
  if (!definition) return null;

  return mintLegendary(definition, level, rng.fork('make'));
}

/** Build the item, once a definition has been chosen. Shared by the roll and the dev drawer. */
export function mintLegendary(definition: LegendaryDef, level: number, rng: RngStream): Item {
  const safeLevel = Math.max(1, Math.floor(level));
  const budget = itemBudget(safeLevel, 'legendary', definition.slot);

  // Authored shape, rolled size — the same bargain a set piece makes. Integer weights here,
  // normalised, rather than shares that have to be kept summing to one by hand.
  const total = Object.values(definition.weights).reduce((sum, weight) => sum + weight, 0) || 1;
  const attrs: Partial<Attributes> = {};
  for (const [attribute, weight] of Object.entries(definition.weights) as [AttributeId, number][]) {
    attrs[attribute] = Math.max(1, Math.round((budget * weight) / total));
  }

  const isArmour = ARMOUR_SLOTS.includes(definition.slot) || definition.slot === 'offhand';
  return {
    uid: `lgd-${rng.int(0, 0xffffff).toString(36)}-${rng.int(0, 0xffffff).toString(36)}`,
    slot: definition.slot,
    rarity: 'legendary',
    level: safeLevel,
    ...(definition.classId ? { classLock: definition.classId } : {}),
    name: definition.name,
    iconId: definition.iconId,
    baseId: definition.id,
    attrs,
    ...(definition.slot === 'weapon' && definition.classId
      ? { weapon: weaponDamage(safeLevel, 'legendary', definition.classId) }
      : {}),
    ...(isArmour ? { armour: armourValue(safeLevel, 'legendary', definition.slot) } : {}),
    legendary: {
      defId: definition.id,
      affixes: rollAffixes(definition, rng.fork('affixes')),
      reforges: 0,
    },
    value: itemValue(safeLevel, 'legendary'),
    scrapYield: scrapYieldFor('legendary', rng.fork('scrap')),
    locked: false,
  };
}

/**
 * Re-roll a legendary's affixes at the Emberforge (spec §6).
 *
 * It **replaces**. There is no keep-the-better-one, because a re-roll you cannot lose is not a
 * decision, and the card shows what you have before the press. `reforges` counts up so the bench
 * can say how many times this one has been through — the only history the item carries.
 *
 * Returns null for anything that is not a legendary rather than silently handing back the input:
 * a bench that quietly does nothing is how a feature ships broken.
 */
export function reforge(item: Item, rng: RngStream): Item | null {
  if (item.rarity !== 'legendary' || !item.legendary) return null;
  const definition = legendaryDef(item.legendary.defId);
  if (!definition) return null;

  return {
    ...item,
    legendary: {
      ...item.legendary,
      affixes: rollAffixes(definition, rng),
      reforges: item.legendary.reforges + 1,
    },
  };
}

/** Every legendary the hero is currently wearing. */
export function equippedLegendaries(equipment: Partial<Record<SlotId, Item>>): readonly Item[] {
  return Object.values(equipment).filter(
    (item): item is Item => item !== undefined && item.rarity === 'legendary' && !!item.legendary,
  );
}

/**
 * How many distinct rolls one legendary has — pool choose two, times each pair's magnitudes.
 *
 * Printed at the bench. "Odds always visible" (rule 6) has to mean something at a bench whose
 * output is not a rarity, and the honest statement is the size of the space being re-rolled into.
 */
export function rollSpaceOf(definition: LegendaryDef): number {
  const pool = definition.affixPool;
  let total = 0;
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      const a = legendaryAffix(pool[i]!);
      const b = legendaryAffix(pool[j]!);
      if (!a || !b) continue;
      total += magnitudeSteps(a.band) * magnitudeSteps(b.band);
    }
  }
  return total;
}

/**
 * The lever a stored affix becomes.
 *
 * The one place `(id, magnitude)` turns back into a `SetEffect`. Null for an affix the data module
 * no longer knows — a save from a build whose pool has since been edited loses that line rather
 * than failing to load, which is the right trade for a cosmetic-plus-numbers field.
 */
export function affixEffect(affix: LegendaryAffix): SetEffect | null {
  return legendaryAffix(affix.id)?.effect(affix.magnitude) ?? null;
}

/** Every lever a legendary is currently granting. */
export function affixEffectsOf(item: Item): readonly SetEffect[] {
  return (item.legendary?.affixes ?? [])
    .map(affixEffect)
    .filter((effect): effect is SetEffect => effect !== null);
}

/** Whether a hero of this class could ever be handed this legendary. */
export function canWear(definition: LegendaryDef, classId: ClassId): boolean {
  return definition.classId === undefined || definition.classId === classId;
}

/** Every legendary in the game, for the collections surfaces that want to show the whole set. */
export const ALL_LEGENDARIES = LEGENDARIES;
