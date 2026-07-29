/**
 * The icon set — hand-authored, single-weight "line-carved" glyphs (style guide §6).
 *
 * These are UI chrome (navigation, currencies, status), deliberately drawn as one family so the
 * interface reads as a designed whole rather than an icon-pack collage. Item, monster and pet
 * art comes from game-icons.net via the asset manifest from Phase 2 (see CREDITS.md) — a
 * different job with different needs.
 *
 * Conventions: 24×24 viewBox, stroke-based, `currentColor`, 1.5 stroke, round caps/joins.
 * Everything is sized by the `size` prop and coloured by CSS `color`.
 */

import type { SVGProps } from 'react';
import type { IconId } from '@/data/icons';

export type { IconId };

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
}

function Glyph({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ── Places ──────────────────────────────────────────────────────────────────────── */

export const TankardIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M6 7h10v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7Z" />
    <path d="M16 10h2.5a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5H16" />
    <path d="M6 7c0-1.5 1-2.5 2.5-2.5S11 5.2 12 5.2s1.5-.7 2.5-.7S16 5.5 16 7" />
    <path d="M9.5 11v6M12.5 11v6" opacity={0.55} />
  </Glyph>
);

export const HeroIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M12 3c2.8 0 4.5 1.9 4.5 4.6 0 2.9-2 5.4-4.5 5.4S7.5 10.5 7.5 7.6C7.5 4.9 9.2 3 12 3Z" />
    <path d="M7.5 8h9" opacity={0.55} />
    <path d="M4 21v-1.5c0-2.6 3.4-4.5 8-4.5s8 1.9 8 4.5V21" />
  </Glyph>
);

export const NoticeBoardIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M4 4h16v12H4z" />
    <path d="M8 16v4M16 16v4" />
    <path d="M7.5 8h6M7.5 11.5h9" opacity={0.7} />
  </Glyph>
);

export const PatrolIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M12 3l7 2.5v6c0 4.2-2.9 8-7 9.5-4.1-1.5-7-5.3-7-9.5v-6L12 3Z" />
    <path d="M12 8v5" />
    <path d="M12 15.5h.01" />
  </Glyph>
);

/** Sword over shield — a shop, distinct from the arena's crossed blades. */
export const ArmoryIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M14.5 2.5 17 5l-7.5 7.5-2.5-2.5L14.5 2.5Z" />
    <path d="M7 10 4.5 12.5 6 14l2.5-2.5" />
    <path d="M4 15.2c3.2 0 5.2-1.2 5.2-1.2s2 1.2 5.2 1.2v2.6c0 2-2.2 3.4-5.2 4.2-3-.8-5.2-2.2-5.2-4.2v-2.6Z" />
  </Glyph>
);

export const GemIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M7 4h10l4 5-9 11-9-11 4-5Z" />
    <path d="M3 9h18" />
    <path d="M9.5 9 12 20 14.5 9 12 4 9.5 9Z" opacity={0.7} />
  </Glyph>
);

export const AnvilIcon = (props: IconProps) => (
  <Glyph {...props}>
    {/* Horn, body, waist, base — the classic anvil silhouette. */}
    <path d="M2.5 8.5h12l3.5 2.5H21l-2 3.5H9.5a7 7 0 0 1-7-6V8.5Z" />
    <path d="M9.5 14.5v2.5" />
    <path d="M5.5 21h9l-2-4h-5l-2 4Z" />
  </Glyph>
);

/** Horseshoe — reads instantly at 19px where a horse's head does not. */
export const StablesIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M7.5 20.5v-3.2a6 6 0 1 1 9 0v3.2" />
    <path d="M7.5 20.5h3v-2.8h-3v2.8ZM13.5 20.5h3v-2.8h-3v2.8Z" />
    <path d="M9.6 8.4a3.6 3.6 0 0 1 4.8 0" opacity={0.55} />
  </Glyph>
);

export const PawIcon = (props: IconProps) => (
  <Glyph {...props}>
    <ellipse cx="8" cy="7.5" rx="2" ry="2.5" />
    <ellipse cx="16" cy="7.5" rx="2" ry="2.5" />
    <ellipse cx="4.8" cy="13" rx="1.8" ry="2.2" />
    <ellipse cx="19.2" cy="13" rx="1.8" ry="2.2" />
    <path d="M12 12c2.8 0 5 2.2 5 4.6 0 2-1.5 3.4-3.4 3.4-1 0-1.2-.4-1.6-.4s-.6.4-1.6.4C8.5 20 7 18.6 7 16.6 7 14.2 9.2 12 12 12Z" />
  </Glyph>
);

export const ArenaIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M4 3l11 11M20 3 9 14" />
    <path d="M4 3h3l10 10-2 2L4 6V3Z" opacity={0.55} />
    <path d="M6.5 20.5 9.5 17.5M17.5 20.5 14.5 17.5" />
    <path d="M4.5 18.5 7.5 21.5M19.5 18.5 16.5 21.5" />
  </Glyph>
);

export const LaurelIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M12 21c-4 0-7-3.4-7-8 0-4 2-7.5 4-9" />
    <path d="M12 21c4 0 7-3.4 7-8 0-4-2-7.5-4-9" />
    <path d="M7 9c1.6-.4 2.6.2 3 1.6M6 13c1.7-.2 2.6.6 2.8 2M18 13c-1.7-.2-2.6.6-2.8 2M17 9c-1.6-.4-2.6.2-3 1.6" />
  </Glyph>
);

export const BannerIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M6 3h12v13l-6-3.5L6 16V3Z" />
    <path d="M6 3v18" opacity={0.5} />
    <path d="M12 7v3.5" opacity={0.7} />
  </Glyph>
);

