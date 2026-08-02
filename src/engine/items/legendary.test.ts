import { describe, expect, it } from 'vitest';

import { createRng } from '@/engine/rng';
import {
  LEGENDARIES,
  LEGENDARY_AFFIX_COUNT,
  legendaryAffix,
  magnitudeSteps,
} from '@/data/legendaries';
import {
  canWear,
  equippedLegendaries,
  mintLegendary,
  reforge,
  rollAffixes,
  rollLegendary,
  rollMagnitude,
  rollSpaceOf,
} from './legendary';
import { equippedSetCounts, modifiersFor } from './sets';
import { generateSetPiece } from './generate';
import { CLASS_IDS, RARITY_FACTOR, type Item, type SlotId } from './types';

const SEED = 4242;
/**
 * `createRng(seed, name)` uses the name as a *label* and nothing else — the state comes from the
 * seed alone. Only `fork()` derives a new sequence. Written out because the first draft of this
 * file handed sixty reforges the identical stream and asserted, cheerfully, that they all matched.
 */
const rng = (label: string) => createRng(SEED).fork(label);

describe('rolling a legendary', () => {
  it('mints one for every class, at the level asked for', () => {
    for (const classId of CLASS_IDS) {
      const item = rollLegendary({ classId, level: 180, rng: rng(`mint:${classId}`) });
      expect(item, classId).not.toBeNull();
      expect(item!.rarity, classId).toBe('legendary');
      expect(item!.level, classId).toBe(180);
      expect(item!.legendary?.affixes.length, classId).toBe(LEGENDARY_AFFIX_COUNT);
      expect(item!.legendary?.reforges, classId).toBe(0);
    }
  });

  it('never hands a class another class’s arms', () => {
    for (const classId of CLASS_IDS) {
      for (let i = 0; i < 200; i += 1) {
        const item = rollLegendary({ classId, level: 150, rng: rng(`lock:${classId}:${i}`) });
        if (item?.classLock) expect(item.classLock, `${classId} got ${item.name}`).toBe(classId);
      }
    }
  });

  it('is deterministic — the same stream mints the same item', () => {
    const a = rollLegendary({ classId: 'mage', level: 170, rng: rng('same') });
    const b = rollLegendary({ classId: 'mage', level: 170, rng: rng('same') });
    expect(a).toEqual(b);
  });

  it('honours a named draw', () => {
    const item = rollLegendary({
      classId: 'warrior',
      level: 190,
      rng: rng('named'),
      defId: 'oathbreaker',
    });
    expect(item?.legendary?.defId).toBe('oathbreaker');
    expect(item?.name).toBe('Oathbreaker');
  });

  it('returns null rather than something wrong when the named draw cannot be worn', () => {
    // Oathbreaker is a Warrior blade; a Mage asking for it by name gets nothing.
    expect(
      rollLegendary({ classId: 'mage', level: 190, rng: rng('nope'), defId: 'oathbreaker' }),
    ).toBeNull();
  });

  /**
   * `avoidSlots` is a courtesy, not a rule. A hard exclusion means a fully-legendary paperdoll
   * produces *null* from the rarest drop in the game, which is far worse than a repeated slot.
   */
  it('prefers a slot you are not already wearing, and still pays out when every slot is taken', () => {
    const every = LEGENDARIES.map((entry) => entry.slot);
    const item = rollLegendary({
      classId: 'hunter',
      level: 200,
      rng: rng('avoid-all'),
      avoidSlots: every,
    });
    expect(item).not.toBeNull();

    const helmOnly = LEGENDARIES.filter((e) => e.slot !== 'helmet').map((e) => e.slot);
    for (let i = 0; i < 40; i += 1) {
      const avoided = rollLegendary({
        classId: 'hunter',
        level: 200,
        rng: rng(`avoid:${i}`),
        avoidSlots: helmOnly,
      });
      expect(avoided?.slot).toBe('helmet');
    }
  });

  it('carries a set piece’s budget and no more — the affixes are the tier', () => {
    expect(RARITY_FACTOR.legendary).toBe(RARITY_FACTOR.set);
  });

  it('never rolls the same lever twice on one item', () => {
    for (let i = 0; i < 300; i += 1) {
      const item = rollLegendary({ classId: 'bard', level: 160, rng: rng(`dupe:${i}`) });
      const kinds = (item?.legendary?.affixes ?? []).map((affix) => affix.effect.kind);
      expect(new Set(kinds).size, `roll ${i}`).toBe(kinds.length);
    }
  });

  it('rolls magnitudes on the band’s grain, inside the band, and reaches both ends', () => {
    for (const affix of LEGENDARY_AFFIXES_UNDER_TEST) {
      const seen = new Set<number>();
      for (let i = 0; i < 400; i += 1) seen.add(rollMagnitude(affix.id, rng(`${affix.id}:${i}`)));
      for (const value of seen) {
        expect(value, affix.id).toBeGreaterThanOrEqual(affix.band.min - 1e-9);
        expect(value, affix.id).toBeLessThanOrEqual(affix.band.max + 1e-9);
        const steps = (value - affix.band.min) / affix.band.step;
        expect(Math.abs(steps - Math.round(steps)), `${affix.id} @ ${value}`).toBeLessThan(1e-6);
      }
      // Every magnitude the band claims is reachable; a band whose top never comes up is a lie
      // on the reforge bench, which prints the size of the space.
      expect(seen.size, affix.id).toBe(magnitudeSteps(affix.band));
    }
  });

  it('says zero for a magnitude on an affix that does not exist', () => {
    expect(rollMagnitude('no-such-affix', rng('missing'))).toBe(0);
  });
});

