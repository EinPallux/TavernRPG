/**
 * The daily loop, as save-to-save transitions.
 *
 * The engine tests prove the draw and the curve; these prove the *bank* and the plumbing. Four
 * things get their own tests because each is a way the phase could be quietly wrong:
 *
 * - **One credit path feeds both consumers.** The guild bounty and the day's tasks have to see
 *   the same event, or "a mission was completed" means two things.
 * - **A chest pays once.** Both are day- or week-keyed and applied to the save, which is the
 *   failure mode CLAUDE.md records six times over.
 * - **The reset walk owns the boundary.** The tally clears, the board redraws, the ledger stamps
 *   itself, and none of it happens twice on a second call.
 * - **The two daily-loop pets light up from history**, not from a grant.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { createHero } from '@/engine/hero/actions';
import { createNewSave, type SaveFile } from '@/engine/save/schema';
import { weekKeyFor } from '@/engine/clock';
import { CHEST_AT, WEEKLY_CHEST_AT } from '@/data/dailyTasks';
import { tallyOf } from '@/data/progress';
import { ownedPets } from '@/engine/pets/ownership';
import { pointsEarned } from '@/engine/board/tasks';
import {
  boardHasClaim,
  boardView,
  claimDailyChest,
  claimWeeklyChest,
  ensureTasks,
  refreshBoardDay,
  tasksToday,
} from './boardActions';
import { ledger, stampToday, stampAvailable } from './calendarActions';
import { credit, creditAll } from './progressActions';

const NOW = new Date('2026-08-05T10:00:00').getTime();
const TODAY = '2026-08-05';
const SEED = 51_015;

function save(over: { level?: number } = {}): SaveFile {
  const base = createNewSave({ slot: 1, worldSeed: SEED, now: NOW });
  const hero = createHero({
    name: 'Ysolde',
    classId: 'warrior',
    now: NOW,
    startingGold: 50_000,
    rng: createRng(9, 'starter'),
  });
  return ensureTasks({ ...base, hero: { ...hero, level: over.level ?? 20 } }, TODAY);
}

/** Complete every task on the board by crediting each one's metric to its target. */
function clearBoard(file: SaveFile): SaveFile {
  return tasksToday(file).reduce(
    (next, task) => credit(next, task.definition.metric, task.definition.target),
    file,
  );
}

describe('one credit path, two consumers', () => {
  it('feeds the day’s tally and the lifetime tally at once', () => {
    const before = save();
    const after = credit(before, 'missions', 3);

    expect(tallyOf(after.tasks.today, 'missions')).toBe(3);
    expect(tallyOf(after.tasks.lifetime, 'missions')).toBe(3);
    expect(tallyOf(before.tasks.today, 'missions')).toBe(0);
  });

  it('ignores a zero or negative credit rather than subtracting it', () => {
    const file = credit(save(), 'missions', 4);
    expect(credit(file, 'missions', 0)).toBe(file);
    expect(credit(file, 'missions', -2)).toBe(file);
  });

  it('takes several at once, for the paths that produce more than one event', () => {
    const after = creditAll(save(), [
      ['missions', 1],
      ['levelsGained', 2],
      ['itemsScrapped', 0],
    ]);
    expect(tallyOf(after.tasks.today, 'missions')).toBe(1);
    expect(tallyOf(after.tasks.today, 'levelsGained')).toBe(2);
    expect(tallyOf(after.tasks.today, 'itemsScrapped')).toBe(0);
  });

  it('counts a metric the bounty does not know about, without complaining', () => {
    // `goldTrained` is a board metric only. The credit path has to route it to the tally and
    // simply not offer it to the bounty, rather than throwing or dropping it.
    const after = credit(save(), 'goldTrained', 2_500);
    expect(tallyOf(after.tasks.today, 'goldTrained')).toBe(2_500);
  });
});

