/**
 * The Album — every foe in Aldenvale, and the pages they are filed on.
 *
 * A bestiary the player fills by *beating* things. It exists because a game with 96 monsters
 * across ten level-banded zones throws almost all of them away: you outlevel Whispering Woods in
 * a week and never see a Sootback Boar again, and the content you paid for stops paying. The
 * album gives every band a permanent reason to be revisited, and it turns the mission board's
 * zone choice into a decision — until now a contract was picked on duration and payout alone.
 *
 * ## The shape
 *
 * Thirteen pages, 126 entries: one page per zone (the mission roster, nine or ten deep) and one
 * per dungeon (its ten floors). Both are **derived from the content modules** rather than listed
 * again here — `MONSTERS` and `DUNGEONS` are the authority on who exists, and a second list would
 * be a second place for a monster to go missing. Adding a zone or a dungeon adds a page for free.
 *
 * ## Why the reward is gold *and* XP
 *
 * Not symmetry for its own sake, and not a choice: it is the rule the greenhorn's due wrote down
 * (balancing §19, and CLAUDE.md). Gold per *level* is `goldPerVigor × vigorPerLevel`; scale both
 * sides by the same factor and it is unchanged, so a player arrives at every level with the
 * attributes they always would have had. A collection bonus on XP alone would level completionists
 * into monsters they could not afford to fight — which would punish the exact behaviour the
 * feature is trying to reward.
 *
 * ## Beaten, not seen
 *
 * S&F's scrapbook fills on *sight*. This one fills on victory, because a bestiary of things you
 * ran away from is a list rather than a record, and because "beat one of everything in the Woods"
 * is a goal where "load the Woods" is not.
 *
 * ## Why the Long Road's ten bosses are not a fourteenth page
 *
 * They are foes, they are named, and they are the most memorable fights in the game — and they
 * still do not belong here, for the reason at the top of `engine/album/album.ts` read backwards.
 * A boss stands on stage 12, 24, … 120, and `campaign.stagesCleared` is a single contiguous
 * number, so "have I beaten the Ashen Warden" is `stagesCleared >= 12`. The save already answers
 * it. Recording them would put a derivable fact in a stored set, which is the antipattern the
 * album is otherwise the honest exception to.
 *
 * The design reason agrees with the storage one. A zone page makes a level band worth revisiting
 * and a dungeon page makes a delve worth finishing; a road page would only restate progress the
 * player is already making for its own sake, and it would move the capstone behind stage 120 —
 * turning "beaten one of everything" into "finished the entire game", which is a different promise.
 * The road still *fills* the album: its ordinary stages are the chapter zone's roster, so pushing
 * records foes exactly as a contract does.
 *
 * Pure data module — no React, no DOM. Runs in Node.
 */

import { DUNGEONS } from './dungeons';
import { MONSTERS } from './monsters';
import { ZONES } from './zones';
import type { ArchetypeId } from './monsterArchetypes';

/** One foe, on one page. */
export interface AlbumEntry {
  /** The monster or dungeon-floor id, as the rest of the game already calls it. */
  readonly id: string;
  readonly name: string;
  readonly archetypeId: ArchetypeId;
  readonly flavor: string;
  /** Dungeon floors only — bosses are worth marking on the page. */
  readonly boss?: boolean;
}

export type AlbumPageKind = 'zone' | 'dungeon';

export interface AlbumPage {
  /** `zone:whispering-woods`, `dungeon:rat-cellars` — namespaced so the two can never collide. */
  readonly id: string;
  readonly kind: AlbumPageKind;
  readonly name: string;
  /** One line of place, borrowed from the zone or dungeon it belongs to. */
  readonly tagline: string;
  /** Hero level this page's foes live at, for sorting and for "come back later". */
  readonly fromLevel: number;
  readonly entries: readonly AlbumEntry[];
}

/**
 * `[TUNE]` What a finished page is worth (balancing §20).
 *
 * A flat per-page value rather than one scaled by page size: the pages are all eight to ten
 * entries deep, and a player who has to work out which page pays best is doing arithmetic instead
 * of playing. Thirteen pages at 1% plus the capstone is **+18% at full completion** — a real
 * number, earned over months, and small enough at any partial fill that it cannot outrun §0.
 *
 * The capstone is deliberately larger than a page. Finishing the last page means having beaten
 * something in every zone and cleared all thirty dungeon floors, which is a different kind of
 * achievement from finishing the tenth.
 */
export const ALBUM_PAGE_BONUS = 0.01;
export const ALBUM_CAPSTONE_BONUS = 0.05;

function zonePages(): readonly AlbumPage[] {
  return ZONES.map((zone) => ({
    id: `zone:${zone.id}`,
    kind: 'zone' as const,
    name: zone.name,
    tagline: zone.tagline,
    fromLevel: zone.minLevel,
    entries: MONSTERS.filter((foe) => foe.zoneId === zone.id).map((foe) => ({
      id: foe.id,
      name: foe.name,
      archetypeId: foe.archetypeId,
      flavor: foe.flavor,
    })),
  }));
}

function dungeonPages(): readonly AlbumPage[] {
  return DUNGEONS.map((den) => ({
    id: `dungeon:${den.id}`,
    kind: 'dungeon' as const,
    name: den.name,
    tagline: den.tagline,
    fromLevel: den.gateLevel,
    entries: den.floors.map((floor) => ({
      id: floor.id,
      name: floor.name,
      archetypeId: floor.archetypeId,
      flavor: floor.flavor,
      boss: floor.signature !== undefined,
    })),
  }));
}

/**
 * Every page, zones first and then dungeons, each group in level order.
 *
 * Built once at module load — `MONSTERS` and `DUNGEONS` are frozen data, so there is nothing to
 * invalidate and no reason to pay the filter on every render.
 */
export const ALBUM_PAGES: readonly AlbumPage[] = [
  ...[...zonePages()].sort((a, b) => a.fromLevel - b.fromLevel),
  ...[...dungeonPages()].sort((a, b) => a.fromLevel - b.fromLevel),
];

export const ALBUM_PAGES_BY_ID: Readonly<Record<string, AlbumPage>> = Object.fromEntries(
  ALBUM_PAGES.map((page) => [page.id, page]),
);

/** Every foe id the album knows about. The set a save's records are checked against. */
export const ALBUM_FOE_IDS: readonly string[] = ALBUM_PAGES.flatMap((page) =>
  page.entries.map((entry) => entry.id),
);

const FOE_INDEX = new Map<string, { page: AlbumPage; entry: AlbumEntry }>(
  ALBUM_PAGES.flatMap((page) => page.entries.map((entry) => [entry.id, { page, entry }] as const)),
);

/**
 * Where a foe is filed, if the album knows them at all.
 *
 * Undefined is a real answer rather than a bug: an arena opponent is another *hero* and belongs
 * in no bestiary, and the record path calls this to decide whether there is anything to record.
 */
export function albumEntry(
  id: string,
): { readonly page: AlbumPage; readonly entry: AlbumEntry } | undefined {
  return FOE_INDEX.get(id);
}

export function albumPage(id: string): AlbumPage | undefined {
  return ALBUM_PAGES_BY_ID[id];
}
