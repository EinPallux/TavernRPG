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
  goldPerVigor,
  missionPayout,
  xpPatrolPerHour,
  type MissionDuration,
} from '@/engine/progression/rewards';
import { applyXp, xpNeeded } from '@/engine/progression/xp';
import { maxAffordable, statCost } from '@/engine/progression/stats';
import { itemValue } from '@/engine/items/generate';
import { missionDropTable } from '@/engine/items/drops';
import { SHOP_PRICE_MULTIPLIER, SHOP_RARITY_WEIGHTS } from '@/engine/shops/stock';
import { MOUNT_TERM_DAYS, mountPrice } from '@/engine/stables/mounts';
import { MOUNTS_BY_ID, type MountId } from '@/data/mounts';
import { guildMultipliers } from '@/engine/guilds/buffs';
import { GOLD_CACHE_VIGOR, banner, outcomeOdds, type RollOutcome } from '@/data/banners';
import { FEEDS_PER_DAY, SCRAPS_PER_DROP, SCRAPS_PER_FEED, SCRAP_DROP_CHANCE } from '@/data/pets';
import { PET_MAX_LEVEL, feedGoldCost } from '@/engine/pets/feeding';
import { RARITIES, type Rarity } from '@/engine/items/types';

/**
 * Faucets and sinks the model currently understands. Grows as systems ship.
 *
 * `sales` and `shops`/`mounts` joined in Phase 7 when the Armory, the Facet and the Stables
 * opened; `gacha` in Phase 13 with Fortune's Table; `pets` in Phase 14 with the Menagerie. Still
 * absent: guild donations and dungeon gold — each lands with its system, because a sim that
 * invents numbers for unbuilt features asserts a fiction.
 */
export const MODELLED_FAUCETS = ['missions', 'patrol', 'sales', 'gacha'] as const;
export const MODELLED_SINKS = ['training', 'shops', 'mounts', 'pets'] as const;

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
  /**
   * Lifetime XP at end of day.
   *
   * Recorded so the pacing sim can say *when in the day* a level landed. A ledger that only
   * carries the end-of-day level can answer "which day", and "which day" rounds a milestone up
   * by as much as a whole day — which at the level-10 target is a third of the budget.
   */
  readonly xpTotal: number;
  /** Attribute points bought today — the thing the player is actually here for. */
  readonly pointsBought: number;
  /** Gold left in the purse at end of day. */
  readonly purse: number;
  readonly missionsRun: number;
  readonly vigorUnspent: number;
  /** Gear bought from a shop today (Phase 7). */
  readonly itemsBought: number;
  /** The focused companion's level at end of day (Phase 14). */
  readonly petLevel: number;
}

/**
 * The average value of a piece from a given rarity table, at a level.
 *
 * Used for both ends of the gear trade: what a drop fetches when sold, and what a shelf piece
 * costs. Averaging the published table rather than rolling keeps the sim deterministic — the
 * bands are about *rates*, and a seeded roll would only add noise for them to tolerate.
 */
function averageValue(level: number, weights: Readonly<Record<Rarity, number>>): number {
  const total = RARITIES.reduce((sum, rarity) => sum + weights[rarity], 0);
  if (total === 0) return 0;

  return RARITIES.reduce(
    (sum, rarity) => sum + (weights[rarity] / total) * itemValue(level, rarity),
    0,
  );
}

/**
 * Expected **gold** from one card at Fortune's Table (gacha spec §4).
 *
 * Gold caches at face value plus gear cards at what they would sell for. Materials, Ale and set
 * pieces are deliberately worth zero here: they are real value, but they are not *gold*, and
 * counting them would let the faucet band pass on income the player cannot spend on training.
 * The weekly banner is the reference table — the other two differ by a point or two and the
 * bands are not that tight.
 */
function goldPerRoll(level: number): number {
  const table = banner('weekly');
  const share = (outcome: RollOutcome) => outcomeOdds(table, outcome) / 100;

  return (
    share('gold') * GOLD_CACHE_VIGOR * goldPerVigor(level) +
    share('epic') * itemValue(level, 'epic') +
    share('rare') * itemValue(level, 'rare') +
    share('uncommon') * itemValue(level, 'uncommon')
  );
}

