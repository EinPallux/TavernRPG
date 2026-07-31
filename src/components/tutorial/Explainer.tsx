'use client';

/**
 * A sentence for the moment that needs one, once (tutorial spec §4).
 *
 * Six things happen for the first time somewhere between hour one and week two, long after the
 * twelve beats are done, and each is a moment where the game briefly looks broken to somebody who
 * has not met it before. The dungeon wall is the important one: hitting a floor you cannot beat
 * is the *intended* experience, and it reads as a balance bug unless somebody says so out loud.
 *
 * Two properties, both load-bearing:
 *
 * - **Once, permanently.** `tutorial.seenExplainers` is written the moment it renders, not when
 *   it is dismissed, so a player who closes the tab mid-Epic does not meet it again.
 * - **It never blocks.** These fire in the middle of something else — a loot reveal, a result
 *   screen — so they are a card in the corner of the thing that triggered them, not a modal over
 *   it. Whatever the player was about to click is still there.
 *
 * Mount it with the condition that makes it true; it decides for itself whether to appear.
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { explainer, type ExplainerId } from '@/data/tutorial';
import { useGameStore } from '@/state/gameStore';
import { Icon } from '@/components/icons';
import { dramatic, snappy } from '@/styles/motion';

export function Explainer({
  id,
  when,
  className = '',
}: {
  readonly id: ExplainerId;
  /** Whether the moment this explains is happening right now. */
  readonly when: boolean;
  readonly className?: string;
}) {
  /*
   * `optedOut` is deliberately not consulted.
   *
   * "I have played before" is a claim about the twelve beats, not about the pity floor or the
   * dungeon wall — and a returning player on a fresh save has met neither *in this world*. One
   * sentence each, once each, for everybody.
   */
  const seen = useGameStore((state) => state.save?.tutorial.seenExplainers.includes(id) ?? true);
  const markExplainerSeen = useGameStore((state) => state.markExplainerSeen);
  const definition = explainer(id);

  /*
   * Marked on *show*, not on dismiss.
   *
   * A card that only counts as seen once it is closed comes back after every reload the player
   * happens to do while it is up — and the whole promise is that it fires once. The effect runs
   * after the render that displayed it, which is the honest moment.
   */
  const showing = when && !seen && definition !== null;
  useEffect(() => {
    if (showing) markExplainerSeen(id);
  }, [showing, id, markExplainerSeen]);

  return (
    <AnimatePresence>
      {showing && definition && (
        <motion.aside
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={dramatic}
          className={`chamfer-md surface-parchment bg-parchment-500 edge-etched text-ink-900 relative w-full max-w-sm px-4 py-3 ${className}`}
          data-testid="explainer"
          data-explainer={id}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2.5">
            <motion.span
              aria-hidden
              className="mt-0.5 shrink-0 text-amber-800"
              initial={{ rotate: -20, scale: 0.6 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={snappy}
            >
              <Icon name="spark" size={16} />
            </motion.span>
            <div className="min-w-0">
              <p className="font-display text-[11px] tracking-[0.2em] text-amber-800 uppercase">
                {definition.title}
              </p>
              <p className="mt-1 text-xs leading-snug">{definition.body}</p>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
