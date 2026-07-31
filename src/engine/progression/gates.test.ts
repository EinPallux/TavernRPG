import { describe, expect, it } from 'vitest';
import { PLACES, PLACES_BY_ID, type PlaceId } from '@/data/places';
import { gateFor, isUnlocked, nextUnlock, placesUnlockedAt, unlockedPlaces } from './gates';

describe('feature gates', () => {
  it('opens the starting places at level 1', () => {
    expect(isUnlocked('tavern', 1)).toBe(true);
    expect(isUnlocked('character', 1)).toBe(true);
    expect(isUnlocked('settings', 1)).toBe(true);
  });

  it('keeps later places shut until their level', () => {
    expect(isUnlocked('guild', 9)).toBe(false);
    expect(isUnlocked('guild', 10)).toBe(true);
    expect(isUnlocked('undertavern', 10)).toBe(true);
  });

  it('reports how far away a locked place is', () => {
    const gate = gateFor('fortune', 5);
    expect(gate).toEqual({ unlocked: false, gateLevel: 8, levelsRemaining: 3 });

    expect(gateFor('fortune', 8).levelsRemaining).toBe(0);
    expect(gateFor('fortune', 40).unlocked).toBe(true);
  });

  it('grows the unlocked set monotonically with level', () => {
    let previous = 0;
    for (let level = 1; level <= 12; level += 1) {
      const count = unlockedPlaces(level).length;
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
    expect(unlockedPlaces(10)).toHaveLength(PLACES.length);
  });

  it('lists exactly what a given level-up opens', () => {
    expect(
      placesUnlockedAt(4)
        .map((place) => place.id)
        .sort(),
    ).toEqual(['arena', 'hall']);
    expect(placesUnlockedAt(7)).toEqual([]);
  });

  it('points at the next thing to look forward to', () => {
    const atOne = nextUnlock(1);
    expect(atOne?.place.gateLevel).toBe(2);
    expect(atOne?.levelsRemaining).toBe(1);

    // Everything is open by level 10, so there is nothing left to tease.
    expect(nextUnlock(10)).toBeNull();
  });
});

describe('places data integrity', () => {
  it('has unique ids and routes', () => {
    const ids = PLACES.map((place) => place.id);
    const routes = PLACES.map((place) => place.route);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('indexes every place by id', () => {
    for (const place of PLACES) {
      expect(PLACES_BY_ID[place.id as PlaceId]).toBe(place);
    }
  });

  it('gives every place a backdrop, a blurb and a build phase', () => {
    for (const place of PLACES) {
      expect(place.backdrop).toMatch(/^\/assets\/backgrounds\/.+\.webp$/);
      expect(place.blurb.length).toBeGreaterThan(8);
      expect(place.buildPhase).toMatch(/^Phase \d+$/);
      expect(place.constructionBark.length).toBeGreaterThan(8);
    }
  });

  it('uses gate levels that match the tutorial curriculum', () => {
    // docs/design/systems/tutorial-and-onboarding.md §3 — the drip that paces the first days.
    expect(PLACES_BY_ID.armory.gateLevel).toBe(2);
    expect(PLACES_BY_ID.board.gateLevel).toBe(3);
    expect(PLACES_BY_ID.patrol.gateLevel).toBe(3);
    expect(PLACES_BY_ID.arena.gateLevel).toBe(4);
    expect(PLACES_BY_ID.stables.gateLevel).toBe(5);
    expect(PLACES_BY_ID.forge.gateLevel).toBe(6);
    expect(PLACES_BY_ID.fortune.gateLevel).toBe(8);
    expect(PLACES_BY_ID.menagerie.gateLevel).toBe(8);
    expect(PLACES_BY_ID.guild.gateLevel).toBe(10);
    expect(PLACES_BY_ID.undertavern.gateLevel).toBe(10);
  });

  it('routes match their id-derived path', () => {
    for (const place of PLACES) {
      expect(place.route).toBe(`/${place.id}`);
    }
  });
});
