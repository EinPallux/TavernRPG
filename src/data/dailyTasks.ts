/**
 * The Notice Board's task pool (daily-loop spec §1).
 *
 * Three tasks a day, worth 40/30/30 points, and a chest at 100 — so **all three are required**.
 * That is deliberate and it is the one number in this file worth defending: a board where two of
 * three suffices is a board where the third task is a suggestion, and the point of the third task
 * is to send the player somewhere they were not already going.
 *
 * Two properties the pool has to have, both enforced by the draw rather than by good intentions:
 *
 * 1. **Feature-aware.** A task is never drawn for a room the hero cannot enter. "Win 2 bouts at
 *    the Proving Grounds" at level 4 is not a nudge, it is a locked door with points behind it.
 *    Every entry names the place that must be open, and `gateFor()` is the authority — not a
 *    level written down twice.
 * 2. **Reachable in a day.** Targets are sized against one day's Vigor and the real cooldowns.
 *    A dungeon task asks for one floor, not three, because the delve has a cooldown the player
 *    cannot spend their way past.
 *
 * The weighting nudges toward neglect (see `engine/board/draw.ts`), which is what keeps the board
 * from becoming three variations on "run missions" for a player who only runs missions.
 *
 * Pure data module.
 */

import type { IconId } from './icons';
import type { PlaceId } from './places';
import type { ProgressMetric } from './progress';

/** `[TUNE]` Points per slot, and the chest line. All three tasks are needed (spec §1). */
export const TASK_POINTS = [40, 30, 30] as const;
export const CHEST_AT = 100;
export const TASKS_PER_DAY = TASK_POINTS.length;

/** `[TUNE]` Daily chest claims needed in one week for the weekly chest (spec §1). */
export const WEEKLY_CHEST_AT = 7;

export interface DailyTaskDef {
  readonly id: string;
  readonly metric: ProgressMetric;
  /** How many units clear it. */
  readonly target: number;
  /** `{n}` is filled with the target. */
  readonly title: string;
  /** One line of Marla's voice underneath. */
  readonly blurb: string;
  readonly iconId: IconId;
  /**
   * The room this task sends you to. The draw skips it while that room is locked, and the board
   * links straight there — a task that names a place should be one click from it.
   */
  readonly place: PlaceId;
}

/**
 * The pool.
 *
 * Deliberately more than three per metric family, so two consecutive days rarely read the same
 * even when the weighting picks the same neglected corner twice.
 */
