'use client';

/**
 * "The Armory just opened" (tutorial spec §3).
 *
 * Rooms unlock by level and the rail has always *shown* them coming — a dimmed silhouette with
 * its level tag, which is ambition you can see. What it never did was say the moment one
 * arrived: the player levelled up, a lock quietly turned into an icon, and unless they happened
 * to be looking at that row nothing told them.
 *
 * Renders nothing. It watches the hero's level, and when it climbs it announces every room the
 * climb opened — however many levels it covered at once, which matters because a calendar reward
 * or a big contract can move two at a time.
 *
 * **One watcher, two audiences.** The toast and the rail flourish are the same event seen twice,
 * so the ids go into `shellStore.justUnlocked` and both read from there. A second component
 * tracking the level itself is the shape that drifts.
 */

import { useEffect, useRef } from 'react';
import { placesUnlockedAt } from '@/engine/progression/gates';
import { useGameStore } from '@/state/gameStore';
import { useShellStore } from '@/state/shellStore';

export function UnlockWatcher() {
  const level = useGameStore((state) => state.save?.hero?.level ?? null);
  const pushToast = useShellStore((state) => state.pushToast);
  const noteUnlocks = useShellStore((state) => state.noteUnlocks);

  /*
   * Null until the save lands.
   *
   * The first observation is a *load*, not a level-up, or every returning level-30 player would
   * be told about all fourteen rooms on the way in.
   */
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (level === null) return;

    const before = previous.current;
    previous.current = level;
    if (before === null || level <= before) return;

    const opened = [];
    for (let step = before + 1; step <= level; step += 1) opened.push(...placesUnlockedAt(step));
    if (opened.length === 0) return;

    noteUnlocks(opened.map((place) => place.id));
    for (const place of opened) {
      pushToast({
        // "Now open: X" rather than "X is open", which only reads right for the singular names —
        // the Proving Grounds and the Stables are both plurals wearing one door.
        title: `Now open: ${place.name}`,
        detail: place.blurb,
        tone: 'reward',
        ttl: 7000,
      });
    }
  }, [level, noteUnlocks, pushToast]);

  return null;
}
