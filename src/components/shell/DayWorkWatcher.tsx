'use client';

/**
 * "That's a day's work — a Golden Die" (balancing §18).
 *
 * Renders nothing. It watches how much Vigor has been spent today, and announces every rung of
 * the day's-work track the spending crossed.
 *
 * **A watcher rather than a return value**, deliberately, for the reason `UnlockWatcher` is one.
 * Two places spend Vigor and each could have handed a `dayWorkDice` back up to its screen, which
 * is two paths for one announcement and a third the day somebody adds a third spender. Derived
 * from the save, it cannot be forgotten: if `vigorSpentToday` moved past a rung, the player is
 * told, whatever moved it and whichever room they were standing in.
 *
 * **The first observation is a load, not an earning.** Seeded from whatever the save already
 * holds, so reopening the tab at 120 Vigor spent announces nothing — the same rule the unlock
 * watcher needs, and the same bug if it were missing (a reload paying out its own history is the
 * shape CLAUDE.md lists eight high-water marks for).
 */

import { useEffect, useRef } from 'react';
import { diceFor, DAY_WORK_DICE } from '@/engine/progression/dayWork';
import { useGameStore } from '@/state/gameStore';
import { useShellStore } from '@/state/shellStore';
import { play } from '@/state/sfx';

export function DayWorkWatcher() {
  const spent = useGameStore((state) => state.save?.activity.vigorSpentToday ?? null);
  const pushToast = useShellStore((state) => state.pushToast);

  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (spent === null) return;

    const earned = diceFor(spent);
    const before = previous.current;
    previous.current = earned;
    if (before === null || earned <= before) return;

    const gained = earned - before;
    play('dice');
    pushToast({
      title: gained === 1 ? 'A Golden Die' : `${gained} Golden Dice`,
      detail:
        earned >= DAY_WORK_DICE
          ? "The day's work, finished. Marla settles up."
          : `The day's work — ${earned} of ${DAY_WORK_DICE} today.`,
      tone: 'premium',
      ttl: 6000,
    });
  }, [spent, pushToast]);

  return null;
}
