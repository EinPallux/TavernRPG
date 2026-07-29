import { describe, expect, it } from 'vitest';
import { GameClock, createFixedWallClock, parseDayKey } from './clock';

/** 2026-07-29 14:30 local time. */
const BASE = new Date(2026, 6, 29, 14, 30, 0, 0).getTime();

describe('GameClock — monotonicity', () => {
  it('moves forward with the wall clock', () => {
    const wall = createFixedWallClock(BASE);
    const clock = new GameClock(wall);
    expect(clock.now()).toBe(BASE);
    wall.advance(60_000);
    expect(clock.now()).toBe(BASE + 60_000);
  });

  it('clamps backwards jumps so timers cannot be rewound', () => {
    const wall = createFixedWallClock(BASE);
    const clock = new GameClock(wall);
    clock.now();

    wall.set(BASE - 3 * 3_600_000); // player winds the device clock back 3 hours
    expect(clock.now()).toBe(BASE);
    expect(clock.snapshot().clampCount).toBe(1);

    wall.set(BASE + 1000); // real time catches up again
    expect(clock.now()).toBe(BASE + 1000);
  });

  it('restores its high-water mark from a snapshot', () => {
    const wall = createFixedWallClock(BASE - 10_000);
    const clock = new GameClock(wall, { lastSeen: BASE, clampCount: 2 });
    expect(clock.now()).toBe(BASE);
    expect(clock.snapshot().clampCount).toBe(3);
  });

  it('never reports negative elapsed or remaining spans', () => {
    const clock = new GameClock(createFixedWallClock(BASE));
    expect(clock.elapsedSince(BASE + 5_000)).toBe(0);
    expect(clock.remainingUntil(BASE - 5_000)).toBe(0);
    expect(clock.elapsedSince(BASE - 5_000)).toBe(5_000);
    expect(clock.remainingUntil(BASE + 5_000)).toBe(5_000);
  });
});

describe('GameClock — day keys', () => {
  const clock = new GameClock(createFixedWallClock(BASE));

  it('formats the local day key with padding', () => {
    expect(clock.dayKey(BASE)).toBe('2026-07-29');
    expect(clock.dayKey(new Date(2026, 0, 5, 0, 0, 0).getTime())).toBe('2026-01-05');
  });

  it('treats one minute before and after midnight as different days', () => {
    const beforeMidnight = new Date(2026, 6, 29, 23, 59, 0).getTime();
    const afterMidnight = new Date(2026, 6, 30, 0, 1, 0).getTime();
    expect(clock.isSameDay(beforeMidnight, afterMidnight)).toBe(false);
    expect(clock.dayKey(afterMidnight)).toBe('2026-07-30');
  });

  it('computes the next local midnight and the countdown to it', () => {
    const next = clock.nextLocalMidnight(BASE);
    expect(clock.dayKey(next)).toBe('2026-07-30');
    expect(new Date(next).getHours()).toBe(0);
    expect(clock.msUntilNextLocalMidnight(BASE)).toBe(next - BASE);
  });

  it('round-trips a day key through parseDayKey', () => {
    const parsed = parseDayKey('2026-07-29');
    expect(parsed).not.toBeNull();
    expect(clock.dayKey(parsed!)).toBe('2026-07-29');
    expect(new Date(parsed!).getHours()).toBe(0);
  });

  it('rejects malformed day keys', () => {
    expect(parseDayKey('2026-7-9')).toBeNull();
    expect(parseDayKey('yesterday')).toBeNull();
    expect(parseDayKey('')).toBeNull();
  });
});

describe('GameClock — missed reset boundaries', () => {
  const clock = new GameClock(createFixedWallClock(BASE));

  it('lists each crossed boundary in order', () => {
    expect(clock.dayKeysBetween('2026-07-29', '2026-08-02')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('returns nothing when no boundary was crossed', () => {
    expect(clock.dayKeysBetween('2026-07-29', '2026-07-29')).toEqual([]);
    expect(clock.dayKeysBetween('2026-07-29', '2026-07-28')).toEqual([]);
  });

  it('crosses month and year boundaries', () => {
    expect(clock.dayKeysBetween('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('handles a leap day', () => {
    expect(clock.dayKeysBetween('2028-02-27', '2028-03-01')).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });

  it('produces exactly one boundary per day across a nine-day absence', () => {
    const keys = clock.dayKeysBetween('2026-07-29', '2026-08-07');
    expect(keys).toHaveLength(9);
    expect(new Set(keys).size).toBe(9);
  });

  it('caps absurd spans instead of hanging the load path', () => {
    const keys = clock.dayKeysBetween('2020-01-01', '2026-07-29', 30);
    expect(keys).toHaveLength(30);
    expect(keys.at(-1)).toBe('2026-07-29');
  });
});
