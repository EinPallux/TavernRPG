'use client';

/**
 * Modal dialog (style guide §8: "chamfered, darkened stage, never stacks >1").
 *
 * Reserved for the handful of confirmations that actually deserve one — selling Rare+ gear,
 * scrapping a set piece, replacing a mount, leaving a guild. Everything else is undo-free
 * and cheap, so it must not interrupt.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { standard, duration } from '@/styles/motion';
import { TavernPanel } from './TavernPanel';
import { ActionButton } from './ActionButton';

export interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Primary action. Omit for a plain acknowledgement dialog. */
  confirm?: {
    label: string;
    onConfirm: () => void;
    variant?: 'primary' | 'danger';
  };
  cancelLabel?: string;
  'data-testid'?: string;
}

export function Modal({
  open,
  title,
  children,
  onClose,
  confirm,
  cancelLabel = 'Never mind',
  ...rest
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    // Move focus into the dialog so keyboard users aren't left behind it.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.quick }}
          data-testid={rest['data-testid']}
        >
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="bg-wood-900/80 absolute inset-0 cursor-default backdrop-blur-[2px]"
          />

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={standard}
            className="relative w-full max-w-lg outline-none"
          >
            <TavernPanel title={title} elevation="floating" animate={false}>
              <div className="text-parchment-500/85 text-sm leading-relaxed">{children}</div>

              <div className="mt-6 flex justify-end gap-3">
                <ActionButton variant="secondary" size="sm" onClick={onClose}>
                  {cancelLabel}
                </ActionButton>
                {confirm && (
                  <ActionButton
                    variant={confirm.variant ?? 'primary'}
                    size="sm"
                    onClick={() => {
                      confirm.onConfirm();
                      onClose();
                    }}
                    data-testid="modal-confirm"
                  >
                    {confirm.label}
                  </ActionButton>
                )}
              </div>
            </TavernPanel>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
