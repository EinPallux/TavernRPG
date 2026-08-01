/**
 * Which game-icons.net icon stands for each of TavernRPG's icon ids.
 *
 * This file is the *decisions* — one line per icon, reviewable as a list. The artwork itself is
 * vendored under `game_assets/icons/<author>/<name>.svg` (the tracked source of truth, exactly as
 * backgrounds and portraits are), and `scripts/vendor-icons.mjs` turns the two into
 * `src/components/icons/vendored.ts`.
 *
 * **Every entry is CC BY 3.0 and the author is load-bearing**, not decoration: the licence is
 * per-icon, so the author lives in the vendored path and flows through to CREDITS.md. Adding an
 * icon here without vendoring its SVG fails the census in `icons.test.ts`.
 *
 * `null` marks an id that is *interface furniture* rather than game art. A chevron is a direction,
 * not a thing; there is no themed drawing of "next" that beats an arrow, and using one would make
 * the control harder to read for the sake of consistency with a set it does not belong to.
 */

export const ICON_SOURCES = {
  // ── Places ─────────────────────────────────────────────────────────────────────
  tankard: 'beer-stein', // The Gilded Tankard
  hero: 'character',
  noticeBoard: 'scroll-unfurled',
  patrol: 'watchtower', // The City Watch
  // A rack of gear, not crossed swords: the Proving Grounds is `sword-clash`, and two entries in
  // the same nav rail with the same silhouette is a room a player walks into by mistake.
  armory: 'battle-gear',
  gem: 'gems', // The Gilded Facet
  anvil: 'anvil', // The Emberforge
  stables: 'horseshoe',
  paw: 'paw-print', // The Menagerie
  arena: 'sword-clash', // The Proving Grounds
  laurel: 'laurels', // The Hall of Fame
  banner: 'flying-flag', // The Guild Hall
  stairsDown: 'cave-entrance', // The Undertavern — into the dark, and unambiguously downward
  dice: 'perspective-dice-six-faces-random', // Fortune's Table
  map: 'treasure-map',
  road: 'horizon-road', // The Long Road
  gear: 'gears', // Settings

  // ── Currencies & status ────────────────────────────────────────────────────────
  coin: 'two-coins',
  lock: 'padlock',
  chevron: null, // interface, not art — see the module note
  hourglass: 'hourglass',
  spark: 'sparkles',
  key: 'key',
  trophy: 'trophy-cup',

  // ── Forge materials ────────────────────────────────────────────────────────────
  // Salvaged plating, not raw ore — and emphatically not `nails`, whose two crossed nails collapse
  // into a bare ✕ at chip size, which every interface in the world reads as "dismiss".
  scrap: 'metal-scales',
  essence: 'bubbling-flask',
  starmetal: 'metal-bar',

  // ── Weapons, by the class that carries them ────────────────────────────────────
  sword: 'broadsword',
  axe: 'battle-axe',
  mace: 'spiked-mace',
  lute: 'lyre',
  horn: 'hunting-horn',
  drum: 'drum',
  staff: 'wizard-staff',
  wand: 'crystal-wand',
  bow: 'bow-arrow',
  crossbow: 'crossbow',
  saber: 'sabers-choc',
  rapier: 'stiletto',

  // ── Offhands ───────────────────────────────────────────────────────────────────
  shield: 'round-shield',
  songbook: 'spell-book',
  orb: 'crystal-ball',
  quiver: 'quiver',
  dagger: 'plain-dagger',

  // ── Armour ─────────────────────────────────────────────────────────────────────
  helm: 'visored-helm',
  chestplate: 'breastplate',
  gloves: 'gauntlet',
  boots: 'leather-boot',
  belt: 'belt-buckles',

  // ── Jewellery ──────────────────────────────────────────────────────────────────
  amulet: 'gem-pendant',
  ring: 'ring',
  trinket: 'star-medal',

  // ── The twelve companions ──────────────────────────────────────────────────────
  petPup: 'sitting-dog',
  petTortoise: 'turtle',
  petCat: 'cat',
  petOwl: 'owl',
  petToad: 'frog',
  petBeetle: 'scarab-beetle',
  petImp: 'imp',
  petRaven: 'raven',
  petFox: 'fox-head',
  petRatKing: 'rat',
  petWisp: 'spark-spirit',
  petSnail: 'snail',

  // ── The stalls at the Wandering Stables ────────────────────────────────────────
  mule: 'donkey',
  courser: 'horse-head',
  warhorse: 'mounted-knight',
  griffin: 'griffin-symbol',
};
