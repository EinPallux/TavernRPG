'use client';

/**
 * The day's work, drawn (balancing §18).
 *
 * Three pips and a meter: Vigor spent today, the dice it has paid, and how far the next one is.
 * One component because the track shows up in three places — the Gilded Tankard beside the Ale
 * button, the Notice Board's ledger, and the HUD's Vigor tooltip in words — and the game has
 * already learned twice what happens when a second surface keeps its own copy of a number (the
 * guild bounty's targets, the forge tile's odds). Everything here is `dayWorkProgress()`.
 *
 * **The schedule is on screen before it pays, not explained afterwards.** Rule 6 is about odds,
 * but the principle is the same for a payout ladder: a player should be able to see that spending
 * fifty Vigor earns a die *while deciding whether to*, which is the only moment the information
 * is worth anything.
 */

import { motion, useReducedMotion } from 'motion/react';
import { DiceIcon } from '@/components/icons';
import { useTooltip } from './Tooltip';
import { dayWorkProgress, DAY_WORK_DICE } from '@/engine/progression/dayWork';
import { DAY_WORK_RUNGS } from '@/engine/progression/rewards';
import { snappy } from '@/styles/motion';

export interface DayWorkTrackProps {
  /** Vigor spent today — `activity.vigorSpentToday`. */
  readonly spent: number;
  /** `full` for a room panel, `compact` for a strip beside a button. */
  readonly variant?: 'full' | 'compact';
}

/** One sentence of it, for a tooltip or a bark. */
export function dayWorkLine(spent: number): string {
  const track = dayWorkProgress(spent);
  if (track.toGo === null) return `The day's work is done — all ${DAY_WORK_DICE} dice earned.`;
  return `${Math.ceil(track.toGo)} more Vigor spent earns a Golden Die (${track.earned}/${DAY_WORK_DICE} today).`;
}

export function DayWorkTrack({ spent, variant = 'full' }: DayWorkTrackProps) {
  const track = dayWorkProgress(spent);
  const reduceMotion = useReducedMotion();
  const tip = useTooltip({
    title: "The day's work",
    detail: `A Golden Die at ${DAY_WORK_RUNGS.join(', ')} Vigor spent. ${Math.floor(track.spent)} spent so far.`,
  });

  return (
    <div
      className={variant === 'full' ? 'w-full' : 'w-full max-w-[16rem]'}
      data-testid="day-work"
      data-earned={track.earned}
      data-spent={Math.floor(track.spent)}
      {...tip}
      tabIndex={0}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-parchment-300 text-[11px] tracking-[0.18em] uppercase">
          The day&rsquo;s work
        </p>
        <p className="text-parchment-500/80 text-[11px] tabular-nums">
          {Math.floor(track.spent)} Vigor spent
        </p>
      </div>

      {/* The rungs as pips, so "three dice a day" is a shape rather than a sentence. */}
      <div className="mt-1.5 flex items-center gap-1.5">
        {DAY_WORK_RUNGS.map((rung, index) => {
          const paid = index < track.earned;
          const active = index === track.earned;
          return (
            <div key={rung} className="flex flex-1 items-center gap-1.5">
              <div className="bg-wood-900/80 relative h-1.5 flex-1 overflow-hidden">
                <motion.span
                  className={`absolute inset-y-0 left-0 ${paid ? 'bg-amber-500' : 'bg-amber-500/70'}`}
                  initial={false}
                  animate={{ scaleX: paid ? 1 : active ? track.stepShare : 0 }}
                  style={{ width: '100%', transformOrigin: 'left' }}
                  transition={reduceMotion ? { duration: 0 } : snappy}
                />
              </div>
              <motion.span
                aria-hidden
                className={paid ? 'text-amber-400' : 'text-parchment-500/30'}
                initial={false}
                // A die that lands settles rather than appearing: hard rule 3, at pip scale.
                animate={paid && !reduceMotion ? { scale: [1.5, 1], rotate: [-18, 0] } : {}}
                transition={snappy}
                data-testid={`day-work-pip-${index}`}
                data-paid={paid}
              >
                <DiceIcon size={14} />
              </motion.span>
            </div>
          );
        })}
      </div>

      <p className="text-parchment-500/80 mt-1.5 text-[11px] leading-snug">
        {track.toGo === null
          ? `All ${DAY_WORK_DICE} earned. Come back tomorrow.`
          : `${Math.ceil(track.toGo)} more Vigor and Marla owes you a die.`}
      </p>
    </div>
  );
}
