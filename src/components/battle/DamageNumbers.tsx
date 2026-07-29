'use client';

/**
 * Floating damage numbers (combat spec §4 step 2).
 *
 * Deliberately *not* spring-animated: the timeline already knows how far through its life each
 * number is, so position and fade are read straight off `progress`. That keeps them in lockstep
 * with the fight at ×4 speed, where a spring would still be easing the first number while the
 * fourth has already landed.
 */

import type { Side } from '@/engine/combat/types';
import type { BattleFrame } from './timeline';

export interface DamageNumbersProps {
  numbers: BattleFrame['floatingDamage'];
}

/** Fighters stand at the quarter marks; numbers rise from just above the one that was hit. */
const ORIGIN_X: Record<Side, string> = { a: '28%', b: '72%' };

export function DamageNumbers({ numbers }: DamageNumbersProps) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" data-testid="damage-numbers">
      {numbers.map((number) => {
        // Out fast, then drift: most of the travel happens in the first third of its life.
        const eased = 1 - (1 - number.progress) ** 2;
        const rise = 18 + eased * 66;
        const opacity = number.progress > 0.7 ? (1 - number.progress) / 0.3 : 1;
        // Crits punch in from oversized (spec: ×1.6 scale, gold).
        const scale = number.crit ? 1.6 - Math.min(0.35, number.progress * 0.9) : 1;
        const drift = number.side === 'a' ? -1 : 1;

        return (
          <span
            key={number.id}
            className={`font-display absolute top-1/2 block -translate-x-1/2 leading-none font-extrabold tabular-nums ${
              number.crit
                ? 'text-3xl text-amber-400 [text-shadow:0_0_18px_rgb(240_184_98/0.85),0_2px_0_rgb(24_18_14/0.9)]'
                : 'text-parchment-300 text-xl [text-shadow:0_2px_0_rgb(24_18_14/0.9)]'
            }`}
            style={{
              left: ORIGIN_X[number.side],
              transform: `translate(calc(-50% + ${drift * eased * 16}px), ${-rise}px) scale(${scale})`,
              opacity,
            }}
          >
            −{number.amount.toLocaleString()}
            {number.crit && <span className="ml-1 align-super text-sm tracking-widest">CRIT</span>}
          </span>
        );
      })}
    </div>
  );
}
