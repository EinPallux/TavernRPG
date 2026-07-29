'use client';

/**
 * Toast stack (style guide §8: max 3 visible, collapse to a summary beyond that).
 *
 * Toasts report things the player did or that happened to them — loot, level-ups, rank
 * changes, unlocks. They never demand a click and never cover the primary action.
 */

import { AnimatePresence, motion } from 'motion/react';
import { snappy } from '@/styles/motion';
import { CoinIcon, DiceIcon, SparkIcon } from '@/components/icons';
import { useShellStore, type Toast as ToastData, type ToastTone } from '@/state/shellStore';

const MAX_VISIBLE = 3;

const TONE: Record<ToastTone, { accent: string; icon: React.ReactNode }> = {
  info: { accent: 'border-l-arcane-500', icon: <SparkIcon size={14} /> },
  reward: { accent: 'border-l-amber-500', icon: <CoinIcon size={14} /> },
  premium: { accent: 'border-l-amber-400', icon: <DiceIcon size={14} /> },
  warning: { accent: 'border-l-ember-600', icon: <SparkIcon size={14} /> },
  danger: { accent: 'border-l-blood-600', icon: <SparkIcon size={14} /> },
};

function ToastRow({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  const tone = TONE[toast.tone];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: 24, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.97 }}
      transition={snappy}
      className={`chamfer-sm surface-timber bg-wood-800/96 edge-etched border-l-2 ${tone.accent} pointer-events-auto flex w-80 items-start gap-3 px-4 py-3`}
    >
      <span className="mt-0.5 text-amber-500">{tone.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-parchment-300 text-xs tracking-[0.16em] uppercase">
          {toast.title}
        </p>
        {toast.detail && (
          <p className="text-parchment-500/75 mt-0.5 text-xs leading-snug">{toast.detail}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={`Dismiss: ${toast.title}`}
        className="text-parchment-500/40 hover:text-parchment-300 text-xs transition-colors"
      >
        ✕
      </button>
    </motion.li>
  );
}

export function ToastStack() {
  const toasts = useShellStore((state) => state.toasts);
  const dismissToast = useShellStore((state) => state.dismissToast);

  const visible = toasts.slice(0, MAX_VISIBLE);
  const overflow = toasts.length - visible.length;

  return (
    <div className="pointer-events-none fixed right-6 bottom-6 z-40 flex flex-col items-end gap-2">
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {visible.map((toast) => (
            <ToastRow key={toast.id} toast={toast} onDismiss={dismissToast} />
          ))}
        </AnimatePresence>
      </ul>
      {overflow > 0 && (
        <motion.p
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-parchment-500/50 pr-1 text-xs"
        >
          +{overflow} more
        </motion.p>
      )}
    </div>
  );
}
