import { describe, expect, it } from 'vitest';
import { place } from './Tooltip';

/**
 * Where the tooltip lands (style guide §8.1).
 *
 * Placement is the part of a tooltip that is arithmetic rather than taste, and every one of its
 * failures is a rectangle partly off the screen — which a screenshot at one window size will not
 * find, because it depends on where the trigger happens to be. So the geometry is tested directly
 * and the browser test is left to prove the wiring.
 */

const VIEWPORT = { width: 1920, height: 1080 };
const TIP = { width: 200, height: 60 };

/** A trigger somewhere harmless, so each test only varies the thing it is about. */
const middle = { left: 800, top: 400, width: 120, height: 30 };

describe('tooltip placement', () => {
  it('hangs under the trigger, centred on it', () => {
    const spot = place(middle, TIP, VIEWPORT);

    expect(spot.below).toBe(true);
    expect(spot.top).toBe(middle.top + middle.height + 8);
    // 800 + 60 (half the trigger) − 100 (half the tooltip).
    expect(spot.left).toBe(760);
  });

  it('flips above when there is no room below', () => {
    // A chip in the last row of a screen — the Notice Board's bottom cards, the HUD at 768px.
    const low = { left: 800, top: 1020, width: 120, height: 30 };
    const spot = place(low, TIP, VIEWPORT);

    expect(spot.below).toBe(false);
    expect(spot.top).toBe(1020 - 8 - TIP.height);
    expect(spot.top + TIP.height).toBeLessThan(low.top);
  });

  it('pulls back inside the right edge rather than hanging off it', () => {
    // The settings gear lives here, and it is the last thing in the HUD.
    const corner = { left: 1880, top: 20, width: 28, height: 28 };
    const spot = place(corner, TIP, VIEWPORT);

    expect(spot.left + TIP.width).toBeLessThanOrEqual(VIEWPORT.width - 10);
    expect(spot.left).toBe(VIEWPORT.width - TIP.width - 10);
  });

  it('and inside the left edge', () => {
    // Anything in the collapsed nav rail is 36px from the window's edge.
    const rail = { left: 8, top: 300, width: 40, height: 40 };
    const spot = place(rail, TIP, VIEWPORT);

    expect(spot.left).toBe(10);
  });

  it('never goes off-screen even when the tooltip is wider than the window', () => {
    // Not reachable through the UI — `max-w-[19rem]` sees to that — but a clamp whose two bounds
    // can cross is a clamp that produces a negative left, and this is a `Math.min` of two
    // expressions that would.
    const huge = { width: 3000, height: 60 };
    const spot = place(middle, huge, { width: 600, height: 800 });

    expect(spot.left).toBe(10);
  });

  it('keeps a flipped tooltip on screen when the trigger is at the very top', () => {
    // Nothing sits here in practice, but the flip subtracts the tooltip's height from the anchor
    // and that is a subtraction which can go negative.
    const top = { left: 400, top: 4, width: 60, height: 20 };
    const spot = place(top, { width: 200, height: 900 }, { width: 1000, height: 400 });

    expect(spot.top).toBeGreaterThanOrEqual(10);
  });
});
