/**
 * The icon set — game-icons.net artwork, vendored and attributed (style guide §6, CREDITS.md).
 *
 * 67 of the 68 ids in `data/icons.ts` resolve to a drawing from game-icons.net, chosen per id in
 * `scripts/icon-map.mjs`, vendored under `game_assets/icons/<author>/<name>.svg` and compiled into
 * `vendored.ts` by `npm run icons:sync`. They are **filled silhouettes on a 512 grid**, where the
 * set they replaced was hand-drawn stroke work on a 24 grid — a deliberate trade the game asked
 * for: a beer stein that is a beer stein and twelve companions you can tell apart beat a uniform
 * line weight.
 *
 * **The licence is per icon.** CC BY 3.0 requires naming the artist, not the collection, so the
 * author travels with the drawing from the vendored path into `VENDORED_ICONS` and on into
 * CREDITS.md. `icons.test.ts` fails if any shipped author is missing from that table.
 *
 * Two things here are deliberately *not* vendored art:
 *
 * - **`ChevronIcon`** is a direction, not a thing. There is no drawing of "next" that beats an
 *   arrow, and importing one would make the control harder to read for the sake of matching a set
 *   it does not belong to.
 * - **`VigorTankard`** is a *meter*, not an icon: its clip path is tied to the mug it draws, so
 *   the ale level can be a real liquid line (style guide §7). Swapping its artwork would break
 *   the geometry that makes it work. It keeps its hand-drawn 24-grid body.
 *
 * Everything is sized by the `size` prop and coloured by CSS `color`, exactly as before, so no
 * call site changed.
 */

import type { SVGProps } from 'react';
import type { IconId } from '@/data/icons';
import { VENDORED_ICONS, VENDORED_VIEWBOX, type VendoredIconId } from './vendored';

export type { IconId };
export { VENDORED_ICONS, VENDORED_AUTHORS, type VendoredIcon } from './vendored';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
}

/**
 * The hand-drawn wrapper: 24-grid, stroked, round caps. Two glyphs still use it — see the
 * module note.
 */
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

/**
 * The vendored wrapper: 512-grid, filled, `currentColor`.
 *
 * `fill="currentColor"` and no stroke is the whole difference from `Glyph`, and it is why every
 * existing text-colour class still tints these correctly.
 */
function Emblem({ size = 20, icon, ...rest }: IconProps & { icon: VendoredIconId }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={VENDORED_VIEWBOX}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={VENDORED_ICONS[icon].d} />
    </svg>
  );
}

/** One component per vendored drawing, built from the data rather than written out sixty-seven times. */
function emblem(id: VendoredIconId): (props: IconProps) => React.ReactElement {
  // `icon`, not `id`: `IconProps` extends `SVGProps`, which has its own `id`, so a prop called
  // `id` is both shadowed by the spread and unable to set a real DOM id. The compiler caught it.
  const Component = (props: IconProps) => <Emblem {...props} icon={id} />;
  // Named for React DevTools and for the component-stack line in a test failure.
  Component.displayName = `Icon(${id})`;
  return Component;
}

/* ── The one glyph that stays a line drawing ─────────────────────────────────────── */

export const ChevronIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M9 5l7 7-7 7" />
  </Glyph>
);

/* ── Named exports, for the call sites that import a glyph directly ──────────────── */

export const ArenaIcon = emblem('arena');
export const BannerIcon = emblem('banner');
export const CoinIcon = emblem('coin');
export const DiceIcon = emblem('dice');
export const EssenceIcon = emblem('essence');
export const GearIcon = emblem('gear');
export const HeroIcon = emblem('hero');
export const HourglassIcon = emblem('hourglass');
export const KeyIcon = emblem('key');
export const LaurelIcon = emblem('laurel');
export const LockIcon = emblem('lock');
export const PatrolIcon = emblem('patrol');
export const PawIcon = emblem('paw');
export const ScrapIcon = emblem('scrap');
export const SparkIcon = emblem('spark');
export const StairsDownIcon = emblem('stairsDown');
export const StarmetalIcon = emblem('starmetal');
export const TankardIcon = emblem('tankard');
export const TrophyIcon = emblem('trophy');

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
 * Every id in the data layer resolves to a component here.
 *
 * Built by mapping over the vendored table rather than listing sixty-seven lines, so adding an
 * icon is a line in `scripts/icon-map.mjs` and nothing else. `satisfies Record<IconId, …>` still
 * makes a missing id a compile error rather than an empty square in the nav rail — with `chevron`
 * spliced in, since it is the one id with no vendored drawing.
 */
const VENDORED_COMPONENTS = {} as Record<VendoredIconId, (props: IconProps) => React.ReactElement>;
for (const id of Object.keys(VENDORED_ICONS) as VendoredIconId[]) {
  VENDORED_COMPONENTS[id] = emblem(id);
}

export const ICONS = {
  ...VENDORED_COMPONENTS,
  chevron: ChevronIcon,
} satisfies Record<IconId, (props: IconProps) => React.ReactElement>;

export function Icon({ name, ...props }: IconProps & { name: IconId }) {
  const Component = ICONS[name];
  return <Component {...props} />;
}
