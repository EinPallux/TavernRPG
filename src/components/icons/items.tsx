/**
 * Item glyphs — weapons, offhands, armour and jewellery.
 *
 * Same line-carved family as the UI chrome (`./index.tsx`): 24×24, `currentColor`, 1.5 stroke.
 *
 * **On sourcing:** the plan calls for game-icons.net here, since content icons want variety and
 * that library has thousands. That library is unreachable from the build sandbox, so these are
 * drawn in-house for now. Swapping later is contained: content data references stable `iconId`
 * strings declared in `src/data/icons.ts`, so only this registry's implementation changes —
 * no item, class or drop-table data is touched. See docs/tech/asset-pipeline.md §2.
 */

import type { IconProps } from './index';

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

/* ── Warrior weapons ─────────────────────────────────────────────────────────────── */

export const SwordIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M14.5 2.5 19 7l-9 9-4.5-4.5 9-9Z" />
    <path d="M5.5 16.5 3 21l4.5-2.5" />
    <path d="M8.2 13.8 10 15.6" opacity={0.5} />
  </Glyph>
);

export const AxeIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M6 21 16 5" />
    <path d="M12.5 3.5c3 0 6 1.6 7.5 4-2.4 1.6-4.2 4-8 2.6-1-.4-2-.2-2.6.5C8 8 9.5 3.5 12.5 3.5Z" />
  </Glyph>
);

export const MaceIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M4 20 10 14" />
    <circle cx="14.5" cy="9.5" r="4.2" />
    <path d="M14.5 3.5v2M14.5 13.5v2M8.8 9.5h2M18.2 9.5h2M10.6 5.6l1.4 1.4M17 12l1.4 1.4M18.4 5.6 17 7M12 12l-1.4 1.4" />
  </Glyph>
);

/* ── Bard instruments ────────────────────────────────────────────────────────────── */

export const LuteIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M9.5 21c-3 0-5-2-5-4.6 0-3 2.4-4.6 4.4-5.6l6-6" />
    <path d="M9.5 21c2.6 0 4.4-1.6 4.4-3.8 0-2.4-2-3.2-3.6-4" />
    <path d="M15 5.5 19 2l3 3-3.4 3.8" />
    <circle cx="9.5" cy="16" r="1.6" />
  </Glyph>
);

export const HornIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M3 15c0-5 4-9 9-9 4 0 7 2 9 5l-2.5 1.5" />
    <path d="M3 15c0 3 2.5 5 5.5 5 4 0 6-2.5 7-5" />
    <path d="M18.5 11.5 21 16l-3.5.5" />
  </Glyph>
);

export const DrumIcon = (props: IconProps) => (
  <Glyph {...props}>
    <ellipse cx="12" cy="8" rx="8" ry="3.5" />
    <path d="M4 8v6c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5V8" />
    <path d="M7 10.5 9.5 16M17 10.5 14.5 16" opacity={0.6} />
  </Glyph>
);

/* ── Mage weapons ────────────────────────────────────────────────────────────────── */

export const StaffIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M6.5 21 15 8.5" />
    <path d="M16 2.5c2.5 0 4.5 2 4.5 4.4 0 2.5-2 4.4-4.5 4.4s-4.5-2-4.5-4.4c0-2.4 2-4.4 4.5-4.4Z" />
    <path d="M16 5.2v3.6M14.2 7h3.6" opacity={0.6} />
  </Glyph>
);

export const WandIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M4 20 14.5 9.5" />
    <path d="M18 3l1.1 3.1L22 7.2l-2.9 1.1L18 11.4l-1.1-3.1L14 7.2l2.9-1.1L18 3Z" />
    <path d="M6.5 14.5 9 17" opacity={0.5} />
  </Glyph>
);

/* ── Hunter weapons ──────────────────────────────────────────────────────────────── */

export const BowIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M6 3c6 2.4 9.6 8.4 9.6 15" />
    <path d="M6 3 4.5 6M15.6 18l3 1.5" opacity={0.7} />
    <path d="M5 5.5 18.5 19" />
    <path d="M17 15.5 21 19.5M17.5 19.5 21 19.5 21 15.8" />
  </Glyph>
);

export const CrossbowIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M3 7c3.5 0 6.5 1.6 8.5 4M21 7c-3.5 0-6.5 1.6-8.5 4" />
    <path d="M3 7v2.5M21 7v2.5" />
    <path d="M12 3v14" />
    <path d="M8 17h8l-4 4-4-4Z" />
  </Glyph>
);

/* ── Swashbuckler weapons ────────────────────────────────────────────────────────── */

export const SaberIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M20 3c-6 1.5-11 6-13.5 12" />
    <path d="M6.5 15 4 20l5-2.5" />
    <path d="M4.5 15.5c-1.6.6-2 2-1.3 3" opacity={0.65} />
  </Glyph>
);

export const RapierIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M18.5 2.5 8 13" />
    <path d="M6 15 4 21l6-2" />
    <path d="M6.6 11.4c-2 0-3.2 1.4-3.2 3s1.2 2.6 2.8 2.6" />
  </Glyph>
);

/* ── Offhands ────────────────────────────────────────────────────────────────────── */

