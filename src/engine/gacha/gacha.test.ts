/**
 * Fortune's Table, measured (ROADMAP Phase 13 acceptance).
 *
 * A gacha's honesty is not a claim, it is a measurement. Four things are asserted here and each
 * of them is something a player could in principle catch us on:
 *
 * - the **rates match the published table** over 100k rolls, on every banner;
 * - the **rotation is a pure function of the calendar**, across month boundaries and week starts;
 * - **pity fires at exactly the published count**, and free rolls do not advance it;
 * - **no roll is ever nothing** — including the dupe path, which is the one that would be
 *   tempting to leave as a silent no-op.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { setsForClass } from '@/data/gearSets';
import {
  BANNERS,
  DUPE_STARMETAL,
  MONTHLY_TRACK_STEP,
  ROLL_OUTCOMES,
  SHARDS_PER_RECIPE,
  banner,
  outcomeOdds,
  type BannerId,
  type RollOutcome,
} from '@/data/banners';
import {
  DAILY_SLOT_RATE_UP,
  activeBanner,
  activeBanners,
  dailySlotWeights,
  monthKeyFor,
  weekPeriodFor,
} from './schedule';
import { rollBanner, type RollContext } from './roll';
import { rungsCrossed, rungsEarned, rollsToNextRung, shardsToRecipes, TRACK_RUNGS } from './track';

const SEED = 0x5eed_1313;

function contextFor(overrides: Partial<RollContext> = {}): RollContext {
  return {
    classId: 'bard',
    level: 30,
    ownedSetPieces: new Set<string>(),
    pityCount: 0,
    pityMatchesFeatured: false,
    aleCapped: false,
    ...overrides,
  };
}

/** Roll a banner `count` times off one stream, tallying outcomes. */
function tally(
  id: BannerId,
  count: number,
  day = '2026-08-05',
  context = contextFor(),
): Record<RollOutcome, number> {
  const active = activeBanner(id, day, SEED, context.classId);
  const counts = Object.fromEntries(ROLL_OUTCOMES.map((o) => [o, 0])) as Record<
    RollOutcome,
    number
  >;

  for (let i = 0; i < count; i += 1) {
    // A fresh context each roll: pity off, so this measures the *table* rather than the floor.
    const result = rollBanner(active, context, createRng(SEED + i, `rate/${id}/${i}`));
    counts[result.outcome] += 1;
  }
  return counts;
}

describe('the rotation is the calendar, and nothing else', () => {
  it('gives the same table to the same seed on the same date, forever', () => {
    const once = activeBanners('2026-08-05', SEED, 'bard');
    const twice = activeBanners('2026-08-05', SEED, 'bard');

    expect(once.map((entry) => entry.featuring)).toEqual(twice.map((entry) => entry.featuring));
    // A different world sees a different table. Nothing about the date decides it alone.
    const elsewhere = activeBanners('2026-08-05', SEED + 1, 'bard');
    expect(once.length).toBe(3);
    expect(elsewhere.length).toBe(3);
  });

  it('holds the weekly banner steady Monday to Sunday, then turns it over', () => {
    // 2026-08-03 is a Monday.
    const week = ['2026-08-03', '2026-08-04', '2026-08-06', '2026-08-09'];
    const periods = week.map(weekPeriodFor);
    expect(new Set(periods).size).toBe(1);
    expect(periods[0]).toBe('2026-08-03');

    const featured = week.map((day) => activeBanner('weekly', day, SEED, 'bard').featuring);
    expect(new Set(featured).size).toBe(1);

    // The following Monday is a new period, and the card said so in advance.
    expect(weekPeriodFor('2026-08-10')).toBe('2026-08-10');
    const sunday = activeBanner('weekly', '2026-08-09', SEED, 'bard');
    const monday = activeBanner('weekly', '2026-08-10', SEED, 'bard');
    expect(sunday.next.period).toBe(monday.period);
    expect(sunday.next.featuring).toBe(monday.featuring);
  });

  it('turns the monthly banner over on the first, across a year boundary', () => {
    expect(monthKeyFor('2026-12-31')).toBe('2026-12');
    expect(monthKeyFor('2027-01-01')).toBe('2027-01');

    const december = activeBanner('monthly', '2026-12-31', SEED, 'mage');
    const january = activeBanner('monthly', '2027-01-01', SEED, 'mage');
    expect(december.period).toBe('2026-12');
    expect(january.period).toBe('2027-01');
    expect(december.next.period).toBe('2027-01');
    expect(december.next.featuring).toBe(january.featuring);
  });

  it('redraws the daily every single day', () => {
    const days = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'];
    const slots = days.map((day) => activeBanner('daily', day, SEED, 'hunter').slot);
    // Not asserting they are all different — five draws from ten slots will collide — but the
    // period must move, or the countdown is lying.
    expect(days.map((day) => activeBanner('daily', day, SEED, 'hunter').period)).toEqual(days);
    expect(slots.every(Boolean)).toBe(true);
  });

  it('only ever features a set the class can actually wear', () => {
    for (const classId of ['warrior', 'bard', 'mage', 'hunter', 'swashbuckler'] as const) {
      const wearable = new Set(setsForClass(classId).map((entry) => entry.id));
      for (let day = 1; day <= 28; day += 1) {
        const key = `2026-09-${String(day).padStart(2, '0')}`;
        for (const id of ['weekly', 'monthly'] as const) {
          const active = activeBanner(id, key, SEED, classId);
          expect(wearable.has(active.set!.id)).toBe(true);
        }
      }
    }
  });

  it('leaves February alone', () => {
    // A leap day is a day like any other; the point is that the arithmetic does not throw or
    // produce a period the next month disagrees with.
    expect(monthKeyFor('2028-02-29')).toBe('2028-02');
    const leap = activeBanner('monthly', '2028-02-29', SEED, 'warrior');
    expect(leap.next.period).toBe('2028-03');
    expect(weekPeriodFor('2028-02-29')).toBe('2028-02-28');
  });
});

