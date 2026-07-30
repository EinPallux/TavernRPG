/**
 * Arena transition tests — the wiring, not the maths.
 *
 * The engine's own tests (`src/engine/arena/arena.test.ts`) prove the draw, the duel and the
 * payout are right in isolation. What this file proves is that the save actually carries them:
 * the player has a seat on the ladder, the counters clear at midnight and only at midnight, the
 * Sunday purse is paid exactly once however the boundaries arrive, and the ladder written back
 * after a fight is the one the fight produced.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { GameClock, createFixedWallClock } from '@/engine/clock';
import { createHero } from '@/engine/hero/actions';
import { createNewSave, DEFAULT_ARENA, type SaveFile } from '@/engine/save/schema';
import { PLAYER_LADDER_ID } from '@/engine/world/ladder';
import { DRAW_SIZE, MAX_SKIPS_PER_DAY, REWARDED_WINS_PER_DAY } from '@/engine/arena/arena';
import { diceForRank } from '@/engine/arena/payout';
import {
  applyRaids,
  drawnOpponents,
  duel,
  rankOfPlayer,
  refreshArenaDay,
  refreshDraw,
  refreshRivals,
  rerollDraw,
  seatPlayer,
  skipCooldown,
} from './arenaActions';
import { refreshDay } from './missionActions';
import { catchUpWorld, ensureWorld } from './worldActions';

const NOW = new Date('2026-08-19T10:00:00').getTime(); // A Wednesday.
const TODAY = '2026-08-19';
const DAY = 86_400_000;

const clock = new GameClock(createFixedWallClock(NOW));
const walk = (from: string, to: string) => clock.dayKeysBetween(from, to);

function bare(level = 30): SaveFile {
  const base = createNewSave({ slot: 1, worldSeed: 90_210, now: NOW });
  const hero = createHero({
    name: 'Kargath',
    classId: 'warrior',
    now: NOW,
    startingGold: 5_000,
    rng: createRng(9, 'starter'),
  });
  return { ...base, hero: { ...hero, level, dice: 10 } };
}

/** A save with a world raised and the player seated, as the load path leaves it. */
function seated(level = 30): SaveFile {
  return ensureWorld(bare(level), NOW);
}

/**
 * The same save with the player moved to a rank that has heroes on both sides of it.
 *
 * A newcomer sits at the foot of the ladder, where nobody below them exists to climb through —
 * so nothing can raid them and the arena's draw has only one side to fish in. Both are correct,
 * and both make for a useless fixture.
 */
function atRank(rank: number, level = 30): SaveFile {
  const save = seated(level);
  const without = save.world!.ladder.filter((id) => id !== PLAYER_LADDER_ID);
  return {
    ...save,
    world: {
      ...save.world!,
      ladder: [...without.slice(0, rank - 1), PLAYER_LADDER_ID, ...without.slice(rank - 1)],
    },
  };
}

describe('the player takes their seat', () => {
  it('joins the ladder when the world is raised', () => {
    const save = seated();

    expect(save.world?.ladder).toContain(PLAYER_LADDER_ID);
    expect(rankOfPlayer(save)).toBe(save.world?.ladder.length);
    expect(save.hero?.honor).toBeGreaterThan(0);
  });

  it('seats a save that already had a world — every save written before Phase 9', () => {
    // The v8 shape: 1,500 heroes, no room for the player. `ensureWorld` used to return early.
    const world = seated().world!;
    const legacy: SaveFile = {
      ...bare(),
      world: { ...world, ladder: world.ladder.filter((id) => id !== PLAYER_LADDER_ID) },
    };

    expect(legacy.world?.ladder).not.toContain(PLAYER_LADDER_ID);
    expect(ensureWorld(legacy, NOW).world?.ladder).toContain(PLAYER_LADDER_ID);
  });

  it('seats them once, however many times the load path runs', () => {
    const twice = seatPlayer(seatPlayer(seated()));
    expect(twice.world?.ladder.filter((id) => id === PLAYER_LADDER_ID)).toHaveLength(1);
  });

  it('never lowers the honor of a player who already has some', () => {
    const world = seated().world!;
    const rich: SaveFile = {
      ...bare(),
      hero: { ...bare().hero!, honor: 9_000 },
      world: { ...world, ladder: world.ladder.filter((id) => id !== PLAYER_LADDER_ID) },
    };

    expect(seatPlayer(rich).hero?.honor).toBe(9_000);
  });

  it('is what finally gives the player rivals', () => {
    // Phase 8 called `updateRivals` with `playerRank: 0`, which promotes nobody — the feature
    // shipped switched off. A seat is the whole fix.
    const withRivals = refreshRivals(seated(), NOW, 1);
    expect(withRivals.world?.rivals.length).toBeGreaterThan(0);

    const world = seated().world!;
    const unseated: SaveFile = {
      ...bare(),
      world: { ...world, ladder: world.ladder.filter((id) => id !== PLAYER_LADDER_ID) },
    };
    expect(refreshRivals(unseated, NOW, 1).world?.rivals).toEqual([]);
  });
});

