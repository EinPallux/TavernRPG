'use client';

/**
 * The game's button (style guide §8, §9).
 *
 * Two rules it enforces so screens can't drift:
 *  - **Costs are visible before the click** — pass `cost` and the price rides on the button.
 *  - **Disabled states explain themselves** — pass `disabledReason` and it becomes the tooltip,
 *    because a grey button with no explanation is the single most common UX failure in games.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'motion/react';
import { snappy } from '@/styles/motion';
import { CoinIcon, DiceIcon } from '@/components/icons';
import { play } from '@/state/sfx';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ActionCost {
  gold?: number;
  dice?: number;
}

export interface ActionButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'
> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  cost?: ActionCost;
  /** Why this is unavailable. Shown on hover; implies `disabled`. */
  disabledReason?: string;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-amber-500 text-ink-900 hover:bg-amber-400 font-bold shadow-[0_6px_16px_-10px_rgb(232_163_61/0.9)]',
  secondary:
    'bg-wood-700/80 text-parchment-300 border border-parchment-500/25 hover:border-amber-500/60 hover:bg-wood-600/80',
  danger: 'bg-blood-600/85 text-parchment-300 hover:bg-blood-600 font-bold',
  ghost: 'text-parchment-500/72 hover:text-amber-500 underline underline-offset-4',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
};

function CostBadge({ cost }: { cost: ActionCost }) {
  return (
    <span className="ml-2 inline-flex items-center gap-2 border-l border-current/25 pl-2 text-current/85">
      {cost.gold !== undefined && (
        <span className="inline-flex items-center gap-1">
          <CoinIcon size={13} />
          {cost.gold.toLocaleString()}
        </span>
      )}
      {cost.dice !== undefined && (
        <span className="inline-flex items-center gap-1">
          <DiceIcon size={13} />
          {cost.dice}
        </span>
      )}
    </span>
  );
}

export function ActionButton({
  children,
  variant = 'primary',
  size = 'md',
  cost,
  disabledReason,
  icon,
  fullWidth = false,
  disabled,
  className = '',
  onClick,
  ...rest
}: ActionButtonProps) {
  const isDisabled = disabled || Boolean(disabledReason);
  const shape = variant === 'ghost' ? '' : 'chamfer-sm';

  /*
   * Every button in the game clicks here, which is the point.
   *
   * One call site rather than a `play()` sprinkled through fifteen screens: the cue belongs to
   * *pressing a thing*, not to any particular thing, and a screen that forgot it would be the
   * only silent button in the game. `play()` no-ops when SFX are off or there is no audio at
   * all, so nothing here needs a guard.
   */
  const handleClick: typeof onClick = (event) => {
    play('select');
    onClick?.(event);
  };

  return (
    <motion.button
      type="button"
      whileHover={isDisabled ? undefined : { y: -1 }}
      whileTap={isDisabled ? undefined : { y: 1, scale: 0.985 }}
      transition={snappy}
      onClick={handleClick}
      disabled={isDisabled}
      title={disabledReason}
      aria-disabled={isDisabled}
      className={`${shape} font-display inline-flex items-center justify-center gap-2 tracking-[0.12em] uppercase transition-colors ${
        VARIANT[variant]
      } ${SIZE[size]} ${fullWidth ? 'w-full' : ''} ${
        isDisabled ? 'cursor-not-allowed opacity-45 grayscale' : 'cursor-pointer'
      } ${className}`}
      {...rest}
    >
      {icon}
      <span>{children}</span>
      {cost && <CostBadge cost={cost} />}
    </motion.button>
  );
}