describe('the odds on the panel are the odds in the engine', () => {
  for (const definition of BANNERS) {
    it(`matches the published table on ${definition.name} over 100k rolls`, () => {
      const ROLLS = 100_000;
      const counts = tally(definition.id, ROLLS);

      for (const outcome of ROLL_OUTCOMES) {
        const published = outcomeOdds(definition, outcome);
        const measured = (counts[outcome] * 100) / ROLLS;
        // ±0.6pp: comfortably inside sampling noise at 100k, tight enough to catch a table typo.
        expect(Math.abs(measured - published)).toBeLessThan(0.6);
      }
    });
  }

  it('never produces an outcome that is not on the table', () => {
    const counts = tally('weekly', 5_000);
    const total = ROLL_OUTCOMES.reduce((sum, outcome) => sum + counts[outcome], 0);
    expect(total).toBe(5_000);
  });

  it("weights the Daily Draw's highlighted slot three to one, and nothing else", () => {
    const weights = dailySlotWeights('helmet');
    const helmet = weights.find((entry) => entry.slot === 'helmet')!;
    const other = weights.find((entry) => entry.slot === 'boots')!;
    expect(helmet.weight / other.weight).toBe(DAILY_SLOT_RATE_UP);

    // And the rate-up does not touch how often "featured" comes up — the published number is
    // the same on every day of the week.
    const monday = tally('daily', 20_000, '2026-08-03');
    const tuesday = tally('daily', 20_000, '2026-08-04');
    const share = (counts: Record<RollOutcome, number>) => (counts.featured * 100) / 20_000;
    expect(Math.abs(share(monday) - share(tuesday))).toBeLessThan(1.2);
  });
});

