/**
 * The weekly Guild Bounty pool (guilds spec §4).
 *
 * A bounty is a **counter with a name on it**. The whole design rests on one property: whatever
 * it counts must be something the guild is already doing, so a bounty reads as recognition rather
 * than as a chore list. "Members complete 120 missions" is a good week described out loud;
 * "Members complete 120 missions in Fogmoor Marsh between Tuesday and Thursday" is homework.
 *
 * Targets scale with roster size at draw time, because a bounty a guild of five cannot finish is
 * not a co-op goal, it is a weekly reminder that they are small.
 *
 * Pure data module.
 */

import type { ProgressMetric } from './progress';

/**
 * What a bounty counts — a **subset of `PROGRESS_METRICS`**, not a list of its own.
 *
 * Typed as a subset so a bounty cannot name something the credit path has never heard of. The
 * Notice Board narrows the same union from the other end; neither owns the vocabulary
 * (`data/progress.ts` does), which is what stops the two drifting.
 */
export const BOUNTY_METRICS = [
  'missions',
  'arenaWins',
  'patrolHours',
  'itemsScrapped',
  'levelsGained',
  'goldDonated',
] as const satisfies readonly ProgressMetric[];
export type BountyMetric = (typeof BOUNTY_METRICS)[number];

export interface BountyDef {
  readonly id: string;
  readonly metric: BountyMetric;
  /** Shown on the poster. `{target}` is filled at draw time. */
  readonly title: string;
  /** One line of colour beneath it. */
  readonly blurb: string;
  /**
   * Target *per member*, rounded up to a sane whole at draw time. A guild of five and a guild of
   * twenty-five should both finish a good week and both miss a bad one.
   */
  readonly perMember: number;
  /** Never ask for less than this, however small the roster. */
  readonly floor: number;
}

const BOUNTY_LIST = [
  {
    id: 'contracts',
    metric: 'missions',
    title: 'Complete {target} contracts',
    blurb: 'Marla has more work than hands. The hall takes the overflow.',
    perMember: 6,
    floor: 20,
  },
  {
    id: 'long-roads',
    metric: 'missions',
    title: 'Walk {target} contracts between you',
    blurb: 'The roads out of Emberhollow need using or they stop being roads.',
    perMember: 5,
    floor: 18,
  },
  {
    id: 'sand',
    metric: 'arenaWins',
    title: 'Win {target} fights in the sand',
    blurb: 'Hildy has offered the hall a standing booking. It would be rude not to.',
    perMember: 3,
    floor: 10,
  },
  {
    id: 'colours',
    metric: 'arenaWins',
    title: 'Take {target} rungs off other halls',
    blurb: 'Nothing personal. It is entirely personal.',
    perMember: 2,
    floor: 8,
  },
  {
    id: 'watch',
    metric: 'patrolHours',
    title: 'Stand {target} hours on the Watch',
    blurb: 'The City Watch is short again and Hildy is asking nicely.',
    perMember: 10,
    floor: 30,
  },
  {
    id: 'crucible',
    metric: 'itemsScrapped',
    title: 'Break down {target} pieces at the forge',
    blurb: 'Torvald wants the scrap and is prepared to be pleasant about it.',
    perMember: 4,
    floor: 12,
  },
  {
    id: 'climb',
    metric: 'levelsGained',
    title: 'Gain {target} levels between you',
    blurb: 'Everybody one step further along than they were on Monday.',
    perMember: 2,
    floor: 8,
  },
  {
    id: 'pot',
    metric: 'goldDonated',
    title: 'Put {target} gold in the pot',
    blurb: 'The Treasury does not fill itself, and the Drillmaster charges by the step.',
    perMember: 900,
    floor: 3_000,
  },
] as const satisfies readonly BountyDef[];

export const BOUNTIES: readonly BountyDef[] = BOUNTY_LIST;

export function bountyById(id: string): BountyDef | null {
  return BOUNTIES.find((bounty) => bounty.id === id) ?? null;
}

/** The target a guild of this size is asked for. */
export function bountyTarget(definition: BountyDef, memberCount: number): number {
  return Math.max(definition.floor, Math.round(definition.perMember * Math.max(1, memberCount)));
}

/** The poster line, with the number in it. */
export function bountyTitle(definition: BountyDef, target: number): string {
  return definition.title.replace('{target}', target.toLocaleString());
}
