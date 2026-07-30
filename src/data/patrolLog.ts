/**
 * Patrol log lines (tavern-and-patrol spec §5).
 *
 * Patrol has no mechanics — it is a timer and a payout. What it has instead is a *report*, and
 * these lines are the entire reason a shift feels like a shift rather than an idle accrual. The
 * job is to make eight hours of nothing sound like eight hours of somewhere.
 *
 * Deliberately small stakes and mostly comic: the watch is where nothing happens, which is the
 * joke. Random patrol events with choices are post-1.0 (spec §5) — 1.0 keeps flavour only, so
 * nothing here may imply a decision the player didn't get to make.
 *
 * Pure data module.
 */

export interface PatrolLogLine {
  readonly id: string;
  readonly text: string;
  /** Only shown on shifts at least this long — some of these need a night to happen. */
  readonly minHours?: number;
}

const LINE_LIST = [
  { id: 'goose', text: 'Escorted a very lost goose home.' },
  { id: 'cart', text: 'Helped right an overturned cart. Took no payment. Was offered none.' },
  { id: 'drunk', text: 'Walked Tobin the cooper to his door. Again.' },
  { id: 'cat', text: 'Retrieved a cat from the chandler’s roof. It did not want retrieving.' },
  { id: 'argument', text: 'Settled an argument about a fence. Both parties still unhappy.' },
  { id: 'gate', text: 'Gate watch. Counted eleven carts and one very suspicious turnip merchant.' },
  { id: 'children', text: 'Chased off children throwing stones at the well. Missed being one.' },
  { id: 'brawl', text: 'Broke up a brawl outside the Tankard. Marla had already won it.' },
  { id: 'lamp', text: 'Relit four street lamps. Someone is putting them out on purpose.' },
  { id: 'dog', text: 'A dog followed the whole route. Good dog. No name.' },
  { id: 'purse', text: 'Returned a cut purse to its owner, minus the cutter, plus a bruise.' },
  { id: 'baker', text: 'The baker opened early and said nothing. That is how she says thank you.' },
  { id: 'rain', text: 'It rained for two hours. The cloak is not what it was.' },
  { id: 'bell', text: 'Rang the third bell. Nobody came. Nobody was supposed to.' },
  {
    id: 'night-quiet',
    text: 'Third watch, and the town went properly quiet. Not eerie. Just quiet.',
    minHours: 6,
  },
  {
    id: 'night-lights',
    text: 'Lights out on the Old King’s Road at two in the morning. Nothing came of it.',
    minHours: 6,
  },
  {
    id: 'dawn',
    text: 'Watched the sun come up over the mill. Worth the shift on its own.',
    minHours: 8,
  },
  {
    id: 'long-haul',
    text: 'Twelve hours. Hildy signed the book without looking up, which is her version of praise.',
    minHours: 12,
  },
] as const satisfies readonly PatrolLogLine[];

/** Widened for consumers; the literal above is what gets typo-checked. */
export const PATROL_LOG_LINES: readonly PatrolLogLine[] = LINE_LIST;

/**
 * The lines a shift of this length could produce. Never empty, so a report always has
 * something to say.
 */
export function linesForShift(hours: number): readonly PatrolLogLine[] {
  const eligible = PATROL_LOG_LINES.filter((line) => hours >= (line.minHours ?? 0));
  return eligible.length > 0 ? eligible : PATROL_LOG_LINES;
}

/** How many lines a report of this length prints — longer shifts have more to tell. */
export function lineCountForShift(hours: number): number {
  if (hours >= 8) return 4;
  if (hours >= 4) return 3;
  if (hours >= 2) return 2;
  return 1;
}
