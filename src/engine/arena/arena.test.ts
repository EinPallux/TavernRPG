/**
 * Arena tests.
 *
 * Two acceptance criteria live here. **Fighting a bot uses its materialized combatant** — the
 * design promise is that bots are fair, and the only way to keep it is for the player's fights
 * and the simulation's fights to run the same code against the same numbers. And **the weekly
 * payout fires exactly once**, across a clock change and across an absence of any length, which
 * is the requirement that rules out every obvious implementation.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { CLASSES } from '@/data/classes';
import { addItem, createHero, equipItem } from '@/engine/hero/actions';
import { generateItem } from '@/engine/items/generate';
import { buildHeroCombatant, monsterStatBudget } from '@/engine/combat/combatant';
import { goldPerVigor, xpPerVigor } from '@/engine/progression/rewards';
import { xpNeeded } from '@/engine/progression/xp';
import type { Hero } from '@/engine/save/schema';
import { generateWorld, type WorldState } from '@/engine/world/generate';
import { materializeBot } from '@/engine/world/materialize';
import { joinLadder, newcomerHonor, PLAYER_LADDER_ID } from '@/engine/world/ladder';
import { updateRivals } from '@/engine/world/rivals';
import {
  COOLDOWN_MS,
  DRAW_SIZE,
  MAX_SKIPS_PER_DAY,
  REWARDED_WINS_PER_DAY,
  canSkipCooldown,
  drawBandFor,
  drawOpponents,
  isAttackable,
  isReady,
  isRewarded,
  msUntilReady,
  rerollCost,
  threatRead,
} from './arena';
import { ARENA_GOLD_FACTOR, ARENA_XP_FACTOR, MILESTONE_DICE, resolveDuel } from './duel';
import {
  MAX_RAID_CATCHUP_DAYS,
  REVENGE_QUEUE_CAP,
  clearGrudge,
  queueGrudges,
  runRaids,
} from './raids';
import { LEGENDS_SNAPSHOT_SIZE, diceForRank, totalDice, weekKeyFor, weeklyPayouts } from './payout';

const SEED = 20260730;
const T0 = Date.parse('2026-08-01T00:00:00Z');
const DAY = 86_400_000;

/** A world with the player seated at the foot of the ladder, as `ensureWorld` leaves it. */
function seatedWorld(): WorldState {
  const base = generateWorld(SEED, T0);
  return { ...base, ladder: joinLadder(base.ladder) };
}

const world = seatedWorld();
const playerRank = world.ladder.indexOf(PLAYER_LADDER_ID) + 1;

function hero(over: Partial<Hero> = {}): Hero {
  const base = createHero({
    name: 'Kargath',
    classId: 'warrior',
    now: T0,
    startingGold: 500,
    rng: createRng(9, 'starter'),
  });
  return { ...base, level: 30, honor: newcomerHonor(world.ladder.length), ...over };
}

/**
 * A hero who has kept up — gear at their level *and* gold spent on training.
 *
 * Bots are built off `buildReferenceCombatant`'s curves, which assume both halves. A test hero
 * carrying a starter kit and untouched attributes is not "a level-90 player", they are a level-90
 * nameplate on level-1 numbers, and they lose to rank 1,400. Anywhere these tests need the
 * player to plausibly *win*, they need this hero and not `hero({ level: 90 })`.
 */
function onCurveHero(level: number, over: Partial<Hero> = {}): Hero {
  let subject = hero({ level });
  const rng = createRng(77, 'test:on-curve');

  for (const slot of ['weapon', 'chest', 'helmet', 'gloves', 'boots', 'belt'] as const) {
    const item = generateItem({ slot, rarity: 'rare', classId: subject.classId, level, rng });
    subject = addItem(subject, item).hero;
    subject = equipItem(subject, item);
  }

  // The same 62/28/10 split `materializeBot` gives a bot on the same stat budget.
  const definition = CLASSES.find((entry) => entry.id === subject.classId)!;
  const budget = monsterStatBudget(level);
  return {
    ...subject,
    trained: {
      ...subject.trained,
      [definition.mainStat]: Math.round(budget * 0.62),
      con: Math.round(budget * 0.28),
      lck: Math.round(budget * 0.1),
    },
    ...over,
  };
}

/** Move the player to a rank so the draw has room either side. */
function atRank(rank: number): WorldState {
  const without = world.ladder.filter((id) => id !== PLAYER_LADDER_ID);
  const ladder = [...without.slice(0, rank - 1), PLAYER_LADDER_ID, ...without.slice(rank - 1)];
  return { ...world, ladder };
}

