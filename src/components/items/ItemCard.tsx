'use client';

/**
 * The item card — one component for every place an item appears (items spec §4).
 *
 * Hovering anything anywhere shows the same card, so players learn to read gear once. When a
 * comparison is supplied it renders deltas against the equipped piece, coloured by whether the
 * swap is a gain or a loss — the single most important decision the game asks repeatedly.
 */

import { motion } from 'motion/react';
import { Icon } from '@/components/icons';
import { ATTRIBUTE_LABELS, statLines } from '@/engine/progression/stats';
import { RARITY_LABELS, SLOT_LABELS, type Item, type Rarity } from '@/engine/items/types';
import type { ComparisonDelta } from '@/engine/hero/derived';
import { classDef } from '@/data/classes';
import { gearSet } from '@/data/gearSets';
import { snappy } from '@/styles/motion';

const RARITY_STYLES: Record<Rarity, { text: string; border: string; glow: string }> = {
  common: {
    text: 'text-rarity-common',
    border: 'border-rarity-common/45',
    glow: '',
  },
  uncommon: {
    text: 'text-rarity-uncommon',
    border: 'border-rarity-uncommon/50',
    glow: 'shadow-[0_0_18px_-8px_rgb(111_168_78/0.8)]',
  },
  rare: {
    text: 'text-rarity-rare',
    border: 'border-rarity-rare/55',
    glow: 'shadow-[0_0_20px_-8px_rgb(74_143_212/0.85)]',
  },
  epic: {
    text: 'text-rarity-epic',
    border: 'border-rarity-epic/60',
    glow: 'shadow-[0_0_24px_-8px_rgb(155_95_208/0.9)]',
  },
  set: {
    text: 'text-rarity-set',
    border: 'border-rarity-set/65',
    glow: 'shadow-[0_0_26px_-8px_rgb(232_163_61/0.95)]',
  },
  legendary: {
    text: 'text-rarity-legendary',
    border: 'border-rarity-legendary/70',
    glow: 'shadow-[0_0_34px_-6px_rgb(255_90_31/1)]',
  },
};

export function rarityStyles(rarity: Rarity) {
  return RARITY_STYLES[rarity];
}

/** A signed number, coloured green for better and red for worse. Zero is left out entirely. */
function Delta({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (Math.round(value * 100) === 0) return null;
  const positive = value > 0;
  return (
    <span className={positive ? 'text-moss-400' : 'text-blood-400'}>
      {positive ? '+' : ''}
      {suffix === '%' ? (value * 100).toFixed(1) : Math.round(value)}
      {suffix}
    </span>
  );
}

/**
 * The set band: sigil, name, five pips, and the next bonus (gear-sets spec §3).
 *
 * Lives on the card rather than on a separate page because the question it answers — "does
 * putting this on complete anything?" — is asked *while hovering a piece*, and an answer that
 * requires a tab change is an answer nobody reads.
 */
function SetBand({ setId, worn }: { setId: string; worn: number }) {
  const definition = gearSet(setId);
  if (!definition) return null;

  const total = definition.pieces.length;
  const next = definition.bonuses.find((bonus) => bonus.pieces > worn);

  return (
    <div
      className="border-rarity-set/25 mt-3 border-t pt-2.5"
      data-testid={`set-band-${definition.id}`}
    >
      <p className="text-rarity-set flex items-center gap-1.5 text-[11px] font-semibold">
        <Icon name={definition.sigil} size={13} />
        {definition.name}
        <span className="text-parchment-500/72 ml-auto tabular-nums">
          {worn}/{total} worn
        </span>
      </p>

      <div className="mt-1.5 flex gap-1">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={`chamfer-sm h-1.5 flex-1 ${index < worn ? 'bg-rarity-set' : 'bg-parchment-500/25'}`}
          />
        ))}
      </div>

      <p className="text-parchment-500/72 mt-1.5 text-[10px] leading-snug">
        {next ? `At ${next.pieces}: ${next.text}` : 'Every bonus is live.'}
      </p>
    </div>
  );
}

