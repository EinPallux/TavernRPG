/**
 * What the game counts (daily-loop spec §1, guilds spec §4).
 *
 * **One vocabulary, two consumers.** The weekly Guild Bounty and the Notice Board's daily tasks
 * both ask the player to do a countable thing, and before this module they would have kept
 * separate lists of what those things are. That is the failure CLAUDE.md already records from two
 * directions — the bounty's target once disagreed with the hall's copy of it, and `zoneMissions`
 * counted attempts while its sibling counted victories. A second list of "what counts as a
 * mission completed" is the same bug waiting for a third occasion.
 *
 * So there is one union, credited through one function (`state/progressActions.ts`), and each
 * consumer narrows to the subset it can use. Adding a metric means adding it here and crediting
 * it at the one place the action happens.
 *
 * Pure data module.
 */

export const PROGRESS_METRICS = [
  /** Contracts **won**. Losses do not count, here or in `activity.missionsCompleted`. */
  'missions',
  'arenaWins',
  /** Whole hours banked from a completed patrol shift. */
  'patrolHours',
  'itemsScrapped',
  'itemsSold',
  /** Levels the hero gained, from any source. */
  'levelsGained',
  /** Gold given to the hall's treasury. Guild-only — there is no solo equivalent. */
  'goldDonated',
  /** Gold spent at the attribute trainer. The game's primary sink, so a good thing to nudge. */
  'goldTrained',
  'petsFed',
  /** Dungeon floors cleared, first time or not. */
  'dungeonFloors',
  /** Cards drawn at Fortune's Table, free ones included. */
  'gachaRolls',
  /** Strikes taken at the Emberforge's anvil, including recipe crafts. */
  'itemsForged',
] as const;

export type ProgressMetric = (typeof PROGRESS_METRICS)[number];

/** A tally of everything counted so far today. Sparse — an untouched metric stores nothing. */
export type ProgressTally = Partial<Readonly<Record<ProgressMetric, number>>>;

export function tallyOf(tally: ProgressTally, metric: ProgressMetric): number {
  return tally[metric] ?? 0;
}

/** Add to a tally without mutating it. Zero and negative credits are ignored, not subtracted. */
export function addToTally(
  tally: ProgressTally,
  metric: ProgressMetric,
  units: number,
): ProgressTally {
  if (units <= 0) return tally;
  return { ...tally, [metric]: tallyOf(tally, metric) + units };
}
