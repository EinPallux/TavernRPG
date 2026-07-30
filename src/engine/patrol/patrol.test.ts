/**
 * Patrol tests.
 *
 * Two properties carry the feature. **Accrual must be a function of the clock**, or a shift
 * cannot survive a closed tab — which is the entire point of patrol. And **patrol must stay
 * the worse deal**, or it quietly becomes the optimal way to play and the mission loop dies.
 */

import { describe, expect, it } from 'vitest';
import { missionPayout, VIGOR_PER_DAY } from '@/engine/progression/rewards';
import { xpNeeded } from '@/engine/progression/xp';
import { linesForShift, lineCountForShift, PATROL_LOG_LINES } from '@/data/patrolLog';
import {
  MAX_SHIFT_HOURS,
  MIN_SHIFT_HOURS,
  isShiftComplete,
  minutesServed,
  msRemaining,
  patrolEarnings,
  previewEarnings,
  shiftProgress,
  startShift,
  type PatrolShift,
} from './patrol';

const NOW = new Date('2026-07-29T08:00:00').getTime();
const HOUR = 3_600_000;

function shift(hours = 8, heroLevel = 25, now = NOW): PatrolShift {
  const result = startShift({
    hours,
    heroLevel,
    now,
    missionRunning: false,
    alreadyOnDuty: false,
  });
  if (!result.ok) throw new Error(`start refused: ${result.refusal.kind}`);
  return result.shift;
}

const earn = (s: PatrolShift, now: number) => patrolEarnings(s, now, xpNeeded(s.heroLevel));

