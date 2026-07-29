'use client';

/**
 * The stage every place is set on (style guide §2, asset-pipeline §5).
 *
 * Backdrops are static images, so life comes from layered effects rather than new art: a
 * hearth glow that breathes, embers that rise, dust motes in lantern light. Each place picks
 * a recipe, which is also how re-used backdrops (the tavern serves four screens) still feel
 * like different rooms — different tint, different air.
 */

import type { ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';

export type AmbientEffect = 'hearth' | 'embers' | 'motes' | 'lantern';

export interface AmbientStageProps {
  /** Path under /assets/backgrounds. */
  backdrop: string;
  /** Colour wash over the backdrop — how one backdrop becomes several rooms. */
  tint?: string;
  effects?: readonly AmbientEffect[];
  children: ReactNode;
  className?: string;
}

function Embers({ count = 9 }: { count?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="animate-ember absolute bottom-16 block h-1 w-1 bg-amber-500/70"
          style={{
            left: `${6 + index * 10.5}%`,
            animationDelay: `${index * 0.6}s`,
            animationDuration: `${4.5 + (index % 4)}s`,
          }}
        />
      ))}
    </div>
  );
}

function Motes({ count = 14 }: { count?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="animate-mote bg-parchment-300/40 absolute block h-[3px] w-[3px] rounded-[1px]"
          style={{
            left: `${(index * 7.3) % 100}%`,
            top: `${20 + ((index * 13) % 60)}%`,
            animationDelay: `${index * 0.8}s`,
            animationDuration: `${8 + (index % 5)}s`,
          }}
        />
      ))}
    </div>
  );
}

export function AmbientStage({
  backdrop,
  tint = 'from-wood-900 via-wood-900/72 to-wood-900/45',
  effects = ['hearth'],
  children,
  className = '',
}: AmbientStageProps) {
  const reduceMotion = useReducedMotion();
  const has = (effect: AmbientEffect) => effects.includes(effect);

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${backdrop}')` }}
      />

      <div
        aria-hidden
        className={`absolute inset-0 bg-gradient-to-t ${tint} ${
          has('hearth') && !reduceMotion ? 'animate-hearth' : ''
        }`}
      />

      {has('lantern') && !reduceMotion && (
        <div
          aria-hidden
          className="animate-lantern pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(38% 44% at 18% 34%, rgb(232 163 61 / 0.22), transparent 70%)',
          }}
        />
      )}

      {has('embers') && !reduceMotion && <Embers />}
      {has('motes') && !reduceMotion && <Motes />}

      <div className="relative h-full w-full">{children}</div>
    </div>
  );
}
