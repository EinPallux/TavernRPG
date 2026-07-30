/**
 * The twelve companions (pets spec §1).
 *
 * Deliberately minor: one pet at a time, one modest boost, and a chase that is about *collecting*
 * rather than about power. The whole roster caps out well under a single gear upgrade — which is
 * the point. A pet system that mattered would become a second character screen.
 *
 * **A pet's source is written down as data, not just as prose.** Every entry names the fact in
 * the save that earns it, because `engine/pets/ownership.ts` derives ownership from exactly those
 * facts rather than keeping a second list of who owns what. The `hint` is what a silhouette says
 * out loud; the `kind` is what the engine switches on. Keeping them in one place is what stops
 * the two drifting — a hint that says "Barrowdeep floor 5" while the code checks floor 4 is
 * exactly the sort of lie this file exists to make impossible.
 *
 * Pure data module.
 */

import type { AttributeId } from '@/engine/progression/stats';
import type { IconId } from './icons';

export const PET_IDS = [
  'ember-pup',
  'moss-tortoise',
  'gloom-cat',
  'owl-of-vesna',
  'coin-toad',
  'brass-beetle',
  'tankard-imp',
  'sooty-raven',
  'frost-fox',
  'cellar-rat-king',
  'wisp-of-the-chapel',
  'gilded-snail',
] as const;
export type PetId = (typeof PET_IDS)[number];

/** Mutable-tuple alias for `z.enum`, which will not take a `readonly` array. */
export const PET_ID_LIST = [...PET_IDS] as [PetId, ...PetId[]];

/**
 * What a pet improves.
 *
 * The five attributes go through the hero's stat block; `armour`, `goldFind` and `xpBonus` are
 * the three that do not, and they run at **half rate** (spec §2) because a percentage of gold
 * found compounds across the whole economy in a way a percentage of Strength does not.
 */
export type PetBoost = AttributeId | 'armour' | 'goldFind' | 'xpBonus';

export const HALF_RATE_BOOSTS: readonly PetBoost[] = ['armour', 'goldFind', 'xpBonus'];

export const BOOST_LABELS: Readonly<Record<PetBoost, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  int: 'Intelligence',
  con: 'Constitution',
  lck: 'Luck',
  armour: 'Armour',
  goldFind: 'Gold found',
  xpBonus: 'Experience',
};

/**
 * How a pet is earned.
 *
 * A closed union rather than a free-text field: `ownedPets()` switches on it exhaustively, so
 * adding a thirteenth pet with a new kind of source is a type error until the engine handles it.
 */
export type PetSource =
  /** First clear of a dungeon floor. */
  | { readonly kind: 'dungeon-floor'; readonly dungeonId: string; readonly floor: number }
  /** Lifetime missions completed. */
  | { readonly kind: 'missions'; readonly count: number }
  /** Lifetime missions in one zone. */
  | { readonly kind: 'zone-missions'; readonly zoneId: string; readonly count: number }
  /** Best ladder rank ever held (lower is better). */
  | { readonly kind: 'arena-rank'; readonly rank: number }
  /** Handed over by Fortune's Table — the monthly track, or its 1% slot. */
  | { readonly kind: 'gacha' }
  /** A rare egg from a mission in one of these zones. */
  | { readonly kind: 'egg'; readonly zoneIds: readonly string[]; readonly chance: number }
  /**
   * A daily-loop milestone that Phase 15 owns.
   *
   * Declared now so the stall, the silhouette and the source hint are real from the day the room
   * opens — a collection with two blank spaces and no explanation is worse than one with two
   * spaces that name what will fill them. `ownedPets()` returns false for these until the login
   * calendar and the Notice Board exist, which is the honest answer today.
   */
  | { readonly kind: 'daily-loop'; readonly feature: 'calendar' | 'notice-board' };

export interface PetDef {
  readonly id: PetId;
  readonly name: string;
  /** One line of who they are, for the stall. */
  readonly flavour: string;
  readonly boost: PetBoost;
  readonly iconId: IconId;
  readonly source: PetSource;
  /** What the silhouette says. Written here so the hint and the check cannot disagree. */
  readonly hint: string;
}