const LEGENDARY_AFFIXES_UNDER_TEST = LEGENDARIES.flatMap((entry) => entry.affixPool)
  .filter((id, index, all) => all.indexOf(id) === index)
  .map((id) => legendaryAffix(id)!);

describe('the fold into CombatModifiers', () => {
  it('reaches the bag — every affix in the pool, at least once', () => {
    for (const affix of LEGENDARY_AFFIXES_UNDER_TEST) {
      const definition = LEGENDARIES.find((entry) => entry.affixPool.includes(affix.id))!;
      const item = mintLegendary(definition, 100, rng(`fold:${affix.id}`));
      // Force this specific affix on, so the assertion is about the lever rather than the draw.
      const forced: Item = {
        ...item,
        legendary: {
          ...item.legendary!,
          affixes: [{ id: affix.id, effect: affix.effect(affix.band.max) }],
        },
      };
      const bag = modifiersFor({ [forced.slot]: forced });
      const empty = modifiersFor({});
      expect(bag, affix.id).not.toEqual(empty);
    }
  });

  it('adds a legendary’s lever to a set’s rather than replacing it', () => {
    const heavy = LEGENDARIES.find((entry) => entry.affixPool.includes('heavy'))!;
    const item = mintLegendary(heavy, 100, rng('heavy'));
    const forced: Item = {
      ...item,
      legendary: {
        ...item.legendary!,
        affixes: [{ id: 'heavy', effect: { kind: 'damage', share: 0.09 } }],
      },
    };

    // A set slot the legendary is *not* in, or the second key overwrites the first and the test
    // measures an empty paperdoll — which is how the first draft of this read 0 against 0.09.
    const setSlot = (['helmet', 'chest', 'gloves', 'boots', 'belt'] as const).find(
      (slot) => slot !== forced.slot,
    )!;
    const piece = generateSetPiece({
      setId: 'oathsworn-bulwark',
      slot: setSlot,
      level: 100,
      rng: rng('set-piece'),
    });
    if (!piece) return;

    const alone = modifiersFor({ [forced.slot]: forced });
    const withSet = modifiersFor({ [forced.slot]: forced, [setSlot]: piece });
    expect(alone.damage).toBeCloseTo(0.09, 6);
    // One piece is below every threshold, so the sum is unchanged — what is asserted is that the
    // legendary's lever survives the presence of a set rather than being replaced by it.
    expect(withSet.damage).toBeGreaterThanOrEqual(alone.damage);
  });

  /**
   * The negative, asserted directly. It falls out of the `setId` check for free today, and it is
   * exactly the kind of thing a later refactor reverses in silence — which would quietly delete
   * the only build decision the game has.
   */
  it('never counts a legendary toward a set', () => {
    const piece = generateSetPiece({
      setId: 'oathsworn-bulwark',
      slot: 'helmet',
      level: 90,
      rng: rng('piece'),
    });
    if (!piece) return;

    // A legendary wearing a setId is the shape the refactor would produce.
    const impostor: Item = { ...piece, rarity: 'legendary' };
    expect(equippedSetCounts({ helmet: piece }).get(piece.setId!)).toBe(1);
    expect(equippedSetCounts({ helmet: impostor }).get(piece.setId!)).toBeUndefined();
  });

  it('finds every legendary the hero is wearing, and nothing else', () => {
    const item = rollLegendary({ classId: 'warrior', level: 120, rng: rng('worn') })!;
    // Again: a slot the legendary is not in. An equipment map is keyed by slot, so the second
    // write wins, and the first draft of this quietly measured an empty paperdoll.
    const setSlot = (['helmet', 'chest', 'gloves', 'boots', 'belt'] as const).find(
      (slot) => slot !== item.slot,
    )!;
    const plain = generateSetPiece({
      setId: 'oathsworn-bulwark',
      slot: setSlot,
      level: 90,
      rng: rng('plain'),
    });
    const equipment: Partial<Record<SlotId, Item>> = { [item.slot]: item };
    if (plain) equipment[setSlot] = plain;
    const worn = equippedLegendaries(equipment);
    expect(worn.map((entry) => entry.uid)).toEqual([item.uid]);
  });
});

