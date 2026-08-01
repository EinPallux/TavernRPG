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
import {
  MILESTONES,
  MILESTONE_KIND,
  TARGET_DAYS,
  TARGET_EARLIEST,
  drift,
  earlyBy,
  simulatePacing,
  windowDrift,
  withinBand,
} from './pacing';

/** The ROADMAP's acceptance tolerance on the §0 table. */
const TOLERANCE = 0.2;

const run = simulatePacing({ days: 220 });

describe('the level curve keeps §0’s promises', () => {
  for (const milestone of ['level-10', 'level-25', 'level-55'] as const) {
    const window = `day ${TARGET_EARLIEST[milestone]}–${TARGET_DAYS[milestone]}`;
    it(`${milestone} lands within ±20% of ${window}`, () => {
      const reached = run.reached[milestone];
      expect(reached, `${milestone} never happened`).not.toBeNull();

      const off = windowDrift(run, milestone)!;
      expect(
        Math.abs(off),
        `${milestone}: day ${reached} against §0's ${window} — ${(off * 100).toFixed(0)}% outside it ` +
          `(${(drift(run, milestone)! * 100).toFixed(0)}% off the promise)`,
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

describe('every §0 row is inside the band the ROADMAP asks for', () => {
  for (const milestone of MILESTONES) {
    it(`${milestone} (${MILESTONE_KIND[milestone]}) holds at ±20%`, () => {
      const reached = run.reached[milestone];
      expect(reached, `${milestone} never happened inside 220 days`).not.toBeNull();

      const off = drift(run, milestone)!;
      expect(
        withinBand(run, milestone, TOLERANCE),
        `${milestone}: day ${reached} against a target of ${TARGET_DAYS[milestone]} — ${(off * 100).toFixed(0)}% off`,
      ).toBe(true);
    });
  }

  it('penalises a schedule row in both directions and a deadline row in one', () => {
    /*
     * The distinction is load-bearing, so it is asserted rather than only commented. A content
     * gate arriving at half its target is as wrong as arriving at double — the game would be
     * handing over everything before the player wants it. A chase arriving early is generosity.
     */
    const early = { ...run, reached: { ...run.reached, 'level-55': 5, 'full-set': 5 } };
    expect(withinBand(early, 'level-55')).toBe(false);
    expect(withinBand(early, 'full-set')).toBe(true);

    const late = { ...run, reached: { ...run.reached, 'level-55': 90, 'full-set': 200 } };
    expect(withinBand(late, 'level-55')).toBe(false);
    expect(withinBand(late, 'full-set')).toBe(false);
  });

  it('measures a schedule row against §0’s window, not against one end of it', () => {
    /*
     * The rule the Long Road forced into the open. §0 promises level 25 in *week two*, and the
     * row had been measured against day 14 alone — so the game delivering on day 10 read as a
     * 29% miss for arriving four days into the week it promised.
     *
     * The band is not looser for it. Day 10 is inside week two and passes; day 5 is not and
     * still fails, which is the failure two-sidedness exists to catch.
     */
    expect(TARGET_EARLIEST['level-25']).toBe(8);
    const inWeekTwo = { ...run, reached: { ...run.reached, 'level-25': 10 } };
    expect(withinBand(inWeekTwo, 'level-25')).toBe(true);
    expect(windowDrift(inWeekTwo, 'level-25')).toBe(0);
    // ...and the drift off the promise is still reported, because it is still a fact.
    expect(drift(inWeekTwo, 'level-25')).toBeLessThan(0);

    const wayEarly = { ...run, reached: { ...run.reached, 'level-25': 5 } };
    expect(withinBand(wayEarly, 'level-25')).toBe(false);
  });

  it('never counts a milestone that did not happen as passing', () => {
    const missed = { ...run, reached: { ...run.reached, 'full-set': null } };
    expect(withinBand(missed, 'full-set')).toBe(false);
  });
});

describe('the set chase', () => {
  it('hands over the first piece well inside the level-55 window', () => {
    // §0 pairs "level 55" with "1–2 set pieces equipped" at around day 30. Met comfortably.
    expect(run.reached['first-set-piece']!).toBeLessThan(TARGET_DAYS['level-55']);
  });

  it('closes a full set on the promise, because the forge is finally in the model', () => {
    const full = run.reached['full-set'];
    expect(full, 'a full set never closed inside 220 days').not.toBeNull();

    /*
     * This read 125 days until Phase 17 — 2.4× the promise — and the cause was two things
     * stacked. The sim excluded the recipe route on the reasoning that a deterministic craft
     * would flatter the number, and the recipe route was itself unreachable: `2` Starmetal a
     * craft against an epic scrap yielding an average of half of one priced the forge's
     * guaranteed path at ~210 days. Neither was visible without costing the other.
     *
     * Banded rather than pinned, because both halves are `[TUNE]` and a change to either should
     * show up here as a number to re-record, not as a red test with no reading attached.
     */
    expect(full!).toBeGreaterThan(TARGET_DAYS['full-set'] * 0.6);
    expect(full!).toBeLessThan(TARGET_DAYS['full-set'] * 1.2);
  });

  it('is still mostly the gacha, with the forge as the closer', () => {
    // If the forge ever supplies the *whole* chase, the featured card has stopped mattering and
    // Fortune's Table is decoration. The first piece should still arrive before a recipe could.
    expect(run.reached['first-set-piece']!).toBeLessThan(run.reached['full-set']! / 3);
  });
});

describe('generosity is reported, not hidden', () => {
  it('says how far ahead of the promise the early rows landed', () => {
    // The two rows that beat their deadline by a wide margin. Recorded in balancing §16 as
    // accepted, and asserted here so "accepted" cannot quietly drift into "unmeasured".
    expect(earlyBy(run, 'first-set-piece')).toBeGreaterThan(15);
    expect(earlyBy(run, 'top-100')).toBeGreaterThan(20);
  });

  it('returns null for a row that did not beat its target', () => {
    expect(earlyBy(run, 'level-55')).toBeNull();
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
