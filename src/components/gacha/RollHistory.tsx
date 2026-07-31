'use client';

/**
 * The history log (gacha spec §7).
 *
 * "What did I roll?" is the question a gacha most often refuses to answer, so this one keeps two
 * hundred cards and shows them without being asked. It is not analytics — it is the receipt, and
 * a player who suspects the rates are wrong should be able to sit here and count.
 *
 * Free cards are marked as free, and pitied cards are marked as owed, because a log that
 * flattened those two into "featured" would make the published floor unverifiable from the one
 * place a player would go to verify it.
 */

import { motion } from 'motion/react';
import { OUTCOME_LABELS, banner, type RollOutcome } from '@/data/banners';
import type { StoredRollRecord } from '@/engine/save/schema';
import { SparkIcon } from '@/components/icons';
import { listItemIn, staggerChildren } from '@/styles/motion';

/** Literal class names: Tailwind v4 compiles what it can see, not what it can compute. */
const TONE: Readonly<Record<RollOutcome, string>> = {
  featured: 'text-rarity-set',
  epic: 'text-rarity-epic',
  rare: 'text-rarity-rare',
  uncommon: 'text-rarity-uncommon',
  materials: 'text-arcane-500',
  gold: 'text-amber-500',
  ale: 'text-parchment-500/72',
};

export function RollHistory({ entries }: { entries: readonly StoredRollRecord[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-parchment-500/72 py-6 text-center text-sm" data-testid="history-empty">
        Nothing yet. The deck is shuffled and waiting.
      </p>
    );
  }

  return (
    <motion.ul
      initial="hidden"
      animate="visible"
      transition={staggerChildren(0.02)}
      className="max-h-80 space-y-1 overflow-y-auto pr-1"
      data-testid="roll-history"
    >
      {entries.slice(0, 40).map((entry, index) => (
        <motion.li
          key={`${entry.at}-${index}`}
          variants={listItemIn}
          className="chamfer-sm border-parchment-500/8 bg-wood-900/45 flex items-baseline gap-2 border px-2.5 py-1.5 text-[11px]"
          data-testid="history-row"
        >
          <span className={`w-16 shrink-0 truncate ${TONE[entry.outcome]}`}>
            {OUTCOME_LABELS[entry.outcome]}
          </span>
          <span className="text-parchment-300/85 min-w-0 flex-1 truncate">{entry.label}</span>
          {entry.pitied && (
            <span className="text-ember-400 flex shrink-0 items-center gap-0.5 text-[9px] tracking-wider uppercase">
              <SparkIcon size={9} />
              owed
            </span>
          )}
          {entry.free && (
            <span className="text-parchment-500/72 shrink-0 text-[9px] tracking-wider uppercase">
              free
            </span>
          )}
          <span className="text-parchment-500/72 w-12 shrink-0 text-right text-[9px]">
            {banner(entry.bannerId).rotation}
          </span>
        </motion.li>
      ))}
    </motion.ul>
  );
}
