import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLACES, PLACES_BY_ID } from './places';
import { MAPPED_PLACES, TOWN_HOTSPOTS, TOWN_MAP_ART, hotspotBox, hotspotFor } from './townMap';

/**
 * The map is a painting with coordinates typed on top of it, and every failure mode is silent:
 * a door on the wrong building, a room with no door at all, two rectangles fighting over the same
 * click. None of that throws, none of it shows up in a screenshot the author has stopped looking
 * at, and all of it is arithmetic — so it is asserted here rather than eyeballed.
 */

describe('the town map', () => {
  it('points at art that is actually on disk, at the ratio the frame assumes', () => {
    expect(existsSync(`public${TOWN_MAP_ART.src}`)).toBe(true);
    // `.town-map-frame` hard-codes 16/9. If the art is ever re-cropped, that CSS moves too.
    expect(TOWN_MAP_ART.width / TOWN_MAP_ART.height).toBeCloseTo(16 / 9, 5);
  });

  it('gives every room a building, and every building a room', () => {
    /*
     * The census that matters. A place added to `PLACES` without a hotspot is a room reachable
     * only from the rail — which is exactly the situation the map exists to end, and exactly the
     * kind of omission nobody notices, because the map still looks complete.
     */
    for (const place of MAPPED_PLACES) {
      expect(hotspotFor(place.id), `${place.name} has no building on the map`).toBeDefined();
    }
    expect(TOWN_HOTSPOTS).toHaveLength(MAPPED_PLACES.length);

    const ids = TOWN_HOTSPOTS.map((spot) => spot.place);
    expect(new Set(ids).size, 'two buildings claim the same room').toBe(ids.length);
  });

  it('leaves interface furniture off the map', () => {
    // Settings and the map itself are not buildings; they are how you look at buildings.
    expect(hotspotFor('settings')).toBeUndefined();
    expect(hotspotFor('map')).toBeUndefined();
    expect(MAPPED_PLACES.length).toBe(PLACES.length - 2);
  });

  it('keeps every rectangle inside the painting and the right way round', () => {
    for (const spot of TOWN_HOTSPOTS) {
      const [left, top, right, bottom] = spot.rect;
      const name = PLACES_BY_ID[spot.place].name;

      expect(left, name).toBeGreaterThanOrEqual(0);
      expect(top, name).toBeGreaterThanOrEqual(0);
      expect(right, name).toBeLessThanOrEqual(100);
      expect(bottom, name).toBeLessThanOrEqual(100);
      expect(right, `${name} is inside out`).toBeGreaterThan(left);
      expect(bottom, `${name} is inside out`).toBeGreaterThan(top);
    }
  });

  it('makes every building big enough to hit', () => {
    /*
     * At 1366×768 — the smallest window the game claims to work in — the stage is about 1126px
     * wide, so a 5%-wide hotspot is 56px. Below that the plaque is harder to open than the rail
     * entry it replaces, which would make the map a worse way to navigate than the list.
     */
    for (const spot of TOWN_HOTSPOTS) {
      const [left, top, right, bottom] = spot.rect;
      expect(
        right - left,
        `${PLACES_BY_ID[spot.place].name} is too narrow to click`,
      ).toBeGreaterThanOrEqual(5);
      expect(
        bottom - top,
        `${PLACES_BY_ID[spot.place].name} is too short to click`,
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it('never lets two buildings overlap', () => {
    // An overlap is one building stealing the other's clicks, and which one wins is DOM order —
    // i.e. invisible, and different depending on which rectangle somebody edited last.
    for (let i = 0; i < TOWN_HOTSPOTS.length; i += 1) {
      for (let j = i + 1; j < TOWN_HOTSPOTS.length; j += 1) {
        const a = TOWN_HOTSPOTS[i]!;
        const b = TOWN_HOTSPOTS[j]!;
        const overlaps =
          a.rect[0] < b.rect[2] &&
          b.rect[0] < a.rect[2] &&
          a.rect[1] < b.rect[3] &&
          b.rect[1] < a.rect[3];
        expect(overlaps, `${a.place} and ${b.place} overlap`).toBe(false);
      }
    }
  });

  it('runs in reading order, because tab order follows the eye', () => {
    // Top to bottom, ties broken left to right. A keyboard player walks the picture, not the
    // order somebody happened to type the rows in.
    for (let i = 1; i < TOWN_HOTSPOTS.length; i += 1) {
      const previous = TOWN_HOTSPOTS[i - 1]!;
      const current = TOWN_HOTSPOTS[i]!;
      const ordered =
        current.rect[1] > previous.rect[1] ||
        (current.rect[1] === previous.rect[1] && current.rect[0] >= previous.rect[0]);
      expect(ordered, `${current.place} comes before ${previous.place} on screen`).toBe(true);
    }
  });

  it('renders a rectangle as a CSS box in percentages', () => {
    const box = hotspotBox({ place: 'tavern', rect: [10, 20, 30, 50], plaque: 'below' });
    expect(box).toEqual({ left: '10%', top: '20%', width: '20%', height: '30%' });
  });

  it('only renames a building when the painted signpost disagrees with the room', () => {
    // The signpost is what the player is looking at; a signpost that just repeats the room name
    // is a second copy of a string, and the two will drift.
    for (const spot of TOWN_HOTSPOTS) {
      if (spot.signpost === undefined) continue;
      expect(spot.signpost).not.toBe(PLACES_BY_ID[spot.place].name);
    }
  });
});
