'use client';

/**
 * The one tooltip, and who is currently pointing at it.
 *
 * There is exactly one tooltip element in the game (`components/ui/TooltipLayer`), and this is the
 * handful of facts it needs: what to say and where the thing that said it is. Every trigger writes
 * here; nobody renders their own.
 *
 * **Why a store rather than local state per trigger.** A tooltip has to be drawn outside the
 * element it belongs to — over the nav rail's edge, past a panel's `overflow`, and crucially past
 * a `chamfer` (which is a `clip-path`, and a clip path clips descendants; style guide §7.2). One
 * element parked at the top of the shell can do that; thirty nested ones cannot, and each would
 * have to solve the same clipping and stacking problem separately.
 *
 * **Claims are owned.** `hide(owner)` only clears the tip if that owner still has it. Moving the
 * cursor from one chip to the next fires *leave* on the first after *enter* on the second, so an
 * unowned hide would blank the tooltip that had just legitimately opened.
 */

import { create } from 'zustand';

export interface TooltipContent {
  /** The bold line — a name, a number, the thing itself. */
  readonly title: string;
  /** The quiet line under it. Optional; most tooltips are one line. */
  readonly detail?: string;
}

/** Where the trigger is, in viewport coordinates. Read once, on open. */
export interface TooltipAnchor {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TooltipState {
  /** Who opened it — an id, so a stale close cannot shut somebody else's tooltip. */
  readonly owner: string | null;
  readonly content: TooltipContent | null;
  readonly anchor: TooltipAnchor | null;
  readonly show: (owner: string, content: TooltipContent, anchor: TooltipAnchor) => void;
  readonly hide: (owner: string) => void;
  /** Shut whatever is open, whoever owns it — for scroll, resize and route changes. */
  readonly hideAll: () => void;
}

export const useTooltipStore = create<TooltipState>((set, get) => ({
  owner: null,
  content: null,
  anchor: null,
  show: (owner, content, anchor) => set({ owner, content, anchor }),
  hide: (owner) => {
    if (get().owner !== owner) return;
    set({ owner: null, content: null, anchor: null });
  },
  hideAll: () => {
    if (get().owner === null) return;
    set({ owner: null, content: null, anchor: null });
  },
}));
