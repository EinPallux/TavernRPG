'use client';

/**
 * The bench: pick a slot, pick an investment, strike (crafting spec §3).
 *
 * **The odds on the tiles are the odds in the engine.** `forgeOdds()` reads the same
 * `FORGE_TIER_DEFS` entry `rollForgeRarity()` rolls against, so there is no version of this
 * screen that can print a number the dice do not honour. That is rule 6 — odds always visible —
 * implemented as a shared object rather than as a promise.
 *
 * The slot picker is the actual product here. World loot decides what it drops; the forge is the
 * one place a player can say "a weapon" and be answered, and the whole tier ladder is priced
 * against that.
 */

import { motion } from 'motion/react';
import {
  EMBER_PITY,
  FORGE_TIER_DEFS,
  canAfford,
  forgeOdds,
  type ForgeTier,
  type ForgeTierDef,
} from '@/engine/forge/forgeConfig';
import {
  RARITY_LABELS,
  SLOT_IDS,
  SLOT_LABELS,
  type MaterialBundle,
  type Rarity,
  type SlotId,
} from '@/engine/items/types';
import { rarityStyles } from '@/components/items/ItemCard';
import { ActionButton } from '@/components/ui/ActionButton';
import { Icon, SparkIcon } from '@/components/icons';
import type { IconId } from '@/data/icons';
import { listItemIn, snappy, staggerChildren } from '@/styles/motion';
import { MaterialCost } from './MaterialWallet';

