'use client';

/**
 * The roll moment (gacha spec §6): dice tumble, cards land, cards turn.
 *
 * Three beats and a curtain. The dice roll across the table for a beat and a bit, the cards
 * arrive face-down, then they flip **in rhythm with the best one last** — which is the one piece
 * of presentation logic worth writing down, because it is what makes a ten-roll feel like a
 * crescendo rather than a list. Nothing about the ordering touches what was rolled: the results
 * are already in the save, and this only chooses what order to *say* them in.
 *
 * Skippable from the first frame, and reduced-motion collapses the whole thing to the cards
 * face-up. A ceremony that cannot be skipped is a tax on the tenth roll.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { GachaResult } from '@/engine/gacha/roll';
import type { RollExtras } from '@/state/gachaActions';
import { GACHA_PET_NAMES } from '@/data/banners';
import { ActionButton } from '@/components/ui/ActionButton';
import { DiceIcon, SparkIcon } from '@/components/icons';
import { dramatic, standard } from '@/styles/motion';
import { play } from '@/state/sfx';
import { TarotCard, toneOf } from './TarotCard';

/** Tumble, then deal. `[TUNE]` — spec §6 asks for ~1.4s and this is it, split in two. */
const TUMBLE_MS = 900;
const DEAL_MS = 420;
/** Gap between flips in a spread. Slow enough to read, quick enough not to be a queue. */
const FLIP_STEP_MS = 260;

const TONE_ORDER = ['common', 'uncommon', 'rare', 'epic', 'set'] as const;

export interface RollCeremonyProps {
  readonly results: readonly GachaResult[];
  readonly extras: RollExtras;
  readonly onDone: () => void;
}

export function RollCeremony({ results, extras, onDone }: RollCeremonyProps) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<'tumble' | 'dealt'>(reduced ? 'dealt' : 'tumble');
  const [flipped, setFlipped] = useState(reduced ? results.length : 0);

  /*
   * Same ref discipline as the anvil and the descent: the parent re-renders while this is on
   * screen, and an inline callback in a dependency list restarts every timer.
   */
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  /** Weakest first, best last. Presentation only — the save already holds every card. */
  const order = useMemo(() => {
    return results
      .map((result, index) => ({ index, rank: TONE_ORDER.indexOf(toneOf(result)) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.index);
  }, [results]);

  useEffect(() => {
    if (reduced) return;
    const timers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => {
        play('dice');
        setPhase('dealt');
      }, TUMBLE_MS),
    ];
    for (let i = 0; i < results.length; i += 1) {
      timers.push(
        setTimeout(
          () => {
            play('card');
            setFlipped(i + 1);
          },
          TUMBLE_MS + DEAL_MS + i * FLIP_STEP_MS,
        ),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [reduced, results.length]);

  const allFlipped = flipped >= results.length;
  const skip = () => {
    setPhase('dealt');
    setFlipped(results.length);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={standard}
      className="bg-wood-900/94 absolute inset-0 z-40 grid place-items-center overflow-y-auto p-8 backdrop-blur-sm"
      data-testid="roll-ceremony"
      onClick={() => (allFlipped ? done.current() : skip())}
    >
      <div className="flex flex-col items-center gap-6">
        <AnimatePresence mode="wait">
          {phase === 'tumble' ? (
            <motion.div
              key="tumble"
              exit={{ opacity: 0, scale: 0.85 }}
              transition={standard}
              className="grid h-40 w-40 place-items-center"
            >
              {/* Three dice across the felt. Not a spinner — a spinner says "waiting". */}
              {[0, 1, 2].map((index) => (
                <motion.span
                  key={index}
                  className="absolute text-amber-500"
                  initial={{ x: -70, y: -10, rotate: 0, opacity: 0 }}
                  animate={{
                    x: [-70, (index - 1) * 34, (index - 1) * 30],
                    y: [-10, 6, 10],
                    rotate: [0, 300 + index * 120, 360 + index * 120],
                    opacity: [0, 1, 1],
                  }}
                  transition={{ duration: TUMBLE_MS / 1000, ease: 'easeOut' }}
                >
                  <DiceIcon size={34} />
                </motion.span>
              ))}
              <span className="text-parchment-500/72 absolute bottom-0 text-xs tracking-[0.3em] uppercase">
                Shuffling
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="cards"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={standard}
              className="flex max-w-4xl flex-wrap items-center justify-center gap-3"
              data-testid="card-spread"
            >
              {results.map((result, index) => (
                <TarotCard
                  key={index}
                  result={result}
                  index={index}
                  revealed={order.indexOf(index) < flipped}
                  onClick={skip}
                  data-testid={`card-${index}`}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Everything the spin paid on top of the cards themselves. */}
        <AnimatePresence>
          {allFlipped &&
            (extras.rungs.length > 0 || extras.shardRecipes.length > 0 || extras.snail) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...standard, delay: 0.15 }}
                className="flex max-w-xl flex-col gap-2"
                data-testid="roll-extras"
              >
                {extras.rungs.map((rung, index) => (
                  <p
                    key={index}
                    className="chamfer-sm border-arcane-500/45 bg-arcane-500/12 text-parchment-300 flex items-start gap-2 border px-3 py-2 text-xs"
                    data-testid="track-rung"
                  >
                    <SparkIcon size={13} className="mt-0.5 shrink-0 text-amber-400" />
                    <span>
                      <span className="font-semibold">{rung.label}</span> — {rung.detail}
                    </span>
                  </p>
                ))}

                {extras.shardRecipes.map((setId) => (
                  <p
                    key={setId}
                    className="chamfer-sm border-rarity-set/45 bg-rarity-set/12 text-parchment-300 border px-3 py-2 text-xs"
                    data-testid="shard-recipe"
                  >
                    Five shards make a pattern. Torvald has it now.
                  </p>
                ))}

                {extras.snail && (
                  <p
                    className="chamfer-sm border-rarity-set/50 bg-rarity-set/12 text-rarity-set border px-3 py-2 text-xs font-semibold"
                    data-testid="snail-drop"
                  >
                    {GACHA_PET_NAMES['gilded-snail']} came out. One in a hundred, and slower than
                    all of them.
                  </p>
                )}
              </motion.div>
            )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...dramatic, delay: 0.1 }}
        >
          <ActionButton
            size="sm"
            variant={allFlipped ? 'primary' : 'secondary'}
            onClick={(event) => {
              event.stopPropagation();
              if (allFlipped) done.current();
              else skip();
            }}
            data-testid={allFlipped ? 'roll-continue' : 'roll-skip'}
          >
            {allFlipped ? 'Take them' : 'Turn them over'}
          </ActionButton>
        </motion.div>
      </div>
    </motion.div>
  );
}
