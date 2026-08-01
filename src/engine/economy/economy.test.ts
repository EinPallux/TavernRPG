/**
 * The economy simulation, as a CI gate (economy spec §6).
 *
 * The bands below are the shape of the game, not decoration. If a reward curve is nudged and
 * the loop stops being taut — the player suddenly rich, or suddenly unable to buy anything, or
 * levelling in a week — this fails the build rather than the player.
 *
 * The bands only cover what is *modelled*. Shops, mounts and loot sales joined in Phase 7; the
 * gacha, guild donations and dungeon gold are still absent because they are not built, and
 * asserting a number for them would be asserting a fiction. Those bands tighten as
 * `MODELLED_SINKS` grows. What *is* asserted is every ratio that holds regardless: pacing, the
 * gold/training relationship, patrol staying the fallback rather than the strategy, and — as of
 * Phase 7 — that neither shopping nor a mount is mandatory.
 */

import { describe, expect, it } from 'vitest';
import { statCost } from '@/engine/progression/stats';
import { xpNeeded } from '@/engine/progression/xp';
import { VIGOR_PER_DAY, vigorPerLevel, xpPerVigor } from '@/engine/progression/rewards';
import {
  ACTIVE_PLAYER,
  CASUAL_PLAYER,
  FRUGAL_PLAYER,
  MODELLED_FAUCETS,
  MODELLED_SINKS,
  simulateEconomy,
  totalEarned,
  totalSpent,
} from './simulate';
import { PET_MAX_LEVEL } from '@/data/pets';
import { ALBUM_PAGES, ALBUM_PAGE_BONUS } from '@/data/album';
import { TOTAL_STAGES } from '@/data/campaign';
import { MOUNT_TERM_DAYS, mountPrice } from '@/engine/stables/mounts';
import { mount as mountDef } from '@/data/mounts';
import { goldPerVigor } from '@/engine/progression/rewards';

/** Days to reach a level, missions only, at the given daily Vigor spend. */
function daysToLevel(target: number, vigorPerDay = VIGOR_PER_DAY): number {
  let level = 1;
  let xp = 0;

  for (let day = 1; day <= 2_000; day += 1) {
    let budget = vigorPerDay;
    while (budget > 0) {
      const spend = Math.min(budget, 20);
      xp += xpPerVigor(level, xpNeeded(level)) * spend;
      budget -= spend;

      while (xp >= xpNeeded(level)) {
        xp -= xpNeeded(level);
        level += 1;
      }
    }
    if (level >= target) return day;
  }
  return Number.POSITIVE_INFINITY;
}

describe('pacing — balancing §0', () => {
  /*
   * The §0 *milestone table* is asserted in `engine/pacing/pacing.test.ts`, which reports
   * fractional days and models set pieces and rank as well as levels. What stays here is the
   * property this file is the right home for: the curve has a shape, and a flat divisor would
   * flatten it. Two owners for the same numbers is how bands drift apart.
   */
  it('unlocks the whole town within the first few days', () => {
    // Level 10 is the last feature gate. A player stuck below it is playing a demo, and the
    // original flat /320 divisor put this at day 29.
    expect(daysToLevel(10)).toBeLessThanOrEqual(6);
  });

  it('slows down as it climbs, rather than levelling at a flat rate forever', () => {
    // The bug the flat divisor caused, stated as a property: the hundredth level must cost
    // meaningfully more Vigor than the second.
    expect(vigorPerLevel(100)).toBeGreaterThan(vigorPerLevel(2) * 3);

    const earlyRate = 10 / daysToLevel(10);
    const lateRate = (100 - 55) / (daysToLevel(100) - daysToLevel(55));
    expect(lateRate).toBeLessThan(earlyRate);
  });

  it('does not let a half-hearted player stall out completely', () => {
    // Half the Vigor should still clear the feature gates inside a fortnight.
    expect(daysToLevel(10, VIGOR_PER_DAY / 2)).toBeLessThanOrEqual(14);
  });
});

