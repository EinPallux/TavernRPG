/**
 * Fortune's Table — the three banners and what they pay (gacha spec §2, §4).
 *
 * Every rate in the game's one slot machine lives in this file, for the same reason the forge's
 * do: rule 6 says odds are always visible, and that only stays true if the panel the player
 * reads and the roll the engine makes are the *same object*. The odds panel renders these
 * weights directly. Nothing anywhere may hold a second copy.
 *
 * The three banners are one table with three sets of weights rather than three tables, because
 * they differ in *emphasis*, not in kind — every roll produces one of the same seven outcomes.
 * Writing them as three unrelated tables would let a future edit give the Daily Draw a payout the
 * Grand Reading cannot produce, which is a bug the type system would never catch.
 *
 * Pure data module.
 */

import type { IconId } from './icons';

export const BANNER_IDS = ['daily', 'weekly', 'monthly'] as const;
export type BannerId = (typeof BANNER_IDS)[number];

/**
 * What one roll can produce.
 *
 * `featured` is the banner's headline — a set piece on the weekly and monthly, a piece in the
 * highlighted slot on the daily. `dupe` is not rolled: it is what `featured` *becomes* when the
 * piece drawn is already owned (spec §5), and it exists as its own outcome so the reveal can be
 * a payout rather than a whiff.
 */
export const ROLL_OUTCOMES = [
  'featured',
  'epic',
  'rare',
  'materials',
  'gold',
  'ale',
  'uncommon',
] as const;
export type RollOutcome = (typeof ROLL_OUTCOMES)[number];

export type OutcomeWeights = Readonly<Record<RollOutcome, number>>;

export interface BannerDef {
  readonly id: BannerId;
  readonly name: string;
  /** One line under the title, on the card. */
  readonly blurb: string;
  readonly sigil: IconId;
  /** How often the featured thing changes. Drives the countdown and the "next up" tease. */
  readonly rotation: 'daily' | 'weekly' | 'monthly';
  /**
   * Relative weights over the seven outcomes. Percentages after normalising — they are written
   * to sum to 100 so the table reads as the spec's table, but nothing depends on it.
   */
  readonly odds: OutcomeWeights;
  /** Rolls before the featured result is guaranteed. Zero = this banner has no pity. */
  readonly pity: number;
  /** The Daily Draw's free roll. */
  readonly freeRollPerDay: boolean;
  /** Only the Grand Reading spreads ten cards at once (spec §3). */
  readonly allowsTenRoll: boolean;
}

/**
 * `[TUNE]` The weekly table is the spec's §4 table verbatim; the other two are variants.
 *
 * Daily is the cheap ritual — its featured slot is a *slot*, not a set, so "featured" is far
 * more common and far less valuable. Monthly is the save-up banner: Epic and featured odds are
 * roughly doubled, paid for out of the consolation tail.
 */
const DAILY: BannerDef = {
  id: 'daily',
  name: 'The Daily Draw',
  blurb: 'One card on the house, every day. Vesna picks the suit.',
  sigil: 'dice',
  rotation: 'daily',
  odds: { featured: 14, epic: 2, rare: 12, materials: 28, gold: 22, ale: 6, uncommon: 16 },
  pity: 0,
  freeRollPerDay: true,
  allowsTenRoll: false,
};

const WEEKLY: BannerDef = {
  id: 'weekly',
  name: 'Set of the Week',
  blurb: 'One set on the table for seven days. The pity counter follows the set, not the week.',
  sigil: 'banner',
  rotation: 'weekly',
  odds: { featured: 5, epic: 3, rare: 12, materials: 30, gold: 22, ale: 8, uncommon: 20 },
  pity: 20,
  freeRollPerDay: false,
  allowsTenRoll: false,
};

const MONTHLY: BannerDef = {
  id: 'monthly',
  name: "Vesna's Grand Reading",
  blurb: 'The long spread. Better cards, and a track that pays whether they land or not.',
  sigil: 'laurel',
  rotation: 'monthly',
  odds: { featured: 9, epic: 6, rare: 15, materials: 26, gold: 20, ale: 4, uncommon: 20 },
  pity: 0,
  freeRollPerDay: false,
  allowsTenRoll: true,
};

export const BANNERS: readonly BannerDef[] = [DAILY, WEEKLY, MONTHLY];

const BY_ID: Readonly<Record<BannerId, BannerDef>> = {
  daily: DAILY,
  weekly: WEEKLY,
  monthly: MONTHLY,
};

export function banner(id: BannerId): BannerDef {
  return BY_ID[id];
}

