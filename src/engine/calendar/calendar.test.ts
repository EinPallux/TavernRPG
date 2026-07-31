/**
 * Marla's ledger, measured (ROADMAP Phase 15 acceptance).
 *
 * One rule matters more than the rest and it gets most of the file: **missing a day pauses the
 * calendar, it never resets it** (spec §2). The tests below try to break that from every angle a
 * player could — a day off, a fortnight off, a year off, a clock that goes backwards — because a
 * 28-day chain that snaps on day 19 punishes exactly the lapsed player it was meant to win back.
 *
 * The second rule is the one that would look right and be wrong: **one stamp per day.** A
 * day-keyed thing whose effect is applied to the save doubles on reload without a guard, and it
 * is invisible on the first load. Six of these have shipped now; this is the seventh.
 */

import { describe, expect, it } from 'vitest';
import {
  CALENDAR,
  CALENDAR_DAYS,
  calendarReward,
  isMilestone,
  nextMilestone,
} from '@/data/calendar';
import { NEW_CALENDAR, canStamp, pendingDay, squares, stamp, type CalendarState } from './calendar';

/** Attend on each of these days, in order. */
function attend(days: readonly string[], from: CalendarState = NEW_CALENDAR): CalendarState {
  return days.reduce<CalendarState>((state, day) => stamp(state, day)?.state ?? state, from);
}

describe('the 28 squares, as data', () => {
  it('numbers every day exactly once, in order', () => {
    expect(CALENDAR).toHaveLength(CALENDAR_DAYS);
    expect(CALENDAR.map((entry) => entry.day)).toEqual(
      Array.from({ length: CALENDAR_DAYS }, (_, index) => index + 1),
    );
  });

  it('never pays nothing — a blank square reads as a bug even when it is a design', () => {
    for (const reward of CALENDAR) {
      const total =
        reward.goldVigor +
        (reward.essence ?? 0) +
        (reward.scrap ?? 0) +
        (reward.starmetal ?? 0) +
        (reward.dice ?? 0) +
        (reward.ale ?? 0) +
        (reward.petScraps ?? 0) +
        (reward.item ? 1 : 0);
      expect(total, `day ${reward.day} pays nothing`).toBeGreaterThan(0);
      expect(reward.label.length).toBeGreaterThan(2);
    }
  });

  it('puts dice on 7, 14 and 21 and closes with an Epic on 28 (balancing §13)', () => {
    expect(calendarReward(7).dice).toBeGreaterThan(0);
    expect(calendarReward(14).dice).toBeGreaterThan(0);
    expect(calendarReward(21).dice).toBeGreaterThan(0);
    expect(calendarReward(28).item).toBe('epic');
  });

  it('clamps a day outside the cycle rather than returning nothing', () => {
    expect(calendarReward(0)).toBe(calendarReward(1));
    expect(calendarReward(999)).toBe(calendarReward(CALENDAR_DAYS));
  });

  it('can always name the next thing worth waiting for', () => {
    expect(nextMilestone(1)?.day).toBe(7);
    expect(nextMilestone(8)?.day).toBe(14);
    expect(nextMilestone(22)?.day).toBe(28);
    expect(isMilestone(28)).toBe(true);
    expect(isMilestone(3)).toBe(false);
    // Past the last one there is genuinely nothing left in this cycle, and it says so.
    expect(nextMilestone(CALENDAR_DAYS + 1)).toBeNull();
  });
});

describe('stamping', () => {
  it('starts a fresh ledger at nothing and marks day one', () => {
    expect(NEW_CALENDAR).toEqual({ day: 0, lastStampedDay: null, cyclesCompleted: 0 });

    const result = stamp(NEW_CALENDAR, '2026-08-05');
    expect(result).not.toBeNull();
    expect(result!.state.day).toBe(1);
    expect(result!.state.lastStampedDay).toBe('2026-08-05');
    expect(result!.reward.day).toBe(1);
  });

  it('refuses a second stamp on the same day — the whole idempotency guard', () => {
    const once = stamp(NEW_CALENDAR, '2026-08-05')!;
    expect(canStamp(once.state, '2026-08-05')).toBe(false);
    expect(stamp(once.state, '2026-08-05')).toBeNull();

    // Calling it on every load is the intended usage, so it has to be safe a hundred times.
    let state = once.state;
    for (let i = 0; i < 100; i += 1) state = stamp(state, '2026-08-05')?.state ?? state;
    expect(state.day).toBe(1);
  });

  it('advances one square a day, and names the square before the click', () => {
    let state = NEW_CALENDAR;
    for (let day = 1; day <= 10; day += 1) {
      const key = `2026-08-${String(day).padStart(2, '0')}`;
      expect(pendingDay(state, key)).toBe(day);
      state = stamp(state, key)!.state;
      expect(state.day).toBe(day);
    }
  });
});

