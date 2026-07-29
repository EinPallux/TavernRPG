import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { CLASSES } from '@/data/classes';
import { generateItem, itemBudget, itemValue } from './generate';
import {
  LINES_BY_RARITY,
  RARITIES,
  SLOT_IDS,
  isArmourSlot,
  type ClassId,
  type Rarity,
  type SlotId,
} from './types';

const stream = (name: string) => createRng(4242, name);

function generate(overrides: Partial<Parameters<typeof generateItem>[0]> = {}) {
  return generateItem({
    level: 20,
    slot: 'chest',
    rarity: 'rare',
    classId: 'warrior',
    rng: stream('test'),
    ...overrides,
  });
}

describe('generateItem — determinism', () => {
  it('produces the same item from the same seed', () => {
    const a = generateItem({
      level: 12,
      slot: 'weapon',
      rarity: 'epic',
      classId: 'mage',
      rng: createRng(777, 's'),
    });
    const b = generateItem({
      level: 12,
      slot: 'weapon',
      rarity: 'epic',
      classId: 'mage',
      rng: createRng(777, 's'),
    });
    expect(a).toEqual(b);
  });

  it('produces different items from different seeds', () => {
    const a = generateItem({
      level: 12,
      slot: 'weapon',
      rarity: 'epic',
      classId: 'mage',
      rng: createRng(1, 's'),
    });
    const b = generateItem({
      level: 12,
      slot: 'weapon',
      rarity: 'epic',
      classId: 'mage',
      rng: createRng(2, 's'),
    });
    expect(a.uid).not.toBe(b.uid);
  });
});

describe('generateItem — class restriction (items spec §5)', () => {
  it('locks weapons and offhands to the generating class', () => {
    for (const definition of CLASSES) {
      for (const slot of ['weapon', 'offhand'] as SlotId[]) {
        const item = generate({ slot, classId: definition.id, rng: stream(`${definition.id}`) });
        expect(item.classLock).toBe(definition.id);
      }
    }
  });

  it('never locks general armour or jewellery, so any class can wear it', () => {
    const unrestricted = SLOT_IDS.filter((slot) => slot !== 'weapon' && slot !== 'offhand');
    for (const slot of unrestricted) {
      const item = generate({ slot, rng: stream(slot) });
      expect(item.classLock).toBeUndefined();
    }
  });

  it('only ever draws weapon bases belonging to the class', () => {
    // 200 rolls per class: a leak from another class's pool would show up fast.
    for (const definition of CLASSES) {
      for (let i = 0; i < 200; i += 1) {
        const item = generateItem({
          level: 10,
          slot: 'weapon',
          rarity: 'rare',
          classId: definition.id,
          rng: createRng(i, `w-${definition.id}`),
        });
        expect(item.classLock).toBe(definition.id);
      }
    }
  });
});

describe('generateItem — budgets match the balancing doc', () => {
  it('spends exactly the slot/rarity budget across its attribute lines', () => {
    for (const rarity of RARITIES) {
      for (const slot of SLOT_IDS) {
        for (const level of [1, 15, 60, 140]) {
          const item = generateItem({
            level,
            slot,
            rarity,
            classId: 'hunter',
            rng: createRng(level * 31 + slot.length, `${rarity}-${slot}`),
          });
          const spent = Object.values(item.attrs).reduce((sum, value) => sum + (value ?? 0), 0);
          expect(spent).toBe(itemBudget(level, rarity, slot));
        }
      }
    }
  });

  it('gives each rarity the documented number of attribute lines', () => {
    for (const rarity of RARITIES) {
      const item = generate({ rarity, rng: stream(rarity) });
      expect(Object.keys(item.attrs)).toHaveLength(LINES_BY_RARITY[rarity]);
    }
  });

  it('scales budget with level and rarity, monotonically', () => {
    const low = itemBudget(10, 'rare', 'chest');
    const high = itemBudget(40, 'rare', 'chest');
    expect(high).toBeGreaterThan(low);

    let previous = 0;
    for (const rarity of RARITIES) {
      const budget = itemBudget(30, rarity, 'chest');
      expect(budget).toBeGreaterThanOrEqual(previous);
      previous = budget;
    }
  });

  it('honours the preferred attribute as the dominant line', () => {
    const item = generate({ rarity: 'epic', preferredAttribute: 'lck', rng: stream('pref') });
    const entries = Object.entries(item.attrs);
    const luck = item.attrs.lck ?? 0;
    expect(luck).toBeGreaterThan(0);
    // Dominant means largest — the split gives the first line the biggest share.
    for (const [, value] of entries) expect(luck).toBeGreaterThanOrEqual(value ?? 0);
  });
});

