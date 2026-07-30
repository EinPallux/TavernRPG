/**
 * The weekly Guild Bounty (guilds spec §4).
 *
 * Posted Monday, judged Sunday, counted from things the hall was doing anyway. The whole point is
 * co-operative: the player alone cannot clear a big hall's bounty and does not have to, and a
 * hall of three is not asked for a hall of twenty-five's numbers because the target is drawn
 * per member.
 *
 * Two rules keep it honest:
 *
 * - **A week is a week key**, the same one the arena payout uses, from `engine/clock.ts`. A
 *   bounty cannot be posted twice for the same week or paid twice for the same clear, however
 *   many times the save is reconciled.
 * - **Bot contribution is simulated, not asserted.** Each member's weekly output comes off their
 *   own dedication, so a hall of slackers genuinely misses bounties and gets ribbed for it in
 *   chat — which is the line in §3 about "who keeps losing us the bounty" being *true*.
 *
 * Pure module.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { weekKeyFor, type DayKey } from '@/engine/clock';
import { botIdentity } from '@/engine/world/identity';
import { PLAYER_LADDER_ID } from '@/engine/world/ladder';
import type { WorldState } from '@/engine/world/generate';
import { BOUNTIES, bountyById, bountyTarget, bountyTitle, type BountyMetric } from '@/data/bounties';

/** Share of the target that still pays something (spec §4). */
export const PARTIAL_THRESHOLD = 0.6;
/** What a partial clear is worth, against a full one. */
export const PARTIAL_SHARE = 0.5;

/** `[TUNE]` the chest, per member, scaled by hero level at payout. */
export const CHEST_GOLD_PER_LEVEL = 120;
export const CHEST_DICE = 1;
export const CHEST_SCRAP = 25;
export const CHEST_ESSENCE = 6;

/**
 * How much a player's own contribution counts for.
 *
 * The target already scales with roster size, so a small hall is asked for less. This is the
 * second, smaller lever the spec asks for: in a hall of three the player *is* the guild and
 * their week should show, while in a full hall of twenty-five they are one voice among many.
 */
export function playerWeight(memberCount: number): number {
  return 1 + Math.max(0, (10 - Math.max(1, memberCount)) / 10);
}

export interface BountyState {
  /** The Sunday this bounty is judged on. Also its identity. */
  readonly weekKey: string;
  readonly bountyId: string;
  readonly target: number;
  /** Raw units contributed by the player, before weighting. */
  readonly playerUnits: number;
  /** Units contributed by the rest of the hall. */
  readonly botUnits: number;
  /** Set once the week has been judged, so a chest is never paid twice. */
  readonly settled: boolean;
}

export interface BountyView {
  readonly weekKey: string;
  readonly title: string;
  readonly blurb: string;
  readonly metric: BountyMetric;
  readonly target: number;
  /** Weighted total, which is what the bar shows. */
  readonly progress: number;
  readonly share: number;
  readonly playerShare: number;
  readonly complete: boolean;
  readonly partial: boolean;
}

/**
 * Draw the week's bounty.
 *
 * Seeded by `(worldSeed, weekKey)` so every member of the hall — and every reload — sees the
 * same one, and so next Monday's is already decided rather than rolled when someone happens to
 * open the screen.
 */
export function drawBounty(worldSeed: number, weekKey: string, memberCount: number): BountyState {
  const rng = createRng(deriveSeed(worldSeed, 'bounty', weekKey), `bounty:${weekKey}`);
  const definition = BOUNTIES[Math.floor(rng.next() * BOUNTIES.length) % BOUNTIES.length]!;

  return {
    weekKey,
    bountyId: definition.id,
    target: bountyTarget(definition, memberCount),
    playerUnits: 0,
    botUnits: 0,
    settled: false,
  };
}

/** The bounty for a day, drawing a fresh one when the week has turned. */
export function bountyForDay(
  worldSeed: number,
  today: DayKey,
  memberCount: number,
  current: BountyState | null,
): BountyState {
  const week = weekKeyFor(today);
  if (current && current.weekKey === week) return current;
  return drawBounty(worldSeed, week, memberCount);
}

export function viewBounty(state: BountyState, memberCount: number): BountyView | null {
  const definition = bountyById(state.bountyId);
  if (!definition) return null;

  const weighted = state.playerUnits * playerWeight(memberCount) + state.botUnits;
  const share = state.target > 0 ? weighted / state.target : 0;

  return {
    weekKey: state.weekKey,
    title: bountyTitle(definition, state.target),
    blurb: definition.blurb,
    metric: definition.metric,
    target: state.target,
    progress: Math.round(weighted),
    share: Math.min(1, share),
    playerShare: weighted > 0 ? (state.playerUnits * playerWeight(memberCount)) / weighted : 0,
    complete: share >= 1,
    partial: share >= PARTIAL_THRESHOLD && share < 1,
  };
}

