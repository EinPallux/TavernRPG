/**
 * The sixty seed guilds (content plan §5, guilds spec §5).
 *
 * Hand-authored rather than generated, because a guild the player joins or fights beside for a
 * month needs a *character* — a motto that sounds like somebody wrote it, not a slot-filled
 * adjective. `names.ts` keeps a guild-name generator for **churn**: guilds that form later in a
 * world's life get generated names, and only the founding sixty are written by hand.
 *
 * Banner colours come from our own token palette rather than a stock UI kit (CLAUDE.md rule 7).
 * Each is a field and a charge, which is enough for a two-tone heraldic mark.
 *
 * Pure data module.
 */

/** Heraldic palette — token names, resolved to CSS custom properties by the UI. */
export const BANNER_COLOURS = [
  'amber',
  'ember',
  'blood',
  'moss',
  'arcane',
  'parchment',
  'wood',
  'ink',
] as const;
export type BannerColour = (typeof BANNER_COLOURS)[number];

export interface GuildDef {
  /** Index into the seeded world's guild list; stable forever. */
  readonly id: number;
  readonly name: string;
  readonly motto: string;
  readonly field: BannerColour;
  readonly charge: BannerColour;
}

const GUILD_LIST = [
  {
    id: 0,
    name: 'The Amber Blades',
    motto: 'Sharp, and paid on time.',
    field: 'amber',
    charge: 'ink',
  },
  {
    id: 1,
    name: 'Order of the Quiet Flame',
    motto: 'We do not announce ourselves.',
    field: 'ember',
    charge: 'wood',
  },
  {
    id: 2,
    name: 'The Long Watch',
    motto: 'Someone has to be awake.',
    field: 'arcane',
    charge: 'parchment',
  },
  {
    id: 3,
    name: 'Iron Cartwheel Company',
    motto: 'The road pays better than the crown.',
    field: 'wood',
    charge: 'amber',
  },
  {
    id: 4,
    name: 'The Crimson Hounds',
    motto: 'We find what is owed.',
    field: 'blood',
    charge: 'parchment',
  },
  {
    id: 5,
    name: 'Sons of the Broken Oar',
    motto: 'We came inland and stayed.',
    field: 'arcane',
    charge: 'amber',
  },
  {
    id: 6,
    name: 'The Gilded Tankards',
    motto: 'First round is guild business.',
    field: 'amber',
    charge: 'ember',
  },
  {
    id: 7,
    name: 'Greyfen Standing',
    motto: 'The marsh keeps its own.',
    field: 'moss',
    charge: 'ink',
  },
  {
    id: 8,
    name: 'The Ninth Bell',
    motto: 'Late, but never absent.',
    field: 'ink',
    charge: 'amber',
  },
  {
    id: 9,
    name: 'Ashfield Reclamation',
    motto: 'Something grows there now.',
    field: 'ember',
    charge: 'moss',
  },
  {
    id: 10,
    name: 'The Wandering Anvils',
    motto: 'We bring the forge.',
    field: 'wood',
    charge: 'ember',
  },
  {
    id: 11,
    name: 'Order of the Hollow Hill',
    motto: 'Ask us what is under it.',
    field: 'moss',
    charge: 'parchment',
  },
  {
    id: 12,
    name: 'The Salt Ravens',
    motto: 'We were here before the harbour.',
    field: 'ink',
    charge: 'parchment',
  },
  {
    id: 13,
    name: 'Winterborn Company',
    motto: 'Cold is only weather.',
    field: 'arcane',
    charge: 'parchment',
  },
  {
    id: 14,
    name: 'The Bright Shore',
    motto: 'Sail out, walk back.',
    field: 'arcane',
    charge: 'amber',
  },
  {
    id: 15,
    name: 'Thistlebarrow Free Company',
    motto: 'No lord, no levy, no complaints.',
    field: 'moss',
    charge: 'amber',
  },
  {
    id: 16,
    name: 'The Last Cart',
    motto: 'We leave when it is empty.',
    field: 'wood',
    charge: 'parchment',
  },
  {
    id: 17,
    name: 'Keepers of the Red Ford',
    motto: 'The crossing is ours to hold.',
    field: 'blood',
    charge: 'wood',
  },
  {
    id: 18,
    name: 'The Sworn Lanterns',
    motto: 'Light first. Questions later.',
    field: 'amber',
    charge: 'wood',
  },
  { id: 19, name: 'Emberkin', motto: 'Born in ash, raised in it.', field: 'ember', charge: 'ink' },
  {
    id: 20,
    name: 'The Northern Shields',
    motto: 'Behind us, nothing passes.',
    field: 'arcane',
    charge: 'ink',
  },
  {
    id: 21,
    name: 'Coinbiters',
    motto: 'Every piece gets tested.',
    field: 'amber',
    charge: 'blood',
  },
  {
    id: 22,
    name: 'The Hedgewitch Circle',
    motto: 'Small magics, correctly done.',
    field: 'moss',
    charge: 'arcane',
  },
  {
    id: 23,
    name: 'Old Wall Garrison',
    motto: 'It still stands. So do we.',
    field: 'ink',
    charge: 'moss',
  },
  {
    id: 24,
    name: 'The Sunken Mill',
    motto: 'The wheel turns underwater.',
    field: 'arcane',
    charge: 'moss',
  },
  {
    id: 25,
    name: 'Bladewrights Guild',
    motto: 'You are holding our reputation.',
    field: 'wood',
    charge: 'amber',
  },
  {
    id: 26,
    name: 'The Second Chance',
    motto: 'Everyone gets one. Only one.',
    field: 'parchment',
    charge: 'blood',
  },
  {
    id: 27,
    name: 'Frostbitten',
    motto: 'We counted the fingers we kept.',
    field: 'arcane',
    charge: 'blood',
  },
  {
    id: 28,
    name: 'The Grey Pines',
    motto: 'Quiet company, quiet work.',
    field: 'moss',
    charge: 'wood',
  },
  {
    id: 29,
    name: 'Order of the Winter Gate',
    motto: 'Shut it behind you.',
    field: 'ink',
    charge: 'arcane',
  },
  {
    id: 30,
    name: 'The Empty Purse',
    motto: 'Founded broke. Still here.',
    field: 'parchment',
    charge: 'wood',
  },
  {
    id: 31,
    name: 'Dawnbreakers',
    motto: 'Up before the bakers.',
    field: 'amber',
    charge: 'parchment',
  },
  {
    id: 32,
    name: 'The Duskriders',
    motto: 'The road is safer than it looks.',
    field: 'ink',
    charge: 'ember',
  },
  {
    id: 33,
    name: 'Hearthkeepers',
    motto: 'Somewhere to come back to.',
    field: 'ember',
    charge: 'parchment',
  },
  {
    id: 34,
    name: 'The Low Road Company',
    motto: 'Cheaper, longer, ours.',
    field: 'wood',
    charge: 'moss',
  },
  {
    id: 35,
    name: 'Stormcallers',
    motto: 'We did not do that. Probably.',
    field: 'arcane',
    charge: 'ember',
  },
  { id: 36, name: 'The Black Thorns', motto: 'Grasp us carefully.', field: 'ink', charge: 'blood' },
  {
    id: 37,
    name: 'Marlcombe Levy',
    motto: 'Farmers with a schedule.',
    field: 'moss',
    charge: 'parchment',
  },
  {
    id: 38,
    name: 'The Oathkeepers',
    motto: 'Ask before you swear.',
    field: 'parchment',
    charge: 'amber',
  },
  {
    id: 39,
    name: 'Roadwardens of Aldenvale',
    motto: 'Every mile, twice a week.',
    field: 'wood',
    charge: 'arcane',
  },
  {
    id: 40,
    name: 'The Silver Keys',
    motto: 'No door is a problem.',
    field: 'parchment',
    charge: 'ink',
  },
  {
    id: 41,
    name: 'Bridgeburners',
    motto: 'Only when asked. Usually.',
    field: 'ember',
    charge: 'blood',
  },
  {
    id: 42,
    name: 'The Quiet Coin',
    motto: 'Discretion is the service.',
    field: 'ink',
    charge: 'amber',
  },
  {
    id: 43,
    name: 'Ossaline Chapter',
    motto: 'The bones remember the road.',
    field: 'parchment',
    charge: 'ember',
  },
  {
    id: 44,
    name: 'The Hungry Wolves',
    motto: 'We eat after the work.',
    field: 'blood',
    charge: 'ink',
  },
  {
    id: 45,
    name: 'Fenwalkers',
    motto: 'Mind where you put that foot.',
    field: 'moss',
    charge: 'ember',
  },
  { id: 46, name: 'The Third Try', motto: 'It works this time.', field: 'amber', charge: 'moss' },
  {
    id: 47,
    name: 'Standing Stones Company',
    motto: 'Older than the charter.',
    field: 'ink',
    charge: 'parchment',
  },
  { id: 48, name: 'The Open Palm', motto: 'Take it. Owe us.', field: 'parchment', charge: 'moss' },
  { id: 49, name: 'Ravensmoot', motto: 'We meet when it matters.', field: 'ink', charge: 'wood' },
  {
    id: 50,
    name: 'The Barefoot Order',
    motto: 'Boots are a vanity.',
    field: 'wood',
    charge: 'blood',
  },
  {
    id: 51,
    name: 'Cindermarch',
    motto: 'South, until it is warm enough.',
    field: 'ember',
    charge: 'amber',
  },
  {
    id: 52,
    name: 'The Well-Fed',
    motto: 'A fed guild fights longer.',
    field: 'amber',
    charge: 'wood',
  },
  {
    id: 53,
    name: 'Nightwardens',
    motto: 'You sleep. That is the arrangement.',
    field: 'arcane',
    charge: 'ink',
  },
  {
    id: 54,
    name: 'The Unfinished Work',
    motto: 'Ask again next season.',
    field: 'wood',
    charge: 'ink',
  },
  {
    id: 55,
    name: 'Brackenhurst Muster',
    motto: 'Two hundred years of turning up.',
    field: 'moss',
    charge: 'blood',
  },
  {
    id: 56,
    name: 'The Gilded Facet',
    motto: 'Cut well, set true.',
    field: 'amber',
    charge: 'arcane',
  },
  {
    id: 57,
    name: 'Halfhand Company',
    motto: 'It was worth the hand.',
    field: 'blood',
    charge: 'amber',
  },
  {
    id: 58,
    name: 'The Rarely Sung',
    motto: 'The bards have not caught up.',
    field: 'parchment',
    charge: 'arcane',
  },
  {
    id: 59,
    name: 'Serathiel’s Own',
    motto: 'We remember who taught us.',
    field: 'amber',
    charge: 'ember',
  },
] as const satisfies readonly GuildDef[];

