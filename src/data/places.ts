/**
 * The town of Emberhollow — every place the player can walk to.
 *
 * Content is data (CLAUDE.md): the nav rail, the router, the feature gates and the task pool
 * all read this one list. Adding a place later means adding a row here plus its route.
 *
 * Pure module — no React. Icon ids resolve through the icon registry at render time, and
 * backdrops through the asset pipeline (docs/tech/asset-pipeline.md).
 */

import type { IconId } from './icons';

export type PlaceId =
  | 'tavern'
  | 'character'
  | 'board'
  | 'patrol'
  | 'armory'
  | 'facet'
  | 'forge'
  | 'stables'
  | 'menagerie'
  | 'arena'
  | 'hall'
  | 'guild'
  | 'undertavern'
  | 'fortune'
  | 'settings';

/** Rail grouping — the town has a shape, and the rail should show it. */
export type PlaceGroup = 'tavern' | 'town' | 'beyond' | 'system';

export interface PlaceDef {
  readonly id: PlaceId;
  readonly name: string;
  /** Shorter label for the nav rail, where long names collide with the level tag. */
  readonly railName?: string;
  readonly route: string;
  readonly icon: IconId;
  readonly group: PlaceGroup;
  /** Hero level that unlocks this place (tutorial spec §3). 1 = always available. */
  readonly gateLevel: number;
  /** Who runs the place, if anyone. */
  readonly keeper?: string;
  /** One line describing what you do here — used by the rail tooltip and the stub screens. */
  readonly blurb: string;
  /** Backdrop path under /assets/backgrounds. */
  readonly backdrop: string;
  /**
   * Tint wash. Several places share a backdrop (the tavern serves four screens); the tint and
   * ambience are what make them read as different rooms until dedicated art exists.
   */
  readonly tint?: string;
  readonly effects?: readonly ('hearth' | 'embers' | 'motes' | 'lantern')[];
  /** Which roadmap phase builds the real screen — shown on the placeholder. */
  readonly buildPhase: string;
  /** Placeholder line spoken by the keeper while the place is unbuilt. */
  readonly constructionBark: string;
}

const BG = '/assets/backgrounds';

