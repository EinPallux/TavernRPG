/**
 * Who made what, as data (CREDITS.md is the prose version of this file).
 *
 * **This is a licence gate, so it is held to a licence gate's standard: accurate about what is
 * *not* here as well as what is.** The Phase 18 audit found `CREDITS.md` claiming a CC BY 3.0
 * attribution obligation for game-icons.net artwork the build does not contain — the plan called
 * for it, two module headers still say it arrived, and nothing was ever vendored. All 71 icons in
 * `src/components/icons/` are drawn in-house. An attribution list that credits work you are not
 * using is not generous, it is unreliable, and an unreliable list is the kind nobody checks the
 * day it matters.
 *
 * The same audit found the obligation that *is* real and was unlisted: `next/font/google`
 * self-hosts, so the build redistributes both typefaces and the OFL travels with them.
 *
 * `credits.test.ts` asserts this file and `CREDITS.md` name the same things, so the screen and
 * the document cannot drift — the same discipline as the forge tile and the forge dice reading
 * one table.
 */

export type LicenceId = 'cc0' | 'ofl' | 'owned' | 'mit-and-friends';

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
  {
    source: 'The project',
    url: null,
    what: 'All 71 interface, item and pet glyphs, drawn as a single-weight family',
    licence: 'owned',
    note: 'Hand-drawn so the chrome reads as a designed whole rather than an icon-pack collage.',
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
 */
export const NOT_INCLUDED: readonly { readonly what: string; readonly detail: string }[] = [
  {
    what: 'No sampled audio',
    detail:
      'All 24 sound cues are synthesized in the browser from oscillator recipes. No audio file ships with the game, and none is licensed from anyone.',
  },
  {
    what: 'No game-icons.net artwork',
    detail:
      'The plan called for it under CC BY 3.0. Nothing was vendored — every icon is drawn in-house — so no attribution is owed and none is claimed.',
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
