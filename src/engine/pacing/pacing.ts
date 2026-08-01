/**
 * The pacing simulation (balancing-formulas.md §0, ROADMAP Phase 17 acceptance).
 *
 * §0 is a table of promises — level 10 by day 2–3, level 25 by week two, a full set inside two
 * months — and until this module existed nothing checked them. The combat harness proves fights
 * are fair and the economy sim proves the purse balances, but neither answers *how long the game
 * takes*, which is the number every one of those systems exists to produce.
 *
 * It owns no curves. Levels come from `simulateEconomy`, which already plays modelled days
 * through the real reward formulas; set pieces come from the real drop tables, forge odds and
 * banner rates; rank comes from the ladder's own honor arithmetic against the generated field.
 * Nothing here re-implements anything, which is the only way a pacing regression can fail the
 * build rather than the player.
 *
 * **Milestones are reported in fractional days, and that is not a nicety.** A ledger walked
 * day-by-day can only say "you were level 10 by the end of day 4", which rounds every milestone
 * up by as much as a whole day — at the level-10 target that is a third of the entire budget, and
 * it was enough on its own to fail a curve that is actually inside tolerance. Crossing level 10
 * at ten in the morning on day four is 3.4 days, and 3.4 is what a table saying "day 2–3" should
 * be compared against.
 *
 * Pure module.
 */

import {
  ACTIVE_PLAYER,
  simulateEconomy,
  type DayLedger,
  type PlayStyle,
} from '@/engine/economy/simulate';
import { totalXpToLevel } from '@/engine/progression/xp';
import { missionDropTable } from '@/engine/items/drops';
import { meanYield } from '@/engine/items/generate';
import { RECIPE_COST, SCRAPS_PER_DAY } from '@/engine/forge/forgeConfig';
import { VIGOR_PER_DAY } from '@/engine/progression/rewards';
import { GEAR_SETS, SET_PIECES } from '@/data/gearSets';
import { banner, outcomeOdds } from '@/data/banners';

/** The five rows of §0 this module can measure. Rank 1 is a six-month claim; see the note below. */
export const MILESTONES = [
  'level-10',
  'level-25',
  'level-55',
  'first-set-piece',
  'full-set',
  'top-100',
] as const;
export type Milestone = (typeof MILESTONES)[number];

/** `[TUNE]` The §0 table, as days. A range collapses to its slower end — the promise, not the best case. */
export const TARGET_DAYS: Readonly<Record<Milestone, number>> = {
  'level-10': 3,
  'level-25': 14,
  'level-55': 30,
  'first-set-piece': 30,
  'full-set': 52,
  'top-100': 75,
};

/**
 * `[TUNE]` The **fast** end of each §0 row, for the rows §0 states as a range.
 *
 * `TARGET_DAYS` is the promise, and a promise is a latest date — which is the only end a deadline
 * has. A *schedule* row is two-sided, though, and half of §0's rows are written as ranges: "Day
 * 2–3", "~Week 2", "Day 45–60". Measuring the early side of a range against its slow end asserts
 * something §0 does not say. Level 25 is the row where that bites: §0 promises it in **week two**,
 * the game delivers it on day 10, and against a collapsed day-14 target that read as a 29% miss
 * for arriving four days into the week it was promised in.
 *
 * This is not a widened band — it is the band §0 actually wrote. Level 25 on day 5 still fails
 * (8 × 0.8 = day 6.4 is the floor), which is the failure the two-sidedness exists to catch: a
 * content gate opening before the player has any reason to want it.
 *
 * Rows §0 gives as a single day repeat it here, so every row has both ends and none of them is a
 * special case. This is the same lesson as `MILESTONE_KIND`, one step further in: a semantic that
 * lives only in a comment gets rewritten by whoever is in a hurry.
 */
export const TARGET_EARLIEST: Readonly<Record<Milestone, number>> = {
  'level-10': 2, // §0: "Day 2–3"
  'level-25': 8, // §0: "~Week 2" — the week starts on day 8
  'level-55': 30, // §0: "~Day 30"
  'first-set-piece': 30, // deadline; the early side is never checked
  'full-set': 45, // §0: "Day 45–60"
  'top-100': 75, // deadline
};

