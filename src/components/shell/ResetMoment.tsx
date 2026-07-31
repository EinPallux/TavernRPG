'use client';

/**
 * The tavern clock striking (daily-loop spec §4).
 *
 * Two beats, and the second one is the reason the first exists. A minute out, the HUD says the
 * clock is about to strike; when it does, a soft full-screen card names what refreshed. Without
 * the warning the card is an interruption; with it, it is an event the player saw coming.
 *
 * **It never yanks an in-progress fight.** A battle is a choreographed scene with its own
 * timeline, and dropping a modal over the middle of one would be the single most annoying thing
 * in the game. The card waits for the scene to end — `suppressed` is passed down from whoever
 * knows a fight is playing, and the moment simply queues behind it.
 *
 * The lines come from `resetLines()`, which reads the same `RESET_SUBJECTS` list the engine
 * walks. A room that starts refreshing at midnight appears here the same day, and one that does
 * not cannot be advertised here by accident.
 */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { msUntilNextReset, resetLines } from '@/engine/reset/resetEngine';
import { gameNow } from '@/state/clock';
import { useGameStore } from '@/state/gameStore';
import { Icon } from '@/components/icons';
import { dramatic, standard } from '@/styles/motion';

/** `[TUNE]` How long before midnight the HUD starts warning (spec §4: 60s). */
export const WARNING_MS = 60_000;
/** How long the card stays up once the day has turned. */
const CARD_MS = 5_200;
/** How often the countdown is checked. A second is plenty for a minute-long warning. */
const TICK_MS = 1_000;

export function ResetMoment({ suppressed = false }: { suppressed?: boolean }) {
  const save = useGameStore((state) => state.save);
  const refreshDay = useGameStore((state) => state.refreshDay);

  const [remaining, setRemaining] = useState<number>(() => msUntilNextReset(gameNow()));
  const [struck, setStruck] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      const left = msUntilNextReset(gameNow());
      setRemaining((previous) => {
        // The wrap is the strike: the countdown jumps from nearly nothing back to a full day.
        if (previous <= TICK_MS * 2 && left > WARNING_MS) {
          setStruck(true);
          refreshDay();
        }
        return left;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [refreshDay]);

  useEffect(() => {
    if (!struck || suppressed) return;
    const id = setTimeout(() => setStruck(false), CARD_MS);
    return () => clearTimeout(id);
  }, [struck, suppressed]);

  const lines = useMemo(() => resetLines(save?.hero?.level ?? 1), [save?.hero?.level]);
  const warning = !struck && remaining <= WARNING_MS;

  if (!save?.hero) return null;

  return (
    <>
      <AnimatePresence>
        {warning && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={standard}
            className="pointer-events-none fixed top-3 left-1/2 z-40 -translate-x-1/2"
            data-testid="reset-warning"
          >
            <span className="chamfer-sm bg-wood-900/95 text-parchment-300 flex items-center gap-2 border border-amber-500/50 px-3 py-1.5 text-xs">
              <motion.span
                animate={{ rotate: [0, 12, -12, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                className="text-amber-500"
              >
                <Icon name="hourglass" size={14} />
              </motion.span>
              The tavern clock strikes soon…
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {struck && !suppressed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={standard}
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-[2px]"
            data-testid="reset-moment"
            onClick={() => setStruck(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.03 }}
              transition={dramatic}
              className="chamfer-lg surface-timber bg-wood-800/98 w-[min(30rem,90vw)] border border-amber-500/45 p-7 text-center"
            >
              {/* The chime, drawn: three rings leaving a bell that is only ever implied. */}
              <span aria-hidden className="relative mx-auto block h-14 w-14">
                {[0, 1, 2].map((ring) => (
                  <motion.span
                    key={ring}
                    initial={{ opacity: 0.7, scale: 0.4 }}
                    animate={{ opacity: 0, scale: 2.1 }}
                    transition={{ duration: 1.6, delay: ring * 0.28, ease: 'easeOut' }}
                    className="absolute inset-0 rounded-[2px] border border-amber-500/70"
                  />
                ))}
                <span className="absolute inset-0 grid place-items-center text-amber-500">
                  <Icon name="hourglass" size={26} />
                </span>
              </span>

              <p className="font-display mt-4 text-2xl font-extrabold text-amber-400">
                A new day in Emberhollow
              </p>

              <ul className="mt-4 space-y-1.5 text-left">
                {lines.map((line, index) => (
                  <motion.li
                    key={line.subject}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...standard, delay: 0.14 + index * 0.06 }}
                    className="text-parchment-500/70 flex items-center gap-2 text-xs"
                  >
                    <span className="h-1 w-1 shrink-0 bg-amber-500/70" />
                    {line.line}
                  </motion.li>
                ))}
              </ul>

              <p className="text-parchment-500/35 mt-4 text-[10px]">Click anywhere to carry on.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
