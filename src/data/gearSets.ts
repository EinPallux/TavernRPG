/**
 * The ten launch gear sets (docs/design/systems/gear-sets.md §2).
 *
 * Two per class, five pieces each — helm, chest, gloves, boots, belt — and the visible long-term
 * chase. Everything else in the game hands out *generated* gear whose statline is rolled; a set
 * piece is the one item type whose shape is **authored**, because a set is a build and a build
 * cannot be a shrug of the dice.
 *
 * The bonuses are declared here as **data the engine resolves**, not as code. Thirty bonuses
 * across ten sets is far too many to write as thirty branches, and most of them are numbers
 * anyway: `+8% damage` and `+6% crit` are the same kind of thing said twice. So a bonus is a list
 * of `SetEffect`s, the engine folds them into one `CombatModifiers` bag at build time, and the
 * resolver reads that bag at the handful of places it matters. Adding an eleventh set is then a
 * data change; only a genuinely *new mechanic* costs engine work.
 *
 * Balance stance (spec §3): the 5-piece bonuses are strong on purpose — they are weeks of chase —
 * but every one of them is bounded, by a once-a-battle limit or a stack cap. The harness asserts
 * a full set keeps mirror win-rates inside 42–58%.
 *
 * Pure data module.
 */

import type { AttributeId } from '@/engine/progression/stats';
import type { ClassId, SlotId } from '@/engine/items/types';
import type { VerseId } from '@/engine/combat/types';
import type { IconId } from './icons';

/** The five slots a set covers. Weapons and jewellery are never set pieces (spec §1). */
export const SET_SLOTS = ['helmet', 'chest', 'gloves', 'boots', 'belt'] as const;
export type SetSlot = (typeof SET_SLOTS)[number];
export const SET_PIECES = SET_SLOTS.length;

export function isSetSlot(slot: SlotId): slot is SetSlot {
  return (SET_SLOTS as readonly SlotId[]).includes(slot);
}

/** Bonuses land at two, four and five pieces (spec §1). */
export const BONUS_THRESHOLDS = [2, 4, 5] as const;
export type BonusThreshold = (typeof BONUS_THRESHOLDS)[number];

/**
 * One effect a set bonus grants.
 *
 * Deliberately a flat union of *named levers* rather than a scripting language. Every member here
 * corresponds to exactly one place in `fight()` that reads it, which is what keeps "what does
 * this set actually do?" answerable by reading one file instead of tracing a callback.
 */
export type SetEffect =
  /* ── Plain numbers: folded into the modifier bag and read where they apply ── */
  /** Multiplies all outgoing damage. */
  | { readonly kind: 'damage'; readonly share: number }
  /** Multiplies total armour. */
  | { readonly kind: 'armour'; readonly share: number }
  /** Multiplies maximum health. */
  | { readonly kind: 'health'; readonly share: number }
  /** Percentage points onto the crit chance. */
  | { readonly kind: 'crit'; readonly points: number }
  /** Added to the crit multiplier — `0.15` turns ×2.0 into ×2.15. */
  | { readonly kind: 'crit-damage'; readonly share: number }
  /** Percentage points onto block, dodge or the double-strike roll. */
  | { readonly kind: 'block'; readonly points: number }
  | { readonly kind: 'dodge'; readonly points: number }
  | { readonly kind: 'double-strike'; readonly points: number }
  /** Multiplies the damage of a double-strike's follow-up specifically. */
  | { readonly kind: 'follow-up-damage'; readonly share: number }
  /** Extra damage while above a health share — the "fresh" bonus. */
  | { readonly kind: 'healthy-damage'; readonly share: number; readonly above: number }

  /* ── Verse levers (Bard sets) ── */
  /** Verses run this many rounds longer before they re-roll. */
  | { readonly kind: 'verse-length'; readonly rounds: number }
  /** Extra damage while any Verse is playing. */
  | { readonly kind: 'verse-damage'; readonly share: number }
  /** Heal this share of max health every time the Verse changes. */
  | { readonly kind: 'verse-heal'; readonly share: number }
  /** Percentage points onto Discord's miss chance. */
  | { readonly kind: 'discord'; readonly points: number }
  /** The player picks which Verse opens the fight, instead of rolling it. */
  | { readonly kind: 'choose-verse' }

  /* ── New mechanics: each is its own branch in the resolver ── */
  /** A block throws back this share of the damage it prevented. */
  | { readonly kind: 'reflect'; readonly share: number }
  /** Every hit returns this share of its damage as health. */
  | { readonly kind: 'lifesteal'; readonly share: number }
  /** The first drop below `threshold` health grants a shield worth `share` of max health. */
  | { readonly kind: 'absorb'; readonly threshold: number; readonly share: number }
  /** Each dodge adds this to the next hit, up to `stacks` times. */
  | { readonly kind: 'dodge-fury'; readonly share: number; readonly stacks: number }
  /** A dodge answers with a free hit at this share of damage, at most once a round. */
  | { readonly kind: 'counter'; readonly share: number }
  /** Each crit strips this many points off the enemy's damage-reduction cap, to `stacks`. */
  | { readonly kind: 'shred'; readonly points: number; readonly stacks: number }
  /** A double-strike may chain a third blow. */
  | { readonly kind: 'third-strike'; readonly chance: number; readonly share: number }
  /** The first hit of the battle crits, guaranteed. */
  | { readonly kind: 'first-strike-crit' }
  /** Lifts the bottom of the damage roll toward its average — a consistency capstone. */
  | { readonly kind: 'steady'; readonly share: number }
  /** The first time the enemy drops below `threshold`, swing again immediately. */
  | { readonly kind: 'execute'; readonly threshold: number };

