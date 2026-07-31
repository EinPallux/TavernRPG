'use client';

/**
 * The spotlight (tutorial spec §1).
 *
 * A hole in a dim wash, over the one thing the beat is talking about, with the keeper's line
 * beside it. Three decisions are load-bearing:
 *
 * 1. **It does not trap the player.** The whole layer is `pointer-events-none` except the card
 *    itself — the dim is a *look*, not a modal. Every button on the screen stays live, including
 *    the ones the beat is not pointing at, so a player who wants to go and look at the Stables
 *    mid-tutorial simply does. A spotlight you cannot click out of is worse than no tutorial, and
 *    the usual "only the hole is clickable" trick is exactly that trap wearing a helpful face.
 * 2. **The hole is drawn with a box-shadow, not four panels or an SVG mask.** One element,
 *    `0 0 0 100vmax` of shade, so the dim is always exactly the viewport minus the hole with no
 *    seams to line up and nothing to recompute per edge.
 * 3. **The card places itself.** Below the hole where there is room, above it otherwise, clamped
 *    to the viewport — because the same beat has to work at 1366×768 and at 1440p, and a card
 *    that runs off the bottom of the screen is a tutorial that has stopped.
 *
 * Following the target is a CSS transition rather than a spring, and deliberately not subject to
 * the motion preference: a spotlight that lags behind the thing it points at is not a taste, it
 * is wrong. The decorative parts — the entrance, the pulse — go through Motion and obey the
 * shell's `MotionConfig` like everything else.
 */

import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import type { SpotRect } from './useSpotlightRect';
import { duration, snappy, standard } from '@/styles/motion';

/** `[TUNE]` Breathing room between the target's edge and the hole's. */
const PAD = 8;
/** Gap between the hole and the card. */
const GAP = 14;
/** Closest the card ever gets to a viewport edge. */
const MARGIN = 16;
/** Fixed card width — a talking-head card that reflows with its copy reads as unstable. */
const CARD_W = 340;
/** How fast the hole and the card chase a target that moved. */
const TRACK = 'top 220ms cubic-bezier(0.22,1,0.36,1), left 220ms cubic-bezier(0.22,1,0.36,1)';

export interface SpotlightAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface SpotlightProps {
  /**
   * Where to cut the hole.
   *
   * Required, and that is the design. The layer above renders nothing at all when there is no
   * target, so this component can never end up as a card floating over a screen it has no
   * business on — which is exactly what it did before, on top of Vesna's roll buttons.
   */
  readonly rect: SpotRect;
  readonly speaker: string;
  readonly copy: string;
  /** "Step 4 of 12" — orientation, so the tour has a visible end. */
  readonly step: number;
  readonly total: number;
  /** The beat's own button, when it has one ("Got it", "Take me there"). */
  readonly action?: SpotlightAction;
  /** Push it aside for now. Also bound to Escape by the layer above. */
  readonly onHide: () => void;
  /** Leave the tour for good. Always offered — see spec §1 on opt-out. */
  readonly onSkip: () => void;
  /** Extra content under the copy, for a beat that wants to show something as well as say it. */
  readonly children?: ReactNode;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** Viewport size, tracked so the card re-places itself when the window changes. */
function useViewport(): { readonly w: number; readonly h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const read = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);

  return size;
}