describe('generateItem — slot-specific properties', () => {
  it('gives weapons a damage band and nothing else a weapon', () => {
    const weapon = generate({ slot: 'weapon', rng: stream('wpn') });
    expect(weapon.weapon).toBeDefined();
    expect(weapon.weapon!.max).toBeGreaterThan(weapon.weapon!.min);

    const ring = generate({ slot: 'ring', rng: stream('ring') });
    expect(ring.weapon).toBeUndefined();
  });

  it('gives mages a far wider damage spread than other classes', () => {
    const mage = generateItem({
      level: 30,
      slot: 'weapon',
      rarity: 'rare',
      classId: 'mage',
      rng: stream('m'),
    });
    const warrior = generateItem({
      level: 30,
      slot: 'weapon',
      rarity: 'rare',
      classId: 'warrior',
      rng: stream('w'),
    });

    const spread = (item: typeof mage) =>
      (item.weapon!.max - item.weapon!.min) / ((item.weapon!.max + item.weapon!.min) / 2);
    expect(spread(mage)).toBeGreaterThan(spread(warrior) * 1.8);
  });

  it('gives armour slots an armour rating', () => {
    for (const slot of SLOT_IDS.filter(isArmourSlot)) {
      const item = generate({ slot, rng: stream(slot) });
      expect(item.armour).toBeGreaterThan(0);
    }
    expect(generate({ slot: 'ring', rng: stream('r') }).armour).toBeUndefined();
  });

  it('scales value with level and rarity', () => {
    expect(itemValue(50, 'epic')).toBeGreaterThan(itemValue(50, 'common'));
    expect(itemValue(80, 'rare')).toBeGreaterThan(itemValue(20, 'rare'));
  });

  it('always yields something worth scrapping', () => {
    for (const rarity of RARITIES) {
      const item = generate({ rarity, rng: stream(`scrap-${rarity}`) });
      const { scrap, essence, starmetal } = item.scrapYield;
      expect(scrap + essence + starmetal).toBeGreaterThan(0);
    }
  });
});

describe('generateItem — presentation', () => {
  it('names items and keeps commons plain', () => {
    const common = generate({ rarity: 'common', rng: stream('c') });
    const epic = generate({ rarity: 'epic', rng: stream('e') });

    expect(common.name.length).toBeGreaterThan(3);
    expect(common.name).not.toMatch(/ of /);
    expect(epic.name).toMatch(/ of /);
  });

  it('starts unlocked and carries an icon and base id', () => {
    const item = generate({ rng: stream('meta') });
    expect(item.locked).toBe(false);
    expect(item.iconId).toBeTruthy();
    expect(item.baseId).toBeTruthy();
  });

  it('is generated at, and remembers, the level it was made for', () => {
    const item = generate({ level: 44, rng: stream('lvl') });
    expect(item.level).toBe(44);
  });
});

describe('generateItem — edge cases', () => {
  it('never produces a zero or negative attribute line', () => {
    for (const rarity of RARITIES) {
      for (let i = 0; i < 50; i += 1) {
        const item = generateItem({
          level: 1,
          slot: 'ring',
          rarity,
          classId: 'bard' as ClassId,
          rng: createRng(i, `edge-${rarity}`),
        });
        for (const value of Object.values(item.attrs)) expect(value).toBeGreaterThan(0);
      }
    }
  });

  it('clamps absurd levels to something sane', () => {
    const item = generate({ level: 0, rng: stream('zero') });
    expect(item.level).toBe(1);
    expect(item.value).toBeGreaterThan(0);
  });

  it('handles every rarity at every slot without throwing', () => {
    for (const slot of SLOT_IDS) {
      for (const rarity of RARITIES as readonly Rarity[]) {
        expect(() => generate({ slot, rarity, rng: stream(`${slot}${rarity}`) })).not.toThrow();
      }
    }
  });
});
