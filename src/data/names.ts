/**
 * The name generator (content plan §5).
 *
 * Fifteen hundred heroes need fifteen hundred names that sound like they came from the same
 * world without sounding like each other. Three cultures, each with its own consonant palette:
 * **Northfolk** are hard and clipped, **Valefolk** are pastoral and soft, **Emberfolk** are warm
 * and ashen. Two syllables from a culture's own tables, plus an epithet, is enough to give
 * ~1,300 given names × 128 epithets — far more combinations than the world has people.
 *
 * Names are **derived from the bot's id, never stored** (world-simulation spec §7): a bot record
 * is only its divergence from what the seed already says. That means every function here has to
 * be a pure function of an index, not of a draw order.
 *
 * Pure data module.
 */

export const CULTURES = ['northfolk', 'valefolk', 'emberfolk'] as const;
export type Culture = (typeof CULTURES)[number];

interface SyllableTable {
  readonly heads: readonly string[];
  readonly tails: readonly string[];
}

const TABLES: Readonly<Record<Culture, SyllableTable>> = {
  // Hard consonants, short vowels. These are people from somewhere cold.
  northfolk: {
    heads: [
      'Bry',
      'Kald',
      'Vor',
      'Skar',
      'Hrun',
      'Thra',
      'Gunn',
      'Eir',
      'Sig',
      'Dag',
      'Ulf',
      'Bran',
      'Hald',
      'Torr',
      'Yrs',
      'Frey',
      'Gest',
      'Sten',
      'Ott',
      'Rask',
      'Veig',
      'Hraf',
      'Idu',
      'Sval',
      'Knut',
      'Orm',
    ],
    tails: [
      'a',
      'en',
      'vald',
      'mir',
      'dis',
      'grim',
      'hild',
      'rik',
      'unn',
      'bjorn',
      'garth',
      'stein',
      'run',
      'var',
      'laug',
      'olf',
      'na',
      'gar',
    ],
  },
  // Rounder mouthfeel, place-name endings. Farmers, millers, and the odd poacher.
  valefolk: {
    heads: [
      'Aer',
      'Bram',
      'Cael',
      'Del',
      'Ell',
      'Fenn',
      'Gwyn',
      'Har',
      'Ives',
      'Lyn',
      'Mer',
      'Nol',
      'Osw',
      'Per',
      'Row',
      'Syl',
      'Tam',
      'Wren',
      'Ald',
      'Brack',
      'Cor',
      'Dun',
      'Holl',
      'Marl',
      'Pip',
      'Thist',
    ],
    tails: [
      'wick',
      'field',
      'ley',
      'combe',
      'ford',
      'stow',
      'bury',
      'mere',
      'hurst',
      'ridge',
      'dale',
      'barrow',
      'thorn',
      'willow',
      'en',
      'ys',
      'in',
      'a',
    ],
  },
  // Long vowels and soft sibilants — the accent of the ash country south of Emberhollow.
  emberfolk: {
    heads: [
      'Ash',
      'Cin',
      'Emb',
      'Fyr',
      'Ign',
      'Kohl',
      'Mal',
      'Or',
      'Pyr',
      'Rus',
      'Sol',
      'Tal',
      'Vex',
      'Zar',
      'Brand',
      'Cend',
      'Ferr',
      'Ith',
      'Loam',
      'Nyr',
      'Oss',
      'Quill',
      'Sarn',
      'Umb',
      'Cass',
      'Dree',
    ],
    tails: [
      'is',
      'eth',
      'ora',
      'ax',
      'eus',
      'ine',
      'oth',
      'ara',
      'en',
      'us',
      'ith',
      'ael',
      'on',
      'ira',
      'esh',
      'ux',
      'al',
      'yr',
    ],
  },
};

/**
 * Epithets. Deliberately a mix of three shapes — "the X", "of the X" and a bare byname — so a
 * ladder page does not read as one sentence repeated a hundred times.
 */
