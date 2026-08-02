/**
 * Mission zones (docs/design/content-plan.md §1).
 *
 * A zone is flavour, a monster pool and a backdrop — nothing more. Rewards depend only on the
 * player's level and the duration they picked (`balancing-formulas.md` §1–2), which is what
 * keeps "where you fight" a matter of taste rather than of optimisation. A player who likes the
 * marsh is never punished for staying there.
 *
 * Bands overlap on purpose: at level 12 you can see Miller's Fields *and* the Old King's Road,
 * so the board has somewhere to go and the world feels bigger than your level.
 *
 * Pure data module.
 */

export type ZoneId =
  | 'whispering-woods'
  | 'millers-fields'
  | 'old-kings-road'
  | 'fogmoor-marsh'
  | 'thornhill-ruins'
  | 'silverpine-pass'
  | 'ember-caves'
  | 'gloomhollow'
  | 'sunken-chapel'
  | 'frostfell-ridge'
  // ── The far country: past the Ridge, past the edge of anybody's map ──────────────
  | 'saltmere-wrecks'
  | 'glass-waste'
  | 'starfall-barrens'
  | 'hollow-crown';

export interface ZoneDef {
  readonly id: ZoneId;
  readonly name: string;
  /** One line of place, shown under the zone name on a mission card. */
  readonly tagline: string;
  /** Inclusive level band this zone offers work in. */
  readonly minLevel: number;
  readonly maxLevel: number;
  /** Backdrops under /assets/backgrounds. More than one = the zone has moods. */
  readonly backdrops: readonly string[];
  /** Colour wash over the backdrop, so re-used art still reads as a different place. */
  readonly tint: string;
}

const BG = (name: string) => `/assets/backgrounds/${name}.webp`;

/**
 * Backdrops are matched to what the art actually *depicts*, not to the numbering in
 * content-plan §1 — that table was written before anyone opened the files, and following it
 * put a tropical shipwreck behind "Whispering Woods". Where no art quite fits a zone's mood
 * the closest scene carries it and the zone `tint` does the rest; the content pass (ROADMAP
 * Phase 15) can commission per-zone art, which drops in through the override manifest with
 * no code change.
 */

const ZONE_LIST = [
  {
    id: 'whispering-woods',
    name: 'Whispering Woods',
    tagline: 'Close, green, and never quite silent.',
    minLevel: 1,
    maxLevel: 8,
    backdrops: [BG('mission_background_13'), BG('mission_background_10')],
    tint: 'from-wood-900 via-moss-600/30 to-wood-900/45',
  },
  {
    id: 'millers-fields',
    name: "Miller's Fields",
    tagline: 'Good soil, bad harvest, worse neighbours.',
    minLevel: 5,
    maxLevel: 14,
    backdrops: [BG('mission_background_11'), BG('mission_background_12')],
    tint: 'from-wood-900 via-amber-500/20 to-wood-900/45',
  },
  {
    id: 'old-kings-road',
    name: "Old King's Road",
    tagline: 'Paved by a kingdom nobody remembers.',
    minLevel: 10,
    maxLevel: 20,
    backdrops: [BG('mission_background_3'), BG('mission_background_5')],
    tint: 'from-wood-900 via-wood-700/35 to-wood-900/45',
  },
  {
    id: 'fogmoor-marsh',
    name: 'Fogmoor Marsh',
    tagline: 'The ground here has opinions about your boots.',
    minLevel: 16,
    maxLevel: 28,
    backdrops: [BG('mission_background_2')],
    tint: 'from-wood-900 via-moss-600/35 to-arcane-500/25',
  },
  {
    id: 'thornhill-ruins',
    name: 'Thornhill Ruins',
    tagline: 'Somebody is still lighting the candles.',
    minLevel: 24,
    maxLevel: 36,
    backdrops: [BG('mission_background_4')],
    tint: 'from-wood-900 via-blood-600/22 to-wood-900/55',
  },
  {
    id: 'silverpine-pass',
    name: 'Silverpine Pass',
    tagline: 'Thin air, thinner hospitality.',
    minLevel: 32,
    maxLevel: 46,
    backdrops: [BG('mission_background_9')],
    tint: 'from-wood-900 via-parchment-300/18 to-wood-900/50',
  },
  {
    id: 'ember-caves',
    name: 'Ember Caves',
    tagline: 'Warm rock, warmer residents.',
    minLevel: 42,
    maxLevel: 58,
    backdrops: [BG('mission_background_6')],
    tint: 'from-wood-900 via-amber-400/25 to-wood-900/50',
  },
  {
    id: 'gloomhollow',
    name: 'Gloomhollow',
    tagline: 'Bring your own light. Bring a spare.',
    minLevel: 54,
    maxLevel: 72,
    backdrops: [BG('mission_background_8')],
    tint: 'from-wood-900 via-arcane-500/30 to-wood-900/70',
  },
  {
    id: 'sunken-chapel',
    name: 'Sunken Chapel',
    tagline: 'The choir never stopped. It only got wetter.',
    minLevel: 68,
    maxLevel: 88,
    backdrops: [BG('mission_background_1'), BG('mission_background_14')],
    tint: 'from-wood-900 via-moss-600/28 to-wood-900/60',
  },
  {
    id: 'frostfell-ridge',
    name: 'Frostfell Ridge',
    tagline: 'Where the map stops apologising and just says "no".',
    minLevel: 84,
    // Capped when the far country arrived. It was open-ended for one reason — it was the last
    // zone, and a hero past it needed *somewhere* — and the cost was that an active player met
    // their final new monster on day 40 and fought the same ten for the next eleven weeks.
    maxLevel: 108,
    backdrops: [BG('mission_background_7')],
    tint: 'from-wood-900 via-parchment-300/15 to-wood-900/55',
  },

  /* ── The far country ────────────────────────────────────────────────────────────
   *
   * Four places past the Ridge, for levels 100 to wherever the player stops.
   *
   * They go *outward and stranger* rather than simply colder: a coast that has no business being
   * this far inland, a desert of fused glass, the crater the Starmetal came out of, and the
   * drowned capital of whatever Aldenvale was before Emberhollow. The escalation is meant to be
   * legible from the names alone — by the last one the player is not in the countryside any more.
   *
   * **They re-use backdrops, and that is the system working rather than a shortcut.** Fourteen
   * paintings serve fourteen zones; `tint` is the field that exists so re-used art reads as a
   * different place, and each of the four below is washed a colour no earlier zone uses. Real art
   * drops in through the override manifest with no code change (asset-pipeline §3).
   */
  {
    id: 'saltmere-wrecks',
    name: 'Saltmere Wrecks',
    tagline: 'Ships, forty miles from any sea that would admit to them.',
    minLevel: 100,
    maxLevel: 130,
    backdrops: [BG('mission_background_14'), BG('mission_background_1')],
    tint: 'from-wood-900 via-parchment-300/22 to-arcane-500/25',
  },
  {
    id: 'glass-waste',
    name: 'The Glass Waste',
    tagline: 'Sand, fused smooth. Nobody agrees on by what.',
    minLevel: 122,
    maxLevel: 156,
    backdrops: [BG('mission_background_12'), BG('mission_background_11')],
    tint: 'from-wood-900 via-amber-400/30 to-parchment-300/20',
  },
  {
    id: 'starfall-barrens',
    name: 'Starfall Barrens',
    tagline: 'The hole the Starmetal came out of, and whatever came with it.',
    minLevel: 148,
    maxLevel: 186,
    backdrops: [BG('mission_background_6'), BG('mission_background_9')],
    tint: 'from-wood-900 via-arcane-500/35 to-ember-600/20',
  },
  {
    id: 'hollow-crown',
    name: 'The Hollow Crown',
    tagline: 'A capital, before there was an Emberhollow. It is still holding court.',
    minLevel: 178,
    // The last zone carries the open end, for the reason Frostfell used to: there is no level
    // cap, so somebody has to have work for a hero who keeps going.
    maxLevel: Number.MAX_SAFE_INTEGER,
    backdrops: [BG('mission_background_4'), BG('mission_background_8')],
    tint: 'from-wood-900 via-blood-600/28 to-amber-500/15',
  },
] as const satisfies readonly ZoneDef[];