describe('the player is on the ladder', () => {
  it('joins at the foot of it', () => {
    expect(playerRank).toBe(world.ladder.length);
    expect(world.ladder.filter((id) => id === PLAYER_LADDER_ID)).toHaveLength(1);
  });

  it('joins once, however many times it is asked', () => {
    const twice = joinLadder(joinLadder(world.ladder));
    expect(twice.filter((id) => id === PLAYER_LADDER_ID)).toHaveLength(1);
  });

  it('makes the ladder 1,501 long', () => {
    expect(world.ladder).toHaveLength(1_501);
  });

  it('seeds a newcomer just under the bottom rung', () => {
    const honor = newcomerHonor(1_500);
    expect(honor).toBeGreaterThan(0);
    expect(honor).toBeLessThan(100);
  });
});

describe('the opponent draw', () => {
  const mid = atRank(700);
  const draw = drawOpponents(mid, 700, SEED, '2026-08-01', 0, T0);

  it('offers three', () => {
    expect(draw).toHaveLength(DRAW_SIZE);
    expect(new Set(draw).size).toBe(DRAW_SIZE);
  });

  it('never offers the player themselves', () => {
    expect(draw).not.toContain(PLAYER_LADDER_ID);
  });

  it('spans one above, one near and one below', () => {
    // The whole reason the draw is slotted rather than uniform: three strangers of no particular
    // significance is not a choice, it is a list.
    const ranks = draw.map((id) => mid.ladder.indexOf(id) + 1);
    expect(Math.min(...ranks)).toBeLessThan(700);
    expect(Math.max(...ranks)).toBeGreaterThan(700);
  });

  it('keeps everyone inside the band', () => {
    const band = drawBandFor(700, mid.ladder.length);
    for (const id of draw) {
      const rank = mid.ladder.indexOf(id) + 1;
      expect(Math.abs(rank - 700), `bot ${id} at ${rank}`).toBeLessThanOrEqual(band * 2);
    }
  });

  it('is stable for the day — a reload is not a free reroll', () => {
    expect(drawOpponents(mid, 700, SEED, '2026-08-01', 0, T0)).toEqual(draw);
  });

  it('changes on a reroll, and again tomorrow', () => {
    expect(drawOpponents(mid, 700, SEED, '2026-08-01', 1, T0)).not.toEqual(draw);
    expect(drawOpponents(mid, 700, SEED, '2026-08-02', 0, T0)).not.toEqual(draw);
  });

  it('still fills three cards at the very top of the ladder', () => {
    const top = atRank(2);
    expect(drawOpponents(top, 2, SEED, '2026-08-01', 0, T0)).toHaveLength(DRAW_SIZE);
  });

  it('still fills three cards at the very bottom', () => {
    const bottom = world.ladder.length;
    expect(drawOpponents(world, bottom, SEED, '2026-08-01', 0, T0)).toHaveLength(DRAW_SIZE);
  });

  it('skips the dormant — a sleeping hero is a wall, not a duel', () => {
    const asleep = {
      ...atRank(700),
      bots: world.bots.map((bot) => ({ ...bot, dormantUntil: T0 + DAY })),
    };
    expect(drawOpponents(asleep, 700, SEED, '2026-08-01', 0, T0)).toHaveLength(0);
  });

  it('offers nobody before the player has a rank', () => {
    expect(drawOpponents(world, 0, SEED, '2026-08-01', 0, T0)).toEqual([]);
  });

  it('widens the band the further down the ladder you are', () => {
    // ±4% of *ladder position*: near the top a handful of ranks is a big move, near the bottom
    // it is noise.
    expect(drawBandFor(1_400, 1_501)).toBeGreaterThan(drawBandFor(50, 1_501));
  });
});

