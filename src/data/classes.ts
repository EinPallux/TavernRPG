/**
 * The five classes (docs/design/systems/characters-and-classes.md §3).
 *
 * Each class is a main stat, an HP factor, an armour cap and **one signature proc**. The procs
 * are *declared* here as data; Phase 3's combat engine implements them. Keeping them as data
 * means the character screen can already explain a class truthfully without any combat code.
 *
 * Pure data module.
 */

import type { AttributeId, Attributes } from '@/engine/progression/stats';
import type { ClassId } from '@/engine/items/types';

export type ProcKind = 'block' | 'dodge' | 'double-strike' | 'verses' | 'arcane-certainty';

export interface ProcDef {
  readonly kind: ProcKind;
  readonly name: string;
  /** Player-facing explanation; shown on the character screen and class cards. */
  readonly description: string;
  /** Primary chance, 0–1, where the proc has one. */
  readonly chance?: number;
  /** Damage multiplier for procs that add a hit. */
  readonly damageMultiplier?: number;
}

export interface ClassDef {
  readonly id: ClassId;
  readonly name: string;
  /** The class's tagline in the world's own voice. */
  readonly epithet: string;
  readonly portrait: string;
  readonly mainStat: AttributeId;
  /** HP = CON × (level + 1) × hpFactor (balancing §4). */
  readonly hpFactor: number;
  /** Maximum share of incoming damage armour can absorb (balancing §4). */
  readonly drCap: number;
  /**
   * Weapon damage relative to the level baseline (balancing §8).
   *
   * This is what pays for the survivability spread: a Warrior swings a one-hander behind a
   * shield and hits softly; a Mage carries a two-handed staff and hits like a falling tree.
   * Without it, HP factors of 5.0 versus 2.5 make the tanky classes strictly better —
   * measured, not guessed (see the balance harness).
   */
  readonly weaponDamageFactor: number;
  /** Spread of the damage band, ±. Mages swing wildest (combat spec §2). */
  readonly weaponSpread: number;
  readonly proc: ProcDef;
  readonly startingStats: Attributes;
  /** What playing it feels like — the honest pitch on the creation card. */
  readonly feel: string;
  /** Weapon family names, for the creation card. */
  readonly weaponFamily: string;
  readonly offhandFamily: string;
  /** Rough difficulty for a new player, 1 (forgiving) – 3 (punishing). */
  readonly demand: 1 | 2 | 3;
}

export const CLASSES: readonly ClassDef[] = [
  {
    id: 'warrior',
    name: 'Warrior',
    epithet: 'The Wall of Aldenvale',
    portrait: '/assets/classes/Warrior.webp',
    mainStat: 'str',
    hpFactor: 4.2,
    drCap: 0.35,
    weaponDamageFactor: 0.935,
    weaponSpread: 0.2,
    proc: {
      kind: 'block',
      name: 'Shield Wall',
      description: 'Blocks 25% of incoming hits outright. Magic ignores it.',
      chance: 0.25,
    },
    startingStats: { str: 14, dex: 8, int: 6, con: 12, lck: 8 },
    feel: 'Slow, unkillable, honest damage. The most forgiving way to learn the game.',
    weaponFamily: 'Swords, axes and maces',
    offhandFamily: 'Shields',
    demand: 1,
  },
  {
    id: 'bard',
    name: 'Bard',
    epithet: 'The Dawnchorus Duelist',
    portrait: '/assets/classes/Bard.webp',
    mainStat: 'int',
    hpFactor: 3.6,
    drCap: 0.22,
    weaponDamageFactor: 1.382,
    weaponSpread: 0.25,
    proc: {
      kind: 'verses',
      name: 'Verses',
      description:
        'Opens with a random Verse and changes it every fourth round: more damage, more guard, or an enemy that keeps missing.',
    },
    startingStats: { str: 7, dex: 9, int: 14, con: 10, lck: 8 },
    feel: 'Swingy and musical. Every fight has a rhythm you did not choose but can ride.',
    weaponFamily: 'Lutes, horns and drums',
    offhandFamily: 'Songbooks',
    demand: 2,
  },
  {
    id: 'mage',
    name: 'Mage',
    epithet: 'The Emberweaver',
    portrait: '/assets/classes/Mage.webp',
    mainStat: 'int',
    hpFactor: 3.4,
    drCap: 0.15,
    weaponDamageFactor: 1.99,
    weaponSpread: 0.45,
    proc: {
      kind: 'arcane-certainty',
      name: 'Arcane Certainty',
      description:
        'Blocks and dodges work far less well against your magic — but your damage swings wildly from one strike to the next.',
    },
    startingStats: { str: 6, dex: 8, int: 16, con: 8, lck: 10 },
    feel: 'The highest highs and the thinnest skin. Punishes neglected gear hardest.',
    weaponFamily: 'Staves, wands and rods',
    offhandFamily: 'Orbs',
    demand: 3,
  },
  {
    id: 'hunter',
    name: 'Hunter',
    epithet: 'The Silverpine Shadow',
    portrait: '/assets/classes/Hunter.webp',
    mainStat: 'dex',
    hpFactor: 3.6,
    drCap: 0.25,
    weaponDamageFactor: 1.03,
    weaponSpread: 0.22,
    proc: {
      kind: 'dodge',
      name: 'Windstep',
      description: 'Slips 40% of incoming hits entirely. Magic still finds you.',
      chance: 0.4,
    },
    startingStats: { str: 8, dex: 15, int: 7, con: 10, lck: 10 },
    feel: 'Death by a thousand misses — theirs. Steady crits, and the odd unlucky streak.',
    weaponFamily: 'Bows and crossbows',
    offhandFamily: 'Quivers',
    demand: 2,
  },
  {
    id: 'swashbuckler',
    name: 'Swashbuckler',
    epithet: 'The Corsair of Emberhollow',
    portrait: '/assets/classes/Swashbuckler.webp',
    mainStat: 'dex',
    hpFactor: 3.8,
    drCap: 0.25,
    weaponDamageFactor: 0.918,
    weaponSpread: 0.2,
    proc: {
      kind: 'double-strike',
      name: 'Flurry',
      description: 'Every attack tries for a second strike: 60% chance at 75% damage.',
      chance: 0.6,
      damageMultiplier: 0.75,
    },
    startingStats: { str: 9, dex: 14, int: 7, con: 10, lck: 10 },
    feel: 'Fast, flashy, relentless pressure. The class the battle animations show off.',
    weaponFamily: 'Sabers and rapiers',
    offhandFamily: 'Parry daggers',
    demand: 2,
  },
];

export const CLASSES_BY_ID: Readonly<Record<ClassId, ClassDef>> = Object.fromEntries(
  CLASSES.map((definition) => [definition.id, definition]),
) as Record<ClassId, ClassDef>;

export function classDef(id: ClassId): ClassDef {
  return CLASSES_BY_ID[id];
}
