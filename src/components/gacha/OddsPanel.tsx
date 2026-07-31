'use client';

/**
 * The odds panel (gacha spec §7, CLAUDE.md rule 6).
 *
 * Not a disclosure buried in a menu — a permanent fixture of the room, showing the exact
 * distribution of whichever banner the player is looking at. The numbers come from
 * `outcomeOdds()`, which reads the same weights `rollOutcome()` rolls against, so there is no
 * version of this panel that can print a rate the engine does not honour.
 *
 * It also names what the panel *cannot* show as a row: the Gilded Snail rides on top of a normal
 * card rather than replacing one, so it gets a line of its own rather than a misleading 1% row
 * that would appear to compete with the others.
 */

import { motion } from 'motion/react';
import {
  DUPE_STARMETAL,
  OUTCOME_LABELS,
  ROLL_OUTCOMES,
  SHARDS_PER_RECIPE,
  SNAIL_CHANCE,
  outcomeOdds,
  type BannerDef,
} from '@/data/banners';
import { rarityStyles } from '@/components/items/ItemCard';
import { snappy } from '@/styles/motion';
import type { RollOutcome } from '@/data/banners';

/** Written out rather than derived: Tailwind v4 only compiles class names it can *see*. */
const ROW_TONE: Readonly<Record<RollOutcome, string>> = {
  featured: 'text-rarity-set',
  epic: 'text-rarity-epic',
  rare: 'text-rarity-rare',
  uncommon: 'text-rarity-uncommon',
  materials: 'text-arcane-500',
  gold: 'text-amber-500',
  ale: 'text-parchment-500/80',
};

const BAR_TONE: Readonly<Record<RollOutcome, string>> = {
  featured: 'bg-rarity-set',
  epic: 'bg-rarity-epic',
  rare: 'bg-rarity-rare',
  uncommon: 'bg-rarity-uncommon',
  materials: 'bg-arcane-500',
  gold: 'bg-amber-500',
  ale: 'bg-parchment-500/60',
};

export function OddsPanel({ definition }: { definition: BannerDef }) {
  // Ordered by what they are worth, not by weight — the panel reads as a ladder that way, and
  // the two rows anyone actually checks are at the top.
  const rows = [...ROLL_OUTCOMES].sort(
    (a, b) => ROLL_OUTCOMES.indexOf(a) - ROLL_OUTCOMES.indexOf(b),
  );
  const widest = Math.max(...rows.map((outcome) => outcomeOdds(definition, outcome)));

  return (
    <div data-testid="odds-panel" data-banner={definition.id}>
      <ul className="space-y-1.5">
        {rows.map((outcome) => {
          const share = outcomeOdds(definition, outcome);
          return (
            <li key={outcome} className="flex items-center gap-2.5 text-[11px]">
              <span className={`w-24 shrink-0 ${ROW_TONE[outcome]}`}>
                {OUTCOME_LABELS[outcome]}
              </span>
              <span className="chamfer-sm bg-wood-900 h-1.5 min-w-0 flex-1 overflow-hidden">
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${widest === 0 ? 0 : (share / widest) * 100}%` }}
                  transition={snappy}
                  className={`block h-full ${BAR_TONE[outcome]}`}
                />
              </span>
              <span
                className="text-parchment-300 w-12 shrink-0 text-right tabular-nums"
                data-testid={`odds-${outcome}`}
              >
                {share.toFixed(share < 10 ? 1 : 0)}%
              </span>
            </li>
          );
        })}
      </ul>

      <div className="facet-rule my-3" />

      <ul className="text-parchment-500/72 space-y-1.5 text-[10px] leading-relaxed">
        {definition.pity > 0 && (
          <li>
            Every {definition.pity}th card without a featured hit <em>is</em> a featured hit. The
            counter follows the set, not the week — it keeps its place when the table turns over.
          </li>
        )}
        <li>
          A featured card is always a piece you are <em>missing</em>. Once the set is whole it
          converts instead: {DUPE_STARMETAL} Starmetal and a shard, {SHARDS_PER_RECIPE} shards to a
          pattern.
        </li>
        {definition.id === 'monthly' && (
          <li className={rarityStyles('set').text}>
            A {(SNAIL_CHANCE * 100).toFixed(0)}% chance of the Gilded Snail rides on top of any card
            here — it never replaces the one you were owed, which is why it is not a row.
          </li>
        )}
        <li>
          Golden Dice are earned and never sold. There is nothing on this table you can buy your way
          past.
        </li>
      </ul>
    </div>
  );
}
