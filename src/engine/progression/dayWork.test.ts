import { describe, expect, it } from 'vitest';
import { DAY_WORK_DICE, MAX_DAILY_VIGOR, dayWorkProgress, diceFor, dicePaidFor } from './dayWork';
import { ALE_DICE_COST, ALE_PER_DAY, ALE_VIGOR, DAY_WORK_RUNGS, VIGOR_PER_DAY } from './rewards';

describe('the rungs', () => {
  it('pays nothing until the first one', () => {
    expect(diceFor(0)).toBe(0);
    expect(diceFor(DAY_WORK_RUNGS[0]! - 1)).toBe(0);
    expect(diceFor(DAY_WORK_RUNGS[0]!)).toBe(1);
  });

  it('is monotone, and never pays the same rung twice', () => {
    let last = 0;
    for (let spent = 0; spent <= MAX_DAILY_VIGOR + 50; spent += 1) {
      const now = diceFor(spent);
      expect(now, `dropped at ${spent}`).toBeGreaterThanOrEqual(last);
      expect(now - last, `two rungs on one point at ${spent}`).toBeLessThanOrEqual(1);
      last = now;
    }
  });

  it('tops out at the track and stays there', () => {
    expect(diceFor(MAX_DAILY_VIGOR)).toBe(DAY_WORK_DICE);
    expect(diceFor(MAX_DAILY_VIGOR * 10)).toBe(DAY_WORK_DICE);
  });

  it('ignores nonsense rather than trusting it', () => {
    expect(diceFor(-40)).toBe(0);
    expect(diceFor(Number.NaN)).toBe(0);
    expect(dicePaidFor(80, 40)).toBe(0);
  });
});

describe('paying for a spend', () => {
  it('pays the difference, so replaying the same transition cannot double-pay', () => {
    // The whole replay-safety argument, as an assertion: the payout is a function of the pair,
    // not an increment, so computing it again from the same pair gives the same answer.
    const before = 40;
    const after = 60;
    expect(dicePaidFor(before, after)).toBe(1);
    expect(dicePaidFor(before, after)).toBe(1);
    // And from the new total onward, that rung is behind you.
    expect(dicePaidFor(after, after + 20)).toBe(0);
  });

  it('pays every rung a single large spend crosses', () => {
    expect(dicePaidFor(0, MAX_DAILY_VIGOR)).toBe(DAY_WORK_DICE);
  });

  it('adds up to the same total however the day is chopped up', () => {
    // A player running 20-minute contracts and one walking the road a stage at a time have done
    // the same day's work, and the track has to agree.
    const inOnePiece = dicePaidFor(0, 150);

    let stepwise = 0;
    let total = 0;
    for (let i = 0; i < 150; i += 1) {
      stepwise += dicePaidFor(total, total + 1);
      total += 1;
    }
    expect(stepwise).toBe(inOnePiece);

    // Seven 20-minute contracts is 140 Vigor however you slice it, and worth the same two dice.
    let byContract = 0;
    total = 0;
    for (let i = 0; i < 7; i += 1) {
      byContract += dicePaidFor(total, total + 20);
      total += 20;
    }
    expect(total).toBe(140);
    expect(byContract).toBe(dicePaidFor(0, 140));
  });
});

describe('what the day can hold', () => {
  it('gives a base day two dice and no more', () => {
    /*
     * The shape of the whole feature. A hundred Vigor is what turning up buys, and it is worth
     * two dice — a real top-up against the ~1.9 a day everything else pays put together.
     */
    expect(diceFor(VIGOR_PER_DAY)).toBe(2);
    expect(DAY_WORK_RUNGS.filter((rung) => rung <= VIGOR_PER_DAY)).toHaveLength(2);
  });

  it('puts the last die behind all three Ales, and prices it at exactly what it pays', () => {
    /*
     * The reason this cannot run away, stated as arithmetic.
     *
     * The third rung is out of reach on the base allowance. Reaching it means buying Ale, and the
     * Ale that gets you there costs at least as much as the rung pays — so the trade the player
     * makes is *time for time*, never dice for dice. A track whose top rung paid more than the
     * Ale to reach it would be a machine for printing a currency the game refuses to sell.
     */
    const lastRung = DAY_WORK_RUNGS.at(-1)!;
    expect(lastRung).toBeGreaterThan(VIGOR_PER_DAY);

    const alesNeeded = Math.ceil((lastRung - VIGOR_PER_DAY) / ALE_VIGOR);
    expect(alesNeeded).toBeLessThanOrEqual(ALE_PER_DAY);
    expect(alesNeeded * ALE_DICE_COST).toBeGreaterThanOrEqual(
      DAY_WORK_DICE - diceFor(VIGOR_PER_DAY),
    );
  });

  it('cannot be pushed past its ceiling by any amount of Ale', () => {
    // Bounded by construction rather than by a cap somebody remembered to write: the most Vigor a
    // day can hold is a fact about Ale, and the track cannot outrun it.
    expect(diceFor(MAX_DAILY_VIGOR)).toBe(DAY_WORK_DICE);
    expect(MAX_DAILY_VIGOR).toBe(VIGOR_PER_DAY + ALE_PER_DAY * ALE_VIGOR);
  });

  it('leaves a full-Ale day dice-neutral on the Ale itself', () => {
    /*
     * Three Ale costs three dice and the finished track pays three, so the player who genuinely
     * spends the extra Vigor gets the Ale for free and keeps their chest and calendar dice for
     * Fortune's Table. The player who buys Ale and does not spend it is simply out of pocket,
     * which is the correct answer to buying something you did not need.
     */
    expect(DAY_WORK_DICE - ALE_PER_DAY * ALE_DICE_COST).toBe(0);
  });
});

describe('the meter', () => {
  it('restarts between rungs rather than creeping across the day', () => {
    const first = dayWorkProgress(DAY_WORK_RUNGS[0]! - 1);
    expect(first.earned).toBe(0);
    expect(first.stepShare).toBeGreaterThan(0.9);

    const justAfter = dayWorkProgress(DAY_WORK_RUNGS[0]!);
    expect(justAfter.earned).toBe(1);
    expect(justAfter.stepShare).toBeLessThan(0.2);
  });

  it('says how far the next die is, and stops saying it when there is none', () => {
    const mid = dayWorkProgress(10);
    expect(mid.nextAt).toBe(DAY_WORK_RUNGS[0]);
    expect(mid.toGo).toBe(DAY_WORK_RUNGS[0]! - 10);

    const done = dayWorkProgress(MAX_DAILY_VIGOR);
    expect(done.nextAt).toBeNull();
    expect(done.toGo).toBeNull();
    expect(done.stepShare).toBe(1);
  });

  it('never reports a share outside 0–1, at any spend', () => {
    for (let spent = -20; spent <= MAX_DAILY_VIGOR + 40; spent += 3) {
      const track = dayWorkProgress(spent);
      expect(track.stepShare).toBeGreaterThanOrEqual(0);
      expect(track.stepShare).toBeLessThanOrEqual(1);
      expect(track.earned).toBe(diceFor(Math.max(0, spent)));
    }
  });
});
