/**
 * Balance guardrails (combat spec §7).
 *
 * These are the assertions that keep a future tweak from quietly ruining a class. The bands
 * encode a deliberate policy, arrived at by measuring rather than by assertion:
 *
 *  - **Mirrors must be ~50%.** A same-class fight is symmetric; anything else means the engine
 *    itself favours a seat, which would corrupt every other number.
 *  - **Each class must average ~50%** across every opponent and level.
 *  - **Individual matchups may be lopsided, but not blowouts.** TavernRPG deliberately has a
 *    counter triangle — Bard beats Mage, Mage beats Hunter, Hunter beats Bard — because an
 *    arena where every duel is a coin flip has no texture. The cap keeps a counter from
 *    becoming a wall.
 *
 * Fight counts are kept modest so CI stays quick; `npm run balance` runs the same measurements
 * at higher volume for tuning sessions.
 */

import { describe, expect, it } from 'vitest';
import { CLASSES } from '@/data/classes';
import { classMatrix, missionWinRates } from './simulate';

const LEVELS = [10, 25, 50, 100];
const FIGHTS = 800;

/** A mirror match is symmetric, so anything outside this means a seat advantage exists. */
const MIRROR_BAND: [number, number] = [0.45, 0.55];
/** Averaged over every opponent, no class may be quietly better than the rest. */
const AVERAGE_BAND: [number, number] = [0.45, 0.55];
/** The widest a designed counter may get before it stops being a matchup and becomes a wall. */
const MATCHUP_BAND: [number, number] = [0.3, 0.7];

const matrices = LEVELS.map((level) => ({ level, rows: classMatrix(level, FIGHTS) }));

describe('class balance — mirrors', () => {
  it.each(LEVELS)('is an even fight at level %i', (level) => {
    const rows = matrices.find((entry) => entry.level === level)!.rows;

    for (const row of rows.filter((entry) => entry.a === entry.b)) {
      expect(
        row.winRateA,
        `${row.a} mirror at level ${level} is ${(row.winRateA * 100).toFixed(1)}%`,
      ).toBeGreaterThanOrEqual(MIRROR_BAND[0]);
      expect(row.winRateA).toBeLessThanOrEqual(MIRROR_BAND[1]);
    }
  });
});

describe('class balance — no class is stronger overall', () => {
  it('every class averages near 50% across all opponents and levels', () => {
    const wins = new Map<string, number[]>();

    for (const { rows } of matrices) {
      for (const row of rows) {
        if (row.a === row.b) continue;
        wins.set(row.a, [...(wins.get(row.a) ?? []), row.winRateA]);
        wins.set(row.b, [...(wins.get(row.b) ?? []), 1 - row.winRateA]);
      }
    }

    for (const definition of CLASSES) {
      const samples = wins.get(definition.id) ?? [];
      const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;

      expect(
        average,
        `${definition.id} averages ${(average * 100).toFixed(1)}% — it is out of step with the others`,
      ).toBeGreaterThanOrEqual(AVERAGE_BAND[0]);
      expect(average).toBeLessThanOrEqual(AVERAGE_BAND[1]);
    }
  });
});

describe('class balance — counters stay counters', () => {
  it('no matchup at any level becomes an auto-loss', () => {
    const blowouts: string[] = [];

    for (const { level, rows } of matrices) {
      for (const row of rows) {
        if (row.a === row.b) continue;
        if (row.winRateA < MATCHUP_BAND[0] || row.winRateA > MATCHUP_BAND[1]) {
          blowouts.push(`${row.a} vs ${row.b} @L${level}: ${(row.winRateA * 100).toFixed(1)}%`);
        }
      }
    }

    expect(blowouts, `matchups outside ${MATCHUP_BAND[0] * 100}–${MATCHUP_BAND[1] * 100}%`).toEqual(
      [],
    );
  });

  it('keeps the intended counter triangle: Bard > Mage > Hunter > Bard', () => {
    const rows = matrices.find((entry) => entry.level === 50)!.rows;
    const rate = (a: string, b: string) => {
      const direct = rows.find((row) => row.a === a && row.b === b);
      if (direct) return direct.winRateA;
      const flipped = rows.find((row) => row.a === b && row.b === a)!;
      return 1 - flipped.winRateA;
    };

    // Soft counters, not walls — the assertion is on the direction, with a sane ceiling.
    expect(rate('bard', 'mage')).toBeGreaterThan(0.55);
    expect(rate('mage', 'hunter')).toBeGreaterThan(0.55);
    expect(rate('hunter', 'bard')).toBeGreaterThan(0.55);
  });
});

describe('fight length', () => {
  it('stays inside what the battle scene can animate', () => {
    // Phase 4 has to replay these. A 2-round fight has no drama; a 60-round fight is a chore.
    for (const { level, rows } of matrices) {
      for (const row of rows) {
        expect(
          row.averageRounds,
          `${row.a} vs ${row.b} @L${level} averages ${row.averageRounds.toFixed(1)} rounds`,
        ).toBeGreaterThan(3);
        expect(row.averageRounds).toBeLessThan(30);
      }
    }
  });
});

describe('mission difficulty', () => {
  it.each([10, 50])(
    'an on-curve hero at level %i beats mission monsters at least 97% of the time',
    (level) => {
      // Missions are pacing, not challenge (balancing §5): losses should come from neglecting
      // gear for a long time, never from an unlucky Tuesday.
      for (const row of missionWinRates(level, 400)) {
        expect(
          row.winRate,
          `${row.classId} vs ${row.archetypeId} at level ${level}: ${(row.winRate * 100).toFixed(1)}%`,
        ).toBeGreaterThanOrEqual(0.97);
      }
    },
  );
});
