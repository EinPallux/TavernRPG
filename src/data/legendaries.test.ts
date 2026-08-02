import { describe, expect, it } from 'vitest';

import {
  AFFIXES_BY_ID,
  LEGENDARIES,
  LEGENDARY_AFFIXES,
  LEGENDARY_AFFIX_COUNT,
  affixLine,
  formatMagnitude,
  legendariesFor,
  magnitudeSteps,
} from './legendaries';
import { CLASS_IDS, SLOT_IDS, CLASS_LOCKED_SLOTS, type SlotId } from '@/engine/items/types';
import { ICON_IDS } from './icons';

describe('the affix pool', () => {
  it('gives every affix a unique id', () => {
    const ids = LEGENDARY_AFFIXES.map((affix) => affix.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rolls inside a band that is a real range on a real grain', () => {
    for (const affix of LEGENDARY_AFFIXES) {
      const { min, max, step } = affix.band;
      expect(max, affix.id).toBeGreaterThan(min);
      expect(step, affix.id).toBeGreaterThan(0);
      // The band has to be a whole number of steps wide, or the top of it is unreachable.
      const steps = (max - min) / step;
      expect(Math.abs(steps - Math.round(steps)), affix.id).toBeLessThan(1e-9);
      expect(magnitudeSteps(affix.band), affix.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('builds a valid lever at both ends of every band', () => {
    for (const affix of LEGENDARY_AFFIXES) {
      for (const magnitude of [affix.band.min, affix.band.max]) {
        const effect = affix.effect(magnitude);
        expect(typeof effect.kind, affix.id).toBe('string');
        // Every lever in the pool carries a magnitude somewhere — an affix that folds to a
        // constant is a card line with nothing behind it.
        const numbers = Object.entries(effect)
          .filter(([key]) => key !== 'kind')
          .map(([, value]) => value);
        expect(numbers.length, affix.id).toBeGreaterThan(0);
        expect(numbers, affix.id).toContain(magnitude);
      }
    }
  });

  it('writes a line with the magnitude actually in it', () => {
    for (const affix of LEGENDARY_AFFIXES) {
      const line = affixLine(affix.id, affix.band.max);
      expect(line, affix.id).not.toBe('');
      expect(line, affix.id).not.toContain('{v}');
      expect(line, affix.id).toContain(formatMagnitude(affix.unit, affix.band.max));
    }
  });

  it('says nothing at all for an affix that does not exist', () => {
    expect(affixLine('no-such-affix', 1)).toBe('');
  });

  /**
   * Bard's verse levers are the one part of the `SetEffect` vocabulary that means nothing to four
   * classes in five, and a legendary that rolls dead weight on a Mage is a bad roll the player
   * cannot read as one. Asserted rather than left to the comment in the data file.
   */
  it('never rolls a lever that only one class can use', () => {
    for (const affix of LEGENDARY_AFFIXES) {
      expect(affix.effect(affix.band.min).kind, affix.id).not.toMatch(/^verse-|^discord$|^choose-/);
    }
  });
});

describe('the named arms', () => {
  it('gives every legendary a unique id and a real icon', () => {
    const ids = LEGENDARIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of LEGENDARIES) {
      expect(ICON_IDS, entry.id).toContain(entry.iconId);
      expect(SLOT_IDS, entry.id).toContain(entry.slot);
      expect(entry.flavor.length, entry.id).toBeGreaterThan(12);
    }
  });

  it('class-locks exactly the slots the items spec class-locks', () => {
    for (const entry of LEGENDARIES) {
      const locked = (CLASS_LOCKED_SLOTS as readonly SlotId[]).includes(entry.slot);
      expect(entry.classId !== undefined, `${entry.id} (${entry.slot})`).toBe(locked);
    }
  });

  /**
   * A census, not a count. `toBe(18)` fails the day the pool grows and teaches whoever hits it to
   * edit the number; this fails when a *slot* or a *class* has nothing in it, which is the thing
   * the test was written for.
   */
  it('leaves no slot and no class without one', () => {
    for (const slot of SLOT_IDS) {
      const forSlot = LEGENDARIES.filter((entry) => entry.slot === slot);
      expect(forSlot.length, slot).toBeGreaterThan(0);
      if ((CLASS_LOCKED_SLOTS as readonly SlotId[]).includes(slot)) {
        for (const classId of CLASS_IDS) {
          expect(
            forSlot.some((entry) => entry.classId === classId),
            `${slot} for ${classId}`,
          ).toBe(true);
        }
      }
    }
  });

  it('draws from a pool wide enough for a reforge to go somewhere', () => {
    for (const entry of LEGENDARIES) {
      // Two affixes out of a pool of two is a magnitude re-roll wearing a costume.
      expect(entry.affixPool.length, entry.id).toBeGreaterThanOrEqual(LEGENDARY_AFFIX_COUNT + 2);
      expect(new Set(entry.affixPool).size, entry.id).toBe(entry.affixPool.length);
      for (const affixId of entry.affixPool) {
        expect(AFFIXES_BY_ID[affixId], `${entry.id} → ${affixId}`).toBeDefined();
      }
    }
  });

  it('carries a statline shape with weight in it', () => {
    for (const entry of LEGENDARIES) {
      const total = Object.values(entry.weights).reduce((sum, weight) => sum + weight, 0);
      expect(total, entry.id).toBeGreaterThan(0);
    }
  });

  it('offers every class every unrestricted slot, and no other class’s arms', () => {
    for (const classId of CLASS_IDS) {
      const mine = legendariesFor(classId);
      expect(
        mine.every((e) => e.classId === undefined || e.classId === classId),
        classId,
      ).toBe(true);
      for (const slot of SLOT_IDS) {
        expect(
          mine.some((entry) => entry.slot === slot),
          `${classId} has nothing for ${slot}`,
        ).toBe(true);
      }
    }
  });
});