/**
 * What kind of promise each row is — and the distinction is not a technicality.
 *
 * A **schedule** row is a content gate: level 55 arriving on day 5 is as much a failure as it
 * arriving on day 90, because the game would be handing over everything it has before the player
 * has any reason to want it. Both directions count.
 *
 * A **deadline** row is a long chase, and §0 words them that way — "1–2 set pieces *by* day 30",
 * "top 100 in month 2–3". The risk being managed there is the thing never arriving; getting
 * there early is the game being generous, not the table being wrong. Only lateness counts.
 *
 * This was worth getting right rather than leaving both two-sided: the first-set-piece row read
 * as a 58% miss while describing a game that delivers the piece *eighteen days ahead of the
 * promise*. A band that fails on generosity is a band nobody trusts, and an untrusted band gets
 * widened until it means nothing. Early arrivals are still reported — see `earlyBy` — because
 * "sooner than promised" is a design fact worth seeing, just not a regression.
 */
export const MILESTONE_KIND: Readonly<Record<Milestone, 'schedule' | 'deadline'>> = {
  'level-10': 'schedule',
  'level-25': 'schedule',
  'level-55': 'schedule',
  'first-set-piece': 'deadline',
  'full-set': 'deadline',
  'top-100': 'deadline',
};

export interface PacingResult {
  /** Fractional day each milestone landed, or null if it never did inside the run. */
  readonly reached: Readonly<Record<Milestone, number | null>>;
  readonly finalLevel: number;
  /** Set pieces held at the end — the chase's actual rate, not its advertised one. */
  readonly setPieces: number;
  readonly ledger: readonly DayLedger[];
}

export interface PacingOptions {
  readonly days?: number;
  readonly style?: PlayStyle;
}

/**
 * The fractional day a level was crossed.
 *
 * Linear inside the day it happened, which is exact enough: a day's XP arrives in four or five
 * roughly equal missions plus one patrol, so "40% of the way through the day's XP" really is
 * about 40% of the way through the day.
 */
function dayLevelReached(ledger: readonly DayLedger[], level: number): number | null {
  const need = totalXpToLevel(level);
  const index = ledger.findIndex((entry) => entry.xpTotal >= need);
  if (index === -1) return null;

  const crossing = ledger[index]!;
  const before = index === 0 ? 0 : ledger[index - 1]!.xpTotal;
  const earnedToday = crossing.xpTotal - before;
  if (earnedToday <= 0) return crossing.day;

  const share = Math.min(1, Math.max(0, (need - before) / earnedToday));
  // `day` is 1-indexed and counts the day being played, so the day *before* it is `day - 1`
  // whole days of play. A milestone crossed 40% into day 4 is 3.4 days in.
  return Number((crossing.day - 1 + share).toFixed(2));
}

/**
 * Expected set pieces gained on a typical day, from every source the game has.
 *
 * Level-independent on purpose: the drop *rate* does not change with level (a set piece is a
 * roll on the same table at forty as at four), only the item's own level does.
 *
 * Drops, Vesna's featured cards and the forge's recipes, each at its published rate — the same
 * numbers the odds panels show the player, because a pacing claim built on private rates is a
 * pacing claim about a different game.
 */
function setPiecesPerDay(style: PlayStyle): number {
  const missions = missionsPerDay(style);
  const table = missionDropTable(style.duration);
  const perMission = table.itemChance * (table.rarityWeights.set ?? 0);

  const rolls = style.gachaRollsPerDay ?? 0;
  const featured = outcomeOdds(banner('weekly'), 'featured') / 100;

  return missions * perMission + rolls * featured;
}

function missionsPerDay(style: PlayStyle): number {
  return Math.floor((VIGOR_PER_DAY * style.vigorUsed) / style.duration);
}

