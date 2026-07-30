/**
 * The Notice Board, as save-to-save transitions (daily-loop spec §1).
 *
 * Same contract as every other actions module: a `SaveFile` in, a new one out, no clock and no
 * store. What is *not* here is any counting — that all happens in `progressActions.ts`, through
 * the one credit path both this board and the guild bounty read. This module only draws the
 * day's three, quotes the chests and pays them.
 *
 * The two chests are the phase's idempotency risk and they are guarded the way CLAUDE.md's
 * running list says to: **high-water marks, compared rather than incremented.** `lastChestDay`
 * and `lastWeeklyChestWeek` are the seventh and eighth entries in that list. A chest keyed on a
 * day and applied to the save pays twice on reload without one, and it looks perfectly correct
 * the first time.
 */

import { weekKeyFor, type DayKey } from '@/engine/clock';
import { createRng, deriveSeed } from '@/engine/rng';
import { addMaterials } from '@/engine/forge/forgeConfig';
import { generateItem } from '@/engine/items/generate';
import {
  dailyChest,
  quoteDailyChest,
  quoteWeeklyChest,
  weeklyChest,
  type ChestRefusal,
  type DailyChest,
  type WeeklyChest,
} from '@/engine/board/chest';
import {
  drawTasks,
  pointsEarned,
  progressFor,
  tasksFromIds,
  type BoardTask,
  type TaskProgress,
} from '@/engine/board/tasks';
import { CHEST_AT, WEEKLY_CHEST_AT } from '@/data/dailyTasks';
import type { Item } from '@/engine/items/types';
import type { SaveFile } from '@/engine/save/schema';

export type BoardRefusal =
  { readonly kind: 'no-hero' } | { readonly kind: 'chest'; readonly reason: ChestRefusal };

const refuse = (refusal: BoardRefusal) => ({ ok: false as const, refusal });

/* ── Reads ───────────────────────────────────────────────────────────────────────── */

/** The day's three, resolved. Empty before the board has been drawn for today. */
export function tasksToday(save: SaveFile): readonly BoardTask[] {
  return tasksFromIds(save.tasks.taskIds);
}

export interface BoardView {
  readonly tasks: readonly TaskProgress[];
  readonly points: number;
  readonly needed: number;
  /** True when the chest is sitting there unclaimed — the rail's dot reads this. */
  readonly chestReady: boolean;
  readonly chestClaimed: boolean;
  readonly claimsThisWeek: number;
  readonly weeklyNeeded: number;
  readonly weeklyReady: boolean;
  readonly weeklyClaimed: boolean;
}

/** Everything the board screen and the HUD badge need, computed once. */
export function boardView(save: SaveFile, today: DayKey): BoardView {
  const tasks = tasksToday(save).map((task) => progressFor(task, save.tasks.today));
  const points = tasks.reduce((sum, entry) => sum + entry.earned, 0);
  const weekKey = weekKeyFor(today);
  const claims = save.tasks.claimsWeek === weekKey ? save.tasks.claimsThisWeek : 0;

  const chestClaimed = save.tasks.lastChestDay === today;
  const weeklyClaimed = save.tasks.lastWeeklyChestWeek === weekKey;

  return {
    tasks,
    points,
    needed: CHEST_AT,
    chestReady: points >= CHEST_AT && !chestClaimed,
    chestClaimed,
    claimsThisWeek: claims,
    weeklyNeeded: WEEKLY_CHEST_AT,
    weeklyReady: claims >= WEEKLY_CHEST_AT && !weeklyClaimed,
    weeklyClaimed,
  };
}

/** Whether anything on the board wants attention. Drives the nav rail's dot. */
export function boardHasClaim(save: SaveFile, today: DayKey): boolean {
  const view = boardView(save, today);
  return view.chestReady || view.weeklyReady;
}

/* ── The daily draw ──────────────────────────────────────────────────────────────── */

/**
 * Make sure today's three exist.
 *
 * Drawn lazily on first read rather than at midnight, for the same reason the mission board is:
 * a player who never opens the Notice Board never has a stale one to explain, and the draw needs
 * a hero level the reset walk does not necessarily have a use for.
 */
export function ensureTasks(save: SaveFile, today: DayKey): SaveFile {
  if (!save.hero) return save;
  if (save.tasks.drawnFor === today && save.tasks.taskIds.length > 0) return save;

  const drawn = drawTasks({
    worldSeed: save.worldSeed,
    dayKey: today,
    heroLevel: save.hero.level,
    inGuild: save.guild.guildId !== null,
    history: save.tasks.lifetime,
  });

  return {
    ...save,
    tasks: {
      ...save.tasks,
      taskIds: drawn.map((entry) => entry.definition.id),
      drawnFor: today,
    },
  };
}

