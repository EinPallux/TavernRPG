'use client';

/**
 * Three notes over the first fight (tutorial spec §2, beat 3).
 *
 * The battle scene is the game's showpiece and also the moment a new player most often decides
 * it is a slot machine: things happen fast, nothing was clicked, and a number went down. Three
 * lines fix that, and they are the *only* three — the fight explains itself after this.
 *
 * **They fire off playback progress, not off events.** Latching onto "the first block" would
 * mean a fight with no block never shows the middle note, and a fight with six of them shows it
 * at whichever one happened to land. Bands over `progress` always fire, always in order, and the
 * copy is written about the *system* rather than about the blow currently on screen, so it is
 * true whatever the dice did. The caller stretches the fight to `CALLOUT_DURATION` and pins it
 * to ×1 so each note gets about four seconds — long enough to read, short enough that a player
 * who is not reading has not lost much.
 *
 * Purely presentational: it takes the frame the scene already computed and draws over it.
 */

import { AnimatePresence, motion } from 'motion/react';
import type { CombatantCard } from '@/engine/combat/types';
import { Icon } from '@/components/icons';
import { duration, standard } from '@/styles/motion';

/**
 * `[TUNE]` How long the tutorial fight runs, in ms.
 *
 * Twice the usual eight-second target. Three notes over eight seconds is a slideshow.
 */
export const CALLOUT_DURATION = 16_000;

interface Callout {
  readonly id: string;
  /** Playback progress window, 0–1. */
  readonly from: number;
  readonly to: number;
  /**
   * Where on the stage the note sits.
   *
   * All three are centred and clear of the fighters, who stand mid-height at the two ends of a
   * capped-width row. A side anchor read fine at 1920 and clipped the hero's portrait as soon as
   * the stage narrowed.
   */
  readonly anchor: 'top' | 'lower' | 'bottom';
  readonly line: (hero: CombatantCard, foe: CombatantCard) => string;
}

const CALLOUTS: readonly Callout[] = [
  {
    id: 'initiative',
    from: 0.06,
    to: 0.26,
    anchor: 'top',
    line: (hero, foe) =>
      `${hero.name} and ${foe.name} did not choose who swings first — Dexterity settled that before the bell.`,
  },
  {
    id: 'procs',
    from: 0.32,
    to: 0.56,
    anchor: 'lower',
    line: (hero) =>
      `Blocks, dodges and misses are ${hero.kind}s rolling their trick each round. You do not aim it; you build it.`,
  },
  {
    id: 'bars',
    from: 0.62,
    to: 0.88,
    anchor: 'bottom',
    line: () =>
      'So the fight is already decided by who walked in. Gear, training and a companion are the whole argument.',
  },
];

const ANCHOR: Record<Callout['anchor'], string> = {
  top: 'top-16 left-1/2 -translate-x-1/2',
  lower: 'bottom-40 left-1/2 -translate-x-1/2',
  bottom: 'bottom-24 left-1/2 -translate-x-1/2',
};

export function BattleCallouts({
  progress,
  hero,
  foe,
  finished,
}: {
  readonly progress: number;
  readonly hero: CombatantCard;
  readonly foe: CombatantCard;
  readonly finished: boolean;
}) {
  const active = finished
    ? null
    : (CALLOUTS.find((entry) => progress >= entry.from && progress < entry.to) ?? null);

  return (
    <AnimatePresence mode="wait">
      {active && (
        <motion.div
          key={active.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ ...standard, opacity: { duration: duration.base } }}
          className={`pointer-events-none absolute z-20 max-w-sm ${ANCHOR[active.anchor]}`}
          data-testid="battle-callout"
          data-callout={active.id}
          role="status"
          aria-live="polite"
        >
          <div className="chamfer-sm surface-parchment bg-parchment-500 edge-etched text-ink-900 flex items-start gap-2.5 px-3.5 py-2.5">
            <span className="mt-0.5 shrink-0 text-amber-700">
              <Icon name="spark" size={14} />
            </span>
            <p className="text-xs leading-snug">{active.line(hero, foe)}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
