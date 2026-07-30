/**
 * Bot identity — everything about a simulated hero that never changes.
 *
 * **Nothing here is stored.** A bot record in the save is only its *divergence* from what the
 * seed already implies (world-simulation spec §7): level, honor, guild, heat, dormancy. Name,
 * class, culture, personality and timezone are all recomputed from `(worldSeed, botId)` on
 * demand, which is what keeps 1,500 heroes under the storage budget and makes the whole world
 * reproducible from one number.
 *
 * The constraint that follows: every function here is a pure function of the id, never of a
 * draw order. Two bots generated in either order must come out identical, because reconciliation
 * touches them in whatever order the level-of-detail bands happen to produce.
 *
 * Pure module.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { CLASS_IDS, type ClassId } from '@/engine/items/types';
import { CULTURES, heroName, type Culture } from '@/data/names';
import { legendForBot } from '@/data/legends';

/** The population of a world (spec §2). */
export const BOT_COUNT = 1_500;

/**
 * What a bot is like. Drives everything they do, and is derived, never stored (§2).
 *
 * `dedication` follows the balancing §12 distribution: 60% casual, 30% regular, 10% hardcore.
 * The rest are uniform — they shape flavour rather than power, so a fancier distribution would
 * be unmeasurable in play.
 */
export interface Personality {
  /** 0.15–1.1. Drives daily XP, and therefore everything downstream. */
  readonly dedication: number;
  /** 0–1. How often they attack on the ladder. */
  readonly aggression: number;
  /** 0–1. Chat, donations, and how much the Crier hears from them. */
  readonly sociability: number;
  /** 0–1. Gear score lead (high) or lag (low) against their level. */
  readonly hoarding: number;
  /** 0–1. Schedule noise, and the odds of going quiet for a fortnight. */
  readonly volatility: number;
}

export interface BotIdentity {
  readonly id: number;
  readonly name: string;
  readonly classId: ClassId;
  readonly culture: Culture;
  readonly personality: Personality;
  /** Hours from the player's local midnight; shifts when in the day this bot is busy. */
  readonly timezoneOffset: number;
  /** True for ids 0–9, the hand-authored top of the ladder. */
  readonly legend: boolean;
}

/**
 * Dedication, per balancing §12: 60% in 0.15–0.5, 30% in 0.5–0.85, 10% in 0.85–1.1.
 *
 * Drawn from a single uniform so the *bands* are exact rather than approached statistically —
 * with only 1,500 samples, sampling a shaped distribution would leave the mix visibly off.
 */
function dedicationFrom(roll: number): number {
  if (roll < 0.6) return 0.15 + (roll / 0.6) * 0.35;
  if (roll < 0.9) return 0.5 + ((roll - 0.6) / 0.3) * 0.35;
  return 0.85 + ((roll - 0.9) / 0.1) * 0.25;
}

/**
 * The inverse of `dedicationFrom` — where in the population a dedication sits, 0–1.
 *
 * World generation needs this to correlate level with dedication *without* distorting the level
 * distribution: it maps the bot back to its percentile and pushes that through the level curve,
 * rather than scaling the level draw (which shifts the median and was the first version's bug).
 */
export function dedicationPercentile(dedication: number): number {
  if (dedication < 0.5) return ((dedication - 0.15) / 0.35) * 0.6;
  if (dedication < 0.85) return 0.6 + ((dedication - 0.5) / 0.35) * 0.3;
  return 0.9 + ((dedication - 0.85) / 0.25) * 0.1;
}

/**
 * Everything the seed says about a bot.
 *
 * Forked per-bot from the world seed, so bot 900 can be materialised without touching bots
 * 0–899 — which is exactly what the level-of-detail bands need.
 */
export function botIdentity(worldSeed: number, id: number): BotIdentity {
  const legend = legendForBot(id);
  const rng = createRng(deriveSeed(worldSeed, 'bot', id), `bot:${id}`);

  // Draw in a fixed order. Adding a draw in the middle would reshuffle every world, so new
  // traits go on the end.
  const classRoll = rng.int(0, CLASS_IDS.length - 1);
  const cultureRoll = rng.int(0, CULTURES.length - 1);
  const nameIndex = rng.int(0, 100_000);
  const epithetIndex = rng.int(0, 100_000);
  const dedicationRoll = rng.next();
  const aggression = rng.next();
  const sociability = rng.next();
  const hoarding = rng.next();
  const volatility = rng.next();
  const timezoneOffset = rng.int(-11, 12);

  const culture = CULTURES[cultureRoll]!;

  return {
    id,
    name: legend?.name ?? heroName(culture, nameIndex, epithetIndex),
    classId: legend?.classId ?? CLASS_IDS[classRoll]!,
    culture,
    personality: {
      // Legends are the endgame chase, so their dedication is authored rather than rolled.
      dedication: legend?.dedication ?? dedicationFrom(dedicationRoll),
      aggression,
      sociability,
      hoarding,
      volatility: legend ? volatility * 0.3 : volatility,
    },
    timezoneOffset,
    legend: legend !== null,
  };
}

/** The archetype label a personality earns, for content and rival flavour (spec §2). */
export type BotArchetype =
  'grinder' | 'casual' | 'weekend-warrior' | 'collector' | 'social' | 'rival-material';

export function archetypeOf(personality: Personality): BotArchetype {
  const { dedication, aggression, sociability, hoarding, volatility } = personality;

  if (dedication >= 0.85) return aggression > 0.6 ? 'rival-material' : 'grinder';
  if (volatility > 0.7) return 'weekend-warrior';
  if (hoarding > 0.75) return 'collector';
  if (sociability > 0.7) return 'social';
  return 'casual';
}

/** Display name without the epithet — what the Crier uses when space is short. */
export function shortNameOf(identity: BotIdentity): string {
  return identity.name.split(' ')[0]!;
}