export const PETS: readonly PetDef[] = [
  {
    id: 'ember-pup',
    name: 'Ember Pup',
    flavour: 'Found asleep on a warm stone. Has never once been cold since.',
    boost: 'str',
    iconId: 'petPup',
    source: { kind: 'dungeon-floor', dungeonId: 'rat-cellars', floor: 5 },
    hint: 'Sleeping somewhere past the fifth floor of the Rat Cellars.',
  },
  {
    id: 'moss-tortoise',
    name: 'Moss Tortoise',
    flavour: 'Older than the tavern. Possibly older than the hill it stands on.',
    boost: 'con',
    iconId: 'petTortoise',
    source: { kind: 'daily-loop', feature: 'calendar' },
    hint: 'Turns up for people who keep turning up — the login calendar, day 28.',
  },
  {
    id: 'gloom-cat',
    name: 'Gloom Cat',
    flavour: 'Was already in the crypt. Considers you the guest.',
    boost: 'dex',
    iconId: 'petCat',
    source: { kind: 'dungeon-floor', dungeonId: 'barrowdeep', floor: 5 },
    hint: 'Watching from the fifth floor of the Barrowdeep Crypt.',
  },
  {
    id: 'owl-of-vesna',
    name: 'The Owl of Vesna',
    flavour: 'Hers. She is not sentimental about it and neither is the owl.',
    boost: 'int',
    iconId: 'petOwl',
    source: { kind: 'gacha' },
    hint: "The second rung of Vesna's Grand Reading track.",
  },
  {
    id: 'coin-toad',
    name: 'Coin Toad',
    flavour: 'Eats coppers. Produces, on a good day, slightly more coppers.',
    boost: 'lck',
    iconId: 'petToad',
    source: { kind: 'daily-loop', feature: 'notice-board' },
    hint: 'Thirty days of cleared tasks on the Notice Board.',
  },
  {
    id: 'brass-beetle',
    name: 'Brass Beetle',
    flavour: 'Somebody made it. Nobody will say who, or entirely why.',
    boost: 'armour',
    iconId: 'petBeetle',
    source: { kind: 'dungeon-floor', dungeonId: 'emberdeep', floor: 5 },
    hint: 'Clicking about on the fifth floor of the Emberdeep Foundry.',
  },
  {
    id: 'tankard-imp',
    name: 'Tankard Imp',
    flavour: 'Lives in a tankard. Marla has stopped trying to wash it.',
    boost: 'goldFind',
    iconId: 'petImp',
    source: { kind: 'missions', count: 100 },
    hint: 'Notices you after a hundred contracts. Not before.',
  },
  {
    id: 'sooty-raven',
    name: 'Sooty Raven',
    flavour: 'Follows winners. Has excellent, entirely mercenary judgement.',
    boost: 'xpBonus',
    iconId: 'petRaven',
    source: { kind: 'arena-rank', rank: 500 },
    hint: 'Circles the Proving Grounds. Lands for anyone inside the top 500.',
  },
  {
    id: 'frost-fox',
    name: 'Frost Fox',
    flavour: 'Hatched from something you were fairly sure was a rock.',
    boost: 'dex',
    iconId: 'petFox',
    source: {
      kind: 'egg',
      zoneIds: ['silverpine-pass', 'frostfell-ridge'],
      chance: 0.005,
    },
    hint: 'An egg, very occasionally, in Silverpine Pass or on Frostfell Ridge.',
  },
  {
    id: 'cellar-rat-king',
    name: 'Cellar Rat King',
    flavour: 'A crown of six rats that has agreed, for now, to be one animal.',
    boost: 'con',
    iconId: 'petRatKing',
    source: { kind: 'dungeon-floor', dungeonId: 'rat-cellars', floor: 10 },
    hint: 'Enthroned at the bottom of the Rat Cellars.',
  },
  {
    id: 'wisp-of-the-chapel',
    name: 'Wisp of the Chapel',
    flavour: 'Something that stayed behind when the water came in.',
    boost: 'int',
    iconId: 'petWisp',
    source: { kind: 'zone-missions', zoneId: 'sunken-chapel', count: 40 },
    hint: 'Forty contracts at the Sunken Chapel and it starts following you home.',
  },
  {
    id: 'gilded-snail',
    name: 'The Gilded Snail',
    flavour: 'One in a hundred, and slower than all of them.',
    boost: 'lck',
    iconId: 'petSnail',
    source: { kind: 'gacha' },
    hint: "A one-percent slot on Vesna's Grand Reading.",
  },
];

