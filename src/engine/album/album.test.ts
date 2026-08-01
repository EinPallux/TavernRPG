/**
 * The album engine (album spec §2).
 *
 * Three functions, and the tests that matter are all about the *second* time something happens:
 * the same monster beaten twice, a page finished and then fought on, a bonus read after nothing
 * changed. Idempotence is the whole contract — a day-keyed roll taught this codebase four times
 * over that "correct on the first call" is not the same claim.
 */

import { describe, expect, it } from 'vitest';
import { ALBUM_CAPSTONE_BONUS, ALBUM_FOE_IDS, ALBUM_PAGES, ALBUM_PAGE_BONUS } from '@/data/album';
import { albumBonus, albumBonusCeiling, albumProgress, recordFoe } from './album';

const firstPage = ALBUM_PAGES[0]!;
const firstFoe = firstPage.entries[0]!;
const wholePage = firstPage.entries.map((entry) => entry.id);

describe('recording a foe', () => {
  it('writes a new one into the book', () => {
    const record = recordFoe([], firstFoe.id);

    expect(record.foes).toEqual([firstFoe.id]);
    expect(record.added).toEqual({ id: firstFoe.id, name: firstFoe.name, page: firstPage.name });
    expect(record.pageCompleted).toBeNull();
  });

  it('is silent the second time, and every time after', () => {
    /*
     * The same monster is beaten dozens of times. If `added` survived past the first, the result
     * screen would announce a discovery on every kill — and a page-completion flourish would be
     * a party that never ends.
     */
    const once = recordFoe([], firstFoe.id);
    const twice = recordFoe(once.foes, firstFoe.id);
    const thrice = recordFoe(twice.foes, firstFoe.id);

    expect(twice.added).toBeNull();
    expect(thrice.added).toBeNull();
    // Referentially identical, so the caller's spread is a no-op and the autosave has no work.
    expect(twice.foes).toBe(once.foes);
    expect(thrice.foes).toBe(twice.foes);
  });

  it('shrugs at a foe it has never heard of', () => {
    // An arena opponent is another hero; a monster added after this save was written is a
    // stranger. Both are fine, and neither may grow the stored set.
    const record = recordFoe([firstFoe.id], 'some-rival-hero');
    expect(record.added).toBeNull();
    expect(record.foes).toEqual([firstFoe.id]);
  });

  it('reports the page completing exactly once', () => {
    let foes: readonly string[] = [];
    const completions: string[] = [];

    for (const id of wholePage) {
      const record = recordFoe(foes, id);
      foes = record.foes;
      if (record.pageCompleted) completions.push(record.pageCompleted.id);
    }
    expect(completions).toEqual([firstPage.id]);

    // Fighting on the finished page says nothing more.
    for (const id of wholePage) {
      expect(recordFoe(foes, id).pageCompleted).toBeNull();
    }
  });

  it('credits the completion to the record that finished it, in any order', () => {
    const reversed = [...wholePage].reverse();
    let foes: readonly string[] = [];
    let finishedOn: string | null = null;

    for (const id of reversed) {
      const record = recordFoe(foes, id);
      foes = record.foes;
      if (record.pageCompleted) finishedOn = id;
    }
    expect(finishedOn).toBe(reversed[reversed.length - 1]);
  });
});

describe('reading the book', () => {
  it('counts an empty one honestly', () => {
    const progress = albumProgress([]);

    expect(progress.recorded).toBe(0);
    expect(progress.total).toBe(ALBUM_FOE_IDS.length);
    expect(progress.pagesComplete).toBe(0);
    expect(progress.complete).toBe(false);
    expect(progress.pages).toHaveLength(ALBUM_PAGES.length);
    expect(progress.pages.every((page) => page.recorded === 0)).toBe(true);
  });

  it('counts a part-filled page against its own entries', () => {
    const half = wholePage.slice(0, 3);
    const progress = albumProgress(half);
    const page = progress.pages.find((entry) => entry.page.id === firstPage.id)!;

    expect(page.recorded).toBe(3);
    expect(page.total).toBe(firstPage.entries.length);
    expect(page.complete).toBe(false);
    expect(progress.recorded).toBe(3);
  });

  it('ignores an id no page claims', () => {
    /*
     * Counted against the pages rather than `foes.length`, so a monster removed from the content
     * modules leaves an orphan id that cannot inflate the total into "127/126".
     */
    const progress = albumProgress([...wholePage, 'a-monster-we-deleted']);
    expect(progress.recorded).toBe(wholePage.length);
    expect(progress.total).toBe(ALBUM_FOE_IDS.length);
  });

  it('calls a full book full', () => {
    const progress = albumProgress(ALBUM_FOE_IDS);

    expect(progress.recorded).toBe(progress.total);
    expect(progress.pagesComplete).toBe(ALBUM_PAGES.length);
    expect(progress.complete).toBe(true);
  });
});

describe('what the book pays', () => {
  it('pays nothing for an empty one', () => {
    expect(albumBonus([])).toEqual({ gold: 1, xp: 1 });
  });

  it('pays nothing for a page that is nearly done', () => {
    // The reward is for *finishing*, and a bonus that crept up per entry would make the last
    // monster on a page worth no more than the first.
    expect(albumBonus(wholePage.slice(0, -1))).toEqual({ gold: 1, xp: 1 });
  });

  it('pays one page’s worth for one page', () => {
    const factor = 1 + ALBUM_PAGE_BONUS;
    expect(albumBonus(wholePage)).toEqual({ gold: factor, xp: factor });
  });

  it('pays gold and experience by the same factor, always', () => {
    /*
     * Not symmetry for its own sake (balancing §19, §20). Gold per *level* is
     * `goldPerVigor × vigorPerLevel`; scaling both leaves it invariant, so a completionist
     * arrives at every level with the attributes they always would have had. On XP alone the
     * album would level its most engaged players into monsters they could not afford.
     */
    let foes: readonly string[] = [];
    for (const page of ALBUM_PAGES) {
      foes = [...foes, ...page.entries.map((entry) => entry.id)];
      const bonus = albumBonus(foes);
      expect(bonus.gold, page.id).toBe(bonus.xp);
    }
  });

  it('adds the capstone only on the last page', () => {
    const allButOne = ALBUM_PAGES.slice(0, -1).flatMap((page) =>
      page.entries.map((entry) => entry.id),
    );

    const nearly = albumBonus(allButOne).gold;
    expect(nearly).toBeCloseTo(1 + (ALBUM_PAGES.length - 1) * ALBUM_PAGE_BONUS, 10);

    const full = albumBonus(ALBUM_FOE_IDS).gold;
    expect(full).toBeCloseTo(albumBonusCeiling(), 10);
    // The last page is worth a page *and* the capstone — the jump is bigger than any before it.
    expect(full - nearly).toBeCloseTo(ALBUM_PAGE_BONUS + ALBUM_CAPSTONE_BONUS, 10);
  });

  it('never goes backwards as the book fills', () => {
    let foes: readonly string[] = [];
    let previous = 1;
    for (const id of ALBUM_FOE_IDS) {
      foes = recordFoe(foes, id).foes;
      const factor = albumBonus(foes).gold;
      expect(factor).toBeGreaterThanOrEqual(previous);
      previous = factor;
    }
    expect(previous).toBeCloseTo(albumBonusCeiling(), 10);
  });
});
