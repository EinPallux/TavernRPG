/**
 * Feature gates — which places are open at which hero level.
 *
 * One source of truth for the nav rail, the router and (later) the daily-task pool, so a
 * gate can never disagree with itself. Gates are curriculum, not restriction: they introduce
 * one system at a time over the first days (docs/design/systems/tutorial-and-onboarding.md §3).
 *
 * Pure module — no React, no DOM.
 */

import { PLACES, PLACES_BY_ID, type PlaceDef, type PlaceId } from '@/data/places';

export interface GateState {
  readonly unlocked: boolean;
  readonly gateLevel: number;
  /** Levels still to go; 0 when unlocked. */
  readonly levelsRemaining: number;
}

export function gateFor(placeId: PlaceId, level: number): GateState {
  const gateLevel = PLACES_BY_ID[placeId].gateLevel;
  const unlocked = level >= gateLevel;
  return {
    unlocked,
    gateLevel,
    levelsRemaining: unlocked ? 0 : gateLevel - level,
  };
}

export function isUnlocked(placeId: PlaceId, level: number): boolean {
  return level >= PLACES_BY_ID[placeId].gateLevel;
}

export function unlockedPlaces(level: number): PlaceDef[] {
  return PLACES.filter((place) => level >= place.gateLevel);
}

/**
 * Places that open exactly at this level — the unlock toast on level-up reads from here.
 */
export function placesUnlockedAt(level: number): PlaceDef[] {
  return PLACES.filter((place) => place.gateLevel === level);
}

/** The next locked place and how far away it is, for the "coming up" hint in the rail. */
export function nextUnlock(level: number): { place: PlaceDef; levelsRemaining: number } | null {
  const upcoming = PLACES.filter((place) => place.gateLevel > level).sort(
    (a, b) => a.gateLevel - b.gateLevel,
  );
  const next = upcoming[0];
  return next ? { place: next, levelsRemaining: next.gateLevel - level } : null;
}
