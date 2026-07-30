/**
 * Mission monsters (docs/design/content-plan.md §2).
 *
 * A monster is a *name, a zone, an archetype and a line of flavour*. Its stat block is generated
 * from the archetype at fight time, from the player's level — which is the only reason 96 of
 * these stay maintainable and can never drift off-curve when a formula changes.
 *
 * Art resolves through the override manifest (`asset-pipeline.md` §3): drop
 * `art/monsters/<id>.png` in and it appears, with no code change. Until then a monster shows an
 * archetype silhouette tinted by its zone, which is the documented fallback.
 *
 * Names lean cozy-grim. Zones 1–5 (levels 1–36) carry the full roster this phase needs; the
 * later zones have a starter set and are filled to plan volume in the content pass
 * (ROADMAP Phase 15).
 *
 * Pure data module.
 */

import type { ArchetypeId } from './monsterArchetypes';
import type { ZoneId } from './zones';

export interface MonsterDef {
  readonly id: string;
  readonly name: string;
  readonly zoneId: ZoneId;
  readonly archetypeId: ArchetypeId;
  /** One line, shown on the mission card and the battle nameplate. */
  readonly flavor: string;
  /** Set when real art exists; resolved through the asset manifest. */
  readonly artOverride?: string;
}

const MONSTER_LIST = [
  // ── Whispering Woods (1–8) ───────────────────────────────────────────────────────
  {
    id: 'sootback-boar',
    name: 'Sootback Boar',
    zoneId: 'whispering-woods',
    archetypeId: 'bruiser',
    flavor: 'It has been through a fire and did not enjoy it.',
  },
  {
    id: 'thicket-bandit',
    name: 'Thicket Bandit',
    zoneId: 'whispering-woods',
    archetypeId: 'skirmisher',
    flavor: 'Wants your purse. Will settle for your boots.',
  },
  {
    id: 'moss-lurker',
    name: 'Moss Lurker',
    zoneId: 'whispering-woods',
    archetypeId: 'tank',
    flavor: 'You have walked past it twice already.',
  },
  {
    id: 'gnat-swarm',
    name: 'Biting Cloud',
    zoneId: 'whispering-woods',
    archetypeId: 'swarm',
    flavor: 'Individually harmless. Collectively a problem.',
  },
  {
    id: 'hedge-witchling',
    name: 'Hedge Witchling',
    zoneId: 'whispering-woods',
    archetypeId: 'caster',
    flavor: 'Barely an apprentice, and furious about it.',
  },
  {
    id: 'old-stag',
    name: 'The Old Stag',
    zoneId: 'whispering-woods',
    archetypeId: 'bruiser',
    flavor: 'Nine points, and it has counted yours.',
  },
  {
    id: 'root-crawler',
    name: 'Root Crawler',
    zoneId: 'whispering-woods',
    archetypeId: 'skirmisher',
    flavor: 'Moves under the leaf litter like a rumour.',
  },
  {
    id: 'bramble-hound',
    name: 'Bramble Hound',
    zoneId: 'whispering-woods',
    archetypeId: 'swarm',
    flavor: 'Somebody let the thorns off the leash.',
  },
  {
    id: 'toll-keepers-ghost',
    name: "Toll-Keeper's Ghost",
    zoneId: 'whispering-woods',
    archetypeId: 'caster',
    flavor: 'Still collecting on a bridge that fell down.',
  },

  // ── Miller's Fields (5–14) ───────────────────────────────────────────────────────
  {
    id: 'granary-rat-king',
    name: 'Granary Rat King',
    zoneId: 'millers-fields',
    archetypeId: 'swarm',
    flavor: 'Crowned by accident, ruling by weight of numbers.',
  },
  {
    id: 'stitched-scarecrow',
    name: 'Stitched Scarecrow',
    zoneId: 'millers-fields',
    archetypeId: 'tank',
    flavor: 'Someone sewed it too well.',
  },
  {
    id: 'brigand-quartermaster',
    name: 'Brigand Quartermaster',
    zoneId: 'millers-fields',
    archetypeId: 'bruiser',
    flavor: 'Keeps immaculate records of everything he steals.',
  },
  {
    id: 'ditch-adder',
    name: 'Ditch Adder',
    zoneId: 'millers-fields',
    archetypeId: 'skirmisher',
    flavor: 'The irrigation channels were a mistake.',
  },
  {
    id: 'harvest-effigy',
    name: 'Harvest Effigy',
    zoneId: 'millers-fields',
    archetypeId: 'caster',
    flavor: 'Burned every autumn. Back every spring.',
  },
  {
    id: 'millstone-golem',
    name: 'Millstone Golem',
    zoneId: 'millers-fields',
    archetypeId: 'tank',
    flavor: 'Grinds. That is the whole of it.',
  },
  {
    id: 'crow-marshal',
    name: 'Crow Marshal',
    zoneId: 'millers-fields',
    archetypeId: 'swarm',
    flavor: 'It has organised them. That is the worrying part.',
  },
  {
    id: 'blighted-sow',
    name: 'Blighted Sow',
    zoneId: 'millers-fields',
    archetypeId: 'bruiser',
    flavor: 'The farmer stopped going into that pen.',
  },
  {
    id: 'ledger-wraith',
    name: 'Ledger Wraith',
    zoneId: 'millers-fields',
    archetypeId: 'caster',
    flavor: 'Died over a debt. Kept the debt.',
  },

  // ── Old King's Road (10–20) ──────────────────────────────────────────────────────
  {
    id: 'roadside-highwayman',
    name: 'Roadside Highwayman',
    zoneId: 'old-kings-road',
    archetypeId: 'skirmisher',
    flavor: 'Polite, professional, and entirely serious.',
  },
  {
    id: 'milestone-warg',
    name: 'Milestone Warg',
    zoneId: 'old-kings-road',
    archetypeId: 'bruiser',
    flavor: 'Marks its territory in stones and in travellers.',
  },
  {
    id: 'barrow-sentry',
    name: 'Barrow Sentry',
    zoneId: 'old-kings-road',
    archetypeId: 'tank',
    flavor: 'Nobody told it the war ended.',
  },
  {
    id: 'coachmans-shade',
    name: "Coachman's Shade",
    zoneId: 'old-kings-road',
    archetypeId: 'caster',
    flavor: 'Still running the night route.',
  },
  {
    id: 'toll-gang',
    name: 'Toll Gang',
    zoneId: 'old-kings-road',
    archetypeId: 'swarm',
    flavor: 'Four of them, one bad idea, shared equally.',
  },
  {
    id: 'road-warden-oath',
    name: 'The Broken Warden',
    zoneId: 'old-kings-road',
    archetypeId: 'tank',
    flavor: 'Sworn to guard the road. Nothing said which travellers.',
  },
  {
    id: 'gallows-crow',
    name: 'Gallows Crow',
    zoneId: 'old-kings-road',
    archetypeId: 'skirmisher',
    flavor: 'Patient. Extremely patient.',
  },
  {
    id: 'kings-tax-collector',
    name: "The King's Tax Collector",
    zoneId: 'old-kings-road',
    archetypeId: 'caster',
    flavor: 'Three hundred years in arrears and still counting.',
  },
  {
    id: 'cairn-lurcher',
    name: 'Cairn Lurcher',
    zoneId: 'old-kings-road',
    archetypeId: 'bruiser',
    flavor: 'Assembled from the wrong graves.',
  },

  // ── Fogmoor Marsh (16–28) ────────────────────────────────────────────────────────
  {
    id: 'marsh-widow',
    name: 'Marsh Widow',
    zoneId: 'fogmoor-marsh',
    archetypeId: 'caster',
    flavor: 'Everyone she waited for is still down there.',
  },
  {
    id: 'peat-hulk',
    name: 'Peat Hulk',
    zoneId: 'fogmoor-marsh',
    archetypeId: 'tank',
    flavor: 'Four thousand years of bog, standing up.',
  },
  {
    id: 'lantern-lure',
    name: 'Lantern Lure',
    zoneId: 'fogmoor-marsh',
    archetypeId: 'skirmisher',
    flavor: 'The light is real. The bridge is not.',
  },
  {
    id: 'reed-chorus',
    name: 'Reed Chorus',
    zoneId: 'fogmoor-marsh',
    archetypeId: 'swarm',
    flavor: 'They sing to keep count of you.',
  },
  {
    id: 'sunken-drover',
    name: 'Sunken Drover',
    zoneId: 'fogmoor-marsh',
    archetypeId: 'bruiser',
    flavor: 'Lost his herd. Kept the crook.',
  },
  {
    id: 'hags-errand',
    name: "Hag's Errand",
    zoneId: 'fogmoor-marsh',
    archetypeId: 'caster',
    flavor: 'Sent to fetch something. It has forgotten what.',
  },
  {
    id: 'bog-adder-nest',
    name: 'Bog Adder Nest',
    zoneId: 'fogmoor-marsh',
    archetypeId: 'swarm',
    flavor: 'You found it the usual way.',
  },
  {
    id: 'drowned-bailiff',
    name: 'Drowned Bailiff',
    zoneId: 'fogmoor-marsh',
    archetypeId: 'tank',
    flavor: 'Serving a warrant on the whole marsh.',
  },
  {
    id: 'fen-stalker',
    name: 'Fen Stalker',
    zoneId: 'fogmoor-marsh',
    archetypeId: 'skirmisher',
    flavor: 'It has been matching your pace for an hour.',
  },

  // ── Thornhill Ruins (24–36) ──────────────────────────────────────────────────────
  {
    id: 'candle-cultist',
    name: 'Candle Cultist',
    zoneId: 'thornhill-ruins',
    archetypeId: 'caster',
    flavor: 'Somebody has to keep them lit.',
  },
  {
    id: 'animated-panoply',
    name: 'Animated Panoply',
    zoneId: 'thornhill-ruins',
    archetypeId: 'tank',
    flavor: 'A full harness of plate with nobody home.',
  },
  {
    id: 'roost-gargoyle',
    name: 'Roost Gargoyle',
    zoneId: 'thornhill-ruins',
    archetypeId: 'bruiser',
    flavor: 'It was on the roof a moment ago.',
  },
  {
    id: 'chancel-choir',
    name: 'Chancel Choir',
    zoneId: 'thornhill-ruins',
    archetypeId: 'swarm',
    flavor: 'Six voices, none of them breathing.',
  },
  {
    id: 'thornhill-heir',
    name: 'The Thornhill Heir',
    zoneId: 'thornhill-ruins',
    archetypeId: 'skirmisher',
    flavor: 'Still dressed for a party that ended a century ago.',
  },
  {
    id: 'reliquary-warden',
    name: 'Reliquary Warden',
    zoneId: 'thornhill-ruins',
    archetypeId: 'tank',
    flavor: 'Guarding a box that has been empty for years.',
  },
  {
    id: 'ash-preacher',
    name: 'Ash Preacher',
    zoneId: 'thornhill-ruins',
    archetypeId: 'caster',
    flavor: 'The sermon is not for you. You are just here.',
  },
  {
    id: 'vault-scuttler',
    name: 'Vault Scuttler',
    zoneId: 'thornhill-ruins',
    archetypeId: 'swarm',
    flavor: 'Something got into the crypts and thrived.',
  },
  {
    id: 'masons-regret',
    name: "Mason's Regret",
    zoneId: 'thornhill-ruins',
    archetypeId: 'bruiser',
    flavor: 'He built the place. He is still finishing it.',
  },

  // ── Later zones: starter rosters, filled to plan volume in the content pass ──────
  {
    id: 'pass-clansman',
    name: 'Silverpine Clansman',
    zoneId: 'silverpine-pass',
    archetypeId: 'bruiser',
    flavor: 'This is his road. It has always been his road.',
  },
  {
    id: 'ridge-harpy',
    name: 'Ridge Harpy',
    zoneId: 'silverpine-pass',
    archetypeId: 'skirmisher',
    flavor: 'Comes out of the sun, every time.',
  },
  {
    id: 'ice-wolf-pack',
    name: 'Ice Wolf Pack',
    zoneId: 'silverpine-pass',
    archetypeId: 'swarm',
    flavor: 'You are being herded, and you have noticed too late.',
  },
  {
    id: 'cairn-shaman',
    name: 'Cairn Shaman',
    zoneId: 'silverpine-pass',
    archetypeId: 'caster',
    flavor: 'Talks to the mountain. The mountain answers.',
  },
  {
    id: 'pass-bulwark',
    name: 'The Pass Bulwark',
    zoneId: 'silverpine-pass',
    archetypeId: 'tank',
    flavor: 'Two hundred kilos of clan pride in borrowed plate.',
  },

  {
    id: 'kobold-foreman',
    name: 'Kobold Foreman',
    zoneId: 'ember-caves',
    archetypeId: 'skirmisher',
    flavor: 'Runs a tight operation. Objects to inspectors.',
  },
  {
    id: 'magma-calf',
    name: 'Magma Calf',
    zoneId: 'ember-caves',
    archetypeId: 'bruiser',
    flavor: 'Newborn, and already too hot to touch.',
  },
  {
    id: 'cinder-salamander',
    name: 'Cinder Salamander',
    zoneId: 'ember-caves',
    archetypeId: 'caster',
    flavor: 'Sleeps in the forge. Wakes for visitors.',
  },
  {
    id: 'slag-tender',
    name: 'Slag Tender',
    zoneId: 'ember-caves',
    archetypeId: 'tank',
    flavor: 'Crusted over so thick it barely moves. Barely is enough.',
  },
  {
    id: 'ember-brood',
    name: 'Ember Brood',
    zoneId: 'ember-caves',
    archetypeId: 'swarm',
    flavor: 'The floor is not gravel. The floor is eggs.',
  },

  {
    id: 'hollow-shade',
    name: 'Hollow Shade',
    zoneId: 'gloomhollow',
    archetypeId: 'caster',
    flavor: 'It remembers being someone. Not who.',
  },
  {
    id: 'night-hag',
    name: 'Night Hag',
    zoneId: 'gloomhollow',
    archetypeId: 'caster',
    flavor: 'Trades in sleep. Yours, specifically.',
  },
  {
    id: 'gloom-weaver',
    name: 'Gloom Weaver',
    zoneId: 'gloomhollow',
    archetypeId: 'skirmisher',
    flavor: 'The web is load-bearing. Do not cut it.',
  },
  {
    id: 'brood-mother',
    name: 'The Brood Mother',
    zoneId: 'gloomhollow',
    archetypeId: 'tank',
    flavor: 'Everything else down here is hers.',
  },
  {
    id: 'lantern-eaters',
    name: 'Lantern Eaters',
    zoneId: 'gloomhollow',
    archetypeId: 'swarm',
    flavor: 'They go for the light first. Always the light.',
  },

  {
    id: 'drowned-deacon',
    name: 'Drowned Deacon',
    zoneId: 'sunken-chapel',
    archetypeId: 'caster',
    flavor: 'The liturgy continues underwater. Somehow.',
  },
  {
    id: 'font-guardian',
    name: 'Font Guardian',
    zoneId: 'sunken-chapel',
    archetypeId: 'tank',
    flavor: 'Carved to protect the water. Now it is the water.',
  },
  {
    id: 'deep-cult-diver',
    name: 'Deep Cult Diver',
    zoneId: 'sunken-chapel',
    archetypeId: 'skirmisher',
    flavor: 'Has not surfaced in years and does not intend to.',
  },
  {
    id: 'tide-choir',
    name: 'Tide Choir',
    zoneId: 'sunken-chapel',
    archetypeId: 'swarm',
    flavor: 'Every bell in the flooded tower, ringing at once.',
  },
  {
    id: 'reliquary-leviathan',
    name: 'Reliquary Leviathan',
    zoneId: 'sunken-chapel',
    archetypeId: 'bruiser',
    flavor: 'Swallowed the treasury. Grew into the role.',
  },

  {
    id: 'frost-giants-kin',
    name: "Frost Giant's Kin",
    zoneId: 'frostfell-ridge',
    archetypeId: 'bruiser',
    flavor: 'The runt of the family. Twice your height.',
  },
  {
    id: 'ridge-wraith',
    name: 'Ridge Wraith',
    zoneId: 'frostfell-ridge',
    archetypeId: 'caster',
    flavor: 'The blizzard with intent behind it.',
  },
  {
    id: 'summit-roc',
    name: 'Summit Roc',
    zoneId: 'frostfell-ridge',
    archetypeId: 'skirmisher',
    flavor: 'It has carried off larger than you.',
  },
  {
    id: 'glacier-warden',
    name: 'Glacier Warden',
    zoneId: 'frostfell-ridge',
    archetypeId: 'tank',
    flavor: 'Frozen into the pass, and part of it now.',
  },
  {
    id: 'rime-swarm',
    name: 'Rime Swarm',
    zoneId: 'frostfell-ridge',
    archetypeId: 'swarm',
    flavor: 'Snow that moves against the wind.',
  },
] as const satisfies readonly MonsterDef[];

/** Widened for consumers; the literal above is what gets typo-checked. */
export const MONSTERS: readonly MonsterDef[] = MONSTER_LIST;

export const MONSTERS_BY_ID: Readonly<Record<string, MonsterDef>> = Object.fromEntries(
  MONSTERS.map((monster) => [monster.id, monster]),
);

export function monster(id: string): MonsterDef | undefined {
  return MONSTERS_BY_ID[id];
}

/** Everything that lives in a zone. Never empty for a zone the board can draw. */
export function monstersInZone(zoneId: string): readonly MonsterDef[] {
  return MONSTERS.filter((entry) => entry.zoneId === zoneId);
}
