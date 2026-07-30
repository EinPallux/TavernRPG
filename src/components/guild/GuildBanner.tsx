'use client';

/**
 * A guild's banner (guilds spec §1: the banner builder).
 *
 * Drawn rather than imaged, from a field colour, a charge colour and an optional sigil. Sixty
 * authored halls plus whatever the player founds is more combinations than an asset set would
 * cover, and a banner that is *composed* means the founding flow can preview the real thing
 * live rather than a stand-in.
 *
 * Shared by the browse list, the Hall of Fame's guild tab and the hall itself, so a guild looks
 * the same everywhere it appears — which is most of what makes it feel like a real one.
 */

import { motion, useReducedMotion } from 'motion/react';
import type { BannerColour, SigilIcon } from '@/data/guilds';
import { Icon } from '@/components/icons';
import { dramatic } from '@/styles/motion';

/**
 * The palette, as literal hex.
 *
 * Not Tailwind classes: the banner is an SVG and these are `fill` values, so they have to be
 * real colours. Kept in step with `globals.css` by hand — there are eight of them and they have
 * not changed since Phase 1.
 */
export const BANNER_HEX: Readonly<Record<BannerColour, string>> = {
  amber: '#e8a33d',
  ember: '#d96c2f',
  blood: '#a73a2e',
  moss: '#4c7a3f',
  arcane: '#6b5b95',
  parchment: '#d8cbb4',
  wood: '#5c4630',
  ink: '#241b12',
};

export interface GuildBannerProps {
  readonly field: BannerColour;
  readonly charge: BannerColour;
  /** Drawn over the field when the hall has one. The sixty use a plain chevron. */
  readonly sigil?: SigilIcon | null;
  readonly size?: number;
  /** Sways on mount, for the founding preview and the hall's own header. */
  readonly animate?: boolean;
  readonly className?: string;
}

export function GuildBanner({
  field,
  charge,
  sigil = null,
  size = 28,
  animate = false,
  className = '',
}: GuildBannerProps) {
  const reduced = useReducedMotion();
  const height = Math.round(size * 1.25);

  return (
    <motion.span
      initial={animate && !reduced ? { rotate: -6, y: -4, opacity: 0 } : false}
      animate={{ rotate: 0, y: 0, opacity: 1 }}
      transition={dramatic}
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height }}
      aria-hidden
    >
      <svg viewBox="0 0 16 20" className="h-full w-full drop-shadow-[0_2px_3px_rgb(0_0_0/0.5)]">
        {/* Field, cut to a pennant so it reads as cloth rather than a swatch. */}
        <path d="M0 0h16v15l-8 5-8-5V0Z" fill={BANNER_HEX[field]} />
        {/* Charge: a chevron when there is no sigil, so a bare banner is still a device. */}
        {!sigil && <path d="M8 3.5 11.5 9.5h-7L8 3.5Z" fill={BANNER_HEX[charge]} />}
        <path d="M0 0h16v15l-8 5-8-5V0Z" fill="none" stroke="rgb(0 0 0 / 0.35)" strokeWidth="0.6" />
      </svg>

      {sigil && (
        <span
          className="absolute inset-x-0 top-[14%] grid place-items-center"
          style={{ color: BANNER_HEX[charge] }}
        >
          <Icon name={sigil} size={Math.round(size * 0.58)} />
        </span>
      )}
    </motion.span>
  );
}