const BY_ID: Readonly<Record<string, PetDef>> = Object.fromEntries(
  PETS.map((entry) => [entry.id, entry]),
);

export function pet(id: string): PetDef | null {
  return BY_ID[id] ?? null;
}

export function isPetId(id: string): id is PetId {
  return id in BY_ID;
}

/* ── Levels, feeding and rarity ──────────────────────────────────────────────────── */

/** `[TUNE]` The ceiling. Forty-nine feeds, at the rate Scraps arrive, is about a month per pet. */
export const PET_MAX_LEVEL = 50;

/**
 * `[TUNE]` Feeds per pet per day (spec §2). Per *pet*, so collecting stays worth doing.
 *
 * This is a **burst ceiling, not a target.** Scraps arrive at ~1.6 a day for an active player,
 * so the everyday experience is one feed; the three exists so a player who banked a week of
 * Scraps while away can spend some of them on the day they come back without emptying the bag
 * into one pet in a single sitting. `economy.test.ts` asserts the supply, which is the number
 * that actually sets the pace.
 */
export const FEEDS_PER_DAY = 3;

/** `[TUNE]` Tavern Scraps a feed costs, and the gold that goes with it. */
export const SCRAPS_PER_FEED = 1;
export const GOLD_PER_FEED_PER_LEVEL = 18;

/**
 * `[TUNE]` Scraps from a mission, and how many at a time (spec §2).
 *
 * 16% × 2 is 0.32 a contract — 1.6 a day for a player spending their Vigor on 20-minute runs,
 * which takes one companion from 1 to 50 in about a month. It was 8% until the Phase 14 economy
 * pass measured it: at that rate a pet took two months and the three-a-day cap was unreachable,
 * so the counter on the stall was advertising a pace the game could not supply.
 */
export const SCRAP_DROP_CHANCE = 0.16;
export const SCRAPS_PER_DROP = 2;

/**
 * `[TUNE]` The boost curve (spec §2): 1% at level 1, 5% at level 50.
 *
 * Half rate for armour, gold-find and experience — those three multiply things that are already
 * multiplied elsewhere, and a flat 5% on gold found is worth considerably more over a month than
 * 5% Strength.
 */
export const BOOST_BASE = 0.01;
export const BOOST_PER_LEVEL = 0.0008;

export const PET_RARITIES = ['common', 'uncommon', 'rare', 'epic'] as const;
export type PetRarity = (typeof PET_RARITIES)[number];

export interface RarityStep {
  readonly rarity: PetRarity;
  /** Level the pet must reach before the upgrade is offered. */
  readonly atLevel: number;
  /** Materials it costs. */
  readonly essence: number;
  readonly starmetal: number;
}

/**
 * `[TUNE]` Upgrades at 15 / 30 / 45 (spec §2).
 *
 * They buy a frame, a particle trail and **+0.5% flat** — small enough that skipping them costs a
 * player nothing they will feel, which is the whole reason the materials price can be steep. A
 * cosmetic tier that is secretly mandatory is a tax.
 */
export const RARITY_STEPS: readonly RarityStep[] = [
  { rarity: 'uncommon', atLevel: 15, essence: 12, starmetal: 0 },
  { rarity: 'rare', atLevel: 30, essence: 30, starmetal: 1 },
  { rarity: 'epic', atLevel: 45, essence: 60, starmetal: 3 },
];

export const RARITY_BONUS = 0.005;

export const PET_RARITY_LABELS: Readonly<Record<PetRarity, string>> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
};
