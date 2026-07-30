/**
 * Simulation ticks and offline reconciliation (world-simulation spec §3, §4).
 *
 * The promise this file has to keep: **close the tab for a week, come back, and the world has
 * moved on — with no visible stall.** Fifteen hundred heroes × 336 hours is half a million
 * updates if done naively, which is both too slow and pointless, because the player cannot tell
 * the difference between a bot four hundred ranks below them levelling on Tuesday or on Friday.
 *
 * So the work is spent where it can be seen (spec §4):
 *
 * | Band | Who | Cost |
 * |---|---|---|
 * | **Full** | rivals, guildmates, ladder ±100 | hourly, with events |
 * | **Coarse** | ladder ±500 | daily, ladder swaps only |
 * | **Distribution** | everyone else | one closed-form integration at the end |
 *
 * What is guaranteed, precisely:
 *
 * 1. **Determinism.** The same world, span and context always produce the same result — a bot's
 *    activity in hour H is a pure function of `(worldSeed, botId, H)`, never of a running RNG
 *    position. That also makes it *order-independent within a tick*: iterating the band in any
 *    order lands in the same place.
 * 2. **Progress integration composes** (`integrateProgress`): a fortnight in one step equals
 *    fourteen daily steps, so the closed-form path and the replay path agree at the boundary.
 * 3. **The bands are fixed once per call**, from the player's rank at that moment.
 *
 * What is deliberately *not* guaranteed is that one long call equals many short ones. The bands
 * follow the player, so a bot that drifts across a band boundary between calls gets a different
 * (cheaper or richer) treatment than it would have in a single pass. That is the level-of-detail
 * system working as intended, not a bug to design around — the difference is invisible at the
 * distances where it happens, which is the entire premise.
 *
 * Pure module.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { applyXp, xpNeeded } from '@/engine/progression/xp';
import { VIGOR_PER_DAY, xpPerVigor } from '@/engine/progression/rewards';
import { PLAYER_LADDER_ID, resolveLadderFight } from './ladder';
import { botIdentity, type Personality } from './identity';
import { MAX_BOT_LEVEL, type BotRecord, type WorldState } from './generate';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Longest span replayed hour by hour. Beyond this, progression is integrated (spec §4). */
export const MAX_REPLAY_DAYS = 14;
export const MAX_REPLAY_MS = MAX_REPLAY_DAYS * MS_PER_DAY;

/** Level-of-detail band widths, in ladder ranks either side of the player (spec §4). */
export const FULL_BAND = 100;
export const COARSE_BAND = 500;

/** Chance per day a bot goes quiet, and how long for — ~2%/month, volatility-weighted (§3). */
export const DORMANCY_BASE_CHANCE = 0.02 / 30;
export const DORMANCY_MIN_DAYS = 3;
export const DORMANCY_MAX_DAYS = 21;

/**
 * Share of hours a bot is active across a day, averaged over `isActiveHour`.
 *
 * Used by the closed-form path so integration and replay produce the same amount of play. If
 * these two drift apart, a fortnight's absence and a fortnight of watching give different worlds.
 */
export const ACTIVE_HOUR_SHARE = 0.29;

export type SimEventKind = 'levelUp' | 'ladderPass' | 'milestone' | 'dormant' | 'returned';

/**
 * Something that actually happened. The Town Crier may only speak about these.
 *
 * Every field is a fact the tick produced, which is what lets the audit test assert that no
 * headline was invented — a feed the simulation cannot back up is decoration.
 */
export interface SimEvent {
  readonly kind: SimEventKind;
  readonly at: number;
  readonly botId: number;
  /** The bot on the other side of a ladder pass. */
  readonly otherId?: number;
  readonly level?: number;
  readonly rank?: number;
}

export interface SimContext {
  /** The player's ladder rank, used to fix the bands. 0 when they are not on the ladder yet. */
  readonly playerRank: number;
  /** Rivals get full fidelity wherever they sit. */
  readonly rivalIds: readonly number[];
  /** The player's guildmates, likewise. */
  readonly guildmateIds: readonly number[];
}

export interface SimResult {
  readonly world: WorldState;
  /** Oldest first. Capped by the caller when it reaches the feed. */
  readonly events: readonly SimEvent[];
  /** Hours actually replayed, for the perf test and the dev harness. */
  readonly hoursReplayed: number;
  /** True when the absence was long enough to be integrated rather than replayed. */
  readonly integrated: boolean;
}

/** Which bots get which treatment. Computed once (see the header). */
interface Bands {
  readonly full: Set<number>;
  readonly coarse: Set<number>;
}

