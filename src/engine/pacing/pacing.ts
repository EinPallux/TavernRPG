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
  const missions = Math.floor((VIGOR_PER_DAY * style.vigorUsed) / style.duration);
  const table = missionDropTable(style.duration);
  const perMission = table.itemChance * (table.rarityWeights.set ?? 0);

  const rolls = style.gachaRollsPerDay ?? 0;
  const featured = outcomeOdds(banner('weekly'), 'featured') / 100;

  // The forge is deliberately absent: a recipe craft is a *decision* paid for in Starmetal the
  // player could have spent elsewhere, and folding an average of it in would let the chase's
  // headline rate borrow from a currency the sim does not model. It makes this figure the
  // pessimistic one, which is the right direction for a promise.
  return missions * perMission + rolls * featured;
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
  let firstPiece: number | null = null;
  let fullSet: number | null = null;

  /*
   * A "full set" is five pieces of *one* set, not five pieces.
   *
   * With ten sets in the pool and two of them the player's class, a piece landing in the set
   * they are building is not a certainty — modelling it as one would claim a completion date the
   * player will not see. `sets.ts` draws the missing piece first within a set, so the cost is
   * the *cross-set* spread rather than duplicate slots: on average the player needs about
   * `SET_PIECE_SLOTS × classSets` pieces before one set is closed.
   */
  const classSets = GEAR_SETS.filter((entry) => entry.classId === 'warrior').length || 2;
  const piecesForFullSet = SET_PIECES * classSets;

  for (const entry of run.ledger) {
    const gained = setPiecesPerDay(style);
    const before = pieces;
    pieces += gained;

    if (firstPiece === null && pieces >= 1) {
      const share = gained > 0 ? (1 - before) / gained : 0;
      firstPiece = Number((entry.day - 1 + Math.min(1, Math.max(0, share))).toFixed(2));
    }
    if (fullSet === null && pieces >= piecesForFullSet) {
      const share = gained > 0 ? (piecesForFullSet - before) / gained : 0;
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
