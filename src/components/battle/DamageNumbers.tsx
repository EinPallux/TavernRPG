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
import type { StageAnchor } from './ParticleLayer';
import type { BattleFrame } from './timeline';

export interface DamageNumbersProps {
  numbers: BattleFrame['floatingDamage'];
  /**
   * Measured portrait centres — the same ones the particles bloom at.
   *
   * These used to be the constants 28% and 72% while the particle layer used 30% and 70%: two
   * hard-coded guesses at one number, disagreeing by a fifth of a portrait, and both wrong on any
   * window the fighter row's `max-w-5xl` cap actually bites on. A number rising two inches from
   * the sparks it belongs to is the kind of thing nobody reports and everybody feels.
   */
  anchors: Readonly<Record<Side, StageAnchor>>;
}

export function DamageNumbers({ numbers, anchors }: DamageNumbersProps) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" data-testid="damage-numbers">
      {numbers.map((number) => {
        /*
         * Out fast, then drift: most of the travel happens in the first third of its life.
         *
         * The 62px floor clears the portrait. The anchors are portrait *centres* now, and the
         * first version of this kept the old 18px offset — which had been measured against the
         * middle of the stage, so every number appeared written across the fighter's face. A
         * damage number belongs in the air above somebody, not on them.
         */
        const eased = 1 - (1 - number.progress) ** 2;
        const rise = 62 + eased * 74;
        const opacity = number.progress > 0.7 ? (1 - number.progress) / 0.3 : 1;
        // Crits punch in from oversized (spec: ×1.6 scale, gold).
        const scale = number.crit ? 1.6 - Math.min(0.35, number.progress * 0.9) : 1;
        const drift = number.side === 'a' ? -1 : 1;

        const at = anchors[number.side];

        return (
          <span
            key={number.id}
            className={`font-display absolute block -translate-x-1/2 leading-none font-extrabold tabular-nums ${
              number.heal
                ? // A boss drinking your missed swing has to read as the *opposite* of a hit, or
                  // the player watches their damage numbers climb and assumes they are winning.
                  'text-moss-400 text-xl [text-shadow:0_0_14px_rgb(76_122_63/0.7),0_2px_0_rgb(24_18_14/0.9)]'
                : number.crit
                  ? 'text-3xl text-amber-400 [text-shadow:0_0_18px_rgb(240_184_98/0.85),0_2px_0_rgb(24_18_14/0.9)]'
                  : 'text-parchment-300 text-xl [text-shadow:0_2px_0_rgb(24_18_14/0.9)]'
            }`}
            style={{
              left: `${at.x * 100}%`,
              top: `${at.y * 100}%`,
              transform: `translate(calc(-50% + ${drift * eased * 16}px), ${-rise}px) scale(${scale})`,
              opacity,
            }}
          >
            {number.heal ? '+' : '−'}
            {number.amount.toLocaleString()}
            {number.crit && <span className="ml-1 align-super text-sm tracking-widest">CRIT</span>}
          </span>
        );
      })}
    </div>
  );
}