/** One outcome's published chance on a banner, as a percentage. What the odds panel prints. */
export function outcomeOdds(definition: BannerDef, outcome: RollOutcome): number {
  const total = ROLL_OUTCOMES.reduce((sum, key) => sum + definition.odds[key], 0);
  return total === 0 ? 0 : (definition.odds[outcome] * 100) / total;
}

export const OUTCOME_LABELS: Readonly<Record<RollOutcome, string>> = {
  featured: 'Featured',
  epic: 'Epic gear',
  rare: 'Rare gear',
  materials: 'Materials',
  gold: 'Gold cache',
  ale: 'Ale',
  uncommon: 'Uncommon gear',
};

/* ── The Grand Reading's track ───────────────────────────────────────────────────── */

/**
 * `[TUNE]` Rolls between rungs on the monthly track (spec §4).
 *
 * The Grand Reading has no featured pity because its track *is* its floor: fifteen rolls always
 * buy something, whatever the cards did. Three rungs, then it stops — a track that loops forever
 * would make the monthly banner strictly better than the weekly and the choice would evaporate.
 */
export const MONTHLY_TRACK_STEP = 15;

export type TrackRewardKind = 'recipe' | 'pet' | 'starmetal';

export interface TrackRung {
  readonly at: number;
  readonly kind: TrackRewardKind;
  readonly label: string;
  readonly detail: string;
}

export const MONTHLY_TRACK: readonly TrackRung[] = [
  {
    at: 1,
    kind: 'recipe',
    label: 'A pattern for your class',
    detail: 'One of your two set recipes, if Torvald does not already have it.',
  },
  {
    at: 2,
    kind: 'pet',
    label: 'The Owl of Vesna',
    detail: 'Hers, and she is not sentimental about it. Boosts Intelligence.',
  },
  {
    at: 3,
    kind: 'starmetal',
    label: 'A cache of Starmetal',
    detail: 'Six bars. Enough for three Master forges, or one recipe and change.',
  },
];

/** `[TUNE]` Bars in the track's final rung. */
export const TRACK_STARMETAL = 6;

/* ── Pets Vesna hands out ────────────────────────────────────────────────────────── */

/**
 * The two pets sourced from this room (pets spec §1).
 *
 * Only their ids and names live here. The Menagerie (Phase 14) owns the roster, the boosts and
 * the feeding — and it will derive *ownership* from the same sources the spec lists rather than
 * from a second copy of "who owns what": dungeon trophies for the Ember Pup, `missionsCompleted`
 * for the Tankard Imp, and `gacha.pets` for these two. Every source is already a fact in the
 * save, so there is nothing to keep in step.
 */
export const OWL_OF_VESNA = 'owl-of-vesna';
export const GILDED_SNAIL = 'gilded-snail';

export const GACHA_PET_NAMES: Readonly<Record<string, string>> = {
  [OWL_OF_VESNA]: 'The Owl of Vesna',
  [GILDED_SNAIL]: 'The Gilded Snail',
};

/**
 * `[TUNE]` The Grand Reading's one-in-a-hundred slot (pets spec §1).
 *
 * Rolled *on top of* the normal outcome rather than instead of one, so a Snail never costs the
 * player the card they were owed. It is the only pure-luck reward in the room and the only thing
 * here that is not on the odds panel as a row of its own — it gets its own line beneath it.
 */
export const SNAIL_CHANCE = 0.01;

/* ── Dupes ───────────────────────────────────────────────────────────────────────── */

/** `[TUNE]` What a duplicate set piece converts to (spec §5). */
export const DUPE_STARMETAL = 2;
/** `[TUNE]` Shards per conversion, and how many make a recipe. */
export const DUPE_SHARDS = 1;
export const SHARDS_PER_RECIPE = 5;

/* ── Payout sizes ────────────────────────────────────────────────────────────────── */

/** `[TUNE]` A gold cache, in Vigor-equivalents (spec §4). */
export const GOLD_CACHE_VIGOR = 45;

/** `[TUNE]` Materials bundles, weighted from cheap to rare. */
export const MATERIAL_BUNDLES = [
  { weight: 55, scrap: 18, essence: 0, starmetal: 0 },
  { weight: 32, scrap: 8, essence: 6, starmetal: 0 },
  { weight: 13, scrap: 0, essence: 10, starmetal: 1 },
] as const;

/** The cost of a roll, in Golden Dice. One, always — bulk pricing would be a lie (spec §3). */
export const ROLL_DICE_COST = 1;
export const TEN_ROLL_SIZE = 10;
