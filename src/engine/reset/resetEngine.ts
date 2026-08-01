/**
 * The Reset Engine (docs/design/systems/daily-loop-and-retention.md §4).
 *
 * One module owns every daily boundary in the game. The rule it exists to enforce:
 * **no feature checks the clock independently.** That is not tidiness — it is the fix for the
 * classic drift bug where the shop rerolled but the tasks didn't, because two features each
 * decided "is it tomorrow yet?" a few milliseconds apart.
 *
 * Two decisions worth stating outright:
 *
 * 1. **Boundaries are walked, not lumped.** A player returning after nine days gets nine ordered
 *    boundaries. Vigor does not stack (you get one day's worth, not nine), but the login calendar
 *    will need to know how many were missed, and a weekly boundary has to be noticed on the day
 *    it happened. Collapsing the absence into a single "it's a new day" event would make those
 *    impossible to build later without another migration.
 *
 * 2. **Day keys, not elapsed hours.** `YYYY-MM-DD` comparison is the only approach that survives
 *    DST, where a "day" can be 23 or 25 hours long, and it makes the whole module testable with a
 *    fixed clock rather than by waiting for midnight.
 *
 * Pure module: no DOM, no storage, no live clock — the caller passes the time in.
 */

import { weekKeyFor, type DayKey } from '@/engine/clock';
import { isUnlocked } from '@/engine/progression/gates';
import type { PlaceId } from '@/data/places';
import { ALE_PER_DAY, VIGOR_PER_DAY } from '@/engine/progression/rewards';

/** The slice of a save the reset engine may touch. */
export interface ResettableState {
  /** Last day boundary already processed. Null on a save that has never seen one. */
  readonly lastProcessedDay: DayKey | null;
  readonly vigor: number;
  /** Ales drunk today, against `ALE_PER_DAY`. */
  readonly alesToday: number;
  /** Free Ales received today, capped at one (balancing §7). */
  readonly freeAlesToday: number;
  /**
   * Vigor spent today, which the day's-work track turns into dice (balancing §18).
   *
   * Cleared here rather than by the track, for the reason `shops` is cleared here: a feature that
   * notices its own stored day has gone is a second thing deciding it is tomorrow, and
   * `reset/audit.test.ts` exists because those two drift at midnight, in production, and nowhere
   * a behavioural test can see.
   */
  readonly vigorSpentToday: number;
  /** Board rerolls used today; the first each day is free (tavern spec §3). */
  readonly boardRerollsToday: number;
  /** Day key the current mission board was drawn for. */
  readonly boardDay: DayKey | null;
  /**
   * Shop shelves, keyed by shop id (shops spec §1: "restock at midnight").
   *
   * Cleared rather than compared. A shop could perfectly well notice its own stored day is
   * yesterday's — and that is precisely the independent clock check this module exists to
   * prevent. One owner decides it is tomorrow; everything else is told.
   */
  readonly shops: Readonly<Record<string, unknown>>;
}

/**
 * What a crossed boundary refreshed, in the order the ritual shows it (spec §4).
 *
 * A structured ledger rather than a boolean, because two different surfaces need to say what
 * happened and neither should be re-deriving it: the reset-moment card while the tab is open,
 * and the overnight summary on first load. Both read this.
 *
 * Only systems the hero can actually reach appear — telling a level-4 player their Proving
 * Grounds cooldowns refreshed is noise about a door they cannot open.
 */
export const RESET_SUBJECTS = [
  'vigor',
  'board',
  'shops',
  'forge',
  'gacha',
  'pets',
  'tasks',
  'calendar',
  'arena',
] as const;
export type ResetSubject = (typeof RESET_SUBJECTS)[number];

export interface ResetOutcome<T extends ResettableState> {
  readonly state: T;
  /** Boundaries crossed, oldest first. Empty when nothing changed. */
  readonly daysProcessed: readonly DayKey[];
  /** True when at least one boundary was crossed — the cue for the "new day" flourish. */
  readonly didReset: boolean;
  /** Vigor the player forfeited by not spending it. Feeds the "while you slept" card. */
  readonly vigorForfeited: number;
  /**
   * Whole days the player was away, beyond the one that just turned.
   *
   * Zero for an ordinary overnight. The absence card reads this rather than counting
   * `daysProcessed`, because "you were gone for 8 days" and "8 boundaries were walked" are the
   * same number only by coincidence and would stop being so the moment anything is coalesced.
   */
  readonly daysAway: number;
  /**
   * Week boundaries inside the absence — the Sunday keys that closed.
   *
   * Handed out rather than recomputed by each consumer, so the arena payout, the guild bounty
   * and the Notice Board's weekly chest all agree on which weeks ended without three copies of
   * the same `weekKeyFor` walk.
   */
  readonly weeksClosed: readonly string[];
}

/**
 * Advance state to `today`, processing every missed boundary in order.
 *
 * Idempotent: calling it twice with the same day is a no-op, which matters because it runs on
 * every load *and* on a timer while the tab is open.
 */
