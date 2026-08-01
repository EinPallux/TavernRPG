/**
 * The day's work — Vigor spent turned into Golden Dice (balancing §18, tavern spec §2).
 *
 * ## What it is for
 *
 * Golden Dice are earn-only (hard rule 6), and before this the earn rate was about 1.9 a day: one
 * from the Notice Board's chest, three a week from the weekly one, a share of the guild bounty,
 * ten across a 28-day calendar. Ale costs a die and the day holds three of them, so a player who
 * wanted the Vigor was spending their entire premium income on it and never seeing Fortune's
 * Table — and the Long Road made that worse, because a stage is a Vigor sink that pays no dice
 * once its chapter is cleared.
 *
 * So the day's work pays. Every point of Vigor you spend fills a track, and it pays a die at each
 * of `DAY_WORK_RUNGS`.
 *
 * ## Why *Vigor spent* and not something else
 *
 * Because it is the one meter that cannot be farmed. Vigor is the game's hard daily budget —
 * 100 a day, plus at most three Ale — so a track denominated in it has a ceiling that is a
 * *property of the game* rather than a cap somebody remembered to write down. There is no grind
 * that produces a fourth die, no room to sit in, no action to repeat. CLAUDE.md's warning about a
 * published cap the game cannot supply has the mirror image, which is a cap the game can supply
 * infinitely; this design has neither, because the supply and the cap are the same number.
 *
 * It also means the track credits *everything* the player does with their day, at the rate the
 * game already prices those things at. A 20-minute contract moves it four times as far as a
 * 5-minute one, because it cost four times as much. Nothing here needed a new opinion about what
 * an hour of play is worth: `rewards.ts` already had one.
 *
 * ## Replay safety
 *
 * There is no high-water mark, and that is deliberate — CLAUDE.md counts eight of them already.
 * `dicePaidFor(before, after)` is a *difference of two totals*, so the payout is a pure function
 * of the state transition that spent the Vigor and lands in the same store update. Replaying that
 * update cannot double-pay because it recomputes from the same pair of numbers, and a reload
 * cannot pay again because the total it reads is the one already paid for. This is the shape
 * `gacha.monthlyPaidThrough` uses (rungs from a total, never an increment on a boundary), one
 * step further: with the delta available at the call site, the mark itself is unnecessary.
 *
 * Pure module.
 */

import { ALE_PER_DAY, ALE_VIGOR, DAY_WORK_RUNGS, VIGOR_PER_DAY } from './rewards';

/** Dice the whole track is worth in a day. */
export const DAY_WORK_DICE = DAY_WORK_RUNGS.length;

/** The most Vigor a day can hold: the base allowance plus every Ale. */
export const MAX_DAILY_VIGOR = VIGOR_PER_DAY + ALE_PER_DAY * ALE_VIGOR;

/** Dice the track has paid for this much Vigor spent today. Monotone in `spent`. */
export function diceFor(spent: number): number {
  if (!Number.isFinite(spent) || spent <= 0) return 0;
  let earned = 0;
  for (const rung of DAY_WORK_RUNGS) if (spent >= rung) earned += 1;
  return earned;
}

/**
 * Dice owed by a spend that moved the total from `before` to `after`.
 *
 * The whole payout mechanism. Never negative — a caller handing over a refund gets nothing rather
 * than a debt, the same stance `credit()` takes on a negative tally.
 */
export function dicePaidFor(before: number, after: number): number {
  return Math.max(0, diceFor(after) - diceFor(before));
}

export interface DayWorkProgress {
  /** Vigor spent today. */
  readonly spent: number;
  /** Dice the track has already paid. */
  readonly earned: number;
  /** Vigor at which the next die lands, or null once the track is finished. */
  readonly nextAt: number | null;
  /** Vigor still to spend before it does, or null once the track is finished. */
  readonly toGo: number | null;
  /**
   * How full the current step is, 0–1 — for a meter that fills between rungs rather than jumping.
   * Reads 1 on a finished track.
   */
  readonly stepShare: number;
}

/**
 * The track's state, for the surfaces that draw it.
 *
 * Rule 6 says the odds are always visible; the same applies to a payout schedule. The rungs are
 * on screen before the first one pays, not explained afterwards, which is why this returns the
 * next target and the distance to it rather than only what has been banked.
 */
export function dayWorkProgress(spent: number): DayWorkProgress {
  const safe = Math.max(0, Number.isFinite(spent) ? spent : 0);
  const earned = diceFor(safe);
  const nextAt = DAY_WORK_RUNGS[earned] ?? null;

  if (nextAt === null) return { spent: safe, earned, nextAt: null, toGo: null, stepShare: 1 };

  // The step runs from the rung just passed, so the meter restarts at each die rather than
  // creeping toward 100% across the whole day.
  const from = earned === 0 ? 0 : DAY_WORK_RUNGS[earned - 1]!;
  const span = nextAt - from;
  return {
    spent: safe,
    earned,
    nextAt,
    toGo: nextAt - safe,
    stepShare: span <= 0 ? 1 : Math.min(1, Math.max(0, (safe - from) / span)),
  };
}
