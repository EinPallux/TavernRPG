/**
 * Rivals — the personal antagonists (world-simulation spec §5).
 *
 * The sim's whole retention argument is *names the player recognises*. A ladder of 1,500
 * strangers is a spreadsheet; two or three people who keep turning up, keep passing you, and
 * keep saying things about your shield arm is a story. This module picks them and keeps the
 * heat.
 *
 * Rivals **rotate naturally**: heat decays with rank separation, so climbing away from someone
 * quietly retires them and promotes whoever is now in your way. Nobody has to decide that a
 * rivalry is over — the distance decides.
 *
 * Pure module.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { RIVAL_ARCHETYPES, type RivalArchetype } from '@/data/crierTemplates';
import { botIdentity, type Personality } from './identity';
import { rankOf, type WorldState } from './generate';

/** How many rivals the world keeps warm at once (spec §5). */
export const MIN_RIVALS = 2;
export const MAX_RIVALS = 3;

/** Ranks either side of the player a rival may be drawn from. */
export const RIVAL_BAND = 40;

/** Heat is 0–100. Below this a rivalry lapses and the slot reopens. */
export const HEAT_FLOOR = 12;
export const HEAT_START = 45;
export const HEAT_MAX = 100;

/** What each interaction is worth. */
export const HEAT_PER_ENCOUNTER = 14;
export const HEAT_PER_OVERTAKE = 22;
/** Lost per day, before rank separation is taken into account. */
export const HEAT_DECAY_PER_DAY = 3;

export interface Rival {
  readonly botId: number;
  readonly archetype: RivalArchetype;
  /** 0–100. Drives taunt frequency, attack rate and revenge priority. */
  readonly heat: number;
  /** When the rivalry started, for "your oldest rival" flavour. */
  readonly since: number;
  /** True once the player has beaten them at least once (spec §5's first-win beat). */
  readonly everBeaten: boolean;
}

/**
 * Which archetype a bot's personality earns.
 *
 * Scored rather than branched, so adding an archetype is a data change: each one declares the
 * traits it wants in `RIVAL_ARCHETYPES_BY_ID`, and the best match wins. A `wants` weight of -1
 * means "the opposite of this".
 */
export function archetypeFor(personality: Personality): RivalArchetype {
  let best: RivalArchetype = 'veteran';
  let bestScore = -Infinity;

  for (const id of RIVAL_ARCHETYPES) {
    const wants = ARCHETYPE_WANTS[id];
    let score = 0;
    for (const [trait, weight] of Object.entries(wants)) {
      const value = personality[trait as keyof Personality];
      // Dedication runs 0.15–1.1; the rest run 0–1. Normalise so one trait cannot dominate.
      const normalised = trait === 'dedication' ? (value - 0.15) / 0.95 : value;
      score += weight * normalised;
    }
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }

  return best;
}

/** Pulled out so `archetypeFor` does not import the whole template module's render helpers. */
const ARCHETYPE_WANTS: Readonly<
  Record<RivalArchetype, Partial<Record<keyof Personality, number>>>
> = {
  overachiever: { dedication: 1 },
  'trash-talker': { sociability: 1, aggression: 0.8 },
  ghost: { volatility: 1 },
  copycat: { aggression: 0.6, dedication: 0.6 },
  veteran: { dedication: 0.7, volatility: -1 },
  newcomer: { dedication: 0.9, aggression: 0.9 },
};

/**
 * Heat after `days` with the rivalry at this rank separation.
 *
 * Separation is what retires a rivalry. Someone forty ranks away is barely in your world any
 * more, and the decay curve says so — which is how rivals rotate as the player climbs without
 * anything having to explicitly end them.
 */
export function decayHeat(heat: number, days: number, rankSeparation: number): number {
  const distancePenalty = 1 + Math.max(0, rankSeparation - 10) / 20;
  return Math.max(0, heat - HEAT_DECAY_PER_DAY * days * distancePenalty);
}

