/**
 * The two chests (daily-loop spec §1, balancing §13).
 *
 * The daily chest is the **dice paycheck** — one Golden Die a day, every day, for a player who
 * clears their board. That is where the F2P promise actually lives: dice are never purchasable
 * (rule 6), so the only thing standing between a player and Fortune's Table is turning up. If
 * this number moves, the whole premium currency moves with it.
 *
 * The weekly chest needs seven daily claims in the same week — perfect attendance, deliberately.
 * Six-of-seven would be the kinder rule and the wrong one: a weekly bonus you get most weeks is
 * a weekly bonus you stop noticing, and the calendar is already the system that forgives.
 *
 * **Both are paid against a high-water mark, not a flag.** `tasks.lastChestDay` and
 * `tasks.lastWeeklyChestWeek` are the fifth and sixth entries in CLAUDE.md's list of these, and
 * they exist for the same reason the others do: a day-keyed thing that is *applied* to the save
 * must record what it paid, or a reload pays it again.
 *
 * Pure module.
 */

import { goldPerVigor } from '@/engine/progression/rewards';
import { CHEST_AT, DAILY_CHEST, WEEKLY_CHEST, WEEKLY_CHEST_AT } from '@/data/dailyTasks';
import type { RngStream } from '@/engine/rng';
import type { Rarity } from '@/engine/items/types';

export interface DailyChest {
  readonly gold: number;
  readonly dice: number;
  readonly essence: number;
  readonly scrap: number;
}

export interface WeeklyChest {
  readonly dice: number;
  readonly ale: number;
  readonly rarity: Extract<Rarity, 'rare' | 'epic'>;
}

/** What today's chest holds, at this level. Pure arithmetic — no roll, nothing to replay. */
export function dailyChest(heroLevel: number): DailyChest {
  return {
    gold: Math.round(DAILY_CHEST.goldVigor * goldPerVigor(heroLevel)),
    dice: DAILY_CHEST.dice,
    essence: DAILY_CHEST.essence,
    scrap: DAILY_CHEST.scrap,
  };
}

/**
 * The weekly chest's contents.
 *
 * The only roll in either chest, and it decides *rarity* rather than whether anything arrives —
 * the same stance the forge and the loot tables take. A guaranteed Rare, upgraded to Epic a
 * quarter of the time.
 */
export function weeklyChest(rng: RngStream): WeeklyChest {
  return {
    dice: WEEKLY_CHEST.dice,
    ale: WEEKLY_CHEST.ale,
    rarity: rng.bool(WEEKLY_CHEST.epicChance) ? 'epic' : 'rare',
  };
}

export type ChestRefusal =
  | { readonly kind: 'already-claimed' }
  | { readonly kind: 'not-earned'; readonly points: number; readonly needed: number };

/**
 * Whether today's chest is claimable, or why not.
 *
 * Quoted before it is paid, the same contract every other room in the game uses: the button the
 * player reads and the action that refuses them are decided by one function.
 */
export function quoteDailyChest(options: {
  readonly points: number;
  readonly today: string;
  readonly lastChestDay: string | null;
}): { readonly ok: true } | { readonly ok: false; readonly refusal: ChestRefusal } {
  if (options.lastChestDay === options.today) {
    return { ok: false, refusal: { kind: 'already-claimed' } };
  }
  if (options.points < CHEST_AT) {
    return { ok: false, refusal: { kind: 'not-earned', points: options.points, needed: CHEST_AT } };
  }
  return { ok: true };
}

export function quoteWeeklyChest(options: {
  readonly claimsThisWeek: number;
  readonly weekKey: string;
  readonly lastWeeklyChestWeek: string | null;
}): { readonly ok: true } | { readonly ok: false; readonly refusal: ChestRefusal } {
  if (options.lastWeeklyChestWeek === options.weekKey) {
    return { ok: false, refusal: { kind: 'already-claimed' } };
  }
  if (options.claimsThisWeek < WEEKLY_CHEST_AT) {
    return {
      ok: false,
      refusal: {
        kind: 'not-earned',
        points: options.claimsThisWeek,
        needed: WEEKLY_CHEST_AT,
      },
    };
  }
  return { ok: true };
}

export { CHEST_AT, WEEKLY_CHEST_AT };
