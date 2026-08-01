/**
 * The greenhorn's due (balancing §19).
 *
 * The feature is one multiplier, and almost everything worth testing about it is a *property*
 * rather than a value: it decays, it never punishes, it ends, and — the one that keeps the game
 * safe — it moves gold and XP by the same factor.
 *
 * That last one is the whole design. Gold per level is `goldPerVigor(L) × vigorPerLevel(L)`;
 * scaling both sides by the same B leaves it unchanged, so a player arrives at every level with
 * the gold they always had and therefore the trained attributes they always had. Boosting XP
 * alone would have levelled new players into monsters they could not afford to fight.
 */

import { describe, expect, it } from 'vitest';
import {
  GREENHORN_PEAK,
  GREENHORN_UNTIL,
  goldPerVigor,
  greenhornBonus,
  greenhornPayoutBonus,
  missionPayout,
  vigorPerLevel,
  xpPerVigor,
} from './rewards';
import { xpNeeded } from './xp';

describe('the curve', () => {
  it('starts at the peak and ends at nothing', () => {
    expect(greenhornBonus(1)).toBeCloseTo(GREENHORN_PEAK, 5);
    expect(greenhornBonus(GREENHORN_UNTIL)).toBe(1);
    expect(greenhornBonus(GREENHORN_UNTIL + 30)).toBe(1);
  });

  it('only ever decays, and never below one', () => {
    let last = Infinity;
    for (let level = 1; level <= GREENHORN_UNTIL + 20; level += 1) {
      const now = greenhornBonus(level);
      expect(now, `rose at ${level}`).toBeLessThanOrEqual(last);
      expect(now, `a penalty at ${level}`).toBeGreaterThanOrEqual(1);
      last = now;
    }
  });

  it('refuses nonsense rather than trusting it', () => {
    expect(greenhornBonus(0)).toBeCloseTo(GREENHORN_PEAK, 5);
    expect(greenhornBonus(-5)).toBeCloseTo(GREENHORN_PEAK, 5);
    expect(greenhornBonus(Number.NaN)).toBeCloseTo(GREENHORN_PEAK, 5);
  });

  it('is a real hand up, not a rounding error', () => {
    // If this ever drops toward 1.1 the feature has been tuned into invisibility, which is worse
    // than not having it: the player still cannot feel it and the pacing bands still moved.
    expect(GREENHORN_PEAK).toBeGreaterThan(1.25);
    // And not so large that the first fortnight is a cutscene.
    expect(GREENHORN_PEAK).toBeLessThan(2.5);
  });
});

describe('gold and XP move together', () => {
  it('scales both by exactly the same factor', () => {
    for (const level of [1, 5, 12, 24, 25, 60]) {
      const bonus = greenhornPayoutBonus(level);
      expect(bonus.gold).toBe(bonus.xp);
      expect(bonus.gold).toBe(greenhornBonus(level));
    }
  });

  it('leaves gold-per-level untouched, which is what protects the power curve', () => {
    /*
     * The safety argument, as arithmetic. A player still arrives at level 20 having earned the
     * same gold — so the same trained attributes — as before the bonus existed. Only the clock
     * moved. Anything that broke this would be levelling players past what they can afford.
     */
    for (const level of [1, 4, 9, 18, 24]) {
      const bonus = greenhornBonus(level);
      const before = goldPerVigor(level) * vigorPerLevel(level);
      // With the bonus, a level costs `vigorPerLevel / bonus` Vigor and pays `goldPerVigor × bonus`.
      const after = goldPerVigor(level) * bonus * (vigorPerLevel(level) / bonus);
      expect(after).toBeCloseTo(before, 6);
    }
  });

  it('buys a level in fewer contracts, at every level it touches', () => {
    for (const level of [1, 5, 10, 20]) {
      const need = xpNeeded(level);
      const plain = missionPayout(level, 20, need);
      const paid = missionPayout(level, 20, need, greenhornPayoutBonus(level));
      expect(paid.xp, `level ${level}`).toBeGreaterThan(plain.xp);
      expect(paid.gold, `level ${level}`).toBeGreaterThan(plain.gold);
    }

    // And by the time it ends, a contract pays exactly what it always did.
    const need = xpNeeded(GREENHORN_UNTIL);
    expect(missionPayout(GREENHORN_UNTIL, 20, need, greenhornPayoutBonus(GREENHORN_UNTIL))).toEqual(
      missionPayout(GREENHORN_UNTIL, 20, need),
    );
  });
});

describe('the shape a new player feels', () => {
  it('turns the first fortnight from a flat line into a curve', () => {
    /*
     * The complaint this exists for. Levels per hundred Vigor used to run 2.30 at level one and
     * 1.55 at fifteen — a decay of a third across the whole onboarding, which reads as "the same
     * two contracts per level, forever". With the bonus the same span runs 3.68 to 1.94, which is
     * a shape a player can feel without being told about it.
     */
    const perDay = (level: number) => (100 / vigorPerLevel(level)) * greenhornBonus(level);

    expect(perDay(1)).toBeGreaterThan(3.2);
    // Steeper than the underlying curve over the same span: that steepness *is* the feature.
    const withBonus = perDay(1) / perDay(15);
    const without = 100 / vigorPerLevel(1) / (100 / vigorPerLevel(15));
    expect(withBonus).toBeGreaterThan(without * 1.25);
  });

  it('gives a 20-minute contract at level one most of a level', () => {
    const level = 1;
    const need = xpNeeded(level);
    const paid = missionPayout(level, 20, need, greenhornPayoutBonus(level));
    // Was 46% of a level, which is two contracts and forty minutes of waiting for the first one.
    expect(paid.xp / need).toBeGreaterThan(0.6);
    expect(xpPerVigor(level, need)).toBeGreaterThan(0);
  });
});
