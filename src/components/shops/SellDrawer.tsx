'use client';

/**
 * The counter you sell across (shops spec §1, §3).
 *
 * Both keepers share it, because both share the `disposeItem` backend — the rules about what is
 * safe to sell are the service's, not the screen's. The drawer only renders what the quote says:
 * a Rare gets a confirm because the engine asked for one, and a Set piece is not offered at all
 * because the engine refuses it.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Item } from '@/engine/items/types';
import { RARITY_LABELS } from '@/engine/items/types';
import { rarityStyles } from '@/components/items/ItemCard';
import { ActionButton } from '@/components/ui/ActionButton';
import { CoinIcon, Icon, LockIcon } from '@/components/icons';
import { listItemIn, snappy, staggerChildren } from '@/styles/motion';

export interface SellDrawerProps {
  /** Everything in the bags, in bag order. */
  readonly items: readonly Item[];
  /** Gold this item would fetch, and whether the engine wants a confirm first. */
  readonly quoteFor: (
    item: Item,
  ) => { gold: number; confirm: 'none' | 'confirm' | 'double' } | null;
  readonly onSell: (item: Item) => void;
  readonly keeper: string;
}

export function SellDrawer({ items, quoteFor, onSell, keeper }: SellDrawerProps) {
  const [confirming, setConfirming] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="text-parchment-500/72 py-6 text-center text-sm" data-testid="sell-empty">
        Nothing in your bags {keeper} would take.
      </p>
    );
  }

  return (
    <motion.ul
      initial="hidden"
      animate="visible"
      transition={staggerChildren()}
      className="space-y-1.5"
      data-testid="sell-list"
    >
      {items.map((item) => {
        const quote = quoteFor(item);
        const styles = rarityStyles(item.rarity);
        const isConfirming = confirming === item.uid;

        return (
          <motion.li
            key={item.uid}
            variants={listItemIn}
            className="chamfer-sm border-parchment-500/10 bg-wood-900/55 flex items-center gap-2.5 border px-2.5 py-2"
            data-testid={`sell-row-${item.uid}`}
          >
            <span className={`shrink-0 ${styles.text}`}>
              <Icon name={item.iconId} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-xs font-semibold ${styles.text}`}>
                {item.name}
              </span>
              <span className="text-parchment-500/72 block text-[10px] tracking-wide uppercase">
                {RARITY_LABELS[item.rarity]} · Lv {item.level}
              </span>
            </span>

            {/* No quote means the service refused it — a locked piece or an heirloom. The row
                stays visible and says why, rather than the item silently vanishing from the list. */}
            {!quote ? (
              <span className="text-parchment-500/72 flex shrink-0 items-center gap-1 text-[10px]">
                <LockIcon size={11} />
                {item.locked ? 'locked' : 'not for sale'}
              </span>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                {isConfirming ? (
                  <motion.span
                    key="confirm"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={snappy}
                    className="flex shrink-0 items-center gap-1.5"
                  >
                    <ActionButton
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setConfirming(null);
                        onSell(item);
                      }}
                      data-testid={`sell-confirm-${item.uid}`}
                    >
                      Sell it
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirming(null)}
                      data-testid={`sell-cancel-${item.uid}`}
                    >
                      Keep
                    </ActionButton>
                  </motion.span>
                ) : (
                  <motion.span
                    key="offer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={snappy}
                    className="shrink-0"
                  >
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      icon={<CoinIcon size={12} />}
                      onClick={() =>
                        quote.confirm === 'none' ? onSell(item) : setConfirming(item.uid)
                      }
                      data-testid={`sell-${item.uid}`}
                    >
                      {quote.gold.toLocaleString()}
                    </ActionButton>
                  </motion.span>
                )}
              </AnimatePresence>
            )}
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
