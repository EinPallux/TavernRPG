/**
 * The economy simulation (docs/design/systems/economy-and-currencies.md §2, §6).
 *
 * Plays modeled days through the *real* formulas and records every coin in and every coin out.
 * The point is not to predict the future — it is to make an economy regression fail the build
 * instead of the player, which only works if the sim calls the same functions the game does.
 * Nothing in here re-implements a curve.
 *
 * **Pass 1 scope (Phase 6).** It models what exists: mission gold and XP, patrol, and attribute
 * training as the sink. Shops (Phase 7), mounts (Phase 9), the gacha and guild bonuses are not
 * modelled because they do not exist yet — and a sim that invents numbers for unbuilt systems
 * would assert a fiction. Each is added to `MODELLED_SINKS` as it lands, and the bands tighten
 * with it.
 *
 * Pure module.
 */

import {
  VIGOR_PER_DAY,
  goldPatrolPerHour,
  missionPayout,
  type MissionDuration,
} from '@/engine/progression/rewards';
import { applyXp, xpNeeded } from '@/engine/progression/xp';
import { maxAffordable, statCost } from '@/engine/progression/stats';

/** Faucets and sinks the model currently understands. Grows as systems ship. */
export const MODELLED_FAUCETS = ['missions', 'patrol'] as const;
export const MODELLED_SINKS = ['training'] as const;

export type Faucet = (typeof MODELLED_FAUCETS)[number];
export type Sink = (typeof MODELLED_SINKS)[number];

export interface DayLedger {
  readonly day: number;
  readonly level: number;
  /** Gold in, by source. */
  readonly earned: Readonly<Record<Faucet, number>>;
  /** Gold out, by destination. */
  readonly spent: Readonly<Record<Sink, number>>;
  readonly xpEarned: number;
  /** Attribute points bought today — the thing the player is actually here for. */
  readonly pointsBought: number;
  /** Gold left in the purse at end of day. */
  readonly purse: number;
  readonly missionsRun: number;
  readonly vigorUnspent: number;
}

export interface PlayStyle {
  /** Share of the day's Vigor actually spent. 1 = a completist, 0.4 = a busy Tuesday. */
  readonly vigorUsed: number;
  /** Preferred mission length. */
  readonly duration: MissionDuration;
  /** Hours of patrol run on a typical day (0 for a player who never uses it). */
  readonly patrolHours: number;
  /** Share of the purse spent on training each day. */
  readonly trainingSpend: number;
}

export const ACTIVE_PLAYER: PlayStyle = {
  vigorUsed: 1,
  duration: 20,
  patrolHours: 8,
  trainingSpend: 0.9,
};

/** Someone who opens the game once, spends half their Vigor and leaves. */
export const CASUAL_PLAYER: PlayStyle = {
  vigorUsed: 0.5,
  duration: 10,
  patrolHours: 10,
  trainingSpend: 0.9,
};

export interface SimOptions {
  readonly days: number;
  readonly style?: PlayStyle;
  readonly startLevel?: number;
  readonly startGold?: number;
}

export interface SimResult {
  readonly ledger: readonly DayLedger[];
  readonly finalLevel: number;
  readonly finalPurse: number;
  readonly totalPointsBought: number;
}

/**
 * Play `days` days.
 *
 * The modelled player spends their Vigor on missions, runs a patrol shift overnight, and puts
 * most of what they earn into training — the loop the game is actually asking for. Missions are
 * assumed won: balancing §5 puts an on-curve player at ≥97%, and modelling the 3% would add
 * noise without changing any ratio the bands care about.
 */
export function simulateEconomy({
  days,
  style = ACTIVE_PLAYER,
  startLevel = 1,
  startGold = 100,
}: SimOptions): SimResult {
  const ledger: DayLedger[] = [];

  let level = startLevel;
  let xp = 0;
  let purse = startGold;
  // Points bought per attribute, since `statCost` prices the *n*-th point of each one.
  const trained = { str: 0, dex: 0, int: 0, con: 0, lck: 0 };
  const attributes = Object.keys(trained) as (keyof typeof trained)[];
  let totalPointsBought = 0;

  for (let day = 1; day <= days; day += 1) {
    const vigorBudget = Math.floor(VIGOR_PER_DAY * style.vigorUsed);
    const missionsRun = Math.floor(vigorBudget / style.duration);

    let missionGold = 0;
    let xpEarned = 0;
    for (let i = 0; i < missionsRun; i += 1) {
      const payout = missionPayout(level, style.duration, xpNeeded(level));
      missionGold += payout.gold;
      xpEarned += payout.xp;

      // Level up as it happens: later missions in the day pay the new level's rate, which is
      // what actually occurs in play and matters a lot in the first week.
      const levelled = applyXp(level, xp, payout.xp);
      level = levelled.level;
      xp = levelled.xp;
    }

    const patrolGold = Math.floor(goldPatrolPerHour(level) * style.patrolHours);

    purse += missionGold + patrolGold;

    // Spend on training. The player buys into whichever attribute is cheapest next, which is
    // what "spread across attributes" means in practice.
    const budget = Math.floor(purse * style.trainingSpend);
    let spentOnTraining = 0;
    let pointsBought = 0;
    let remaining = budget;

    for (;;) {
      const cheapest = attributes.reduce((best, id) =>
        statCost(trained[id]) < statCost(trained[best]) ? id : best,
      );
      const price = statCost(trained[cheapest]);
      if (price > remaining) break;

      remaining -= price;
      spentOnTraining += price;
      trained[cheapest] += 1;
      pointsBought += 1;
    }

    purse -= spentOnTraining;
    totalPointsBought += pointsBought;

    ledger.push({
      day,
      level,
      earned: { missions: missionGold, patrol: patrolGold },
      spent: { training: spentOnTraining },
      xpEarned,
      pointsBought,
      purse,
      missionsRun,
      vigorUnspent: VIGOR_PER_DAY - vigorBudget,
    });
  }

  return {
    ledger,
    finalLevel: level,
    finalPurse: purse,
    totalPointsBought,
  };
}

/** Total gold in across the run. */
export function totalEarned(ledger: readonly DayLedger[]): number {
  return ledger.reduce(
    (sum, day) => sum + MODELLED_FAUCETS.reduce((s, f) => s + day.earned[f], 0),
    0,
  );
}

/** Total gold out across the run. */
export function totalSpent(ledger: readonly DayLedger[]): number {
  return ledger.reduce((sum, day) => sum + MODELLED_SINKS.reduce((s, k) => s + day.spent[k], 0), 0);
}

/**
 * How many attribute points a day's *income* buys at the current price.
 *
 * This is the "always slightly broke" measure. Balancing §3 wants roughly L/2 points a day
 * early on, decaying toward L/6 by level 100 — the ratio, not the absolute, is the tuned
 * quantity, so it survives every reward-curve change.
 */
export function pointsPerDayAffordable(day: DayLedger, trainedSoFar: number): number {
  const income = MODELLED_FAUCETS.reduce((sum, f) => sum + day.earned[f], 0);
  return maxAffordable(trainedSoFar, income).points;
}
