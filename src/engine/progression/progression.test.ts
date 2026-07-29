import { describe, expect, it } from 'vitest';
import { applyXp, levelProgress, totalXpToLevel, xpNeeded, xpPerVigor } from './xp';
import { maxAffordable, statCost, statCostFor } from './stats';

describe('xp curve', () => {
  it('matches the balancing doc at its checkpoints', () => {
    // docs/design/balancing-formulas.md §1 quotes these exactly; if the curve moves, the doc
    // moves in the same commit. Exact equality — an approximate curve is not a spec.
    expect(xpNeeded(1)).toBe(300);
    expect(xpNeeded(10)).toBe(9_954);
    expect(xpNeeded(25)).toBe(57_740);
    expect(xpNeeded(50)).toBe(233_814);
    expect(xpNeeded(100)).toBe(974_936);
  });

  it('rises with every level', () => {
    for (let level = 1; level < 200; level += 1) {
      expect(xpNeeded(level + 1)).toBeGreaterThan(xpNeeded(level));
    }
  });

  it('has no level cap', () => {
    expect(Number.isFinite(xpNeeded(5000))).toBe(true);
    expect(xpNeeded(5000)).toBeGreaterThan(xpNeeded(1000));
  });

  it('scales reward primitives off the same curve', () => {
    expect(xpPerVigor(10)).toBeCloseTo(xpNeeded(10) / 320, 5);
  });
});

describe('applyXp', () => {
  it('accumulates without levelling when short of the threshold', () => {
    const result = applyXp(1, 0, 100);
    expect(result).toEqual({ level: 1, xp: 100, levelsGained: 0 });
  });

  it('levels up and carries the remainder', () => {
    const result = applyXp(1, 0, xpNeeded(1) + 50);
    expect(result.level).toBe(2);
    expect(result.xp).toBe(50);
    expect(result.levelsGained).toBe(1);
  });

  it('rolls through several levels from one big award', () => {
    const award = xpNeeded(1) + xpNeeded(2) + xpNeeded(3) + 10;
    const result = applyXp(1, 0, award);
    expect(result.level).toBe(4);
    expect(result.levelsGained).toBe(3);
    expect(result.xp).toBe(10);
  });

  it('levels exactly at the threshold', () => {
    const result = applyXp(5, 0, xpNeeded(5));
    expect(result.level).toBe(6);
    expect(result.xp).toBe(0);
  });

  it('ignores negative awards rather than draining progress', () => {
    const result = applyXp(3, 120, -500);
    expect(result.level).toBe(3);
    expect(result.xp).toBe(120);
  });

  it('reports progress toward the next level', () => {
    expect(levelProgress(1, 0)).toBe(0);
    expect(levelProgress(1, xpNeeded(1))).toBe(1);
    expect(levelProgress(1, xpNeeded(1) / 2)).toBeCloseTo(0.5, 5);
  });

  it('sums a total that matches walking the curve', () => {
    expect(totalXpToLevel(1)).toBe(0);
    expect(totalXpToLevel(4)).toBe(xpNeeded(1) + xpNeeded(2) + xpNeeded(3));
  });
});

describe('attribute training costs', () => {
  it('matches the balancing doc at its checkpoints', () => {
    // docs/design/balancing-formulas.md §3, exact.
    expect(statCost(10)).toBe(29);
    expect(statCost(50)).toBe(383);
    expect(statCost(100)).toBe(1_199);
    expect(statCost(300)).toBe(7_337);
    expect(statCost(1000)).toBe(53_477);
  });

  it('gets more expensive with every point owned', () => {
    for (let owned = 0; owned < 300; owned += 1) {
      expect(statCost(owned + 1)).toBeGreaterThanOrEqual(statCost(owned));
    }
  });

  it('is cheap enough at the very start to feel immediate', () => {
    // A new hero with 100 gold must be able to feel the loop straight away.
    expect(statCostFor(0, 5)).toBeLessThan(100);
  });

  it('totals a multi-point purchase correctly', () => {
    expect(statCostFor(0, 3)).toBe(statCost(0) + statCost(1) + statCost(2));
    expect(statCostFor(10, 0)).toBe(0);
  });
});

describe('maxAffordable', () => {
  it('buys nothing when the next point is out of reach', () => {
    expect(maxAffordable(500, 0)).toEqual({ points: 0, cost: 0 });
  });

  it('never spends more than the purse', () => {
    for (const gold of [1, 37, 500, 12_000, 900_000]) {
      const result = maxAffordable(0, gold);
      expect(result.cost).toBeLessThanOrEqual(gold);
      // And one more point would have been too much.
      expect(result.cost + statCost(result.points)).toBeGreaterThan(gold);
    }
  });

  it('agrees with statCostFor for the amount it reports', () => {
    const result = maxAffordable(12, 5_000);
    expect(result.cost).toBe(statCostFor(12, result.points));
  });

  it('buys fewer points the more you already own', () => {
    const early = maxAffordable(0, 10_000).points;
    const late = maxAffordable(400, 10_000).points;
    expect(late).toBeLessThan(early);
  });
});
