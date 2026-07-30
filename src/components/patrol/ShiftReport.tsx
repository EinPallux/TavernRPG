'use client';

/**
 * The shift report (tavern-and-patrol spec §5).
 *
 * Patrol has no mechanics — it is a timer and a payout. The report is what makes eight hours of
 * nothing feel like eight hours of *somewhere*, so it gets the ceremony: the hours signed off,
 * the pay counted out, and a few lines from the beat.
 */

import { motion } from 'motion/react';
import { lineCountForShift, linesForShift } from '@/data/patrolLog';
import { CoinIcon, SparkIcon } from '@/components/icons';
import { ActionButton } from '@/components/ui/ActionButton';
import { dramatic, duration } from '@/styles/motion';

export interface ShiftReportProps {
  readonly hours: number;
  readonly minutes: number;
  readonly gold: number;
  readonly xp: number;
  /** True when the hero clocked off early — the pay is pro-rated and says so. */
  readonly early: boolean;
  readonly leveledTo: number | null;
  /** Stable seed for which log lines to show, so they don't reshuffle on re-render. */
  readonly seed: number;
  readonly onDismiss: () => void;
}

function formatSpan(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} minute${m === 1 ? '' : 's'}`;
  if (m === 0) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${h}h ${m}m`;
}

export function ShiftReport({
  hours,
  minutes,
  gold,
  xp,
  early,
  leveledTo,
  seed,
  onDismiss,
}: ShiftReportProps) {
  // Lines are picked by index off a stable seed rather than rolled — barks and log lines never
  // reach for randomness (see `data/barks.ts`).
  const pool = linesForShift(minutes / 60);
  const wanted = Math.min(lineCountForShift(minutes / 60), pool.length);
  const lines = Array.from(
    { length: wanted },
    (_, i) => pool[(Math.abs(seed) + i * 7) % pool.length]!,
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={dramatic}
      className="chamfer-md edge-etched-strong bg-wood-800/96 w-full max-w-lg border border-amber-500/45 p-6"
      data-testid="shift-report"
      data-early={early ? 'true' : 'false'}
    >
      <header className="mb-4 text-center">
        <p className="font-display text-3xl font-extrabold tracking-wide text-amber-400">
          {early ? 'Off Early' : 'Shift Complete'}
        </p>
        <p className="text-parchment-500/55 mt-1 text-sm">
          {early
            ? `Hildy signs you out after ${formatSpan(minutes)} of a ${hours}-hour shift. Paid for what you walked.`
            : `${formatSpan(minutes)} on the beat. Hildy signs the book.`}
        </p>
      </header>

      <dl className="mb-4">
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...dramatic, delay: 0.15 }}
          className="border-parchment-500/12 flex items-center justify-between border-b py-2"
          data-testid="shift-gold"
        >
          <dt className="text-parchment-500/70 flex items-center gap-2 text-sm">
            <CoinIcon size={14} />
            Watch pay
          </dt>
          <dd className="font-display text-parchment-300 text-base font-bold tabular-nums">
            +{gold.toLocaleString()}
          </dd>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...dramatic, delay: 0.26 }}
          className="flex items-center justify-between py-2"
          data-testid="shift-xp"
        >
          <dt className="text-parchment-500/70 flex items-center gap-2 text-sm">
            <SparkIcon size={14} />
            Experience
          </dt>
          <dd className="font-display text-parchment-300 text-base font-bold tabular-nums">
            +{xp.toLocaleString()}
          </dd>
        </motion.div>
        {leveledTo !== null && (
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...dramatic, delay: 0.37 }}
            className="flex items-center justify-between py-2"
          >
            <dt className="text-sm text-amber-500">Level up</dt>
            <dd className="font-display text-base font-bold text-amber-400">→ {leveledTo}</dd>
          </motion.div>
        )}
      </dl>

      {/* From the beat. The whole reason a shift is a shift and not an accrual. */}
      <motion.ul
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: duration.base, delay: 0.42 }}
        className="chamfer-sm border-parchment-500/12 bg-wood-900/50 mb-5 space-y-1.5 border p-3"
        data-testid="shift-log"
      >
        {lines.map((line) => (
          <li key={line.id} className="text-parchment-500/70 text-xs leading-snug">
            — {line.text}
          </li>
        ))}
      </motion.ul>

      <div className="flex justify-center">
        <ActionButton onClick={onDismiss} data-testid="shift-dismiss">
          Back to the watch house
        </ActionButton>
      </div>
    </motion.div>
  );
}