describe('the daily draw', () => {
  it('draws three on the first visit of the day', () => {
    const save = refreshDraw(seated(), TODAY, NOW);

    expect(save.arena.draw).toHaveLength(DRAW_SIZE);
    expect(save.arena.drawDay).toBe(TODAY);
    expect(drawnOpponents(save)).toHaveLength(DRAW_SIZE);
  });

  it('does not redraw on a second visit — a reload is not a free reroll', () => {
    const first = refreshDraw(seated(), TODAY, NOW);
    const second = refreshDraw(first, TODAY, NOW + 60_000);

    expect(second).toBe(first);
  });

  it('charges a die for a reroll inside the cooldown and gives a different three', () => {
    const opened = refreshDraw(seated(), TODAY, NOW);
    const cooling = { ...opened, arena: { ...opened.arena, cooldownUntil: NOW + 60_000 } };

    const result = rerollDraw(cooling, TODAY, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.hero?.dice).toBe(cooling.hero!.dice - 1);
    expect(result.save.arena.rerollsToday).toBe(1);
    expect(result.save.arena.draw).not.toEqual(opened.arena.draw);
  });

  it('rerolls free once the cooldown has run out', () => {
    const opened = refreshDraw(seated(), TODAY, NOW);
    const result = rerollDraw(opened, TODAY, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.hero?.dice).toBe(opened.hero!.dice);
  });

  it('refuses a reroll the player cannot pay for', () => {
    const opened = refreshDraw(seated(), TODAY, NOW);
    const broke: SaveFile = {
      ...opened,
      hero: { ...opened.hero!, dice: 0 },
      arena: { ...opened.arena, cooldownUntil: NOW + 60_000 },
    };

    const result = rerollDraw(broke, TODAY, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toEqual({ kind: 'insufficient-dice', needed: 1, available: 0 });
  });
});

describe('the cooldown', () => {
  it('skips for a die, three times a day', () => {
    let save: SaveFile = {
      ...seated(),
      arena: { ...DEFAULT_ARENA, cooldownUntil: NOW + 600_000 },
    };

    for (let skip = 0; skip < MAX_SKIPS_PER_DAY; skip += 1) {
      const result = skipCooldown(save, NOW);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      save = { ...result.save, arena: { ...result.save.arena, cooldownUntil: NOW + 600_000 } };
    }

    expect(save.hero?.dice).toBe(seated().hero!.dice - MAX_SKIPS_PER_DAY);

    const refused = skipCooldown(save, NOW);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.refusal).toEqual({ kind: 'skip-cap-reached', cap: MAX_SKIPS_PER_DAY });
  });

  it('costs nothing when there is no cooldown to skip', () => {
    const save = seated();
    const result = skipCooldown(save, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save).toBe(save);
  });

  it('refuses a fight during it, and says how long is left', () => {
    const save = refreshDraw(seated(), TODAY, NOW);
    const cooling = { ...save, arena: { ...save.arena, cooldownUntil: NOW + 90_000 } };

    const outcome = duel(cooling, cooling.arena.draw[0]!, NOW);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.refusal).toEqual({ kind: 'cooling-down', msRemaining: 90_000 });
  });
});