describe('pity is a floor, and it is the published one', () => {
  const active = activeBanner('weekly', '2026-08-05', SEED, 'bard');
  const featuredSetId = active.set!.id;

  it('guarantees the featured card on exactly the twentieth roll', () => {
    const at19 = rollBanner(
      active,
      contextFor({ pityCount: 19, pityMatchesFeatured: true }),
      createRng(SEED, 'pity/19'),
    );
    const at20 = rollBanner(
      active,
      contextFor({ pityCount: 20, pityMatchesFeatured: true }),
      createRng(SEED, 'pity/20'),
    );

    expect(at20.outcome).toBe('featured');
    expect(at20.pitied).toBe(true);
    expect(at20.pityCount).toBe(0);
    // Nineteen is not twenty. (It may still hit on the table's own 5% — but not *because* of pity.)
    expect(at19.pitied).toBe(false);
  });

  it('banks one per paid roll and resets on any featured hit, pitied or not', () => {
    let count = 0;
    let sawNaturalReset = false;

    for (let i = 0; i < 500; i += 1) {
      const result = rollBanner(
        active,
        contextFor({ pityCount: count, pityMatchesFeatured: true }),
        createRng(SEED + i, `bank/${i}`),
      );
      if (result.outcome === 'featured' && !result.pitied) sawNaturalReset = true;
      expect(result.pityCount).toBe(result.outcome === 'featured' ? 0 : count + 1);
      count = result.pityCount;
      expect(count).toBeLessThanOrEqual(banner('weekly').pity);
    }

    expect(sawNaturalReset).toBe(true);
  });

  it('does not let a free roll advance the counter', () => {
    const paid = rollBanner(active, contextFor({ pityCount: 7 }), createRng(SEED, 'free/paid'));
    const free = rollBanner(
      active,
      contextFor({ pityCount: 7, free: true }),
      createRng(SEED, 'free/free'),
    );

    // Same stream, same card — the only difference is what it costs the counter.
    expect(free.outcome).toBe(paid.outcome);
    if (paid.outcome !== 'featured') {
      expect(paid.pityCount).toBe(8);
      expect(free.pityCount).toBe(7);
    }
  });

  it('holds the counter but will not pay it out on a set it was not counting toward', () => {
    const other = setsForClass('bard').find((entry) => entry.id !== featuredSetId)!;
    expect(other.id).not.toBe(featuredSetId);

    // Twenty banked toward the *other* set: this week's card is not owed.
    const result = rollBanner(
      active,
      contextFor({ pityCount: 20, pityMatchesFeatured: false }),
      createRng(SEED, 'mismatch'),
    );
    expect(result.pitied).toBe(false);
  });

  it('gives the Grand Reading a track instead of a counter', () => {
    expect(banner('monthly').pity).toBe(0);
    expect(rungsEarned(MONTHLY_TRACK_STEP - 1)).toBe(0);
    expect(rungsEarned(MONTHLY_TRACK_STEP)).toBe(1);
    expect(rungsEarned(MONTHLY_TRACK_STEP * 3)).toBe(TRACK_RUNGS);
    // It does not loop — a track that did would make the monthly strictly better than the weekly.
    expect(rungsEarned(MONTHLY_TRACK_STEP * 40)).toBe(TRACK_RUNGS);
    expect(rollsToNextRung(MONTHLY_TRACK_STEP * 3)).toBeNull();
    expect(rollsToNextRung(1)).toBe(MONTHLY_TRACK_STEP - 1);
  });

  it('crosses each rung exactly once, however big the jump', () => {
    expect(rungsCrossed(0, 14)).toHaveLength(0);
    expect(rungsCrossed(14, 15).map((rung) => rung.at)).toEqual([1]);
    // A ten-roll that steps over a rung still only pays it once.
    expect(rungsCrossed(12, 22).map((rung) => rung.at)).toEqual([1]);
    // And a save replayed from zero pays every rung it should, in order, with no repeats.
    expect(rungsCrossed(0, 100).map((rung) => rung.at)).toEqual([1, 2, 3]);
    expect(rungsCrossed(100, 200)).toHaveLength(0);
  });
});