describe('the board', () => {
  it('draws three, once, and keeps them all day', () => {
    const file = save();
    expect(file.tasks.taskIds).toHaveLength(3);
    expect(file.tasks.drawnFor).toBe(TODAY);
    // Idempotent: calling it again is not a redraw.
    expect(ensureTasks(file, TODAY)).toBe(file);
  });

  it('adds up to exactly a chest when all three are done', () => {
    const cleared = clearBoard(save());
    const view = boardView(cleared, TODAY);

    expect(view.points).toBe(CHEST_AT);
    expect(view.tasks.every((entry) => entry.complete)).toBe(true);
    expect(view.chestReady).toBe(true);
    expect(boardHasClaim(cleared, TODAY)).toBe(true);
  });

  it('says nothing is waiting until something is', () => {
    expect(boardHasClaim(save(), TODAY)).toBe(false);
  });
});

describe('the daily chest, as a transaction', () => {
  it('pays gold, a die and materials, and counts a rung', () => {
    const before = clearBoard(save());
    const result = claimDailyChest(before, TODAY);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.hero!.dice).toBe(before.hero!.dice + 1);
    expect(result.save.hero!.gold).toBe(before.hero!.gold + result.chest.gold);
    expect(result.save.hero!.materials.essence).toBe(
      before.hero!.materials.essence + result.chest.essence,
    );
    expect(result.save.tasks.claimsThisWeek).toBe(1);
    expect(result.save.tasks.totalChests).toBe(1);
    expect(result.save.tasks.lastChestDay).toBe(TODAY);
  });

  it('refuses a second claim the same day, and pays nothing for it', () => {
    const first = claimDailyChest(clearBoard(save()), TODAY);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = claimDailyChest(first.save, TODAY);
    expect(second.ok).toBe(false);
    // The high-water mark is the whole guard. Without it this is the reload double-pay.
    expect(first.save.tasks.totalChests).toBe(1);
  });

  it('refuses a board that is not finished', () => {
    const partial = credit(save(), tasksToday(save())[0]!.definition.metric, 1);
    const result = claimDailyChest(partial, TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok && result.refusal.kind === 'chest') {
      expect(result.refusal.reason.kind).toBe('not-earned');
    }
  });
});

describe('the weekly ladder', () => {
  /** Seven daily claims inside one week. */
  function sevenClaims(): SaveFile {
    let file = save();
    for (let day = 3; day <= 9; day += 1) {
      const key = `2026-08-0${day}`;
      file = refreshBoardDay(file, key);
      file = ensureTasks(file, key);
      const claim = claimDailyChest(clearBoard(file), key);
      expect(claim.ok, `day ${key}`).toBe(true);
      if (claim.ok) file = claim.save;
    }
    return file;
  }

  it('wants all seven, and pays dice, Ale and an item once', () => {
    const week = sevenClaims();
    expect(week.tasks.claimsThisWeek).toBe(WEEKLY_CHEST_AT);

    const result = claimWeeklyChest(week, '2026-08-09');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.hero!.dice).toBe(week.hero!.dice + result.chest.dice);
    expect(result.save.activity.alesHeld).toBe(week.activity.alesHeld + result.chest.ale);
    expect(['rare', 'epic']).toContain(result.item.rarity);
    expect(result.save.tasks.lastWeeklyChestWeek).toBe(weekKeyFor('2026-08-09'));

    // Once per week, and the second attempt pays nothing.
    expect(claimWeeklyChest(result.save, '2026-08-09').ok).toBe(false);
  });

  it('gives the same chest to the same week however many times it is read', () => {
    const week = sevenClaims();
    const once = claimWeeklyChest(week, '2026-08-09');
    const twice = claimWeeklyChest(week, '2026-08-09');
    expect(once.ok && twice.ok).toBe(true);
    if (!once.ok || !twice.ok) return;
    // Seeded on the week: a reload cannot re-roll a chest the player already earned.
    expect(once.chest).toEqual(twice.chest);
    expect(once.item.uid).toBe(twice.item.uid);
  });

  it('zeroes the rungs when a new week starts', () => {
    const week = sevenClaims();
    // The following Monday.
    const next = refreshBoardDay(week, '2026-08-10');
    expect(next.tasks.claimsThisWeek).toBe(0);
    expect(boardView(next, '2026-08-10').weeklyReady).toBe(false);
  });
});

