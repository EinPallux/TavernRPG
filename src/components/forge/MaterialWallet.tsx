'use client';

/**
 * The materials wallet (crafting spec §2).
 *
 * Deliberately **not** in the global HUD. Scrap, Essence and Starmetal only mean anything at
 * Torvald's bench, and a permanent three-chip strip in the top bar would be three numbers the
 * player carries around and never uses. The spec says "HUD-visible at forge only"; this is that.
 *
 * Every chip flashes when its number changes, because a smelt whose payout you have to go and
 * find is a smelt that did not feel like a payout.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { MaterialBundle } from '@/engine/items/types';
import { MATERIAL_LABELS } from '@/engine/forge/forgeConfig';
import { EssenceIcon, ScrapIcon, StarmetalIcon, type IconProps } from '@/components/icons';

type MaterialId = keyof MaterialBundle;

export const MATERIAL_ICONS: Readonly<
  Record<MaterialId, (props: IconProps) => React.ReactElement>
> = {
  scrap: ScrapIcon,
  essence: EssenceIcon,
  starmetal: StarmetalIcon,
};

/** Each material gets its own colour so a cost line is readable without reading it. */
export const MATERIAL_TONE: Readonly<Record<MaterialId, string>> = {
  scrap: 'text-parchment-500/80',
  essence: 'text-arcane-500',
  starmetal: 'text-amber-400',
};

export const MATERIAL_ORDER: readonly MaterialId[] = ['scrap', 'essence', 'starmetal'];

/** True when a bundle asks for nothing — used to hide empty cost rows. */
export function isFree(bundle: MaterialBundle): boolean {
  return bundle.scrap === 0 && bundle.essence === 0 && bundle.starmetal === 0;
}

/** A cost or a yield, written the same way everywhere: `12 ▣ · 6 ◆`. */
export function MaterialCost({
  bundle,
  size = 12,
  className = '',
  showZero = false,
  signed = false,
}: {
  bundle: MaterialBundle;
  size?: number;
  className?: string;
  showZero?: boolean;
  signed?: boolean;
}) {
  const shown = MATERIAL_ORDER.filter((id) => showZero || bundle[id] > 0);
  if (shown.length === 0) return <span className={className}>—</span>;

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {shown.map((id) => {
        const Glyph = MATERIAL_ICONS[id];
        return (
          <span
            key={id}
            className={`inline-flex items-center gap-1 tabular-nums ${MATERIAL_TONE[id]}`}
            title={MATERIAL_LABELS[id]}
          >
            <Glyph size={size} />
            {signed && bundle[id] > 0 ? '+' : ''}
            {bundle[id]}
          </span>
        );
      })}
    </span>
  );
}

/** One wallet chip, which flares when the count moves. */
function WalletChip({ id, amount }: { id: MaterialId; amount: number }) {
  const Glyph = MATERIAL_ICONS[id];
  const previous = useRef(amount);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    if (previous.current === amount) return;
    previous.current = amount;
    setFlash((tick) => tick + 1);
  }, [amount]);

  return (
    <motion.span
      key={id}
      animate={flash > 0 ? { scale: [1, 1.12, 1] } : {}}
      // A tween, not `snappy`: springs only take two keyframes, and a there-and-back pulse is
      // three. Motion warns and drops the animation entirely if you hand it a spring.
      transition={{ duration: 0.34, times: [0, 0.35, 1], ease: 'easeOut' }}
      className={`chamfer-sm border-parchment-500/15 bg-wood-900/80 flex items-center gap-1.5 border px-2.5 py-1.5 text-xs tabular-nums ${MATERIAL_TONE[id]}`}
      data-testid={`material-${id}`}
      title={MATERIAL_LABELS[id]}
    >
      <Glyph size={13} />
      {amount.toLocaleString()}
    </motion.span>
  );
}

export function MaterialWallet({
  materials,
  className = '',
}: {
  materials: MaterialBundle;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="material-wallet">
      {MATERIAL_ORDER.map((id) => (
        <WalletChip key={id} id={id} amount={materials[id]} />
      ))}
    </div>
  );
}
