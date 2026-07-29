'use client';

/**
 * A keeper saying something (style guide §8).
 *
 * Marla, Bram, Torvald and the rest speak in short bubbles that appear beside them and fade
 * on their own. Barks tease the *systems*, never the player (style guide §9 rule 7), and they
 * never block input — you can click straight through the tavern while Marla is talking.
 */

import { AnimatePresence, motion } from 'motion/react';
import { standard } from '@/styles/motion';

export interface KeeperBarkProps {
  /** Who is talking, e.g. "Marla". */
  keeper: string;
  /** The line. Null hides the bubble. */
  line: string | null;
  /** Bubble tail side — which side the keeper stands on. */
  side?: 'left' | 'right';
  className?: string;
  'data-testid'?: string;
}

export function KeeperBark({
  keeper,
  line,
  side = 'left',
  className = '',
  ...rest
}: KeeperBarkProps) {
  return (
    <AnimatePresence mode="wait">
      {line && (
        <motion.div
          key={line}
          data-testid={rest['data-testid']}
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={standard}
          className={`pointer-events-none max-w-sm ${className}`}
          aria-live="polite"
        >
          <div className="chamfer-sm surface-parchment bg-parchment-500 edge-etched text-ink-900 relative px-4 py-3">
            <p className="font-display text-[11px] tracking-[0.22em] text-amber-700/80 uppercase">
              {keeper}
            </p>
            <p className="mt-1 text-sm leading-snug">{line}</p>

            {/* Bubble tail, cut at the same 45° as the chamfers. */}
            <div
              aria-hidden
              className={`bg-parchment-500 absolute -bottom-2 h-4 w-4 ${
                side === 'left' ? 'left-6' : 'right-6'
              }`}
              style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