export const ShieldIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M12 2.5 20 5.5v6.2c0 4.6-3.2 8.6-8 9.8-4.8-1.2-8-5.2-8-9.8V5.5l8-3Z" />
    <path d="M12 7v8M8.5 11h7" opacity={0.6} />
  </Glyph>
);

export const SongbookIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M4 4.5h6.5c1 0 1.5.6 1.5 1.5v14c0-.9-.5-1.5-1.5-1.5H4v-14Z" />
    <path d="M20 4.5h-6.5c-1 0-1.5.6-1.5 1.5v14c0-.9.5-1.5 1.5-1.5H20v-14Z" />
    <path d="M15.5 13.5V9l2.5-.8" opacity={0.8} />
    <circle cx="14.6" cy="13.8" r="1" fill="currentColor" stroke="none" opacity={0.8} />
  </Glyph>
);

export const OrbIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="12" cy="11" r="6.5" />
    <path d="M8.4 6.6c1.4 1.6 4.2 2 6.4.6" opacity={0.65} />
    <path d="M6 17.5 5 21h14l-1-3.5" />
  </Glyph>
);

export const QuiverIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M7 8h8l-1 12.5H8L7 8Z" />
    <path d="M9.5 8V3.5M12 8V2.5M14.5 8V4" />
    <path d="M8.6 2.2 9.5 3.5l1-1.2M11.1 1.2 12 2.5l1-1.3M13.6 2.7l.9 1.3 1-1.3" opacity={0.75} />
  </Glyph>
);

export const DaggerIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M12 2.5 15 9v7h-6V9l3-6.5Z" />
    <path d="M7.5 16h9" />
    <path d="M12 16v5" />
  </Glyph>
);

/* ── Armour ──────────────────────────────────────────────────────────────────────── */

export const HelmIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M4.5 12a7.5 7.5 0 0 1 15 0v5.5c0 1.4-1.2 2.5-2.6 2.5H7.1a2.6 2.6 0 0 1-2.6-2.5V12Z" />
    <path d="M4.5 12.5h15" opacity={0.6} />
    <path d="M9.5 15.5v2.5M14.5 15.5v2.5M12 12.5v7" opacity={0.75} />
  </Glyph>
);

export const ChestIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M8.5 3 12 5.5 15.5 3l4.5 2.5-1.5 4 1 10.5H4.5l1-10.5-1.5-4L8.5 3Z" />
    <path d="M12 5.5V20" opacity={0.55} />
    <path d="M5.5 9.5h13" opacity={0.45} />
  </Glyph>
);

export const GlovesIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M6 10V5.5a1.6 1.6 0 0 1 3.2 0V10M9.2 9.5V4a1.6 1.6 0 0 1 3.2 0v5.5M12.4 9.5V5a1.6 1.6 0 0 1 3.2 0v6" />
    <path d="M15.6 11V8.6a1.5 1.5 0 0 1 3 0v5.9c0 3.4-2.6 6-6 6h-1.4c-3 0-5.2-2-5.2-5V10" />
  </Glyph>
);

export const BootsIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M7 3h4.5v8.5c0 2 .8 3 2.6 3.8l4 1.8c1.2.5 1.9 1.2 1.9 2.4v1.5H7V3Z" />
    <path d="M7 15h4.6" opacity={0.6} />
    <path d="M4 21h16" opacity={0.45} />
  </Glyph>
);

export const BeltIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M2.5 9h19v6h-19z" />
    <path d="M9 7.5h6v9H9z" />
    <path d="M12 10.5v3" opacity={0.7} />
  </Glyph>
);

/* ── Jewellery ───────────────────────────────────────────────────────────────────── */

export const AmuletIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M6 2.5c-1.6 3.4-2 6.4-1.2 9M18 2.5c1.6 3.4 2 6.4 1.2 9" />
    <path d="M12 11.5 16 15l-4 6.5L8 15l4-3.5Z" />
    <path d="M8 15h8" opacity={0.6} />
  </Glyph>
);

export const RingIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="12" cy="14.5" r="6" />
    <path d="M12 8.5 9.5 5h5L12 8.5Z" />
    <path d="M9.5 5 12 2l2.5 3" />
  </Glyph>
);

export const TrinketIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M12 3.5 14 8l4.8.5-3.6 3.3 1 4.8L12 14.2 7.8 16.6l1-4.8L5.2 8.5 10 8l2-4.5Z" />
    <path d="M12 16.5v4M9.5 21h5" opacity={0.6} />
  </Glyph>
);

export const ITEM_ICONS = {
  sword: SwordIcon,
  axe: AxeIcon,
  mace: MaceIcon,
  lute: LuteIcon,
  horn: HornIcon,
  drum: DrumIcon,
  staff: StaffIcon,
  wand: WandIcon,
  bow: BowIcon,
  crossbow: CrossbowIcon,
  saber: SaberIcon,
  rapier: RapierIcon,
  shield: ShieldIcon,
  songbook: SongbookIcon,
  orb: OrbIcon,
  quiver: QuiverIcon,
  dagger: DaggerIcon,
  helm: HelmIcon,
  chestplate: ChestIcon,
  gloves: GlovesIcon,
  boots: BootsIcon,
  belt: BeltIcon,
  amulet: AmuletIcon,
  ring: RingIcon,
  trinket: TrinketIcon,
} as const;
