/**
 * Monster archetypes (docs/design/content-plan.md §2, balancing §5).
 *
 * 126 monsters would be unmaintainable as hand-written stat blocks, and they would drift out of
 * balance the moment a curve changed. Instead a monster is a *name, a zone and an archetype*;
 * its numbers are generated from the archetype at fight time, from the player's level.
 *
 * Content authors therefore pick a flavour, not a spreadsheet.
 *
 * Pure data module.
 */

import type { AttributeId } from '@/engine/progression/stats';
import type { CombatProc } from '@/engine/combat/types';

export type ArchetypeId = 'bruiser' | 'skirmisher' | 'caster' | 'tank' | 'swarm';

export interface ArchetypeDef {
  readonly id: ArchetypeId;
  readonly name: string;
  /** How it fights, in one line — shown on the battle nameplate. */
  readonly tell: string;
  /** Which attribute drives its damage. */
  readonly mainStat: AttributeId;
  /** Share of the stat budget going to each attribute; must sum to 1. */
  readonly weights: Readonly<Record<AttributeId, number>>;
  /** HP = CON × (level + 1) × hpFactor, same formula as heroes. */
  readonly hpFactor: number;
  /** Armour multiplier against the level-scaled baseline. */
  readonly armourFactor: number;
  /** Weapon damage multiplier against the level-scaled baseline. */
  readonly damageFactor: number;
  readonly damageReductionCap: number;
  readonly proc?: CombatProc;
}

export const ARCHETYPES: readonly ArchetypeDef[] = [
  {
    id: 'bruiser',
    name: 'Bruiser',
    tell: 'Hits hard, thinks later.',
    mainStat: 'str',
    weights: { str: 0.4, dex: 0.15, int: 0.05, con: 0.3, lck: 0.1 },
    hpFactor: 3.5,
    armourFactor: 0.9,
    damageFactor: 1.15,
    damageReductionCap: 0.3,
  },
  {
    id: 'skirmisher',
    name: 'Skirmisher',
    tell: 'Quick, and hard to pin down.',
    mainStat: 'dex',
    weights: { str: 0.15, dex: 0.4, int: 0.05, con: 0.25, lck: 0.15 },
    hpFactor: 3.0,
    armourFactor: 0.7,
    damageFactor: 1.0,
    damageReductionCap: 0.25,
    proc: { kind: 'dodge', chance: 0.2 },
  },
  {
    id: 'caster',
    name: 'Caster',
    tell: 'Its magic finds you wherever you hide.',
    mainStat: 'int',
    weights: { str: 0.05, dex: 0.1, int: 0.45, con: 0.25, lck: 0.15 },
    hpFactor: 2.5,
    armourFactor: 0.5,
    damageFactor: 1.2,
    damageReductionCap: 0.1,
    proc: { kind: 'arcane-certainty' },
  },
  {
    /**
     * Retuned in Phase 4. The original (hp 5.0 / armour 1.5 / cap 0.45 / block 0.2) stacked
     * four defences on top of each other and produced 23-round average fights that the hero
     * still won 99.7% of the time — a wall you cannot lose to is not tension, it is a wait.
     * It is still comfortably the longest archetype (its 0.5 CON weight keeps it the beefiest
     * thing in the zone) but it now hits hard enough to be worth respecting.
     */
    id: 'tank',
    name: 'Tank',
    tell: 'Wears more iron than it can lift.',
    mainStat: 'str',
    weights: { str: 0.25, dex: 0.05, int: 0.05, con: 0.5, lck: 0.15 },
    hpFactor: 3.2,
    armourFactor: 1.2,
    damageFactor: 1.2,
    damageReductionCap: 0.3,
    proc: { kind: 'block', chance: 0.15 },
  },
  {
    id: 'swarm',
    name: 'Swarm',
    tell: 'There is never just one.',
    mainStat: 'dex',
    weights: { str: 0.2, dex: 0.35, int: 0.05, con: 0.2, lck: 0.2 },
    hpFactor: 2.5,
    armourFactor: 0.6,
    damageFactor: 0.7,
    damageReductionCap: 0.2,
    proc: { kind: 'double-strike', chance: 0.5, damageMultiplier: 0.6 },
  },
];

export const ARCHETYPES_BY_ID: Readonly<Record<ArchetypeId, ArchetypeDef>> = Object.fromEntries(
  ARCHETYPES.map((archetype) => [archetype.id, archetype]),
) as Record<ArchetypeId, ArchetypeDef>;

export function archetype(id: ArchetypeId): ArchetypeDef {
  return ARCHETYPES_BY_ID[id];
}
