/**
 * Does the game take as long as it promised? (balancing §0, ROADMAP Phase 17 acceptance.)
 *
 * The three level rows are held to ±20%, which is the acceptance line. The other three are
 * *recorded* rather than enforced at that tolerance, and the reason is worth reading before
 * loosening or tightening anything here:
 *
 * - **The set chase misses by a lot, and the miss is real.** Mission drops carry `set: 0` — the
 *   only routes to a set piece are Vesna's featured card and the forge's recipes. On the
 *   published featured rate alone a full five-piece set lands around day 125 against §0's
 *   45–60. That is a design question (raise a published rate? make recipes cheaper?) rather
 *   than a tuning nudge, so it is logged as Q23 and asserted at the number the game *actually*
 *   produces, so the day somebody changes it, this test notices.
 * - **Top 100 is modelled, not simulated.** Rank comes from honor against the field's shape
 *   rather than from three months of world ticks, which is accurate enough for a band and cheap
 *   enough for CI.
 *
 * A test that quietly widened its band to fit would be worse than no test: the whole point of
 * §0 is that somebody wrote down how long this should take.
 */

import { describe, expect, it } from 'vitest';
import { CASUAL_PLAYER, FRUGAL_PLAYER } from '@/engine/economy/simulate';
import { MILESTONES, TARGET_DAYS, drift, simulatePacing } from './pacing';

/** The ROADMAP's acceptance tolerance on the §0 table. */
const TOLERANCE = 0.2;

const run = simulatePacing({ days: 220 });

describe('the level curve keeps §0’s promises', () => {
  for (const milestone of ['level-10', 'level-25', 'level-55'] as const) {
    it(`${milestone} lands within ±20% of day ${TARGET_DAYS[milestone]}`, () => {
      const reached = run.reached[milestone];
      expect(reached, `${milestone} never happened`).not.toBeNull();

      const off = drift(run, milestone)!;
      expect(
        Math.abs(off),
        `${milestone}: day ${reached} against a target of ${TARGET_DAYS[milestone]} — ${(off * 100).toFixed(0)}% off`,
      ).toBeLessThanOrEqual(TOLERANCE);
    });
  }

  it('reports fractional days, not the day it noticed', () => {
    // The distinction is worth a test of its own: rounding a milestone up to the end of its day
    // adds up to a whole day, which at a three-day target is a third of the budget and was on
    // its own enough to fail a curve that is inside tolerance.
    const reached = run.reached['level-10']!;
    expect(Number.isInteger(reached)).toBe(false);
  });

  it('never goes backwards', () => {
    const order = ['level-10', 'level-25', 'level-55'] as const;
    for (let index = 1; index < order.length; index += 1) {
      expect(run.reached[order[index]!]!, order[index]).toBeGreaterThan(
        run.reached[order[index - 1]!]!,
      );
    }
  });
});

describe('the set chase — recorded, and currently behind', () => {
  it('hands over the first piece well inside the level-55 window', () => {
    // §0 pairs "level 55" with "1–2 set pieces equipped" at around day 30. That half is met
    // comfortably: the first piece arrives around day 12.
    expect(run.reached['first-set-piece']!).toBeLessThan(TARGET_DAYS['level-55']);
  });

  it('takes far longer than §0 promises to close a full set — see Q23', () => {
    const full = run.reached['full-set'];
    expect(full, 'a full set never closed inside 220 days').not.toBeNull();

    // Asserted at the shape of the miss rather than at the promise. If somebody raises the
    // featured rate or lets the forge in, this fails and the doc gets updated with it.
    expect(full!).toBeGreaterThan(TARGET_DAYS['full-set'] * 1.5);
    expect(full!).toBeLessThan(TARGET_DAYS['full-set'] * 3);
  });
});

describe('the ladder', () => {
  it('puts a daily player in the top hundred inside three months', () => {
    const top = run.reached['top-100'];
    expect(top, 'never reached the top hundred').not.toBeNull();
    expect(top!).toBeLessThanOrEqual(90);
  });
});

describe('the profiles stay ordered', () => {
  it('rewards playing more, at every milestone', () => {
    const casual = simulatePacing({ days: 220, style: CASUAL_PLAYER });

    for (const milestone of ['level-10', 'level-25', 'level-55'] as const) {
      expect(casual.reached[milestone]!, milestone).toBeGreaterThan(run.reached[milestone]!);
    }
  });

  it('does not make shopping or a mount a requirement', () => {
    // The frugal control never buys a thing. If the milestones moved much, gear would have
    // become mandatory rather than optional.
    const frugal = simulatePacing({ days: 220, style: FRUGAL_PLAYER });
    expect(frugal.reached['level-55']!).toBeLessThan(run.reached['level-55']! * 1.15);
  });
});

describe('the instrument itself', () => {
  it('measures every milestone it declares', () => {
    for (const milestone of MILESTONES) {
      expect(run.reached[milestone], milestone).not.toBeUndefined();
    }
  });

  it('carries a ledger long enough to see the late milestones', () => {
    expect(run.ledger.length).toBe(220);
    expect(run.ledger.at(-1)!.xpTotal).toBeGreaterThan(run.ledger[0]!.xpTotal);
  });
});
