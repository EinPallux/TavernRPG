'use client';

/**
 * The game's tooltip (style guide §8) — and the end of the native `title=` attribute.
 *
 * A browser tooltip is a small grey OS rectangle in a system font that appears after a second and
 * a half, on hover only, never on focus, and cannot be styled at all. In a game built out of
 * chamfers, timber and Alegreya it is the one piece of another product's interface left on screen.
 * Every `title` in `src/components` is now one of these instead, and `tooltips.test.ts` reads the
 * source to keep it that way.
 *
 * ## How it is put together
 *
 * **One element, at the top of the shell.** `TooltipLayer` mounts once in `AppShell`; triggers only
 * publish to `state/tooltipStore`. That is not tidiness — a tooltip has to draw *outside* the thing
 * it describes, and almost everything in this game wears a `chamfer`, which is a `clip-path`, which
 * clips descendants (style guide §7.2, learned the hard way on the town map). A child tooltip would
 * be silently cut off inside a panel, a rail item or a hotspot. One layer parked at shell level is
 * clipped by nothing and stacks above everything.
 *
 * **Hover waits, focus does not.** 340 ms of hover before it opens, so dragging the cursor across
 * the HUD does not fire six tooltips; but once one is open the next is instant for half a second,
 * which is how a toolbar is meant to feel. Keyboard focus opens immediately — a keyboard user asked
 * for it explicitly and cannot "hover past" anything.
 *
 * **It closes on anything that could move it.** Press, scroll, resize, Escape. The anchor is a rect
 * read once at open time, so a tooltip that outlives its element's position is a tooltip pointing
 * at nothing; shutting is always the right answer and costs the player a re-hover at worst.
 *
 * ## Using it
 *
 *     const gold = useTooltip('Gold');
 *     <span {...gold}>820</span>
 *
 *     const vigor = useTooltip({ title: `Vigor ${v}/${max}`, detail: 'Refills at midnight' });
 *
 * Pass `null`/`undefined` and it returns nothing to spread — a conditional tooltip needs no
 * conditional hook. The trigger keeps its own `onFocus`/`onPointerEnter` if it has them: spread
 * first, then declare yours and call `tip.onFocus?.(event)`.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTooltipStore, type TooltipAnchor, type TooltipContent } from '@/state/tooltipStore';
import { snappy } from '@/styles/motion';

/** `[TUNE]` Hover intent. Long enough to ignore a cursor passing through, short enough to feel like an answer. */
const OPEN_DELAY_MS = 340;

/**
 * `[TUNE]` How long the row stays "warm" after one closes.
 *
 * Within this window the next tooltip opens instantly. Without it, reading along a row of HUD chips
 * means waiting a third of a second at every single one, which reads as the interface being slow
 * rather than as it being deliberate.
 */
const WARM_MS = 600;

/** The single element's id, for `aria-describedby`. Only the live trigger points at it. */
export const TOOLTIP_ID = 'tavern-tooltip';

/** `useLayoutEffect` warns during SSR; every screen is client-rendered but modules still evaluate. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Distance between the trigger's edge and the tooltip. */
const GAP = 8;
/** Closest the tooltip may come to the window's edge. */
const MARGIN = 10;

export type TooltipInput = string | TooltipContent | null | undefined | false;

/**
 * Module-level, deliberately: "did something just close?" is a property of the *pointer*, not of
 * any component, and every trigger has to agree about it or the warm window does nothing.
 */
let lastClosedAt = 0;

/**
 * Every hover timer currently counting down, so that shutting the tooltip can shut the *next* one
 * too.
 *
 * The bug this exists for is a good one. Clicking a button re-renders the panel under a stationary
 * cursor, which fires `pointerover` on whatever moved into that spot and starts its 340 ms timer.
 * Press Escape in that window and the store empties — and then the timer fires and a tooltip
 * appears for something the player never pointed at, *after* they dismissed one. `hideAll()` can
 * only clear what is open; a dismissal has to also cancel what is on its way.
 *
 * (Found by an e2e test asserting Escape closes the rail's tooltip, which instead found the stat
 * row the cursor had been left sitting on after hero creation.)
 */
const pendingOpens = new Set<() => void>();

/**
 * Shut the tooltip and abandon any that were about to open.
 *
 * The one exit used by Escape, scroll and resize — all three mean "the thing this was about to
 * describe is no longer where the player is looking".
 */
