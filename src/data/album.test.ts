/**
 * The album's census (album spec §2).
 *
 * The album is *derived* from `MONSTERS` and `DUNGEONS`, so most of what could go wrong here is
 * arithmetic that quietly loses somebody: a monster in a zone with no page, a floor filed twice,
 * a page that sorts into the wrong band. None of that shows up in play until a player is at 125
 * of 126 with nothing left to fight.
 *
 * So these count rather than list. A test that hard-codes 126 is a test that gets updated by
 * whoever breaks it; a test that says "every monster is on exactly one page" cannot be.
 */

import { describe, expect, it } from 'vitest';
import {
  ALBUM_CAPSTONE_BONUS,
  ALBUM_FOE_IDS,
  ALBUM_PAGES,
  ALBUM_PAGES_BY_ID,
  ALBUM_PAGE_BONUS,
  albumEntry,
  albumPage,
} from './album';
import { CHAPTERS } from './campaign';
import { DUNGEONS } from './dungeons';
import { MONSTERS } from './monsters';
import { ZONES } from './zones';
import { ARCHETYPES_BY_ID } from './monsterArchetypes';

describe('the album covers the game and nothing else', () => {
  it('gives every zone and every dungeon exactly one page', () => {
    expect(ALBUM_PAGES).toHaveLength(ZONES.length + DUNGEONS.length);
    expect(ALBUM_PAGES.filter((page) => page.kind === 'zone')).toHaveLength(ZONES.length);
    expect(ALBUM_PAGES.filter((page) => page.kind === 'dungeon')).toHaveLength(DUNGEONS.length);

    // Namespaced ids, so a zone and a dungeon sharing a slug can never collide.
    expect(new Set(ALBUM_PAGES.map((page) => page.id)).size).toBe(ALBUM_PAGES.length);
    for (const page of ALBUM_PAGES) expect(albumPage(page.id)).toBe(page);
    expect(Object.keys(ALBUM_PAGES_BY_ID)).toHaveLength(ALBUM_PAGES.length);
  });

  it('files every monster and every dungeon floor exactly once', () => {
    const expected = [
      ...MONSTERS.map((foe) => foe.id),
      ...DUNGEONS.flatMap((den) => den.floors.map((floor) => floor.id)),
    ];

    expect(ALBUM_FOE_IDS).toHaveLength(expected.length);
    expect([...ALBUM_FOE_IDS].sort()).toEqual([...expected].sort());
    expect(new Set(ALBUM_FOE_IDS).size).toBe(ALBUM_FOE_IDS.length);
  });

  it('finds every foe it lists, and nobody it does not', () => {
    for (const id of ALBUM_FOE_IDS) {
      const found = albumEntry(id);
      expect(found, id).toBeDefined();
      expect(found!.page.entries).toContain(found!.entry);
    }

    // An arena opponent is another hero and belongs in no bestiary; the record path relies on
    // this answering `undefined` rather than throwing.
    expect(albumEntry('player')).toBeUndefined();
    expect(albumEntry('bot-412')).toBeUndefined();
    expect(albumEntry('')).toBeUndefined();
  });

  it('leaves the Long Road’s bosses out, because the save already answers them', () => {
    /*
     * The decision recorded at the top of `album.ts`, asserted against the real roster rather
     * than a remembered list. `campaign.stagesCleared` is one contiguous number, so "have I
     * beaten the chapter-three boss" is arithmetic — filing them would put a derivable fact in a
     * stored set, which is the antipattern the album is otherwise the honest exception to.
     */
    expect(CHAPTERS.length).toBeGreaterThan(0);
    for (const chapter of CHAPTERS) {
      expect(albumEntry(chapter.boss.id), chapter.boss.id).toBeUndefined();
    }
  });

  it('carries a real entry for every foe — name, archetype and flavour', () => {
    for (const page of ALBUM_PAGES) {
      expect(page.entries.length, page.id).toBeGreaterThan(0);
      expect(page.name.length, page.id).toBeGreaterThan(0);
      expect(page.tagline.length, page.id).toBeGreaterThan(0);

      for (const entry of page.entries) {
        expect(entry.name.length, entry.id).toBeGreaterThan(0);
        expect(entry.flavor.length, entry.id).toBeGreaterThan(0);
        // The screen tints by archetype, so an unknown one would render an untinted hole.
        expect(ARCHETYPES_BY_ID[entry.archetypeId], entry.id).toBeDefined();
      }
    }
  });

  it('sorts each group by the level it is met at', () => {
    // Zones first, then dungeons, each rising — so the page list reads as a route through the
    // game rather than as whatever order the content modules happen to be written in.
    const zones = ALBUM_PAGES.filter((page) => page.kind === 'zone').map((page) => page.fromLevel);
    const dens = ALBUM_PAGES.filter((page) => page.kind === 'dungeon').map(
      (page) => page.fromLevel,
    );

    expect(zones).toEqual([...zones].sort((a, b) => a - b));
    expect(dens).toEqual([...dens].sort((a, b) => a - b));
    expect(ALBUM_PAGES.slice(0, zones.length).every((page) => page.kind === 'zone')).toBe(true);
  });

  it('marks the dungeon bosses and nothing in a zone', () => {
    const bossEntries = ALBUM_PAGES.flatMap((page) =>
      page.entries.filter((entry) => entry.boss).map((entry) => ({ page, entry })),
    );
    expect(bossEntries.length).toBeGreaterThan(0);
    for (const { page } of bossEntries) expect(page.kind).toBe('dungeon');
  });

  it('prices a finished book at a number worth finishing and small enough to be safe', () => {
    /*
     * Two-sided on purpose (balancing §20). Too small and months of collecting buys nothing; too
     * large and a completionist outruns §0's schedule. The band is the check — the exact ceiling
     * is asserted against the constants so a retune moves one number, not three tests.
     */
    const ceiling = ALBUM_PAGES.length * ALBUM_PAGE_BONUS + ALBUM_CAPSTONE_BONUS;
    expect(ceiling).toBeGreaterThanOrEqual(0.1);
    expect(ceiling).toBeLessThanOrEqual(0.25);
    // The capstone outweighs any single page: finishing the last one is a different achievement.
    expect(ALBUM_CAPSTONE_BONUS).toBeGreaterThan(ALBUM_PAGE_BONUS);
  });
});