describe('the reforge bench', () => {
  it('re-rolls the affixes and counts the strike', () => {
    const item = rollLegendary({ classId: 'swashbuckler', level: 175, rng: rng('before') })!;
    const after = reforge(item, rng('after'));
    expect(after).not.toBeNull();
    expect(after!.legendary!.reforges).toBe(1);
    expect(after!.uid).toBe(item.uid);
    expect(after!.legendary!.defId).toBe(item.legendary!.defId);
    expect(after!.legendary!.affixes.length).toBe(LEGENDARY_AFFIX_COUNT);
  });

  it('stays inside the item’s own pool, however many times it is struck', () => {
    let item = rollLegendary({ classId: 'mage', level: 175, rng: rng('pool') })!;
    const pool = LEGENDARIES.find((entry) => entry.id === item.legendary!.defId)!.affixPool;
    for (let i = 0; i < 50; i += 1) {
      item = reforge(item, rng(`strike:${i}`))!;
      for (const affix of item.legendary!.affixes) expect(pool, `strike ${i}`).toContain(affix.id);
    }
    expect(item.legendary!.reforges).toBe(50);
  });

  it('actually changes something — a bench that always returns the same roll is a coin sink', () => {
    const item = rollLegendary({ classId: 'hunter', level: 175, rng: rng('churn') })!;
    const seen = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const rolled = reforge(item, rng(`churn:${i}`))!;
      seen.add(JSON.stringify(rolled.legendary!.affixes));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('refuses anything that is not a legendary rather than silently doing nothing', () => {
    const piece = generateSetPiece({
      setId: 'oathsworn-bulwark',
      slot: 'belt',
      level: 60,
      rng: rng('belt'),
    });
    if (piece) expect(reforge(piece, rng('no'))).toBeNull();
  });

  it('publishes a roll space wide enough to be worth a re-roll', () => {
    for (const definition of LEGENDARIES) {
      expect(rollSpaceOf(definition), definition.id).toBeGreaterThan(100);
    }
  });
});

describe('who can wear what', () => {
  it('lets anybody wear the unrestricted eight and nobody wear another class’s arms', () => {
    for (const definition of LEGENDARIES) {
      const wearers = CLASS_IDS.filter((classId) => canWear(definition, classId));
      expect(wearers.length, definition.id).toBe(definition.classId ? 1 : CLASS_IDS.length);
    }
  });

  it('draws affixes without replacement even from the shortest pool', () => {
    const shortest = [...LEGENDARIES].sort((a, b) => a.affixPool.length - b.affixPool.length)[0]!;
    for (let i = 0; i < 100; i += 1) {
      const affixes = rollAffixes(shortest, rng(`short:${i}`));
      expect(new Set(affixes.map((a) => a.id)).size).toBe(affixes.length);
      expect(affixes.length).toBe(LEGENDARY_AFFIX_COUNT);
    }
  });
});