/**
 * Midnight: a fresh board, an empty tally, and the week's claim count rolled if it is a new week.
 *
 * Called from the one reset walk. The tally is cleared here rather than compared anywhere else —
 * a screen that noticed its own counters were yesterday's would be the independent clock check
 * the whole engine exists to prevent.
 */
export function refreshBoardDay(save: SaveFile, today: DayKey): SaveFile {
  const weekKey = weekKeyFor(today);
  const sameWeek = save.tasks.claimsWeek === weekKey;

  return {
    ...save,
    tasks: {
      ...save.tasks,
      today: {},
      taskIds: [],
      drawnFor: null,
      claimsThisWeek: sameWeek ? save.tasks.claimsThisWeek : 0,
      claimsWeek: weekKey,
    },
  };
}

/* ── The chests ──────────────────────────────────────────────────────────────────── */

export interface DailyClaim {
  readonly ok: true;
  readonly save: SaveFile;
  readonly chest: DailyChest;
  /** True when this claim was the seventh — the weekly chest just became available. */
  readonly unlockedWeekly: boolean;
}

export type DailyClaimResult = DailyClaim | { readonly ok: false; readonly refusal: BoardRefusal };

/** Claim today's chest. One a day, guarded by the day it was last paid. */
export function claimDailyChest(save: SaveFile, today: DayKey): DailyClaimResult {
  const { hero } = save;
  if (!hero) return refuse({ kind: 'no-hero' });

  const points = pointsEarned(tasksToday(save), save.tasks.today);
  const quoted = quoteDailyChest({ points, today, lastChestDay: save.tasks.lastChestDay });
  if (!quoted.ok) return refuse({ kind: 'chest', reason: quoted.refusal });

  const chest = dailyChest(hero.level);
  const weekKey = weekKeyFor(today);
  const sameWeek = save.tasks.claimsWeek === weekKey;
  const claims = (sameWeek ? save.tasks.claimsThisWeek : 0) + 1;

  return {
    ok: true,
    save: {
      ...save,
      hero: {
        ...hero,
        gold: hero.gold + chest.gold,
        dice: hero.dice + chest.dice,
        materials: addMaterials(hero.materials, {
          scrap: chest.scrap,
          essence: chest.essence,
          starmetal: 0,
        }),
      },
      tasks: {
        ...save.tasks,
        lastChestDay: today,
        claimsThisWeek: claims,
        claimsWeek: weekKey,
        totalChests: save.tasks.totalChests + 1,
      },
    },
    chest,
    unlockedWeekly: claims === WEEKLY_CHEST_AT,
  };
}

export interface WeeklyClaim {
  readonly ok: true;
  readonly save: SaveFile;
  readonly chest: WeeklyChest;
  readonly item: Item;
}

export type WeeklyClaimResult =
  WeeklyClaim | { readonly ok: false; readonly refusal: BoardRefusal };

/** Claim the week's chest: seven daily claims, once per week. */
export function claimWeeklyChest(save: SaveFile, today: DayKey): WeeklyClaimResult {
  const { hero } = save;
  if (!hero) return refuse({ kind: 'no-hero' });

  const weekKey = weekKeyFor(today);
  const claims = save.tasks.claimsWeek === weekKey ? save.tasks.claimsThisWeek : 0;
  const quoted = quoteWeeklyChest({
    claimsThisWeek: claims,
    weekKey,
    lastWeeklyChestWeek: save.tasks.lastWeeklyChestWeek,
  });
  if (!quoted.ok) return refuse({ kind: 'chest', reason: quoted.refusal });

  // Seeded on the *week*, so the chest a player opens is fixed the moment they earn it rather
  // than re-rolled by a reload — the same stance the mission board and the shop shelves take.
  const rng = createRng(deriveSeed(save.worldSeed, 'weekly-chest', weekKey), `weekly/${weekKey}`);
  const chest = weeklyChest(rng.fork('rarity'));
  const item = generateItem({
    level: hero.level,
    slot: rng.fork('slot').pick(['weapon', 'chest', 'helmet', 'gloves', 'boots', 'belt']),
    rarity: chest.rarity,
    classId: hero.classId,
    rng: rng.fork('item'),
  });

  return {
    ok: true,
    save: {
      ...save,
      hero: {
        ...hero,
        dice: hero.dice + chest.dice,
      },
      activity: { ...save.activity, alesHeld: save.activity.alesHeld + chest.ale },
      tasks: { ...save.tasks, lastWeeklyChestWeek: weekKey },
    },
    chest,
    item,
  };
}