export interface SetBonusDef {
  readonly pieces: BonusThreshold;
  /** One line, shown on the collections page and in the paperdoll hover. */
  readonly text: string;
  readonly effects: readonly SetEffect[];
}

export interface SetPieceDef {
  readonly slot: SetSlot;
  readonly name: string;
  /**
   * The curated statline's shape: which attributes the piece carries, and in what proportion.
   * Scaled to the player's level at acquisition like all loot (spec §1) — the *shape* is
   * authored, the size is not.
   */
  readonly weights: Partial<Record<AttributeId, number>>;
}

export interface GearSetDef {
  readonly id: string;
  readonly classId: ClassId;
  readonly name: string;
  /** One line of theme, for the collections card. */
  readonly theme: string;
  readonly sigil: IconId;
  readonly pieces: readonly SetPieceDef[];
  readonly bonuses: readonly SetBonusDef[];
  /** Where it turns up, in the world's own words — the collections page's source hint. */
  readonly source: string;
}

/* ── Warrior ─────────────────────────────────────────────────────────────────────── */

const OATHSWORN: GearSetDef = {
  id: 'oathsworn-bulwark',
  classId: 'warrior',
  name: 'Oathsworn Bulwark',
  theme: 'The tower-shield honour guard, still standing where they were told to.',
  sigil: 'shield',
  source: 'Barrowdeep Crypt, floors 4 and deeper.',
  pieces: [
    { slot: 'helmet', name: 'Oathsworn Greathelm', weights: { con: 0.6, str: 0.4 } },
    { slot: 'chest', name: 'Oathsworn Cuirass', weights: { con: 0.7, str: 0.3 } },
    { slot: 'gloves', name: 'Oathsworn Gauntlets', weights: { str: 0.6, con: 0.4 } },
    { slot: 'boots', name: 'Oathsworn Sabatons', weights: { con: 0.65, str: 0.35 } },
    { slot: 'belt', name: 'Oathsworn Girdle', weights: { con: 0.55, str: 0.3, lck: 0.15 } },
  ],
  bonuses: [
    { pieces: 2, text: '+10% armour.', effects: [{ kind: 'armour', share: 0.1 }] },
    {
      pieces: 4,
      text: 'A block throws back 15% of the damage it stopped.',
      effects: [{ kind: 'reflect', share: 0.15 }],
    },
    {
      pieces: 5,
      text: 'Shield Wall rises from 25% to 33%.',
      effects: [{ kind: 'block', points: 0.08 }],
    },
  ],
};

const WOLFBLOOD: GearSetDef = {
  id: 'wolfblood-warplate',
  classId: 'warrior',
  name: 'Wolfblood Warplate',
  theme: 'Berserk wolf-cult plate. It has been bitten and it bites back.',
  sigil: 'axe',
  source: 'The Rat Cellars, floors 4 and deeper.',
  pieces: [
    { slot: 'helmet', name: 'Wolfblood Snarlhelm', weights: { str: 0.7, lck: 0.3 } },
    { slot: 'chest', name: 'Wolfblood Harness', weights: { str: 0.6, con: 0.4 } },
    { slot: 'gloves', name: 'Wolfblood Claws', weights: { str: 0.75, lck: 0.25 } },
    { slot: 'boots', name: 'Wolfblood Treads', weights: { str: 0.5, con: 0.3, lck: 0.2 } },
    { slot: 'belt', name: 'Wolfblood Cinch', weights: { str: 0.55, lck: 0.45 } },
  ],
  bonuses: [
    { pieces: 2, text: '+8% damage.', effects: [{ kind: 'damage', share: 0.08 }] },
    { pieces: 4, text: '+10% critical damage.', effects: [{ kind: 'crit-damage', share: 0.1 }] },
    {
      pieces: 5,
      text: 'The first time you drive them under a quarter health, swing again at once.',
      effects: [{ kind: 'execute', threshold: 0.25 }],
    },
  ],
};

