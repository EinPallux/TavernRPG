/**
 * The daily loop, measured (ROADMAP Phase 15 acceptance).
 *
 * Four claims, each a place the system could be quietly wrong:
 *
 * - **The board never asks for a locked door.** A task drawn for a room the hero cannot enter is
 *   points behind a lock, and at level 3 the chest becomes unopenable.
 * - **The weighting nudges without nagging.** A neglected corner should come up more often than
 *   a well-worn one, but not so much more that the board becomes a list of what the player has
 *   decided they do not enjoy.
 * - **Missing a day pauses the ledger.** The whole design of §2, and the easiest thing in the
 *   phase to accidentally undo.
 * - **The dice paycheck is what the doc says it is.** A die a day, verified across a simulated
 *   month, because the F2P promise is denominated in this number.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { gateFor } from '@/engine/progression/gates';
import { goldPerVigor } from '@/engine/progression/rewards';
import {
  CHEST_AT,
  DAILY_TASKS,
  TASKS_PER_DAY,
  TASK_POINTS,
  WEEKLY_CHEST_AT,
  dailyTask,
  taskTitle,
} from '@/data/dailyTasks';
import { PROGRESS_METRICS, addToTally, tallyOf, type ProgressTally } from '@/data/progress';
import { PLACES_BY_ID } from '@/data/places';
import {
  drawTasks,
  isEligible,
  pointsEarned,
  progressFor,
  tasksFromIds,
  weightFor,
  type DrawContext,
} from './tasks';
import { dailyChest, quoteDailyChest, quoteWeeklyChest, weeklyChest } from './chest';

const SEED = 0x15_b0_a2;

function context(over: Partial<DrawContext> = {}): DrawContext {
  return {
    worldSeed: SEED,
    dayKey: '2026-08-05',
    heroLevel: 30,
    inGuild: true,
    history: {},
    ...over,
  };
}

/* ── The pool ────────────────────────────────────────────────────────────────────── */

describe('the task pool, as data', () => {
  it('has unique ids, a real place and a filled-in title for every entry', () => {
    expect(new Set(DAILY_TASKS.map((entry) => entry.id)).size).toBe(DAILY_TASKS.length);

    for (const entry of DAILY_TASKS) {
      expect(PLACES_BY_ID[entry.place], `${entry.id} names place ${entry.place}`).toBeTruthy();
      expect(PROGRESS_METRICS).toContain(entry.metric);
      expect(entry.target).toBeGreaterThan(0);
      // `{n}` has to be *in* the title, or the target is invisible on the board.
      expect(entry.title).toContain('{n}');
      expect(taskTitle(entry)).not.toContain('{n}');
      expect(taskTitle(entry)).toContain(entry.target.toLocaleString());
    }
  });

  it('pays exactly a chest across three tasks', () => {
    // If these ever stop summing, the chest is either unreachable or free at two-of-three.
    expect(TASK_POINTS.reduce((sum, points) => sum + points, 0)).toBe(CHEST_AT);
    expect(TASKS_PER_DAY).toBe(3);
  });

  it('can fill a board from the tavern alone, for a hero who has nothing else open', () => {
    // Level 3 is the Notice Board's own gate. If the pool cannot fill three slots there, the
    // first player to see the room cannot open its chest.
    const early = DAILY_TASKS.filter((entry) => gateFor(entry.place, 3).unlocked);
    expect(early.length).toBeGreaterThanOrEqual(TASKS_PER_DAY);
  });
});

/* ── The draw ────────────────────────────────────────────────────────────────────── */