export interface PlayStyle {
  /** Share of the day's Vigor actually spent. 1 = a completist, 0.4 = a busy Tuesday. */
  readonly vigorUsed: number;
  /** Preferred mission length. */
  readonly duration: MissionDuration;
  /** Hours of patrol run on a typical day (0 for a player who never uses it). */
  readonly patrolHours: number;
  /** Share of the purse spent on training each day, *after* gear and upkeep. */
  readonly trainingSpend: number;
  /** Pieces bought from a shop in a typical week (Phase 7). Zero for a pure looter. */
  readonly shopBuysPerWeek: number;
  /** Which stall they keep, or null for the ones who walk. */
  readonly mountId: MountId | null;
  /**
   * The hall's two tracks, as steps (Phase 10). Zero for the unguilded.
   *
   * Modelled rather than assumed away, because the buffs are large: a maxed pair is +25% on both
   * gold and XP, which is a bigger swing than any other lever in this file. A band tuned against
   * an unguilded player would quietly go slack the moment anyone joined a guild.
   */
  readonly treasuryStep?: number;
  readonly drillmasterStep?: number;
  /**
   * Cards pulled at Fortune's Table on a typical day (Phase 13).
   *
   * Everyone gets at least 1: the Daily Draw's card is free, so even the control takes it. Above
   * that it is Golden Dice, which are contested with Ale, the Griffin and shop rerolls — an
   * active player converting some of a ~1.6/day income into rolls lands a little over one.
   */
  readonly gachaRollsPerDay?: number;
  /**
   * Whether this player keeps a companion fed (Phase 14). Default true.
   *
   * Not a rate, because the pace is not the player's to choose: three feeds a day is the ceiling
   * and Tavern Scraps are the floor, so the model feeds as often as the bag allows and the
   * *drop rate* is what the band is really measuring.
   */
  readonly feedsPets?: boolean;
}

export const ACTIVE_PLAYER: PlayStyle = {
  vigorUsed: 1,
  duration: 20,
  patrolHours: 8,
  trainingSpend: 0.9,
  // Two upgrades a week is what "keeps their gear current" looks like at a 3.2× markup.
  shopBuysPerWeek: 2,
  mountId: 'warhorse',
  gachaRollsPerDay: 1.6,
};

/** Someone who opens the game once, spends half their Vigor and leaves. */
export const CASUAL_PLAYER: PlayStyle = {
  vigorUsed: 0.5,
  duration: 10,
  patrolHours: 10,
  trainingSpend: 0.9,
  shopBuysPerWeek: 1,
  mountId: 'mule',
  gachaRollsPerDay: 1,
};

/** The control: never shops, never rents. Proves neither is mandatory. */
export const FRUGAL_PLAYER: PlayStyle = {
  vigorUsed: 1,
  duration: 20,
  patrolHours: 8,
  trainingSpend: 0.9,
  shopBuysPerWeek: 0,
  // The free card only. A control that refused a free thing would not be modelling anybody.
  gachaRollsPerDay: 1,
  mountId: null,
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
  /** Where one focused companion got to (Phase 14). */
  readonly finalPetLevel: number;
}

