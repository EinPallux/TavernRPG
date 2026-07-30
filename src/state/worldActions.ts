'use client';

/**
 * The simulated world, as store transitions.
 *
 * Save in, save out — the same shape as every other action module. Two entry points matter:
 *
 * - `ensureWorld` raises the 1,500 the first time a save needs them. It runs at hero creation
 *   and, for saves upgraded from before Phase 8, on the first load after the migration.
 * - `catchUpWorld` advances the simulation to now and returns what the player missed. This is
 *   the load-path call, and it is the one with the ≤1s budget on it.
 *
 * The player's own rank is what the level-of-detail bands centre on, so it is read from the
 * ladder here rather than tracked separately — one array, one answer.
 */

import { generateWorld, rankOf, type WorldState } from '@/engine/world/generate';
import { simTick, type SimEvent } from '@/engine/world/simulate';
import { updateRivals, type Rival } from '@/engine/world/rivals';
import {
  buildFeed,
  summariseAbsence,
  type AbsenceSummary,
  type FeedEntry,
} from '@/engine/world/crier';
import { PLAYER_LADDER_ID } from '@/engine/world/ladder';
import type { SaveFile, StoredWorld } from '@/engine/save/schema';

const DAY = 86_400_000;

/** An absence shorter than this is not worth a "while you were away" card. */
export const SUMMARY_THRESHOLD_MS = 6 * 3_600_000;

/**
 * The stored shape and the engine shape differ by two fields the engine keeps outside
 * `WorldState` — rivals and the feed live alongside it rather than inside, because the
 * simulation does not read them and a pure tick should not have to carry them.
 */
function toEngine(stored: StoredWorld): WorldState {
  return {
    seed: stored.seed,
    createdAt: stored.createdAt,
    lastSimAt: stored.lastSimAt,
    bots: stored.bots,
    guilds: stored.guilds,
    ladder: stored.ladder,
  };
}

function toStored(
  world: WorldState,
  rivals: readonly Rival[],
  feed: readonly FeedEntry[],
): StoredWorld {
  return {
    seed: world.seed,
    createdAt: world.createdAt,
    lastSimAt: world.lastSimAt,
    bots: [...world.bots],
    guilds: world.guilds.map((hall) => ({ ...hall, memberIds: [...hall.memberIds] })),
    ladder: [...world.ladder],
    rivals: [...rivals],
    feed: [...feed],
  };
}

/**
 * The player's rank, or 0 before they have entered the ladder.
 *
 * The player joins at the bottom when the arena opens (Phase 9); until then the bands centre on
 * the tail of the ladder, which is where they will arrive.
 */
export function playerRank(world: StoredWorld | null): number {
  if (!world) return 0;
  const index = world.ladder.indexOf(PLAYER_LADDER_ID);
  return index === -1 ? 0 : index + 1;
}

/**
 * How far back a new world's clock is set, so the first catch-up has something to report.
 *
 * Without this a brand-new hero walks into a Tavern with a blank Crier board — the world is
 * generated with `lastSimAt = now`, so there is nothing to simulate and nothing to say. Backing
 * the clock up a day is also the truthful option: the server is ninety days old, so yesterday
 * did happen.
 */
export const WORLD_WARMUP_MS = DAY;

/** Raise the world if this save has none. Idempotent. */
export function ensureWorld(save: SaveFile, now: number): SaveFile {
  if (save.world || !save.hero) return save;

  const world = generateWorld(save.worldSeed, now - WORLD_WARMUP_MS);
  return { ...save, world: toStored(world, [], []) };
}

export interface CatchUp {
  readonly save: SaveFile;
  /** Null when nothing was simulated. */
  readonly summary: AbsenceSummary | null;
  readonly events: readonly SimEvent[];
  /** Wall-clock cost, so the dev harness can show the budget being met. */
  readonly elapsedMs: number;
}

/**
 * Advance the world to `now`, refresh the rivals and rebuild the feed.
 *
 * Called on load and on the online tick. Returns the summary only when the absence was long
 * enough to be worth remarking on — a card saying "while you were away (4 minutes)" is noise.
 */
export function catchUpWorld(save: SaveFile, now: number): CatchUp {
  const stored = save.world;
  if (!stored || !save.hero) {
    return { save, summary: null, events: [], elapsedMs: 0 };
  }

  const startedAt = performance.now();
  const engine = toEngine(stored);
  const absence = now - engine.lastSimAt;
  if (absence <= 0) {
    return { save, summary: null, events: [], elapsedMs: 0 };
  }

  const rank = playerRank(stored);
  const guildmates = stored.bots
    .filter((bot) => bot.guildId >= 0 && bot.guildId === playerGuildId(stored))
    .map((bot) => bot.id)
    .slice(0, 40);

  const result = simTick(engine, now, {
    playerRank: rank,
    rivalIds: stored.rivals.map((rival) => rival.botId),
    guildmateIds: guildmates,
  });

  const days = Math.max(0, absence / DAY);
  const rivalUpdate = updateRivals({
    world: result.world,
    playerRank: rank,
    current: stored.rivals,
    now,
    daysElapsed: days,
  });

  const context = {
    world: result.world,
    rivals: rivalUpdate.rivals,
    playerRank: rank,
    playerGuildId: playerGuildId(stored),
  };

  const feed = buildFeed({
    context,
    events: result.events,
    existing: stored.feed,
    now,
    days: Math.max(1, Math.ceil(days)),
  });

  // Rank drift: standing still on a moving ladder costs places, and the card should say so.
  const rankAfter = result.world.ladder.indexOf(PLAYER_LADDER_ID);
  const drift = rank > 0 && rankAfter !== -1 ? rank - (rankAfter + 1) : 0;

  const summary =
    absence >= SUMMARY_THRESHOLD_MS
      ? summariseAbsence(result.events, feed, Math.max(1, Math.round(days)), drift)
      : null;

  return {
    save: { ...save, world: toStored(result.world, rivalUpdate.rivals, feed) },
    summary,
    events: result.events,
    elapsedMs: performance.now() - startedAt,
  };
}

/** The player's guild, once guilds are joinable (Phase 10). -1 until then. */
export function playerGuildId(_world: StoredWorld | null): number {
  return -1;
}

/** A rival's current rank, for the rival card. */
export function rivalRank(world: StoredWorld, rival: Rival): number {
  return rankOf(toEngine(world), rival.botId);
}