describe('the "always slightly broke" band — economy §2', () => {
  const run = simulateEconomy({ days: 30 });

  it('keeps the purse near-empty rather than letting gold pile up', () => {
    // Gold exists to be spent on training. A player sitting on a hoard means the sink is too
    // weak, which is how idle games rot.
    const spendRatio = totalSpent(run.ledger) / totalEarned(run.ledger);
    expect(spendRatio).toBeGreaterThan(0.9);

    // End-of-day purse should stay small next to that day's income, every day.
    for (const day of run.ledger) {
      const income = MODELLED_FAUCETS.reduce((sum, f) => sum + day.earned[f], 0);
      expect(day.purse, `day ${day.day}`).toBeLessThan(income);
    }
  });

  it('always leaves something worth buying', () => {
    // The other failure mode: training so expensive that a day's income buys nothing, and the
    // loop goes dead. Every modelled day must afford at least one point.
    for (const day of run.ledger) {
      expect(day.pointsBought, `day ${day.day}`).toBeGreaterThan(0);
    }
  });

  it('tightens over time — the first day is a windfall, day 30 is a budget', () => {
    const firstWeek = run.ledger.slice(0, 7).reduce((sum, d) => sum + d.pointsBought, 0) / 7;
    const lastWeek = run.ledger.slice(-7).reduce((sum, d) => sum + d.pointsBought, 0) / 7;

    expect(lastWeek).toBeLessThan(firstWeek);
  });

  it('buys points at roughly the rate balancing §3 asks for', () => {
    // §3: a day's gold should buy around L/2 points early, decaying toward L/6 by level 100.
    // Checked as a band because the exact figure moves with every reward tweak.
    const day30 = run.ledger.at(-1)!;
    const perLevel = day30.pointsBought / day30.level;

    expect(perLevel).toBeGreaterThan(0.15);
    expect(perLevel).toBeLessThan(1.2);
  });
});

describe('patrol stays the fallback, not the strategy', () => {
  it('is a minority of an active player’s income', () => {
    const active = simulateEconomy({ days: 30, style: ACTIVE_PLAYER });
    const patrol = active.ledger.reduce((sum, d) => sum + d.earned.patrol, 0);
    const missions = active.ledger.reduce((sum, d) => sum + d.earned.missions, 0);

    expect(patrol).toBeLessThan(missions);
  });

  it('cannot out-progress actually playing', () => {
    // Someone who only patrols must fall behind someone who runs missions — otherwise the
    // core loop is optional, and an idle game with an optional core loop is just idle.
    const player = simulateEconomy({ days: 30, style: ACTIVE_PLAYER });
    const idler = simulateEconomy({
      days: 30,
      style: { ...ACTIVE_PLAYER, vigorUsed: 0, patrolHours: 12 },
    });

    expect(idler.finalLevel).toBeLessThan(player.finalLevel);
    expect(idler.totalPointsBought).toBeLessThan(player.totalPointsBought);
  });

  it('is still worth doing for someone who cannot play much', () => {
    const withPatrol = simulateEconomy({ days: 30, style: CASUAL_PLAYER });
    const without = simulateEconomy({ days: 30, style: { ...CASUAL_PLAYER, patrolHours: 0 } });

    expect(withPatrol.totalPointsBought).toBeGreaterThan(without.totalPointsBought);
  });
});

