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
 * Names lean cozy-grim. Ninety-six of them, nine or ten per zone — filled to plan volume in the
 * Phase 17 content pass. The even spread is deliberate: a zone with five monsters repeats its
 * roster twice as often as its neighbour, and a player reads that as "the game ran out" long
 * before they could name why. `content.test.ts` holds the floor and the ceiling.
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
    id: 'charcoal-burner',
    name: 'The Charcoal Burner',
    zoneId: 'whispering-woods',
    archetypeId: 'tank',
    flavor: 'Been out here alone eleven years. Does not want the company.',
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

  // ── Silverpine Pass (32–46) ──────────────────────────────────────────────────────
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
    id: 'toll-of-the-pass',
    name: 'Toll of the Pass',
    zoneId: 'silverpine-pass',
    archetypeId: 'tank',
    flavor: 'A gate, a ledger, and a man who has never once been argued down.',
  },
  {
    id: 'snowblind-scout',
    name: 'Snowblind Scout',
    zoneId: 'silverpine-pass',
    archetypeId: 'skirmisher',
    flavor: 'Sees perfectly well. Prefers you to think otherwise.',
  },
  {
    id: 'avalanche-caller',
    name: 'Avalanche Caller',
    zoneId: 'silverpine-pass',
    archetypeId: 'caster',
    flavor: 'Does not throw the mountain. Only asks it nicely.',
  },
  {
    id: 'pine-bear',
    name: 'Silverpine Bear',
    zoneId: 'silverpine-pass',
    archetypeId: 'bruiser',
    flavor: 'Woke up early. Nothing about that is good news.',
  },
  {
    id: 'rope-bridge-kin',
    name: 'The Rope-Bridge Kin',
    zoneId: 'silverpine-pass',
    archetypeId: 'swarm',
    flavor: 'They own every crossing and they charge in teeth.',
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
    id: 'bellows-drake',
    name: 'Bellows Drake',
    zoneId: 'ember-caves',
    archetypeId: 'bruiser',
    flavor: 'Breathes in for a very long time before it does anything else.',
  },
  {
    id: 'tunnel-scrapper',
    name: 'Tunnel Scrapper',
    zoneId: 'ember-caves',
    archetypeId: 'skirmisher',
    flavor: 'Fights in the dark because it knows where the dark ends.',
  },
  {
    id: 'ashfall-priest',
    name: 'Ashfall Priest',
    zoneId: 'ember-caves',
    archetypeId: 'caster',
    flavor: 'Preaches that the fire is listening. Annoyingly, it is.',
  },
  {
    id: 'obsidian-sentinel',
    name: 'Obsidian Sentinel',
    zoneId: 'ember-caves',
    archetypeId: 'tank',
    flavor: 'Glass all the way through, and none of it breaks.',
  },
  {
    id: 'cinder-motes',
    name: 'Cinder Motes',
    zoneId: 'ember-caves',
    archetypeId: 'swarm',
    flavor: 'Beautiful, briefly, and then in your lungs.',
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
    id: 'candle-thief',
    name: 'The Candle Thief',
    zoneId: 'gloomhollow',
    archetypeId: 'skirmisher',
    flavor: 'Takes the light, never the lantern. Nobody knows why.',
  },
  {
    id: 'widows-loom',
    name: 'The Widow’s Loom',
    zoneId: 'gloomhollow',
    archetypeId: 'tank',
    flavor: 'Something is still working it, and the cloth is getting longer.',
  },
  {
    id: 'hollow-choirboy',
    name: 'Hollow Choirboy',
    zoneId: 'gloomhollow',
    archetypeId: 'caster',
    flavor: 'Sings one note. Holds it far too long.',
  },
  {
    id: 'pallid-stalker',
    name: 'Pallid Stalker',
    zoneId: 'gloomhollow',
    archetypeId: 'bruiser',
    flavor: 'It has been three paces behind you since the treeline.',
  },
  {
    id: 'cellar-spiders',
    name: 'Cellar Spiders',
    zoneId: 'gloomhollow',
    archetypeId: 'swarm',
    flavor: 'Not one big one. That would be simpler.',
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
    id: 'bell-diver',
    name: 'The Bell Diver',
    zoneId: 'sunken-chapel',
    archetypeId: 'skirmisher',
    flavor: 'Went down for the bronze. Came up for everything else.',
  },
  {
    id: 'barnacle-abbot',
    name: 'Barnacle Abbot',
    zoneId: 'sunken-chapel',
    archetypeId: 'tank',
    flavor: 'Grew into the pulpit. Has not left it since the flood.',
  },
  {
    id: 'salt-psalmist',
    name: 'Salt Psalmist',
    zoneId: 'sunken-chapel',
    archetypeId: 'caster',
    flavor: 'Reads from a book that dissolved a century ago.',
  },
  {
    id: 'undertow-brute',
    name: 'Undertow Brute',
    zoneId: 'sunken-chapel',
    archetypeId: 'bruiser',
    flavor: 'Does not swing so much as arrive.',
  },
  {
    id: 'votive-drowned',
    name: 'The Votive Drowned',
    zoneId: 'sunken-chapel',
    archetypeId: 'swarm',
    flavor: 'Each one carrying a candle that has no business still burning.',
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
  {
    id: 'crevasse-lurker',
    name: 'Crevasse Lurker',
    zoneId: 'frostfell-ridge',
    archetypeId: 'skirmisher',
    flavor: 'The blue light down there is not the ice.',
  },
  {
    id: 'hoarfrost-jarl',
    name: 'Hoarfrost Jarl',
    zoneId: 'frostfell-ridge',
    archetypeId: 'tank',
    flavor: 'Holds a hall nobody has seen and a grudge everyone has heard about.',
  },
  {
    id: 'whiteout-singer',
    name: 'Whiteout Singer',
    zoneId: 'frostfell-ridge',
    archetypeId: 'caster',
    flavor: 'The storm arrives when she does. Opinions differ on the order.',
  },
  {
    id: 'mammoth-of-the-pass',
    name: 'The Long-Tusked',
    zoneId: 'frostfell-ridge',
    archetypeId: 'bruiser',
    flavor: 'Older than the ridge road, and it remembers who built it.',
  },
  {
    id: 'scrimshaw-flock',
    name: 'Scrimshaw Flock',
    zoneId: 'frostfell-ridge',
    archetypeId: 'swarm',
    flavor: 'Bone-white, and every one of them carved with a name.',
  },

  // ── Saltmere Wrecks ─────────────────────────────────────────────
  {
    id: 'saltmere-hulk',
    name: 'Saltmere Hulk',
    zoneId: 'saltmere-wrecks',
    archetypeId: 'bruiser',
    flavor: 'Barnacled to the waist, and still rowing.',
  },
  {
    id: 'brine-picker',
    name: 'Brine Picker',
    zoneId: 'saltmere-wrecks',
    archetypeId: 'skirmisher',
    flavor: 'Goes through pockets. Yours are the nearest.',
  },
  {
    id: 'rime-crab',
    name: 'Rime Crab',
    zoneId: 'saltmere-wrecks',
    archetypeId: 'tank',
    flavor: 'Shell like a shield boss, temper like a slammed door.',
  },
  {
    id: 'gullwrack-flock',
    name: 'Gullwrack Flock',
    zoneId: 'saltmere-wrecks',
    archetypeId: 'swarm',
    flavor: 'Gulls, mostly. It is the "mostly" that costs you.',
  },
  {
    id: 'drowned-navigator',
    name: 'Drowned Navigator',
    zoneId: 'saltmere-wrecks',
    archetypeId: 'caster',
    flavor: 'Still charting a coastline that got up and left.',
  },
  {
    id: 'anchor-shade',
    name: 'Anchor Shade',
    zoneId: 'saltmere-wrecks',
    archetypeId: 'bruiser',
    flavor: 'Drags its own mooring behind it. Slowly. Always.',
  },
  {
    id: 'saltglass-widow',
    name: 'Saltglass Widow',
    zoneId: 'saltmere-wrecks',
    archetypeId: 'caster',
    flavor: 'She weeps, and the tears set hard before they land.',
  },
  {
    id: 'hullbore-worm',
    name: 'Hullbore Worm',
    zoneId: 'saltmere-wrecks',
    archetypeId: 'skirmisher',
    flavor: 'Ate a ship. Has started on the sand underneath it.',
  },
  {
    id: 'tide-caller',
    name: 'Tide-Caller',
    zoneId: 'saltmere-wrecks',
    archetypeId: 'caster',
    flavor: 'The tide comes when called. It is called rather often.',
  },
  {
    id: 'keel-warden',
    name: 'Keel Warden',
    zoneId: 'saltmere-wrecks',
    archetypeId: 'tank',
    flavor: 'Guarding a wreck nobody has come back for in eighty years.',
  },

  // ── Glass Waste ─────────────────────────────────────────────
  {
    id: 'mirage-stalker',
    name: 'Mirage Stalker',
    zoneId: 'glass-waste',
    archetypeId: 'skirmisher',
    flavor: 'You have followed it for an hour. It has been following you.',
  },
  {
    id: 'glassback-tortoise',
    name: 'Glassback Tortoise',
    zoneId: 'glass-waste',
    archetypeId: 'tank',
    flavor: 'Sixty summers out here and not one scratch on it.',
  },
  {
    id: 'sunstruck-pilgrim',
    name: 'Sunstruck Pilgrim',
    zoneId: 'glass-waste',
    archetypeId: 'caster',
    flavor: 'Still walking to a shrine that melted before you were born.',
  },
  {
    id: 'shard-drifter',
    name: 'Shard Drifter',
    zoneId: 'glass-waste',
    archetypeId: 'swarm',
    flavor: 'The wind gets up. So does the glass.',
  },
  {
    id: 'kiln-jackal',
    name: 'Kiln Jackal',
    zoneId: 'glass-waste',
    archetypeId: 'bruiser',
    flavor: 'Hunts at noon, because nothing sensible will.',
  },
  {
    id: 'the-reflection',
    name: 'The Reflection',
    zoneId: 'glass-waste',
    archetypeId: 'caster',
    flavor: 'It copied you an hour ago. It did not leave when you did.',
  },
  {
    id: 'slagmaw',
    name: 'Slagmaw',
    zoneId: 'glass-waste',
    archetypeId: 'bruiser',
    flavor: 'Chews glass. Does not appear to enjoy it.',
  },
  {
    id: 'heatwake-serpent',
    name: 'Heatwake Serpent',
    zoneId: 'glass-waste',
    archetypeId: 'skirmisher',
    flavor: 'You see the shimmer a good second before you see the snake.',
  },
  {
    id: 'cinder-choir',
    name: 'Cinder Choir',
    zoneId: 'glass-waste',
    archetypeId: 'swarm',
    flavor: 'Ash that has picked up a hymn somewhere.',
  },
  {
    id: 'the-thirst',
    name: 'The Thirst',
    zoneId: 'glass-waste',
    archetypeId: 'caster',
    flavor: 'Not a figure of speech. It is standing right over there.',
  },

  // ── Starfall Barrens ─────────────────────────────────────────────
  {
    id: 'starmetal-golem',
    name: 'Starmetal Golem',
    zoneId: 'starfall-barrens',
    archetypeId: 'tank',
    flavor: 'Assembled itself from the debris field. Badly. It holds.',
  },
  {
    id: 'crater-scavver',
    name: 'Crater Scavver',
    zoneId: 'starfall-barrens',
    archetypeId: 'skirmisher',
    flavor: 'Digging for the same metal you are, and faster.',
  },
  {
    id: 'the-fallen-thing',
    name: 'The Fallen Thing',
    zoneId: 'starfall-barrens',
    archetypeId: 'caster',
    flavor: 'Came down with the rock. Has not adjusted to the ground.',
  },
  {
    id: 'meteor-hound',
    name: 'Meteor Hound',
    zoneId: 'starfall-barrens',
    archetypeId: 'bruiser',
    flavor: 'Warm to the touch. All the way through.',
  },
  {
    id: 'skyshard-drift',
    name: 'Skyshard Drift',
    zoneId: 'starfall-barrens',
    archetypeId: 'swarm',
    flavor: 'Still falling, in a small and continuous way.',
  },
  {
    id: 'impact-widow',
    name: 'Impact Widow',
    zoneId: 'starfall-barrens',
    archetypeId: 'caster',
    flavor: 'She was standing here when it landed. She still is.',
  },
  {
    id: 'slag-titan',
    name: 'Slag Titan',
    zoneId: 'starfall-barrens',
    archetypeId: 'bruiser',
    flavor: 'Half bedrock, half something that used to be flying.',
  },
  {
    id: 'void-lamprey',
    name: 'Void Lamprey',
    zoneId: 'starfall-barrens',
    archetypeId: 'skirmisher',
    flavor: 'Fastens onto whatever nearby has the most iron in it.',
  },
  {
    id: 'the-glow',
    name: 'The Glow',
    zoneId: 'starfall-barrens',
    archetypeId: 'caster',
    flavor: 'Everything out here glows a little. This one does it deliberately.',
  },
  {
    id: 'quenched-colossus',
    name: 'Quenched Colossus',
    zoneId: 'starfall-barrens',
    archetypeId: 'tank',
    flavor: 'Cooled for a century and woke up in a temper.',
  },

  // ── Hollow Crown ─────────────────────────────────────────────
  {
    id: 'crown-revenant',
    name: 'Crown Revenant',
    zoneId: 'hollow-crown',
    archetypeId: 'bruiser',
    flavor: 'He wore it once. He would like it back, please.',
  },
  {
    id: 'throne-warden',
    name: 'Throne Warden',
    zoneId: 'hollow-crown',
    archetypeId: 'tank',
    flavor: 'Nobody has sat there in six hundred years. Still on duty.',
  },
  {
    id: 'archivist-of-ash',
    name: 'Archivist of Ash',
    zoneId: 'hollow-crown',
    archetypeId: 'caster',
    flavor: 'Still filing, though the building went some centuries ago.',
  },
  {
    id: 'gilded-swarm',
    name: 'Gilded Swarm',
    zoneId: 'hollow-crown',
    archetypeId: 'swarm',
    flavor: 'Somebody’s treasury, animate and thoroughly unhappy about it.',
  },
  {
    id: 'the-pale-chancellor',
    name: 'The Pale Chancellor',
    zoneId: 'hollow-crown',
    archetypeId: 'caster',
    flavor: 'He signs things. The ink is not ink.',
  },
  {
    id: 'hollow-kingsguard',
    name: 'Hollow Kingsguard',
    zoneId: 'hollow-crown',
    archetypeId: 'bruiser',
    flavor: 'Empty armour with all of the conviction still in it.',
  },
  {
    id: 'procession-of-nine',
    name: 'Procession of Nine',
    zoneId: 'hollow-crown',
    archetypeId: 'swarm',
    flavor: 'There were nine of them. There are still nine of them.',
  },
  {
    id: 'drowned-heraldry',
    name: 'Drowned Heraldry',
    zoneId: 'hollow-crown',
    archetypeId: 'skirmisher',
    flavor: 'A banner that has learned to move without any wind.',
  },
  {
    id: 'the-long-regent',
    name: 'The Long Regent',
    zoneId: 'hollow-crown',
    archetypeId: 'caster',
    flavor: 'Appointed for the interim. The interim never ended.',
  },
  {
    id: 'crownfall-colossus',
    name: 'Crownfall Colossus',
    zoneId: 'hollow-crown',
    archetypeId: 'tank',
    flavor: 'The statue in the square. One morning it stepped down.',
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
