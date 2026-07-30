'use client';

/**
 * The milestone moment (arena spec §4: "crowd-roar stinger + one-time dice bonus").
 *
 * Rank 500, 100, 10 and 1 happen once each in a hero's whole life, and the game gets exactly one
 * chance to make each of them feel like anything. So the stinger is not a toast — it takes the
 * screen, the crowd is drawn as an expanding roar of light, and the dice land after it.
 *
 * The roar is *visual* because there is no audio layer yet — SFX arrive in Phase 17 with the
 * rest of the sound pass, and this component is where the crowd sample will hang when they do.
 * A silent stinger that reads as a roar is a better placeholder than a missing beat.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DiceIcon, LaurelIcon } from '@/components/icons';
import { dramatic, snappy } from '@/styles/motion';

/** How long the stinger holds before it lets the result screen through. */
const HOLD_MS = 2_600;

const HEADLINE: Readonly<Record<number, string>> = {
  500: 'Top five hundred',
  100: 'Top one hundred',
  10: 'Top ten',
  1: 'Champion of Aldenvale',
};

const SUBTITLE: Readonly<Record<number, string>> = {
  500: 'Half of Aldenvale is behind you.',
  100: 'The Crier has your name.',
  10: 'They will be writing about this one.',
  1: 'There is nobody above you.',
};

export interface MilestoneStingerProps {
  /** The rank crossed, or null for nothing to celebrate. */
  readonly milestone: number | null;
  readonly dice: number;
}

export function MilestoneStinger({ milestone, dice }: MilestoneStingerProps) {
  const reduced = useReducedMotion();
  // Derived rather than mirrored: the stinger is *showing* whenever there is a milestone the
  // hold has not yet retired. Copying `milestone` into state would mean a synchronous setState
  // in an effect, which is a cascading render for no benefit.
  const [held, setHeld] = useState<number | null>(null);
  const showing = milestone !== null && held !== milestone ? milestone : null;

  useEffect(() => {
    if (milestone === null) return;
    const id = setTimeout(() => setHeld(milestone), reduced ? 1_400 : HOLD_MS);
    return () => clearTimeout(id);
  }, [milestone, reduced]);

  return (
    <AnimatePresence>
      {showing !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={snappy}
          className="pointer-events-none absolute inset-0 z-[60] grid place-items-center"
          data-testid="milestone-stinger"
          data-milestone={showing}
        >
          {/* The roar: three rings leaving the centre, staggered, like sound made visible. */}
          {!reduced &&
            [0, 0.12, 0.24].map((delay) => (
              <motion.span
                key={delay}
                initial={{ scale: 0.2, opacity: 0.55 }}
                animate={{ scale: 2.4, opacity: 0 }}
                transition={{ duration: 1.4, delay, ease: 'easeOut' }}
                className="chamfer-lg absolute h-[42vmin] w-[42vmin] border-2 border-amber-400/60"
                aria-hidden
              />
            ))}

          <motion.div
            initial={reduced ? { opacity: 0 } : { scale: 0.6, opacity: 0, rotate: -4 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 1.1, opacity: 0 }}
            transition={dramatic}
            className="chamfer-md bg-wood-900/95 relative flex flex-col items-center border border-amber-500/60 px-10 py-7 text-center shadow-[0_0_80px_-10px_rgb(232_163_61/0.45)]"
          >
            <motion.span
              initial={reduced ? false : { scale: 1.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...snappy, delay: 0.1 }}
              className="text-amber-400"
              aria-hidden
            >
              <LaurelIcon size={54} />
            </motion.span>

            <p className="font-display mt-3 text-xs tracking-[0.4em] text-amber-500 uppercase">
              Rank {showing.toLocaleString()}
            </p>
            <h2 className="font-display text-parchment-300 mt-1 text-3xl font-extrabold">
              {HEADLINE[showing] ?? 'A rank worth keeping'}
            </h2>
            <p className="text-parchment-500/70 mt-1 text-sm">{SUBTITLE[showing] ?? ''}</p>

            {dice > 0 && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...dramatic, delay: 0.55 }}
                className="chamfer-sm mt-4 flex items-center gap-2 border border-amber-500/40 bg-amber-500/12 px-3 py-1.5 text-sm font-bold text-amber-400"
                data-testid="milestone-dice"
              >
                <DiceIcon size={15} />+{dice} Golden {dice === 1 ? 'Die' : 'Dice'}
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
