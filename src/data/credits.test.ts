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
      // Kenney is "Kenney"; a designer entry is "Name, Studio" in the data and split across a
      // table cell in the doc, so match on the first token rather than the whole string.
      const who = entry.source.split(',')[0]!.trim();
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
    // The half of an attribution list people forget, and the half this project has had to correct
    // twice: audio that was planned and synthesized instead, icons that were planned and drawn.
    expect(DOC).toMatch(/no audio.*ship|No audio files ship/i);
    expect(DOC).toMatch(/game-icons\.net/);
    expect(NOT_INCLUDED.map((absence) => absence.what)).toContain('No game-icons.net artwork');
    expect(NOT_INCLUDED.map((absence) => absence.what)).toContain('No sampled audio');
  });

  it('has not quietly regained a CC BY obligation', () => {
    /*
     * The specific regression this file exists for.
     *
     * `CREDITS.md` claimed a **required** per-icon CC BY 3.0 credit for game-icons.net artwork the
     * build has never contained — through sixteen phases, a licence-gate line in the ROADMAP, and
     * a header in this very file calling itself authoritative. If somebody vendors that artwork
     * later the obligation becomes real and this test should fail, loudly, so the author list gets
     * written rather than assumed.
     */
    const claimsRequired = /game-icons[\s\S]{0,400}?\*\*Required\*\*/i.test(DOC);
    const dataHasIt = [...ART_CREDITS, ...FONT_CREDITS].some((entry) =>
      entry.source.toLowerCase().includes('game-icons'),
    );
    expect(
      claimsRequired,
      'CREDITS.md marks game-icons attribution required — add the per-icon author list and the data entry',
    ).toBe(dataHasIt);
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
