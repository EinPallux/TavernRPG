/**
 * The balance harness (combat spec §7).
 *
 * Class balance is not something you can reason your way to — five kits with percentage procs
 * interact in ways no amount of staring at constants will reveal. So the engine ships with a
 * way to *measure*: thousands of seeded fights, summarised. CI asserts the bands; a human uses
 * `formatMatrix` to see where a change actually landed.
 *
 * Pure module — runs in plain Node.
 */

import { deriveSeed } from '@/engine/rng';
import { CLASSES } from '@/data/classes';
import { ARCHETYPES } from '@/data/monsterArchetypes';
import type { ClassId } from '@/engine/items/types';
import { buildMonsterCombatant, buildReferenceCombatant } from './combatant';
import { fight } from './fight';
import type { Combatant } from './types';

export interface SimulationSummary {
  readonly fights: number;
  /** Share of fights won by side A, 0–1. */
  readonly winRateA: number;
  readonly averageRounds: number;
  /** Share that ended on the round limit rather than a knockout. */
  readonly roundLimitRate: number;
}

export interface SimulateOptions {
  readonly fights?: number;
  /** Seed base; vary it to confirm a result is not an artefact of one seed family. */
  readonly seed?: number;
  /**
   * Swap sides every other fight. Initiative and the round-limit tiebreak both favour a
   * specific seat, so a one-sided sample would measure the seat, not the kit.
   */
  readonly alternateSides?: boolean;
}

export function simulate(
  a: Combatant,
  b: Combatant,
  { fights = 2_000, seed = 1, alternateSides = true }: SimulateOptions = {},
): SimulationSummary {
  let winsA = 0;
  let totalRounds = 0;
  let roundLimited = 0;

  for (let i = 0; i < fights; i += 1) {
    const fightSeed = deriveSeed(seed, 'sim', i);
    const swap = alternateSides && i % 2 === 1;

    const result = swap ? fight(b, a, fightSeed) : fight(a, b, fightSeed);
    const winnerIsA = swap ? result.winner === 'b' : result.winner === 'a';

    if (winnerIsA) winsA += 1;
    totalRounds += result.rounds;
    if (result.reason === 'round_limit') roundLimited += 1;
  }

  return {
    fights,
    winRateA: winsA / fights,
    averageRounds: totalRounds / fights,
    roundLimitRate: roundLimited / fights,
  };
}

export interface MatchupResult {
  readonly a: ClassId;
  readonly b: ClassId;
  readonly level: number;
  readonly winRateA: number;
  readonly averageRounds: number;
}

/** Every class against every other at one level, on equal budgets. */
export function classMatrix(level: number, fights = 2_000, seed = 7): MatchupResult[] {
  const results: MatchupResult[] = [];

  for (let i = 0; i < CLASSES.length; i += 1) {
    for (let j = i; j < CLASSES.length; j += 1) {
      const first = CLASSES[i]!.id;
      const second = CLASSES[j]!.id;
      const summary = simulate(
        buildReferenceCombatant(first, level, `${first}-a`),
        buildReferenceCombatant(second, level, `${second}-b`),
        { fights, seed: deriveSeed(seed, first, second, level) },
      );
      results.push({
        a: first,
        b: second,
        level,
        winRateA: summary.winRateA,
        averageRounds: summary.averageRounds,
      });
    }
  }

  return results;
}

export interface MissionWinRate {
  readonly classId: ClassId;
  readonly archetypeId: string;
  readonly winRate: number;
}

/**
 * How often an on-curve hero of each class beats each monster archetype at their own level.
 * Missions are pacing, not challenge: the design target is ≥97% (balancing §5).
 */
export function missionWinRates(level: number, fights = 1_000, seed = 11): MissionWinRate[] {
  const rows: MissionWinRate[] = [];

  for (const definition of CLASSES) {
    for (const template of ARCHETYPES) {
      const summary = simulate(
        buildReferenceCombatant(definition.id, level, definition.id),
        buildMonsterCombatant({
          id: template.id,
          name: template.name,
          archetypeId: template.id,
          level,
        }),
        { fights, seed: deriveSeed(seed, definition.id, template.id, level) },
      );
      rows.push({ classId: definition.id, archetypeId: template.id, winRate: summary.winRateA });
    }
  }

  return rows;
}

/** Human-readable matrix for the dev tools and for tuning sessions. */
export function formatMatrix(results: readonly MatchupResult[]): string {
  return results
    .map(
      (row) =>
        `${row.a.padEnd(13)} vs ${row.b.padEnd(13)} ${(row.winRateA * 100)
          .toFixed(1)
          .padStart(5)}%   ${row.averageRounds.toFixed(1).padStart(5)} rounds`,
    )
    .join('\n');
}
