/**
 * Reward curve tests.
 *
 * These pin the shape of the economy, not just the arithmetic: linear-in-Vigor payouts, patrol
 * deliberately weaker than missions, and an XP curve that stays self-correcting as `xpNeeded`
 * grows. Break any of those and the game is a different game, so they are asserted rather than
 * assumed.
 */

import { describe, expect, it } from 'vitest';
import { xpNeeded } from './xp';
import {
  ALE_PER_DAY,
  ALE_VIGOR,
  MISSION_DURATIONS,
  VIGOR_PER_DAY,
  consolationPayout,
  goldPatrolPerHour,
  goldPerVigor,
  isMissionDuration,
  missionPayout,
  xpPatrolPerHour,
  xpPerVigor,
} from './rewards';

const payoutAt = (level: number, duration: (typeof MISSION_DURATIONS)[number]) =>
  missionPayout(level, duration, xpNeeded(level));

describe('goldPerVigor', () => {
  it('matches the published curve', () => {
    // balancing §2: round(3.5 · L^1.35 + 8). Exact values, mirrored in the doc.
    expect(goldPerVigor(1)).toBe(12);
    expect(goldPerVigor(5)).toBe(39);
    expect(goldPerVigor(10)).toBe(86);
    expect(goldPerVigor(25)).toBe(278);
    expect(goldPerVigor(50)).toBe(696);
    expect(goldPerVigor(100)).toBe(1_762);
  });

  it('rises with level and never returns nonsense', () => {
    for (let level = 1; level < 200; level += 1) {
      expect(goldPerVigor(level + 1)).toBeGreaterThan(goldPerVigor(level));
    }
    // Guards against a level-0 or negative hero from a corrupt save.
    expect(goldPerVigor(0)).toBe(goldPerVigor(1));
    expect(goldPerVigor(-5)).toBe(goldPerVigor(1));
  });
});

describe('xpPerVigor', () => {
  it('is a fixed share of the level’s own requirement', () => {
    for (const level of [1, 10, 25, 50, 100]) {
      expect(xpPerVigor(level, xpNeeded(level))).toBeCloseTo(xpNeeded(level) / 320, 6);
    }
  });

  it('spends a full day of Vigor for roughly a third of a level', () => {
    // 100 Vigor / 320 ≈ 0.31 of a level per day from missions alone, at every level.
    for (const level of [1, 20, 60, 120]) {
      const dailyXp = xpPerVigor(level, xpNeeded(level)) * VIGOR_PER_DAY;
      expect(dailyXp / xpNeeded(level)).toBeCloseTo(0.3125, 4);
    }
  });
});

describe('missionPayout', () => {
  it('scales linearly with the Vigor spent', () => {
    // The core fairness rule: four 5-minute missions pay what one 20-minute mission pays.
    // Exact to within rounding — each payout is rounded once, so a split can differ by a coin.
    for (const level of [1, 17, 64]) {
      const short = payoutAt(level, 5);
      const long = payoutAt(level, 20);

      expect(Math.abs(long.gold - short.gold * 4), `level ${level} gold`).toBeLessThanOrEqual(2);
      expect(Math.abs(long.xp - short.xp * 4), `level ${level} xp`).toBeLessThanOrEqual(2);
    }
  });

  it('pays the same per Vigor point whichever length you pick', () => {
    // Stated as the rate rather than the total: this is the rule the player feels.
    for (const level of [1, 17, 64]) {
      const rates = MISSION_DURATIONS.map((duration) => payoutAt(level, duration).gold / duration);
      for (const rate of rates) {
        expect(rate, `level ${level}`).toBeCloseTo(goldPerVigor(level), 6);
      }
    }
  });

  it('pays a full day of Vigor about 100 Vigor’s worth, however it is spent', () => {
    const level = 30;
    const inFives = 20 * payoutAt(level, 5).gold;
    const inTwenties = 5 * payoutAt(level, 20).gold;

    expect(inFives).toBeCloseTo(inTwenties, 0);
    expect(inTwenties).toBeCloseTo(goldPerVigor(level) * VIGOR_PER_DAY, 0);
  });

  it('never pays a fraction of a coin', () => {
    for (const level of [1, 7, 33, 91]) {
      for (const duration of MISSION_DURATIONS) {
        const payout = payoutAt(level, duration);
        expect(Number.isInteger(payout.gold), `${level}/${duration} gold`).toBe(true);
        expect(Number.isInteger(payout.xp), `${level}/${duration} xp`).toBe(true);
      }
    }
  });
});

describe('patrol rates', () => {
  it('pays roughly 55% of the mission gold rate per hour', () => {
    // §2: goldPatrol(L) = 14 · goldPerVigor(L) · 0.55 — an hour of patrol is worth about
    // 7.7 Vigor of mission time, so patrol is a fallback rather than a strategy.
    for (const level of [5, 40, 90]) {
      const missionGoldPerHourEquivalent = goldPerVigor(level) * 14;
      expect(goldPatrolPerHour(level) / missionGoldPerHourEquivalent).toBeCloseTo(0.55, 2);
    }
  });

  it('pays deliberately weak XP so missions always dominate', () => {
    const level = 25;
    const perHour = xpPatrolPerHour(level, xpNeeded(level));
    // A whole hour of patrol is worth four Vigor of mission XP.
    expect(perHour).toBe(Math.round(4 * xpPerVigor(level, xpNeeded(level))));
    expect(perHour).toBeLessThan(payoutAt(level, 5).xp);
  });
});

describe('consolation', () => {
  it('pays half the gold and no XP on a loss', () => {
    const full = { gold: 501, xp: 400 };
    expect(consolationPayout(full)).toEqual({ gold: 251, xp: 0 });
  });
});

describe('Vigor constants', () => {
  it('lets Ale extend a day by at most 60 Vigor', () => {
    expect(ALE_VIGOR * ALE_PER_DAY).toBe(60);
    expect(VIGOR_PER_DAY).toBe(100);
  });

  it('costs exactly its duration in Vigor', () => {
    // §6: the two numbers are the same by design; a mission's price is its length.
    for (const duration of MISSION_DURATIONS) {
      expect(isMissionDuration(duration)).toBe(true);
    }
    expect(isMissionDuration(7)).toBe(false);
    expect(isMissionDuration(0)).toBe(false);
  });

  it('divides a fresh day evenly into missions', () => {
    // 100 Vigor is exactly 20 short missions or 5 long ones — no awkward remainder.
    expect(VIGOR_PER_DAY % 5).toBe(0);
    expect(VIGOR_PER_DAY % 20).toBe(0);
  });
});