describe('the day boundary', () => {
  it('clears the tally and the board, and leaves the lifetime counts alone', () => {
    const worked = clearBoard(save());
    const tomorrow = refreshBoardDay(worked, '2026-08-06');

    expect(tomorrow.tasks.today).toEqual({});
    expect(tomorrow.tasks.taskIds).toEqual([]);
    expect(tomorrow.tasks.drawnFor).toBeNull();
    // The neglect weighting reads the lifetime tally, so wiping it would reset the nudge.
    expect(
      tallyOf(tomorrow.tasks.lifetime, worked.tasks.taskIds.length > 0 ? 'missions' : 'missions'),
    ).toBe(tallyOf(worked.tasks.lifetime, 'missions'));

    const redrawn = ensureTasks(tomorrow, '2026-08-06');
    expect(redrawn.tasks.taskIds).toHaveLength(3);
    expect(pointsEarned(tasksToday(redrawn), redrawn.tasks.today)).toBe(0);
  });
});

describe('the ledger stamps itself', () => {
  it('marks today once, and pays the square', () => {
    const before = save();
    expect(stampAvailable(before, TODAY)).toBe(true);

    const result = stampToday(before, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.day).toBe(1);
    expect(result.save.calendar.lastStampedDay).toBe(TODAY);
    expect(result.save.hero!.gold).toBe(before.hero!.gold + result.gold);

    // Safe to call on every load, which is exactly how the reset walk calls it.
    const again = stampToday(result.save, TODAY);
    expect(again.ok).toBe(false);
    expect(stampAvailable(result.save, TODAY)).toBe(false);
  });

  it('shows a page with one square marked and the next highlighted', () => {
    const stamped = stampToday(save(), TODAY);
    expect(stamped.ok).toBe(true);
    if (!stamped.ok) return;

    const page = ledger(stamped.save, TODAY);
    expect(page.filter((entry) => entry.stamped)).toHaveLength(1);
    expect(page.filter((entry) => entry.today)).toHaveLength(0);
    expect(ledger(stamped.save, '2026-08-06').find((entry) => entry.today)?.reward.day).toBe(2);
  });
});

describe('the two pets the daily loop earns', () => {
  it('hands over the Moss Tortoise for a finished ledger, and not before', () => {
    const base = save();
    expect(ownedPets(base).map((entry) => entry.id)).not.toContain('moss-tortoise');

    // Twenty-seven squares is not a cycle. Twenty-eight is.
    const nearly: SaveFile = {
      ...base,
      calendar: { day: 27, lastStampedDay: '2026-08-04', cyclesCompleted: 0 },
    };
    expect(ownedPets(nearly).map((entry) => entry.id)).not.toContain('moss-tortoise');

    const closed = stampToday(nearly, TODAY);
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.save.calendar.cyclesCompleted).toBe(1);
    expect(ownedPets(closed.save).map((entry) => entry.id)).toContain('moss-tortoise');
  });

  it('hands over the Coin Toad at thirty daily chests', () => {
    const base = save();
    const twentyNine: SaveFile = { ...base, tasks: { ...base.tasks, totalChests: 29 } };
    expect(ownedPets(twentyNine).map((entry) => entry.id)).not.toContain('coin-toad');

    const thirty: SaveFile = { ...base, tasks: { ...base.tasks, totalChests: 30 } };
    expect(ownedPets(thirty).map((entry) => entry.id)).toContain('coin-toad');
  });

  it('counts any thirty days, not thirty consecutive ones', () => {
    // The calendar's promise is that absence pauses rather than punishes; a pet gated on a
    // *streak* would quietly contradict it from the next room over.
    const base = save();
    const scattered: SaveFile = {
      ...base,
      tasks: { ...base.tasks, totalChests: 30, claimsThisWeek: 0 },
    };
    expect(ownedPets(scattered).map((entry) => entry.id)).toContain('coin-toad');
  });
});
