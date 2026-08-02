/**
 * The named arms (docs/design/systems/legendaries.md).
 *
 * A legendary is the tier above Set and the answer to a measurement: a class's whole gear chase is
 * **ten set drops long** (`forge.test.ts`, *acquisition converges*), finished near day 45–60
 * against content that runs to day 124. From the halfway mark, no drop could be an upgrade in kind.
 *
 * What makes one is not a bigger statline — `RARITY_FACTOR.legendary` is 1.5, exactly a set
 * piece's — but two **rolled affixes**, drawn from this file's pool. Each affix is a `SetEffect`:
 * the same flat union of named levers the ten gear sets speak, which is why the tier costs the
 * resolver nothing. `modifiersFor()` folds a legendary's affixes into the same `CombatModifiers`
 * bag it folds set bonuses into, at the one place that fold happens, and `fight()` never learns
 * legendaries exist.
 *
 * Because the affixes and their magnitudes roll, the chase does not terminate: there is always a
 * better roll of the item you are already wearing. That is the tier, and the reason it rather than
 * an eleventh gear set is what the measurement called for.
 *
 * Pure data module.
 */

import type { AttributeId } from '@/engine/progression/stats';
import type { ClassId, SlotId } from '@/engine/items/types';
import type { SetEffect } from './gearSets';
import type { IconId } from './icons';

/** How many affixes one legendary carries. `[TUNE]` balancing §22.2. */
export const LEGENDARY_AFFIX_COUNT = 2;

/**
 * The band a magnitude rolls in, and the grain it rolls on.
 *
 * `step` is not decoration. A share rolled as a raw float prints "+6.999999% damage" on a card,
 * and two rolls a hair apart read as different items when they are not. Rolling *on the step*
 * makes the roll space countable, which is also what lets the reforge bench state honestly how
 * many outcomes there are.
 */
