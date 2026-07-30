/**
 * Building combatants — turning a hero or a monster into the flat snapshot `fight()` consumes.
 *
 * Both sides go through the same door, using the same formulas, which is what makes a fight
 * *fair* rather than merely balanced: a monster's health is computed exactly the way a hero's
 * is, and (from Phase 8) so is a simulated player's.
 *
 * Pure module.
 */

import { classDef } from '@/data/classes';
import { archetype, type ArchetypeId } from '@/data/monsterArchetypes';
import { deriveStats, type Equipment } from '@/engine/hero/derived';
import type { Attributes } from '@/engine/progression/stats';
import type { ClassId, Item, SlotId } from '@/engine/items/types';
import { NO_MODIFIERS, modifiersFor, openingVerse } from '@/engine/items/sets';
import type { Hero } from '@/engine/save/schema';
import type { Combatant, CombatProc } from './types';

/** `[TUNE]` balancing §5 — total attribute points a monster has to spend at a given level. */
export function monsterStatBudget(level: number): number {
  return Math.round(12 + 5.2 * Math.max(1, level));
}

/**
 * Baseline weapon damage a fighter of this level is expected to swing.
 *
 * Exported since Phase 8: the world simulation builds 1,500 bots off exactly these curves, which
 * is what "fair under inspection" means — a bot is not a monster with a name, it is a hero built
 * the way heroes are built.
 */
export function baselineWeaponDamage(level: number): { min: number; max: number } {
  const average = 4 + 2.4 * Math.max(1, level);
  return { min: average * 0.8, max: average * 1.2 };
}

/** Baseline total armour a fighter of this level is expected to wear. */
export function baselineArmour(level: number): number {
  return Math.max(1, level) * 7 * 0.88 * 5;
}

/** Translate a class's declared kit into resolver procs. */
export function procsForClass(classId: ClassId): CombatProc[] {
  const definition = classDef(classId);
  const { proc } = definition;

  switch (proc.kind) {
    case 'block':
      return [{ kind: 'block', chance: proc.chance ?? 0 }];
    case 'dodge':
      return [{ kind: 'dodge', chance: proc.chance ?? 0 }];
    case 'double-strike':
      return [
        {
          kind: 'double-strike',
          chance: proc.chance ?? 0,
          damageMultiplier: proc.damageMultiplier ?? 1,
        },
        // Parry: the light defence that keeps a Swashbuckler from being a Hunter with no
        // defence at all. Small on purpose — the class pays for its offence.
        { kind: 'dodge', chance: 0.15 },
      ];
    case 'verses':
      return [{ kind: 'verses' }];
    case 'arcane-certainty':
      return [{ kind: 'arcane-certainty' }];
  }
}

export function buildHeroCombatant(hero: Hero, id = 'hero'): Combatant {
  const definition = classDef(hero.classId);
  const derived = deriveStats({
    classId: hero.classId,
    level: hero.level,
    trained: hero.trained,
    equipment: hero.equipment as Equipment,
  });

  const weapon = hero.equipment.weapon?.weapon ?? { min: 1, max: 2 };

  /*
   * Gear-set bonuses, folded once (gear-sets spec §4).
   *
   * The two that change the *snapshot* — armour and maximum health — are applied here rather
   * than in the resolver, because they are properties of the fighter who walked in rather than
   * of any moment in the fight. Everything else rides along in the bag for `fight()` to read at
   * the point it matters.
   */
  const modifiers = modifiersFor(hero.equipment as Partial<Record<SlotId, Item>>);
  const chosen = openingVerse(modifiers, hero.openingVerse);

  return {
    id,
    name: hero.name,
    kind: definition.name,
    level: hero.level,
    maxHealth: Math.round(derived.health * (1 + modifiers.health)),
    attributes: derived.attributes,
    mainStat: definition.mainStat,
    weapon,
    armour: Math.round(derived.armour * (1 + modifiers.armour)),
    damageReductionCap: definition.drCap,
    procs: procsForClass(hero.classId),
    portrait: definition.portrait,
    ...(modifiers === NO_MODIFIERS ? {} : { modifiers }),
    ...(chosen ? { openingVerse: chosen } : {}),
  };
}

