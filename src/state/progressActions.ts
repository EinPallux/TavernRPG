/**
 * One credit path for everything the game counts (daily-loop spec §1, guilds spec §4).
 *
 * Before this module the guild bounty had its own `creditBounty`, called from three of the six
 * places it needed to be, and the Notice Board was about to grow a second one beside it. That is
 * the failure CLAUDE.md already records twice — the bounty target that disagreed with the hall's
 * copy, and `zoneMissions` counting attempts while its sibling counted victories. A second
 * definition of "a mission was completed" is the same bug looking for a third occasion.
 *
 * So: `credit(save, metric, units)` is the only way a player action becomes a number, and it
 * feeds **every** consumer at once — the weekly bounty, the day's tasks, and the lifetime tally
 * the board's draw uses to find what the player has been neglecting. Adding a consumer means
 * editing one function; adding a metric means crediting it at the one place the action happens.
 *
 * Building it turned up the reason it was needed: `itemsScrapped` and `levelsGained` are two of
 * the six bounty metrics and **neither was ever credited from the player's side.** A week that
 * drew either one gave the player nothing they could do about it, and the hall carried the whole
 * bounty alone. Both are wired here.
 */

import { addToTally, type ProgressMetric } from '@/data/progress';
import { BOUNTY_METRICS, type BountyMetric } from '@/data/bounties';
import type { SaveFile } from '@/engine/save/schema';
import { creditBounty } from './guildActions';

const BOUNTY_SET = new Set<string>(BOUNTY_METRICS);

function isBountyMetric(metric: ProgressMetric): metric is BountyMetric {
  return BOUNTY_SET.has(metric);
}

/**
 * Count something the player did.
 *
 * Idempotent in the only sense that matters: zero and negative credits are ignored rather than
 * subtracted, so a caller passing a computed delta that came out negative cannot quietly undo
 * yesterday's progress.
 */
export function credit(save: SaveFile, metric: ProgressMetric, units: number): SaveFile {
  if (units <= 0) return save;

  const withBounty = isBountyMetric(metric) ? creditBounty(save, metric, units) : save;

  return {
    ...withBounty,
    tasks: {
      ...withBounty.tasks,
      today: addToTally(withBounty.tasks.today, metric, units),
      lifetime: addToTally(withBounty.tasks.lifetime, metric, units),
    },
  };
}

/** Several at once, for the paths that produce more than one kind of event. */
export function creditAll(
  save: SaveFile,
  entries: readonly (readonly [ProgressMetric, number])[],
): SaveFile {
  return entries.reduce((next, [metric, units]) => credit(next, metric, units), save);
}
