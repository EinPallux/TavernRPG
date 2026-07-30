/**
 * Reset engine tests.
 *
 * Midnight has to be trustworthy: a player who comes back after a week must find a full day of
 * Vigor and not seven, a player who reloads twice in a minute must not get two resets, and a
 * player whose clock jumps backwards must not lose their day. All three are cheap to get wrong
 * and expensive to notice in production.
 */

import { describe, expect, it } from 'vitest';
import { GameClock, createFixedWallClock } from '@/engine/clock';
import { ALE_PER_DAY, VIGOR_PER_DAY } from '@/engine/progression/rewards';
import {
  canDrinkAle,
  msUntilNextReset,
  processResets,
  vigorCeiling,
  type ResettableState,
} from './resetEngine';

/** A clock fixed to a known local date, so day keys are predictable. */
function clockAt(iso: string) {
  const wall = createFixedWallClock(new Date(iso).getTime());
  return { clock: new GameClock(wall), wall };
}

const between = (clock: GameClock) => (from: string, to: string) => clock.dayKeysBetween(from, to);

function stateOn(day: string | null, overrides: Partial<ResettableState> = {}): ResettableState {
  return {
    lastProcessedDay: day,
    vigor: 40,
    alesToday: 2,
    freeAlesToday: 1,
    boardRerollsToday: 1,
    boardDay: day,
    shops: { armory: { day, items: [], sold: [], rerollsToday: 0 } },
    ...overrides,
  };
}

