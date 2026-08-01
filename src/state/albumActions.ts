/**
 * The Album, from the player's side (album spec §3).
 *
 * One function. Every fight that can put a foe in the book goes through `recordVictory`, for the
 * same reason `progressActions.ts#credit` is the only way an action becomes a number: the
 * alternative is three call sites that each remember to do it, and the failure mode is silent —
 * a page that can never be finished because one of the three forgot.
 *
 * Phase 15 found `itemsScrapped` and `levelsGained` had *never* been credited from the player's
 * side despite being bounty metrics, which is exactly this bug with a different name. So:
 * missions, delves and the Long Road all call this, and `album.test.ts` reads the source to check
 * that nothing else writes `album.foes`.
 */

import { recordFoe, type AlbumRecord } from '@/engine/album/album';
import type { SaveFile } from '@/engine/save/schema';

export interface AlbumOutcome {
  readonly save: SaveFile;
  /** What to say on the result screen, if anything. Null on a foe already in the book. */
  readonly record: AlbumRecord;
}

/**
 * Write a defeated foe into the book.
 *
 * Takes and returns the whole save rather than the slice, so a caller cannot forget to put the
 * result back — the same shape `spendVigor` settled on for the day's work, and for the same
 * reason: a function that returns a fragment invites somebody to drop it.
 *
 * Idempotent all the way down. The hundredth Sootback Boar returns the identical `foes` array,
 * so the caller's spread is a no-op and the autosave has nothing new to write.
 */
export function recordVictory(save: SaveFile, foeId: string): AlbumOutcome {
  const record = recordFoe(save.album.foes, foeId);
  if (!record.added) return { save, record };
  return { save: { ...save, album: { ...save.album, foes: [...record.foes] } }, record };
}