/* ── Bard ────────────────────────────────────────────────────────────────────────── */

const MAESTRO: GearSetDef = {
  id: 'maestros-ensemble',
  classId: 'bard',
  name: "Maestro's Ensemble",
  theme: 'Concert-hall finery, worn somewhere considerably less clean.',
  sigil: 'songbook',
  source: 'Barrowdeep Crypt, floors 4 and deeper.',
  pieces: [
    { slot: 'helmet', name: "Maestro's Circlet", weights: { int: 0.7, con: 0.3 } },
    { slot: 'chest', name: "Maestro's Frock Coat", weights: { int: 0.6, con: 0.4 } },
    { slot: 'gloves', name: "Maestro's Gloves", weights: { int: 0.75, dex: 0.25 } },
    { slot: 'boots', name: "Maestro's Buckled Shoes", weights: { int: 0.55, con: 0.45 } },
    { slot: 'belt', name: "Maestro's Sash", weights: { int: 0.6, con: 0.25, lck: 0.15 } },
  ],
  bonuses: [
    { pieces: 2, text: 'Verses last a round longer.', effects: [{ kind: 'verse-length', rounds: 1 }] },
    {
      pieces: 4,
      text: '+12% damage while any Verse is playing.',
      effects: [{ kind: 'verse-damage', share: 0.12 }],
    },
    {
      pieces: 5,
      text: 'Choose the Verse you open with, instead of taking what the room gives you.',
      effects: [{ kind: 'choose-verse' }],
    },
  ],
};

const DAWNCHORUS: GearSetDef = {
  id: 'dawnchorus-attire',
  classId: 'bard',
  name: 'Dawnchorus Attire',
  theme: 'Festival silks cut for the hour before sunrise.',
  sigil: 'horn',
  source: 'The Rat Cellars, floors 4 and deeper.',
  pieces: [
    { slot: 'helmet', name: 'Dawnchorus Chaplet', weights: { int: 0.65, lck: 0.35 } },
    { slot: 'chest', name: 'Dawnchorus Robe', weights: { int: 0.6, con: 0.4 } },
    { slot: 'gloves', name: 'Dawnchorus Wraps', weights: { int: 0.55, lck: 0.45 } },
    { slot: 'boots', name: 'Dawnchorus Slippers', weights: { dex: 0.5, int: 0.5 } },
    { slot: 'belt', name: 'Dawnchorus Ribbon', weights: { lck: 0.6, int: 0.4 } },
  ],
  bonuses: [
    { pieces: 2, text: '+6% critical chance.', effects: [{ kind: 'crit', points: 0.06 }] },
    {
      pieces: 4,
      text: 'Every change of Verse mends 6% of your health.',
      effects: [{ kind: 'verse-heal', share: 0.06 }],
    },
    {
      pieces: 5,
      text: 'Discord throws them off 30% of the time instead of 20%.',
      effects: [{ kind: 'discord', points: 0.1 }],
    },
  ],
};

/* ── Mage ────────────────────────────────────────────────────────────────────────── */

const EMBERWEAVE: GearSetDef = {
  id: 'emberweave-vestments',
  classId: 'mage',
  name: 'Emberweave Vestments',
  theme: 'Scholar robes that have never quite stopped smouldering.',
  sigil: 'orb',
  source: 'Emberdeep Foundry, floors 4 and deeper.',
  pieces: [
    { slot: 'helmet', name: 'Emberweave Hood', weights: { int: 0.7, lck: 0.3 } },
    { slot: 'chest', name: 'Emberweave Robe', weights: { int: 0.65, con: 0.35 } },
    { slot: 'gloves', name: 'Emberweave Handwraps', weights: { int: 0.8, lck: 0.2 } },
    { slot: 'boots', name: 'Emberweave Sandals', weights: { int: 0.6, con: 0.4 } },
    { slot: 'belt', name: 'Emberweave Cord', weights: { int: 0.55, lck: 0.45 } },
  ],
  bonuses: [
    { pieces: 2, text: '+8% damage.', effects: [{ kind: 'damage', share: 0.08 }] },
    { pieces: 4, text: '+15% critical damage.', effects: [{ kind: 'crit-damage', share: 0.15 }] },
    {
      pieces: 5,
      text: 'Your worst rolls stop being your worst rolls — the low end of every swing lifts.',
      effects: [{ kind: 'steady', share: 0.6 }],
    },
  ],
};