describe('shops and stables — Phase 7 sinks', () => {
  const shopper = simulateEconomy({ days: 60 });
  const frugal = simulateEconomy({ days: 60, style: FRUGAL_PLAYER });

  it('takes real money off the table — gear and upkeep are not decoration', () => {
    // If these round to nothing, the shop is a museum and training is the only sink again.
    const onGear = shopper.ledger.reduce((sum, day) => sum + day.spent.shops, 0);
    const onUpkeep = shopper.ledger.reduce((sum, day) => sum + day.spent.mounts, 0);
    const total = totalSpent(shopper.ledger);

    /*
     * The gear floor came down from 2% to 1.5% with the Collector's Album (balancing §20), and
     * the reason is a property of this band rather than of the shop.
     *
     * `shopBuysPerWeek` is a **fixed count**, and training takes a *share* of whatever survives —
     * so any feature that adds income raises the denominator and leaves the numerator where it
     * was. Sixty days of a book filling to nine pages is +9% on every coin, which moved the
     * measured share from just over the floor to 1.87% without a single thing about the Armory
     * changing. A player with more gold buys more gear; the model does not, and re-fitting the
     * floor is the honest response to a ratio the model cannot hold.
     *
     * What the band is still for is unchanged: at zero the shop is a museum and training is the
     * only sink again, and 1.5% is nowhere near zero.
     */
    expect(onGear / total).toBeGreaterThan(0.015);
    expect(onUpkeep / total).toBeGreaterThan(0.02);
  });

  it('keeps mount upkeep inside its designed share of income', () => {
    // §4: rentals are a recurring pinch. Above roughly a fifth of income they stop being a
    // choice and become a tax on playing.
    for (const day of shopper.ledger) {
      const income = MODELLED_FAUCETS.reduce((sum, f) => sum + day.earned[f], 0);
      if (income === 0) continue;
      expect(day.spent.mounts / income, `day ${day.day}`).toBeLessThan(0.25);
    }
  });

  it('prices a week of Warhorse against a week of income the way §4 promises', () => {
    for (const level of [10, 40, 90]) {
      const weekly = 7 * 100 * goldPerVigor(level);
      const rental = mountPrice(mountDef('warhorse'), level).gold;
      expect(rental / weekly, `level ${level}`).toBeGreaterThan(0.1);
      expect(rental / weekly, `level ${level}`).toBeLessThan(0.2);
      expect(MOUNT_TERM_DAYS).toBe(7);
    }
  });

  it('leaves neither shopping nor renting mandatory', () => {
    // The frugal player must still progress. A game where you *have* to shop to keep up is a
    // game with a soft paywall in it, dice or no dice.
    expect(frugal.finalLevel).toBeGreaterThanOrEqual(shopper.finalLevel);
    expect(frugal.totalPointsBought).toBeGreaterThan(shopper.totalPointsBought);
  });

  it('makes shopping cost attribute points — that is the whole trade', () => {
    // Gold spent on gear is gold not spent on training. If this ever came out level, the
    // markup would be doing nothing and the shop would be free power.
    expect(shopper.totalPointsBought).toBeLessThan(frugal.totalPointsBought);
  });

  it('sells loot for a meaningful but secondary share of income', () => {
    // Sales should matter without rivalling the mission faucet, or the loop becomes "farm
    // vendor trash" instead of "run missions".
    const sales = shopper.ledger.reduce((sum, day) => sum + day.earned.sales, 0);
    const earned = totalEarned(shopper.ledger);

    expect(sales / earned).toBeGreaterThan(0.01);
    expect(sales / earned).toBeLessThan(0.25);
  });

  it('keeps Fortune\u2019s Table a garnish rather than a wage', () => {
    /*
     * The gacha is a *dice* sink first; the gold it returns is incidental, and it has to stay
     * that way. If rolling ever paid better per day than running missions, the correct play
     * would be to stop playing the game and spin the wheel — which is the exact failure mode
     * the F2P covenant exists to avoid.
     */
    const gacha = shopper.ledger.reduce((sum, day) => sum + day.earned.gacha, 0);
    const missions = shopper.ledger.reduce((sum, day) => sum + day.earned.missions, 0);
    const earned = totalEarned(shopper.ledger);

    expect(gacha / earned).toBeGreaterThan(0.001);
    expect(gacha / earned).toBeLessThan(0.12);
    expect(gacha).toBeLessThan(missions);
  });

  it('never lets a shop purchase overdraw the purse', () => {
    for (const day of shopper.ledger) {
      expect(day.spent.shops, `day ${day.day}`).toBeGreaterThanOrEqual(0);
      expect(day.itemsBought, `day ${day.day}`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the ledger itself', () => {
  const run = simulateEconomy({ days: 30 });

  it('balances — every coin is accounted for', () => {
    // Sums the constants rather than naming sinks: a faucet or sink added without a ledger
    // entry has to fail here, which is the only thing making this an audit rather than a
    // restatement of the code.
    const finalPurse = run.ledger.reduce(
      (purse, day) =>
        purse +
        MODELLED_FAUCETS.reduce((s, f) => s + day.earned[f], 0) -
        MODELLED_SINKS.reduce((s, k) => s + day.spent[k], 0),
      100,
    );
    expect(finalPurse).toBe(run.finalPurse);
  });

  it('never goes into debt', () => {
    for (const day of run.ledger) {
      expect(day.purse, `day ${day.day}`).toBeGreaterThanOrEqual(0);
      for (const sink of MODELLED_SINKS) {
        expect(day.spent[sink], `day ${day.day} ${sink}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is deterministic — the same inputs give the same 30 days', () => {
    expect(simulateEconomy({ days: 30 })).toEqual(simulateEconomy({ days: 30 }));
  });

  it('charges the published price for each point bought', () => {
    // Cross-check against `statCost` directly, so a sim that quietly drifted from the real
    // curve would fail here rather than silently bless a broken economy.
    const oneDay = simulateEconomy({ days: 1, startGold: 1_000 });
    const day = oneDay.ledger[0]!;

    let expected = 0;
    const trained = [0, 0, 0, 0, 0];
    for (let i = 0; i < day.pointsBought; i += 1) {
      const cheapest = trained.indexOf(Math.min(...trained));
      expected += statCost(trained[cheapest] ?? 0);
      trained[cheapest] = (trained[cheapest] ?? 0) + 1;
    }
    expect(day.spent.training).toBe(expected);
  });
});

describe('a hall changes the numbers — Phase 10', () => {
  const unguilded = simulateEconomy({ days: 30 });
  // A player two months into an established hall: both tracks well up, neither maxed.
  const guilded = simulateEconomy({
    days: 30,
    style: { ...ACTIVE_PLAYER, treasuryStep: 60, drillmasterStep: 40 },
  });

  it('pays a guilded player more for the same day’s work', () => {
    expect(totalEarned(guilded.ledger)).toBeGreaterThan(totalEarned(unguilded.ledger));
  });

  it('compounds the two tracks without running away', () => {
    // Treasury 60 is +15% on the coin. Thirty days of it earns *more* than 15% more, because
    // Drillmaster's +10% XP puts the player a couple of levels ahead and the gold curve pays by
    // level — the two tracks multiply through the calendar rather than simply adding.
    //
    // So the band is deliberately wider than the published cap, and the thing it is actually
    // guarding is that the compounding stays a nudge: an off-by-one in the step maths (0.25%
    // read as 2.5%) would land far outside it.
    /*
     * The floor came down from 1.15 to 1.08 with the greenhorn's due (balancing §19), and the
     * reason is worth reading rather than absorbing: the bonus is a **partial equaliser**.
     * A guilded player levels faster, so they spend fewer days inside the ×1.6–×1 band, so their
     * head start is smaller in the first month than it used to be. The advantage is not gone — it
     * reappears in full the moment both players are past level 25, which is what the isolated
     * single-day check below measures. What this band still catches is the thing it was written
     * for: an off-by-one in the step maths lands nowhere near either end.
     */
    const ratio = totalEarned(guilded.ledger) / totalEarned(unguilded.ledger);
    expect(ratio).toBeGreaterThan(1.08);
    expect(ratio).toBeLessThan(1.45);
  });

  it('applies exactly the published multiplier on any single day, level held', () => {
    /*
     * The direct claim, isolated from the compounding above.
     *
     * Level 200 rather than 40, and the level is the whole point: patrol gold is priced off the
     * level *after* the day's missions, so at 40 the buffed player's extra XP levels them up
     * mid-day and their patrol gold beats the multiplier for a reason that is not the multiplier.
     * High enough up the curve that one day cannot cross a level, the claim is clean again.
     */
    const oneDay = (steps: { treasuryStep: number; drillmasterStep: number }) =>
      simulateEconomy({ days: 1, startLevel: 200, style: { ...ACTIVE_PLAYER, ...steps } })
        .ledger[0]!;

    const plain = oneDay({ treasuryStep: 0, drillmasterStep: 0 });
    const buffed = oneDay({ treasuryStep: 60, drillmasterStep: 40 });

    expect(buffed.earned.patrol / plain.earned.patrol).toBeCloseTo(1.15, 2);
    expect(buffed.earned.missions / plain.earned.missions).toBeCloseTo(1.15, 2);
  });

  it('advances a guilded player faster without breaking the pacing band', () => {
    // Drillmaster 40 is +10% XP. Faster, but nowhere near a different game — if joining a guild
    // halved the time to level 50, the whole §0 curve would be a lie for anybody in one.
    expect(guilded.finalLevel).toBeGreaterThanOrEqual(unguilded.finalLevel);
    expect(guilded.finalLevel).toBeLessThan(unguilded.finalLevel + 6);
  });

  it('leaves the unguilded player exactly where they were', () => {
    // The regression that matters most: every band above this one is tuned against a player in
    // no guild, and adding the lever must not have moved them.
    expect(simulateEconomy({ days: 30, style: ACTIVE_PLAYER })).toEqual(unguilded);
  });

  it('still keeps them slightly broke rather than rich', () => {
    // The economy's whole stance (§2). A hall should make a player *faster*, not solvent.
    const late = guilded.ledger.slice(-7);
    for (const day of late) {
      expect(day.purse, `day ${day.day}`).toBeLessThan(day.earned.missions * 6);
    }
  });
});

describe('the Menagerie is a habit, not a bill — Phase 14', () => {
  const run = simulateEconomy({ days: 35 });

  it('takes one companion to the ceiling in about a month', () => {
    /*
     * The claim `data/pets.ts` makes out loud, measured against the actual Scrap supply rather
     * than against the three-a-day cap. At 8% × 2 this test would have read ~62 days, which is
     * how the Phase 14 pass found the rate was half what the copy promised.
     *
     * Re-fitted for the day's work (balancing §18): Scrap comes off contracts, self-funded Ale
     * buys 60% more of them, and the companion now arrives on about day 20 rather than 25. The
     * band moves with the supply because that is what it measures — the alternative is a band
     * that fails on the game getting more generous, which is the failure mode `MILESTONE_KIND`
     * exists to name.
     */
    const maxedOn = run.ledger.findIndex((day) => day.petLevel >= PET_MAX_LEVEL) + 1;
    expect(maxedOn).toBeGreaterThan(15);
    expect(maxedOn).toBeLessThan(30);
  });

  it('is the smallest sink on the board, by a wide margin', () => {
    // Feeding must never compete with training. If this band breaks upward, the pet has stopped
    // being "deliberately minor" in the only currency the player actually feels.
    const pets = run.ledger.reduce((sum, day) => sum + day.spent.pets, 0);
    const share = pets / totalSpent(run.ledger);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(0.03);

    for (const sink of ['training', 'shops', 'mounts'] as const) {
      const other = run.ledger.reduce((sum, day) => sum + day.spent[sink], 0);
      expect(other, sink).toBeGreaterThan(pets);
    }
  });

  it('costs a growing pet more, so late feeds are a real decision', () => {
    /*
     * Both windows have to contain feeding or this measures nothing.
     *
     * They used to be days 1–5 against 21–25, which stopped working the day the companion
     * started maxing out around day 20 — the late window went to zero and the assertion failed
     * for the opposite of the reason it was written. The windows are placed relative to the
     * ceiling now rather than at fixed days, so the curve is what is under test.
     */
    const maxedOn = run.ledger.findIndex((day) => day.petLevel >= PET_MAX_LEVEL);
    expect(maxedOn, 'the pet never grew up').toBeGreaterThan(9);

    const early = run.ledger.slice(0, 5).reduce((sum, day) => sum + day.spent.pets, 0);
    const late = run.ledger
      .slice(maxedOn - 5, maxedOn)
      .reduce((sum, day) => sum + day.spent.pets, 0);
    expect(late).toBeGreaterThan(early * 3);
  });

  it('stops charging once the pet is grown', () => {
    const grown = run.ledger.filter((day) => day.petLevel >= PET_MAX_LEVEL);
    expect(grown.length).toBeGreaterThan(0);
    // Every day after the ceiling is a free day — a feed that charges for nothing would be the
    // sort of leak the ledger exists to catch.
    for (const day of grown.slice(1)) expect(day.spent.pets, `day ${day.day}`).toBe(0);
  });

  it('leaves a player who never visits the Menagerie exactly where they were', () => {
    // Same guard as the guild lever: every band above this one is tuned against a player who
    // does feed, and the room must stay optional.
    const skipped = simulateEconomy({ days: 35, style: { ...ACTIVE_PLAYER, feedsPets: false } });
    expect(skipped.finalPetLevel).toBe(1);
    expect(skipped.ledger.every((day) => day.spent.pets === 0)).toBe(true);
    // Not feeding leaves you slightly richer, and therefore slightly better trained. Slightly.
    expect(skipped.totalPointsBought).toBeGreaterThanOrEqual(run.totalPointsBought);
    expect(skipped.finalLevel).toBe(run.finalLevel);
  });
});

describe('the Long Road is a head start, not an income', () => {
  const run = simulateEconomy({ days: 90 });
  const roadless = simulateEconomy({ days: 90, style: { ...ACTIVE_PLAYER, walksTheRoad: false } });
  const roadGold = (days: typeof run.ledger) =>
    days.reduce((sum, day) => sum + day.earned.campaign, 0);

  it('never out-earns the mission board, on any day of the run', () => {
    /*
     * The band the whole faucet exists for. One Vigor a stage against ten to thirty for a
     * contract makes a first clear six times the rate — and if that were the *whole* story the
     * mission board would be a worse version of the road and the Gilded Tankard would be
     * decoration. What stops it is that the road pays once and is only a hundred and twenty
     * stages long, so its income is bounded no matter how well it is played.
     */
    for (const day of run.ledger) {
      expect(day.earned.campaign, `day ${day.day}`).toBeLessThan(day.earned.missions);
    }
  });

  it('is a tenth of the first week and a twentieth of the third month', () => {
    const share = (days: typeof run.ledger) => roadGold(days) / totalEarned(days);

    // Front-loaded on purpose: on day one it is the only thing a new hero can push into.
    expect(share(run.ledger.slice(0, 7))).toBeGreaterThan(0.05);
    expect(share(run.ledger.slice(0, 7))).toBeLessThan(0.2);
    /*
     * Still small in its last week, and then gone.
     *
     * This used to sample day 60 onward, which stopped containing any road at all once the
     * day's work put 60% more Vigor in the day and the hundred and twenty stages were walked out
     * by day 59. Sampling the tail *of the road* rather than a fixed calendar week is what the
     * claim was always about: it never becomes the game while it lasts, and then it ends.
     */
    const lastDay = run.ledger.findIndex((day) => day.stagesCleared === TOTAL_STAGES);
    expect(lastDay, 'the road never finished').toBeGreaterThan(7);
    const finalWeek = run.ledger.slice(Math.max(0, lastDay - 7), lastDay);
    expect(share(finalWeek)).toBeGreaterThan(0);
    expect(share(finalWeek)).toBeLessThan(0.05);
  });

  it('never eats the day — the mission board keeps its Vigor', () => {
    /*
     * A stage pays XP at the lower of the hero's level and the stage's, so a hero far up the
     * curve gets nothing from chapter one. The first version of this model did not know that and
     * spent a high-level player's entire hundred Vigor on level-one stages, reporting zero
     * missions — which is not a balance finding, it is a model that had never been asked what a
     * player would actually do.
     */
    for (const day of run.ledger) {
      expect(day.missionsRun, `day ${day.day}`).toBeGreaterThan(4);
    }
  });

  it('runs out — a hundred and twenty stages and not one more', () => {
    expect(run.finalStagesCleared).toBe(TOTAL_STAGES);
    // Monotone: a cleared stage is cleared forever.
    for (let index = 1; index < run.ledger.length; index += 1) {
      expect(run.ledger[index]!.stagesCleared).toBeGreaterThanOrEqual(
        run.ledger[index - 1]!.stagesCleared,
      );
    }
    // And once it is walked it is over: no further income, ever.
    const finished = run.ledger.findIndex((day) => day.stagesCleared === TOTAL_STAGES);
    expect(finished).toBeGreaterThan(0);
    for (const day of run.ledger.slice(finished + 1)) {
      expect(day.earned.campaign, `day ${day.day}`).toBe(0);
    }
  });

  it('is as long as the level curve, rather than ending in the middle of it', () => {
    /*
     * A content length check, and the one number that would be embarrassing to get wrong in
     * either direction. The last chapter is levelled 89–100; a player who finishes the road at
     * level 40 was given a road too short to matter, and one who is level 100 with thirty stages
     * left has a road that outlived its own rewards.
     *
     * Three months of daily play, ending within a few levels of the cap, is the shape §0 asks
     * for — and it falls out of the chapter table rather than being arranged.
     */
    /*
     * The **level** is the load-bearing half and it is unchanged: the road still ends within a
     * few levels of the cap. The day moved from ~86 to ~59 when self-funded Ale added 60% to the
     * day's Vigor (balancing §18) — a player who walks it faster is not a road that got shorter,
     * and pinning the calendar here would fail on the game getting more generous while the thing
     * the check is named after held perfectly.
     */
    const finished = run.ledger.find((day) => day.stagesCleared === TOTAL_STAGES)!;
    expect(finished.day).toBeGreaterThan(40);
    expect(finished.level).toBeGreaterThan(90);
  });

  it('is worth walking — a level or two ahead, not a different game', () => {
    expect(run.finalLevel).toBeGreaterThan(roadless.finalLevel);
    expect(run.finalLevel).toBeLessThan(roadless.finalLevel + 8);
  });

  it('leaves a player who never leaves town exactly where they were', () => {
    // The same guard the guild lever and the Menagerie carry: every band tuned before the road
    // existed was tuned against this player, and the gate has to stay optional.
    expect(roadless.finalStagesCleared).toBe(0);
    expect(roadless.ledger.every((day) => day.earned.campaign === 0)).toBe(true);
  });
});

/**
 * The 90-day horizon (ROADMAP Phase 17: "economy 90-day sim bands finalized").
 *
 * Every band above this runs at 30 days, which is where the loop is *tightest* — a month in, the
 * player is still buying their first attribute points and every faucet matters. Three months in
 * is a different game: the costs have compounded, the purse turns over faster than it fills, and
 * a ratio that looked stable at day 30 can be quietly diverging. These are the bands that catch
 * a curve that is fine early and wrong later, which is the failure mode a 30-day gate cannot see.
 *
 * `npm run tuning` prints the same run in full if you want to look at it rather than assert it.
 */
describe('the 90-day horizon', () => {
  const long = simulateEconomy({ days: 90 });
  const month = simulateEconomy({ days: 30 });

  it('is deterministic at three months, like it is at one', () => {
    expect(simulateEconomy({ days: 90 })).toEqual(long);
  });

  it('keeps the first thirty days intact — the horizon changes nothing behind it', () => {
    // A sim whose early days depend on how long it is asked to run is a sim measuring itself.
    expect(long.ledger.slice(0, 30)).toEqual(month.ledger);
  });

  it('still spends nearly everything it earns', () => {
    const earned = totalEarned(long.ledger);
    const spent = totalSpent(long.ledger);
    // Hoarding is the tell for a sink that has stopped scaling. A player three months in should
    // be within a rounding error of broke, because training always costs more than they have.
    expect(spent / earned).toBeGreaterThan(0.99);
    expect(long.finalPurse / earned).toBeLessThan(0.01);
  });

  it('leaves training the dominant sink at three months, not just at one', () => {
    const share = (days: typeof long.ledger) =>
      days.reduce((sum, day) => sum + day.spent.training, 0) / totalSpent(days);

    expect(share(long.ledger)).toBeGreaterThan(0.8);
    // And it should *grow*: §2 calls training "the endless one", and the mount is a flat weekly
    // fee while the next attribute point never stops getting dearer.
    expect(share(long.ledger)).toBeGreaterThan(share(month.ledger) - 0.05);
  });

  it('keeps shops a gear-supply valve rather than a gold sink, at both horizons', () => {
    const shops = long.ledger.reduce((sum, day) => sum + day.spent.shops, 0);
    expect(shops / totalSpent(long.ledger)).toBeLessThan(0.1);
    expect(long.ledger.reduce((sum, day) => sum + day.itemsBought, 0)).toBeGreaterThan(20);
  });

  it('does not stall — the third month still earns more than the first', () => {
    const earnedIn = (from: number, to: number) =>
      long.ledger.slice(from, to).reduce((sum, day) => sum + totalEarned([day]), 0);

    expect(earnedIn(60, 90)).toBeGreaterThan(earnedIn(0, 30) * 2);
  });

  it('does not run away either — the curve compounds, it does not explode', () => {
    /*
     * The band that would have caught a runaway multiplier. Income scales with level and level
     * scales with income, so the loop is a feedback one; what keeps it honest is that costs
     * scale faster. Twenty-five times the first month over the third is generous headroom for
     * a healthy curve and nowhere near what a compounding bug produces.
     */
    const earnedIn = (from: number, to: number) =>
      long.ledger.slice(from, to).reduce((sum, day) => sum + totalEarned([day]), 0);

    expect(earnedIn(60, 90)).toBeLessThan(earnedIn(0, 30) * 25);
  });

  it('rewards three months of daily play with a level a casual player has not reached', () => {
    const casual = simulateEconomy({ days: 90, style: CASUAL_PLAYER });
    expect(long.finalLevel).toBeGreaterThan(casual.finalLevel);
    /*
     * But not by so much that half-Vigor play is a different game. Playing more should be worth
     * playing more, not worth everything.
     *
     * The floor moved from 0.7 to 0.65 with the day's work, and the two points are the feature
     * working as intended rather than drift: the track pays for *spending*, so a full-Vigor day
     * self-funds three Ale and a half-Vigor day self-funds one. That widens the gap on purpose.
     * Two points of widening is not a cliff; if this ever needs to move again, the question to
     * ask is whether the rungs have got too far apart for a shorter day to reach.
     */
    expect(casual.finalLevel).toBeGreaterThan(long.finalLevel * 0.65);
  });

  it('never leaves a day unaccounted for', () => {
    expect(long.ledger).toHaveLength(90);
    expect(long.ledger.map((day) => day.day)).toEqual(
      Array.from({ length: 90 }, (_, index) => index + 1),
    );
  });
});

describe('the Collector’s Album is a slow, permanent raise', () => {
  const collector = simulateEconomy({ days: 90 });
  const blind = simulateEconomy({ days: 90, style: { ...ACTIVE_PLAYER, collectsTheAlbum: false } });
  const at = (run: typeof collector, day: number) => run.ledger[day - 1]!;

  it('fills at the pace the design claims — pages in months, not days', () => {
    /*
     * The two-sided band. Too fast and a completion bonus is a first-week freebie; too slow and
     * the ceiling is a lie on the screen (CLAUDE.md: a cap the game cannot supply). The model
     * fills from the road exactly and from the board by coupon collector, and it does not model
     * delves at all — so these are *zone* pages, and the ten of them are the sim's ceiling.
     */
    expect(at(collector, 1).albumPages).toBe(0);
    expect(at(collector, 7).albumPages).toBeGreaterThanOrEqual(1);
    expect(at(collector, 7).albumPages).toBeLessThanOrEqual(6);
    expect(at(collector, 30).albumPages).toBeGreaterThanOrEqual(6);
    expect(at(collector, 90).albumPages).toBeLessThanOrEqual(ALBUM_PAGES.length);
  });

  it('never takes a page away', () => {
    // A page is finished forever. If this ever falls, something is *recomputing* the book from
    // present state rather than reading a set that only grows.
    let highest = 0;
    for (const day of collector.ledger) {
      expect(day.albumPages).toBeGreaterThanOrEqual(highest);
      highest = day.albumPages;
    }
  });

  it('pays exactly what the pages it has finished are worth', () => {
    // The ledger's bonus is the fold's, not a second copy of the rate.
    for (const day of collector.ledger) {
      expect(day.albumBonus).toBeCloseTo(1 + day.albumPages * ALBUM_PAGE_BONUS, 10);
    }
    expect(blind.ledger.every((day) => day.albumBonus === 1)).toBe(true);
  });

  it('is a nudge over three months rather than a second economy', () => {
    /*
     * The A/B. Everything else about these two players is identical, so the whole difference is
     * the book — and it compounds, because the bonus buys levels and the gold curve pays by
     * level. A single-digit multiplier over ninety days should land as a single-digit lead.
     */
    const ratio = totalEarned(collector.ledger) / totalEarned(blind.ledger);
    expect(ratio).toBeGreaterThan(1.02);
    expect(ratio).toBeLessThan(1.2);

    // And it must not turn into a different level curve — §0 is the gate the pacing sim guards,
    // and this is the cheap check that the album is nowhere near moving it.
    expect(collector.finalLevel).toBeGreaterThanOrEqual(blind.finalLevel);
    expect(collector.finalLevel).toBeLessThan(blind.finalLevel * 1.15);
  });
});
