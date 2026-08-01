'use client';

/**
 * A single gear cell — used by both the paperdoll and the backpack.
 *
 * Hovering shows the full card (with comparison deltas when the hero is known), so the
 * "is this better?" question is answered without a click anywhere in the game.
 *
 * **The card is published to the shell layer, not rendered here.** It used to be a child of this
 * cell, positioned `absolute bottom-full` — and a cell lives inside a `TavernPanel`, which wears
 * `chamfer-md`, which is a `clip-path`, which clips descendants. Every card was sliced off at the
 * panel's edge: the paperdoll's top row showed a strip, and the backpack's showed rather less.
 * That is the town map's plaque bug for the second time, and it survived eighteen phases because
 * nothing automated can see it — `toBeVisible` knows `display`, `visibility`, `opacity` and box
 * size, and nothing at all about clipping. `useHoverCard` puts it in the one element parked above
 * every panel, which also gets it viewport clamping and flip-above-when-it-does-not-fit for free.
 */

import { useMemo, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Icon } from '@/components/icons';
import { ItemCard, rarityStyles } from './ItemCard';
import { useHoverCard, useTooltip } from '@/components/ui/Tooltip';
import type { Item, SlotId } from '@/engine/items/types';
import type { ComparisonDelta } from '@/engine/hero/derived';
import { SLOT_LABELS } from '@/engine/items/types';
import { snappy } from '@/styles/motion';
import type { IconId } from '@/data/icons';

/** Empty-slot hint glyphs, so a bare paperdoll still reads as a body. */
const SLOT_PLACEHOLDER: Record<SlotId, IconId> = {
  weapon: 'sword',
  offhand: 'shield',
  helmet: 'helm',
  chest: 'chestplate',
  gloves: 'gloves',
  boots: 'boots',
  belt: 'belt',
  amulet: 'amulet',
  ring: 'ring',
  trinket: 'trinket',
};

export interface ItemSlotProps {
  item?: Item | null;
  /** Shown when empty; also drives the placeholder glyph. */
  slot: SlotId;
  comparison?: ComparisonDelta;
  /**
   * Pieces of this item's set the hero is wearing. Drives the paperdoll set glow and the card's
   * set band (gear-sets spec §3). Undefined for anything that is not a set piece.
   */
  setWorn?: number;
  onClick?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  size?: 'md' | 'lg';
  /** Extra content overlaid on the cell, e.g. a lock marker. */
  badge?: ReactNode;
  disabledReason?: string;
  'data-testid'?: string;
}

export function ItemSlot({
  item,
  slot,
  comparison,
  setWorn,
  onClick,
  onContextMenu,
  size = 'md',
  badge,
  disabledReason,
  ...rest
}: ItemSlotProps) {
  /*
   * A filled cell already opens the full `ItemCard` on hover — a tooltip repeating the item's name
   * over the top of it would be a label on a label. The tooltip is for the two things the card
   * cannot say: this slot is empty, or this cell is refusing you.
   *
   * Both hooks are called unconditionally and at most one has a payload, so a cell publishes
   * either a card or a tip and never both. They share the store's single owner, so even a
   * mistake here could only ever put one thing on screen.
   */
  const tip = useTooltip(disabledReason ?? (item ? null : `${SLOT_LABELS[slot]} — empty`));
  const card = useMemo(
    () =>
      item && !disabledReason ? (
        <ItemCard
          item={item}
          {...(comparison ? { comparison } : {})}
          {...(setWorn !== undefined ? { setWorn } : {})}
        />
      ) : null,
    // The element is rebuilt only when what it shows changes; a fresh identity every render would
    // re-publish to the store on every parent update and restart the card's entrance.
    [item, comparison, setWorn, disabledReason],
  );
  const hover = useHoverCard(card);
  const styles = item ? rarityStyles(item.rarity) : null;
  const dimensions = size === 'lg' ? 'h-16 w-16' : 'h-14 w-14';
  /* A worn set piece breathes. Only from two up: one piece is a gold item, not a set. */
  const glowing = Boolean(item?.setId) && (setWorn ?? 0) >= 2;

  return (
    <div className="relative">
      {/* The set glow sits behind the cell rather than on its border, so it reads as light
          coming off the armour instead of a second frame. */}
      {glowing && (
        <motion.span
          aria-hidden
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          className="bg-rarity-set/40 pointer-events-none absolute -inset-1 blur-md"
          data-testid="set-glow"
        />
      )}
      <motion.button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        onPointerEnter={(event) => {
          tip.onPointerEnter?.(event);
          hover.onPointerEnter?.(event);
        }}
        onPointerLeave={(event) => {
          tip.onPointerLeave?.(event);
          hover.onPointerLeave?.(event);
        }}
        onPointerDown={(event) => {
          tip.onPointerDown?.(event);
          hover.onPointerDown?.(event);
        }}
        onFocus={(event) => {
          tip.onFocus?.(event);
          hover.onFocus?.(event);
        }}
        onBlur={(event) => {
          tip.onBlur?.(event);
          hover.onBlur?.(event);
        }}
        whileHover={{ y: -2 }}
        whileTap={onClick ? { y: 1, scale: 0.97 } : undefined}
        transition={snappy}
        aria-describedby={tip['aria-describedby']}
        aria-label={item ? `${item.name} (${SLOT_LABELS[slot]})` : `${SLOT_LABELS[slot]}, empty`}
        data-testid={rest['data-testid']}
        data-filled={item ? 'true' : 'false'}
        className={`chamfer-sm relative ${dimensions} grid place-items-center border transition-colors ${
          item
            ? `bg-wood-800 ${styles?.border} ${styles?.text} ${styles?.glow}`
            : 'border-parchment-500/15 bg-wood-900/60 text-parchment-500/72 hover:border-amber-500/40'
        } ${disabledReason ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <Icon name={item ? item.iconId : SLOT_PLACEHOLDER[slot]} size={size === 'lg' ? 28 : 24} />
      </motion.button>

      {badge}
    </div>
  );
}