const TIDECALLER: GearSetDef = {
  id: 'tidecallers-regalia',
  classId: 'mage',
  name: "Tidecaller's Regalia",
  theme: 'Vestments from a chapel the sea took, and did not entirely keep.',
  sigil: 'wand',
  source: 'Barrowdeep Crypt, floors 4 and deeper.',
  pieces: [
    { slot: 'helmet', name: "Tidecaller's Mitre", weights: { int: 0.6, con: 0.4 } },
    { slot: 'chest', name: "Tidecaller's Chasuble", weights: { con: 0.55, int: 0.45 } },
    { slot: 'gloves', name: "Tidecaller's Cuffs", weights: { int: 0.7, con: 0.3 } },
    { slot: 'boots', name: "Tidecaller's Waders", weights: { con: 0.6, int: 0.4 } },
    { slot: 'belt', name: "Tidecaller's Rope", weights: { int: 0.5, con: 0.5 } },
  ],
  bonuses: [
    { pieces: 2, text: '+10% maximum health.', effects: [{ kind: 'health', share: 0.1 }] },
    {
      pieces: 4,
      text: 'A tenth of the damage you deal comes back to you.',
      effects: [{ kind: 'lifesteal', share: 0.1 }],
    },
    {
      pieces: 5,
      text: 'The first time you fall under a third health, the tide shields you for a quarter of it.',
      effects: [{ kind: 'absorb', threshold: 0.3, share: 0.25 }],
    },
  ],
};

/* ── Hunter ──────────────────────────────────────────────────────────────────────── */

const THORNSTALKER: GearSetDef = {
  id: 'thornstalkers-guise',
  classId: 'hunter',
  name: "Thornstalker's Guise",
  theme: 'Briar-laced leathers. The briars are not decorative.',
  sigil: 'quiver',
  source: 'The Rat Cellars, floors 4 and deeper.',
  pieces: [
    { slot: 'helmet', name: "Thornstalker's Hood", weights: { dex: 0.7, con: 0.3 } },
    { slot: 'chest', name: "Thornstalker's Jerkin", weights: { dex: 0.55, con: 0.45 } },
    { slot: 'gloves', name: "Thornstalker's Grips", weights: { dex: 0.8, lck: 0.2 } },
    { slot: 'boots', name: "Thornstalker's Striders", weights: { dex: 0.65, con: 0.35 } },
    { slot: 'belt', name: "Thornstalker's Baldric", weights: { dex: 0.6, con: 0.4 } },
  ],
  bonuses: [
    { pieces: 2, text: '+5% dodge.', effects: [{ kind: 'dodge', points: 0.05 }] },
    {
      pieces: 4,
      text: 'Every dodge sharpens your next hit by 10%, up to three times.',
      effects: [{ kind: 'dodge-fury', share: 0.1, stacks: 3 }],
    },
    {
      pieces: 5,
      text: 'A dodge answers with a free shot at half damage, once a round.',
      effects: [{ kind: 'counter', share: 0.5 }],
    },
  ],
};

const GALEWIND: GearSetDef = {
  id: 'galewind-harness',
  classId: 'hunter',
  name: 'Galewind Harness',
  theme: 'Sky-courier straps, built for people who are never on the ground long.',
  sigil: 'bow',
  source: 'Emberdeep Foundry, floors 4 and deeper.',
  pieces: [
    { slot: 'helmet', name: 'Galewind Visor', weights: { dex: 0.65, lck: 0.35 } },
    { slot: 'chest', name: 'Galewind Vest', weights: { dex: 0.6, con: 0.4 } },
    { slot: 'gloves', name: 'Galewind Bracers', weights: { dex: 0.7, lck: 0.3 } },
    { slot: 'boots', name: 'Galewind Runners', weights: { dex: 0.75, lck: 0.25 } },
    { slot: 'belt', name: 'Galewind Harness Strap', weights: { lck: 0.55, dex: 0.45 } },
  ],
  bonuses: [
    { pieces: 2, text: '+6% critical chance.', effects: [{ kind: 'crit', points: 0.06 }] },
    { pieces: 4, text: '+12% critical damage.', effects: [{ kind: 'crit-damage', share: 0.12 }] },
    {
      pieces: 5,
      text: 'Every critical hit peels 5 points off their armour, up to four times.',
      effects: [{ kind: 'shred', points: 0.05, stacks: 4 }],
    },
  ],
};