export interface ItemCardProps {
  item: Item;
  /** Deltas versus what is worn in this slot; omit for a plain description. */
  comparison?: ComparisonDelta;
  /** Pieces of this item's set the hero is *wearing*, for the set band. */
  setWorn?: number;
  className?: string;
  'data-testid'?: string;
}

export function ItemCard({ item, comparison, setWorn, className = '', ...rest }: ItemCardProps) {
  const styles = RARITY_STYLES[item.rarity];
  const attributeLines = statLines(item.attrs);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={snappy}
      data-testid={rest['data-testid']}
      className={`chamfer-md surface-timber bg-wood-900/97 w-72 border-2 ${styles.border} ${styles.glow} p-4 ${className}`}
    >
      <header className="flex items-start gap-3">
        <span
          className={`chamfer-sm bg-wood-800 grid h-11 w-11 shrink-0 place-items-center border ${styles.border} ${styles.text}`}
        >
          <Icon name={item.iconId} size={22} />
        </span>
        <div className="min-w-0">
          <p className={`font-display text-sm leading-tight font-bold ${styles.text}`}>
            {item.name}
          </p>
          <p className="text-parchment-500/72 mt-0.5 text-[11px] tracking-wider uppercase">
            {RARITY_LABELS[item.rarity]} · {SLOT_LABELS[item.slot]} · Lv {item.level}
          </p>
        </div>
      </header>

      {item.classLock && (
        <p className="text-parchment-500/72 mt-2 text-[11px] italic">
          {classDef(item.classLock).name}s only
        </p>
      )}

      <div className="facet-rule my-3" />

      {/* Weapon damage or armour rating — the headline number for the slot. */}
      {item.weapon && (
        <p className="flex items-baseline justify-between text-sm">
          <span className="text-parchment-500/72">Damage</span>
          <span className="text-parchment-300">
            {item.weapon.min}–{item.weapon.max}
          </span>
        </p>
      )}
      {item.armour !== undefined && (
        <p className="flex items-baseline justify-between text-sm">
          <span className="text-parchment-500/72">Armour</span>
          <span className="text-parchment-300">
            {item.armour}
            {comparison && (
              <span className="ml-2 text-xs">
                <Delta value={comparison.armour} />
              </span>
            )}
          </span>
        </p>
      )}

      <ul className="mt-2 space-y-1">
        {attributeLines.map(([attribute, amount]) => (
          <li key={attribute} className="flex items-baseline justify-between text-sm">
            <span className="text-parchment-500/72">{ATTRIBUTE_LABELS[attribute]}</span>
            <span className="text-parchment-300">+{amount}</span>
          </li>
        ))}
      </ul>

      {item.specials && (
        <ul className="mt-2 space-y-1">
          {item.specials.goldFind !== undefined && (
            <li className="text-arcane-500 text-sm">+{item.specials.goldFind}% gold found</li>
          )}
          {item.specials.xpBonus !== undefined && (
            <li className="text-arcane-500 text-sm">+{item.specials.xpBonus}% experience</li>
          )}
        </ul>
      )}

      {comparison && (
        <div className="border-parchment-500/15 mt-3 border-t pt-3">
          <p className="text-parchment-500/72 mb-1.5 text-[10px] tracking-[0.2em] uppercase">
            {comparison.slotWasEmpty ? 'If equipped' : 'Versus equipped'}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="text-parchment-500/72">
              Health <Delta value={comparison.health} />
            </span>
            <span className="text-parchment-500/72">
              Damage <Delta value={comparison.damageAverage} />
            </span>
            <span className="text-parchment-500/72">
              Crit <Delta value={comparison.critChance} suffix="%" />
            </span>
          </div>
        </div>
      )}

      {item.setId && <SetBand setId={item.setId} worn={setWorn ?? 0} />}

      <footer className="border-parchment-500/15 text-parchment-500/72 mt-3 flex items-center justify-between border-t pt-2 text-[11px]">
        <span>
          {item.rarity === 'set' ? 'Not for sale' : `Worth ${item.value.toLocaleString()} gold`}
        </span>
        {item.locked && <span className="text-amber-500/70">Locked</span>}
      </footer>
    </motion.div>
  );
}