describe('missing a day pauses the ledger, and never resets it', () => {
  it('holds the count across a skipped day', () => {
    const attended = attend(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(attended.day).toBe(3);

    // Two days off, then back.
    const later = stamp(attended, '2026-08-06')!;
    expect(later.state.day).toBe(4);
  });

  it('holds it across a fortnight, a month and a year', () => {
    const attended = attend(
      Array.from({ length: 19 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`),
    );
    expect(attended.day).toBe(19);

    for (const gap of ['2026-08-31', '2026-10-15', '2027-08-19']) {
      // Each gap is measured from the *same* day-19 state, so the test is about the pause and
      // not about a chain of returns.
      const back = stamp(attended, gap)!;
      expect(back.state.day, `returning on ${gap}`).toBe(20);
      expect(back.state.cyclesCompleted).toBe(0);
    }
  });

  it('has nowhere for a streak to live, which is why there is no branch to get wrong', () => {
    // A structural assertion rather than a behavioural one: the state is three fields and none
    // of them can be *reduced* by an absence. If a fourth appears, this test should be read
    // again before it is updated.
    expect(Object.keys(NEW_CALENDAR).sort()).toEqual(['cyclesCompleted', 'day', 'lastStampedDay']);
  });
});

describe('closing a cycle', () => {
  const twentyEight = attend(
    Array.from(
      { length: CALENDAR_DAYS },
      (_, i) => `2026-0${i < 9 ? 8 : 9}-${String(i < 9 ? i + 1 : i - 8).padStart(2, '0')}`,
    ),
  );

  it('counts the cycle on the day-28 stamp, not the day after', () => {
    expect(twentyEight.day).toBe(CALENDAR_DAYS);
    expect(twentyEight.cyclesCompleted).toBe(1);
  });

  it('leaves the finished ledger on screen until the next stamp opens a new one', () => {
    // Sitting at 28 shows twenty-eight marks, not an empty page — and highlights nothing,
    // because marking day 1 as *both* stamped-next and today is a page that contradicts itself.
    const finished = squares(twentyEight, '2026-09-21');
    expect(finished.filter((entry) => entry.stamped)).toHaveLength(CALENDAR_DAYS);
    expect(finished.filter((entry) => entry.today)).toHaveLength(0);

    const rolled = stamp(twentyEight, '2026-09-21')!;
    expect(rolled.state.day).toBe(1);
    expect(rolled.state.cyclesCompleted).toBe(1);
    expect(rolled.reward.day).toBe(1);
  });

  it('counts a second cycle separately', () => {
    let state = twentyEight;
    for (let i = 0; i < CALENDAR_DAYS; i += 1) {
      state = stamp(state, `2026-10-${String(i + 1).padStart(2, '0')}`)!.state;
    }
    expect(state.day).toBe(CALENDAR_DAYS);
    expect(state.cyclesCompleted).toBe(2);
  });
});

describe('the page itself', () => {
  it('marks what has been attended and highlights exactly one square as today', () => {
    const state = attend(['2026-08-01', '2026-08-02', '2026-08-03']);
    const page = squares(state, '2026-08-04');

    expect(page).toHaveLength(CALENDAR_DAYS);
    expect(page.filter((entry) => entry.stamped)).toHaveLength(3);
    expect(page.filter((entry) => entry.today)).toHaveLength(1);
    expect(page.find((entry) => entry.today)?.reward.day).toBe(4);
  });

  it('highlights nothing once today is already marked', () => {
    const state = attend(['2026-08-01']);
    expect(squares(state, '2026-08-01').filter((entry) => entry.today)).toHaveLength(0);
  });
});
