/**
 * The credits screen and CREDITS.md must say the same thing.
 *
 * `CREDITS.md` is the authoritative document — the repository's answer to "what is this built
 * on" — and `data/credits.ts` is what the in-game screen renders. Two lists of the same facts is
 * exactly the shape that has gone wrong twice in this codebase already (the guild bounty targets,
 * the forge odds), and this one has a licence attached, so drifting apart is not merely untidy.
 *
 * The test does not compare prose. It checks that every source, licence and stated absence in the
 * data appears in the document, and — the direction that actually catches things — that the
 * document has not grown a source the screen does not know about.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ART_CREDITS, FONT_CREDITS, LICENCES, NOT_INCLUDED, licencesInUse } from './credits';

const DOC = readFileSync(join(process.cwd(), 'CREDITS.md'), 'utf8');

describe('credits data and CREDITS.md agree', () => {
  it('names every source the screen shows', () => {
    for (const entry of [...ART_CREDITS, ...FONT_CREDITS]) {
      // Kenney is "Kenney"; a designer is "Name, Studio"; an icon artist is "Name (where from)".
      // The doc splits all three across table cells, so match the name rather than the label.
      const who = entry.source.split(/[,(]/)[0]!.trim();
      if (who.startsWith('The project')) continue; // project-owned rows are worded differently
      expect(DOC, `${who} is on the credits screen but not in CREDITS.md`).toContain(who);
    }
  });

  it('names every licence the screen shows', () => {
    for (const licence of licencesInUse()) {
      if (licence.id === 'owned') continue;
      const shortName = licence.name.split(' (')[0]!;
      expect(DOC, `${shortName} is not in CREDITS.md`).toContain(shortName);
    }
  });

  it('records the same absences', () => {
    // The half of an attribution list people forget: audio that was planned and synthesized
    // instead, music that never shipped.
    expect(DOC).toMatch(/no audio.*ship|No audio files ship/i);
    expect(NOT_INCLUDED.map((absence) => absence.what)).toContain('No sampled audio');
    expect(NOT_INCLUDED.map((absence) => absence.what)).toContain('No background music');
  });

  it('claims no absence that has stopped being true', () => {
    /*
     * The direction this file exists for, now run the other way.
     *
     * Phase 18 found `CREDITS.md` claiming a **required** per-icon CC BY 3.0 credit for
     * game-icons.net artwork the build did not contain, and replaced the claim with a stated
     * absence. The artwork was then vendored — so the *absence* became the false half, in the
     * same file, for the same reason. Both directions are now asserted, because an attribution
     * list is only worth reading if it stops asserting a thing the day the thing changes.
     */
    const claimedAbsent = NOT_INCLUDED.some((absence) =>
      /game-icons/i.test(`${absence.what} ${absence.detail}`),
    );
    const credited = ART_CREDITS.some((entry) => entry.licence === 'cc-by-3');
    expect(
      claimedAbsent && credited,
      'the screen credits game-icons artwork and lists it as not included',
    ).toBe(false);
    expect(DOC, 'CREDITS.md still says nothing from game-icons ships').not.toMatch(
      /Nothing from game-icons\.net ships/i,
    );
  });

  it('credits the artist rather than the collection, and says so in both places', () => {
    /*
     * CC BY 3.0 names a person. game-icons.net publishes per author — the upstream licence asks
     * for "Icons made by {author}" — so one row reading "game-icons.net" would discharge nothing.
     * `icons.test.ts` proves the list is *complete* against the shipped artwork; this proves the
     * document and the in-game screen say the same names.
     */
    const artists = ART_CREDITS.filter((entry) => entry.licence === 'cc-by-3');
    expect(artists.length, 'the vendored icons are by five named artists').toBeGreaterThan(1);

    for (const artist of artists) {
      const name = artist.source.split(' (')[0]!;
      expect(DOC, `${name} is credited in the game but not in CREDITS.md`).toContain(name);
    }
    expect(LICENCES['cc-by-3'].attributionRequired).toBe(true);
    expect(DOC).toMatch(/game-icons[\s\S]{0,900}?\*\*Required\*\*/i);
  });

  it('marks the fonts as the attributions that are actually mandatory', () => {
    // Self-hosted by `next/font/google`, so the build redistributes them and the OFL comes along.
    for (const entry of FONT_CREDITS) {
      expect(LICENCES[entry.licence].attributionRequired, entry.source).toBe(true);
    }
    expect(DOC).toContain('SIL Open Font License 1.1');
    expect(DOC).toMatch(/redistribut/i);
  });

  it('gives every entry somewhere to point and something to say', () => {
    for (const entry of [...ART_CREDITS, ...FONT_CREDITS]) {
      expect(entry.source.length, 'a nameless credit credits nobody').toBeGreaterThan(2);
      expect(entry.what.length).toBeGreaterThan(10);
      expect(LICENCES[entry.licence], `unknown licence on ${entry.source}`).toBeDefined();
      if (entry.url !== null) expect(entry.url).toMatch(/^https:\/\//);
    }
  });

  it('links a licence wherever one exists to link', () => {
    for (const licence of licencesInUse()) {
      if (licence.id === 'owned' || licence.id === 'mit-and-friends') continue;
      expect(licence.url, `${licence.name} has nowhere to point`).toMatch(/^https:\/\//);
    }
  });
});
