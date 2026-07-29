/**
 * The icon vocabulary.
 *
 * Declared here in the data layer rather than in the components layer, because content
 * (places, items, pets, currencies) needs to *name* an icon while staying React-free.
 * `src/components/icons` implements exactly this list — a missing glyph is a type error,
 * not a runtime blank.
 */

export const ICON_IDS = [
  // places
  'tankard',
  'hero',
  'noticeBoard',
  'patrol',
  'armory',
  'gem',
  'anvil',
  'stables',
  'paw',
  'arena',
  'laurel',
  'banner',
  'stairsDown',
  'dice',
  'gear',
  // currencies & status
  'coin',
  'lock',
  'chevron',
  'hourglass',
  'spark',
] as const;

export type IconId = (typeof ICON_IDS)[number];