export function Spotlight({
  rect,
  speaker,
  copy,
  step,
  total,
  action,
  onHide,
  onSkip,
  children,
}: SpotlightProps) {
  const { w: vw, h: vh } = useViewport();

  /*
   * The card's own height, measured, because *where* it goes depends on how tall it came out.
   *
   * A `ResizeObserver` rather than a dependency list: the copy is not the only thing that can
   * change the height — a wrapped button, a font that loads late, or a child passed in by a beat
   * all do, and none of them are things this component can be asked to list.
   *
   * The node arrives through state rather than a ref, because the first render bails out before
   * the viewport is known and a `useLayoutEffect` keyed on `[]` would run against a ref that was
   * still null and never look again. That left the card measured at zero and parked 40px off the
   * bottom of the screen, which is where the verification run found it.
   */
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(0);

  useLayoutEffect(() => {
    if (!card) return;

    const read = () => setCardH(card.getBoundingClientRect().height);
    read();

    const observer = new ResizeObserver(read);
    observer.observe(card);
    return () => observer.disconnect();
  }, [card]);

  if (vh === 0) return null;

  const hole = {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };

  // Below the hole by default; above once the bottom of the screen has run out.
  const belowTop = hole.top + hole.height + GAP;
  const fitsBelow = belowTop + cardH <= vh - MARGIN;
  const cardTop = fitsBelow
    ? belowTop
    : clamp(hole.top - GAP - cardH, MARGIN, Math.max(MARGIN, vh - cardH - MARGIN));
  const cardLeft = clamp(
    hole.left + hole.width / 2 - CARD_W / 2,
    MARGIN,
    Math.max(MARGIN, vw - CARD_W - MARGIN),
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 z-30"
      data-testid="tutorial-spotlight"
      data-spotlit="yes"
    >
      {/* The wash: one element, `0 0 0 100vmax` of shade, so there are no seams to line up. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: duration.base }}
        className="absolute border border-amber-400/70"
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          boxShadow: '0 0 0 100vmax rgb(6 5 4 / 0.68)',
          borderRadius: 2,
          transition: `${TRACK}, width 220ms cubic-bezier(0.22,1,0.36,1), height 220ms cubic-bezier(0.22,1,0.36,1)`,
        }}
        data-testid="tutorial-hole"
      >
        {/* Corner ticks: the hand-drawn version of a focus ring (style guide §3). */}
        {(
          [
            ['-top-px -left-px', 'border-t-2 border-l-2'],
            ['-top-px -right-px', 'border-t-2 border-r-2'],
            ['-bottom-px -left-px', 'border-b-2 border-l-2'],
            ['-bottom-px -right-px', 'border-b-2 border-r-2'],
          ] as const
        ).map(([corner, edges]) => (
          <span
            key={corner}
            aria-hidden
            className={`absolute h-3.5 w-3.5 border-amber-400 ${corner} ${edges}`}
          />
        ))}

        {/* One slow pulse outward, forever — the "look here" the copy cannot do. */}
        <motion.span
          aria-hidden
          className="absolute -inset-1 border border-amber-400/60"
          style={{ borderRadius: 2 }}
          animate={{ opacity: [0.6, 0], scale: [1, 1.045] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut' }}
        />
      </motion.div>

      {/* The keeper's card — the only thing on this layer that takes a click. */}
      <div
        ref={setCard}
        className="pointer-events-auto absolute"
        style={{ top: cardTop, left: cardLeft, width: CARD_W, transition: TRACK }}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={standard}
          className="chamfer-md surface-parchment bg-parchment-500 edge-etched text-ink-900 relative px-4 py-3.5"
          data-testid="tutorial-card"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-[11px] tracking-[0.22em] text-amber-700/85 uppercase">
              {speaker}
            </p>
            <p className="text-ink-900/40 text-[10px] tabular-nums" data-testid="tutorial-step">
              Step {step} of {total}
            </p>
          </div>

          <p className="mt-1.5 text-sm leading-snug" data-testid="tutorial-copy">
            {copy}
          </p>

          {children}

          <div className="border-ink-900/15 mt-3 flex items-center justify-between gap-3 border-t pt-2.5">
            <button
              type="button"
              onClick={onSkip}
              className="text-ink-900/45 hover:text-ink-900/80 text-[11px] whitespace-nowrap underline underline-offset-2 transition-colors"
              data-testid="tutorial-skip"
            >
              Skip the tour
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onHide}
                className="text-ink-900/45 hover:text-ink-900/80 text-[11px] whitespace-nowrap transition-colors"
                data-testid="tutorial-hide"
              >
                Not now <span className="text-ink-900/30">· Esc</span>
              </button>

              {action && (
                <motion.button
                  type="button"
                  onClick={action.onClick}
                  whileHover={{ y: -1 }}
                  whileTap={{ y: 1, scale: 0.985 }}
                  transition={snappy}
                  className="chamfer-sm text-ink-900 bg-amber-600 px-3 py-1.5 text-xs font-bold whitespace-nowrap hover:bg-amber-500"
                  data-testid="tutorial-action"
                >
                  {action.label}
                </motion.button>
              )}
            </div>
          </div>

          {/* Tail, cut at the same 45° as every other bubble in the game. */}
          <div
            aria-hidden
            className={`bg-parchment-500 absolute h-4 w-4 ${fitsBelow ? '-top-2' : '-bottom-2'}`}
            style={{
              left: clamp(hole.left + hole.width / 2 - cardLeft - 8, 12, CARD_W - 28),
              clipPath: fitsBelow
                ? 'polygon(50% 0, 100% 100%, 0 100%)'
                : 'polygon(0 0, 100% 0, 50% 100%)',
            }}
          />
        </motion.div>
      </div>
    </div>
  );
}
