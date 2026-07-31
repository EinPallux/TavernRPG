/**
 * The mission board (docs/design/systems/tavern-and-patrol.md §3, §6).
 *
 * Three cards, drawn seeded-daily. Seeded from `(worldSeed, dayKey, rerollCount)` so the board
 * is the same every time it is read — reloading the page must not reshuffle the work, or the
 * daily reroll would be free and the Golden Die sink meaningless.
 *
 * Two guarantees the spec asks for, both enforced here rather than left to luck:
 *  - **≥2 zones per board**, so the day never looks like one long errand in one place.
 *  - **≥1 card worth taking the long route on**, so the 20-minute option is always live.
 *
 * Pure module.
 */

import { createRng, deriveSeed, type RngStream } from '@/engine/rng';
import { MISSION_DURATIONS } from '@/engine/progression/rewards';
import { blurbsForZone } from '@/data/missionBlurbs';
import { monstersInZone } from '@/data/monsters';
import { zonesForLevel, type ZoneDef } from '@/data/zones';
import type { MissionOffer } from './types';

/** Cards on a board (tavern spec §3). */
export const BOARD_SIZE = 3;
/** A board must span at least this many distinct zones (§6). */
export const MIN_BOARD_ZONES = 2;
/** Rerolls beyond the first each day cost a Golden Die (§3). */
export const FREE_REROLLS_PER_DAY = 1;
export const REROLL_DICE_COST = 1;
/** Skipping the remaining wait, at any point (§3). */
export const SKIP_DICE_COST = 1;

/** Monster level jitter around the hero (balancing §5): −1 to +2. */
const LEVEL_JITTER: readonly number[] = [-1, 0, 0, 1, 1, 2];

/**
 * Below this level the jitter never rounds *upward*.
 *
 * Plus-two is a rounding error at level 40 and a different game at level 1 — a brand-new hero
 * in starter commons meeting a level-3 monster loses about a fifth of the time, which is a
 * miserable way to learn what a mission is. Measured: the grace band takes the opening hours
 * from ~80% to ~99% without touching anything past level 5 (balancing §5).
 */
const JITTER_GRACE_LEVEL = 5;

export interface DrawBoardOptions {
  readonly worldSeed: number;
  readonly dayKey: string;
  readonly heroLevel: number;
  /** Rerolls used today. Part of the seed, so each reroll is a genuinely different board. */
  readonly rerollCount?: number;
}

/**
 * Draw the day's board. Deterministic for a given `(worldSeed, dayKey, rerollCount)`.
 */
export function drawBoard({
  worldSeed,
  dayKey,
  heroLevel,
  rerollCount = 0,
}: DrawBoardOptions): readonly MissionOffer[] {
  const rng = createRng(deriveSeed(worldSeed, 'board', dayKey, rerollCount), `board/${dayKey}`);
  const zones = zonesForLevel(heroLevel);

  const offers: MissionOffer[] = [];
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    offers.push(
      drawOffer(
        rng.fork(`card-${index}`),
        pickZone(zones, offers, index, rng),
        heroLevel,
        index,
        dayKey,
      ),
    );
  }

  return offers;
}

/**
 * Choose a zone for card `index`.
 *
 * The last card is forced onto a new zone if the first two landed in the same one, which is how
 * the ≥2-zone guarantee is kept without rejecting and redrawing whole boards.
 */
function pickZone(
  zones: readonly ZoneDef[],
  drawnSoFar: readonly MissionOffer[],
  index: number,
  rng: RngStream,
): ZoneDef {
  const used = new Set(drawnSoFar.map((offer) => offer.zoneId));
  const isLastCard = index === BOARD_SIZE - 1;

  if (isLastCard && used.size < MIN_BOARD_ZONES && zones.length > 1) {
    const unused = zones.filter((zone) => !used.has(zone.id));
    if (unused.length > 0) return rng.fork('zone-forced').pick(unused);
  }

  return rng.fork('zone').pick(zones);
}

function drawOffer(
  rng: RngStream,
  zone: ZoneDef,
  heroLevel: number,
  index: number,
  dayKey: string,
): MissionOffer {
  const roster = monstersInZone(zone.id);
  const monster = rng.fork('monster').pick(roster);

  /*
   * Blurbs are drawn against the longest duration, because the player picks the length *after*
   * reading the card — the text must not become a lie when they choose 20 minutes.
   *
   * The pool is the shared lines plus this zone's own, so a marsh contract is allowed to mention
   * the reeds and a cave contract the heat (content-plan §6).
   */
  const blurb = rng.fork('blurb').pick(blurbsForZone(zone.id, MISSION_DURATIONS.at(-1)!));

  const rolled = rng.fork('level').pick(LEVEL_JITTER);
  const jitter = heroLevel < JITTER_GRACE_LEVEL ? Math.min(0, rolled) : rolled;

  return {
    id: `${dayKey}:${index}:${zone.id}:${monster.id}`,
    zoneId: zone.id,
    monsterId: monster.id,
    blurbId: blurb.id,
    backdropIndex: rng.fork('backdrop').int(0, 64),
    seed: deriveSeed(rng.snapshot().seed, 'mission', index),
    monsterLevel: Math.max(1, heroLevel + jitter),
  };
}

/** What the next reroll costs: free once a day, then a Golden Die. */
export function rerollCost(rerollsToday: number): number {
  return rerollsToday < FREE_REROLLS_PER_DAY ? 0 : REROLL_DICE_COST;
}
