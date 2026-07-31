'use client';

/**
 * The Next Step chip (tutorial spec §4).
 *
 * **One hint, ever.** `nextHint` ranks the seven rules by how perishable they are and hands back
 * the first that has something to say; this draws it as a single chip in the HUD that goes where
 * it points. A game showing five suggestions has told the player nothing, because ranking five
 * suggestions was the work they wanted help with.
 *
 * Two rules keep it from becoming a nag:
 *
 * - **It waits for the tour to finish.** While a beat is live the spotlight is already saying
 *   what to do next, and two voices giving directions is worse than one.
 * - **Waving it away lasts the day.** The dismissal is stored, and the reset walk clears it at
 *   midnight with everything else — because the key you did not turn yesterday is still an open
 *   door today, and a dismissal that lasted forever would quietly retire the feature.
 */

import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { PLACES_BY_ID } from '@/data/places';
import { activeBeat } from '@/engine/tutorial/beats';
import { nextHint } from '@/engine/tutorial/hints';
import { useGameStore } from '@/state/gameStore';
import { Icon } from '@/components/icons';
import { snappy, standard } from '@/styles/motion';

export function HintChip() {
  const save = useGameStore((state) => state.save);
  const dismissHint = useGameStore((state) => state.dismissHint);
  const router = useRouter();

  // Nothing to say, nobody to say it to, or Marla is already mid-sentence.
  const hint = save && activeBeat(save) === null ? nextHint(save) : null;

  return (
    <AnimatePresence mode="wait">
      {hint && (
        <motion.div
          key={hint.id}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={standard}
          className="chamfer-sm flex max-w-[24rem] min-w-0 items-center gap-2 border border-amber-500/35 bg-amber-500/10 py-1 pr-1 pl-2.5"
          data-testid="hint-chip"
          data-hint={hint.id}
        >
          <motion.span
            aria-hidden
            className="shrink-0 text-amber-400"
            animate={{ opacity: [1, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity, repeatType: 'reverse' }}
          >
            <Icon name="spark" size={13} />
          </motion.span>

          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ y: 1 }}
            transition={snappy}
            onClick={() => router.push(PLACES_BY_ID[hint.place].route)}
            title={`${hint.text} → ${PLACES_BY_ID[hint.place].name}`}
            className="text-parchment-300/85 hover:text-parchment-300 min-w-0 truncate text-xs"
            data-testid="hint-go"
          >
            {hint.text}
          </motion.button>

          <button
            type="button"
            onClick={() => dismissHint(hint.id)}
            aria-label="Dismiss this suggestion"
            title="Not today"
            className="text-parchment-500/72 hover:text-parchment-300 shrink-0 px-1.5 text-sm leading-none transition-colors"
            data-testid="hint-dismiss"
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
