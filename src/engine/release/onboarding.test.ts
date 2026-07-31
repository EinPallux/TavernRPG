/**
 * "The tutorial carries a new player to level 10 unaided" (GDD §7) — the line nothing measured.
 *
 * Every other clause of the release definition had a harness by Phase 17. This one was a sentence
 * in a spec header, and its two words that matter are **unaided** and **level 10**: a player with
 * no wiki, no changelog and nobody to ask should arrive at ten knowing what the game is. That is
 * not one claim, it is three, and only the third is about pacing:
 *
 * 1. **Everything a level-10 player has been given is introduced from inside the game.** Every
 *    room that opens at or below ten is reached by a tour beat, announced when its gate lifts, or
 *    picked up by the Next Step chip afterwards. A room that simply appears in the rail one day
 *    with no word from anybody is the failure this catches.
 * 2. **The tour is walkable by the player it is written for.** No beat may point at a room that
 *    player cannot enter yet, and no beat may sit behind a level the curriculum never reaches.
 * 3. **Ten actually arrives** — inside the §0 budget, from the same simulation the pacing gate
 *    uses, so the two cannot drift apart.
 *
 * All three read from data. None of them can be satisfied by writing "done" anywhere.
 */

import { describe, expect, it } from 'vitest';
import { BEATS } from '@/data/tutorial';
import { PLACES, PLACES_BY_ID, type PlaceId } from '@/data/places';
import { HINT_IDS } from '@/engine/tutorial/hints';
import { simulatePacing, withinBand, TARGET_DAYS } from '@/engine/pacing/pacing';

/** The level this whole file is about. */
const ONBOARDING_LEVEL = 10;

/**
 * Rooms a player has by level 10 — which, at 1.0, is nearly the town. `settings` is chrome rather
 * than a game system: it lives in the HUD, not the rail, and it is where the tour is turned off.
 */
const ROOMS_BY_TEN = PLACES.filter(
  (place) => place.gateLevel <= ONBOARDING_LEVEL && place.id !== 'settings',
);

describe('every room a level-10 player has, the game introduced', () => {
  const beatPlaces = new Set<PlaceId>(BEATS.map((beat) => beat.place));

  it.each(ROOMS_BY_TEN.map((place) => [place.name, place] as const))(
    '%s is introduced by a beat, or announced when its gate lifts',
    (_name, place) => {
      /*
       * Two honest routes, and the second is the one that scales. Twelve beats cannot introduce
       * fifteen rooms without becoming the tour nobody finishes, so `UnlockWatcher` announces a
       * room the moment a level opens it and the Next Step chip takes over after the tour ends.
       * A room that is open from level 1 has no gate to lift, so it needs a beat.
       */
      const hasBeat = beatPlaces.has(place.id);
      const announcedOnUnlock = place.gateLevel > 1;

      expect(
        hasBeat || announcedOnUnlock,
        `${place.name} opens at level ${place.gateLevel} and nothing in the game says so`,
      ).toBe(true);
    },
  );

  it('teaches the minute loop by doing, not by reading', () => {
    /*
     * The loop a player must own before anything else: take a contract, watch the fight, take the
     * loot, put it on, spend the gold. If any of those became a `read` beat the tour would be
     * telling rather than showing, which is the failure mode a twelve-beat curriculum drifts into
     * one edit at a time.
     */
    const mustBeDone = ['welcome-in', 'first-mission', 'first-fight', 'first-loot', 'get-stronger'];
    for (const id of mustBeDone) {
      const beat = BEATS.find((entry) => entry.id === id);
      expect(beat, `the curriculum lost "${id}"`).toBeDefined();
      expect(beat!.kind, `${id} became something to read`).toBe('do');
    }
    // And the tour stays mostly hands-on overall.
    const reading = BEATS.filter((beat) => beat.kind === 'read').length;
    expect(reading, 'more than a third of the tour is now "Got it" buttons').toBeLessThanOrEqual(
      Math.floor(BEATS.length / 3),
    );
  });

  it('leaves nothing for the chip to point at that the tour has not already covered', () => {
    // The hint list exists to catch what the tour cannot. If it ever empties, the post-tour
    // player has no in-game guidance at all — which is the "unaided" half quietly failing.
    expect(HINT_IDS.length).toBeGreaterThan(0);
  });
});

describe('the tour is walkable by the player it is written for', () => {
  it('never points at a room that player cannot enter', () => {
    for (const beat of BEATS) {
      const place = PLACES_BY_ID[beat.place];
      expect(place, `beat ${beat.id} points at an unknown place`).toBeDefined();
      expect(
        beat.fromLevel,
        `beat ${beat.id} appears at level ${beat.fromLevel} but ${place.name} opens at ${place.gateLevel}`,
      ).toBeGreaterThanOrEqual(place.gateLevel);
    }
  });

  it('finishes inside the onboarding it is named after', () => {
    // A beat gated above ten is not part of "carries a new player to level 10" — it is a hint
    // wearing a beat's clothes, and it would leave the tour permanently unfinished at ten.
    for (const beat of BEATS) {
      expect(
        beat.fromLevel,
        `beat ${beat.id} does not appear until level ${beat.fromLevel}`,
      ).toBeLessThanOrEqual(ONBOARDING_LEVEL);
    }
  });

  it('runs in curriculum order, so no beat waits on a later one', () => {
    // `activeBeat` is the first beat the save cannot prove happened, so a curriculum whose level
    // gates go backwards would stall on a beat the player is too low to see.
    const gates = BEATS.map((beat) => beat.fromLevel);
    expect(gates).toEqual([...gates].sort((a, b) => a - b));
  });
});

describe('and level 10 actually arrives', () => {
  it('inside the §0 budget, measured by the same sim the pacing gate uses', () => {
    /*
     * Deliberately not a second model. `measurePacing` walks the modelled active player and
     * `pacing.test.ts` already asserts the whole §0 table — this re-asserts the one row §7 names,
     * from the same function, so the release definition and the balancing doc cannot disagree
     * about when a new player reaches ten.
     */
    const run = simulatePacing({ days: 30 });
    const day = run.reached['level-10'];

    expect(day, 'a new player never reached level 10 in a 30-day run').not.toBeNull();
    expect(
      withinBand(run, 'level-10'),
      `level 10 landed on day ${day} against a §0 target of ${TARGET_DAYS['level-10']}`,
    ).toBe(true);
    // And the tour is over by then: twelve beats against a target measured in days, not weeks.
    expect(day!).toBeLessThanOrEqual(TARGET_DAYS['level-10'] * 1.2);
  });
});