describe('the featured card is missing-first, and a dupe is still a payout', () => {
  const active = activeBanner('weekly', '2026-08-05', SEED, 'bard');
  const set = active.set!;

  it('never hands over a piece already owned while one is missing', () => {
    const owned = new Set(set.pieces.slice(0, 4).map((piece) => `${set.id}:${piece.slot}`));
    const missing = set.pieces[4]!.slot;

    for (let i = 0; i < 200; i += 1) {
      const result = rollBanner(
        active,
        contextFor({ ownedSetPieces: owned, pityCount: 20, pityMatchesFeatured: true }),
        createRng(SEED + i, `missing/${i}`),
      );
      expect(result.outcome).toBe('featured');
      expect(result.reward.kind).toBe('item');
      if (result.reward.kind === 'item') expect(result.reward.item.slot).toBe(missing);
    }
  });

  it('melts a duplicate on the table rather than swallowing it', () => {
    const owned = new Set(set.pieces.map((piece) => `${set.id}:${piece.slot}`));
    const result = rollBanner(
      active,
      contextFor({ ownedSetPieces: owned, pityCount: 20, pityMatchesFeatured: true }),
      createRng(SEED, 'dupe'),
    );

    expect(result.outcome).toBe('featured');
    expect(result.reward.kind).toBe('dupe');
    if (result.reward.kind !== 'dupe') return;
    expect(result.reward.materials.starmetal).toBe(DUPE_STARMETAL);
    expect(result.reward.shards).toBe(1);
    expect(result.label).toContain(set.name);
  });

  it('turns five shards into a recipe and keeps the change', () => {
    expect(shardsToRecipes(4)).toEqual({ recipes: 0, remainder: 4 });
    expect(shardsToRecipes(SHARDS_PER_RECIPE)).toEqual({ recipes: 1, remainder: 0 });
    expect(shardsToRecipes(SHARDS_PER_RECIPE * 2 + 3)).toEqual({ recipes: 2, remainder: 3 });
  });
});

describe('no roll is ever nothing', () => {
  it('produces a reward on every outcome, on every banner', () => {
    for (const definition of BANNERS) {
      const active = activeBanner(definition.id, '2026-08-05', SEED, 'bard');
      const seen = new Set<RollOutcome>();

      for (let i = 0; i < 3_000; i += 1) {
        const result = rollBanner(active, contextFor(), createRng(SEED + i, `any/${i}`));
        seen.add(result.outcome);
        expect(result.reward).toBeTruthy();
        expect(result.label.length).toBeGreaterThan(0);

        switch (result.reward.kind) {
          case 'item':
            expect(result.reward.item.level).toBeGreaterThan(0);
            break;
          case 'gold':
            expect(result.reward.gold).toBeGreaterThan(0);
            break;
          case 'materials': {
            const { scrap, essence, starmetal } = result.reward.materials;
            expect(scrap + essence + starmetal).toBeGreaterThan(0);
            break;
          }
          case 'dupe':
            expect(result.reward.materials.starmetal).toBeGreaterThan(0);
            break;
          case 'ale':
            break;
        }
      }

      // Three thousand rolls should turn up every outcome on the table at least once.
      expect(seen.size).toBe(ROLL_OUTCOMES.length);
    }
  });

  it('pays gold for an Ale the player cannot drink', () => {
    const active = activeBanner('weekly', '2026-08-05', SEED, 'bard');
    let capped = 0;

    for (let i = 0; i < 2_000; i += 1) {
      const uncapped = rollBanner(active, contextFor(), createRng(SEED + i, `ale/${i}`));
      if (uncapped.outcome !== 'ale') continue;

      const result = rollBanner(
        active,
        contextFor({ aleCapped: true }),
        createRng(SEED + i, `ale/${i}`),
      );
      expect(result.outcome).toBe('ale');
      expect(result.reward.kind).toBe('gold');
      capped += 1;
    }

    expect(capped).toBeGreaterThan(50);
  });
});

describe('acquisition converges', () => {
  it('completes a five-piece set off the weekly banner inside the pity guarantee', () => {
    const active = activeBanner('weekly', '2026-08-05', SEED, 'bard');
    const set = active.set!;
    const owned = new Set<string>();
    let pity = 0;
    let rolls = 0;

    while (owned.size < set.pieces.length && rolls < 500) {
      const result = rollBanner(
        active,
        contextFor({ ownedSetPieces: owned, pityCount: pity, pityMatchesFeatured: true }),
        createRng(SEED + rolls, `converge/${rolls}`),
      );
      rolls += 1;
      pity = result.pityCount;
      if (result.reward.kind === 'item' && result.reward.item.setId === set.id) {
        owned.add(`${set.id}:${result.reward.item.slot}`);
      }
    }

    expect(owned.size).toBe(set.pieces.length);
    // Five pieces, each guaranteed inside twenty rolls — so a hundred is the ceiling, and the
    // 5% table means the honest expectation is well under it.
    expect(rolls).toBeLessThanOrEqual(set.pieces.length * banner('weekly').pity);
  });
});