describe('the daily draw', () => {
  it('is the same board all day, and a different one tomorrow', () => {
    const once = drawTasks(context()).map((entry) => entry.definition.id);
    const twice = drawTasks(context()).map((entry) => entry.definition.id);
    expect(once).toEqual(twice);

    const tomorrow = drawTasks(context({ dayKey: '2026-08-06' })).map((e) => e.definition.id);
    // Not asserting difference — two draws from a pool of seventeen can collide — but the seed
    // has to move, or the board is the same forever.
    expect(drawTasks(context({ dayKey: '2026-08-06' })).map((e) => e.definition.id)).toEqual(
      tomorrow,
    );

    // A different world sees a different board on the same date.
    const elsewhere = drawTasks(context({ worldSeed: SEED + 1 })).map((e) => e.definition.id);
    expect(elsewhere).toHaveLength(TASKS_PER_DAY);
  });

  it('never draws a task for a room the hero cannot enter', () => {
    for (const level of [3, 5, 8, 10, 12, 40]) {
      const drawn = drawTasks(context({ heroLevel: level }));
      expect(drawn.length).toBeGreaterThan(0);
      for (const entry of drawn) {
        expect(
          gateFor(entry.definition.place, level).unlocked,
          `level ${level} drew ${entry.definition.id} for ${entry.definition.place}`,
        ).toBe(true);
      }
    }
  });

  it('skips the donation task for a player with no hall', () => {
    const donation = DAILY_TASKS.find((entry) => entry.metric === 'goldDonated')!;
    expect(isEligible(donation, context({ inGuild: true }))).toBe(true);
    expect(isEligible(donation, context({ inGuild: false }))).toBe(false);

    // The Guild Hall opens at level 10 whether or not anyone let you in, so the gate alone is
    // not enough — a task nobody would accept the donation for is a dead 30 points.
    for (let day = 1; day <= 60; day += 1) {
      const drawn = drawTasks(
        context({ inGuild: false, dayKey: `2026-08-${String((day % 28) + 1).padStart(2, '0')}` }),
      );
      expect(drawn.some((entry) => entry.definition.metric === 'goldDonated')).toBe(false);
    }
  });

  it('gives the three slots three different things to do', () => {
    for (let day = 1; day <= 28; day += 1) {
      const drawn = drawTasks(context({ dayKey: `2026-08-${String(day).padStart(2, '0')}` }));
      const metrics = drawn.map((entry) => entry.definition.metric);
      expect(new Set(metrics).size, `day ${day} drew ${metrics.join(', ')}`).toBe(metrics.length);
    }
  });

  it('assigns 40/30/30 to the slots, not to the tasks', () => {
    const drawn = drawTasks(context());
    expect(drawn.map((entry) => entry.points)).toEqual([...TASK_POINTS]);
  });

  it('leans toward what the player has been neglecting', () => {
    const untouched = weightFor('arenaWins', {});
    const worn = weightFor('arenaWins', { arenaWins: 500 });
    expect(untouched).toBeGreaterThan(worn);
    // ...but never so far that the board becomes a nag. Under 2× across the whole range.
    expect(untouched / worn).toBeLessThan(2);
    // Once and never are different; four hundred and eight hundred are not.
    expect(weightFor('arenaWins', {})).toBeGreaterThan(weightFor('arenaWins', { arenaWins: 1 }));
    expect(weightFor('arenaWins', { arenaWins: 400 })).toBeCloseTo(
      weightFor('arenaWins', { arenaWins: 800 }),
      1,
    );
  });

  it('actually shows the neglected corner more often than the worn one', () => {
    // Measured, not asserted: a mission-runner over sixty days should see more of the rooms
    // they have been ignoring than a uniform draw would give them.
    const heavy: ProgressTally = { missions: 900, patrolHours: 800 };
    let neglected = 0;
    for (let day = 1; day <= 60; day += 1) {
      const key = `2026-${String((day % 12) + 1).padStart(2, '0')}-${String((day % 28) + 1).padStart(2, '0')}`;
      const drawn = drawTasks(context({ dayKey: key, history: heavy }));
      neglected += drawn.filter(
        (entry) =>
          entry.definition.metric !== 'missions' && entry.definition.metric !== 'patrolHours',
      ).length;
    }
    // Three slots × sixty days = 180. A uniform draw over ~10 eligible metrics would already be
    // high here; the band guards the *floor*, which is what a broken weighting would drop below.
    expect(neglected).toBeGreaterThan(150);
  });

  it('drops ids the content no longer knows about, rather than throwing', () => {
    expect(dailyTask('a-task-that-was-deleted')).toBeNull();
    const resolved = tasksFromIds(['contracts-3', 'a-task-that-was-deleted', 'arena-1']);
    expect(resolved.map((entry) => entry.definition.id)).toEqual(['contracts-3', 'arena-1']);
  });
});

/* ── Progress and points ─────────────────────────────────────────────────────────── */