export const StairsDownIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M3 5h5v4h5v4h5v4h3" />
    <path d="M18 13v4M13 9v4M8 5v4" opacity={0.5} />
    <path d="M12 20l2.5-2.5M12 20 9.5 17.5" opacity={0.7} />
  </Glyph>
);

export const DiceIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7L12 2.5Z" />
    <path d="M3.5 7 12 11.5 20.5 7M12 11.5v10" opacity={0.6} />
    <circle cx="8" cy="9.4" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="16" cy="9.4" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
  </Glyph>
);

/** A cog with real teeth — thin radial spokes read as a sunburst at small sizes. */
export const GearIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.6l1.7.5.5 2.2 1.9.8 1.9-1.2 1.3 1.3-1.2 1.9.8 1.9 2.2.5.5 1.7-.5 1.7-2.2.5-.8 1.9 1.2 1.9-1.3 1.3-1.9-1.2-1.9.8-.5 2.2-1.7.5-1.7-.5-.5-2.2-1.9-.8-1.9 1.2-1.3-1.3 1.2-1.9-.8-1.9-2.2-.5L2.6 12l.5-1.7 2.2-.5.8-1.9-1.2-1.9 1.3-1.3 1.9 1.2 1.9-.8.5-2.2L12 2.6Z" />
  </Glyph>
);

/* ── Currencies & status ─────────────────────────────────────────────────────────── */

export const CoinIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="5.2" opacity={0.55} />
    <path d="M12 9.2v5.6M10.4 10.4h3.2" opacity={0.8} />
  </Glyph>
);

export const LockIcon = (props: IconProps) => (
  <Glyph {...props}>
    <rect x="5" y="10.5" width="14" height="10" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    <path d="M12 14v3" />
  </Glyph>
);

export const ChevronIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M9 5l7 7-7 7" />
  </Glyph>
);

export const HourglassIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M6 3h12M6 21h12" />
    <path d="M7.5 3v3.2c0 2 1.6 3.6 3.2 4.8L12 12l1.3-1c1.6-1.2 3.2-2.8 3.2-4.8V3" />
    <path d="M7.5 21v-3.2c0-2 1.6-3.6 3.2-4.8L12 12l1.3 1c1.6 1.2 3.2 2.8 3.2 4.8V21" />
  </Glyph>
);

export const SparkIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3Z" />
  </Glyph>
);

/**
 * The Vigor tankard — not a plain glyph: the ale level is the meter, so it takes a fill
 * ratio and renders a real liquid line (style guide §7 "meters").
 */
export function VigorTankard({
  size = 22,
  ratio: rawRatio,
  ...rest
}: Omit<IconProps, 'fill'> & { ratio: number }) {
  const ratio = Math.max(0, Math.min(1, rawRatio));
  // Interior of the mug runs from y=7 (rim) to y=19.5 (base).
  const top = 7.5;
  const bottom = 19.2;
  const liquidTop = bottom - (bottom - top) * ratio;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <defs>
        <clipPath id="tankard-interior">
          <path d="M6.6 7.2h9.2v11.4a1.6 1.6 0 0 1-1.6 1.6H8.2a1.6 1.6 0 0 1-1.6-1.6V7.2Z" />
        </clipPath>
      </defs>
      {ratio > 0 && (
        <g clipPath="url(#tankard-interior)">
          {/* Half-opacity so the mug's outline still reads when the tankard is full. */}
          <rect
            x="6"
            y={liquidTop}
            width="11"
            height={bottom - liquidTop + 1}
            fill="currentColor"
            opacity={0.45}
            stroke="none"
          />
          {/* Foam line on top of the ale. */}
          <rect
            x="6"
            y={liquidTop}
            width="11"
            height="1.2"
            fill="currentColor"
            opacity={0.9}
            stroke="none"
          />
        </g>
      )}
      <path d="M6.6 7.2h9.2v11.4a1.6 1.6 0 0 1-1.6 1.6H8.2a1.6 1.6 0 0 1-1.6-1.6V7.2Z" />
      <path d="M15.8 9.8h2.1a1.4 1.4 0 0 1 1.4 1.4v2.6a1.4 1.4 0 0 1-1.4 1.4h-2.1" />
      <path d="M6.6 7.2c0-1.4 1-2.3 2.3-2.3s1.9.6 3.1.6 1.4-.6 2.3-.6 1.5.9 1.5 2.3" />
    </svg>
  );
}

/* ── Registry ────────────────────────────────────────────────────────────────────── */

/**
 * Every id declared in the data layer must have a glyph here — `satisfies` makes a missing
 * one a compile error rather than an empty square in the nav rail.
 */
export const ICONS = {
  tankard: TankardIcon,
  hero: HeroIcon,
  noticeBoard: NoticeBoardIcon,
  patrol: PatrolIcon,
  armory: ArmoryIcon,
  gem: GemIcon,
  anvil: AnvilIcon,
  stables: StablesIcon,
  paw: PawIcon,
  arena: ArenaIcon,
  laurel: LaurelIcon,
  banner: BannerIcon,
  stairsDown: StairsDownIcon,
  dice: DiceIcon,
  gear: GearIcon,
  coin: CoinIcon,
  lock: LockIcon,
  chevron: ChevronIcon,
  hourglass: HourglassIcon,
  spark: SparkIcon,
} satisfies Record<IconId, (props: IconProps) => React.ReactElement>;

export function Icon({ name, ...props }: IconProps & { name: IconId }) {
  const Component = ICONS[name];
  return <Component {...props} />;
}