/** The player did something the bounty counts. */
export function contribute(state: BountyState, metric: BountyMetric, units: number): BountyState {
  const definition = bountyById(state.bountyId);
  if (!definition || definition.metric !== metric || units <= 0 || state.settled) return state;
  return { ...state, playerUnits: state.playerUnits + units };
}

/**
 * What the rest of the hall got done between two moments.
 *
 * Off dedication, so the number is a property of *who is in the guild* rather than a constant.
 * Day-keyed and seeded, so reconciling a week in one pass or seven produces the same total —
 * and, crucially, so it can be recomputed from scratch rather than accumulated. The caller
 * stores the last day rolled; this never adds the same day twice.
 */
export function simulateBotContribution(options: {
  readonly world: WorldState;
  readonly memberIds: readonly number[];
  readonly metric: BountyMetric;
  readonly from: number;
  readonly to: number;
  readonly lastRollDay: number;
}): { readonly units: number; readonly lastRollDay: number; readonly byBot: ReadonlyMap<number, number> } {
  const DAY = 86_400_000;
  const lastDay = Math.floor(options.to / DAY);
  const firstDay = Math.max(Math.floor(options.from / DAY), options.lastRollDay + 1, lastDay - 13);
  const byBot = new Map<number, number>();

  if (options.to <= options.from || firstDay > lastDay) {
    return { units: 0, lastRollDay: Math.max(options.lastRollDay, lastDay), byBot };
  }

  let units = 0;
  for (let dayIndex = firstDay; dayIndex <= lastDay; dayIndex += 1) {
    for (const botId of options.memberIds) {
      if (botId === PLAYER_LADDER_ID) continue;
      const record = options.world.bots[botId];
      if (!record || record.dormantUntil > dayIndex * DAY) continue;

      const { personality } = botIdentity(options.world.seed, botId);
      const rng = createRng(
        deriveSeed(options.world.seed, 'bounty-day', dayIndex, botId),
        `bounty:${dayIndex}:${botId}`,
      );
      const done = dailyUnits(options.metric, personality.dedication, rng.float(0.6, 1.4));
      if (done <= 0) continue;

      units += done;
      byBot.set(botId, (byBot.get(botId) ?? 0) + done);
    }
  }

  return { units, lastRollDay: lastDay, byBot };
}

/**
 * A bot's day, in whatever the bounty counts.
 *
 * Deliberately built off the same `perMember` numbers the targets are: a fully dedicated member
 * does roughly a seventh of their per-member target a day, so a hall of committed players clears
 * a bounty on Saturday and a hall of casuals does not clear it at all.
 */
function dailyUnits(metric: BountyMetric, dedication: number, noise: number): number {
  const perWeek: Readonly<Record<BountyMetric, number>> = {
    missions: 6,
    arenaWins: 3,
    patrolHours: 10,
    itemsScrapped: 4,
    levelsGained: 2,
    goldDonated: 900,
  };
  // Dedication runs 0.15–1.1. A casual member contributes, just not much.
  const daily = (perWeek[metric] / 7) * dedication * noise;
  return metric === 'goldDonated' ? Math.round(daily) : Math.floor(daily + 0.35);
}

export interface BountyChest {
  readonly weekKey: string;
  readonly full: boolean;
  readonly gold: number;
  readonly dice: number;
  readonly scrap: number;
  readonly essence: number;
}

/**
 * Judge the week, once.
 *
 * Returns null when the week is not over, or when it has already been settled — a chest is paid
 * on the Sunday and never again, however many times the day boundary is walked.
 */
export function settleBounty(options: {
  readonly state: BountyState;
  readonly today: DayKey;
  readonly memberCount: number;
  readonly heroLevel: number;
}): BountyChest | null {
  const { state, today, memberCount, heroLevel } = options;
  if (state.settled) return null;
  // The week closes on the day whose key is itself — the same rule the arena payout uses.
  if (today !== state.weekKey) return null;

  const view = viewBounty(state, memberCount);
  if (!view) return null;
  if (!view.complete && !view.partial) {
    return { weekKey: state.weekKey, full: false, gold: 0, dice: 0, scrap: 0, essence: 0 };
  }

  const share = view.complete ? 1 : PARTIAL_SHARE;
  return {
    weekKey: state.weekKey,
    full: view.complete,
    gold: Math.round(CHEST_GOLD_PER_LEVEL * Math.max(1, heroLevel) * share),
    dice: Math.round(CHEST_DICE * share),
    scrap: Math.round(CHEST_SCRAP * share),
    essence: Math.round(CHEST_ESSENCE * share),
  };
}
