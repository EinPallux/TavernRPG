'use client';

/**
 * Marla's ledger — twenty-eight squares (daily-loop spec §2).
 *
 * There is no "claim" button, and that is the point: the stamp lands on first load of the day,
 * inside the one reset walk, so by the time a player opens this page they have already been
 * marked present. What the page does is *show* them the mark landing, and show them how far the
 * ledger goes.
 *
 * The copy has one job beyond that: say out loud that missing a day pauses rather than resets.
 * A player who has been away three days and finds themselves still on day 19 should read the
 * reason here rather than have to infer it from a number that did not drop.
 */

import { motion } from 'motion/react';
import { CALENDAR_DAYS, isMilestone, nextMilestone } from '@/data/calendar';
import type { CalendarSquare } from '@/engine/calendar/calendar';
import { Icon } from '@/components/icons';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { staggerChildren, standard } from '@/styles/motion';

export interface LedgerProps {
  readonly squares: readonly CalendarSquare[];
  readonly cyclesCompleted: number;
  /** True for one beat after the stamp lands, so the square can thump. */
  readonly justStamped: number | null;
}

export function Ledger({ squares, cyclesCompleted, justStamped }: LedgerProps) {
  const stamped = squares.filter((entry) => entry.stamped).length;
  const upcoming = nextMilestone(stamped + 1);

  return (
    <div className="space-y-4">
      <TavernPanel title="Marla’s ledger">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="text-parchment-500/72 text-xs">
            <span className="text-parchment-300 tabular-nums">
              {stamped} of {CALENDAR_DAYS}
            </span>{' '}
            squares marked
            {cyclesCompleted > 0 && (
              <span className="text-parchment-500/72">
                {' '}
                · {cyclesCompleted} ledger{cyclesCompleted === 1 ? '' : 's'} finished
              </span>
            )}
          </p>
          {upcoming && (
            <p className="text-[11px] text-amber-500/80" data-testid="next-milestone">
              Day {upcoming.day}: {upcoming.label}
            </p>
          )}
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          transition={staggerChildren(0.012)}
          // Capped rather than fluid: twenty-eight squares stretched across a 1920 panel are
          // enormous and mostly empty, and a ledger should read as a page, not a wall.
          className="grid max-w-[34rem] grid-cols-7 gap-1.5"
          data-testid="ledger-grid"
        >
          {squares.map((square) => (
            <Square
              key={square.reward.day}
              square={square}
              thumping={justStamped === square.reward.day}
            />
          ))}
        </motion.div>

        <p className="text-parchment-500/72 mt-3 text-[11px] leading-relaxed">
          <span className="text-parchment-300">Missing a day pauses the ledger.</span> It never
          resets it — day nineteen is still day nineteen when you come back, however long that
          takes. The mark lands by itself on your first visit of the day.
        </p>
      </TavernPanel>
    </div>
  );
}

function Square({ square, thumping }: { square: CalendarSquare; thumping: boolean }) {
  const { reward, stamped, today } = square;
  const milestone = isMilestone(reward.day);

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, scale: 0.85 }, visible: { opacity: 1, scale: 1 } }}
      animate={thumping ? { scale: [1, 1.22, 0.96, 1] } : undefined}
      transition={thumping ? { duration: 0.55, ease: 'easeOut' } : standard}
      title={`Day ${reward.day} — ${reward.label}`}
      className={`chamfer-sm relative grid aspect-square place-items-center border ${
        stamped
          ? 'border-amber-500/45 bg-amber-500/12 text-amber-400'
          : today
            ? 'border-amber-500/70 bg-amber-500/5 text-amber-500'
            : milestone
              ? 'border-parchment-500/20 bg-wood-900/70 text-parchment-500/72'
              : 'border-parchment-500/10 bg-wood-900/45 text-parchment-500/72'
      }`}
      data-testid={`ledger-day-${reward.day}`}
      data-stamped={stamped}
      data-today={today}
    >
      <span className="text-parchment-500/72 absolute top-0.5 left-1 text-[9px] tabular-nums">
        {reward.day}
      </span>
      <Icon name={reward.iconId} size={milestone ? 20 : 16} />

      {stamped && (
        /*
         * The mark: a struck diagonal, not a tick — this is a tavern ledger, and Marla is
         * ruling a line through a day, not awarding a gold star. Thin and half-lit on purpose:
         * a heavy stroke buries the reward icon, which is the thing the square is *for*.
         */
        <motion.span
          aria-hidden
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={standard}
          className="pointer-events-none absolute inset-1.5"
        >
          <svg viewBox="0 0 40 40" className="h-full w-full text-amber-500/45">
            <motion.path
              d="M5 33L35 7"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </motion.span>
      )}

      {today && (
        <motion.span
          aria-hidden
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute inset-0 border border-amber-500/60"
        />
      )}
    </motion.div>
  );
}
