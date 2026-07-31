/**
 * The twelve companions, as glyphs.
 *
 * Same line-carved family as everything else: 24×24, `currentColor`, 1.5 stroke. They live in
 * their own file rather than in `items.tsx` because a pet is not an item — nothing in the game
 * treats them as interchangeable, and putting a tortoise next to a breastplate in one registry
 * would be the first step toward something doing so.
 *
 * Drawn for **silhouette legibility first**: every stall in the Menagerie shows unowned pets as a
 * dimmed outline, so the shape has to say "tortoise" at 34px with no colour and no detail. That
 * is a stricter constraint than the item icons face, and it is why each of these is essentially
 * one recognisable profile plus at most two marks.
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

/** Ember Pup — sitting dog in profile, ears up, tail curled. */
export const PetPupIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M6 9.5 4.5 5.5l3.2 1.6h4.6l3.2-1.6-1.5 4" />
    <path d="M6 9.5c0 3 1.6 4.6 3.5 5.2V20h5v-4.6c2-.9 3.2-2.6 3.2-5" />
    <path d="M17.7 15.4c1.7.4 2.6 1.8 2.3 3.4" />
    <path d="M9 10.5h.01M13.5 10.5h.01" />
  </Glyph>
);

/** Moss Tortoise — domed shell with plates, head out, two feet. */
export const PetTortoiseIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M4.5 15.5a7.5 5.5 0 0 1 15 0Z" />
    <path d="M9 15.5c0-2.4.7-4.2 3-4.2s3 1.8 3 4.2M6.6 12.6h10.8" />
    <path d="M19.5 15.5c1.4-.4 2.3-1.4 2.3-2.6a2 2 0 0 0-2-2c-.7 0-1.3.3-1.7.9" />
    <path d="M7 15.5v2.2M16 15.5v2.2" />
  </Glyph>
);

/** Gloom Cat — pointed ears, narrow eyes, a tail that curves away. */
export const PetCatIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M7 9 5.5 4.8 9 7h6l3.5-2.2L17 9" />
    <path d="M7 9a5 5 0 0 0 10 0" />
    <path d="M9 8.2c.5.5 1.2.5 1.7 0M13.3 8.2c.5.5 1.2.5 1.7 0" />
    <path d="M11 13.5h2M12 13.5v1.4M12 14.9c-1.6 0-2.4 1.4-2.4 3S10.6 21 12 21h4" />
    <path d="M16 21c2 0 3.3-1.4 3.3-3.2 0-1.3-.7-2.2-1.6-2.6" />
  </Glyph>
);

/** Owl of Vesna — two great eyes, tufted brows, folded wings. */
export const PetOwlIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M5.5 8.5 4 4.8l3.4 2M18.5 8.5 20 4.8l-3.4 2" />
    <path d="M5.5 10.5a6.5 6.5 0 0 1 13 0c0 5.4-2.9 9.5-6.5 9.5S5.5 15.9 5.5 10.5Z" />
    <circle cx="9.3" cy="10" r="2" />
    <circle cx="14.7" cy="10" r="2" />
    <path d="M12 12.5 11 14h2l-1-1.5Z" />
  </Glyph>
);

/** Coin Toad — squat body, wide mouth, a coin balanced on top. */
export const PetToadIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="12" cy="4.5" r="2" />
    <path d="M4.5 16c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6c0 1.7-1 2.8-2.4 2.8H6.9C5.5 18.8 4.5 17.7 4.5 16Z" />
    <path d="M8.5 12.5c.6.6 1.5.6 2.1 0M13.4 12.5c.6.6 1.5.6 2.1 0" />
    <path d="M8.6 16h6.8" />
    <path d="M4.6 18.8 3 21M19.4 18.8 21 21" />
  </Glyph>
);

/** Brass Beetle — carapace with a seam, six legs, two antennae. */
export const PetBeetleIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M9 5.5 7 3.5M15 5.5 17 3.5" />
    <path d="M12 5.5a2.5 2.5 0 0 1 2.5 2.5h-5A2.5 2.5 0 0 1 12 5.5Z" />
    <path d="M6.5 13c0-3.3 2.5-5 5.5-5s5.5 1.7 5.5 5-2.5 7-5.5 7-5.5-3.7-5.5-7Z" />
    <path d="M12 8.5v11" />
    <path d="M6.6 10.5 3.5 8.7M6.6 14.5H3.2M7.4 18l-2.6 2M17.4 10.5l3.1-1.8M17.4 14.5h3.4M16.6 18l2.6 2" />
  </Glyph>
);