describe('threat reads', () => {
  const player = buildHeroCombatant(hero(), 'player');

  it('calls a much stronger opponent dangerous', () => {
    const bully = { ...player, maxHealth: player.maxHealth * 3, weapon: { min: 999, max: 1200 } };
    expect(threatRead(player, bully).level).toBe('dangerous');
  });

  it('calls a much weaker one easy', () => {
    const weakling = {
      ...player,
      maxHealth: Math.round(player.maxHealth * 0.3),
      weapon: { min: 1, max: 2 },
      armour: 1,
    };
    expect(threatRead(player, weakling).level).toBe('easy');
  });

  it('calls a mirror even', () => {
    expect(threatRead(player, { ...player }).level).toBe('even');
  });

  it('never leaks a number', () => {
    // Scouting is post-1.0: a read is a hint, and a hint with a stat block in it is a lookup.
    const read = threatRead(player, { ...player, maxHealth: player.maxHealth * 2 });
    for (const line of [read.summary, ...read.notes]) {
      expect(line, line).not.toMatch(/\d/);
    }
  });

  it('always has something to say', () => {
    expect(threatRead(player, { ...player }).notes.length).toBeGreaterThan(0);
  });
});

describe('cooldown, rerolls and caps', () => {
  it('runs ten minutes between fights', () => {
    expect(msUntilReady(T0 + COOLDOWN_MS, T0)).toBe(COOLDOWN_MS);
    expect(isReady(T0 + COOLDOWN_MS, T0)).toBe(false);
    expect(isReady(T0 + COOLDOWN_MS, T0 + COOLDOWN_MS)).toBe(true);
  });

  it('never reports negative time', () => {
    expect(msUntilReady(T0, T0 + DAY)).toBe(0);
  });

  it('rerolls free once the cooldown has run out, and for a die before that', () => {
    expect(rerollCost(T0 + COOLDOWN_MS, T0)).toBe(1);
    expect(rerollCost(T0, T0 + COOLDOWN_MS)).toBe(0);
  });

  it('allows three cooldown skips a day and no more', () => {
    expect(canSkipCooldown(0)).toBe(true);
    expect(canSkipCooldown(MAX_SKIPS_PER_DAY - 1)).toBe(true);
    expect(canSkipCooldown(MAX_SKIPS_PER_DAY)).toBe(false);
  });

  it('pays for the first ten wins a day', () => {
    expect(isRewarded(0)).toBe(true);
    expect(isRewarded(REWARDED_WINS_PER_DAY - 1)).toBe(true);
    expect(isRewarded(REWARDED_WINS_PER_DAY)).toBe(false);
  });

  it('bands attacks the way the world sim does', () => {
    // One code path for who may fight whom, or the player and the bots live on different ladders.
    expect(isAttackable(500, 460)).toBe(true);
    expect(isAttackable(500, 510)).toBe(true);
    expect(isAttackable(500, 300)).toBe(false);
  });
});

