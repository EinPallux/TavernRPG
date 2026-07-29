/**
 * The motion system (docs/tech/ui-ux-style-guide.md §7).
 *
 * "Everything that changes, moves; nothing blocks input for more than 400ms except designed
 * ceremonies, and those are skippable." Three springs cover almost everything — reach for a
 * named one rather than inventing timings per component, so the whole game feels like one hand.
 */

import type { Transition, Variants } from 'motion/react';

/** Chips, hovers, toggles — quick and mechanical. */
export const snappy: Transition = { type: 'spring', stiffness: 500, damping: 30 };

/** Panels, place transitions, layout shifts — the default. */
export const standard: Transition = { type: 'spring', stiffness: 380, damping: 32 };

/** Loot reveals, battle beats, ceremonies — weightier, more anticipation. */
export const dramatic: Transition = { type: 'spring', stiffness: 260, damping: 26 };

/** Non-spring timings, in seconds, for opacity/colour crossfades. */
export const duration = {
  instant: 0.08,
  quick: 0.16,
  base: 0.24,
  slow: 0.4,
} as const;

/** Stagger step for lists (mission cards, shop stock, ladder rows). */
export const STAGGER_STEP = 0.04;

export const staggerChildren = (step: number = STAGGER_STEP): Transition => ({
  staggerChildren: step,
});

/** Standard panel entrance: rise and fade. */
export const panelIn: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: standard },
  exit: { opacity: 0, y: -8, transition: { duration: duration.quick } },
};

/** List item entrance, used with `staggerChildren` on the parent. */
export const listItemIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: standard },
};

/**
 * Place-to-place transition. Direction comes from nav-rail order: moving *down* the rail
 * drifts content up, and vice versa, so the town has a consistent sense of geography.
 */
export const placeTransition = {
  enter: (direction: number) => ({ opacity: 0, y: direction >= 0 ? 12 : -12 }),
  center: { opacity: 1, y: 0 },
  exit: (direction: number) => ({ opacity: 0, y: direction >= 0 ? -12 : 12 }),
} satisfies Variants;

/** Press feedback shared by every clickable surface (style guide §7 "feedback floor"). */
export const pressable = {
  whileHover: { y: -1 },
  whileTap: { y: 1, scale: 0.985 },
  transition: snappy,
} as const;