export function dismissTooltips(): void {
  for (const cancel of pendingOpens) cancel();
  pendingOpens.clear();
  useTooltipStore.getState().hideAll();
}

function normalize(input: TooltipInput): TooltipContent | null {
  if (!input) return null;
  if (typeof input === 'string') {
    const text = input.trim();
    if (text.length === 0) return null;
    /*
     * "Name — the rest of it" is how this codebase already writes a two-part label, in about half
     * the tooltips it had. Splitting on the em dash gives those a heading and a subtitle for free
     * rather than one long grey line; a caller who wants the dash kept can pass the object form.
     */
    const dash = text.indexOf(' — ');
    if (dash > 0) {
      return { title: text.slice(0, dash), detail: text.slice(dash + 3) };
    }
    return { title: text };
  }
  return input.title.trim().length > 0 ? input : null;
}

export interface TooltipTriggerProps {
  onPointerEnter?: (event: React.PointerEvent<Element>) => void;
  onPointerLeave?: (event: React.PointerEvent<Element>) => void;
  onPointerDown?: (event: React.PointerEvent<Element>) => void;
  onFocus?: (event: React.FocusEvent<Element>) => void;
  onBlur?: (event: React.FocusEvent<Element>) => void;
  'aria-describedby'?: string;
}

/**
 * Props to spread onto whatever should carry the tooltip.
 *
 * Works on any element that emits pointer and focus events — including a `disabled` button, which
 * still fires `pointerenter` even though it will never fire `click`. That matters: "why is this
 * button grey?" is the single most useful tooltip in the game, and it lives on the one element the
 * browser would otherwise refuse to talk about.
 */
export function useTooltip(input: TooltipInput): TooltipTriggerProps {
  const owner = useId();
  const content = useMemo(() => normalize(input), [input]);

  const show = useTooltipStore((state) => state.show);
  const hide = useTooltipStore((state) => state.hide);
  /*
   * Am *I* the one being described right now?
   *
   * `aria-describedby` may only point at an element that exists, and the tooltip exists for about
   * a second at a time — so a trigger that always claims it is describing `#tavern-tooltip` is a
   * dangling reference on every control in the game, which axe reports and screen readers cannot
   * follow. One boolean subscription per trigger, flipping twice per hover, is the whole cost.
   */
  const described = useTooltipStore((state) => state.owner === owner);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pendingOpens.delete(cancelRef.current);
  }, []);

  /*
   * A stable handle on this trigger's own cancel, so `dismissTooltips` can reach into a timer it
   * knows nothing about. A ref rather than the callback itself because `Set.delete` needs the
   * identity that was added, and a `useCallback` identity is only stable until its deps change.
   */
  const cancelRef = useRef<() => void>(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  });

  const open = useCallback(
    (element: Element) => {
      if (!content) return;
      const box = element.getBoundingClientRect();
      const anchor: TooltipAnchor = {
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      };
      show(owner, content, anchor);
    },
    [content, owner, show],
  );

  const close = useCallback(() => {
    cancel();
    if (useTooltipStore.getState().owner === owner) lastClosedAt = performance.now();
    hide(owner);
  }, [cancel, hide, owner]);

  // Nothing is more annoying than a tooltip belonging to a component that has gone.
  useEffect(() => close, [close]);

  return useMemo<TooltipTriggerProps>(() => {
    if (!content) return {};
    return {
      onPointerEnter: (event) => {
        // Touch reports itself as a pointer and then immediately taps; a tooltip on the way in
        // would flash over whatever the tap just opened.
        if (event.pointerType === 'touch') return;
        const element = event.currentTarget;
        cancel();
        if (performance.now() - lastClosedAt < WARM_MS) {
          open(element);
          return;
        }
        pendingOpens.add(cancelRef.current);
        timer.current = setTimeout(() => {
          pendingOpens.delete(cancelRef.current);
          open(element);
        }, OPEN_DELAY_MS);
      },
      onPointerLeave: close,
      // A tooltip that survives the click sits over the thing the click just changed.
      onPointerDown: close,
      onFocus: (event) => {
        cancel();
        open(event.currentTarget);
      },
      onBlur: close,
      ...(described ? { 'aria-describedby': TOOLTIP_ID } : {}),
    };
  }, [content, cancel, close, open, described]);
}

/**
 * Where the tooltip ends up, once it knows how big it is.
 *
 * Exported for its test: this is pure arithmetic about rectangles, and the failure modes — a
 * tooltip hanging off the right edge, one below the fold on a chip in the last row of the HUD —
 * are far cheaper to assert here than to catch by hovering things in a browser at four sizes.
 */
