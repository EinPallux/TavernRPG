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
  /**
   * Contracts **signed**, won or lost.
   *
   * The sibling of `missions`, and the units differ on purpose — see the note in CLAUDE.md about
   * two counters that mean the same thing. It exists because the tutorial needs a fact that says
   * "this player has taken a job" and cannot use the victory count: a first contract that *loses*
   * still taught the lesson, and a predicate that forgets it would send the tour backwards.
   */
  'missionsAccepted',
  /**
   * Contracts that **came home** — the timer ran out and the hero is at the door.
   *
   * Three counters over one lifecycle (signed, returned, won) rather than three names for the
   * same event, which is the thing CLAUDE.md warns about. They are here because each is a
   * different moment the tutorial has to be able to point at, and because a predicate built out
   * of *present* state — "is a mission running?" — walks the tour backwards on the second
   * contract. See the monotonicity note in `engine/tutorial/beats.ts`.
   */
  'missionsReturned',
  'arenaWins',
  /** Whole hours banked from a completed patrol shift. */
  'patrolHours',
  'itemsScrapped',
  'itemsSold',
  /** Pieces the player put on. Swapping one out for another counts once, for the one going on. */
  'itemsEquipped',
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