/**
 * Authoring uses `as const satisfies` above so a typo is a build error; consumers get the
 * widened type, because a union of ten literal object shapes is unusable downstream.
 */
export const ZONES: readonly ZoneDef[] = ZONE_LIST;

export const ZONES_BY_ID: Readonly<Record<ZoneId, ZoneDef>> = Object.fromEntries(
  ZONES.map((zone) => [zone.id, zone]),
) as Record<ZoneId, ZoneDef>;

export function zone(id: ZoneId): ZoneDef {
  return ZONES_BY_ID[id];
}

/**
 * How many zones a board should be able to choose between. The tavern guarantees a board spans
 * at least two zones (tavern spec §6), which it can only honour if the level offers two.
 */
export const MIN_ZONE_CHOICES = 2;

/**
 * Zones offering work to a hero of this level — "current band ± neighbours"
 * (content-plan §1).
 *
 * The bands only overlap for part of the ladder, so in-band zones alone leave a level-50 hero
 * looking at exactly one place. Topping up with the nearest neighbours fixes that and is also
 * the kinder reading: levelling past a zone shouldn't make it vanish from the board overnight.
 *
 * Never empty, and never fewer than `MIN_ZONE_CHOICES` while the world has that many zones.
 */
export function zonesForLevel(level: number): readonly ZoneDef[] {
  const byDistance = [...ZONES].sort(
    (a, b) => distanceToBand(level, a) - distanceToBand(level, b) || a.minLevel - b.minLevel,
  );

  const chosen = byDistance.filter((z) => distanceToBand(level, z) === 0);
  for (const candidate of byDistance) {
    if (chosen.length >= MIN_ZONE_CHOICES) break;
    if (!chosen.includes(candidate)) chosen.push(candidate);
  }

  // Back into world order, so the board reads low-level-first rather than by distance.
  return ZONES.filter((z) => chosen.includes(z));
}

function distanceToBand(level: number, def: ZoneDef): number {
  if (level < def.minLevel) return def.minLevel - level;
  if (level > def.maxLevel) return level - def.maxLevel;
  return 0;
}

/** Which backdrop a given mission uses — stable for a seed, so a card never flickers. */
export function backdropFor(def: ZoneDef, index: number): string {
  return def.backdrops[Math.abs(index) % def.backdrops.length]!;
}
