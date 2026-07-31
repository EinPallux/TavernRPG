/**
 * Onboarding content integrity (tutorial spec §1, §2, §4).
 *
 * The tutorial is the one system whose bugs are almost all *content* bugs. A spotlight pointing
 * at a testid nobody renders dims the whole screen and then talks about an element the player
 * cannot find; a beat gated below the level of the room it happens in strands the tour at the
 * door; a glossary entry that defines one unknown word with two more is a dead end. None of
 * those throw, and none of them show up in a behaviour test — the engine works perfectly on bad
 * data.
 *
 * So this file checks the data against the app. The spotlight test in particular reads the
 * component source: those ids are the same ones the e2e suite drives, which is the point —
 * renaming one breaks a test before it breaks a player's first twenty minutes.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BEATS, BEAT_IDS, EXPLAINERS, EXPLAINER_IDS, beat, explainer } from './tutorial';
import { GLOSSARY, GLOSSARY_TOPICS, TOPIC_LABELS, glossary } from './glossary';
import { PLACES_BY_ID } from './places';

const COMPONENTS_DIR = join(process.cwd(), 'src/components');

function sourceText(dir: string): string {
  let text = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) text += sourceText(path);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.'))
      text += readFileSync(path, 'utf8');
  }
  return text;
}

const COMPONENTS = sourceText(COMPONENTS_DIR);

/** Rough but strict enough: a sentence ends at `.`, `!` or `?` followed by a space or the end. */
function sentences(copy: string): number {
  return copy.split(/[.!?](?:\s|$)/).filter((part) => part.trim().length > 0).length;
}

describe('the twelve beats', () => {
  it('points every spotlight at a testid something actually renders', () => {
    for (const definition of BEATS) {
      if (definition.spotlight === null) continue;
      expect(
        COMPONENTS.includes(`data-testid="${definition.spotlight}"`),
        `beat "${definition.id}" points at [data-testid="${definition.spotlight}"], which no component renders`,
      ).toBe(true);
    }
  });

  it('happens in a room the beat’s own level can open', () => {
    // A beat at level 3 in a room that opens at 4 is a tour that stops at a locked door.
    for (const definition of BEATS) {
      const place = PLACES_BY_ID[definition.place];
      expect(
        definition.fromLevel,
        `beat "${definition.id}" in ${place.name}`,
      ).toBeGreaterThanOrEqual(place.gateLevel);
    }
  });

  it('keeps every line to two sentences', () => {
    for (const definition of BEATS) {
      expect(
        sentences(definition.copy),
        `beat "${definition.id}": ${definition.copy}`,
      ).toBeLessThanOrEqual(2);
    }
  });

  it('is a curriculum, not a rail order — but never goes backwards in level', () => {
    let ceiling = 0;
    for (const definition of BEATS) {
      // Beats may repeat a level; they may not require *less* than one already behind them, or
      // the walk would stop on a beat the player passed the gate for two beats ago.
      ceiling = Math.max(ceiling, definition.fromLevel);
      expect(definition.fromLevel, definition.id).toBeLessThanOrEqual(ceiling);
    }
  });

  it('has a keeper on every line and no duplicate ids', () => {
    expect(new Set(BEAT_IDS).size).toBe(BEAT_IDS.length);
    for (const definition of BEATS)
      expect(definition.speaker.length, definition.id).toBeGreaterThan(2);
    expect(BEATS.map((entry) => entry.id)).toEqual([...BEAT_IDS]);
  });

  it('keeps "read" beats the minority', () => {
    // A tutorial made of "Got it" buttons is a tutorial made of reading (spec §2).
    const reads = BEATS.filter((entry) => entry.kind === 'read').length;
    expect(reads).toBeLessThan(BEATS.length / 2);
  });

  it('resolves by id, and refuses one it does not know', () => {
    expect(beat('welcome-in')?.place).toBe('tavern');
    expect(beat('not-a-beat')).toBeNull();
  });
});

describe('the glossary', () => {
  it('defines each term in one sentence', () => {
    for (const entry of GLOSSARY) {
      expect(sentences(entry.definition), entry.term).toBe(1);
    }
  });

  it('says a number wherever the rule has one', () => {
    /*
     * "Vigor is your daily energy" explains nothing. Not every entry can carry a figure, but the
     * ones about caps and rates must, or they are restating the word.
     *
     * Spelled-out numbers count — "twenty cards" reads better than "20 cards" in a sentence, and
     * the rule is about *answering the question*, not about digits.
     */
    const NUMBER =
      /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|fifty|hundred|thousand)\b/i;
    for (const term of ['Vigor', 'Ale', 'Pity', 'Backpack', 'Ember meter', 'Scrapping', 'Mount']) {
      expect(glossary(term)?.definition, term).toMatch(NUMBER);
    }
  });

  it('never leans on a term it has not defined', () => {
    /*
     * The graph rule from the module doc: if an entry uses another glossary word, that word is
     * in here too. Checked the useful way round — walk the *defined* terms and make sure any
     * entry mentioning one is not the only place it appears.
     */
    const defined = new Set(GLOSSARY.map((entry) => entry.term.toLowerCase()));
    for (const entry of GLOSSARY) {
      for (const word of ['starmetal', 'essence', 'honor', 'vigor', 'pity', 'set piece']) {
        if (!entry.definition.toLowerCase().includes(word)) continue;
        expect(defined.has(word), `"${entry.term}" leans on "${word}"`).toBe(true);
      }
    }
  });

  it('files everything under a topic that has a label', () => {
    for (const entry of GLOSSARY) {
      expect(GLOSSARY_TOPICS, entry.term).toContain(entry.topic);
      expect(TOPIC_LABELS[entry.topic], entry.term).toBeTruthy();
    }
  });

  it('has no duplicate terms and looks terms up case-insensitively', () => {
    const terms = GLOSSARY.map((entry) => entry.term.toLowerCase());
    expect(new Set(terms).size).toBe(terms.length);
    expect(glossary('vIgOr')?.term).toBe('Vigor');
    expect(glossary('nonsense')).toBeNull();
  });

  it('is big enough to be worth having', () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(40);
  });
});

describe('the one-time explainers', () => {
  it('keeps each body to a single line', () => {
    for (const entry of EXPLAINERS) {
      expect(sentences(entry.body), entry.id).toBeLessThanOrEqual(2);
      expect(entry.body.length, entry.id).toBeLessThan(160);
    }
  });

  it('has a title and a unique id for each', () => {
    expect(new Set(EXPLAINER_IDS).size).toBe(EXPLAINER_IDS.length);
    for (const id of EXPLAINER_IDS) expect(explainer(id)?.title, id).toBeTruthy();
    expect(explainer('not-an-explainer')).toBeNull();
  });
});
