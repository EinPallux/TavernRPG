'use client';

/**
 * One item on a shelf (shops spec §3).
 *
 * Three states, and the third is the interesting one. Available and unaffordable are the usual
 * pair; **sold** leaves a wrapped parcel in the gap rather than closing the row up, because a
 * shelf that reflows under the cursor after every purchase is a shelf you misclick.
 *
 * The comparison against what the hero is wearing lives on the card itself rather than in a
 * hover tooltip — the whole reason to visit a shop is to answer "is this better than mine?", and
 * making that a hover is making the player work for the one thing they came for.
 */

import { motion } from 'motion/react';
import type { Item } from '@/engine/items/types';
import type { ComparisonDelta } from '@/engine/hero/derived';
import { ATTRIBUTE_LABELS, type AttributeId } from '@/engine/progression/stats';
import { RARITY_LABELS, SLOT_LABELS } from '@/engine/items/types';
import { rarityStyles } from '@/components/items/ItemCard';
import { ActionButton } from '@/components/ui/ActionButton';
import { CoinIcon, Icon } from '@/components/icons';
import { classDef } from '@/data/classes';
import { listItemIn } from '@/styles/motion';

export interface StockCardProps {
  readonly item: Item;
  readonly price: number;
  readonly sold: boolean;
  readonly affordable: boolean;
  /** Against what is worn in the same slot. Null when there is no hero comparison to make. */
  readonly comparison: ComparisonDelta | null;
  /** Bags are full — the button explains itself rather than failing on click. */
  readonly noRoom: boolean;
  readonly onBuy: () => void;
  readonly index: number;
}

/** A signed stat delta. Zero is omitted entirely — noise is worse than silence here. */
function Delta({
  label,
  value,
  percent = false,
}: {
  label: string;
  value: number;
  percent?: boolean;
}) {
  const rounded = percent ? Math.round(value * 1000) / 10 : Math.round(value);
  if (rounded === 0) return null;

  return (
    <span
      className={`tabular-nums ${rounded > 0 ? 'text-moss-400' : 'text-blood-400'}`}
      title={label}
    >
      {rounded > 0 ? '+' : ''}
      {rounded}
      {percent ? '%' : ''} {label}
    </span>
  );
}

export function StockCard({
  item,
  price,
  sold,
  affordable,
  comparison,
  noRoom,
  onBuy,
  index,
}: StockCardProps) {
  const styles = rarityStyles(item.rarity);

  if (sold) {
    return (
      <motion.div
        variants={listItemIn}
        className="chamfer-md border-parchment-500/12 bg-wood-900/45 flex min-h-[13.5rem] flex-col items-center justify-center border border-dashed p-4 text-center"
        data-testid={`stock-sold-${index}`}
      >
        {/* A wrapped parcel, not an empty hole — the gap should look intentional. */}
        <span className="chamfer-sm bg-wood-800/70 text-parchment-500/72 grid h-12 w-12 place-items-center border border-amber-500/15">
          <Icon name="gear" size={20} />
        </span>
        <p className="text-parchment-500/72 mt-3 text-xs">Sold — wrapped and waiting.</p>
      </motion.div>
    );
  }

  const reason = !affordable ? 'Not enough gold.' : noRoom ? 'Your bags are full.' : undefined;

  return (
    <motion.div
      variants={listItemIn}
      className={`chamfer-md surface-timber bg-wood-900/92 flex min-h-[13.5rem] flex-col border ${styles.border} p-4`}
      data-testid={`stock-${index}`}
    >
      <header className="flex items-start gap-2.5">
        <span
          className={`chamfer-sm bg-wood-800 grid h-10 w-10 shrink-0 place-items-center border ${styles.border} ${styles.text}`}
        >
          <Icon name={item.iconId} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`font-display text-sm leading-tight font-bold ${styles.text}`}>
            {item.name}
          </p>
          <p className="text-parchment-500/72 mt-0.5 text-[10px] tracking-wider uppercase">
            {RARITY_LABELS[item.rarity]} · {SLOT_LABELS[item.slot]}
          </p>
        </div>
      </header>

      {item.classLock && (
        <p className="text-parchment-500/72 mt-1.5 text-[10px] italic">
          {classDef(item.classLock).name}s only
        </p>
      )}

      <div className="facet-rule my-2.5" />

      <dl className="space-y-1 text-xs">
        {item.weapon && (
          <div className="flex justify-between">
            <dt className="text-parchment-500/72">Damage</dt>
            <dd className="text-parchment-300 tabular-nums">
              {item.weapon.min}–{item.weapon.max}
            </dd>
          </div>
        )}
        {item.armour !== undefined && (
          <div className="flex justify-between">
            <dt className="text-parchment-500/72">Armour</dt>
            <dd className="text-parchment-300 tabular-nums">{item.armour}</dd>
          </div>
        )}
        {item.specials?.goldFind !== undefined && (
          <div className="flex justify-between">
            <dt className="text-parchment-500/72">Gold find</dt>
            <dd className="text-amber-500 tabular-nums">+{item.specials.goldFind}%</dd>
          </div>
        )}
        {item.specials?.xpBonus !== undefined && (
          <div className="flex justify-between">
            <dt className="text-parchment-500/72">Experience</dt>
            <dd className="text-arcane-500 tabular-nums">+{item.specials.xpBonus}%</dd>
          </div>
        )}

        {/* Attribute lines. A common ring has nothing *but* these — without them the card
            described the item by what it lacked. */}
        {(Object.entries(item.attrs) as [AttributeId, number][]).map(([id, value]) => (
          <div key={id} className="flex justify-between">
            <dt className="text-parchment-500/72">{ATTRIBUTE_LABELS[id]}</dt>
            <dd className="text-parchment-300 tabular-nums">+{value}</dd>
          </div>
        ))}
      </dl>

      {/* The question the player actually came in with. */}
      {comparison && (
        <p
          className="border-parchment-500/10 mt-2.5 flex flex-wrap gap-x-2.5 gap-y-0.5 border-t pt-2 text-[11px]"
          data-testid={`stock-compare-${index}`}
        >
          <Delta label="hp" value={comparison.health} />
          <Delta label="dmg" value={comparison.damageAverage} />
          <Delta label="arm" value={comparison.armour} />
          <Delta label="crit" value={comparison.critChance} percent />
          {comparison.slotWasEmpty && <span className="text-moss-400">empty slot</span>}
        </p>
      )}

      <div className="mt-auto pt-3">
        <ActionButton
          size="sm"
          fullWidth
          cost={{ gold: price }}
          {...(reason ? { disabledReason: reason } : {})}
          onClick={onBuy}
          data-testid={`buy-${index}`}
        >
          Buy
        </ActionButton>
        <p className="text-parchment-500/72 mt-1.5 flex items-center justify-center gap-1 text-[10px]">
          <CoinIcon size={10} />
          sells back for {item.value.toLocaleString()}
        </p>
      </div>
    </motion.div>
  );
}
