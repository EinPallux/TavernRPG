'use client';

/**
 * The client's single GameClock instance.
 *
 * The engine's `GameClock` is the only module that may read wall time; this is the one
 * instance the running game shares, so a mission timer, the HUD countdown and the save
 * stamp all agree — and so a rewound device clock is clamped once, not per component.
 */

import { GameClock, type GameClockSnapshot } from '@/engine/clock';

let clock = new GameClock();

/** Current game time, monotonic. Use this anywhere the UI needs "now". */
export function gameNow(): number {
  return clock.now();
}

export function clockSnapshot(): GameClockSnapshot {
  return clock.snapshot();
}

/** Adopt the high-water mark from a loaded save. */
export function restoreClock(snapshot: GameClockSnapshot): void {
  clock = new GameClock(undefined, snapshot);
}

/** Local day key, the unit every daily reset is compared on. */
export function currentDayKey(): string {
  return clock.dayKey();
}

export function msUntilMidnight(): number {
  return clock.msUntilNextLocalMidnight();
}

/**
 * Every day boundary strictly after `from` and up to `to`.
 *
 * Exposed so the reset engine stays pure — it walks whatever list it is handed rather than
 * owning a calendar of its own (daily-loop spec §4).
 */
export function dayKeysBetween(from: string, to: string): readonly string[] {
  return clock.dayKeysBetween(from, to);
}

export function resetClockForTests(): void {
  clock = new GameClock();
}
