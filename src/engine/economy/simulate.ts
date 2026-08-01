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
  ALE_VIGOR,
  ALE_PER_DAY,
  ALE_DICE_COST,
  goldPatrolPerHour,
  goldPerVigor,
  greenhornBonus,
  missionPayout,
  xpPatrolPerHour,
  xpPerVigor,
  type MissionDuration,
} from '@/engine/progression/rewards';
import { diceFor } from '@/engine/progression/dayWork';
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
import {
  STAGES_PER_CHAPTER,
  TOTAL_STAGES,
  chapterOf,
  stageLevel,
  stageMonster,
} from '@/data/campaign';
import { monstersInZone } from '@/data/monsters';
import { zonesForLevel, type ZoneId } from '@/data/zones';
import { albumBonus, albumProgress } from '@/engine/album/album';
import { STAGE_VIGOR_COST, stagePayout } from '@/engine/campaign/stages';
import { RARITIES, type Rarity } from '@/engine/items/types';

/**
 * Faucets and sinks the model currently understands. Grows as systems ship.
 *
 * `sales` and `shops`/`mounts` joined in Phase 7 when the Armory, the Facet and the Stables
 * opened; `gacha` in Phase 13 with Fortune's Table; `pets` in Phase 14 with the Menagerie;
 * `campaign` with the Long Road. Still absent: guild donations and dungeon gold — each lands with
 * its system, because a sim that invents numbers for unbuilt features asserts a fiction.
 */
export const MODELLED_FAUCETS = ['missions', 'patrol', 'sales', 'gacha', 'campaign'] as const;
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
  /** How far down the Long Road they have got. Monotone, and capped at `TOTAL_STAGES`. */
  readonly stagesCleared: number;
  /**
   * Album pages finished by the start of this day, and what the book was therefore paying.
   *
   * Recorded rather than left implicit because the album is a *permanent multiplier* on every
   * other faucet in this ledger — a reader who cannot see it has no way to tell a balance change
   * from a page landing.
   */
  readonly albumPages: number;
  readonly albumBonus: number;
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

/**
 * Is the road still worth the Vigor, looking at the *run* rather than the next stone?
 *
 * The rule this replaced compared one stage against the mission board and stopped the moment it
 * lost — and because the road is **contiguous**, stopping is permanent: the wall never moves, so
 * its level stays put while the hero's board rate keeps climbing. A guilded player, one level
 * ahead on day two, failed the test at stage 2 by three XP and never walked another step in
 * ninety days. The unguilded one, a level behind, passed it and walked all hundred and twenty.
 *
 * That is not a balance finding, it is the road's own shape misread — the same mistake this file's
 * first campaign model made from the other direction (CLAUDE.md: a simulated player has to be
 * modelled making the choice). You cannot skip stage 2 to reach stage 5; you eat the cheap ones to
 * get to the good ones, and the screen shows you the whole chapter's levels while you decide.
 *
 * So the comparison is the average over the rest of the chapter that is at or below the hero's
 * level — the natural unit, because a chapter ends in a boss and a Golden Die.
 */
function chapterBeatsTheBoard(
  from: number,
  level: number,
  bonus: { readonly gold: number; readonly xp: number },
  atTheBoard: number,
): boolean {
  const lastOfChapter = Math.min(chapterOf(from) * STAGES_PER_CHAPTER, TOTAL_STAGES);

  let total = 0;
  let stages = 0;
  for (let stage = from; stage <= lastOfChapter; stage += 1) {
    if (stageLevel(stage) > level) break;
    total += stagePayout(stage, level, bonus).xp;
    stages += 1;
  }

  return stages > 0 && total / stages >= atTheBoard;
}

/**
 * Expected draws to see every one of `n` equally likely things — the coupon-collector number,
 * `n·H(n)`.
 *
 * The mission board picks a monster uniformly from the zone's roster (`board.ts`), so this is
 * exactly how many contracts a player expects to win in a zone before its album page is full:
 * about 29 for a ten-monster zone, against the ten wins a "one of each" intuition would suggest.
 */
