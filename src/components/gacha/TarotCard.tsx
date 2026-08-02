'use client';

/**
 * One card, face-down then face-up (gacha spec §6).
 *
 * The flip is the whole product. A gacha result delivered as a line of text is a spreadsheet
 * entry; the same result delivered after a card turns over is the thing people come back for.
 * So the rarity buildup is real — grey shimmer, blue pulse, purple arc, gold beam — and it is
 * driven by what actually came up rather than being a fixed flourish with the answer stapled on.
 *
 * The result is already in the save before this mounts. Nothing here can change what was rolled;
 * it can only take longer to say it.
 */

import { motion, useReducedMotion } from 'motion/react';
import type { Rarity } from '@/engine/items/types';
import type { GachaResult } from '@/engine/gacha/roll';
import { rarityStyles } from '@/components/items/ItemCard';
import { Icon, CoinIcon, SparkIcon, TankardIcon } from '@/components/icons';
import { MATERIAL_ICONS } from '@/components/forge/MaterialWallet';
import { gearSet } from '@/data/gearSets';
import { dramatic, snappy } from '@/styles/motion';

/** How loud a card is allowed to be. Drives the glow, the beam and the flip's anticipation. */
export type CardTone = Rarity;

export function toneOf(result: GachaResult): CardTone {
  switch (result.reward.kind) {
    case 'item':
      return result.reward.item.rarity;
    case 'dupe':
      return 'set';
    case 'gold':
      return 'uncommon';
    case 'materials':
      return 'uncommon';
    case 'ale':
      return 'common';
  }
}

const AURA: Readonly<Record<CardTone, string>> = {
  common: 'shadow-[0_0_0_1px_rgb(154_147_139/0.35)]',
  uncommon: 'shadow-[0_0_22px_-8px_rgb(111_168_78/0.9)]',
  rare: 'shadow-[0_0_26px_-8px_rgb(74_143_212/0.95)]',
  epic: 'shadow-[0_0_32px_-8px_rgb(155_95_208/1)]',
  set: 'shadow-[0_0_40px_-6px_rgb(232_163_61/1)]',
  // Unreachable: Fortune's Table never deals a legendary, permanently and by design
  // (`legendaries.md` §4). Present because `CardTone` is `Rarity` and an exhaustive record is
  // how that stays true — if the banner ever could, this is the aura it would wear.
  legendary: 'shadow-[0_0_44px_-6px_rgb(255_90_31/1)]',
};

/** The face of a card, once it has turned over. */
function Face({ result }: { result: GachaResult }) {
  const tone = toneOf(result);
  const styles = rarityStyles(tone);
  const { reward } = result;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
      <span className={`${styles.text}`}>
        {reward.kind === 'item' ? (
          <Icon name={reward.item.iconId} size={34} />
        ) : reward.kind === 'gold' ? (
          <CoinIcon size={34} />
        ) : reward.kind === 'ale' ? (
          <TankardIcon size={34} />
        ) : reward.kind === 'dupe' ? (
          <Icon name={gearSet(reward.setId)?.sigil ?? 'laurel'} size={34} />
        ) : (
          <MATERIAL_ICONS.essence size={34} />
        )}
      </span>

      <p className={`font-display text-[11px] leading-tight font-bold ${styles.text}`}>
        {result.label}
      </p>

      {reward.kind === 'gold' && (
        <p className="text-parchment-500/72 text-[11px] tabular-nums">
          {reward.gold.toLocaleString()} gold
        </p>
      )}
      {reward.kind === 'materials' && (
        <p className="text-parchment-500/72 text-[10px]">
          {[
            reward.materials.scrap && `${reward.materials.scrap} Scrap`,
            reward.materials.essence && `${reward.materials.essence} Essence`,
            reward.materials.starmetal && `${reward.materials.starmetal} Starmetal`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {reward.kind === 'dupe' && (
        <p className="text-parchment-500/72 text-[10px] leading-snug">
          {reward.materials.starmetal} Starmetal + a shard
        </p>
      )}
      {reward.kind === 'item' && reward.item.setId && (
        <p className="text-rarity-set/80 text-[10px]">Set piece</p>
      )}

      {result.pitied && (
        <span className="text-ember-400 flex items-center gap-1 text-[9px] tracking-wider uppercase">
          <SparkIcon size={9} />
          owed
        </span>
      )}
    </div>
  );
}

export interface TarotCardProps {
  readonly result: GachaResult;
  /** Face-up. Until then the back is showing. */
  readonly revealed: boolean;
  /** Beat within a spread, for the stagger. */
  readonly index?: number;
  readonly onClick?: () => void;
  readonly 'data-testid'?: string;
}

export function TarotCard({ result, revealed, index = 0, onClick, ...rest }: TarotCardProps) {
  const reduced = useReducedMotion();
  const tone = toneOf(result);
  const styles = rarityStyles(tone);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, rotate: index % 2 ? 4 : -4 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ ...dramatic, delay: reduced ? 0 : index * 0.06 }}
      className="relative h-40 w-28 shrink-0 [perspective:900px]"
      data-testid={rest['data-testid']}
      data-tone={tone}
      data-revealed={revealed}
      aria-label={revealed ? result.label : 'A card, face down'}
    >
      <motion.div
        animate={{ rotateY: revealed ? 0 : 180 }}
        transition={reduced ? { duration: 0 } : { ...dramatic, delay: index * 0.09 }}
        className="relative h-full w-full [transform-style:preserve-3d]"
      >
        {/* Face */}
        <div
          className={`chamfer-md bg-wood-900/95 absolute inset-0 border-2 [backface-visibility:hidden] ${styles.border} ${AURA[tone]}`}
        >
          <Face result={result} />
        </div>

        {/* Back — the same tarot back on every card, so nothing leaks before the turn. */}
        <div
          className="chamfer-md border-arcane-500/45 bg-wood-800 absolute inset-0 grid place-items-center border-2 [backface-visibility:hidden]"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <span className="text-arcane-500/60">
            <SparkIcon size={30} />
          </span>
          <span
            aria-hidden
            className="border-arcane-500/25 pointer-events-none absolute inset-2 border"
          />
        </div>
      </motion.div>

      {/* The beam, for cards worth a beam. */}
      {revealed && !reduced && (tone === 'epic' || tone === 'set') && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0, scaleY: 0.3 }}
          animate={{ opacity: [0, 0.85, 0], scaleY: 1 }}
          transition={{ duration: 1.1, delay: index * 0.09, ease: 'easeOut' }}
          className={`pointer-events-none absolute -inset-x-4 -top-24 -bottom-4 bg-gradient-to-t blur-xl ${
            tone === 'set' ? 'from-rarity-set/60' : 'from-rarity-epic/55'
          } to-transparent`}
          style={{ transformOrigin: 'bottom' }}
        />
      )}
    </motion.button>
  );
}

export { snappy };