describe('a fight, written back to the save', () => {
  const opened = refreshDraw(seated(), TODAY, NOW);
  const opponentId = opened.arena.draw[0]!;

  it('writes the ladder the fight produced, and starts the cooldown', () => {
    const outcome = duel(opened, opponentId, NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const { save, result } = outcome.transition;
    expect(save.world?.ladder).toEqual(result.ladder);
    expect(save.hero?.honor).toBe(result.rewards.honor);
    expect(save.arena.cooldownUntil).toBeGreaterThan(NOW);
    // The defender's honor goes back to their record — the ladder is not the only ledger.
    expect(save.world?.bots[opponentId]?.honor).toBe(result.opponentHonor);
  });

  it('counts only rewarded wins against the daily cap', () => {
    const capped: SaveFile = {
      ...opened,
      arena: { ...opened.arena, rewardedWinsToday: REWARDED_WINS_PER_DAY },
    };

    const outcome = duel(capped, opponentId, NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // Past the cap the counter stops moving, whatever the result.
    expect(outcome.transition.save.arena.rewardedWinsToday).toBe(REWARDED_WINS_PER_DAY);
    expect(outcome.transition.save.hero?.gold).toBe(capped.hero!.gold);
  });

  it('only ever improves the high-water mark', () => {
    const proud: SaveFile = { ...opened, arena: { ...opened.arena, bestRank: 3 } };

    const outcome = duel(proud, opponentId, NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.transition.save.arena.bestRank).toBe(3);
  });

  it('refuses an opponent who does not exist', () => {
    const outcome = duel(opened, 99_999, NOW);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.refusal).toEqual({ kind: 'no-such-opponent' });
  });
});

describe('the attacks you slept through', () => {
  it('lands them, and turns the losses into revenge chips', () => {
    // A level-1 hero with a starter kit loses to everyone, which is what makes the chips appear.
    const save = refreshRivals(atRank(700, 1), NOW, 1);
    const applied = applyRaids(save, NOW - 4 * DAY, NOW);

    expect(applied.raids.grudges.length).toBeGreaterThan(0);
    expect(applied.save.arena.revengeQueue.length).toBeGreaterThan(0);
    // Only losses earn a chip.
    expect(applied.save.arena.revengeQueue.every((grudge) => grudge.lost)).toBe(true);
    // Their honor moved, and so did the attackers'.
    expect(applied.save.hero?.honor).toBe(applied.raids.heroHonor);
  });

  it('leaves the hero at the foot of the ladder in peace', () => {
    // Nobody below them to climb through, and beating last place gains a bot nothing. A brand-new
    // player's first morning should not open on a list of people who beat them up.
    const newcomer = refreshRivals(seated(1), NOW, 1);
    expect(rankOfPlayer(newcomer)).toBe(newcomer.world?.ladder.length);
    expect(applyRaids(newcomer, NOW - 4 * DAY, NOW).raids.grudges).toEqual([]);
  });

  it('clears a chip once the player answers it', () => {
    const save = refreshRivals(atRank(700, 1), NOW, 1);
    const applied = applyRaids(save, NOW - 4 * DAY, NOW);
    const target = applied.save.arena.revengeQueue[0]!.botId;

    const outcome = duel(applied.save, target, NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // Settled either way: the chip is a grudge, not a quota.
    expect(outcome.transition.save.arena.revengeQueue.map((g) => g.botId)).not.toContain(target);
  });

  it('does nothing for a player who is not on the ladder', () => {
    const world = seated().world!;
    const unseated: SaveFile = {
      ...bare(),
      world: { ...world, ladder: world.ladder.filter((id) => id !== PLAYER_LADDER_ID) },
    };

    const applied = applyRaids(unseated, NOW - DAY, NOW);
    expect(applied.save).toBe(unseated);
    expect(applied.raids.grudges).toEqual([]);
  });

  it('runs during the world catch-up, so a night away is one pass', () => {
    const save = atRank(700, 1);
    const behind: SaveFile = {
      ...save,
      world: { ...save.world!, lastSimAt: NOW - 3 * DAY },
    };

    const caught = catchUpWorld(behind, NOW);
    expect(caught.raids).not.toBeNull();
    expect(caught.save.world?.ladder).toContain(PLAYER_LADDER_ID);
  });
});

describe('midnight and Sunday, through refreshDay', () => {
  /** A save sitting on `day`, with the arena counters run up. */
  function onDay(day: string, arena: Partial<SaveFile['arena']> = {}): SaveFile {
    const base = refreshDraw(seated(), day, NOW);
    return {
      ...base,
      activity: { ...base.activity, lastProcessedDay: day },
      arena: { ...base.arena, rerollsToday: 2, skipsToday: 1, rewardedWinsToday: 7, ...arena },
    };
  }

  it('clears the arena counters when the day turns', () => {
    const result = refreshDay(onDay('2026-08-18'), '2026-08-19', walk);

    expect(result.didReset).toBe(true);
    expect(result.save.arena.rerollsToday).toBe(0);
    expect(result.save.arena.skipsToday).toBe(0);
    expect(result.save.arena.rewardedWinsToday).toBe(0);
    // Yesterday's three are stale; nulling the day forces a redraw on the next visit.
    expect(result.save.arena.drawDay).toBeNull();
    expect(result.save.arena.draw).toEqual([]);
  });

  it('leaves them alone when the day has not turned', () => {
    const before = onDay('2026-08-19');
    const result = refreshDay(before, '2026-08-19', walk);

    expect(result.didReset).toBe(false);
    expect(result.save.arena.rerollsToday).toBe(2);
  });

  it('pays the Sunday purse once, on the Sunday', () => {
    // Saturday → Sunday. One boundary, one payout.
    const before = onDay('2026-08-22');
    const result = refreshDay(before, '2026-08-23', walk);

    expect(result.payouts).toHaveLength(1);
    expect(result.payouts[0]?.weekKey).toBe('2026-08-23');
    expect(result.save.hero?.dice).toBe(before.hero!.dice + diceForRank(rankOfPlayer(before)));
    expect(result.save.arena.lastPayoutWeek).toBe('2026-08-23');
  });

  it('does not pay again for the same week, however many times the day is refreshed', () => {
    const paid = refreshDay(onDay('2026-08-22'), '2026-08-23', walk).save;
    const dice = paid.hero!.dice;

    // Monday, Tuesday, Wednesday… the week is closed.
    const again = refreshDay(
      { ...paid, activity: { ...paid.activity, lastProcessedDay: '2026-08-23' } },
      '2026-08-26',
      walk,
    );

    expect(again.payouts).toEqual([]);
    expect(again.save.hero?.dice).toBe(dice);
  });

  it('pays four times for a month away, not thirty', () => {
    const before = onDay('2026-08-01');
    const result = refreshDay(before, '2026-08-31', walk);

    // Sundays in that stretch: the 2nd, 9th, 16th, 23rd and 30th.
    expect(result.payouts.map((payout) => payout.weekKey)).toEqual([
      '2026-08-02',
      '2026-08-09',
      '2026-08-16',
      '2026-08-23',
      '2026-08-30',
    ]);
    expect(result.save.arena.lastPayoutWeek).toBe('2026-08-30');
  });

  it('archives each week’s top ten for the Legends tab', () => {
    const result = refreshDay(onDay('2026-08-01'), '2026-08-31', walk);
    const archive = result.save.arena.legends;

    expect(archive).toHaveLength(5);
    // Newest first, so the tab opens on last Sunday.
    expect(archive[0]?.weekKey).toBe('2026-08-30');
    expect(archive[0]?.ids).toHaveLength(10);
    expect(archive[0]?.playerRank).toBe(rankOfPlayer(result.save));
  });

  it('pays nothing to a player off the bottom of the brackets', () => {
    // Rank 1,501 of 1,501 earns no dice — but the week still closes, so it cannot pay later.
    const before = onDay('2026-08-22');
    expect(diceForRank(rankOfPlayer(before))).toBe(0);

    const result = refreshDay(before, '2026-08-23', walk);
    expect(result.payouts).toHaveLength(1);
    expect(result.save.hero?.dice).toBe(before.hero!.dice);
    expect(result.save.arena.lastPayoutWeek).toBe('2026-08-23');
  });
});

describe('refreshArenaDay in isolation', () => {
  it('does nothing on a save with no boundaries to process', () => {
    const save = seated();
    expect(refreshArenaDay(save, [], false).save).toBe(save);
  });

  it('pays without clearing the counters when the payout is a catch-up', () => {
    // `didReset` false with boundaries in the list cannot happen through `refreshDay`, but the
    // function is public and the counters are the *day's* — they should follow the reset flag.
    const save: SaveFile = {
      ...seated(),
      arena: { ...DEFAULT_ARENA, rerollsToday: 3 },
    };

    const result = refreshArenaDay(save, ['2026-08-23'], false);
    expect(result.payouts).toHaveLength(1);
    expect(result.save.arena.rerollsToday).toBe(3);
  });
});