describe('startShift', () => {
  it('signs a shift of the chosen length', () => {
    const s = shift(6);
    expect(s.hours).toBe(6);
    expect(s.endsAt - s.startedAt).toBe(6 * HOUR);
  });

  it('accepts the full 1–12 hour range and nothing outside it', () => {
    for (let hours = MIN_SHIFT_HOURS; hours <= MAX_SHIFT_HOURS; hours += 1) {
      expect(
        startShift({ hours, heroLevel: 10, now: NOW, missionRunning: false, alreadyOnDuty: false })
          .ok,
        `${hours}h`,
      ).toBe(true);
    }

    for (const hours of [0, 0.5, 13, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = startShift({
        hours,
        heroLevel: 10,
        now: NOW,
        missionRunning: false,
        alreadyOnDuty: false,
      });
      expect(result.ok, `${hours}h`).toBe(false);
      if (!result.ok) expect(result.refusal.kind).toBe('bad-shift-length');
    }
  });

  it('will not send a hero who is already on a mission', () => {
    const result = startShift({
      hours: 4,
      heroLevel: 10,
      now: NOW,
      missionRunning: true,
      alreadyOnDuty: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.kind).toBe('mission-running');
  });

  it('will not sign a second shift on top of the first', () => {
    const result = startShift({
      hours: 4,
      heroLevel: 10,
      now: NOW,
      missionRunning: false,
      alreadyOnDuty: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.kind).toBe('already-on-duty');
  });

  it('records the level at signing, so the shift pays what it was worth', () => {
    expect(shift(4, 30).heroLevel).toBe(30);
  });
});

describe('accrual', () => {
  it('is a function of the clock, not of anything running', () => {
    // The whole point of patrol: close the tab, come back, be paid for the time.
    const s = shift(8);

    expect(earn(s, NOW).gold).toBe(0);
    expect(earn(s, NOW + 4 * HOUR).gold).toBeGreaterThan(0);
    expect(earn(s, NOW + 8 * HOUR).gold).toBeGreaterThan(earn(s, NOW + 4 * HOUR).gold);
  });

  it('pays half a shift for half a shift', () => {
    const s = shift(8);
    const half = earn(s, NOW + 4 * HOUR);
    const full = earn(s, NOW + 8 * HOUR);

    expect(half.gold * 2).toBeCloseTo(full.gold, -1);
    expect(half.minutes).toBe(240);
  });

  it('pro-rates by the minute, not the hour', () => {
    // Collecting at 5h59m must not pay for five hours.
    const s = shift(8);
    const at559 = earn(s, NOW + 5 * HOUR + 59 * 60_000);
    const at5 = earn(s, NOW + 5 * HOUR);

    expect(at559.minutes).toBe(359);
    expect(at559.gold).toBeGreaterThan(at5.gold);
  });

  it('stops paying at the end of the shift, however long the tab was closed', () => {
    const s = shift(4);
    const atEnd = earn(s, NOW + 4 * HOUR);
    const muchLater = earn(s, NOW + 400 * HOUR);

    expect(muchLater).toEqual(atEnd);
    expect(muchLater.minutes).toBe(240);
  });

  it('never pays for time before the shift started', () => {
    // A rewound device clock must not mint gold, and must not go negative either.
    const s = shift(4);
    expect(earn(s, NOW - 10 * HOUR)).toEqual({ minutes: 0, gold: 0, xp: 0 });
  });

  it('rounds down rather than up', () => {
    const s = shift(1);
    const earned = earn(s, NOW + 90_000); // 1.5 minutes
    expect(earned.minutes).toBe(1);
    expect(Number.isInteger(earned.gold)).toBe(true);
    expect(Number.isInteger(earned.xp)).toBe(true);
  });
});

describe('patrol is deliberately the worse deal', () => {
  it('pays less gold per hour than the same hour spent on missions', () => {
    // §2: patrol is ~55% of the mission rate. If this ever inverts, missions are pointless.
    for (const level of [5, 25, 60]) {
      const s = shift(1, level);
      const patrolGold = earn(s, NOW + HOUR).gold;

      // An hour of missions is ~7.7 Vigor at the 5-minute cadence; compare like for like by
      // pricing the same Vigor a full day's patrol would notionally compete with.
      const missionGoldPerVigor = missionPayout(level, 5, xpNeeded(level)).gold / 5;
      expect(patrolGold, `level ${level}`).toBeLessThan(missionGoldPerVigor * 14);
    }
  });

  it('pays far less XP than missions', () => {
    for (const level of [5, 25, 60]) {
      const hourOfPatrol = earn(shift(1, level), NOW + HOUR).xp;
      const oneShortMission = missionPayout(level, 5, xpNeeded(level)).xp;

      expect(hourOfPatrol, `level ${level}`).toBeLessThan(oneShortMission);
    }
  });

  it('cannot out-earn a full day of Vigor even at maximum length', () => {
    // Twelve hours of patrol must not beat spending the day's Vigor on missions.
    for (const level of [10, 40, 90]) {
      const maxPatrol = earn(shift(MAX_SHIFT_HOURS, level), NOW + MAX_SHIFT_HOURS * HOUR).gold;
      const fullDayOfMissions =
        missionPayout(level, 20, xpNeeded(level)).gold * (VIGOR_PER_DAY / 20);

      expect(maxPatrol, `level ${level}`).toBeLessThan(fullDayOfMissions);
    }
  });
});

describe('shift timing', () => {
  it('reports completion only once the clock says so', () => {
    const s = shift(3);
    expect(isShiftComplete(s, NOW)).toBe(false);
    expect(isShiftComplete(s, s.endsAt - 1)).toBe(false);
    expect(isShiftComplete(s, s.endsAt)).toBe(true);
  });

  it('counts down and never goes negative', () => {
    const s = shift(2);
    expect(msRemaining(s, NOW)).toBe(2 * HOUR);
    expect(msRemaining(s, s.endsAt + HOUR)).toBe(0);
  });

  it('runs progress from 0 to 1', () => {
    const s = shift(4);
    expect(shiftProgress(s, NOW)).toBe(0);
    expect(shiftProgress(s, NOW + 2 * HOUR)).toBeCloseTo(0.5, 5);
    expect(shiftProgress(s, s.endsAt + HOUR)).toBe(1);
  });

  it('never reports more minutes than the shift was signed for', () => {
    const s = shift(1);
    expect(minutesServed(s, NOW + 99 * HOUR)).toBe(60);
  });
});

describe('previewEarnings', () => {
  it('matches what the shift actually pays', () => {
    // The slider's promise has to be the thing that gets paid, or the preview is a lie.
    for (const hours of [1, 5, 12]) {
      for (const level of [3, 30]) {
        const preview = previewEarnings(hours, level, xpNeeded(level));
        const actual = earn(shift(hours, level), NOW + hours * HOUR);

        expect(actual, `${hours}h @${level}`).toEqual(preview);
      }
    }
  });

  it('clamps a nonsense length rather than previewing nonsense', () => {
    expect(previewEarnings(99, 10, xpNeeded(10))).toEqual(
      previewEarnings(MAX_SHIFT_HOURS, 10, xpNeeded(10)),
    );
    expect(previewEarnings(0, 10, xpNeeded(10))).toEqual(
      previewEarnings(MIN_SHIFT_HOURS, 10, xpNeeded(10)),
    );
  });
});

describe('the shift report', () => {
  it('has something to say about every length of shift', () => {
    for (let hours = MIN_SHIFT_HOURS; hours <= MAX_SHIFT_HOURS; hours += 1) {
      expect(linesForShift(hours).length, `${hours}h`).toBeGreaterThanOrEqual(
        lineCountForShift(hours),
      );
    }
  });

  it('keeps the night lines for shifts long enough to have a night in them', () => {
    expect(linesForShift(1).some((line) => line.minHours)).toBe(false);
    expect(linesForShift(12).length).toBe(PATROL_LOG_LINES.length);
  });

  it('tells more of the story the longer the shift', () => {
    expect(lineCountForShift(1)).toBeLessThan(lineCountForShift(12));
  });

  it('has unique ids', () => {
    const ids = PATROL_LOG_LINES.map((line) => line.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