export const DAILY_TASKS: readonly DailyTaskDef[] = [
  // ── The tavern: always available, so the pool can never come up empty. ──
  {
    id: 'contracts-3',
    metric: 'missions',
    target: 3,
    title: 'Finish {n} contracts',
    blurb: 'Marla has three she would rather not read out twice.',
    iconId: 'tankard',
    place: 'tavern',
  },
  {
    id: 'contracts-5',
    metric: 'missions',
    target: 5,
    title: 'Finish {n} contracts',
    blurb: 'A full day of it. The board will be lighter for it.',
    iconId: 'tankard',
    place: 'tavern',
  },
  {
    id: 'level-1',
    metric: 'levelsGained',
    target: 1,
    title: 'Gain {n} level',
    blurb: 'Come back taller than you left.',
    iconId: 'spark',
    place: 'tavern',
  },

  // ── Training: the primary gold sink, and the thing new players forget. ──
  {
    id: 'train-2000',
    metric: 'goldTrained',
    target: 2_000,
    title: 'Spend {n} gold on training',
    blurb: 'Coin in a purse has never won anybody a fight.',
    iconId: 'coin',
    place: 'character',
  },
  {
    id: 'train-6000',
    metric: 'goldTrained',
    target: 6_000,
    title: 'Spend {n} gold on training',
    blurb: 'A serious afternoon with the drillmaster.',
    iconId: 'coin',
    place: 'character',
  },

  // ── The City Watch (level 5). ──
  {
    id: 'patrol-4',
    metric: 'patrolHours',
    target: 4,
    title: 'Bank {n} hours on patrol',
    blurb: 'Hildy will find you something to lean against.',
    iconId: 'patrol',
    place: 'patrol',
  },
  {
    id: 'patrol-8',
    metric: 'patrolHours',
    target: 8,
    title: 'Bank {n} hours on patrol',
    blurb: 'A proper shift. Bring something to eat.',
    iconId: 'patrol',
    place: 'patrol',
  },

  // ── Commerce (level 5–6). ──
  {
    id: 'sell-3',
    metric: 'itemsSold',
    target: 3,
    title: 'Sell {n} pieces of gear',
    blurb: 'Bram is not fussy and neither, today, are you.',
    iconId: 'armory',
    place: 'armory',
  },

  // ── The Menagerie (level 8). ──
  {
    id: 'feed-2',
    metric: 'petsFed',
    target: 2,
    title: 'Feed a companion {n} times',
    blurb: 'Something in the back has been looking at you.',
    iconId: 'paw',
    place: 'menagerie',
  },

  // ── Fortune's Table (level 8). The free card alone clears the small one. ──
  {
    id: 'roll-1',
    metric: 'gachaRolls',
    target: 1,
    title: 'Draw {n} card at Fortune’s Table',
    blurb: 'Vesna has already dealt it. She is only waiting.',
    iconId: 'dice',
    place: 'fortune',
  },
  {
    id: 'roll-3',
    metric: 'gachaRolls',
    target: 3,
    title: 'Draw {n} cards at Fortune’s Table',
    blurb: 'She will pretend not to be pleased.',
    iconId: 'dice',
    place: 'fortune',
  },

  // ── The Proving Grounds (level 10). ──
  {
    id: 'arena-1',
    metric: 'arenaWins',
    target: 1,
    title: 'Win {n} bout in the Proving Grounds',
    blurb: 'One. Hildy is not asking for a tournament.',
    iconId: 'arena',
    place: 'arena',
  },
  {
    id: 'arena-3',
    metric: 'arenaWins',
    target: 3,
    title: 'Win {n} bouts in the Proving Grounds',
    blurb: 'Enough to be worth mentioning in the Crier.',
    iconId: 'arena',
    place: 'arena',
  },

  // ── The Undertavern (level 12). One floor: the delve has a cooldown. ──
  {
    id: 'delve-1',
    metric: 'dungeonFloors',
    target: 1,
    title: 'Clear {n} floor below the tavern',
    blurb: 'Take a torch. Take two.',
    iconId: 'stairsDown',
    place: 'undertavern',
  },

  // ── The Emberforge (level 6). ──
  {
    id: 'scrap-3',
    metric: 'itemsScrapped',
    target: 3,
    title: 'Melt {n} pieces in the crucible',
    blurb: 'Torvald says the bags are not a museum.',
    iconId: 'essence',
    place: 'forge',
  },
  {
    id: 'forge-1',
    metric: 'itemsForged',
    target: 1,
    title: 'Take {n} strike at the anvil',
    blurb: 'The hammer is heavier than it looks. Swing anyway.',
    iconId: 'anvil',
    place: 'forge',
  },

  /*
   * ── The Long Road (level 2). ──
   *
   * Targets deliberately small, because `campaignStages` counts **new ground** — a player sitting
   * at their wall cannot clear a stage today however long they play, and a five-stage task would
   * be an impossible one on exactly the day the road is hardest.
   *
   * Two is right for the ordinary day: the economy sim has an active player taking one to ten new
   * stages a day for the first three months, and a walled player gets the same out that
   * `level-1` already gives a level-90 hero — reroll it, or take the other two.
   */
  {
    id: 'road-2',
    metric: 'campaignStages',
    target: 2,
    title: 'Walk {n} new stages of the road',
    blurb: 'It goes all the way to Frostfell. Not today, obviously.',
    iconId: 'road',
    place: 'campaign',
  },
  {
    id: 'road-4',
    metric: 'campaignStages',
    target: 4,
    title: 'Push {n} stages further out of the gate',
    blurb: 'Four milestones. Nobody is counting but you.',
    iconId: 'road',
    place: 'campaign',
  },

  // ── The Guild Hall (level 10). Only meaningful in a hall; the draw checks that too. ──
  {
    id: 'donate-1000',
    metric: 'goldDonated',
    target: 1_000,
    title: 'Give {n} gold to the treasury',
    blurb: 'The hall notices. It always notices.',
    iconId: 'banner',
    place: 'guild',
  },
];

const BY_ID: Readonly<Record<string, DailyTaskDef>> = Object.fromEntries(
  DAILY_TASKS.map((entry) => [entry.id, entry]),
);

export function dailyTask(id: string): DailyTaskDef | null {
  return BY_ID[id] ?? null;
}

/** The title with its target filled in. */
export function taskTitle(definition: DailyTaskDef): string {
  return definition.title.replace('{n}', definition.target.toLocaleString());
}

/**
 * `[TUNE]` The daily chest (balancing §13).
 *
 * Gold is denominated in Vigor rather than as a flat number so it climbs with the hero the way
 * every other payout does — a fixed 400 gold is a morning's work at level 3 and a rounding error
 * at level 40.
 */
export const DAILY_CHEST = {
  goldVigor: 60,
  essence: 4,
  scrap: 6,
  dice: 1,
} as const;

/** `[TUNE]` The weekly chest: seven daily claims in one week (balancing §13). */
export const WEEKLY_CHEST = {
  dice: 3,
  ale: 2,
  /** A guaranteed Rare, upgraded to Epic this often. */
  epicChance: 0.25,
} as const;