export const EPITHETS: readonly string[] = [
  'the Unbowed',
  'the Quick',
  'the Patient',
  'the Loud',
  'the Lucky',
  'the Unlucky',
  'the Stubborn',
  'the Kind',
  'the Sharp',
  'the Grim',
  'the Bright',
  'the Quiet',
  'the Restless',
  'the Certain',
  'the Doubtful',
  'the Merry',
  'the Bitter',
  'the Steady',
  'the Reckless',
  'the Careful',
  'the Fair',
  'the Foul',
  'the Tall',
  'the Small',
  'the Elder',
  'the Younger',
  'the Twice-Sworn',
  'the Late',
  'the Early',
  'the Sudden',
  'the Weary',
  'the Sleepless',
  'the Well-Fed',
  'the Hungry',
  'the Honest',
  'the Crooked',
  'the Barefoot',
  'the Gilded',
  'the Ragged',
  'the Unwashed',
  'the Polite',
  'the Rude',
  'of the Long Watch',
  'of the Low Road',
  'of the Ninth Bell',
  'of the Broken Oar',
  'of the Red Ford',
  'of the Salt Marsh',
  'of the Thin Ice',
  'of the Old Wall',
  'of the Winter Gate',
  'of the Ash Fields',
  'of the Quiet Flame',
  'of the Hollow Hill',
  'of the Last Cart',
  'of the Sunken Mill',
  'of the Grey Pines',
  'of the Bright Shore',
  'of the Empty Purse',
  'of the Full Tankard',
  'of the Second Chance',
  'of the Third Try',
  'Ironhand',
  'Stonefoot',
  'Swiftwater',
  'Greycloak',
  'Redbrand',
  'Blackthorn',
  'Coldiron',
  'Emberkin',
  'Ashwalker',
  'Nightwarden',
  'Dawnbreaker',
  'Duskrider',
  'Oathkeeper',
  'Oathbreaker',
  'Shieldsworn',
  'Bladewright',
  'Bowbender',
  'Stringpuller',
  'Coinbiter',
  'Cupbearer',
  'Roadwarden',
  'Gatewatch',
  'Hedgewitch',
  'Fenwalker',
  'Longstride',
  'Shortrest',
  'Hardtack',
  'Sourbread',
  'Winterborn',
  'Summerborn',
  'Stormcaller',
  'Rainmaker',
  'Frostbitten',
  'Sunstruck',
  'Windshorn',
  'Rootbound',
  'the Twice-Buried',
  'the Unfinished',
  'the Unproven',
  'the Unremarkable',
  'the Well-Known',
  'the Newly Famous',
  'the Nearly Rich',
  'the Formerly Rich',
  'Firstlight',
  'Lastlight',
  'Halfhand',
  'Openpalm',
  'Closedfist',
  'Quickwit',
  'Slowburn',
  'Hearthkeeper',
  'Doorward',
  'Wallbreaker',
  'Bridgeburner',
  'Pathfinder',
  'the Sung-About',
  'the Rarely-Sung',
  'the Overdue',
  'the Long-Awaited',
  'the Third of That Name',
  'the Only One Left',
  'the Mostly Reliable',
  'the Occasionally Brave',
];

/**
 * A given name for an index.
 *
 * Uses two coprime-ish strides through the tables rather than a hash, so consecutive ids give
 * visibly different names instead of clustering on one head syllable — which is what a naive
 * `index % heads.length` produces on a sorted ladder.
 */
export function givenName(culture: Culture, index: number): string {
  const table = TABLES[culture];
  const i = Math.abs(Math.floor(index));
  const head = table.heads[i % table.heads.length]!;
  const tail = table.tails[Math.floor(i / table.heads.length) % table.tails.length]!;
  return head + tail;
}

export function epithet(index: number): string {
  return EPITHETS[Math.abs(Math.floor(index)) % EPITHETS.length]!;
}

/** Full display name: "Skarvald the Unbowed". */
export function heroName(culture: Culture, nameIndex: number, epithetIndex: number): string {
  return `${givenName(culture, nameIndex)} ${epithet(epithetIndex)}`;
}

/** How many distinct given names each culture can produce, for the coverage test. */
export function givenNameCapacity(culture: Culture): number {
  return TABLES[culture].heads.length * TABLES[culture].tails.length;
}

/** Total distinct full names across every culture. */
export function nameCapacity(): number {
  return CULTURES.reduce((sum, c) => sum + givenNameCapacity(c), 0) * EPITHETS.length;
}

/* ── Guild names (content plan §5) ─────────────────────────────────────────────── */

const GUILD_ADJECTIVES: readonly string[] = [
  'Amber',
  'Iron',
  'Quiet',
  'Crimson',
  'Wandering',
  'Gilded',
  'Broken',
  'Silver',
  'Ashen',
  'Northern',
  'Hollow',
  'Bright',
  'Long',
  'Last',
  'Sworn',
  'Grey',
  'Ninth',
  'Salt',
  'Winter',
  'Ember',
];

const GUILD_NOUNS: readonly string[] = [
  'Blades',
  'Lanterns',
  'Flame',
  'Hounds',
  'Company',
  'Watch',
  'Anvils',
  'Ravens',
  'Tankards',
  'Roads',
  'Keys',
  'Coins',
  'Oars',
  'Shields',
  'Thorns',
  'Wolves',
  'Bells',
  'Cartwheels',
  'Hearths',
  'Standards',
];

const GUILD_FORMS: readonly string[] = [
  'The {adj} {noun}',
  'Order of the {adj} {noun}',
  'The {adj} {noun} Company',
  'Sons of the {adj} {noun}',
  'The {noun} of {adj} Hollow',
];

/** A guild name for an index. Same stride trick as hero names. */
export function guildName(index: number): string {
  const i = Math.abs(Math.floor(index));
  const adj = GUILD_ADJECTIVES[i % GUILD_ADJECTIVES.length]!;
  const noun = GUILD_NOUNS[Math.floor(i / GUILD_ADJECTIVES.length) % GUILD_NOUNS.length]!;
  const form = GUILD_FORMS[Math.floor(i / 7) % GUILD_FORMS.length]!;
  return form.replace('{adj}', adj).replace('{noun}', noun);
}

export function guildNameCapacity(): number {
  return GUILD_ADJECTIVES.length * GUILD_NOUNS.length * GUILD_FORMS.length;
}