function couponDraws(n: number): number {
  let harmonic = 0;
  for (let term = 1; term <= n; term += 1) harmonic += 1 / term;
  return n * harmonic;
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
  /**
   * Whether this player walks the Long Road as far as it will let them each day. Default true.
   *
   * Not a rate, for the same reason `feedsPets` is not: the pace is not the player's to choose.
   * A stage costs one Vigor and the wall decides when the day out there is over, so what the
   * model varies is *whether* they go, and the road's own level curve does the rest.
   */
  readonly walksTheRoad?: boolean;
  /**
   * Whether this player's album fills at all. Default true.
   *
   * A flag rather than a rate, and it exists for the A/B: the album's whole effect is a
   * multiplier that compounds through the calendar, and the only honest way to measure it is to
   * run the same player twice. Nobody plays with it *off* — beating things is not optional.
   */
  readonly collectsTheAlbum?: boolean;
  /**
   * Ales this player drinks a day, or `'earned'` to spend exactly what the day's work pays for.
   *
   * `'earned'` is the honest default for anybody who spends their whole day: the track pays a die
   * at 50, 100 and 150 Vigor spent, three Ale costs three dice, and the third rung is only
   * reachable *with* the Ale — so a full-Vigor player breaks even on it and ends the day sixty
   * Vigor better off. That is the whole feature (balancing §18) and it is a real, sustained +60%
   * on everything Vigor buys, which is exactly the kind of change a band exists to catch.
   *
   * A number pins it instead, for the styles that model somebody who does not bother.
   */
  readonly ales?: number | 'earned';
}

/**
 * How much Ale this style drinks, which is a fixed point: the Ale buys the Vigor that pays the
 * dice that buy the Ale.
 *
 * Solved by walking up rather than algebra, because there are three rungs and the loop is over in
 * three steps. Each extra Ale is only bought if the *whole* run of Ales is still paid for by the
 * track — a player does not buy the third Ale on credit.
 */
