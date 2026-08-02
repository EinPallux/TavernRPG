'use client';

/**
 * The reforge bench — the Emberforge's fourth (legendaries spec §6).
 *
 * The loop that makes the Legendary chase never terminate: a named piece's two affixes are re-rolled
 * for Starmetal, and it **replaces**. There is no keep-the-better-one, because a re-roll you cannot
 * lose is not a decision — so the whole design of this panel is *showing what you have before the
 * press*, at the same size as what you might get.
 *
 * The size of the roll space is printed, because "odds always visible" (rule 6) has to mean
 * something at a bench whose output is not a rarity. It reads it from `rollSpaceOf`, which reads
 * the same pool the roll draws from — the shared-object discipline `forgeOdds` has kept since
 * Phase 12.
 */

import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/icons';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTooltip } from '@/components/ui/Tooltip';
import { REFORGE_COST, canAfford } from '@/engine/forge/forgeConfig';
import { rollSpaceOf } from '@/engine/items/legendary';
import { affixLine, legendaryDef } from '@/data/legendaries';
import type { Item, MaterialBundle } from '@/engine/items/types';
import { snappy } from '@/styles/motion';

/** One affix, as the line the card shows. Shared by both columns so they cannot drift. */
function AffixList({ item, tone }: { item: Item; tone: 'now' | 'was' }) {
  return (
    <ul className="space-y-1.5">
      {(item.legendary?.affixes ?? []).map((affix) => (
        <li
          key={affix.id}
          className={`text-xs leading-snug ${tone === 'now' ? 'text-parchment-300' : 'text-parchment-500/72 line-through'}`}
        >
          {affixLine(affix.id, affix.magnitude)}
        </li>
      ))}
    </ul>
  );
}

export interface ReforgeBenchProps {
  readonly items: readonly Item[];
  readonly selected: string | null;
  readonly onSelect: (uid: string) => void;
  readonly wallet: MaterialBundle;
  /** The roll immediately before the last strike, so the trade is visible rather than implied. */
  readonly previous: Item | null;
  readonly onReforge: () => void;
}

export function ReforgeBench({
  items,
  selected,
  onSelect,
  wallet,
  previous,
  onReforge,
}: ReforgeBenchProps) {
  const item = items.find((entry) => entry.uid === selected) ?? items[0] ?? null;
  const affordable = canAfford(wallet, REFORGE_COST);
  const definition = item?.legendary ? legendaryDef(item.legendary.defId) : undefined;
  const costTip = useTooltip(
    `Starmetal is the scarcest material in Emberhollow. You hold ${wallet.starmetal}.`,
  );

  if (items.length === 0) {
    return (
      <p className="text-parchment-500/72 text-xs leading-relaxed" data-testid="reforge-empty">
        Nothing named on the bench. Legendaries come out of the Sundered Anvil, out of the two
        dungeons above it, and — rarely — off a contract in the far country. Bring Torvald one and
        he will strike it again.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="reforge-bench">
      {/* The shelf: every named piece the hero holds, worn or bagged. */}
      <div className="flex flex-wrap gap-1.5">
        {items.map((entry) => (
          <ActionButton
            key={entry.uid}
            size="sm"
            variant={entry.uid === item?.uid ? 'primary' : 'secondary'}
            onClick={() => onSelect(entry.uid)}
            data-testid={`reforge-pick-${entry.uid}`}
          >
            {entry.name}
          </ActionButton>
        ))}
      </div>

      {item && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* What you have. Deliberately first and full size — this is the thing at risk. */}
          <div className="chamfer-sm border-rarity-legendary/30 bg-wood-900/60 border p-3">
            <p className="text-rarity-legendary flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
              <Icon name="spark" size={13} />
              On the bench
              {item.legendary && item.legendary.reforges > 0 && (
                <span className="text-parchment-500/72 ml-auto normal-case tabular-nums">
                  struck ×{item.legendary.reforges}
                </span>
              )}
            </p>
            <p className="text-parchment-300 mt-2 text-sm font-semibold">{item.name}</p>
            <div className="facet-rule my-2" />
            <AffixList item={item} tone="now" />
          </div>

          {/* What the last strike took away, when there was one. */}
          <div className="chamfer-sm border-parchment-500/12 bg-wood-900/40 border p-3">
            <p className="text-parchment-500/72 text-[11px] font-semibold tracking-wider uppercase">
              The roll before
            </p>
            <AnimatePresence mode="wait">
              {previous?.legendary ? (
                <motion.div
                  key={`${previous.uid}:${previous.legendary.reforges}`}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={snappy}
                >
                  <p className="text-parchment-500/72 mt-2 text-sm">{previous.name}</p>
                  <div className="facet-rule my-2" />
                  <AffixList item={previous} tone="was" />
                </motion.div>
              ) : (
                <p className="text-parchment-500/72 mt-2 text-xs leading-relaxed">
                  Nothing yet. A strike replaces what is on the bench — there is no keeping the
                  better of the two, so read it before you press.
                </p>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {definition && (
        <p className="text-parchment-500/72 text-[11px] leading-relaxed" data-testid="reforge-odds">
          Two affixes drawn from {definition.affixPool.length},{' '}
          <span className="text-parchment-300 tabular-nums">
            {rollSpaceOf(definition).toLocaleString()}
          </span>{' '}
          distinct rolls in all. Every one is as likely as every other.
        </p>
      )}

      <div className="border-parchment-500/15 flex items-center gap-3 border-t pt-3">
        <ActionButton
          onClick={onReforge}
          disabled={!affordable || !item}
          data-testid="reforge-strike"
        >
          Strike it again
        </ActionButton>
        <span
          {...costTip}
          className={`flex items-center gap-1 text-xs tabular-nums ${affordable ? 'text-parchment-300' : 'text-blood-400'}`}
        >
          <Icon name="starmetal" size={14} />
          {REFORGE_COST.starmetal} Starmetal
        </span>
      </div>
    </div>
  );
}
