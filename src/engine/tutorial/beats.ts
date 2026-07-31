/**
 * Where the player is in the tutorial (tutorial spec §2).
 *
 * **The active beat is derived, not stored.** It is the first beat the save cannot already prove
 * happened. There is no cursor to advance, nothing to keep in step with the game, and a reload
 * mid-beat resumes exactly where it was — because "where it was" was never written down, it was
 * always a question asked of the save.
 *
 * That is the same shape as pet ownership (Phase 14) and the banner schedule (Phase 13), and it
 * is here for the same reason: a stored position can disagree with reality. Accept a contract in
 * a second tab, finish a beat's action twice, or have a migration land mid-tutorial, and a cursor
 * is now pointing at something already done. A predicate cannot be wrong about the past.
 *
 * Two beats have nothing to *do* — the Notice Board's chest and the Crier's feed are things to
 * notice — so those store an acknowledgement. They are the only two, and keeping them the
 * minority is the point: a tutorial made of "Got it" buttons is a tutorial made of reading.
 *
 * Pure module.
 */

import { BEATS, type BeatDef, type BeatId } from '@/data/tutorial';
import { tallyOf } from '@/data/progress';
import type { SaveFile } from '@/engine/save/schema';

/** How many items are loose in the bags — the "first loot" beat's finish line. */
function bagCount(save: SaveFile): number {
  const hero = save.hero;
  if (!hero) return 0;
  return hero.backpack.filter(Boolean).length + hero.satchel.length;
}

/**
 * The fact in the save that proves each beat was taught.
 *
 * Exhaustive over `BeatId`, so a thirteenth beat is a type error until somebody decides what
 * finishing it looks like — which is the useful half of the constraint. A beat with no
 * observable consequence is a beat that teaches nothing.
 */
const TAUGHT: Readonly<Record<BeatId, (save: SaveFile) => boolean>> = {
  // Signed for a job. Any of the three states past "looking at the board" will do.
  'welcome-in': (save) =>
    Boolean(save.activity.mission ?? save.activity.pendingMission) ||
    save.activity.missionsCompleted > 0,

  // Waited it out. The contract is at the door, or already behind them.
  'first-mission': (save) =>
    Boolean(save.activity.pendingMission) || save.activity.missionsCompleted > 0,

  // Watched the fight through. A first-mission *loss* leaves them here, which is correct: the
  // beat's spotlight is the returned card, and there will be another contract.
  'first-fight': (save) => save.activity.missionsCompleted > 0,

  /*
   * Cleared the bag.
   *
   * Not "equipped an item" — a first mission drops something only a quarter of the time, and a
   * beat that waits for a drop that may not come is a beat that strands the player. "Nothing
   * loose in your bags" is true either way, immediately when there was no drop and after one
   * click when there was.
   */
  'first-loot': (save) => save.activity.missionsCompleted > 0 && bagCount(save) === 0,

  // Spent gold on a stat. The one number every new player has to be shown how to move.
  'get-stronger': (save) => tallyOf(save.tasks.lifetime, 'goldTrained') > 0,

  // A second contract, chosen freely this time.
  'real-mission': (save) => save.activity.missionsCompleted >= 2,

  'the-armory': (save) => tallyOf(save.tasks.lifetime, 'itemsSold') >= 1,

  // Nothing to do but look. Acknowledged rather than derived — see the module note.
  'notice-board': () => false,

  'proving-grounds': (save) => tallyOf(save.tasks.lifetime, 'arenaWins') >= 1,

  patrol: (save) => tallyOf(save.tasks.lifetime, 'patrolHours') >= 1,

  overnight: () => false,

  // The closing beat: take a rank back from somebody who took one from you.
  'ladder-alive': (save) => tallyOf(save.tasks.lifetime, 'arenaWins') >= 2,
};

/** Whether the save already proves this beat, ignoring acknowledgements. */
export function isTaught(id: BeatId, save: SaveFile): boolean {
  return TAUGHT[id](save);
}

/**
 * Whether a beat is behind the player.
 *
 * A `'read'` beat is done when acknowledged; a `'do'` beat when the save says so. Both are also
 * done for anyone who opted out — that flag does not fast-forward anything, it just answers
 * "shown?" with no.
 */
export function isDone(definition: BeatDef, save: SaveFile): boolean {
  if (save.tutorial.optedOut) return true;
  if (definition.kind === 'read') return save.tutorial.acknowledged.includes(definition.id);
  return isTaught(definition.id, save);
}

/**
 * The beat to show right now, or null.
 *
 * Null when the tutorial is finished, when the player opted out, or when the next beat is behind
 * a level they have not reached — a level-1 hero is not shown the Proving Grounds because the
 * beat before it is unfinished; they are shown nothing, and the beat waits.
 */
export function activeBeat(save: SaveFile): BeatDef | null {
  if (!save.hero || save.tutorial.optedOut) return null;

  for (const definition of BEATS) {
    if (isDone(definition, save)) continue;
    // A beat gated above the hero's level stops the walk rather than being skipped: the
    // curriculum is ordered, and jumping ahead would teach the arena before the paperdoll.
    if (save.hero.level < definition.fromLevel) return null;
    return definition;
  }
  return null;
}

/** Beats behind the player, for the progress read on the settings screen. */
export function beatsDone(save: SaveFile): number {
  return BEATS.filter((definition) => isDone(definition, save)).length;
}

export function tutorialComplete(save: SaveFile): boolean {
  return save.tutorial.optedOut || beatsDone(save) === BEATS.length;
}

export { BEATS };
