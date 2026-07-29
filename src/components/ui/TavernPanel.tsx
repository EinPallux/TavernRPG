'use client';

/**
 * The panel every surface in the game is built from (style guide §3, §8).
 *
 * Chamfered corners instead of radii, an etched dual-line edge, and brass corner brackets
 * drawn as SVG caps — deliberately *not* the stock Kenney frame, which is rounded and would
 * pull the whole UI toward the look we are avoiding.
 */

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { panelIn } from '@/styles/motion';

export type PanelElevation = 'flush' | 'raised' | 'floating';
export type PanelTone = 'timber' | 'parchment';

export interface TavernPanelProps {
  children: ReactNode;
  /** Small-caps heading with a facet rule beneath it. */
  title?: string;
  /** Right-aligned slot in the header (counts, timers, actions). */
  headerSlot?: ReactNode;
  elevation?: PanelElevation;
  tone?: PanelTone;
  /** Animate in on mount. Off for panels that are always present, like the rail. */
  animate?: boolean;
  className?: string;
  bodyClassName?: string;
  'data-testid'?: string;
}

const ELEVATION: Record<PanelElevation, string> = {
  flush: 'edge-etched',
  raised: 'edge-etched shadow-[0_12px_28px_-20px_rgb(0_0_0/0.85)]',
  floating: 'edge-etched-strong',
};

const TONE: Record<PanelTone, string> = {
  timber: 'surface-timber bg-wood-800/92 text-parchment-300',
  parchment: 'surface-parchment bg-parchment-500 text-ink-900',
};

/** Brass bracket, mirrored into the two chamfered corners. */
function Bracket({ corner }: { corner: 'tl' | 'br' }) {
  const isTopLeft = corner === 'tl';
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 18 18"
      className={`pointer-events-none absolute ${isTopLeft ? 'top-0 left-0' : 'right-0 bottom-0 rotate-180'} text-amber-500/55`}
    >
      <path
        d="M17 1H6.2L1 6.2V17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function TavernPanel({
  children,
  title,
  headerSlot,
  elevation = 'raised',
  tone = 'timber',
  animate = true,
  className = '',
  bodyClassName = '',
  ...rest
}: TavernPanelProps) {
  const Wrapper = animate ? motion.section : 'section';
  const motionProps = animate
    ? ({ variants: panelIn, initial: 'hidden', animate: 'visible' } as const)
    : {};

  return (
    <Wrapper
      {...motionProps}
      data-testid={rest['data-testid']}
      className={`chamfer-md relative ${TONE[tone]} ${ELEVATION[elevation]} ${className}`}
    >
      <Bracket corner="tl" />
      <Bracket corner="br" />

      {title && (
        <header className="px-6 pt-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2
              className={`font-display text-lg font-bold tracking-[0.18em] uppercase ${
                tone === 'parchment' ? 'text-ink-900' : 'text-parchment-300'
              }`}
            >
              {title}
            </h2>
            {headerSlot}
          </div>
          <div className="facet-rule mt-2 w-full" />
        </header>
      )}

      <div className={`${title ? 'px-6 pt-4 pb-6' : 'p-6'} ${bodyClassName}`}>{children}</div>
    </Wrapper>
  );
}
