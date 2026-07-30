/**
 * The login calendar (daily-loop spec §2).
 *
 * Twenty-eight squares, stamped one a day, and **missing a day pauses rather than resets**. The
 * implementation is the argument: the state is `{ day, lastStampedDay, cyclesCompleted }` — a
 * *count of days attended* and the last date it happened. There is no streak field, so there is
 * nowhere for a "break the streak" branch to live. A player who vanishes for six weeks comes back
 * to day 19, because day 19 is what they earned.
 *
 * That leaves exactly one rule to get right: **one stamp per day.** The calendar is a day-keyed
 * thing whose effect is applied to the save, which is the failure mode CLAUDE.md records six
 * times over — it looks right on first load and doubles on reload. `lastStampedDay` is the guard,
 * and it is compared rather than incremented.
 *
 * Pure module.
 */

import { CALENDAR_DAYS, calendarReward, type CalendarRewardDef } from '@/data/calendar';
import type { DayKey } from '@/engine/clock';

export interface CalendarState {
  /** Squares stamped in the current cycle, 0–28. Not a streak: absence does not reduce it. */
  readonly day: number;
  /** The day the last stamp landed. The whole idempotency guard. */
  readonly lastStampedDay: DayKey | null;
  /** How many 28-day cycles have closed. Day 28 of cycle one earns the Moss Tortoise. */
  readonly cyclesCompleted: number;
}

export const NEW_CALENDAR: CalendarState = {
  day: 0,
  lastStampedDay: null,
  cyclesCompleted: 0,
};

/** Whether today's square is still unstamped. */
export function canStamp(state: CalendarState, today: DayKey): boolean {
  return state.lastStampedDay !== today;
}

/** The square today's stamp would land on, whether or not it is available. */
export function pendingDay(state: CalendarState, today: DayKey): number {
  if (!canStamp(state, today)) return state.day;
  return state.day >= CALENDAR_DAYS ? 1 : state.day + 1;
}

export interface StampResult {
  readonly state: CalendarState;
  /** The square that was stamped, with what it pays. */
  readonly reward: CalendarRewardDef;
  /** True when this stamp closed a cycle — the ledger turns over with a flourish. */
  readonly cycleClosed: boolean;
}

/**
 * Stamp today, or return null because today is already stamped.
 *
 * Null rather than a no-op result so the caller cannot accidentally pay a reward it did not
 * earn: there is no shape here that means "nothing happened but here is a reward anyway".
 *
 * A stamp on day 28 closes the cycle and the *next* stamp opens a fresh one at day 1 — the
 * rollover happens on the way in rather than on the way out, so a save sitting at 28 still
 * displays a completed ledger rather than an empty one.
 */
export function stamp(state: CalendarState, today: DayKey): StampResult | null {
  if (!canStamp(state, today)) return null;

  const rollingOver = state.day >= CALENDAR_DAYS;
  const day = rollingOver ? 1 : state.day + 1;
  const closed = day === CALENDAR_DAYS;

  return {
    state: {
      day,
      lastStampedDay: today,
      cyclesCompleted: state.cyclesCompleted + (closed ? 1 : 0),
    },
    reward: calendarReward(day),
    cycleClosed: closed,
  };
}

/** Squares in the current cycle, with their state, for the ledger page. */
export interface CalendarSquare {
  readonly reward: CalendarRewardDef;
  readonly stamped: boolean;
  /** The one that lights up as claimable. At most one is ever true. */
  readonly today: boolean;
}

export function squares(state: CalendarState, todayKey: DayKey): readonly CalendarSquare[] {
  /*
   * A finished ledger stays finished until the next mark opens a new one.
   *
   * The tempting implementation clears the page the moment day 28 is behind you, so the next
   * square to be stamped can be highlighted as day 1. That shows a player who *just completed a
   * twenty-eight-day ledger* a blank page, which is the wrong thing to say to them — and it
   * would have to mark day 1 as both stamped-next and today at once. So: the completed page
   * stands, and nothing is highlighted, until the roll actually happens.
   */
  const closed = state.day >= CALENDAR_DAYS;
  const pending = !closed && canStamp(state, todayKey) ? pendingDay(state, todayKey) : 0;

  return Array.from({ length: CALENDAR_DAYS }, (_, index) => {
    const day = index + 1;
    return {
      reward: calendarReward(day),
      stamped: day <= state.day,
      today: day === pending,
    };
  });
}

export { CALENDAR_DAYS };
