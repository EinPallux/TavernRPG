'use client';

/**
 * Meters — XP, HP, Vigor, guild progress (style guide §7).
 *
 * The fill is a chamfered facet bar with a travelling shimmer, and the number always counts
 * to its new value rather than snapping, because "anything that changes state moves".
 */

import { useEffect } from 'react';
import { animate, motion, useMotionValue, useTransform, useReducedMotion } from 'motion/react';
import { standard } from '@/styles/motion';

export type MeterTone = 'xp' | 'vigor' | 'health' | 'success' | 'neutral';

export interface MeterProps {
  value: number;
  max: number;
  tone?: MeterTone;
  label?: string;
  /** Show `value / max` beside the label. */
  showNumbers?: boolean;
  /** Bar height in px. */
  height?: number;
  className?: string;
  'data-testid'?: string;
}

const TONE: Record<MeterTone, { fill: string; glow: string }> = {
  xp: { fill: 'bg-amber-500', glow: 'shadow-[0_0_12px_-2px_rgb(232_163_61/0.7)]' },
  vigor: { fill: 'bg-ember-600', glow: 'shadow-[0_0_12px_-2px_rgb(217_108_47/0.7)]' },
  health: { fill: 'bg-blood-600', glow: 'shadow-[0_0_12px_-2px_rgb(167_58_46/0.7)]' },
  // Finished, not damaged. Before this existed the only full-bar colours were amber and red,
  // so "done" had to borrow one of them and a completed task read as a wound.
  success: { fill: 'bg-moss-600', glow: 'shadow-[0_0_12px_-2px_rgb(76_122_63/0.75)]' },
  neutral: { fill: 'bg-arcane-500', glow: 'shadow-[0_0_12px_-2px_rgb(63_167_160/0.6)]' },
};

/**
 * Counts a number toward its target so gains read as gains.
 *
 * Driven by a MotionValue rather than React state: the tween runs outside the render cycle,
 * so a counter ticking up 60 times a second costs no re-renders.
 */
function useCountUp(target: number, disabled: boolean) {
  const count = useMotionValue(target);
  const text = useTransform(count, (latest) => Math.round(latest).toLocaleString());

  useEffect(() => {
    if (disabled) {
      count.set(target);
      return;
    }

    const distance = Math.abs(target - count.get());
    const controls = animate(count, target, {
      // Fast acknowledgement, gentle settle; longer moves take a little longer.
      duration: Math.min(0.7, 0.18 + distance * 0.004),
      ease: 'easeOut',
    });
    return () => controls.stop();
  }, [target, disabled, count]);

  return text;
}

export function Meter({
  value,
  max,
  tone = 'xp',
  label,
  showNumbers = true,
  height = 8,
  className = '',
  ...rest
}: MeterProps) {
  const reduceMotion = useReducedMotion();
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const shownValue = useCountUp(value, Boolean(reduceMotion));

  return (
    <div className={className} data-testid={rest['data-testid']}>
      {(label || showNumbers) && (
        <div className="mb-1 flex items-baseline justify-between gap-3">
          {label && (
            <span className="font-display text-parchment-500/72 text-[11px] tracking-[0.22em] uppercase">
              {label}
            </span>
          )}
          {showNumbers && (
            <span className="text-parchment-300/85 text-xs">
              <motion.span>{shownValue}</motion.span>
              <span className="text-parchment-500/72"> / {max.toLocaleString()}</span>
            </span>
          )}
        </div>
      )}

      <div
        className="chamfer-sm bg-wood-900/85 relative overflow-hidden"
        style={{ height }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div aria-hidden className="absolute inset-0 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.6)]" />
        <motion.div
          className={`h-full ${TONE[tone].fill} ${TONE[tone].glow}`}
          initial={false}
          animate={{ width: `${ratio * 100}%` }}
          transition={reduceMotion ? { duration: 0 } : standard}
        >
          {!reduceMotion && ratio > 0.04 && (
            <div
              aria-hidden
              className="animate-meter-shimmer h-full w-8 bg-gradient-to-r from-transparent via-white/45 to-transparent"
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}