export interface MonsterSpec {
  readonly id: string;
  readonly name: string;
  readonly archetypeId: ArchetypeId;
  readonly level: number;
  /** Multiplies the whole stat budget — dungeons run 1.35, bosses 1.6 (balancing §5). */
  readonly budgetMultiplier?: number;
  /** An extra signature ability, for bosses. */
  readonly extraProc?: CombatProc;
  /** What that ability is called and what it does, announced before the fight. */
  readonly signature?: { readonly label: string; readonly explainer: string };
}

export function buildMonsterCombatant({
  id,
  name,
  archetypeId,
  level,
  budgetMultiplier = 1,
  extraProc,
  signature,
}: MonsterSpec): Combatant {
  const template = archetype(archetypeId);
  const safeLevel = Math.max(1, Math.floor(level));
  const budget = monsterStatBudget(safeLevel) * budgetMultiplier;

  const attributes: Attributes = {
    str: Math.max(1, Math.round(budget * template.weights.str)),
    dex: Math.max(1, Math.round(budget * template.weights.dex)),
    int: Math.max(1, Math.round(budget * template.weights.int)),
    con: Math.max(1, Math.round(budget * template.weights.con)),
    lck: Math.max(1, Math.round(budget * template.weights.lck)),
  };

  const baseWeapon = baselineWeaponDamage(safeLevel);
  const procs: CombatProc[] = [];
  if (template.proc) procs.push(template.proc);
  if (extraProc) procs.push(extraProc);

  return {
    id,
    name,
    kind: template.name,
    level: safeLevel,
    maxHealth: Math.round(attributes.con * (safeLevel + 1) * template.hpFactor),
    attributes,
    mainStat: template.mainStat,
    weapon: {
      min: Math.max(1, Math.round(baseWeapon.min * template.damageFactor)),
      max: Math.max(2, Math.round(baseWeapon.max * template.damageFactor)),
    },
    armour: Math.round(baselineArmour(safeLevel) * template.armourFactor * budgetMultiplier),
    damageReductionCap: template.damageReductionCap,
    procs,
    ...(signature ? { signature } : {}),
  };
}

/**
 * A reference hero at a given level — the yardstick the balance harness measures against.
 *
 * "On curve" means: trained points roughly matching what a day's gold buys at that level, and
 * gear at the level's baseline. Used only by tests and the dev tools, never in the game.
 */
export function buildReferenceCombatant(
  classId: ClassId,
  level: number,
  id: string = classId,
  /** Overrides the class weapon factor. Only the balance solver passes this. */
  weaponFactorOverride?: number,
): Combatant {
  const definition = classDef(classId);
  const safeLevel = Math.max(1, Math.floor(level));

  // Same budget a monster gets, so cross-class comparisons are like-for-like.
  const budget = monsterStatBudget(safeLevel);
  const base = definition.startingStats;

  // Two thirds into the main stat, a third into constitution: the shape of a sane build.
  const attributes: Attributes = {
    ...base,
    [definition.mainStat]: base[definition.mainStat] + Math.round(budget * 0.62),
    con: base.con + Math.round(budget * 0.28),
    lck: base.lck + Math.round(budget * 0.1),
  };

  // The same weapon curve real gear uses, so the harness measures the actual game.
  const baseline = baselineWeaponDamage(safeLevel);
  const average =
    ((baseline.min + baseline.max) / 2) * (weaponFactorOverride ?? definition.weaponDamageFactor);
  const weapon = {
    min: Math.max(1, Math.round(average * (1 - definition.weaponSpread))),
    max: Math.max(2, Math.round(average * (1 + definition.weaponSpread))),
  };

  return {
    id,
    name: definition.name,
    kind: definition.name,
    level: safeLevel,
    maxHealth: Math.round(attributes.con * (safeLevel + 1) * definition.hpFactor),
    attributes,
    mainStat: definition.mainStat,
    weapon,
    armour: Math.round(baselineArmour(safeLevel)),
    damageReductionCap: definition.drCap,
    procs: procsForClass(classId),
    portrait: definition.portrait,
  };
}
