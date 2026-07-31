'use client';

/**
 * The crucible (crafting spec §2).
 *
 * Gear goes in, materials come out, ten times a day. The list is the same shape as Bram's sell
 * counter on purpose — the player is choosing between those two counters constantly, and the
 * comparison only works if the rows read the same. What differs is the payout column: gold there,
 * a material bundle here.
 *
 * The confirm level is the **engine's**, not the screen's. A Rare asks once; a Set piece asks
 * twice and says what it is about to cost the collection, because that one cannot be undone.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RARITY_LABELS, type Item, type MaterialBundle } from '@/engine/items/types';
import type { ConfirmLevel } from '@/engine/items/dispose';
import { gearSet } from '@/data/gearSets';
import { rarityStyles } from '@/components/items/ItemCard';
import { ActionButton } from '@/components/ui/ActionButton';
import { Icon, LockIcon } from '@/components/icons';
import { listItemIn, snappy, staggerChildren } from '@/styles/motion';
import { MaterialCost } from './MaterialWallet';

export interface CrucibleQuote {
  readonly materials: MaterialBundle;
  readonly confirm: ConfirmLevel;
}

export interface CrucibleProps {
  readonly items: readonly Item[];
  readonly quoteFor: (item: Item) => CrucibleQuote | null;
  readonly onScrap: (item: Item) => void;
  /** Null while there is room; a sentence when the day's ten are gone. */
  readonly capReason: string | null;
}

/** What a second confirm has to actually say, or it is just a slower button. */
function warningFor(item: Item): string {
  if (item.rarity === 'set') {
    const set = gearSet(item.setId ?? '');
    return set
      ? `This is part of the ${set.name}. Melting it undoes that progress — the piece is gone for good.`
      : 'This is a set piece. Melting it undoes that progress.';
  }
  return 'Gone for good, and the crucible only opens ten times a day.';
}

export function Crucible({ items, quoteFor, onScrap, capReason }: CrucibleProps) {
  const [confirming, setConfirming] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="text-parchment-500/72 py-8 text-center text-sm" data-testid="crucible-empty">
        Nothing in your bags. Torvald melts loot, not enthusiasm.
      </p>
    );
  }

  return (
    <motion.ul
      initial="hidden"
      animate="visible"
      transition={staggerChildren()}
      className="space-y-1.5"
      data-testid="crucible-list"
    >
      {items.map((item) => {
        const quote = quoteFor(item);
        const styles = rarityStyles(item.rarity);
        const isConfirming = confirming === item.uid;

        return (
          <motion.li
            key={item.uid}
            variants={listItemIn}
            layout
            className="chamfer-sm border-parchment-500/10 bg-wood-900/55 border px-2.5 py-2"
            data-testid={`scrap-row-${item.uid}`}
          >
            <div className="flex items-center gap-2.5">
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

              <span className="shrink-0">
                <MaterialCost bundle={item.scrapYield} size={11} className="text-[11px]" />
              </span>

              {/* A locked piece keeps its row and says why. Disappearing from the list would
                  read as "the game lost my item", which is a worse bug than the real one. */}
              {!quote ? (
                <span className="text-parchment-500/72 flex w-24 shrink-0 items-center justify-end gap-1 text-[10px]">
                  <LockIcon size={11} />
                  {item.locked ? 'locked' : capReason ? 'cap reached' : 'not meltable'}
                </span>
              ) : (
                <span className="flex w-24 shrink-0 justify-end">
                  <ActionButton
                    size="sm"
                    variant={isConfirming ? 'ghost' : 'secondary'}
                    onClick={() =>
                      isConfirming
                        ? setConfirming(null)
                        : quote.confirm === 'none'
                          ? onScrap(item)
                          : setConfirming(item.uid)
                    }
                    data-testid={`scrap-${item.uid}`}
                  >
                    {isConfirming ? 'Keep it' : 'Melt'}
                  </ActionButton>
                </span>
              )}
            </div>

            {/* The confirm expands the row rather than opening a dialog: the thing being asked
                about stays on screen next to the question. */}
            <AnimatePresence initial={false}>
              {isConfirming && quote && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={snappy}
                  className="overflow-hidden"
                >
                  <div className="border-ember-600/30 mt-2 border-t pt-2 pl-7">
                    <p className="text-parchment-500/72 text-[11px] leading-relaxed">
                      {warningFor(item)}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <ActionButton
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setConfirming(null);
                          onScrap(item);
                        }}
                        data-testid={`scrap-confirm-${item.uid}`}
                      >
                        {quote.confirm === 'double' ? 'Melt it anyway' : 'Into the fire'}
                      </ActionButton>
                      <MaterialCost
                        bundle={quote.materials}
                        size={11}
                        signed
                        className="text-[11px]"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