export interface MagnitudeBand {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** How a magnitude is written on a card. */
export type AffixUnit = 'percent' | 'points' | 'rounds';

export interface LegendaryAffixDef {
  readonly id: string;
  /** The card line. `{v}` is replaced by the formatted magnitude. */
  readonly text: string;
  readonly unit: AffixUnit;
  readonly band: MagnitudeBand;
  /**
   * The lever this affix pulls, at a rolled magnitude.
   *
   * A function rather than a declarative `{ lever, field }` pair, so the `SetEffect` union is
   * type-checked at the definition site — a misspelled lever or a field that belongs to a
   * different kind is a build error here rather than a silent no-op in the fold.
   */
  readonly effect: (magnitude: number) => SetEffect;
}

/* ── The pool ────────────────────────────────────────────────────────────────────────
 *
 * Sixteen levers, every one already read by `fight()` for the gear sets. Nothing here is a new
 * mechanic, on purpose: a new mechanic is engine work and a balance question of its own, and this
 * slice's job is to make drops matter again rather than to widen the resolver.
 *
 * Bard's verse levers are deliberately absent. They are the one part of the vocabulary that means
 * nothing to four classes out of five, and a legendary that rolls dead weight on a Mage is a bad
 * roll the player cannot read as one.
 */
const AFFIX_LIST = [
  {
    id: 'keen',
    text: '+{v} crit chance',
    unit: 'points',
    band: { min: 2, max: 6, step: 1 },
    effect: (m: number): SetEffect => ({ kind: 'crit', points: m }),
  },
  {
    id: 'cruel',
    text: '+{v} crit damage',
    unit: 'percent',
    band: { min: 0.08, max: 0.22, step: 0.02 },
    effect: (m: number): SetEffect => ({ kind: 'crit-damage', share: m }),
  },
  {
    id: 'heavy',
    text: '+{v} damage',
    unit: 'percent',
    band: { min: 0.03, max: 0.09, step: 0.01 },
    effect: (m: number): SetEffect => ({ kind: 'damage', share: m }),
  },
  {
    id: 'warded',
    text: '+{v} armour',
    unit: 'percent',
    band: { min: 0.06, max: 0.16, step: 0.02 },
    effect: (m: number): SetEffect => ({ kind: 'armour', share: m }),
  },
  {
    id: 'enduring',
    text: '+{v} health',
    unit: 'percent',
    band: { min: 0.05, max: 0.14, step: 0.01 },
    effect: (m: number): SetEffect => ({ kind: 'health', share: m }),
  },
  {
    id: 'bulwark',
    text: '+{v} block',
    unit: 'points',
    band: { min: 2, max: 6, step: 1 },
    effect: (m: number): SetEffect => ({ kind: 'block', points: m }),
  },
  {
    id: 'elusive',
    text: '+{v} dodge',
    unit: 'points',
    band: { min: 2, max: 6, step: 1 },
    effect: (m: number): SetEffect => ({ kind: 'dodge', points: m }),
  },
  {
    id: 'quickened',
    text: '+{v} double-strike',
    unit: 'points',
    band: { min: 2, max: 6, step: 1 },
    effect: (m: number): SetEffect => ({ kind: 'double-strike', points: m }),
  },
  {
    id: 'relentless',
    text: 'Follow-up blows hit {v} harder',
    unit: 'percent',
    band: { min: 0.1, max: 0.3, step: 0.05 },
    effect: (m: number): SetEffect => ({ kind: 'follow-up-damage', share: m }),
  },
  {
    id: 'unbled',
    text: '+{v} damage above three-fifths health',
    unit: 'percent',
    band: { min: 0.05, max: 0.14, step: 0.01 },
    effect: (m: number): SetEffect => ({ kind: 'healthy-damage', share: m, above: 0.6 }),
  },
  {
    id: 'thirsting',
    text: 'Every hit returns {v} of its damage as health',
    unit: 'percent',
    band: { min: 0.02, max: 0.06, step: 0.01 },
    effect: (m: number): SetEffect => ({ kind: 'lifesteal', share: m }),
  },
  {
    id: 'thornclad',
    text: 'A block throws back {v} of what it stopped',
    unit: 'percent',
    band: { min: 0.1, max: 0.28, step: 0.02 },
    effect: (m: number): SetEffect => ({ kind: 'reflect', share: m }),
  },
  {
    id: 'answering',
    text: 'A dodge answers at {v} damage, once a round',
    unit: 'percent',
    band: { min: 0.15, max: 0.4, step: 0.05 },
    effect: (m: number): SetEffect => ({ kind: 'counter', share: m }),
  },
  {
    id: 'sundering',
    text: 'Each crit strips {v} off their damage reduction, three times',
    unit: 'points',
    band: { min: 1, max: 3, step: 1 },
    effect: (m: number): SetEffect => ({ kind: 'shred', points: m, stacks: 3 }),
  },
  {
    id: 'steadfast',
    text: 'Lifts the low end of your damage roll by {v}',
    unit: 'percent',
    band: { min: 0.1, max: 0.3, step: 0.05 },
    effect: (m: number): SetEffect => ({ kind: 'steady', share: m }),
  },
  {
    id: 'finishing',
    text: 'Swing again the first time they fall below {v} health',
    unit: 'percent',
    band: { min: 0.1, max: 0.22, step: 0.02 },
    effect: (m: number): SetEffect => ({ kind: 'execute', threshold: m }),
  },
] as const satisfies readonly LegendaryAffixDef[];

export const LEGENDARY_AFFIXES: readonly LegendaryAffixDef[] = AFFIX_LIST;

export const AFFIXES_BY_ID: Readonly<Record<string, LegendaryAffixDef>> = Object.fromEntries(
  LEGENDARY_AFFIXES.map((affix) => [affix.id, affix]),
);

export function legendaryAffix(id: string): LegendaryAffixDef | undefined {
  return AFFIXES_BY_ID[id];
}

/* ── The eighteen ────────────────────────────────────────────────────────────────── */

export interface LegendaryDef {
  readonly id: string;
  readonly name: string;
  readonly slot: SlotId;
  /** Weapons and offhands are always class-specific (items spec §1). Nothing else is. */
  readonly classId?: ClassId;
  readonly iconId: IconId;
  /** One line, on the card. What it *is*, not what it does — the affixes say that. */
  readonly flavor: string;
  /**
   * Which attributes the statline leans on, in what proportion — the same authored-shape,
   * rolled-size bargain a set piece makes (`gear-sets.md` §1).
   */
  readonly weights: Partial<Record<AttributeId, number>>;
  /**
   * The affixes this legendary can roll, by id. At least `LEGENDARY_AFFIX_COUNT` + 2, so a
   * reforge has somewhere to go — a pool of exactly two makes the bench a magnitude re-roll
   * wearing a costume.
   */
  readonly affixPool: readonly string[];
}

const LEGENDARY_LIST = [
  /* ── The eight anyone can wear ─────────────────────────────────────────────────── */
  {
    id: 'crown-of-the-last-hour',
    name: 'Crown of the Last Hour',
    slot: 'helmet',
    iconId: 'helm',
    flavor: 'Worn by whoever was still standing when the court adjourned.',
    weights: { int: 3, con: 2, lck: 1 },
    affixPool: ['keen', 'cruel', 'warded', 'enduring', 'sundering', 'finishing'],
  },
  {
    id: 'the-ninefold-coat',
    name: 'The Ninefold Coat',
    slot: 'chest',
    iconId: 'chestplate',
    flavor: 'Nine layers, nine smiths, one very long argument.',
    weights: { con: 4, str: 2 },
    affixPool: ['warded', 'enduring', 'bulwark', 'thornclad', 'steadfast', 'heavy'],
  },
  {
    id: 'the-unquiet-hands',
    name: 'The Unquiet Hands',
    slot: 'gloves',
    iconId: 'gloves',
    flavor: 'They finish the strike before you have decided on it.',
    weights: { dex: 4, str: 2 },
    affixPool: ['quickened', 'relentless', 'keen', 'answering', 'heavy', 'sundering'],
  },
  {
    id: 'league-eaters',
    name: 'League-Eaters',
    slot: 'boots',
    iconId: 'boots',
    flavor: 'Odo has offered for them four times. They are not for sale.',
    weights: { dex: 3, con: 2, lck: 1 },
    affixPool: ['elusive', 'answering', 'quickened', 'enduring', 'unbled', 'steadfast'],
  },
  {
    id: 'the-tithe-belt',
    name: 'The Tithe Belt',
    slot: 'belt',
    iconId: 'belt',
    flavor: 'Every buckle-hole is a debt somebody stopped being able to pay.',
    weights: { con: 3, str: 2, lck: 1 },
    affixPool: ['thirsting', 'enduring', 'warded', 'unbled', 'bulwark', 'finishing'],
  },
  {
    id: 'the-long-regents-chain',
    name: "The Long Regent's Chain",
    slot: 'amulet',
    iconId: 'amulet',
    flavor: 'He ruled for sixty years on behalf of a king who was never born.',
    weights: { int: 4, lck: 2 },
    affixPool: ['cruel', 'keen', 'sundering', 'heavy', 'finishing', 'steadfast'],
  },
  {
    id: 'the-assessors-ring',
    name: "The Assessor's Ring",
    slot: 'ring',
    iconId: 'ring',
    flavor: 'It weighs what you are worth. It is never generous and it is never wrong.',
    weights: { lck: 4, int: 2 },
    affixPool: ['keen', 'cruel', 'thirsting', 'elusive', 'unbled', 'relentless'],
  },
  {
    id: 'the-last-ingot',
    name: 'The Last Ingot',
    slot: 'trinket',
    iconId: 'trinket',
    flavor: 'What the Sundered Anvil had left when it stopped. Still warm.',
    weights: { str: 2, dex: 2, int: 2 },
    affixPool: ['heavy', 'steadfast', 'sundering', 'thirsting', 'warded', 'cruel'],
  },

  /* ── Five weapons, one per class ───────────────────────────────────────────────── */
  {
    id: 'oathbreaker',
    name: 'Oathbreaker',
    slot: 'weapon',
    classId: 'warrior',
    iconId: 'sword',
    flavor: 'It was sworn on, once, by someone who meant it at the time.',
    weights: { str: 5, con: 2 },
    affixPool: ['heavy', 'cruel', 'sundering', 'finishing', 'steadfast', 'thirsting'],
  },
  {
    id: 'the-hundred-year-note',
    name: 'The Hundred-Year Note',
    slot: 'weapon',
    classId: 'bard',
    iconId: 'lute',
    flavor: 'Struck once at the coronation. Nobody has heard it stop.',
    weights: { dex: 4, int: 3 },
    affixPool: ['keen', 'relentless', 'quickened', 'cruel', 'unbled', 'answering'],
  },
  {
    id: 'the-quiet-argument',
    name: 'The Quiet Argument',
    slot: 'weapon',
    classId: 'mage',
    iconId: 'staff',
    flavor: 'It does not raise its voice and it has never lost.',
    weights: { int: 5, lck: 2 },
    affixPool: ['heavy', 'cruel', 'steadfast', 'sundering', 'finishing', 'keen'],
  },
  {
    id: 'the-long-answer',
    name: 'The Long Answer',
    slot: 'weapon',
    classId: 'hunter',
    iconId: 'bow',
    flavor: 'Drawn in Starfall Barrens, loosed somewhere over the horizon.',
    weights: { dex: 5, lck: 2 },
    affixPool: ['keen', 'cruel', 'heavy', 'unbled', 'steadfast', 'relentless'],
  },
  {
    id: 'the-third-question',
    name: 'The Third Question',
    slot: 'weapon',
    classId: 'swashbuckler',
    iconId: 'rapier',
    flavor: 'The first two are courtesies. Nobody is asked the third twice.',
    weights: { dex: 5, str: 2 },
    affixPool: ['quickened', 'relentless', 'keen', 'answering', 'finishing', 'elusive'],
  },

  /* ── Five offhands, one per class ──────────────────────────────────────────────── */
  {
    id: 'the-adjourned-door',
    name: 'The Adjourned Door',
    slot: 'offhand',
    classId: 'warrior',
    iconId: 'shield',
    flavor: 'It held the Sunless Court shut for a century. It is in no hurry.',
    weights: { con: 4, str: 2 },
    affixPool: ['bulwark', 'thornclad', 'warded', 'enduring', 'steadfast', 'answering'],
  },
  {
    id: 'the-unfinished-hymnal',
    name: 'The Unfinished Hymnal',
    slot: 'offhand',
    classId: 'bard',
    iconId: 'songbook',
    flavor: 'The last page is blank. It has always been the next one.',
    weights: { int: 4, dex: 2 },
    affixPool: ['keen', 'unbled', 'enduring', 'relentless', 'thirsting', 'elusive'],
  },
  {
    id: 'the-drowned-lens',
    name: 'The Drowned Lens',
    slot: 'offhand',
    classId: 'mage',
    iconId: 'orb',
    flavor: 'Whatever it was looking at when the tide came in, it is still looking at.',
    weights: { int: 4, lck: 2 },
    affixPool: ['cruel', 'sundering', 'steadfast', 'heavy', 'finishing', 'warded'],
  },
  {
    id: 'the-inventory',
    name: 'The Inventory',
    slot: 'offhand',
    classId: 'hunter',
    iconId: 'quiver',
    flavor: 'One shaft for every name the Assessor wrote down.',
    weights: { dex: 4, lck: 2 },
    affixPool: ['keen', 'cruel', 'relentless', 'unbled', 'quickened', 'heavy'],
  },
  {
    id: 'the-courtesy',
    name: 'The Courtesy',
    slot: 'offhand',
    classId: 'swashbuckler',
    iconId: 'dagger',
    flavor: 'Held low, out of the way, entirely by accident.',
    weights: { dex: 4, str: 2 },
    affixPool: ['answering', 'elusive', 'quickened', 'relentless', 'keen', 'thirsting'],
  },
] as const satisfies readonly LegendaryDef[];

export const LEGENDARIES: readonly LegendaryDef[] = LEGENDARY_LIST;

export const LEGENDARIES_BY_ID: Readonly<Record<string, LegendaryDef>> = Object.fromEntries(
  LEGENDARIES.map((entry) => [entry.id, entry]),
);

export function legendaryDef(id: string): LegendaryDef | undefined {
  return LEGENDARIES_BY_ID[id];
}

/**
 * Which legendaries a hero of this class could ever be handed.
 *
 * Weapons and offhands are class-locked at the single choke point the items spec names (§5), so
 * they are filtered here rather than at the drop site — one place to be wrong instead of four.
 */
export function legendariesFor(classId: ClassId): readonly LegendaryDef[] {
  return LEGENDARIES.filter((entry) => entry.classId === undefined || entry.classId === classId);
}

/** How a rolled magnitude is written, given its affix's unit. */
export function formatMagnitude(unit: AffixUnit, magnitude: number): string {
  switch (unit) {
    case 'percent':
      return `${Math.round(magnitude * 100)}%`;
    case 'points':
      return `${magnitude}%`;
    case 'rounds':
      return magnitude === 1 ? '1 round' : `${magnitude} rounds`;
  }
}

/** The card line for one rolled affix. */
export function affixLine(id: string, magnitude: number): string {
  const definition = legendaryAffix(id);
  if (!definition) return '';
  return definition.text.replace('{v}', formatMagnitude(definition.unit, magnitude));
}

/**
 * How many distinct magnitudes an affix can roll — `(max - min) / step + 1`.
 *
 * The reforge bench prints the size of the space it is re-rolling into, because "odds always
 * visible" (rule 6) has to mean something at a bench whose output is not a rarity.
 */
export function magnitudeSteps(band: MagnitudeBand): number {
  return Math.round((band.max - band.min) / band.step) + 1;
}
