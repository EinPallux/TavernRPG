'use client';

/**
 * Where the thing we are pointing at currently is (tutorial spec §1).
 *
 * The hard part of a spotlight is not drawing the hole, it is that the hole has to keep up. The
 * target it points at is inside a screen that fades in over 240ms, sits in a scroll container,
 * reflows when the window resizes, and — in the tavern's case — is a mission card that changes
 * size when a contract is signed. A rect measured once is wrong within a second.
 *
 * So it re-measures on a `requestAnimationFrame` loop and only re-renders when the numbers
 * actually move. The loop is cheap (`getBoundingClientRect` on one element), runs only while a
 * beat is on screen — the first twenty minutes of a save, once — and stops dead the moment the
 * testid is null. Listeners on `resize`/`scroll` would each miss a case this catches for free:
 * animation, lazy mount, content growing under the player.
 */

import { useEffect, useState } from 'react';

/** A plain rect: `DOMRect` compares by identity, and we need to compare by value. */
export interface SpotRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/** Sub-pixel jitter is not movement — rounding stops a 0.03px reflow re-rendering the overlay. */
function same(a: SpotRect | null, b: SpotRect | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}

function measure(testId: string): SpotRect | null {
  const element = document.querySelector(`[data-testid="${testId}"]`);
  if (!element) return null;

  const box = element.getBoundingClientRect();
  // A zero-size box is an element that exists but has not been laid out (or is display:none
  // inside a collapsed tab). Pointing at it would put the hole in the top-left corner.
  if (box.width < 1 || box.height < 1) return null;

  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

/**
 * Track the element carrying `data-testid={testId}`, or null when there is nothing to track.
 *
 * Returns null while the element is absent, which is the signal the caller needs: a beat whose
 * target is not on this screen should be showing directions, not a spotlight on nothing.
 */
export function useSpotlightRect(testId: string | null): SpotRect | null {
  /*
   * The measurement carries the id it was taken for.
   *
   * Otherwise a beat change hands the new target the old target's rect for a frame — the hole
   * visibly jumps from the last thing to the next one via a position that was never right for
   * either. Comparing the stored id during render costs nothing and cannot go stale.
   */
  const [tracked, setTracked] = useState<{ id: string; rect: SpotRect | null } | null>(null);

  useEffect(() => {
    if (!testId) return;

    let frame = 0;
    let last: SpotRect | null = null;
    let first = true;

    const poll = () => {
      const next = measure(testId);
      if (first || !same(last, next)) {
        first = false;
        last = next;
        setTracked({ id: testId, rect: next });
      }
      frame = requestAnimationFrame(poll);
    };

    // Deferred to the next frame rather than run here: the screen carrying the target is often
    // still mounting, and a measurement taken during the effect would catch it mid-transition.
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [testId]);

  return tracked && tracked.id === testId ? tracked.rect : null;
}
