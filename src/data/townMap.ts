/**
 * Emberhollow from above — where every building sits on the painted map.
 *
 * The town map is a single painting with fourteen buildings on it, each carrying a nameplate the
 * artist put there — plus the road out through the gate, which is the fifteenth hotspot and the
 * only one that is not a roof. This module is the only place that says *where* they are, as
 * percentages of the painting rather than pixels, so the map can be drawn at any size and the
 * doors stay on the doors.
 *
 * **Percentages, and the box they are percentages of.** The art is 16:9 and the stage almost never
 * is, so `TownMapScreen` sizes a 16:9 box that fits inside the stage and puts the painting and the
 * hotspots in the *same* box. Percentages of the room would drift; percentages of the painting
 * cannot. If the art is ever re-cropped, these numbers move with it — which is why
 * `TOWN_MAP_ART` carries the dimensions the rectangles were measured against.
 *
 * **Reading order, not rail order.** The list runs top-to-bottom then left-to-right, because tab
 * order should follow the eye across a picture. A keyboard player tabbing through the map walks
 * the town the way they see it, not the way the nav rail happens to be sorted.
 *
 * Pure data module — no React. `townMap.test.ts` asserts every non-chrome place has exactly one
 * building, that no two overlap, and that all of them are big enough to hit.
 */

import { PLACES, type PlaceId } from './places';

/** The painting these rectangles were measured against (`game_assets/UI/Backgrounds`). */
export const TOWN_MAP_ART = {
  src: '/assets/backgrounds/town_map_background.webp',
  width: 2560,
  height: 1440,
} as const;

/**
 * A clickable building.
 *
 * `rect` is `[left, top, right, bottom]` in percent of the painting. Rectangles rather than
 * polygons on purpose: the buildings are roughly rectangular, a rectangle is a `<button>` with
 * four inline styles, and a polygon would need `clip-path` hit-testing that keyboard focus rings
 * cannot follow anyway.
 */
export interface MapHotspot {
  readonly place: PlaceId;
  readonly rect: readonly [left: number, top: number, right: number, bottom: number];
  /**
   * The words painted on the signpost, when they differ from the room's name.
   *
   * The map calls the Gilded Facet a magic shop and the Undertavern a dungeon entrance. The
   * plaque shows the room's real name — but the *label under the cursor* has to match what the
   * player is looking at, or they will not believe they clicked the right thing.
   */
  readonly signpost?: string;
  /** Which side of the building the plaque opens on, so it never leaves the painting. */
  readonly plaque: 'above' | 'below';
}

export const TOWN_HOTSPOTS: readonly MapHotspot[] = [
  { place: 'arena', rect: [43, 6, 58.5, 24], plaque: 'below' },
  { place: 'menagerie', rect: [29, 15.5, 38, 25.5], plaque: 'below' },
  { place: 'stables', rect: [61, 18, 73, 30], plaque: 'below' },
  { place: 'forge', rect: [40.5, 26, 49.5, 41], signpost: 'Forge', plaque: 'below' },
  { place: 'armory', rect: [49.5, 28, 58, 43], plaque: 'below' },
  { place: 'tavern', rect: [23, 29.5, 35, 44], signpost: 'Tavern', plaque: 'below' },
  { place: 'hall', rect: [70.5, 30, 80.5, 47], plaque: 'below' },
  { place: 'facet', rect: [58.5, 30.5, 68, 45], signpost: 'Magic Shop', plaque: 'below' },
  { place: 'fortune', rect: [33.5, 46, 43, 59], signpost: 'Fortune Teller', plaque: 'above' },
  { place: 'guild', rect: [58.5, 47.5, 76, 62], plaque: 'above' },
  { place: 'character', rect: [18.5, 49, 27.5, 61.5], signpost: 'Your Home', plaque: 'above' },
  { place: 'board', rect: [32.5, 64, 39.5, 73], plaque: 'above' },
  { place: 'undertavern', rect: [73.5, 65, 86, 79], signpost: 'Dungeon Entrance', plaque: 'above' },
  { place: 'patrol', rect: [43, 69, 58, 88], plaque: 'above' },
  /*
   * The one hotspot that is not a building: the road running out through the gate, at the very
   * bottom of the painting. The Long Road is the only place in the game that is *not in the town*,
   * so it gets the strip of road leading out of it rather than a roof.
   */
  { place: 'campaign', rect: [42, 88.5, 59, 99], signpost: 'The road out', plaque: 'above' },
] as const;

/** Places that are rooms on the map rather than interface furniture (the map itself, Settings). */
export const MAPPED_PLACES = PLACES.filter((place) => place.group !== 'system');

export function hotspotFor(place: PlaceId): MapHotspot | undefined {
  return TOWN_HOTSPOTS.find((spot) => spot.place === place);
}

/** CSS box for a hotspot, in percentages of the painting. */
export function hotspotBox(spot: MapHotspot): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const [left, top, right, bottom] = spot.rect;
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${right - left}%`,
    height: `${bottom - top}%`,
  };
}
