'use client';

/**
 * What the second tab shows (architecture.md §3).
 *
 * Not an error, and it should not read like one: opening a game in two tabs is a completely
 * reasonable thing to do, and in most browsers it is an accident of restoring a session. The
 * screen explains the constraint in one sentence, offers the one button that resolves it, and
 * gets out of the way.
 *
 * The button is the point. A guard that says "close the other tab" makes the player go and find
 * it; this one just moves the save here.
 */

import { motion } from 'motion/react';
import { ActionButton } from '@/components/ui/ActionButton';
import { standard } from '@/styles/motion';

export function TabConflict({ onTakeOver }: { readonly onTakeOver: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={standard}
      className="bg-wood-900 grid h-full w-full place-items-center px-8"
      data-testid="tab-conflict"
    >
      <div className="chamfer-md surface-timber bg-wood-800/96 edge-etched max-w-lg border-l-2 border-l-amber-500 px-7 py-6">
        <p className="font-display text-xs tracking-[0.32em] text-amber-500 uppercase">
          Emberhollow
        </p>
        <h1 className="font-display text-parchment-300 mt-1 text-3xl font-extrabold">
          The game is open in another tab
        </h1>

        <p className="text-parchment-500/72 mt-4 text-sm leading-relaxed">
          Only one tab can hold a save at a time. Two would each keep their own version of your hero
          and take turns overwriting the other — you would lose whichever one you were not looking
          at, without being told.
        </p>

        <div className="mt-5">
          <ActionButton onClick={onTakeOver} data-testid="tab-take-over">
            Play here instead
          </ActionButton>
          <p className="text-parchment-500/72 mt-1.5 text-xs leading-snug">
            The other tab steps aside and shows this message instead. Nothing is lost either way.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
