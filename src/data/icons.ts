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
  'key',
  'trophy',
  // forge materials (crafting spec §1)
  'scrap',
  'essence',
  'starmetal',
  // weapons — class-restricted families (docs/design/systems/items-and-gear.md §1)
  'sword',
  'axe',
  'mace',
  'lute',
  'horn',
  'drum',
  'staff',
  'wand',
  'bow',
  'crossbow',
  'saber',
  'rapier',
  // offhands
  'shield',
  'songbook',
  'orb',
  'quiver',
  'dagger',
  // armour
  'helm',
  'chestplate',
  'gloves',
  'boots',
  'belt',
  // jewellery
  'amulet',
  'ring',
  'trinket',
  // the stalls at the Wandering Stables
  'mule',
  'courser',
  'warhorse',
  'griffin',
] as const;

export type IconId = (typeof ICON_IDS)[number];