/**
 * Play `days` days.
 *
 * The modelled player spends their Vigor on missions, runs a patrol shift overnight, sells the
 * loot they do not wear, keeps a mount, buys the odd upgrade from a shelf, and puts what is left
 * into training — the loop the game is actually asking for. Missions are assumed won: balancing
 * §5 puts an on-curve player at ≥97%, and modelling the 3% would add noise without changing any
 * ratio the bands care about.
 *
 * **Order of spending matters and is deliberate.** Upkeep and gear come out first, and training
 * takes a share of what survives — that is what makes training the *residual* sink the design
 * wants it to be, and it is why adding shops in Phase 7 correctly slowed attribute growth
 * instead of leaving it untouched.
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
  let xpTotal = 0;
  let purse = startGold;
  // Points bought per attribute, since `statCost` prices the *n*-th point of each one.
  const trained = { str: 0, dex: 0, int: 0, con: 0, lck: 0 };
  const attributes = Object.keys(trained) as (keyof typeof trained)[];
  let totalPointsBought = 0;

  // One companion, taken from level 1 toward the ceiling. Modelling a *focused* player rather
  // than one feeding all twelve is the honest read: the boost is one pet at a time, so there is
  // no reason to spread Scraps thin, and it is the pace of the single pet the spec makes a
  // claim about ("a month per pet").
  let scraps = 0;
  let petLevel = 1;

  for (let day = 1; day <= days; day += 1) {
    const vigorBudget = Math.floor(VIGOR_PER_DAY * style.vigorUsed);
    const missionsRun = Math.floor(vigorBudget / style.duration);

    // A guilded player is paid more for the same day's work, everywhere it applies.
    const bonus = guildMultipliers({
      isMember: (style.treasuryStep ?? 0) > 0 || (style.drillmasterStep ?? 0) > 0,
      treasuryStep: style.treasuryStep ?? 0,
      drillmasterStep: style.drillmasterStep ?? 0,
    });

    let missionGold = 0;
    let xpEarned = 0;
    for (let i = 0; i < missionsRun; i += 1) {
      const payout = missionPayout(level, style.duration, xpNeeded(level), bonus);
      missionGold += payout.gold;
      xpEarned += payout.xp;
      xpTotal += payout.xp;

      // Level up as it happens: later missions in the day pay the new level's rate, which is
      // what actually occurs in play and matters a lot in the first week.
      const levelled = applyXp(level, xp, payout.xp);
      level = levelled.level;
      xp = levelled.xp;
    }

    const patrolGold = Math.floor(goldPatrolPerHour(level) * style.patrolHours * bonus.gold);

    /*
     * Patrol pays experience too, and until the Phase 17 pacing pass this model did not count it.
     *
     * The omission was not small: eight hours of watch is `4 × xpPerVigor` an hour, which is
     * thirty-two Vigor-equivalents against a hundred spent on contracts — a third of the day's
     * progression, missing. Every level milestone this file reported was therefore pessimistic,
     * including the "L10 day 4" figure that had been sitting in `rewards.ts` as a measured fact
     * since Phase 6.
     */
    const patrolXp = Math.floor(
      xpPatrolPerHour(level, xpNeeded(level)) * style.patrolHours * bonus.xp,
    );
    if (patrolXp > 0) {
      xpEarned += patrolXp;
      xpTotal += patrolXp;
      const levelled = applyXp(level, xp, patrolXp);
      level = levelled.level;
      xp = levelled.xp;
    }

    // Loot sold. Every mission has a chance of an item; the player wears the occasional
    // upgrade and sells the rest, which is the same thing at this resolution.
    const dropTable = missionDropTable(style.duration);
    const salesGold = Math.floor(
      missionsRun * dropTable.itemChance * averageValue(level, dropTable.rarityWeights),
    );

    // ── Fortune's Table. Cards that are gear get sold at the same resolution as loot. ──
    const gachaGold = Math.floor((style.gachaRollsPerDay ?? 0) * goldPerRoll(level));

    purse += missionGold + patrolGold + salesGold + gachaGold;

    // ── Upkeep first: the mount is a standing arrangement, not a splurge. ──
    const mount = style.mountId ? MOUNTS_BY_ID[style.mountId] : null;
    const dailyMountCost = mount ? Math.round(mountPrice(mount, level).gold / MOUNT_TERM_DAYS) : 0;
    const mountSpend = Math.min(purse, dailyMountCost);
    purse -= mountSpend;

    // ── The Menagerie, same shape: a small standing habit, paid before the discretionary spend.
    // Scraps accumulate from the day's contracts and are spent as soon as there are enough,
    // which makes the *drop rate* — not the player's patience — the thing the band measures.
    scraps += missionsRun * SCRAP_DROP_CHANCE * SCRAPS_PER_DROP;
    let petSpend = 0;
    if (style.feedsPets !== false) {
      for (let fed = 0; fed < FEEDS_PER_DAY && petLevel < PET_MAX_LEVEL; fed += 1) {
        const cost = feedGoldCost(petLevel);
        if (scraps < SCRAPS_PER_FEED || purse < cost) break;
        scraps -= SCRAPS_PER_FEED;
        purse -= cost;
        petSpend += cost;
        petLevel += 1;
      }
    }

    // ── Then gear. Shop pieces cost 3.2× value, which is what makes buying a real decision. ──
    const shelfPrice = Math.round(averageValue(level, SHOP_RARITY_WEIGHTS) * SHOP_PRICE_MULTIPLIER);
    // Fractional buys per day are fine: the ledger is a rate, not a shopping list.
    const wantToBuy = style.shopBuysPerWeek / 7;
    const affordableBuys = shelfPrice > 0 ? Math.min(wantToBuy, purse / shelfPrice) : 0;
    const shopSpend = Math.floor(affordableBuys * shelfPrice);
    purse -= shopSpend;

    // ── Training takes a share of whatever survived. The residual sink, by design. ──
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
      earned: { missions: missionGold, patrol: patrolGold, sales: salesGold, gacha: gachaGold },
      spent: {
        training: spentOnTraining,
        shops: shopSpend,
        mounts: mountSpend,
        pets: petSpend,
      },
      xpEarned,
      xpTotal,
      pointsBought,
      purse,
      missionsRun,
      vigorUnspent: VIGOR_PER_DAY - vigorBudget,
      itemsBought: affordableBuys,
      petLevel,
    });
  }

  return {
    ledger,
    finalLevel: level,
    finalPurse: purse,
    totalPointsBought,
    finalPetLevel: petLevel,
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