/**
 * Recipe crafts a day — the *deterministic* half of the chase, which this sim used to omit.
 *
 * The omission was defended in a comment ("a recipe is a decision paid for in a currency the sim
 * does not model") and it was wrong in the way a missing measurement is always wrong: it did not
 * make the answer pessimistic, it made the answer *unexamined*. Costing it out was the whole
 * finding of the Phase 17 pass — at the shipped rates the route came to ~210 days, three times
 * slower than the gacha it was meant to backstop, so the "guaranteed path" was decoration
 * (balancing §16).
 *
 * The model is the material budget and nothing else: a day's drops, scrapped up to the daily cap,
 * priced at `RECIPE_COST`. Both materials are checked because the binding one is not obvious —
 * Essence is plentiful and Starmetal is not, and which of them gates a recipe is exactly the
 * thing a tuning pass exists to find out.
 */
function recipesPerDay(style: PlayStyle): number {
  const table = missionDropTable(style.duration);
  const items = missionsPerDay(style) * table.itemChance;
  const weights = table.rarityWeights;
  const total = Object.values(weights).reduce((sum, weight) => sum + (weight ?? 0), 0);
  if (total <= 0 || items <= 0) return 0;

  /*
   * A player scraps what they cannot wear, which is nearly everything, but never more than the
   * crucible allows in a day. The cap binds first at high mission counts and is part of the
   * answer rather than a footnote to it.
   */
  const scrapped = Math.min(items, SCRAPS_PER_DAY);
  const share = scrapped / items;

  let essence = 0;
  let starmetal = 0;
  for (const [rarity, weight] of Object.entries(weights)) {
    const perDay = ((items * (weight ?? 0)) / total) * share;
    essence += perDay * meanYield(rarity as Parameters<typeof meanYield>[0], 'essence');
    starmetal += perDay * meanYield(rarity as Parameters<typeof meanYield>[0], 'starmetal');
  }

  const byEssence = RECIPE_COST.essence > 0 ? essence / RECIPE_COST.essence : Infinity;
  const byStarmetal = RECIPE_COST.starmetal > 0 ? starmetal / RECIPE_COST.starmetal : Infinity;
  return Math.min(byEssence, byStarmetal);
}

/**
 * When the player's honor puts them in the top hundred of the fifteen hundred.
 *
 * Modelled from the *shape of the field* rather than by simulating every bot for three months:
 * a hero climbing on the arena's published payout passes a bot when they out-honor it, and the
 * generator's distribution says how much honor the hundredth-place hero holds. That is the same
 * comparison `ladder.ts` makes; doing it against the distribution instead of a rolled world is
 * what keeps this cheap enough to run in CI.
 *
 * `[TUNE]` `HONOR_PER_DAY_PER_LEVEL` is the arena's realistic daily haul: ten rewarded wins at
 * roughly a level's worth of honor each, discounted for the losses and the cooldown.
 */
const HONOR_PER_DAY_PER_LEVEL = 1.6;
/** `[TUNE]` Honor the hundredth-ranked hero holds, as a multiple of the player's level. */
const TOP_100_HONOR_PER_LEVEL = 42;

function dayTop100Reached(ledger: readonly DayLedger[]): number | null {
  let honor = 0;
  for (const entry of ledger) {
    honor += HONOR_PER_DAY_PER_LEVEL * entry.level;
    if (honor >= TOP_100_HONOR_PER_LEVEL * entry.level) return entry.day;
  }
  return null;
}

/**
 * Play the reference player and report when each promise came true.
 *
 * The reference is `ACTIVE_PLAYER` — §0's "active daily player": they spend the day's Vigor,
 * set a patrol before bed, take the free card, and put what is left into training. Not a
 * completist and not a tourist; the player the table was written about.
 */
