/**
 * GameClock — the only module in the game that reads wall time.
 *
 * Everything else receives timestamps as arguments. This keeps the engine pure and testable,
 * and gives us one place to handle the messy realities of a real-time game running on a
 * device whose clock the player controls (docs/tech/architecture.md §4):
 *
 *  - **Backwards jumps clamp.** Time never moves backwards for the game, so timers can't be
 *    rewound and nothing is ever awarded twice.
 *  - **Forwards jumps are honored.** Missions finish, patrol accrues, resets fire in order —
 *    that is the intended S&F "server feel" (USER_QUESTIONS Q3).
 *  - **Days are compared by local day key** (`YYYY-MM-DD`), never by elapsed hours, so DST
 *    transitions and travel across timezones can't skip or double a daily reset.
 */

export type Timestamp = number;
/** Local calendar day, `YYYY-MM-DD`. The unit all daily resets are keyed on. */
export type DayKey = string;

export interface WallClock {
  now(): Timestamp;
}

/** The real system clock. The single sanctioned `Date.now()` call site in the codebase. */
export const systemWallClock: WallClock = {
  now: () => Date.now(),
};

export interface GameClockSnapshot {
  /** Latest timestamp ever observed, persisted so clock tampering can't rewind progress. */
  readonly lastSeen: Timestamp;
  /** How many times a backwards jump has been clamped (diagnostics only). */
  readonly clampCount: number;
}

const MS_PER_DAY = 86_400_000;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export class GameClock {
  private readonly source: WallClock;
  private lastSeen: Timestamp;
  private clampCount: number;

  constructor(source: WallClock = systemWallClock, snapshot?: Partial<GameClockSnapshot>) {
    this.source = source;
    this.lastSeen = snapshot?.lastSeen ?? 0;
    this.clampCount = snapshot?.clampCount ?? 0;
  }

  /**
   * Current time, clamped to be monotonically non-decreasing.
   * If the device clock moved backwards, the last observed time is returned instead.
   */
  now(): Timestamp {
    const wall = this.source.now();
    if (wall < this.lastSeen) {
      this.clampCount += 1;
      return this.lastSeen;
    }
    this.lastSeen = wall;
    return wall;
  }

  /** Elapsed ms since a past timestamp; never negative. */
  elapsedSince(since: Timestamp): number {
    return Math.max(0, this.now() - since);
  }

  /** Remaining ms until a future timestamp; never negative. */
  remainingUntil(target: Timestamp): number {
    return Math.max(0, target - this.now());
  }

  /** Local day key for a timestamp (defaults to now). */
  dayKey(at: Timestamp = this.now()): DayKey {
    const date = new Date(at);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  isSameDay(a: Timestamp, b: Timestamp): boolean {
    return this.dayKey(a) === this.dayKey(b);
  }

  /** Timestamp of the next local midnight strictly after `at`. */
  nextLocalMidnight(at: Timestamp = this.now()): Timestamp {
    const date = new Date(at);
    date.setHours(24, 0, 0, 0);
    return date.getTime();
  }

  /** Ms until the next local midnight — what the HUD reset countdown renders. */
  msUntilNextLocalMidnight(at: Timestamp = this.now()): number {
    return Math.max(0, this.nextLocalMidnight(at) - at);
  }

  /**
   * Every day boundary crossed strictly after `fromKey` and up to (including) `toKey`.
   * The Reset Engine walks this list so a player returning after nine days gets nine
   * ordered boundaries — not one lump (docs/design/systems/daily-loop-and-retention.md §4).
   *
   * Capped at `maxDays` (default 400) so an absurd clock jump can't hang the load path;
   * when the cap trims the list, the returned keys are the most recent ones.
   */
  dayKeysBetween(fromKey: DayKey, toKey: DayKey, maxDays = 400): DayKey[] {
    const from = parseDayKey(fromKey);
    const to = parseDayKey(toKey);
    if (from === null || to === null || to <= from) return [];

    // Walk backwards from the target so that trimming keeps the *most recent* boundaries:
    // after a long absence the newest days are the ones whose resets still matter.
    // Stepping from local noon keeps the cursor clear of DST edges (shifts are ≤ 1h).
    const startKey = this.dayKey(from);
    const cursor = new Date(to);
    cursor.setHours(12, 0, 0, 0);

    const keys: DayKey[] = [];
    for (let step = 0; step < maxDays; step += 1) {
      const key = this.dayKey(cursor.getTime());
      if (key === startKey) break;
      keys.push(key);
      cursor.setTime(cursor.getTime() - MS_PER_DAY);
    }

    return keys.reverse();
  }

  snapshot(): GameClockSnapshot {
    return { lastSeen: this.lastSeen, clampCount: this.clampCount };
  }
}

/** Parse a `YYYY-MM-DD` key into a local-midnight timestamp; null when malformed. */
export function parseDayKey(key: DayKey): Timestamp | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

/** A clock that reports whatever time the test tells it to. */
export function createFixedWallClock(startAt: Timestamp): WallClock & {
  set(at: Timestamp): void;
  advance(ms: number): void;
} {
  let current = startAt;
  return {
    now: () => current,
    set(at) {
      current = at;
    },
    advance(ms) {
      current += ms;
    },
  };
}