describe('duels are the same fight a bot has — ROADMAP acceptance', () => {
  const mid = atRank(700);
  const opponentId = drawOpponents(mid, 700, SEED, '2026-08-01', 0, T0)[0]!;
  const opponent = mid.bots[opponentId]!;

  it('fights the opponent’s materialized combatant, not a stand-in', () => {
    const result = resolveDuel({
      hero: hero(),
      world: mid,
      opponent,
      rewardedWinsToday: 0,
      bestRank: 0,
      seed: 1,
    });

    const expected = materializeBot(mid.seed, opponent);
    // The log names the fighters, so it proves which numbers were on the other side.
    expect(result.battle.log[0]).toMatchObject({ t: 'battle_start' });
    const start = result.battle.log[0] as { b: { name: string; maxHealth: number } };
    expect(start.b.name).toBe(expected.name);
    expect(start.b.maxHealth).toBe(expected.maxHealth);
  });

  it('is deterministic in its seed', () => {
    const options = { hero: hero(), world: mid, opponent, rewardedWinsToday: 0, bestRank: 0 };
    expect(resolveDuel({ ...options, seed: 7 }).battle).toEqual(
      resolveDuel({ ...options, seed: 7 }).battle,
    );
    expect(resolveDuel({ ...options, seed: 8 }).battle).not.toEqual(
      resolveDuel({ ...options, seed: 7 }).battle,
    );
  });

  it('moves rank and honor only through the ladder service', () => {
    // Find a seed where the player wins against someone above them.
    const above = mid.ladder[650]!;
    const target = mid.bots[above]!;

    for (let seed = 1; seed < 60; seed += 1) {
      const result = resolveDuel({
        hero: onCurveHero(90),
        world: mid,
        opponent: target,
        rewardedWinsToday: 0,
        bestRank: 0,
        seed,
      });
      if (!result.won) continue;

      expect(result.outcome.swapped).toBe(true);
      expect(result.ladder.indexOf(PLAYER_LADDER_ID) + 1).toBe(result.outcome.attackerRankAfter);
      expect(result.rewards.honorDelta).toBeGreaterThan(0);
      // The defender pays exactly what the attacker gains.
      expect(target.honor - result.opponentHonor).toBe(result.rewards.honorDelta);
      return;
    }
    expect.unreachable('a level-90 hero should beat someone at rank 651 within 60 seeds');
  });

  it('pays the balancing §2 rates on a rewarded win', () => {
    const player = onCurveHero(90);
    for (let seed = 1; seed < 60; seed += 1) {
      const result = resolveDuel({
        hero: player,
        world: mid,
        opponent,
        rewardedWinsToday: 0,
        bestRank: 0,
        seed,
      });
      if (!result.won) continue;

      expect(result.rewards.gold).toBe(Math.round(ARENA_GOLD_FACTOR * goldPerVigor(90)));
      expect(result.rewards.xp).toBe(Math.round(ARENA_XP_FACTOR * xpPerVigor(90, xpNeeded(90))));
      return;
    }
    expect.unreachable('expected at least one win in 60 seeds');
  });

  it('stops paying past the daily cap but still swaps ranks', () => {
    const player = onCurveHero(90);
    for (let seed = 1; seed < 60; seed += 1) {
      const result = resolveDuel({
        hero: player,
        world: mid,
        opponent,
        rewardedWinsToday: REWARDED_WINS_PER_DAY,
        bestRank: 0,
        seed,
      });
      if (!result.won) continue;

      expect(result.rewards.gold).toBe(0);
      expect(result.rewards.xp).toBe(0);
      expect(result.rewards.pastCap).toBe(true);
      // The ladder is not a daily allowance.
      expect(result.outcome.attackerHonor).toBeGreaterThan(player.honor);
      return;
    }
    expect.unreachable('expected at least one win in 60 seeds');
  });

  it('costs honor and nothing else on a loss', () => {
    const weakling = hero({ level: 1, honor: 5_000 });
    for (let seed = 1; seed < 60; seed += 1) {
      const result = resolveDuel({
        hero: weakling,
        world: mid,
        opponent,
        rewardedWinsToday: 0,
        bestRank: 0,
        seed,
      });
      if (result.won) continue;

      expect(result.rewards.gold).toBe(0);
      expect(result.rewards.honorDelta).toBeLessThan(0);
      expect(result.outcome.swapped).toBe(false);
      return;
    }
    expect.unreachable('expected at least one loss in 60 seeds');
  });

  it('pays a milestone once and never again', () => {
    const near = atRank(101);
    const target = near.bots[near.ladder[95]!]!;

    for (let seed = 1; seed < 80; seed += 1) {
      const first = resolveDuel({
        hero: onCurveHero(92),
        world: near,
        opponent: target,
        rewardedWinsToday: 0,
        bestRank: 0,
        seed,
      });
      if (!first.won || first.rewards.milestone === null) continue;

      // A first-ever win landing inside the top 100 has cleared 500 on the way, so it pays both.
      // The stinger names the best rank reached; the purse is the sum.
      expect(first.rewards.milestone).toBe(100);
      expect(first.rewards.dice).toBe(MILESTONE_DICE[500]! + MILESTONE_DICE[100]!);

      // Same fight, but the high-water mark already sits where this win lands.
      const again = resolveDuel({
        hero: onCurveHero(92),
        world: near,
        opponent: target,
        rewardedWinsToday: 0,
        bestRank: first.outcome.attackerRankAfter,
        seed,
      });
      expect(again.rewards.milestone).toBeNull();
      expect(again.rewards.dice).toBe(0);

      // And a mark just *inside* the next bracket pays nothing more either — falling out of the
      // top 100 and climbing back is not a second payday.
      const returning = resolveDuel({
        hero: onCurveHero(92),
        world: near,
        opponent: target,
        rewardedWinsToday: 0,
        bestRank: 100,
        seed,
      });
      expect(returning.rewards.milestone).toBeNull();
      expect(returning.rewards.dice).toBe(0);
      return;
    }
    expect.unreachable('expected to cross a milestone within 80 seeds');
  });
});