describe('processResets', () => {
  const { clock } = clockAt('2026-07-29T10:00:00');
  const walk = between(clock);

  it('adopts today on a save that has never been processed, without claiming a reset', () => {
    const outcome = processResets(stateOn(null), '2026-07-29', walk);

    expect(outcome.didReset).toBe(false);
    expect(outcome.daysProcessed).toEqual([]);
    expect(outcome.state.lastProcessedDay).toBe('2026-07-29');
    // A brand-new hero has missed nothing, so nothing is refilled or cleared.
    expect(outcome.state.vigor).toBe(40);
    expect(outcome.state.alesToday).toBe(2);
  });

  it('does nothing at all when the day has not turned', () => {
    const before = stateOn('2026-07-29');
    const outcome = processResets(before, '2026-07-29', walk);

    expect(outcome.didReset).toBe(false);
    expect(outcome.state).toBe(before);
  });

  it('is idempotent — running it twice in a row changes nothing the second time', () => {
    const first = processResets(stateOn('2026-07-28'), '2026-07-29', walk);
    expect(first.didReset).toBe(true);

    const second = processResets(first.state, '2026-07-29', walk);
    expect(second.didReset).toBe(false);
    expect(second.state).toBe(first.state);
  });

  it('refills Vigor and clears the day’s counters on a single boundary', () => {
    const outcome = processResets(stateOn('2026-07-28'), '2026-07-29', walk);

    expect(outcome.didReset).toBe(true);
    expect(outcome.daysProcessed).toEqual(['2026-07-29']);
    expect(outcome.state.vigor).toBe(VIGOR_PER_DAY);
    expect(outcome.state.alesToday).toBe(0);
    expect(outcome.state.freeAlesToday).toBe(0);
    expect(outcome.state.boardRerollsToday).toBe(0);
    // Yesterday's board is stale; nulling the day forces a redraw.
    expect(outcome.state.boardDay).toBeNull();
    // Bram and Sela restock overnight (shops spec §1). Clearing the shelves is what makes the
    // next visit redraw them — a shop comparing its own stored day would be the second clock.
    expect(outcome.state.shops).toEqual({});
  });

  it('restocks the shops once however many midnights were missed', () => {
    // A week away is one restock, not seven — the same rule Vigor follows.
    const outcome = processResets(stateOn('2026-07-22'), '2026-07-29', walk);

    expect(outcome.daysProcessed).toHaveLength(7);
    expect(outcome.state.shops).toEqual({});
  });

  it('leaves the shelves alone when no boundary was crossed', () => {
    const before = stateOn('2026-07-29');
    const outcome = processResets(before, '2026-07-29', walk);

    expect(outcome.didReset).toBe(false);
    expect(outcome.state.shops).toBe(before.shops);
  });

  it('walks every missed boundary in order after a long absence', () => {
    const outcome = processResets(stateOn('2026-07-20'), '2026-07-29', walk);

    expect(outcome.daysProcessed).toHaveLength(9);
    expect(outcome.daysProcessed[0]).toBe('2026-07-21');
    expect(outcome.daysProcessed.at(-1)).toBe('2026-07-29');
    // Ordered, so a future calendar or weekly boundary can react day by day.
    expect([...outcome.daysProcessed].sort()).toEqual([...outcome.daysProcessed]);
  });

  it('does not stack Vigor across missed days', () => {
    // The whole point of the daily reset: nine days away is still one day of Vigor.
    const outcome = processResets(stateOn('2026-07-20', { vigor: 0 }), '2026-07-29', walk);
    expect(outcome.state.vigor).toBe(VIGOR_PER_DAY);
  });

  it('reports the Vigor the player left on the table', () => {
    const outcome = processResets(stateOn('2026-07-28', { vigor: 35 }), '2026-07-29', walk);
    expect(outcome.vigorForfeited).toBe(35);

    const spent = processResets(stateOn('2026-07-28', { vigor: 0 }), '2026-07-29', walk);
    expect(spent.vigorForfeited).toBe(0);
  });

  it('holds the line when the clock goes backwards', () => {
    // Yesterday cannot un-happen. The player keeps the day they already have.
    const before = stateOn('2026-07-29', { vigor: 12 });
    const outcome = processResets(before, '2026-07-28', walk);

    expect(outcome.didReset).toBe(false);
    expect(outcome.state).toBe(before);
    expect(outcome.state.vigor).toBe(12);
  });

  it('survives a malformed stored day rather than wiping the save', () => {
    const before = stateOn('not-a-day', { vigor: 12 });
    const outcome = processResets(before, '2026-07-29', walk);

    expect(outcome.didReset).toBe(false);
    expect(outcome.state.vigor).toBe(12);
  });

  it('crosses a month and a year boundary correctly', () => {
    expect(processResets(stateOn('2026-07-31'), '2026-08-01', walk).daysProcessed).toEqual([
      '2026-08-01',
    ]);
    expect(processResets(stateOn('2026-12-31'), '2027-01-01', walk).daysProcessed).toEqual([
      '2027-01-01',
    ]);
  });

  it('treats a DST day as one day, not 23 or 25 hours', () => {
    // Day-key comparison is the reason this works; elapsed-hours arithmetic would drift.
    const spring = clockAt('2026-03-29T12:00:00');
    const outcome = processResets(stateOn('2026-03-28'), '2026-03-29', between(spring.clock));

    expect(outcome.daysProcessed).toEqual(['2026-03-29']);
    expect(outcome.state.vigor).toBe(VIGOR_PER_DAY);
  });

  it('caps an absurd clock jump instead of hanging', () => {
    const outcome = processResets(stateOn('1999-01-01'), '2026-07-29', walk);

    expect(outcome.didReset).toBe(true);
    // Trimmed to the clock's cap, keeping the most recent boundaries.
    expect(outcome.daysProcessed.length).toBeLessThanOrEqual(400);
    expect(outcome.daysProcessed.at(-1)).toBe('2026-07-29');
    expect(outcome.state.lastProcessedDay).toBe('2026-07-29');
  });

  it('leaves fields it does not own untouched', () => {
    // The engine owns daily counters. Everything else in the save is none of its business.
    const extended = { ...stateOn('2026-07-28'), gold: 5_000, heroName: 'Wren' };
    const outcome = processResets(extended, '2026-07-29', walk);

    expect(outcome.state.gold).toBe(5_000);
    expect(outcome.state.heroName).toBe('Wren');
  });
});

describe('vigor ceiling', () => {
  it('rises by 20 for each Ale drunk today', () => {
    expect(vigorCeiling(0)).toBe(VIGOR_PER_DAY);
    expect(vigorCeiling(1)).toBe(VIGOR_PER_DAY + 20);
    expect(vigorCeiling(3)).toBe(VIGOR_PER_DAY + 60);
  });

  it('stops counting past the daily Ale cap', () => {
    expect(vigorCeiling(99)).toBe(vigorCeiling(ALE_PER_DAY));
    expect(vigorCeiling(-1)).toBe(VIGOR_PER_DAY);
  });
});

describe('canDrinkAle', () => {
  it('allows exactly three a day', () => {
    expect(canDrinkAle(0)).toBe(true);
    expect(canDrinkAle(2)).toBe(true);
    expect(canDrinkAle(3)).toBe(false);
    expect(canDrinkAle(4)).toBe(false);
  });
});

describe('msUntilNextReset', () => {
  it('counts down to local midnight', () => {
    const at = new Date('2026-07-29T23:00:00').getTime();
    expect(msUntilNextReset(at)).toBe(60 * 60 * 1000);
  });

  it('never returns a negative countdown', () => {
    const midnight = new Date('2026-07-30T00:00:00').getTime();
    expect(msUntilNextReset(midnight)).toBeGreaterThan(0);
  });
});