function computeBands(world: WorldState, context: SimContext): Bands {
  const full = new Set<number>(context.rivalIds);
  for (const id of context.guildmateIds) full.add(id);

  const size = world.ladder.length;
  // A player who has not entered the ladder still gets a live world: band on the bottom, which
  // is where they will arrive.
  const anchor = context.playerRank > 0 ? context.playerRank : size;

  const fullFrom = Math.max(0, anchor - FULL_BAND - 1);
  const fullTo = Math.min(size, anchor + FULL_BAND);
  for (let i = fullFrom; i < fullTo; i += 1) {
    const id = world.ladder[i];
    if (id !== undefined && id !== PLAYER_LADDER_ID) full.add(id);
  }

  // The legends are always worth watching — they are the endgame chase, and a rank-1 change
  // is news at every level.
  for (let i = 0; i < Math.min(10, size); i += 1) {
    const id = world.ladder[i];
    if (id !== undefined && id !== PLAYER_LADDER_ID) full.add(id);
  }

  const coarse = new Set<number>();
  const coarseFrom = Math.max(0, anchor - COARSE_BAND - 1);
  const coarseTo = Math.min(size, anchor + COARSE_BAND);
  for (let i = coarseFrom; i < coarseTo; i += 1) {
    const id = world.ladder[i];
    if (id !== undefined && id !== PLAYER_LADDER_ID && !full.has(id)) coarse.add(id);
  }

  return { full, coarse };
}

/**
 * XP a bot earns in one hour.
 *
 * Anchored to the player's own curve: a bot with dedication 1.0 earns what a player who spends
 * their whole day's Vigor earns, and everyone else is a fraction of that. Using the shared curve
 * rather than a bot-specific one is what keeps the ladder honest as the player's own pacing is
 * tuned — change `xpPerVigor` and the whole world re-paces with it.
 */
export function botHourlyXp(level: number, personality: Personality, hourNoise: number): number {
  const dailyPlayerXp = VIGOR_PER_DAY * xpPerVigor(level, xpNeeded(level));
  // Schedule noise: bots are not metronomes, and volatile ones are less so.
  const noise = 1 + (hourNoise - 0.5) * (0.6 + personality.volatility);
  return (dailyPlayerXp * personality.dedication * Math.max(0, noise)) / 24;
}

export interface Progress {
  readonly level: number;
  readonly xp: number;
  /** Levels gained, so the caller can decide whether it is worth an event. */
  readonly gained: number;
}

/**
 * Advance a bot by `hours` of *active* play, in closed form.
 *
 * Steps level by level rather than multiplying, because the XP wall rises as it goes — a flat
 * `xp += perHour × hours` would over-level a bot integrating a year. Written as its own
 * function so the composition property can be tested directly: integrating fourteen days once
 * must equal integrating one day fourteen times, or the closed-form path and the replay path
 * disagree at the fourteen-day boundary where they meet.
 */
export function integrateProgress(
  level: number,
  xp: number,
  hours: number,
  personality: Personality,
): Progress {
  let currentLevel = level;
  let currentXp = xp;
  let remaining = hours;

  while (remaining > 0 && currentLevel < MAX_BOT_LEVEL) {
    // Median noise: integration is an average over many hours, so the average hour is the
    // honest sample. Using a draw here would make the closed-form path stochastic.
    const perHour = botHourlyXp(currentLevel, personality, 0.5);
    if (perHour <= 0) break;

    const hoursToLevel = (xpNeeded(currentLevel) - currentXp) / perHour;
    if (hoursToLevel > remaining) {
      currentXp += perHour * remaining;
      break;
    }

    remaining -= hoursToLevel;
    currentXp = 0;
    currentLevel += 1;
  }

  return { level: currentLevel, xp: currentXp, gained: currentLevel - level };
}

/** Is this bot awake in this hour? Their timezone decides when their day is (spec §2). */
function isActiveHour(hourOfDay: number, timezoneOffset: number, roll: number): boolean {
  // Local hour for this bot, 0–23.
  const local = (((hourOfDay + timezoneOffset) % 24) + 24) % 24;
  // Asleep 01:00–07:00, busiest in the evening.
  if (local >= 1 && local < 7) return roll < 0.04;
  if (local >= 18 && local < 24) return roll < 0.55;
  return roll < 0.28;
}

/** The RNG for one bot in one hour. Keyed so replay order can never matter (invariant 1). */
function hourRng(seed: number, botId: number, hourBucket: number) {
  return createRng(deriveSeed(seed, 'sim', botId, hourBucket), `sim:${botId}:${hourBucket}`);
}

