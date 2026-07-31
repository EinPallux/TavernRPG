/**
 * Marla's ledger — the 28-day login calendar (daily-loop spec §2).
 *
 * **Missing a day pauses the calendar; it never resets it.** That is the whole design, and it is
 * a position rather than a convenience: a 28-day chain that snaps on day 19 punishes a player for
 * having a life, and the punishment lands hardest on exactly the lapsed player you were hoping to
 * get back. Here, day 19 is still day 19 tomorrow. The cycle is a *count of days attended*, not a
 * streak, which means the engine that advances it cannot have a "break the streak" branch —
 * there is nowhere to put one.
 *
 * The cadence climbs unevenly on purpose. A ledger that pays the same every day is a ledger you
 * stop reading; the dice on 7, 14 and 21 and the Epic on 28 are the beats you can see coming from
 * a week out.
 *
 * Pure data module.
 */

import type { IconId } from './icons';

/** `[TUNE]` The cycle length. Day 28 closes it and the next one starts refreshed. */
export const CALENDAR_DAYS = 28;

/**
 * What one square pays.
 *
 * Gold is denominated in **Vigor** rather than as a flat number, so the ledger climbs with the
 * hero exactly as missions and the daily chest do. A flat 600 gold is a good morning at level 4
 * and an insult at level 40, and a login reward that decays into an insult is worse than none.
 */
export interface CalendarRewardDef {
  readonly day: number;
  /** Multiplied by `goldPerVigor(level)`. Zero on the squares that pay something else. */
  readonly goldVigor: number;
  readonly essence?: number;
  readonly scrap?: number;
  readonly starmetal?: number;
  readonly dice?: number;
  readonly ale?: number;
  /** Tavern Scraps for the Menagerie (pets spec §2). */
  readonly petScraps?: number;
  /** A guaranteed item of this rarity. Day 28 only. */
  readonly item?: 'rare' | 'epic';
  /** Shown on the square. Short — twenty-eight of these are on screen at once. */
  readonly label: string;
  readonly iconId: IconId;
}

/**
 * `[TUNE]` The 28 squares (balancing §13).
 *
 * Dice land on 7 / 14 / 21 and the cycle closes with an Epic on 28. Everything between is gold,
 * materials, Ale and Tavern Scraps in a cadence that never pays *nothing* — a blank square in a
 * login calendar reads as a bug even when it is a design.
 */
export const CALENDAR: readonly CalendarRewardDef[] = [
  { day: 1, goldVigor: 20, label: 'Gold', iconId: 'coin' },
  { day: 2, goldVigor: 0, scrap: 4, label: '4 Scrap', iconId: 'scrap' },
  { day: 3, goldVigor: 25, label: 'Gold', iconId: 'coin' },
  { day: 4, goldVigor: 0, petScraps: 3, label: '3 Tavern Scraps', iconId: 'paw' },
  { day: 5, goldVigor: 0, essence: 5, label: '5 Essence', iconId: 'essence' },
  { day: 6, goldVigor: 30, label: 'Gold', iconId: 'coin' },
  { day: 7, goldVigor: 0, dice: 2, label: '2 Golden Dice', iconId: 'dice' },

  { day: 8, goldVigor: 25, label: 'Gold', iconId: 'coin' },
  { day: 9, goldVigor: 0, ale: 1, label: 'A pint of Ale', iconId: 'tankard' },
  { day: 10, goldVigor: 0, scrap: 8, label: '8 Scrap', iconId: 'scrap' },
  { day: 11, goldVigor: 35, label: 'Gold', iconId: 'coin' },
  { day: 12, goldVigor: 0, petScraps: 4, label: '4 Tavern Scraps', iconId: 'paw' },
  { day: 13, goldVigor: 0, essence: 8, label: '8 Essence', iconId: 'essence' },
  { day: 14, goldVigor: 0, dice: 3, label: '3 Golden Dice', iconId: 'dice' },

  { day: 15, goldVigor: 30, label: 'Gold', iconId: 'coin' },
  { day: 16, goldVigor: 0, starmetal: 1, label: '1 Starmetal', iconId: 'starmetal' },
  { day: 17, goldVigor: 0, ale: 1, label: 'A pint of Ale', iconId: 'tankard' },
  { day: 18, goldVigor: 40, label: 'Gold', iconId: 'coin' },
  { day: 19, goldVigor: 0, essence: 10, label: '10 Essence', iconId: 'essence' },
  { day: 20, goldVigor: 0, petScraps: 5, label: '5 Tavern Scraps', iconId: 'paw' },
  { day: 21, goldVigor: 0, dice: 3, label: '3 Golden Dice', iconId: 'dice' },

  { day: 22, goldVigor: 35, label: 'Gold', iconId: 'coin' },
  { day: 23, goldVigor: 0, scrap: 12, label: '12 Scrap', iconId: 'scrap' },
  { day: 24, goldVigor: 0, ale: 2, label: '2 pints of Ale', iconId: 'tankard' },
  { day: 25, goldVigor: 45, label: 'Gold', iconId: 'coin' },
  { day: 26, goldVigor: 0, starmetal: 2, label: '2 Starmetal', iconId: 'starmetal' },
  { day: 27, goldVigor: 0, essence: 14, label: '14 Essence', iconId: 'essence' },
  {
    day: 28,
    goldVigor: 0,
    item: 'epic',
    dice: 2,
    label: 'An Epic, and the Moss Tortoise',
    iconId: 'trophy',
  },
];

export function calendarReward(day: number): CalendarRewardDef {
  const index = Math.min(CALENDAR_DAYS, Math.max(1, Math.floor(day))) - 1;
  return CALENDAR[index]!;
}

/** Which squares are worth telling the player about in advance (the "coming up" line). */
export function isMilestone(day: number): boolean {
  const reward = calendarReward(day);
  return Boolean(reward.dice) || Boolean(reward.item);
}

/** The next milestone at or after `day`, or null past the last one. */
export function nextMilestone(day: number): CalendarRewardDef | null {
  for (let candidate = day; candidate <= CALENDAR_DAYS; candidate += 1) {
    if (isMilestone(candidate)) return calendarReward(candidate);
  }
  return null;
}