/** The empty-cell glyph vocabulary the paperdoll already uses, so a slot reads the same twice. */
const SLOT_GLYPH: Readonly<Record<SlotId, IconId>> = {
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

const ODDS_ORDER: readonly Exclude<Rarity, 'set'>[] = ['common', 'uncommon', 'rare', 'epic'];

/**
 * Written out rather than derived from `rarityStyles().text`.
 *
 * Tailwind v4 scans source for *literal* class names; a `text-` → `bg-` string swap produces a
 * class at runtime that was never compiled, and the bar renders transparent. Cost an afternoon
 * elsewhere once already.
 */
const ODDS_FILL: Readonly<Record<Exclude<Rarity, 'set'>, string>> = {
  common: 'bg-rarity-common',
  uncommon: 'bg-rarity-uncommon',
  rare: 'bg-rarity-rare',
  epic: 'bg-rarity-epic',
};

/** The published odds, as a stacked bar and as four numbers. Both, because players differ. */
function OddsBar({ tier }: { tier: ForgeTierDef }) {
  return (
    <div data-testid={`odds-${tier.id}`}>
      <div className="chamfer-sm border-parchment-500/10 bg-wood-900 flex h-2 w-full overflow-hidden border">
        {ODDS_ORDER.map((rarity) => {
          const share = forgeOdds(tier, rarity);
          if (share === 0) return null;
          return (
            <motion.span
              key={rarity}
              initial={{ width: 0 }}
              animate={{ width: `${share}%` }}
              transition={snappy}
              className={`block ${ODDS_FILL[rarity]}`}
            />
          );
        })}
      </div>

      <dl className="mt-1.5 grid grid-cols-4 gap-1 text-[10px]">
        {ODDS_ORDER.map((rarity) => (
          <div key={rarity} className="text-center">
            <dt className={`${rarityStyles(rarity).text} opacity-80`}>
              {RARITY_LABELS[rarity].slice(0, 1)}
            </dt>
            <dd className="text-parchment-500/72 tabular-nums">
              {forgeOdds(tier, rarity).toFixed(0)}%
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export interface ForgeBenchProps {
  readonly slot: SlotId;
  readonly onSlot: (slot: SlotId) => void;
  readonly wallet: MaterialBundle;
  readonly emberMeter: number;
  readonly bagsFull: boolean;
  readonly onCraft: (tier: ForgeTier) => void;
}

export function ForgeBench({
  slot,
  onSlot,
  wallet,
  emberMeter,
  bagsFull,
  onCraft,
}: ForgeBenchProps) {
  const pityReady = emberMeter >= EMBER_PITY;

  /*
   * Two columns at desktop width, not three stacked rows.
   *
   * Stacked, the slot picker's ten tiles stretch to 160px each on a 1440p screen and the ember
   * meter becomes a metre-long bar — a layout that technically fills the viewport (rule 4) while
   * looking like a form. The decision is "which slot, at what price", so the two halves of it
   * belong side by side.
   */
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <div className="space-y-4">
        {/* ── The slot ──────────────────────────────────────────────── */}
        <div>
          <p className="font-display text-parchment-500/72 mb-2 text-[0.65rem] tracking-[0.3em] uppercase">
            What are we making?
          </p>
          <motion.div
            initial="hidden"
            animate="visible"
            transition={staggerChildren(0.03)}
            className="grid grid-cols-5 gap-2"
            data-testid="slot-picker"
          >
            {SLOT_IDS.map((id) => {
              const active = id === slot;
              return (
                <motion.button
                  key={id}
                  type="button"
                  variants={listItemIn}
                  onClick={() => onSlot(id)}
                  whileTap={{ scale: 0.95 }}
                  aria-pressed={active}
                  className={`chamfer-sm flex flex-col items-center gap-1 border px-1 py-2.5 text-[10px] transition-colors ${
                    active
                      ? 'bg-wood-900/80 border-amber-500/70 text-amber-300'
                      : 'border-parchment-500/12 bg-wood-900/55 text-parchment-500/72 hover:text-parchment-300 hover:border-amber-500/40'
                  }`}
                  data-testid={`forge-slot-${id}`}
                >
                  <Icon name={SLOT_GLYPH[id]} size={18} />
                  {SLOT_LABELS[id]}
                </motion.button>
              );
            })}
          </motion.div>
        </div>

        {/* ── The ember meter ─────────────────────────────────────────── */}
        <div
          className={`chamfer-sm border px-3 py-2.5 ${
            pityReady
              ? 'border-ember-600/60 bg-ember-600/12'
              : 'border-parchment-500/12 bg-wood-900/55'
          }`}
          data-testid="ember-meter"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-[0.65rem] tracking-[0.3em] text-amber-500 uppercase">
              Ember meter
            </p>
            <span className="text-parchment-500/72 text-[11px] tabular-nums">
              {Math.min(emberMeter, EMBER_PITY)}/{EMBER_PITY}
            </span>
          </div>

          <div className="mt-2 flex gap-1.5">
            {Array.from({ length: EMBER_PITY }, (_, index) => (
              <motion.span
                key={index}
                initial={false}
                animate={{
                  opacity: index < emberMeter ? 1 : 0.2,
                  scale: index < emberMeter ? 1 : 0.85,
                }}
                transition={snappy}
                className={`chamfer-sm h-2 flex-1 ${index < emberMeter ? 'bg-ember-600' : 'bg-parchment-500/25'}`}
              />
            ))}
          </div>

          <p className="text-parchment-500/72 mt-2 text-[11px] leading-relaxed">
            {pityReady ? (
              <span className="text-ember-400 flex items-center gap-1.5 font-semibold">
                <SparkIcon size={12} />
                The next Master forge is an Epic. Guaranteed.
              </span>
            ) : (
              `Every Master forge banks an ember. At ${EMBER_PITY}, the next one is Epic whatever the dice say.`
            )}
          </p>
        </div>

        <p className="text-parchment-500/72 text-[11px] leading-relaxed">
          The world decides what it drops. Here you decide the slot — that is what the materials are
          buying, on top of Epic odds no drop table comes close to.
        </p>
      </div>

      {/* ── The three investments ───────────────────────────────────── */}
      <motion.div
        initial="hidden"
        animate="visible"
        transition={staggerChildren(0.06)}
        className="grid auto-rows-min gap-3 lg:grid-cols-3"
        data-testid="forge-tiers"
      >
        {FORGE_TIER_DEFS.map((tier) => {
          const affordable = canAfford(wallet, tier.cost);
          const guaranteed = tier.feedsPity && pityReady;

          return (
            <motion.div
              key={tier.id}
              variants={listItemIn}
              className={`chamfer-md flex flex-col border p-3 ${
                guaranteed
                  ? 'border-ember-600/60 bg-ember-600/10 shadow-[0_0_28px_-14px_rgb(217_108_47/0.9)]'
                  : 'border-parchment-500/12 bg-wood-900/60'
              }`}
              data-testid={`forge-tier-${tier.id}`}
            >
              <p className="font-display text-parchment-300 text-sm font-bold">{tier.name}</p>
              <p className="text-parchment-500/72 mt-0.5 mb-3 min-h-[2.4rem] text-[11px] leading-snug">
                {tier.blurb}
              </p>

              <OddsBar tier={tier} />

              <div className="mt-3 flex items-center justify-between gap-2">
                <MaterialCost bundle={tier.cost} size={12} className="text-[11px]" />
              </div>

              <div className="mt-2.5">
                <ActionButton
                  size="sm"
                  fullWidth
                  variant={guaranteed ? 'primary' : 'secondary'}
                  onClick={() => onCraft(tier.id)}
                  {...(bagsFull
                    ? { disabledReason: 'Your bags are full — sell, stow or melt something first.' }
                    : !affordable
                      ? { disabledReason: 'Not enough in the bucket for that one.' }
                      : {})}
                  data-testid={`craft-${tier.id}`}
                >
                  {guaranteed ? 'Strike (Epic)' : 'Strike'}
                </ActionButton>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
