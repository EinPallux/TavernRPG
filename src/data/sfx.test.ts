/**
 * The cue vocabulary, checked as data.
 *
 * `state/sfx.ts` turns these numbers into oscillators without validating any of them — an
 * envelope whose attack is longer than its duration produces a ramp that never arrives, and a
 * layer at `gain: 4` clips the master for every cue playing at the same moment. Neither throws.
 * Both are silent-to-slightly-wrong, which is the worst failure mode a sound has, so the recipes
 * are checked here where a bad number is a red test rather than a mystery in someone's speakers.
 */

import { describe, expect, it } from 'vitest';
import { SFX, SFX_IDS, THROTTLE_MS, cueLength, sfx, type SfxCategory, type SfxDef } from './sfx';

/** Every family named by the type. Listed rather than derived so adding one is a deliberate act. */
const CATEGORIES: readonly SfxCategory[] = ['ui', 'combat', 'reward', 'forge'];

describe('the cue vocabulary', () => {
  it('has exactly one definition per id, and no strays', () => {
    expect(SFX.map((entry) => entry.id).sort()).toEqual([...SFX_IDS].sort());
  });

  it('resolves every id and refuses everything else', () => {
    for (const id of SFX_IDS) expect(sfx(id)?.id).toBe(id);
    // Not a throw: a bad id has to be silence, or `play` needs a try/catch at every call site.
    expect(sfx('coin-drop')).toBeNull();
    expect(sfx('')).toBeNull();
    // This one caught the lookup answering with `Object` back when it was an object literal.
    expect(sfx('constructor')).toBeNull();
    expect(sfx('__proto__')).toBeNull();
  });

  it('uses every family it declares', () => {
    const used = new Set(SFX.map((entry) => entry.category));
    expect([...used].sort()).toEqual([...CATEGORIES].sort());
  });
});

describe('every recipe is playable', () => {
  it.each(SFX.map((entry) => [entry.id, entry] as const))('%s', (_id, definition: SfxDef) => {
    // A cue at gain 0 is a cue nobody wrote on purpose; above 1 it clips the master.
    expect(definition.gain).toBeGreaterThan(0);
    expect(definition.gain).toBeLessThanOrEqual(1);
    expect(definition.layers.length).toBeGreaterThan(0);

    for (const layer of definition.layers) {
      expect(layer.duration).toBeGreaterThan(0);
      expect(layer.gain).toBeGreaterThan(0);
      expect(layer.gain).toBeLessThanOrEqual(1);
      expect(layer.delay ?? 0).toBeGreaterThanOrEqual(0);

      /*
       * The attack has to fit inside the layer.
       *
       * `playLayer` ramps up over `attack` and then down to silence at `duration`, both scheduled
       * from the same start. An attack longer than the duration schedules the second ramp before
       * the first has finished, and Web Audio resolves that by cancelling the swell — the layer
       * plays, quietly, wrong, and without complaint.
       */
      expect(layer.attack).toBeGreaterThan(0);
      expect(layer.attack).toBeLessThan(layer.duration);

      if (layer.wave === 'noise') {
        // Noise has no pitch to slide, and a filter is what makes it a thud instead of a hiss.
        expect(layer.from).toBe(0);
        expect(layer.to).toBe(0);
        expect(layer.filter).toBeGreaterThan(0);
      } else {
        // `exponentialRampToValueAtTime` cannot touch zero, and nothing audible starts there.
        expect(layer.from).toBeGreaterThan(0);
        expect(layer.to).toBeGreaterThan(0);
        expect(layer.from).toBeLessThan(20_000);
        expect(layer.to).toBeLessThan(20_000);
      }

      if (layer.filter !== undefined) expect(layer.filter).toBeGreaterThan(0);
    }
  });
});

describe('everything is short', () => {
  it('keeps every cue under 900ms', () => {
    const longest = SFX.map((entry) => [entry.id, cueLength(entry)] as const).sort(
      (a, b) => b[1] - a[1],
    );
    expect(longest[0]?.[1]).toBeLessThanOrEqual(0.9);
    // The Epic reveal is the one that is allowed to be the longest. If something else takes the
    // top slot, the mix has drifted even if the ceiling still holds.
    expect(longest[0]?.[0]).toBe('loot-epic');
  });

  it('keeps the interface under 150ms', () => {
    for (const entry of SFX.filter((candidate) => candidate.category === 'ui')) {
      expect(cueLength(entry)).toBeLessThan(0.15);
    }
  });

  it('measures a cue from its last layer ending, not its longest one', () => {
    // The property that matters: a short layer parked late outlasts a long layer at zero.
    expect(
      cueLength({
        id: 'tick',
        category: 'ui',
        gain: 1,
        layers: [
          { wave: 'sine', from: 400, to: 400, duration: 0.4, attack: 0.01, gain: 1 },
          { wave: 'sine', from: 400, to: 400, duration: 0.1, attack: 0.01, delay: 0.6, gain: 1 },
        ],
      }),
    ).toBeCloseTo(0.7, 5);
  });
});

describe('throttling', () => {
  it('covers every family', () => {
    expect(Object.keys(THROTTLE_MS).sort()).toEqual([...CATEGORIES].sort());
  });

  it('stays short enough to be a de-duplicator rather than a mute', () => {
    for (const category of CATEGORIES) {
      const gap = THROTTLE_MS[category];
      expect(gap).toBeGreaterThan(0);
      /*
       * A quarter second is the line between "two clicks in a row made one sound" and "the game
       * ignored my click". Combat is the number that would tempt someone upward — a busy ×4
       * scene *sounds* like too much — and raising it there drops the crit, not the chatter.
       */
      expect(gap).toBeLessThanOrEqual(250);
    }
  });
});