describe('bot attacks and revenge', () => {
  const mid = atRank(700);
  const rivals = updateRivals({
    world: mid,
    playerRank: 700,
    current: [],
    now: T0,
    daysElapsed: 0,
  }).rivals;

  it('stays inside the daily cap over a week', () => {
    // One or two a day makes a morning eventful; twelve makes it punishing.
    const result = runRaids({
      hero: hero(),
      world: mid,
      rivals,
      from: T0,
      to: T0 + 7 * DAY,
      lastRaidDay: 0,
    });
    expect(result.grudges.length).toBeLessThanOrEqual(REVENGE_QUEUE_CAP);
  });

  it('is deterministic', () => {
    const options = {
      hero: hero(),
      world: mid,
      rivals,
      from: T0,
      to: T0 + 3 * DAY,
      lastRaidDay: 0,
    };
    expect(runRaids(options)).toEqual(runRaids(options));
  });

  it('does nothing when there is no time to cover', () => {
    const result = runRaids({ hero: hero(), world: mid, rivals, from: T0, to: T0, lastRaidDay: 0 });
    expect(result.grudges).toEqual([]);
    expect(result.ladder).toBe(mid.ladder);
  });

  it('does nothing to a player who is not on the ladder', () => {
    const bare = generateWorld(SEED, T0);
    const result = runRaids({
      hero: hero(),
      world: bare,
      rivals: [],
      from: T0,
      to: T0 + DAY,
      lastRaidDay: 0,
    });
    expect(result.grudges).toEqual([]);
    expect(result.heroHonor).toBe(hero().honor);
  });

  it('keeps the ladder intact however many raids land', () => {
    const result = runRaids({
      hero: hero(),
      world: mid,
      rivals,
      from: T0,
      to: T0 + 14 * DAY,
      lastRaidDay: 0,
    });
    expect(result.ladder).toHaveLength(mid.ladder.length);
    expect(new Set(result.ladder).size).toBe(mid.ladder.length);
  });

  it('never drives the player’s honor negative', () => {
    const broke = hero({ honor: 0 });
    const result = runRaids({
      hero: broke,
      world: mid,
      rivals,
      from: T0,
      to: T0 + 14 * DAY,
      lastRaidDay: 0,
    });
    expect(result.heroHonor).toBeGreaterThanOrEqual(0);
  });

  it('rolls a day once, however many times the save is reconciled', () => {
    // Caught by an e2e reload: the seed is the day index, so re-running a day picks the same
    // attacker and replays the same fight — and applies the honor loss again. Two honor went
    // missing across a page refresh. `lastRaidDay` is the fix and this is the regression.
    const first = runRaids({
      hero: hero(),
      world: mid,
      rivals,
      from: T0,
      to: T0 + 2 * DAY,
      lastRaidDay: 0,
    });
    expect(first.lastRaidDay).toBe(Math.floor((T0 + 2 * DAY) / DAY));

    const again = runRaids({
      hero: { ...hero(), honor: first.heroHonor },
      world: { ...mid, ladder: first.ladder },
      rivals,
      from: T0,
      to: T0 + 2 * DAY,
      lastRaidDay: first.lastRaidDay,
    });
    expect(again.grudges).toEqual([]);
    expect(again.heroHonor).toBe(first.heroHonor);
    expect(again.ladder).toEqual(first.ladder);
  });

  it('walks at most a fortnight, however long the absence', () => {
    // A player back after a year should not find a year of beatings waiting for them.
    const year = runRaids({
      hero: hero(),
      world: mid,
      rivals,
      from: T0 - 365 * DAY,
      to: T0,
      lastRaidDay: 0,
    });
    const fortnight = runRaids({
      hero: hero(),
      world: mid,
      rivals,
      from: T0 - MAX_RAID_CATCHUP_DAYS * DAY + DAY,
      to: T0,
      lastRaidDay: 0,
    });
    expect(year.grudges).toEqual(fortnight.grudges);
  });

  it('only queues the fights the player lost', () => {
    const queued = queueGrudges(
      [],
      [
        { botId: 1, at: T0, lost: true, ranksLost: 3 },
        { botId: 2, at: T0, lost: false, ranksLost: 0 },
      ],
    );
    expect(queued.map((g) => g.botId)).toEqual([1]);
  });

  it('caps the queue rather than growing a chore list', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      botId: i,
      at: T0 + i,
      lost: true,
      ranksLost: 1,
    }));
    expect(queueGrudges([], many)).toHaveLength(REVENGE_QUEUE_CAP);
  });

  it('de-duplicates when merged', () => {
    const one = { botId: 4, at: T0, lost: true, ranksLost: 1 };
    expect(queueGrudges([one], [one])).toHaveLength(1);
  });

  it('clears a grudge once it has been answered', () => {
    const queue = [
      { botId: 4, at: T0, lost: true, ranksLost: 1 },
      { botId: 9, at: T0, lost: true, ranksLost: 2 },
    ];
    expect(clearGrudge(queue, 4).map((g) => g.botId)).toEqual([9]);
  });
});