export function place(
  anchor: TooltipAnchor,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number; below: boolean } {
  const below = anchor.top + anchor.height + GAP + size.height + MARGIN <= viewport.height;
  const top = below
    ? anchor.top + anchor.height + GAP
    : Math.max(MARGIN, anchor.top - GAP - size.height);

  // Centred on the trigger, then pulled back inside the window rather than allowed to hang off it.
  const centred = anchor.left + anchor.width / 2 - size.width / 2;
  const left = Math.min(
    Math.max(MARGIN, centred),
    Math.max(MARGIN, viewport.width - size.width - MARGIN),
  );

  return { left, top, below };
}

/**
 * The one tooltip. Mounted once, in `AppShell`, above every room and every ceremony.
 *
 * Position is measured rather than guessed: the element renders hidden at the origin, a layout
 * effect reads its real size and places it, and React commits that before the browser paints — so
 * there is no frame where the tooltip is in the wrong place. Guessing the width from the string
 * length is the version of this that works until somebody writes a longer sentence.
 */
export function TooltipLayer() {
  const content = useTooltipStore((state) => state.content);
  const anchor = useTooltipStore((state) => state.anchor);
  const hideAll = useTooltipStore((state) => state.hideAll);
  const reduceMotion = useReducedMotion();

  /*
   * Anything that moves the anchor closes the tooltip.
   *
   * The rect was read once, at open. A scrolled list or a resized window makes it a label floating
   * beside nothing — and re-measuring on every scroll frame would be a lot of work to keep a hint
   * alive that the player has already stopped looking at. `capture` because most of the game's
   * scrolling happens inside panels, not on the window.
   */
  useEffect(() => {
    const shut = () => dismissTooltips();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissTooltips();
    };
    window.addEventListener('scroll', shut, true);
    window.addEventListener('resize', shut);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('resize', shut);
      window.removeEventListener('keydown', onKey);
    };
  }, [hideAll]);

  return (
    <AnimatePresence>
      {content && anchor && (
        <TooltipBubble
          key={TOOLTIP_ID}
          content={content}
          anchor={anchor}
          reduceMotion={reduceMotion ?? false}
        />
      )}
    </AnimatePresence>
  );
}

function TooltipBubble({
  content,
  anchor,
  reduceMotion,
}: {
  content: TooltipContent;
  anchor: TooltipAnchor;
  reduceMotion: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const spot = useMeasuredPlacement(ref, anchor);

  return (
    <motion.div
      ref={ref}
      id={TOOLTIP_ID}
      role="tooltip"
      data-testid="tooltip"
      data-side={spot?.below === false ? 'above' : 'below'}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: spot?.below === false ? 4 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : snappy}
      style={{
        left: spot?.left ?? 0,
        top: spot?.top ?? 0,
        // Hidden rather than unmounted for the one layout pass it takes to measure itself.
        visibility: spot ? 'visible' : 'hidden',
      }}
      className="pointer-events-none fixed z-[70] max-w-[19rem]"
    >
      <div className="chamfer-sm surface-timber bg-wood-900/97 border border-amber-500/40 px-2.5 py-1.5 shadow-[0_10px_28px_-12px_rgb(0_0_0/0.95)]">
        {/* The facet strip — the same signature accent the panels and meters wear. */}
        <span aria-hidden className="facet-rule mb-1 block opacity-70" />
        <p className="font-display text-parchment-300 text-[12px] leading-tight tracking-[0.06em]">
          {content.title}
        </p>
        {content.detail && (
          <p className="text-parchment-500/72 mt-0.5 max-w-[17rem] text-[11px] leading-snug">
            {content.detail}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Measure, then place — before paint.
 *
 * `useEffect` would place it a frame late, which is visible as a jump from the top-left corner.
 * `useLayoutEffect` runs after the DOM is written and before the browser paints, so the only frame
 * anybody ever sees is the correct one. The state it sets is the placement, keyed on the anchor and
 * the content, so re-opening on a different element re-measures.
 */
function useMeasuredPlacement(
  ref: React.RefObject<HTMLDivElement | null>,
  anchor: TooltipAnchor,
): { left: number; top: number; below: boolean } | null {
  const [spot, setSpot] = useState<{ left: number; top: number; below: boolean } | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    setSpot(
      place(
        anchor,
        { width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor, ref]);

  return spot;
}