export const GUILDS: readonly GuildDef[] = GUILD_LIST;

/** Founding guilds a world starts with (world-simulation spec §2). */
export const GUILD_COUNT = GUILD_LIST.length;

export function guild(id: number): GuildDef | null {
  return GUILDS[id] ?? null;
}

/* ── Founding a hall of your own (guilds spec §1) ──────────────────────────────── */

/** The player's guild id. Bot guilds are 0…59; the founded one is this. */
export const PLAYER_GUILD_ID = 1_000;

/** Sigils the banner builder offers. Drawn from the icon family, not a new asset set. */
export const SIGIL_ICONS = [
  'sword',
  'axe',
  'shield',
  'staff',
  'crossbow',
  'lute',
  'anvil',
  'gem',
  'laurel',
  'tankard',
  'spark',
  'paw',
] as const;
export type SigilIcon = (typeof SIGIL_ICONS)[number];

export const GUILD_NAME_MIN = 3;
export const GUILD_NAME_MAX = 28;

export type GuildNameRefusal =
  | { readonly kind: 'too-short'; readonly min: number }
  | { readonly kind: 'too-long'; readonly max: number }
  | { readonly kind: 'bad-characters' }
  | { readonly kind: 'taken'; readonly by: string };

/**
 * Is this a name the player may found under?
 *
 * The collision check is the point. Sixty halls are authored here and the *generator* can produce
 * thousands more as bot guilds churn, so a player who founds "The Amber Blades" would eventually
 * find themselves sharing a name with a guild the simulation invented — and every chat line,
 * Crier headline and Hall row that names a guild would become ambiguous. Cheaper to refuse once.
 */
export function validateGuildName(raw: string): { ok: true } | { ok: false; refusal: GuildNameRefusal } {
  const name = raw.trim();
  if (name.length < GUILD_NAME_MIN) return { ok: false, refusal: { kind: 'too-short', min: GUILD_NAME_MIN } };
  if (name.length > GUILD_NAME_MAX) return { ok: false, refusal: { kind: 'too-long', max: GUILD_NAME_MAX } };
  // Letters, digits, spaces and the punctuation the authored names already use.
  if (!/^[\p{L}\p{N} '’.\-]+$/u.test(name)) return { ok: false, refusal: { kind: 'bad-characters' } };

  const folded = foldName(name);
  const clash = GUILDS.find((hall) => foldName(hall.name) === folded);
  if (clash) return { ok: false, refusal: { kind: 'taken', by: clash.name } };

  return { ok: true };
}

/** Case, spacing and curly-quote insensitive, so "the amber blades" is still taken. */
function foldName(name: string): string {
  return name.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
}