/** Tankard Imp — a tankard with horns, and something looking over the rim. */
export const PetImpIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M8 4.5 6.6 2.2 9.4 3.4M16 4.5l1.4-2.3-2.8 1.2" />
    <path d="M6.5 8h11v10.5a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V8Z" />
    <path d="M17.5 10.5H20a1.5 1.5 0 0 1 1.5 1.5v2.4a1.5 1.5 0 0 1-1.5 1.5h-2.5" />
    <path d="M9.4 11.4h.01M14.6 11.4h.01" />
    <path d="M10 14.5c1.2.9 2.8.9 4 0" />
  </Glyph>
);

/** Sooty Raven — hunched profile, heavy beak, one folded wing. */
export const PetRavenIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M15.5 5.5a3.5 3.5 0 0 0-3.5 3.5c0 1.5-1 2.4-2.4 3.2-2 1.1-3.6 2.8-3.6 5.3h9c3.2 0 5.5-2.4 5.5-5.6 0-2.4-1.1-4-2.5-5" />
    <path d="M19 8.4 22 7l-2.7 2.5" />
    <path d="M15.4 7.5h.01" />
    <path d="M11.5 12.5c1.8 1.4 3 3.1 3.2 5" />
    <path d="M8.5 17.5v3M13 17.5v3" />
  </Glyph>
);

/** Frost Fox — sharp muzzle, big ears, a plume of a tail. */
export const PetFoxIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M6.5 10 5 4.5 9.2 7.4M17.5 10 19 4.5l-4.2 2.9" />
    <path d="M6.5 10c0 2.3 1.3 3.9 2.8 4.7L12 18l2.7-3.3c1.5-.8 2.8-2.4 2.8-4.7" />
    <path d="M9.6 10.4h.01M14.4 10.4h.01" />
    <path d="M12 13.4v1" />
    <path d="M14.7 14.7c2.9.3 4.8 2 4.8 4.3 0 1-.5 1.7-1.3 1.7-1 0-1.6-.8-1.6-1.9" />
  </Glyph>
);

/** Cellar Rat King — three heads under one crown, tails knotted below. */
export const PetRatKingIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M6 6.5 4.5 2.8l3 1.7 2.5-2 2 2 2.5-2 3 2-1.5 2" />
    <circle cx="7.8" cy="10.3" r="2.6" />
    <circle cx="16.2" cy="10.3" r="2.6" />
    <circle cx="12" cy="12.6" r="2.9" />
    <path d="M6.4 12.9c-1.9 1.6-2.6 3.9-1.4 6.1M17.6 12.9c1.9 1.6 2.6 3.9 1.4 6.1M12 15.5v4.6" />
  </Glyph>
);

/** Wisp of the Chapel — a flame with no candle, trailing sparks. */
export const PetWispIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M12 2.8c2.6 3 4.2 5.2 4.2 7.6a4.2 4.2 0 0 1-8.4 0c0-2.4 1.6-4.6 4.2-7.6Z" />
    <path d="M12 7.6c1 1.4 1.6 2.3 1.6 3.2a1.6 1.6 0 0 1-3.2 0c0-.9.6-1.8 1.6-3.2Z" />
    <path d="M6.5 15.5c-.6 1.5-.4 3 .6 4.3M17.5 15.5c.6 1.5.4 3-.6 4.3" />
    <path d="M12 17.5v3.4" />
  </Glyph>
);

/** Gilded Snail — spiral shell, two eye stalks, an unhurried foot. */
export const PetSnailIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="10" cy="11.5" r="5.5" />
    <path d="M10 11.5a2.6 2.6 0 1 1 2.4-1.6M10 11.5a5.5 5.5 0 0 0 5.4-4.5" />
    <path d="M15.5 17H4.5c-.9 0-1.5-.6-1.5-1.4 0-.9.7-1.6 1.7-1.6" />
    <path d="M15.5 17c2.2 0 3.6-1.4 3.6-3.4V9.4" />
    <path d="M19.1 9.4a1.3 1.3 0 1 0 0-2.6M16.4 10a1.2 1.2 0 1 0 0-2.4" />
  </Glyph>
);

export const PET_ICONS = {
  petPup: PetPupIcon,
  petTortoise: PetTortoiseIcon,
  petCat: PetCatIcon,
  petOwl: PetOwlIcon,
  petToad: PetToadIcon,
  petBeetle: PetBeetleIcon,
  petImp: PetImpIcon,
  petRaven: PetRavenIcon,
  petFox: PetFoxIcon,
  petRatKing: PetRatKingIcon,
  petWisp: PetWispIcon,
  petSnail: PetSnailIcon,
};
