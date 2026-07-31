'use client';

/**
 * The forge moment (crafting spec §3): three hammer strikes, then a rarity beam, then the piece.
 *
 * This is the whole reason the Emberforge is a *room* and not a button. A craft is a gamble the
 * player paid materials for, and the rule from the style guide is that anything that changes
 * state moves — a slot machine whose reels do not spin is a spreadsheet.
 *
 * The item is already decided before the first frame: `craft()` ran, the save is written, and
 * this only reveals what happened. That ordering is deliberate — a player who closes the tab
 * mid-animation still owns the item. The ceremony can be skipped and it can be reduced; neither
 * changes the outcome by a single point.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Item } from '@/engine/items/types';
import { RARITY_LABELS } from '@/engine/items/types';
import { ItemCard, rarityStyles } from '@/components/items/ItemCard';
import { ActionButton } from '@/components/ui/ActionButton';
import { Icon, SparkIcon } from '@/components/icons';
import { dramatic, snappy, standard } from '@/styles/motion';
import { lootCue } from '@/data/sfx';
import { play } from '@/state/sfx';

/** Strike beats, in ms from the overlay mounting. Three blows, then the reveal. */
const STRIKES = [140, 520, 900] as const;
const REVEAL_AT = 1_320;

/** The beam behind the item, tinted by what came out. */
const BEAM: Record<string, string> = {
  common: 'from-parchment-500/25',
  uncommon: 'from-rarity-uncommon/40',
  rare: 'from-rarity-rare/45',
  epic: 'from-rarity-epic/55',
  set: 'from-rarity-set/60',
};

export interface AnvilStrikeProps {
  readonly item: Item;
  /** True when the ember meter paid rather than the dice — said out loud, never hidden. */
  readonly pitied: boolean;
  /** A recipe craft that refreshed a completed set, rather than adding a new piece. */
  readonly refresh?: boolean;
  readonly onDone: () => void;
}

export function AnvilStrike({ item, pitied, refresh = false, onDone }: AnvilStrikeProps) {
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState(reduced ? 3 : 0);
  const styles = rarityStyles(item.rarity);

  /*
   * Same ref discipline as the Undertavern descent: the parent re-renders while this is on
   * screen (the wallet is counting down), and an inline callback in the dependency list would
   * restart the timers every time.
   */
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    /*
     * Reduced motion is not reduced *sound*. The overlay opens already revealed, so the reveal
     * cue is all there is to play — skipping it too would quietly make the setting mean
     * something it does not say.
     */
    if (reduced) {
      play(lootCue(item.rarity));
      return;
    }
    const timers = [
      ...STRIKES.map((at, index) =>
        setTimeout(() => {
          play('anvil');
          setBeat(index + 1);
        }, at),
      ),
      setTimeout(() => {
        play(lootCue(item.rarity));
        setBeat(3);
      }, REVEAL_AT),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduced, item.rarity]);

  const revealed = beat >= 3;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={standard}
      className="bg-wood-900/94 absolute inset-0 z-40 grid place-items-center backdrop-blur-sm"
      data-testid="anvil-strike"
      onClick={() => {
        if (revealed) {
          done.current();
          return;
        }
        // Skipping the strikes still lands on the reveal, so it still earns the reveal's cue.
        play(lootCue(item.rarity));
        setBeat(3);
      }}
    >
      <div className="relative grid place-items-center">
        {/* The beam: only after the strikes, and only as bright as the rarity deserves. */}
        <AnimatePresence>
          {revealed && !reduced && (
            <motion.span
              aria-hidden
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ ...dramatic, delay: 0.05 }}
              // Anchored so its bright foot lands just under the card rather than in the middle
              // of the screen: the beam has to read as light *behind the thing*, not a puddle.
              className={`pointer-events-none absolute top-1/2 h-[26rem] w-56 -translate-y-[72%] bg-gradient-to-t ${BEAM[item.rarity] ?? BEAM.common} to-transparent blur-2xl`}
              style={{ transformOrigin: 'bottom' }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div
              key="striking"
              exit={{ opacity: 0, scale: 0.9 }}
              transition={snappy}
              className="relative grid h-56 w-72 place-items-center"
            >
              {/* The hammer. It falls on each beat and the anvil answers in sparks. */}
              <motion.span
                animate={{ rotate: beat % 2 === 0 ? -28 : 6, y: beat % 2 === 0 ? -14 : 6 }}
                transition={{ type: 'spring', stiffness: 900, damping: 18 }}
                className="text-parchment-500/85 absolute -top-2"
                style={{ transformOrigin: 'bottom right' }}
              >
                <Icon name="mace" size={64} />
              </motion.span>

              <motion.span
                key={`flare-${beat}`}
                initial={{ opacity: 0.9, scale: 0.4 }}
                animate={{ opacity: 0, scale: 2.4 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                aria-hidden
                className="bg-ember-600/60 absolute bottom-16 h-16 w-16 rounded-full blur-xl"
              />

              {/* Sparks off the strike — thrown along the bar, not in a tidy circle. */}
              {beat > 0 &&
                [0, 1, 2, 3, 4, 5].map((index) => (
                  <motion.span
                    key={`${beat}-${index}`}
                    aria-hidden
                    initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                    animate={{
                      opacity: 0,
                      x: (index - 2.5) * 46,
                      y: -30 - (index % 3) * 22,
                      scale: 0.3,
                    }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="bg-ember-600 absolute bottom-20 h-1.5 w-1.5"
                  />
                ))}

              <span className="text-parchment-500/72 absolute bottom-2 text-xs tracking-[0.3em] uppercase">
                {beat >= 2 ? 'Quenching' : 'Striking'}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="reveal"
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 22 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={dramatic}
              className="relative flex flex-col items-center gap-3"
              data-testid="craft-reveal"
            >
              <p
                className={`font-display text-xs tracking-[0.4em] uppercase ${styles.text}`}
                data-testid="craft-rarity"
              >
                {RARITY_LABELS[item.rarity]}
              </p>

              <ItemCard item={item} data-testid="craft-item" />

              {pitied && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...standard, delay: 0.25 }}
                  className="chamfer-sm border-ember-600/45 bg-ember-600/12 text-parchment-300 flex items-center gap-2 border px-3 py-1.5 text-xs"
                  data-testid="pity-payout"
                >
                  <SparkIcon size={13} />
                  The ember meter paid out — guaranteed Epic, and it is back to zero.
                </motion.p>
              )}

              {refresh && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...standard, delay: 0.25 }}
                  className="chamfer-sm border-parchment-500/20 bg-wood-900/80 text-parchment-500/72 border px-3 py-1.5 text-xs"
                  data-testid="craft-refresh"
                >
                  The set was already whole — this is a fresh copy at your level.
                </motion.p>
              )}

              <ActionButton size="sm" onClick={() => done.current()} data-testid="craft-continue">
                Take it
              </ActionButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
