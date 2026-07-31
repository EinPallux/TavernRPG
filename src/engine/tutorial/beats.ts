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

/**
 * The fact in the save that proves each beat was taught.
 *
 * Exhaustive over `BeatId`, so a thirteenth beat is a type error until somebody decides what
 * finishing it looks like — which is the useful half of the constraint. A beat with no
 * observable consequence is a beat that teaches nothing.
 *
 * **Every predicate here must be monotone**: once true for a save, true for every save that
 * follows it. This is not tidiness, it is the one thing a derived cursor can get wrong. The walk
 * below returns the *first* unfinished beat, so a predicate that can go back to false drags the
 * whole tour backwards — and the failure is not theoretical. The first draft asked "are your bags
 * empty?" for beat 4, which is false again the moment a second contract drops something. Beat 7
 * is *"sell Bram what you are not wearing"*, which requires holding loot, so beat 4 would have
 * reactivated every time the player did what beat 7 asked and the tour could never have reached
 * it. `beats.test.ts` replays a whole playthrough and asserts the count never falls.
 *
 * The practical rule: read lifetime counters and acknowledgements, never present state.
 */
const TAUGHT: Readonly<Record<BeatId, (save: SaveFile) => boolean>> = {
  // Signed for a job. The *attempt*, not the win — a first contract that loses still taught this,
  // and `missionsCompleted` counts victories only.
  'welcome-in': (save) => tallyOf(save.tasks.lifetime, 'missionsAccepted') > 0,

  // Waited it out: the contract came home. Its own counter rather than "no mission running",
  // because the second contract would make that false again and send the tour back to here.
  'first-mission': (save) => tallyOf(save.tasks.lifetime, 'missionsReturned') > 0,

  // Watched the fight through. A first-mission *loss* leaves them here, which is correct: the
  // beat's spotlight is the returned card, and there will be another contract. Two contracts
  // home without a win is the give-up line — by then they have watched two fights.
  'first-fight': (save) =>
    save.activity.missionsCompleted > 0 || tallyOf(save.tasks.lifetime, 'missionsReturned') >= 2,

  /*
   * Put something on.
   *
   * Or ran out of things for the beat to teach: a mission drops gear only about a quarter of the
   * time, so waiting for a drop that may not come would strand the player on the paperdoll with
   * an empty bag. Two contracts in is the give-up line — by then they have seen the loop, and
   * the Armory beat is about to make the same point with Bram's money behind it.
   */
  'first-loot': (save) =>
    tallyOf(save.tasks.lifetime, 'itemsEquipped') > 0 || save.activity.missionsCompleted >= 2,

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
