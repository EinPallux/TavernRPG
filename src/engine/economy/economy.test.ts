/**
 * The economy simulation, as a CI gate (economy spec §6).
 *
 * The bands below are the shape of the game, not decoration. If a reward curve is nudged and
 * the loop stops being taut — the player suddenly rich, or suddenly unable to buy anything, or
 * levelling in a week — this fails the build rather than the player.
 *
 * The bands only cover what is *modelled*. Shops, mounts and the gacha are not built yet, so
 * asserting a post-splurge purse here would be asserting a fiction; those bands tighten as
 * `MODELLED_SINKS` grows. What *is* asserted is every ratio that holds regardless: pacing, the
 * gold/training relationship, and patrol staying the fallback rather than the strategy.
 */

import { describe, expect, it } from 'vitest';
import { statCost } from '@/engine/progression/stats';
import { xpNeeded } from '@/engine/progression/xp';
import { VIGOR_PER_DAY, vigorPerLevel, xpPerVigor } from '@/engine/progression/rewards';
import {
  ACTIVE_PLAYER,
  CASUAL_PLAYER,
  MODELLED_FAUCETS,
  simulateEconomy,
  totalEarned,
  totalSpent,
} from './simulate';

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
  it('unlocks the whole town within the first few days', () => {
    // Level 10 is the last feature gate. A player stuck below it is playing a demo, and the
    // original flat /320 divisor put this at day 29.
    expect(daysToLevel(10)).toBeLessThanOrEqual(6);
  });

  it('reaches the mid-game milestones roughly on schedule', () => {
    // §0 targets: L25 ~week 2, L55 ~day 30. Missions alone should land near but not before
    // these — dailies, arena and dungeons all add XP that this model does not include yet.
    expect(daysToLevel(25)).toBeGreaterThanOrEqual(8);
    expect(daysToLevel(25)).toBeLessThanOrEqual(18);

    expect(daysToLevel(55)).toBeGreaterThanOrEqual(24);
    expect(daysToLevel(55)).toBeLessThanOrEqual(45);
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

describe('the ledger itself', () => {
  const run = simulateEconomy({ days: 30 });

  it('balances — every coin is accounted for', () => {
    const finalPurse = run.ledger.reduce(
      (purse, day) =>
        purse + MODELLED_FAUCETS.reduce((s, f) => s + day.earned[f], 0) - day.spent.training,
      100,
    );
    expect(finalPurse).toBe(run.finalPurse);
  });

  it('never goes into debt', () => {
    for (const day of run.ledger) {
      expect(day.purse, `day ${day.day}`).toBeGreaterThanOrEqual(0);
      expect(day.spent.training, `day ${day.day}`).toBeGreaterThanOrEqual(0);
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
