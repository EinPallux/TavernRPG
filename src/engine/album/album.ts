/**
 * The Album — recording a foe, reading the progress, paying the bonus (album spec §2).
 *
 * Three small pure functions over one stored set of ids. The interesting decisions are all about
 * *what is stored*, and there are only two:
 *
 * ## Why this is stored at all
 *
 * Almost everything in this codebase is derived — pet ownership from the save's own history, the
 * gacha rotation from the calendar, the tutorial's position from what the save can prove. The
 * rule in CLAUDE.md is "don't store what the save can already answer", and the album is the rare
 * case that fails it honestly: `PROGRESS_METRICS` counts **actions** (contracts won, items
 * scrapped, levels gained) and `activity.zoneMissions` counts attempts *per zone*. Neither can
 * answer "have I ever beaten a Sootback Boar", and no arrangement of counters can — the identity
 * is not in them. Same argument the pets doc makes for `pets.eggs` and `gacha.pets`: for a fact
 * that is not implied by anything else, the fact is the thing to write down.
 *
 * ## Why it is a set of ids and not a tally
 *
 * A count of kills per monster would be a bigger save, a bigger migration and a harder question
 * ("does the album show 47 boars?"). The album asks one thing of each foe — beaten, or not — so
 * it stores one bit, spelled as membership.
 *
 * Pure module — no React, no DOM, no clock. Runs in Node.
 */

import {
  ALBUM_CAPSTONE_BONUS,
  ALBUM_FOE_IDS,
  ALBUM_PAGES,
  ALBUM_PAGE_BONUS,
  albumEntry,
  type AlbumPage,
} from '@/data/album';
import type { PayoutBonus } from '@/engine/progression/rewards';

/** What one page looks like to a player who has filled some of it. */
export interface AlbumPageProgress {
  readonly page: AlbumPage;
  readonly recorded: number;
  readonly total: number;
  readonly complete: boolean;
}

export interface AlbumProgress {
  readonly pages: readonly AlbumPageProgress[];
  readonly recorded: number;
  readonly total: number;
  readonly pagesComplete: number;
  /** Every page done — the capstone is paid on this and nothing else. */
  readonly complete: boolean;
}

/**
 * What recording a foe did, if anything.
 *
 * Returned rather than applied so the caller owns the save, and shaped as an outcome rather than
 * a boolean because the *page* completing is the moment worth a flourish and the caller cannot
 * work it out afterwards — by then the page is already full and looks the same as it would on the
 * next kill.
 */
export interface AlbumRecord {
  /** The set to store. Referentially identical to the input when nothing was new. */
  readonly foes: readonly string[];
  /** Newly recorded this time — null when the foe was already in the book, or is not in it. */
  readonly added: { readonly id: string; readonly name: string; readonly page: string } | null;
  /** Set when that record was the one that finished a page. */
  readonly pageCompleted: AlbumPage | null;
}

/**
 * Record a defeated foe.
 *
 * Idempotent by construction — it is a set — which matters more than it looks: the same monster
 * is beaten dozens of times, a replayed arena log re-walks old fights, and a page-completion
 * flourish that fired on every subsequent kill would be a party that never ends. The `added`
 * field is null on every call after the first, so the ceremony is too.
 */
export function recordFoe(foes: readonly string[], id: string): AlbumRecord {
  const found = albumEntry(id);
  // Not everything you beat is in the book: an arena opponent is another hero, and a mission
  // against a monster added after this save was written is a stranger. Both are fine.
  if (!found) return { foes, added: null, pageCompleted: null };
  if (foes.includes(id)) return { foes, added: null, pageCompleted: null };

  const next = [...foes, id];
  const page = found.page;
  const filled = page.entries.every((entry) => next.includes(entry.id));

  return {
    foes: next,
    added: { id, name: found.entry.name, page: page.name },
    pageCompleted: filled ? page : null,
  };
}

/** How full the book is, page by page. */
export function albumProgress(foes: readonly string[]): AlbumProgress {
  const kept = new Set(foes);

  const pages = ALBUM_PAGES.map((page) => {
    const recorded = page.entries.reduce((sum, entry) => sum + (kept.has(entry.id) ? 1 : 0), 0);
    return {
      page,
      recorded,
      total: page.entries.length,
      complete: recorded === page.entries.length,
    };
  });

  const pagesComplete = pages.filter((entry) => entry.complete).length;

  return {
    pages,
    // Counted against the pages rather than `foes.length`, so an id left behind by a removed
    // monster cannot inflate the total — the same reason the icon census counts rather than lists.
    recorded: pages.reduce((sum, entry) => sum + entry.recorded, 0),
    total: ALBUM_FOE_IDS.length,
    pagesComplete,
    complete: pagesComplete === ALBUM_PAGES.length,
  };
}

/**
 * What the book is paying, as a `PayoutBonus`.
 *
 * **Gold and XP by the same factor**, and that is the safety argument rather than a stylistic
 * choice (balancing §19, §20). Gold per *level* is `goldPerVigor × vigorPerLevel`; scaling both
 * leaves it invariant, so a completionist reaches every level with the attributes they always
 * would have had and only the clock moves. On XP alone the album would level its most engaged
 * players into monsters they could not afford — punishing the exact behaviour it rewards.
 */
export function albumBonus(foes: readonly string[]): PayoutBonus {
  const progress = albumProgress(foes);
  const factor =
    1 + progress.pagesComplete * ALBUM_PAGE_BONUS + (progress.complete ? ALBUM_CAPSTONE_BONUS : 0);
  return { gold: factor, xp: factor };
}

/** The bonus a finished book pays, for the screen's "what this is worth" line. */
export function albumBonusCeiling(): number {
  return 1 + ALBUM_PAGES.length * ALBUM_PAGE_BONUS + ALBUM_CAPSTONE_BONUS;
}
