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
import {
  BOUNTIES,
  bountyById,
  bountyTarget,
  bountyTitle,
  type BountyDef,
  type BountyMetric,
} from '@/data/bounties';

/** Share of the target that still pays something (spec §4). */
export const PARTIAL_THRESHOLD = 0.6;
/** What a partial clear is worth, against a full one. */
export const PARTIAL_SHARE = 0.5;

/**
 * `[TUNE]` What a hall of average dedication gets done on its own, as a share of its own target.
 *
 * The single number that decides whether the bounty is co-operative or decorative. Above 1 the
 * hall clears it without the player and the poster is scenery; at the 0.5 it sat at before, the
 * player could not reach the sixty-percent line however hard they worked and the poster was a
 * weekly reminder that they were losing. Just under the partial threshold's opposite shoulder is
 * the interesting place: the hall reliably banks half a chest, and *the player's week is the
 * difference between half and all of it.*
 */
export const HALL_EFFORT = 0.82;

/**
 * Mean dedication across the population (balancing §12: 60% casual, 30% regular, 10% hardcore).
 *
 * Here so `HALL_EFFORT` means what it says. Bot output is per-member and scaled by that member's
 * own dedication, so without dividing the population's average back out, "82%" would silently be
 * "82% of what a *maximally* dedicated hall would do" — which is 40% of the target in practice.
 */
const MEAN_DEDICATION = 0.495;

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
  /**
   * The bounty itself, not just its metric.
   *
   * Bot output used to come off a private per-week table that happened to hold the same numbers
   * as `bounties.ts` — a second copy of the tuning, free to drift, and the reason the hall's week
   * could quietly stop matching the target it was measured against. One table now.
   */
  readonly definition: BountyDef;
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
      const done = dailyUnits(
        options.definition,
        personality.dedication,
        rng.float(0.6, 1.4),
        rng.float(0, 1),
      );
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
 * Read straight off the bounty's own `perMember`, so the hall's week and the target it is judged
 * against can never be tuned apart: change a number in `bounties.ts` and the simulation follows.
 * A member of average dedication does `HALL_EFFORT` of their share; a hardcore one does twice
 * that and a casual one about a third of it, which is what makes *who is in the guild* the thing
 * that decides whether the hall carries its own bounty.
 *
 * **Rounded stochastically, and that is the whole reason this reads correctly.** Most metrics are
 * counted in small whole numbers — three arena wins a week is under half a win a day. Rounding
 * that to a whole number *at all* is a lie in one direction or the other, and flooring it turned
 * the entire hall's week into zero, which is what a 0/44 bounty poster looked like. Carrying the
 * fraction as the *odds* of a whole unit keeps the expected value exactly `daily` while only
 * emitting whole wins — so a full hall produces the ~40 the target was drawn against, and which
 * of them had the good week still varies. Deterministic: the roll is off the day-and-bot seed.
 */
function dailyUnits(
  definition: BountyDef,
  dedication: number,
  noise: number,
  roll: number,
): number {
  // Dedication runs 0.15–1.1. A casual member contributes, just not much.
  const perDay = (definition.perMember * HALL_EFFORT) / MEAN_DEDICATION / 7;
  const daily = perDay * dedication * noise;
  if (definition.metric === 'goldDonated') return Math.round(daily);

  const whole = Math.floor(daily);
  return whole + (roll < daily - whole ? 1 : 0);
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