describe('the weekly payout — ROADMAP acceptance: exactly once', () => {
  it('names a week by the Sunday that ends it', () => {
    // 2026-08-01 is a Saturday; 2026-08-02 is the Sunday.
    expect(weekKeyFor('2026-08-01')).toBe('2026-08-02');
    expect(weekKeyFor('2026-08-02')).toBe('2026-08-02');
    expect(weekKeyFor('2026-08-03')).toBe('2026-08-09');
  });

  it('survives the spring-forward clock change', () => {
    // 2027-03-14 is the US spring-forward Sunday; a `YYYY-MM-DD` parsed as local *midnight*
    // can land in the missing hour and roll into the previous day. Midday cannot.
    for (const day of ['2027-03-13', '2027-03-14', '2027-03-15']) {
      expect(weekKeyFor(day), day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(weekKeyFor('2027-03-14')).toBe('2027-03-14');
    expect(weekKeyFor('2027-03-15')).toBe('2027-03-21');
  });

  it('survives the autumn fall-back too', () => {
    // 2026-11-01 is the fall-back Sunday — a 25-hour day.
    expect(weekKeyFor('2026-11-01')).toBe('2026-11-01');
    expect(weekKeyFor('2026-11-02')).toBe('2026-11-08');
  });

  it('pays once for a week, however many days of it were walked', () => {
    const payouts = weeklyPayouts({
      daysProcessed: ['2026-08-01', '2026-08-02', '2026-08-03'],
      lastPaidWeek: null,
      playerRank: 50,
      ladder: world.ladder,
    });
    expect(payouts).toHaveLength(1);
    expect(payouts[0]!.weekKey).toBe('2026-08-02');
  });

  it('pays nothing at all in a week with no Sunday in it', () => {
    const payouts = weeklyPayouts({
      daysProcessed: ['2026-08-03', '2026-08-04', '2026-08-05'],
      lastPaidWeek: null,
      playerRank: 50,
      ladder: world.ladder,
    });
    expect(payouts).toEqual([]);
  });

  it('pays once per Sunday across a month away', () => {
    // Four Sundays in the window, so four payouts — not thirty, and not one.
    const days: string[] = [];
    for (let day = 2; day <= 29; day += 1) {
      days.push(`2026-08-${String(day).padStart(2, '0')}`);
    }
    const payouts = weeklyPayouts({
      daysProcessed: days,
      lastPaidWeek: null,
      playerRank: 5,
      ladder: world.ladder,
    });

    expect(payouts.map((p) => p.weekKey)).toEqual([
      '2026-08-02',
      '2026-08-09',
      '2026-08-16',
      '2026-08-23',
    ]);
    expect(totalDice(payouts)).toBe(4 * 3);
  });

  it('never pays the same week twice', () => {
    const first = weeklyPayouts({
      daysProcessed: ['2026-08-02'],
      lastPaidWeek: null,
      playerRank: 1,
      ladder: world.ladder,
    });
    const again = weeklyPayouts({
      daysProcessed: ['2026-08-02'],
      lastPaidWeek: first[0]!.weekKey,
      playerRank: 1,
      ladder: world.ladder,
    });

    expect(first).toHaveLength(1);
    expect(again).toEqual([]);
  });

  it('pays by bracket', () => {
    expect(diceForRank(1)).toBe(5);
    expect(diceForRank(7)).toBe(3);
    expect(diceForRank(64)).toBe(2);
    expect(diceForRank(480)).toBe(1);
    expect(diceForRank(900)).toBe(0);
  });

  it('pays nobody who is not on the ladder', () => {
    expect(diceForRank(0)).toBe(0);
  });

  it('archives the top ten for the Legends tab', () => {
    const payouts = weeklyPayouts({
      daysProcessed: ['2026-08-02'],
      lastPaidWeek: null,
      playerRank: 50,
      ladder: world.ladder,
    });
    expect(payouts[0]!.legends).toHaveLength(LEGENDS_SNAPSHOT_SIZE);
    expect(payouts[0]!.legends[0]).toBe(world.ladder[0]);
  });

  it('does nothing when no day boundary was crossed', () => {
    expect(
      weeklyPayouts({ daysProcessed: [], lastPaidWeek: null, playerRank: 1, ladder: world.ladder }),
    ).toEqual([]);
  });
});
