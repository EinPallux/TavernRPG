'use client';

/**
 * "While you were away" (world-simulation spec §4).
 *
 * The card that proves the world kept running. Its job is not to list everything — the Crier
 * board does that — but to land one fact the player feels: **the ladder moved without you**.
 * Rank drift is the headline number for exactly that reason.
 *
 * Shown once per load and dismissed for good; it is a greeting, not a screen.
 */

import { motion } from 'motion/react';
import type { AbsenceSummary } from '@/engine/world/crier';
import { ActionButton } from '@/components/ui/ActionButton';
import { Icon } from '@/components/icons';
import { dramatic, duration } from '@/styles/motion';

export interface AbsenceCardProps {
  readonly summary: AbsenceSummary;
  readonly onDismiss: () => void;
}

function Figure({
  value,
  label,
  delay,
  tone = 'text-parchment-300',
}: {
  value: string;
  label: string;
  delay: number;
  tone?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...dramatic, delay }}
      className="text-center"
    >
      <p className={`font-display text-2xl font-extrabold tabular-nums ${tone}`}>{value}</p>
      <p className="text-parchment-500/45 mt-0.5 text-[10px] tracking-widest uppercase">{label}</p>
    </motion.div>
  );
}

export function AbsenceCard({ summary, onDismiss }: AbsenceCardProps) {
  const { days, levelUps, ladderMoves, milestones, rankDrift, headline } = summary;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={dramatic}
      className="chamfer-md edge-etched-strong bg-wood-800/96 w-full max-w-lg border border-amber-500/45 p-6"
      data-testid="absence-card"
      data-days={days}
    >
      <header className="mb-4 text-center">
        <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
          While you were away
        </p>
        <p className="font-display text-parchment-300 mt-1 text-3xl font-extrabold">
          {days === 1 ? 'A day in Aldenvale' : `${days} days in Aldenvale`}
        </p>
      </header>

      <div className="border-parchment-500/12 mb-4 grid grid-cols-3 gap-3 border-y py-4">
        <Figure value={levelUps.toLocaleString()} label="Levels gained" delay={0.12} />
        <Figure value={ladderMoves.toLocaleString()} label="Ranks traded" delay={0.2} />
        <Figure
          value={milestones.toLocaleString()}
          label="Milestones"
          delay={0.28}
          tone="text-amber-400"
        />
      </div>

      {/* The number the card exists for. Standing still on a moving ladder costs places, and
          saying so is what makes the world feel like it has other people in it. */}
      {rankDrift !== 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: duration.base, delay: 0.36 }}
          className={`chamfer-sm mb-4 flex items-center justify-center gap-2 border px-3 py-2 text-sm ${
            rankDrift < 0
              ? 'border-blood-600/40 bg-blood-600/10 text-blood-600'
              : 'border-moss-600/40 bg-moss-600/10 text-moss-600'
          }`}
          data-testid="absence-drift"
        >
          <Icon name="arena" size={14} />
          {rankDrift < 0
            ? `You slipped ${Math.abs(rankDrift)} place${Math.abs(rankDrift) === 1 ? '' : 's'} by standing still.`
            : `You gained ${rankDrift} place${rankDrift === 1 ? '' : 's'} while others rested.`}
        </motion.p>
      )}

      {headline && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...dramatic, delay: 0.42 }}
          className="chamfer-sm border-parchment-500/12 bg-wood-900/50 mb-5 border p-3"
          data-testid="absence-headline"
        >
          <p className="text-parchment-500/40 mb-1 text-[10px] tracking-widest uppercase">
            The Crier’s headline
          </p>
          <p className="text-parchment-300/90 text-sm leading-snug">{headline.text}</p>
        </motion.div>
      )}

      <div className="flex justify-center">
        <ActionButton onClick={onDismiss} data-testid="absence-dismiss">
          Back to it
        </ActionButton>
      </div>
    </motion.div>
  );
}
