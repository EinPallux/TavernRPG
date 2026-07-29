'use client';

/**
 * Countdown chip for missions, patrol shifts, shop restocks and mount rentals.
 *
 * Style guide §9: timers show relative time at a glance and the absolute time on hover,
 * so "in 7m" never leaves the player guessing what wall-clock moment that is.
 */

import { useEffect, useState } from 'react';
import { HourglassIcon } from '@/components/icons';
import { gameNow } from '@/state/clock';

export interface TimerChipProps {
  /** Absolute timestamp the countdown runs to. */
  endsAt: number;
  /** Injected so tests can drive time; defaults to the shared GameClock. */
  now?: () => number;
  label?: string;
  onComplete?: () => void;
  className?: string;
  'data-testid'?: string;
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'ready';
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

function formatAbsolute(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function TimerChip({
  endsAt,
  now,
  label,
  onComplete,
  className = '',
  ...rest
}: TimerChipProps) {
  const readNow = now ?? gameNow;
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - readNow()));

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, endsAt - readNow());
      setRemaining(next);
      if (next === 0) onComplete?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // readNow is recreated per render by design; endsAt is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  const isReady = remaining <= 0;

  return (
    <span
      data-testid={rest['data-testid']}
      title={`${label ? `${label} · ` : ''}${isReady ? 'ready now' : `at ${formatAbsolute(endsAt)}`}`}
      className={`chamfer-sm inline-flex items-center gap-1.5 px-2.5 py-1 text-xs ${
        isReady
          ? 'bg-moss-600/20 text-moss-600 border-moss-600/40 border'
          : 'bg-wood-900/70 text-parchment-300/85 border-parchment-500/20 border'
      } ${className}`}
    >
      <HourglassIcon size={12} className={isReady ? '' : 'animate-lantern'} />
      {label && <span className="text-parchment-500/60">{label}</span>}
      <span className={isReady ? 'font-semibold' : ''}>{formatRemaining(remaining)}</span>
    </span>
  );
}