export function processResets<T extends ResettableState>(
  state: T,
  today: DayKey,
  daysBetween: (from: DayKey, to: DayKey) => readonly DayKey[],
): ResetOutcome<T> {
  const quiet = (next: T): ResetOutcome<T> => ({
    state: next,
    daysProcessed: [],
    didReset: false,
    vigorForfeited: 0,
    daysAway: 0,
    weeksClosed: [],
  });

  // A save that has never been processed adopts today without claiming a reset happened —
  // a brand-new hero has not "missed" anything.
  if (state.lastProcessedDay === null) {
    return quiet({ ...state, lastProcessedDay: today });
  }

  if (state.lastProcessedDay === today) return quiet(state);

  const boundaries = daysBetween(state.lastProcessedDay, today);
  if (boundaries.length === 0) {
    // The clock went backwards, or the keys are out of order. Hold the high-water mark rather
    // than rewinding the player's day — the same stance `GameClock` takes (architecture §Time).
    return quiet(state);
  }

  // Vigor left on the table when the *first* boundary passed. Later boundaries forfeit a full
  // day each, but that is not something the player did — only the first one is theirs.
  const vigorForfeited = Math.max(0, state.vigor);

  return {
    state: {
      ...state,
      lastProcessedDay: boundaries.at(-1)!,
      // One day's worth, however many were missed. Vigor never stacks (tavern spec §2).
      vigor: VIGOR_PER_DAY,
      alesToday: 0,
      freeAlesToday: 0,
      vigorSpentToday: 0,
      boardRerollsToday: 0,
      // The board is stale the moment the day turns; it redraws on next read.
      boardDay: null,
      // Bram and Sela restock overnight. Like the board, the new shelf is drawn lazily on the
      // first visit — a player who never opens the shop never has stale stock to explain.
      shops: {},
    },
    daysProcessed: boundaries,
    didReset: true,
    vigorForfeited,
    // The first boundary is last night; anything beyond it is time the player was away.
    daysAway: boundaries.length - 1,
    weeksClosed: weeksClosedIn(boundaries),
  };
}

/**
 * The Sunday keys inside a run of boundaries, oldest first and never repeated.
 *
 * A day *is* the end of its week when its own week key equals itself — the rule the arena payout
 * and the guild bounty already use independently. Centralising it here is not tidiness: the two
 * had to agree about a fortnight's absence and there was nothing making them.
 */
export function weeksClosedIn(days: readonly DayKey[]): readonly string[] {
  const closed: string[] = [];
  for (const day of days) {
    const week = weekKeyFor(day);
    if (week === day && !closed.includes(week)) closed.push(week);
  }
  return closed;
}

/** What each subject says when it refreshes, and the room it belongs to. */
const SUBJECT_COPY: Readonly<Record<ResetSubject, { place: PlaceId; line: string }>> = {
  vigor: { place: 'tavern', line: 'Vigor back to full' },
  board: { place: 'tavern', line: 'Marla has pinned up fresh contracts' },
  tasks: { place: 'board', line: 'Three new notices on the board' },
  calendar: { place: 'board', line: 'The ledger is waiting for your mark' },
  shops: { place: 'armory', line: 'Bram and Sela have restocked' },
  forge: { place: 'forge', line: 'The crucible has cooled — ten melts again' },
  gacha: { place: 'fortune', line: 'Vesna has a card on the house' },
  pets: { place: 'menagerie', line: 'Twelve empty bowls in the Menagerie' },
  arena: { place: 'arena', line: 'Your bouts and your revenge have reset' },
};

export interface ResetLine {
  readonly subject: ResetSubject;
  readonly line: string;
}

/**
 * The reset ritual's lines, for this hero.
 *
 * Filtered by what the hero can reach: a level-4 player being told their Proving Grounds
 * cooldowns refreshed is being told about a door they cannot open. The order is
 * `RESET_SUBJECTS` — Vigor first because it is the one that decides what the next hour looks
 * like, and everything else in the order you would walk the town.
 */
export function resetLines(heroLevel: number): readonly ResetLine[] {
  return RESET_SUBJECTS.filter((subject) => isUnlocked(SUBJECT_COPY[subject].place, heroLevel)).map(
    (subject) => ({ subject, line: SUBJECT_COPY[subject].line }),
  );
}

/** Vigor ceiling right now: the daily allowance plus whatever Ale has been drunk today. */
export function vigorCeiling(alesToday: number): number {
  return VIGOR_PER_DAY + Math.min(ALE_PER_DAY, Math.max(0, alesToday)) * 20;
}

/** Whether another Ale may be drunk today. */
export function canDrinkAle(alesToday: number): boolean {
  return alesToday < ALE_PER_DAY;
}

/**
 * Milliseconds until the next local midnight — the HUD's reset countdown.
 * Takes `now` rather than reading a clock, so it stays pure and testable.
 */
export function msUntilNextReset(now: number): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - now);
}