export function alesADay(style: PlayStyle): number {
  if (typeof style.ales === 'number') return Math.max(0, Math.min(ALE_PER_DAY, style.ales));
  if (style.ales !== 'earned') return 0;

  let affordable = 0;
  for (let ale = 1; ale <= ALE_PER_DAY; ale += 1) {
    const spent = Math.floor((VIGOR_PER_DAY + ale * ALE_VIGOR) * style.vigorUsed);
    if (diceFor(spent) >= ale * ALE_DICE_COST) affordable = ale;
  }
  return affordable;
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
  // Spends the whole day, so the track pays for the Ale and the Ale pays the track back.
  ales: 'earned',
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
  // Half a day's Vigor reaches the first rung and no further: one die, one Ale.
  ales: 'earned',
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
  /*
   * The control still drinks what the day's work paid for.
   *
   * It is a control for *shopping and stabling* — "neither is mandatory" — and Ale is neither:
   * it is the track handing back what the day already earned. Pinning it to zero would have made
   * the frugal band measure Ale instead of gear, which is how a control quietly starts answering
   * a different question than the one it is named after.
   */
  ales: 'earned',
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
  /** How far down the Long Road they walked. */
  readonly finalStagesCleared: number;
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

  // The road, which is a hundred and twenty one-time payouts and then nothing forever.
  let stagesCleared = 0;

  /*
   * ── The Collector's Album ─────────────────────────────────────────────────────────
   *
   * A permanent multiplier on gold *and* experience that grows as the player finishes pages
   * (balancing §20), so it has to be in the model or every band past the first fortnight is
   * quietly optimistic about how long things take.
   *
   * Two fill paths, modelled differently because they *are* different:
   *
   * - **The road is exact.** Stage N stands on `stageMonster(N)`, so walking the road records a
   *   known list of ids and there is nothing to estimate. Chapter one covers the whole Whispering
   *   Woods roster by stage ten.
   * - **The board is a coupon-collector problem.** `board.ts` picks a monster uniformly from the
   *   zone's roster, so the expected number of wins to see all `n` of them is `n·H(n)` — about 29
   *   for a ten-monster zone. A page therefore completes once the player has won that many
   *   contracts in the zone, which is the central estimate rather than a bound in either
   *   direction.
   *
   * Dungeon pages are not modelled, for the reason the header gives about every unmodelled
   * system: the sim does not run delves, and inventing a floor-clear rate to fill three pages
   * with would be asserting a fiction. The consequence is stated rather than hidden — the album
   * bonus this sim reports tops out at the ten zone pages, +10% rather than the +18% ceiling.
   */
  const zoneWins = new Map<string, number>();
  const albumFoes = (): readonly string[] => {
    const foes: string[] = [];
    for (let stage = 1; stage <= stagesCleared; stage += 1) {
      const foe = stageMonster(stage);
      if (foe) foes.push(foe.id);
    }
    for (const [zoneId, wins] of zoneWins) {
      const roster = monstersInZone(zoneId as ZoneId);
      if (roster.length > 0 && wins >= couponDraws(roster.length)) {
        for (const foe of roster) foes.push(foe.id);
      }
    }
    return foes;
  };

  for (let day = 1; day <= days; day += 1) {
    /*
     * ── The day's Vigor, including whatever Ale the day's work paid for ───────────────
     *
     * `alesADay(style)` is where the new dice actually land. A player with spare dice and a
     * Vigor-shaped appetite buys Ale before they roll — Vigor compounds into gold, XP *and*
     * loot, and a card does not — so modelling the track's dice as extra gacha rolls would be
     * modelling the option rather than the choice (CLAUDE.md, the road's first sim made exactly
     * that mistake from the other direction).
     *
     * The Ale is only affordable because of the track, and the track only reaches its third rung
     * *because* of the Ale: the two are one loop and the model has to run both halves or the
     * number it reports is fiction.
     */
    const ales = alesADay(style);
    const vigorBudget = Math.floor((VIGOR_PER_DAY + ales * ALE_VIGOR) * style.vigorUsed);

    /*
     * A guilded player is paid more for the same day's work, everywhere it applies — and so is a
     * green one, until level `GREENHORN_UNTIL` (balancing §19). Multiplied together the way the
     * game folds them in `payoutBonus`, rather than modelled separately, because a sim that
     * composed them differently from the game would be measuring a third thing.
     */
    const hall = guildMultipliers({
      isMember: (style.treasuryStep ?? 0) > 0 || (style.drillmasterStep ?? 0) > 0,
      treasuryStep: style.treasuryStep ?? 0,
      drillmasterStep: style.drillmasterStep ?? 0,
    });
    const green = greenhornBonus(level);
    // The book, folded the same way and read at the *start* of the day, so a page finished this
    // afternoon pays from tomorrow rather than retroactively.
    const recorded = style.collectsTheAlbum === false ? [] : albumFoes();
    const book = albumBonus(recorded);
    const pagesComplete = albumProgress(recorded).pagesComplete;
    const bonus = { gold: hall.gold * green * book.gold, xp: hall.xp * green * book.xp };

    /*
     * ── The Long Road, taken off the top of the day's Vigor. ──────────────────────────
     *
     * First, because while the road is at your level a first clear is six Vigor-equivalents for
     * one Vigor, and a player who has noticed that walks it before they take a contract.
     * Modelling it the other way round would flatter the mission board with Vigor the road would
     * really have had.
     *
     * **Two conditions end the day out there, and both are needed.**
     *
     * The first is the wall: the player pushes while the next stage is levelled at or below them,
     * and pays one more Vigor for the attempt that finds it. That is right for an ordinary stage
     * (×0.92–1.12 budget against an on-curve hero) and optimistic at a chapter boss, which is
     * ×1.5 and measures a wall of up to six levels in `campaign.test.ts` — the correct direction
     * to be wrong in, since the question this faucet answers is whether the road can *out-earn*
     * the board.
     *
     * The second is interest, and the first version of this model did not have it. A stage pays
     * XP at the lower of the hero's level and the stage's, so once a player outruns the road it
     * stops being income and becomes content — and a model that kept walking anyway spent a
     * level-200 player's entire day on level-one stages and reported zero missions. The rule is
     * therefore the comparison the player actually makes: **walk while a stage's XP beats what
     * the same Vigor buys at the board.** No new number — both sides come from the shipped
     * formulas, and the hall's buff cancels because it applies to both.
     */
    let roadGold = 0;
    let roadXp = 0;
    let roadVigor = 0;
    if (style.walksTheRoad !== false) {
      for (;;) {
        const next = stagesCleared + 1;
        if (next > TOTAL_STAGES) break;
        if (roadVigor + STAGE_VIGOR_COST > vigorBudget) break;
        if (stageLevel(next) > level) {
          // The wall. The attempt that found it costs its Vigor and buys nothing.
          roadVigor += STAGE_VIGOR_COST;
          break;
        }

        const atTheBoard = xpPerVigor(level, xpNeeded(level)) * bonus.xp * STAGE_VIGOR_COST;
        if (!chapterBeatsTheBoard(next, level, bonus, atTheBoard)) break;

        const payout = stagePayout(next, level, bonus);

        roadGold += payout.gold;
        roadXp += payout.xp;
        roadVigor += STAGE_VIGOR_COST;
        stagesCleared += 1;
      }

      if (roadXp > 0) {
        xpTotal += roadXp;
        const levelled = applyXp(level, xp, roadXp);
        level = levelled.level;
        xp = levelled.xp;
      }
    }

    /*
     * What the board gets is the rest of the day, and the *rest* is the operative word.
     *
     * Fractional, because a whole number here would manufacture waste that no player suffers: a
     * road that costs two Vigor would drop a hundred-Vigor day from five twenty-minute contracts
     * to four and quietly bin the other eighteen, and the sim would report that as the road
     * costing a fifth of the mission board. A real player takes a short contract instead — the
     * board offers ten, twenty and thirty — so the Vigor is spent either way. Payout is linear in
     * duration (`missionPayout`), so a part contract is exactly a part payout, and this is the
     * same convention `itemsBought` has used for shop buys since Phase 7: the ledger is a rate,
     * not a shopping list.
     *
     * All three shipped styles divide exactly, so this is a no-op for every band tuned before the
     * road existed.
     */
    const missionsRun = (vigorBudget - roadVigor) / style.duration;

    /*
     * Where those contracts were taken, for the album's coupon collector above.
     *
     * Split evenly across the zones the board would offer at this level: `pickZone` prefers a
     * zone no other card on the board is using, so over a day of three-card boards the spread is
     * close to uniform and a model that sent every contract to one zone would finish that page
     * three times too fast.
     */
    const eligible = zonesForLevel(level);
    for (const eligibleZone of eligible) {
      zoneWins.set(
        eligibleZone.id,
        (zoneWins.get(eligibleZone.id) ?? 0) + missionsRun / eligible.length,
      );
    }

    let missionGold = 0;
    let xpEarned = roadXp;
    for (let run = 0; run < missionsRun; run += 1) {
      // The last contract of the day may be a short one; it pays its share.
      const share = Math.min(1, missionsRun - run);
      const full = missionPayout(level, style.duration, xpNeeded(level), bonus);
      const payout = { gold: Math.round(full.gold * share), xp: Math.round(full.xp * share) };
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

    purse += missionGold + patrolGold + salesGold + gachaGold + roadGold;

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
      earned: {
        missions: missionGold,
        patrol: patrolGold,
        sales: salesGold,
        gacha: gachaGold,
        campaign: roadGold,
      },
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
      stagesCleared,
      itemsBought: affordableBuys,
      petLevel,
      albumPages: pagesComplete,
      albumBonus: book.gold,
    });
  }

  return {
    ledger,
    finalLevel: level,
    finalPurse: purse,
    totalPointsBought,
    finalPetLevel: petLevel,
    finalStagesCleared: stagesCleared,
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