export function simulatePacing({
  days = 180,
  style = ACTIVE_PLAYER,
}: PacingOptions = {}): PacingResult {
  const run = simulateEconomy({ days, style });

  let pieces = 0;
  let towardSet = 0;
  let firstPiece: number | null = null;
  let fullSet: number | null = null;

  /*
   * A "full set" is five pieces of *one* set, not five pieces — and the two sources differ in
   * exactly that respect, which is why they are counted separately.
   *
   * A random piece (a drop, a featured card) lands in whichever of the player's class sets the
   * table picked, so with two of them only about half of it advances the set being built.
   * `sets.ts` draws the missing slot first *within* a set, so duplicate slots are not the cost —
   * the cross-set spread is. A **recipe** has no spread at all: the player names the set, so
   * every recipe piece counts, which is the entire reason the deterministic path exists.
   *
   * Modelling both as random (which this did until Phase 17) understates the forge to nothing
   * and then blames the gacha for the gap.
   */
  const classSets = GEAR_SETS.filter((entry) => entry.classId === 'warrior').length || 2;
  const random = setPiecesPerDay(style);
  const recipes = recipesPerDay(style);

  for (const entry of run.ledger) {
    const gained = random + recipes;
    const before = pieces;
    pieces += gained;

    const towardBefore = towardSet;
    towardSet += random / classSets + recipes;

    if (firstPiece === null && pieces >= 1) {
      const share = gained > 0 ? (1 - before) / gained : 0;
      firstPiece = Number((entry.day - 1 + Math.min(1, Math.max(0, share))).toFixed(2));
    }
    if (fullSet === null && towardSet >= SET_PIECES) {
      const step = towardSet - towardBefore;
      const share = step > 0 ? (SET_PIECES - towardBefore) / step : 0;
      fullSet = Number((entry.day - 1 + Math.min(1, Math.max(0, share))).toFixed(2));
    }
  }

  return {
    reached: {
      'level-10': dayLevelReached(run.ledger, 10),
      'level-25': dayLevelReached(run.ledger, 25),
      'level-55': dayLevelReached(run.ledger, 55),
      'first-set-piece': firstPiece,
      'full-set': fullSet,
      'top-100': dayTop100Reached(run.ledger),
    },
    finalLevel: run.finalLevel,
    setPieces: Math.floor(pieces),
    ledger: run.ledger,
  };
}

/** How far off target a milestone landed, as a share. Positive is slower than promised. */
export function drift(result: PacingResult, milestone: Milestone): number | null {
  const reached = result.reached[milestone];
  if (reached === null) return null;
  return (reached - TARGET_DAYS[milestone]) / TARGET_DAYS[milestone];
}

/**
 * Is this row inside the ±20% the ROADMAP asks for?
 *
 * A milestone never reached fails whatever kind it is — that is the one answer no promise
 * survives. Otherwise a deadline only penalises lateness, and a schedule is two-sided about §0's
 * **window**: late of `TARGET_DAYS` or early of `TARGET_EARLIEST`, each by more than the band.
 */
export function withinBand(result: PacingResult, milestone: Milestone, band = 0.2): boolean {
  const reached = result.reached[milestone];
  if (reached === null) return false;

  if (reached > TARGET_DAYS[milestone] * (1 + band)) return false;
  if (MILESTONE_KIND[milestone] === 'deadline') return true;
  return reached >= TARGET_EARLIEST[milestone] * (1 - band);
}

/**
 * How far outside §0's window a row landed, as a share. Zero when it is inside it.
 *
 * Positive is later than the promise, negative is earlier than the range starts. `drift` answers
 * "how far off the promised date", which is the right question for a report; this answers "is
 * this a miss, and by how much", which is the right question for a band.
 */
export function windowDrift(result: PacingResult, milestone: Milestone): number | null {
  const reached = result.reached[milestone];
  if (reached === null) return null;

  const latest = TARGET_DAYS[milestone];
  if (reached > latest) return (reached - latest) / latest;
  if (MILESTONE_KIND[milestone] === 'deadline') return 0;

  const earliest = TARGET_EARLIEST[milestone];
  return reached < earliest ? (reached - earliest) / earliest : 0;
}

/** Days ahead of the promise, for a row that beat it. Null when it did not, or never landed. */
export function earlyBy(result: PacingResult, milestone: Milestone): number | null {
  const reached = result.reached[milestone];
  if (reached === null || reached >= TARGET_DAYS[milestone]) return null;
  return Number((TARGET_DAYS[milestone] - reached).toFixed(2));
}
