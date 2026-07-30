'use client';

/**
 * A single gear cell — used by both the paperdoll and the backpack.
 *
 * Hovering shows the full card (with comparison deltas when the hero is known), so the
 * "is this better?" question is answered without a click anywhere in the game.
 */

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/icons';
import { ItemCard, rarityStyles } from './ItemCard';
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
  const [hovered, setHovered] = useState(false);
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
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        whileHover={{ y: -2 }}
        whileTap={onClick ? { y: 1, scale: 0.97 } : undefined}
        transition={snappy}
        title={disabledReason ?? (item ? item.name : `${SLOT_LABELS[slot]} — empty`)}
        aria-label={item ? `${item.name} (${SLOT_LABELS[slot]})` : `${SLOT_LABELS[slot]}, empty`}
        data-testid={rest['data-testid']}
        data-filled={item ? 'true' : 'false'}
        className={`chamfer-sm relative ${dimensions} grid place-items-center border transition-colors ${
          item
            ? `bg-wood-800 ${styles?.border} ${styles?.text} ${styles?.glow}`
            : 'border-parchment-500/15 bg-wood-900/60 text-parchment-500/20 hover:border-amber-500/40'
        } ${disabledReason ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <Icon name={item ? item.iconId : SLOT_PLACEHOLDER[slot]} size={size === 'lg' ? 28 : 24} />
      </motion.button>

      {badge}

      <AnimatePresence>
        {hovered && item && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2"
          >
            <ItemCard
              item={item}
              {...(comparison ? { comparison } : {})}
              {...(setWorn !== undefined ? { setWorn } : {})}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