export interface RivalUpdate {
  readonly rivals: readonly Rival[];
  /** Rivalries that lapsed this pass, so the UI can say goodbye rather than blink them away. */
  readonly retired: readonly Rival[];
  /** Newly promoted, for the "you have a new rival" beat. */
  readonly promoted: readonly Rival[];
}

export interface RivalOptions {
  readonly world: WorldState;
  readonly playerRank: number;
  readonly current: readonly Rival[];
  readonly now: number;
  /** Days since the last update, for decay. */
  readonly daysElapsed: number;
}

/**
 * Refresh the rival set: decay, retire, then fill the empty slots.
 *
 * Candidates are drawn from the band around the player and scored on *trajectory*, not just
 * proximity — the spec asks for "compatible trajectory", which in practice means someone
 * climbing at a similar rate. A rival who is about to vanish upward is not a rival, they are
 * scenery.
 */
export function updateRivals({
  world,
  playerRank,
  current,
  now,
  daysElapsed,
}: RivalOptions): RivalUpdate {
  const kept: Rival[] = [];
  const retired: Rival[] = [];

  for (const rival of current) {
    const separation = Math.abs(rankOf(world, rival.botId) - playerRank);
    const heat = decayHeat(rival.heat, daysElapsed, separation);
    if (heat < HEAT_FLOOR) retired.push({ ...rival, heat });
    else kept.push({ ...rival, heat });
  }

  const promoted: Rival[] = [];
  if (kept.length >= MAX_RIVALS || playerRank <= 0) {
    return { rivals: kept, retired, promoted };
  }

  const taken = new Set(kept.map((r) => r.botId));
  const size = world.ladder.length;
  const from = Math.max(0, playerRank - RIVAL_BAND - 1);
  const to = Math.min(size, playerRank + RIVAL_BAND);

  // Score every candidate in the band, then take the best. Seeded by the day so the choice is
  // stable across a session but does not calcify forever.
  const rng = createRng(deriveSeed(world.seed, 'rivals', Math.floor(now / 86_400_000)), 'rivals');
  const scored: { botId: number; score: number }[] = [];

  for (let i = from; i < to; i += 1) {
    const botId = world.ladder[i];
    if (botId === undefined || botId < 0 || taken.has(botId)) continue;

    const record = world.bots[botId];
    if (!record || record.dormantUntil > now) continue;

    const identity = botIdentity(world.seed, botId);
    const separation = Math.abs(i + 1 - playerRank);

    // Close, active, and inclined to bother you.
    const score =
      (1 - separation / (RIVAL_BAND + 1)) * 2 +
      identity.personality.aggression * 1.2 +
      identity.personality.dedication +
      rng.next() * 0.8;

    scored.push({ botId, score });
  }

  scored.sort((a, b) => b.score - a.score);

  const wanted = Math.max(MIN_RIVALS, Math.min(MAX_RIVALS, MAX_RIVALS)) - kept.length;
  for (const candidate of scored.slice(0, Math.max(0, wanted))) {
    const identity = botIdentity(world.seed, candidate.botId);
    const rival: Rival = {
      botId: candidate.botId,
      archetype: archetypeFor(identity.personality),
      heat: HEAT_START,
      since: now,
      everBeaten: false,
    };
    kept.push(rival);
    promoted.push(rival);
  }

  return { rivals: kept, retired, promoted };
}

/** Bump heat after an encounter. Capped, so a grinding session cannot max it out forever. */
export function heatAfterEncounter(rival: Rival, overtook: boolean): Rival {
  const gain = HEAT_PER_ENCOUNTER + (overtook ? HEAT_PER_OVERTAKE : 0);
  return { ...rival, heat: Math.min(HEAT_MAX, rival.heat + gain) };
}

/** Mark the first win against a rival — the spec's headline-and-dice beat (§5). */
export function markBeaten(rival: Rival): { rival: Rival; firstTime: boolean } {
  if (rival.everBeaten) return { rival, firstTime: false };
  return { rival: { ...rival, everBeaten: true }, firstTime: true };
}

/** How much more often this rival attacks the player than a stranger would. */
export function attackPressure(rival: Rival): number {
  return 1 + (rival.heat / HEAT_MAX) * 1.5;
}