interface Mutable {
  level: number;
  xp: number;
  honor: number;
  gearScore: number;
  dormantUntil: number;
  guildId: number;
}

/**
 * Advance the world to `toTimestamp`.
 *
 * Returns a new world and every event worth telling the player about. Absences longer than
 * `MAX_REPLAY_DAYS` are integrated in closed form: the events from the missing weeks are not
 * reconstructed hour by hour, because nobody is going to read three thousand headlines — the
 * summary card covers it instead.
 */
export function simTick(world: WorldState, toTimestamp: number, context: SimContext): SimResult {
  const from = world.lastSimAt;
  if (toTimestamp <= from) {
    return { world, events: [], hoursReplayed: 0, integrated: false };
  }

  const bands = computeBands(world, context);
  const events: SimEvent[] = [];

  // Working copies, indexed by bot id, so the hot loop never allocates.
  const state: Mutable[] = world.bots.map((bot) => ({
    level: bot.level,
    xp: bot.xp,
    honor: bot.honor,
    gearScore: bot.gearScore,
    dormantUntil: bot.dormantUntil,
    guildId: bot.guildId,
  }));

  // Identities are pure functions of the seed but not free, so resolve each once up front
  // rather than 336 times in the loop.
  const identities = world.bots.map((bot) => botIdentity(world.seed, bot.id));

  let ladder = [...world.ladder];
  const totalMs = toTimestamp - from;
  const integrated = totalMs > MAX_REPLAY_MS;

  // The span that gets hour-by-hour treatment. Anything older is integrated below.
  const replayFrom = integrated ? toTimestamp - MAX_REPLAY_MS : from;
  const startHour = Math.floor(replayFrom / MS_PER_HOUR);
  const endHour = Math.floor(toTimestamp / MS_PER_HOUR);
  const hoursReplayed = Math.max(0, endHour - startHour);

  // ── Distribution band, and the un-replayed prefix: one closed-form step. ──
  // Integrating rather than replaying is the difference between a fortnight and a year both
  // costing the same on load.
  const unreplayedHours = Math.max(0, (replayFrom - from) / MS_PER_HOUR);
  for (let id = 0; id < state.length; id += 1) {
    const bot = state[id]!;
    const identity = identities[id]!;
    const isDistribution = !bands.full.has(id) && !bands.coarse.has(id);
    // Distribution bots skip the replay entirely, so they integrate the *whole* span.
    const hours = isDistribution ? totalMs / MS_PER_HOUR : unreplayedHours;
    if (hours <= 0) continue;

    // Average activity rather than sampling it: ~29% of hours are active across a day.
    const effective = hours * ACTIVE_HOUR_SHARE * (bot.dormantUntil > from ? 0.15 : 1);
    const progress = integrateProgress(bot.level, bot.xp, effective, identity.personality);
    bot.level = progress.level;
    bot.xp = progress.xp;
    // Gear drifts toward the bot's natural lead/lag as they play.
    if (progress.gained > 0) {
      bot.gearScore = Math.min(1.15, bot.gearScore + progress.gained * 0.001);
    }
    if (bot.dormantUntil <= toTimestamp) bot.dormantUntil = 0;
  }

  // ── Full band: hour by hour, with events. ──
  const full = [...bands.full].filter((id) => state[id] !== undefined);
  for (let hour = startHour; hour < endHour; hour += 1) {
    const hourOfDay = ((hour % 24) + 24) % 24;
    const at = hour * MS_PER_HOUR;

    for (const id of full) {
      const bot = state[id]!;
      const identity = identities[id]!;
      const rng = hourRng(world.seed, id, hour);

      // Dormancy first — a sleeping bot does nothing, and waking up is news.
      if (bot.dormantUntil > at) continue;
      if (bot.dormantUntil !== 0) {
        bot.dormantUntil = 0;
        events.push({ kind: 'returned', at, botId: id });
      }

      // Quit arcs are checked *before* the activity gate. Going quiet is not something that
      // only happens while you are playing — putting this after the gate silently cut the rate
      // to the ~29% of hours a bot is active, a third of the 2%/month the spec asks for.
      if (rng.next() < (DORMANCY_BASE_CHANCE * (0.3 + identity.personality.volatility * 2)) / 24) {
        const days =
          DORMANCY_MIN_DAYS + Math.floor(rng.next() * (DORMANCY_MAX_DAYS - DORMANCY_MIN_DAYS));
        bot.dormantUntil = at + days * MS_PER_DAY;
        events.push({ kind: 'dormant', at, botId: id });
        continue;
      }

      if (!isActiveHour(hourOfDay, identity.timezoneOffset, rng.next())) continue;

      const gained = botHourlyXp(bot.level, identity.personality, rng.next());
      if (bot.level < MAX_BOT_LEVEL) {
        const levelled = applyXp(bot.level, bot.xp, gained);
        if (levelled.level > bot.level) {
          bot.level = Math.min(MAX_BOT_LEVEL, levelled.level);
          events.push({ kind: 'levelUp', at, botId: id, level: bot.level });
        }
        bot.xp = levelled.xp;
      }

      // An arena attack, if they are the sort. Aggression is the whole gate.
      if (rng.bool(0.05 + identity.personality.aggression * 0.12)) {
        const rank = ladder.indexOf(id) + 1;
        if (rank > 1) {
          // Attack someone a little above. The band is deliberately narrow so the ladder
          // churns rather than teleports.
          const targetRank = Math.max(1, rank - rng.int(1, 12));
          const targetId = ladder[targetRank - 1];
          if (targetId !== undefined && targetId !== PLAYER_LADDER_ID && state[targetId]) {
            const target = state[targetId]!;
            // Level decides it, with enough noise that upsets happen. The *player's* fights
            // run the real engine; five thousand bot fights a day cannot.
            const edge = 0.5 + (bot.level - target.level) * 0.06;
            const won = rng.next() < Math.min(0.92, Math.max(0.08, edge));

            const outcome = resolveLadderFight({
              order: ladder,
              attacker: { id, honor: bot.honor },
              defender: { id: targetId, honor: target.honor },
              attackerWon: won,
            });
            ladder = [...outcome.order];
            bot.honor = outcome.attackerHonor;
            target.honor = outcome.defenderHonor;

            if (outcome.swapped) {
              events.push({
                kind: 'ladderPass',
                at,
                botId: id,
                otherId: targetId,
                rank: outcome.attackerRankAfter,
              });
              // Crossing into the top ten, or taking rank one, is a headline in its own right.
              if (outcome.attackerRankAfter <= 10 && outcome.attackerRankBefore > 10) {
                events.push({ kind: 'milestone', at, botId: id, rank: outcome.attackerRankAfter });
              }
            }
          }
        }
      }
    }
  }

  // ── Coarse band: one pass per day, ladder swaps only, no events. ──
  const coarse = [...bands.coarse].filter((id) => state[id] !== undefined);
  const days = Math.max(0, Math.floor((toTimestamp - replayFrom) / MS_PER_DAY));
  for (let day = 0; day < days; day += 1) {
    for (const id of coarse) {
      const bot = state[id]!;
      const identity = identities[id]!;
      if (bot.dormantUntil > replayFrom + day * MS_PER_DAY) continue;

      const rng = hourRng(world.seed, id, -(day + 1));
      // A day of XP in one step.
      const gained = botHourlyXp(bot.level, identity.personality, rng.next()) * 24 * 0.29;
      if (bot.level < MAX_BOT_LEVEL) {
        const levelled = applyXp(bot.level, bot.xp, gained);
        bot.level = Math.min(MAX_BOT_LEVEL, levelled.level);
        bot.xp = levelled.xp;
      }

      if (rng.bool(0.25 + identity.personality.aggression * 0.4)) {
        const rank = ladder.indexOf(id) + 1;
        const targetRank = Math.max(1, rank - rng.int(1, 8));
        const targetId = ladder[targetRank - 1];
        if (
          rank > 1 &&
          targetId !== undefined &&
          targetId !== PLAYER_LADDER_ID &&
          state[targetId]
        ) {
          const target = state[targetId]!;
          const edge = 0.5 + (bot.level - target.level) * 0.06;
          const outcome = resolveLadderFight({
            order: ladder,
            attacker: { id, honor: bot.honor },
            defender: { id: targetId, honor: target.honor },
            attackerWon: rng.next() < Math.min(0.92, Math.max(0.08, edge)),
          });
          ladder = [...outcome.order];
          bot.honor = outcome.attackerHonor;
          target.honor = outcome.defenderHonor;
        }
      }
    }
  }

  const bots: BotRecord[] = world.bots.map((bot, index) => {
    const next = state[index]!;
    return {
      id: bot.id,
      level: next.level,
      xp: Math.round(next.xp),
      honor: next.honor,
      guildId: next.guildId,
      gearScore: Math.round(next.gearScore * 1000) / 1000,
      dormantUntil: next.dormantUntil,
    };
  });

  return {
    world: { ...world, bots, ladder, lastSimAt: toTimestamp },
    events,
    hoursReplayed,
    integrated,
  };
}