/* ── Swashbuckler ────────────────────────────────────────────────────────────────── */

const CORSAIR: GearSetDef = {
  id: 'corsair-kings-finery',
  classId: 'swashbuckler',
  name: "Corsair King's Finery",
  theme: 'A captain’s regalia, in the loudest possible taste.',
  sigil: 'rapier',
  source: 'Emberdeep Foundry, floors 4 and deeper.',
  pieces: [
    { slot: 'helmet', name: "Corsair King's Tricorn", weights: { dex: 0.6, lck: 0.4 } },
    { slot: 'chest', name: "Corsair King's Coat", weights: { dex: 0.55, con: 0.45 } },
    { slot: 'gloves', name: "Corsair King's Cuffs", weights: { dex: 0.7, lck: 0.3 } },
    { slot: 'boots', name: "Corsair King's Boots", weights: { dex: 0.65, lck: 0.35 } },
    { slot: 'belt', name: "Corsair King's Sash", weights: { lck: 0.6, dex: 0.4 } },
  ],
  bonuses: [
    {
      pieces: 2,
      text: 'Flurry comes up 68% of the time instead of 60%.',
      effects: [{ kind: 'double-strike', points: 0.08 }],
    },
    {
      pieces: 4,
      text: 'Flurry strikes hit 15% harder.',
      effects: [{ kind: 'follow-up-damage', share: 0.15 }],
    },
    {
      pieces: 5,
      text: 'A flurry can carry into a third strike — 35% of the time, at half damage.',
      effects: [{ kind: 'third-strike', chance: 0.35, share: 0.5 }],
    },
  ],
};

const NIGHTTIDE: GearSetDef = {
  id: 'nighttide-silks',
  classId: 'swashbuckler',
  name: 'Nighttide Silks',
  theme: 'Moonlit-heist blacks. Nobody has ever seen them arrive.',
  sigil: 'dagger',
  source: 'The Rat Cellars, floors 4 and deeper.',
  pieces: [
    { slot: 'helmet', name: 'Nighttide Mask', weights: { dex: 0.7, con: 0.3 } },
    { slot: 'chest', name: 'Nighttide Doublet', weights: { con: 0.5, dex: 0.5 } },
    { slot: 'gloves', name: 'Nighttide Gloves', weights: { dex: 0.75, con: 0.25 } },
    { slot: 'boots', name: 'Nighttide Slippers', weights: { dex: 0.6, con: 0.4 } },
    { slot: 'belt', name: 'Nighttide Cord', weights: { dex: 0.55, con: 0.45 } },
  ],
  bonuses: [
    { pieces: 2, text: '+8% parry.', effects: [{ kind: 'dodge', points: 0.08 }] },
    {
      pieces: 4,
      text: '+10% damage while above 70% health.',
      effects: [{ kind: 'healthy-damage', share: 0.1, above: 0.7 }],
    },
    {
      pieces: 5,
      text: 'The first blow of every fight is a critical hit.',
      effects: [{ kind: 'first-strike-crit' }],
    },
  ],
};

export const GEAR_SETS: readonly GearSetDef[] = [
  OATHSWORN,
  WOLFBLOOD,
  MAESTRO,
  DAWNCHORUS,
  EMBERWEAVE,
  TIDECALLER,
  THORNSTALKER,
  GALEWIND,
  CORSAIR,
  NIGHTTIDE,
];

const SETS_BY_ID: Readonly<Record<string, GearSetDef>> = Object.fromEntries(
  GEAR_SETS.map((entry) => [entry.id, entry]),
);

export function gearSet(id: string): GearSetDef | null {
  return SETS_BY_ID[id] ?? null;
}

/** The two sets a class can wear. Nobody else can equip them (spec §1). */
export function setsForClass(classId: ClassId): readonly GearSetDef[] {
  return GEAR_SETS.filter((entry) => entry.classId === classId);
}

export function setPiece(id: string, slot: SetSlot): SetPieceDef | null {
  return gearSet(id)?.pieces.find((piece) => piece.slot === slot) ?? null;
}

/** The bonuses active at a given piece count — every threshold at or below it. */
export function activeBonuses(definition: GearSetDef, pieces: number): readonly SetBonusDef[] {
  return definition.bonuses.filter((bonus) => bonus.pieces <= pieces);
}

/**
 * The Verses a Maestro five-piece may open on.
 *
 * Re-exported from here rather than imported from the engine by the UI, so the one screen that
 * needs the list does not reach into `engine/combat` for it.
 */
export const OPENING_VERSES: readonly VerseId[] = ['battle-hymn', 'ironsong', 'discord'];