export const PLACES: readonly PlaceDef[] = [
  {
    id: 'tavern',
    name: 'The Gilded Tankard',
    route: '/tavern',
    icon: 'tankard',
    group: 'tavern',
    gateLevel: 1,
    keeper: 'Marla',
    blurb: 'Take missions, drink ale, hear the news.',
    backdrop: `${BG}/tavern_background.png`,
    effects: ['hearth', 'embers', 'motes'],
    buildPhase: 'Phase 5',
    constructionBark:
      "Quest board's not up yet, love. Sit by the fire — I'll shout when there's work.",
  },
  {
    id: 'character',
    name: 'Your Hero',
    route: '/character',
    icon: 'hero',
    group: 'tavern',
    gateLevel: 1,
    blurb: 'Equipment, backpack and attribute training.',
    backdrop: `${BG}/tavern_background.png`,
    tint: 'from-wood-900 via-wood-900/88 to-wood-900/70',
    effects: ['motes'],
    buildPhase: 'Phase 2',
    constructionBark: 'No hero yet — the paperdoll, backpack and stat training arrive next.',
  },
  {
    id: 'board',
    name: 'Notice Board',
    route: '/board',
    icon: 'noticeBoard',
    group: 'tavern',
    gateLevel: 3,
    blurb: 'Daily tasks, weekly chest, login calendar.',
    backdrop: `${BG}/tavern_background.png`,
    tint: 'from-wood-900 via-wood-900/80 to-wood-900/55',
    effects: ['lantern', 'motes'],
    buildPhase: 'Phase 15',
    constructionBark: 'Nothing pinned up but a woodworm and an old wanted poster.',
  },
  {
    id: 'fortune',
    name: "Fortune's Table",
    route: '/fortune',
    icon: 'dice',
    group: 'tavern',
    gateLevel: 8,
    keeper: 'Madame Vesna',
    blurb: 'Rotating banners. The cards know what you need.',
    backdrop: `${BG}/tavern_background.png`,
    tint: 'from-wood-900 via-arcane-500/12 to-wood-900/60',
    effects: ['lantern'],
    buildPhase: 'Phase 13',
    constructionBark: 'The cards say… come back later. They are rarely this specific.',
  },
  {
    id: 'armory',
    name: 'The Armory',
    route: '/armory',
    icon: 'armory',
    group: 'town',
    gateLevel: 2,
    keeper: 'Bram',
    blurb: 'Weapons and armour, restocked at midnight.',
    backdrop: `${BG}/weaponshop_background.png`,
    effects: ['lantern'],
    buildPhase: 'Phase 7',
    constructionBark: "Shelves are bare. Come back when I've something worth your gold.",
  },
  {
    id: 'facet',
    name: 'The Gilded Facet',
    route: '/facet',
    icon: 'gem',
    group: 'town',
    gateLevel: 2,
    keeper: 'Sela',
    blurb: 'Rings, amulets and trinkets.',
    backdrop: `${BG}/jewelcraftingshop_background.png`,
    effects: ['lantern', 'motes'],
    buildPhase: 'Phase 7',
    constructionBark: 'Everything under this glass is a sample. Lovely, and not for sale.',
  },
  {
    id: 'forge',
    name: 'The Emberforge',
    route: '/forge',
    icon: 'anvil',
    group: 'town',
    gateLevel: 6,
    keeper: 'Torvald',
    blurb: 'Scrap what you loot, gamble it into something better.',
    backdrop: `${BG}/weaponshop_background.png`,
    tint: 'from-wood-900 via-ember-600/18 to-wood-900/55',
    effects: ['hearth', 'embers'],
    buildPhase: 'Phase 12',
    constructionBark: "Forge is cold. Bring me scrap when it's lit and we'll make a mess.",
  },
  {
    id: 'stables',
    name: 'The Wandering Stables',
    railName: 'The Stables',
    route: '/stables',
    icon: 'stables',
    group: 'town',
    gateLevel: 5,
    keeper: 'Odo',
    blurb: 'Mounts. They shorten the road, not the work.',
    backdrop: `${BG}/stable_background.png`,
    effects: ['motes'],
    buildPhase: 'Phase 7',
    constructionBark: "Stalls are empty. The griffin's molting and won't be seen like this.",
  },
  {
    id: 'menagerie',
    name: 'The Menagerie',
    route: '/menagerie',
    icon: 'paw',
    group: 'town',
    gateLevel: 8,
    blurb: 'Twelve companions, one at your side.',
    backdrop: `${BG}/pets_background.png`,
    // Twelve stalls is the densest grid in the game; the wash has to sit heavier than a room
    // you only read one panel in, or the frames lose against the straw.
    tint: 'from-wood-900 via-wood-900/92 to-wood-900/78',
    effects: ['motes'],
    buildPhase: 'Phase 14',
    constructionBark: 'Something in the back is snoring. Best not wake it yet.',
  },
  {
    id: 'patrol',
    name: 'City Watch',
    route: '/patrol',
    icon: 'patrol',
    group: 'town',
    gateLevel: 3,
    keeper: 'Hildy',
    blurb: 'Walk the streets for coin when your Vigor is spent.',
    backdrop: `${BG}/patrol_background.png`,
    effects: ['lantern'],
    buildPhase: 'Phase 6',
    constructionBark: "Rota's not drawn up. Enjoy the quiet while it lasts.",
  },
  {
    id: 'arena',
    name: 'The Proving Grounds',
    railName: 'Proving Grounds',
    route: '/arena',
    icon: 'arena',
    group: 'beyond',
    gateLevel: 4,
    keeper: 'Hildy',
    blurb: 'Duel the ladder. Ten rewarded wins a day.',
    backdrop: `${BG}/arena_background.png`,
    effects: ['lantern'],
    buildPhase: 'Phase 9',
    constructionBark: 'Sand’s not raked and nobody’s signed up. Patience, champion.',
  },
  {
    id: 'hall',
    name: 'Hall of Fame',
    route: '/hall',
    icon: 'laurel',
    group: 'beyond',
    gateLevel: 4,
    blurb: 'Every hero in Aldenvale, ranked by honour.',
    backdrop: `${BG}/arena_background.png`,
    tint: 'from-wood-900 via-wood-900/85 to-amber-500/10',
    effects: ['motes'],
    buildPhase: 'Phase 9',
    constructionBark: 'The plaques are blank. Fifteen hundred heroes are still being born.',
  },
  {
    id: 'guild',
    name: 'Guild Hall',
    route: '/guild',
    icon: 'banner',
    group: 'beyond',
    gateLevel: 10,
    blurb: 'Join a fellowship, or found your own.',
    backdrop: `${BG}/guild_background.png`,
    effects: ['hearth', 'motes'],
    buildPhase: 'Phase 10',
    constructionBark: 'Long table, empty chairs. Someone will fill them soon enough.',
  },
  {
    id: 'undertavern',
    name: 'The Undertavern',
    route: '/undertavern',
    icon: 'stairsDown',
    group: 'beyond',
    gateLevel: 10,
    blurb: 'Three doors down. Ten floors each. Bring a key.',
    backdrop: `${BG}/dungeons_background.png`,
    tint: 'from-wood-900 via-wood-900/90 to-wood-900/70',
    effects: ['lantern'],
    buildPhase: 'Phase 11',
    constructionBark: 'The doors are locked and something behind them is glad of it.',
  },
  {
    id: 'settings',
    name: 'Settings',
    route: '/settings',
    icon: 'gear',
    group: 'system',
    gateLevel: 1,
    blurb: 'Saves, motion, sound and credits.',
    backdrop: `${BG}/tavern_background.png`,
    tint: 'from-wood-900 via-wood-900/92 to-wood-900/80',
    buildPhase: 'Phase 18',
    constructionBark: 'Export and import already work — the rest of the panel comes later.',
  },
];

export const PLACES_BY_ID: Readonly<Record<PlaceId, PlaceDef>> = Object.fromEntries(
  PLACES.map((place) => [place.id, place]),
) as Record<PlaceId, PlaceDef>;

export const GROUP_LABELS: Readonly<Record<PlaceGroup, string>> = {
  tavern: 'The Tankard',
  town: 'Emberhollow',
  beyond: 'Beyond the Town',
  system: '',
};

/** Rail order, used for navigation direction and keyboard shortcuts. */
export const NAV_GROUPS: readonly PlaceGroup[] = ['tavern', 'town', 'beyond'];

export function placeByRoute(route: string): PlaceDef | undefined {
  return PLACES.find((place) => place.route === route);
}
