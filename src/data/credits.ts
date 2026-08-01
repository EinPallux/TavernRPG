/**
 * Who made what, as data (CREDITS.md is the prose version of this file).
 *
 * **This is a licence gate, so it is held to a licence gate's standard: accurate about what is
 * *not* here as well as what is.** The Phase 18 audit found `CREDITS.md` claiming a CC BY 3.0
 * obligation for game-icons.net artwork the build did not contain, and rewrote the row as an
 * absence with a note saying that if the artwork were ever vendored the obligation would be real
 * and per-icon. It now is: 67 of the game's 69 glyphs are game-icons.net drawings
 * (`game_assets/icons/`, compiled by `npm run icons:sync`), by five named artists.
 *
 * **CC BY 3.0 credits the artist, not the collection**, which is why this file lists five sources
 * rather than one line reading "game-icons.net". The author travels with each drawing from the
 * vendored directory name through `VENDORED_ICONS` to here, and
 * `src/components/icons/icons.test.ts` fails if a sixth artist ever ships without being added, or
 * if a count below goes stale — a census, not a promise, because the last version of this row was
 * a promise.
 *
 * The same Phase 18 audit found the obligation that was real and unlisted: `next/font/google`
 * self-hosts, so the build redistributes both typefaces and the OFL travels with them.
 *
 * `credits.test.ts` asserts this file and `CREDITS.md` name the same things, so the screen and
 * the document cannot drift — the same discipline as the forge tile and the forge dice reading
 * one table.
 */

export type LicenceId = 'cc0' | 'cc-by-3' | 'ofl' | 'owned' | 'mit-and-friends';

export interface Licence {
  readonly id: LicenceId;
  readonly name: string;
  readonly url: string | null;
  /** Does using it oblige us to say so? The answer decides whether this screen is optional. */
  readonly attributionRequired: boolean;
}

export const LICENCES: Readonly<Record<LicenceId, Licence>> = {
  cc0: {
    id: 'cc0',
    name: 'CC0 1.0 (public domain)',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
  },
  'cc-by-3': {
    id: 'cc-by-3',
    name: 'CC BY 3.0',
    url: 'https://creativecommons.org/licenses/by/3.0/',
    attributionRequired: true,
  },
  ofl: {
    id: 'ofl',
    name: 'SIL Open Font License 1.1',
    url: 'https://scripts.sil.org/OFL',
    attributionRequired: true,
  },
  owned: { id: 'owned', name: 'Owned by the project', url: null, attributionRequired: false },
  'mit-and-friends': {
    id: 'mit-and-friends',
    name: 'MIT and similar',
    url: null,
    attributionRequired: false,
  },
};

export interface CreditEntry {
  readonly source: string;
  readonly url: string | null;
  readonly what: string;
  readonly licence: LicenceId;
  /** Shown under the entry — why it is here, or what about it is worth knowing. */
  readonly note?: string;
}

export const ART_CREDITS: readonly CreditEntry[] = [
  {
    source: 'Kenney',
    url: 'https://kenney.nl',
    what: 'Fantasy UI pack (panels, borders, dividers) and the VFX particle sheets behind every impact burst',
    licence: 'cc0',
    note: 'Public domain — credited by choice, not obligation. The pack licences ship alongside the art.',
  },
  {
    source: 'The project author',
    url: null,
    what: '23 room backdrops and 5 class portraits',
    licence: 'owned',
  },
  /*
   * Five rows for one website, because CC BY 3.0 asks for the artist.
   *
   * game-icons.net publishes per author — the upstream archive is one directory per contributor
   * and its licence file says "include a mention 'Icons made by {author}'". Crediting the
   * collection would name nobody the licence names. Each `what` opens with that artist's shipped
   * count, and `icons.test.ts` reads the number back out of the string and checks it against the
   * artwork on disk, so these cannot quietly go stale.
   */
  {
    source: 'Lorc (game-icons.net)',
    url: 'https://lorcblog.blogspot.com',
    what: '43 icons — the tankard, the anvil, the duelling swords, every weapon and most of the twelve companions',
    licence: 'cc-by-3',
  },
  {
    source: 'Delapouite (game-icons.net)',
    url: 'https://delapouite.com',
    what: '20 icons — the hero, the watchtower, the dice, the coins, the treasure map and the road',
    licence: 'cc-by-3',
  },
  {
    source: 'Skoll (game-icons.net)',
    url: 'https://game-icons.net',
    what: '2 icons — the mule and the warhorse at the Wandering Stables',
    licence: 'cc-by-3',
  },
  {
    source: 'Carl Olsen (game-icons.net)',
    url: 'https://twitter.com/unstoppableCarl',
    what: '1 icon — the crossbow',
    licence: 'cc-by-3',
  },
  {
    source: 'Willdabeast (game-icons.net)',
    url: 'https://wjbstories.blogspot.com',
    what: '1 icon — the round shield',
    licence: 'cc-by-3',
  },
  {
    source: 'The project',
    url: null,
    what: 'The chevron and the Vigor tankard — the two glyphs that are not drawings',
    licence: 'owned',
    note: 'A chevron is a direction rather than a thing, and the tankard is a meter whose clip path is tied to the mug it draws, so neither could be swapped for artwork without getting worse.',
  },
];

export const FONT_CREDITS: readonly CreditEntry[] = [
  {
    source: 'Juan Pablo del Peral, Huerta Tipográfica',
    url: 'https://fonts.google.com/specimen/Alegreya+Sans+SC',
    what: 'Alegreya Sans SC — every heading in the game',
    licence: 'ofl',
  },
  {
    source: 'Rasmus Andersson',
    url: 'https://fonts.google.com/specimen/Inter',
    what: 'Inter — every line of body text',
    licence: 'ofl',
  },
];

/**
 * What the game does **not** contain, said out loud.
 *
 * Both entries were listed as dependencies in the plan and neither shipped. Recording the absence
 * costs two lines and stops the next person re-deriving it from a stale comment — the audio one
 * has already been rediscovered once (asset-pipeline §6).
 *
 * The icons used to be the third row here. They moved up into `ART_CREDITS` the day the artwork
 * was actually vendored, which is the only way this list is worth reading: an absence has to stop
 * being claimed the moment it stops being true.
 */
export const NOT_INCLUDED: readonly { readonly what: string; readonly detail: string }[] = [
  {
    what: 'No sampled audio',
    detail:
      'All 24 sound cues are synthesized in the browser from oscillator recipes. No audio file ships with the game, and none is licensed from anyone.',
  },
  {
    what: 'No background music',
    detail:
      'The game loops a bgm.mp3 if you supply one. Whoever supplies the file owns the rights to it; nothing ships.',
  },
];

/** Every licence actually in play, for the summary line. */
export function licencesInUse(): readonly Licence[] {
  const used = new Set<LicenceId>([...ART_CREDITS, ...FONT_CREDITS].map((entry) => entry.licence));
  return [...used].map((id) => LICENCES[id]);
}