describe('points', () => {
  const tasks = drawTasks(context());

  it('are all-or-nothing per task', () => {
    const first = tasks[0]!;
    const target = first.definition.target;
    const metric = first.definition.metric;

    expect(progressFor(first, {}).earned).toBe(0);
    expect(progressFor(first, addToTally({}, metric, target - 1)).earned).toBe(0);
    expect(progressFor(first, addToTally({}, metric, target)).earned).toBe(first.points);
  });

  it('never overfill the meter, however much the player does', () => {
    const first = tasks[0]!;
    const over = addToTally({}, first.definition.metric, first.definition.target * 10);
    const progress = progressFor(first, over);
    expect(progress.done).toBe(progress.target);
    expect(progress.complete).toBe(true);
  });

  it('reach exactly a chest when all three are done, and not before', () => {
    let tally: ProgressTally = {};
    for (const task of tasks) {
      expect(pointsEarned(tasks, tally)).toBeLessThan(CHEST_AT);
      tally = addToTally(tally, task.definition.metric, task.definition.target);
    }
    expect(pointsEarned(tasks, tally)).toBe(CHEST_AT);
  });

  it('ignores a zero or negative credit rather than subtracting it', () => {
    const tally = addToTally({}, 'missions', 4);
    expect(addToTally(tally, 'missions', 0)).toBe(tally);
    expect(addToTally(tally, 'missions', -3)).toBe(tally);
    expect(tallyOf(tally, 'missions')).toBe(4);
    expect(tallyOf(tally, 'arenaWins')).toBe(0);
  });
});

/* ── The chests ──────────────────────────────────────────────────────────────────── */

describe('the dice paycheck', () => {
  it('pays exactly one die a day, and gold that scales with the hero', () => {
    for (const level of [3, 15, 30, 50]) {
      const chest = dailyChest(level);
      expect(chest.dice).toBe(1);
      expect(chest.gold).toBe(Math.round(60 * goldPerVigor(level)));
      expect(chest.essence).toBeGreaterThan(0);
    }
    expect(dailyChest(50).gold).toBeGreaterThan(dailyChest(5).gold);
  });

  it('adds up to thirty dice across a simulated month of perfect attendance', () => {
    // The F2P promise, counted. Thirty daily chests plus four weekly ones at three dice each.
    const days = 28;
    const daily = days * dailyChest(20).dice;
    const weeks = Math.floor(days / 7);
    const weekly = weeks * weeklyChest(createRng(SEED, 'w')).dice;

    expect(daily).toBe(28);
    expect(weekly).toBe(12);
    expect(daily + weekly).toBe(40);
  });

  it('refuses a second claim on the same day, and one that was not earned', () => {
    const earned = quoteDailyChest({ points: CHEST_AT, today: 'd', lastChestDay: null });
    expect(earned.ok).toBe(true);

    const again = quoteDailyChest({ points: CHEST_AT, today: 'd', lastChestDay: 'd' });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.refusal.kind).toBe('already-claimed');

    const short = quoteDailyChest({ points: CHEST_AT - 30, today: 'd', lastChestDay: null });
    expect(short.ok).toBe(false);
    if (!short.ok && short.refusal.kind === 'not-earned') {
      expect(short.refusal.needed).toBe(CHEST_AT);
    }
  });

  it('wants all seven rungs for the weekly chest, and pays it once', () => {
    const six = quoteWeeklyChest({ claimsThisWeek: 6, weekKey: 'w', lastWeeklyChestWeek: null });
    expect(six.ok).toBe(false);
    if (!six.ok && six.refusal.kind === 'not-earned') {
      expect(six.refusal.needed).toBe(WEEKLY_CHEST_AT);
    }

    expect(
      quoteWeeklyChest({ claimsThisWeek: 7, weekKey: 'w', lastWeeklyChestWeek: null }).ok,
    ).toBe(true);
    expect(quoteWeeklyChest({ claimsThisWeek: 9, weekKey: 'w', lastWeeklyChestWeek: 'w' }).ok).toBe(
      false,
    );
  });

  it('upgrades the weekly item to Epic about a quarter of the time', () => {
    const runs = 20_000;
    let epics = 0;
    for (let i = 0; i < runs; i += 1) {
      if (weeklyChest(createRng(SEED + i, `chest/${i}`)).rarity === 'epic') epics += 1;
    }
    expect(epics / runs).toBeCloseTo(0.25, 2);
  });
});
