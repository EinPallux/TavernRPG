import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { generateItem } from '@/engine/items/generate';
import { CLASSES, classDef } from '@/data/classes';
import { SLOT_IDS, type ClassId, type Item, type SlotId } from '@/engine/items/types';
import { BACKPACK_SLOTS, SATCHEL_SLOTS } from '@/engine/save/schema';
import {
  addItem,
  canEquip,
  createHero,
  discardItem,
  equipItem,
  toggleLock,
  trainAttribute,
  unequipItem,
  validateHeroName,
} from './actions';
import { compareItem, deriveStats } from './derived';

const NOW = new Date(2026, 6, 29, 12, 0, 0).getTime();

const hero = (classId: ClassId = 'warrior') => createHero({ name: 'Kargath', classId, now: NOW });

function itemFor(slot: SlotId, classId: ClassId = 'warrior', seed = 1, level = 10): Item {
  return generateItem({
    level,
    slot,
    rarity: 'rare',
    classId,
    rng: createRng(seed, `test:${slot}`),
  });
}

describe('hero creation', () => {
  it('starts at level 1 with an empty kit and a small purse', () => {
    const created = hero();
    expect(created.level).toBe(1);
    expect(created.xp).toBe(0);
    expect(created.gold).toBeGreaterThan(0);
    expect(created.backpack).toHaveLength(BACKPACK_SLOTS);
    expect(created.backpack.every((slot) => slot === null)).toBe(true);
    expect(Object.keys(created.equipment)).toHaveLength(0);
    expect(created.trained).toEqual({ str: 0, dex: 0, int: 0, con: 0, lck: 0 });
  });

  it('trims the name', () => {
    expect(createHero({ name: '  Brenna  ', classId: 'bard', now: NOW }).name).toBe('Brenna');
  });
});

describe('name validation', () => {
  it('accepts ordinary fantasy names', () => {
    for (const name of ['Kargath', 'Brenna Thornsong', "Sela D'Vane", 'Mirri-Ashfoot']) {
      expect(validateHeroName(name).ok).toBe(true);
    }
  });

  it('rejects names that are too short or too long', () => {
    expect(validateHeroName('Al').ok).toBe(false);
    expect(validateHeroName('A'.repeat(17)).ok).toBe(false);
  });

  it('rejects digits, symbols and leading punctuation', () => {
    for (const name of ['Kargath99', 'x_x', '  ', '-Brenna', '<script>']) {
      expect(validateHeroName(name).ok).toBe(false);
    }
  });

  it('explains why, so the field can show a reason', () => {
    const result = validateHeroName('Al');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/at least/i);
  });
});

describe('equipping', () => {
  it('refuses another class’s weapon and says why', () => {
    const warrior = hero('warrior');
    const staff = itemFor('weapon', 'mage');

    const verdict = canEquip(warrior, staff);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/Mage/);

    expect(equipItem(warrior, staff)).toBe(warrior); // unchanged
  });

  it('lets any class wear general armour and jewellery', () => {
    const unrestricted = SLOT_IDS.filter((slot) => slot !== 'weapon' && slot !== 'offhand');
    for (const definition of CLASSES) {
      for (const slot of unrestricted) {
        const item = itemFor(slot, 'hunter');
        expect(canEquip(hero(definition.id), item).ok).toBe(true);
      }
    }
  });

  it('moves the replaced piece back into the bag slot the new one came from', () => {
    let subject = hero();
    const first = itemFor('chest', 'warrior', 1);
    const second = itemFor('chest', 'warrior', 2);

    subject = addItem(subject, first).hero;
    subject = equipItem(subject, first);
    subject = addItem(subject, second).hero;
    const index = subject.backpack.findIndex((entry) => entry?.uid === second.uid);

    subject = equipItem(subject, second);

    expect(subject.equipment.chest?.uid).toBe(second.uid);
    expect(subject.backpack[index]?.uid).toBe(first.uid);
  });

  it('unequips into the backpack', () => {
    let subject = hero();
    const helm = itemFor('helmet');
    subject = equipItem(addItem(subject, helm).hero, helm);
    subject = unequipItem(subject, 'helmet');

    expect(subject.equipment.helmet).toBeUndefined();
    expect(subject.backpack.filter(Boolean)).toHaveLength(1);
  });

  it('refuses to unequip when there is nowhere to put the piece', () => {
    let subject = hero();
    const helm = itemFor('helmet');
    subject = equipItem(subject, helm);

    // Fill every bag slot.
    for (let i = 0; i < BACKPACK_SLOTS + SATCHEL_SLOTS; i += 1) {
      subject = addItem(subject, itemFor('ring', 'warrior', 100 + i)).hero;
    }

    const before = subject;
    expect(unequipItem(subject, 'helmet')).toBe(before);
    expect(subject.equipment.helmet?.uid).toBe(helm.uid);
  });

  it('is a no-op for an empty slot', () => {
    const subject = hero();
    expect(unequipItem(subject, 'weapon')).toBe(subject);
  });
});

describe('bags and overflow', () => {
  it('fills the backpack first, in order', () => {
    let subject = hero();
    subject = addItem(subject, itemFor('ring', 'warrior', 1)).hero;
    subject = addItem(subject, itemFor('ring', 'warrior', 2)).hero;

    expect(subject.backpack[0]).not.toBeNull();
    expect(subject.backpack[1]).not.toBeNull();
    expect(subject.backpack[2]).toBeNull();
  });

  it('overflows into the satchel when the backpack is full', () => {
    let subject = hero();
    for (let i = 0; i < BACKPACK_SLOTS; i += 1) {
      subject = addItem(subject, itemFor('ring', 'warrior', i)).hero;
    }

    const result = addItem(subject, itemFor('ring', 'warrior', 999));
    expect(result.placement).toBe('satchel');
    expect(result.hero.satchel).toHaveLength(1);
  });

  it('pushes out the oldest unlocked item when everything is full', () => {
    let subject = hero();
    for (let i = 0; i < BACKPACK_SLOTS + SATCHEL_SLOTS; i += 1) {
      subject = addItem(subject, itemFor('ring', 'warrior', i)).hero;
    }
    const oldest = subject.satchel[0]!;

    const result = addItem(subject, itemFor('ring', 'warrior', 5000));
    expect(result.discarded?.uid).toBe(oldest.uid);
    expect(result.hero.satchel).toHaveLength(SATCHEL_SLOTS);
  });

  it('never destroys a locked item to make room — it refuses the new one instead', () => {
    let subject = hero();
    for (let i = 0; i < BACKPACK_SLOTS + SATCHEL_SLOTS; i += 1) {
      subject = addItem(subject, itemFor('ring', 'warrior', i)).hero;
    }
    for (const entry of subject.satchel) subject = toggleLock(subject, entry.uid);

    const incoming = itemFor('ring', 'warrior', 6000);
    const result = addItem(subject, incoming);

    expect(result.placement).toBe('discarded');
    expect(result.discarded?.uid).toBe(incoming.uid);
    expect(result.hero.satchel.every((entry) => entry.locked)).toBe(true);
  });

  it('protects locked items from being discarded', () => {
    let subject = hero();
    const ring = itemFor('ring');
    subject = addItem(subject, ring).hero;
    subject = toggleLock(subject, ring.uid);

    expect(discardItem(subject, ring.uid)).toBe(subject);

    subject = toggleLock(subject, ring.uid);
    expect(discardItem(subject, ring.uid).backpack.filter(Boolean)).toHaveLength(0);
  });
});

describe('training', () => {
  it('buys what the purse covers and charges exactly that', () => {
    const subject = { ...hero(), gold: 1000 };
    const result = trainAttribute(subject, 'str', 10);

    expect(result.pointsBought).toBe(10);
    expect(result.hero.trained.str).toBe(10);
    expect(result.hero.gold).toBe(1000 - result.goldSpent);
  });

  it('buys as many as it can rather than failing outright', () => {
    const subject = { ...hero(), gold: 20 };
    const result = trainAttribute(subject, 'con', 500);

    expect(result.pointsBought).toBeGreaterThan(0);
    expect(result.pointsBought).toBeLessThan(500);
    expect(result.hero.gold).toBeGreaterThanOrEqual(0);
  });

  it('does nothing when nothing is affordable', () => {
    const subject = { ...hero(), gold: 0 };
    const result = trainAttribute(subject, 'lck', 5);

    expect(result.pointsBought).toBe(0);
    expect(result.hero).toBe(subject);
  });

  it('leaves other attributes untouched', () => {
    const result = trainAttribute({ ...hero(), gold: 5000 }, 'int', 4);
    expect(result.hero.trained).toMatchObject({ str: 0, dex: 0, con: 0, lck: 0, int: 4 });
  });
});

describe('derived stats', () => {
  it('computes health from constitution, level and the class factor', () => {
    const warrior = hero('warrior');
    const derived = deriveStats({
      classId: 'warrior',
      level: warrior.level,
      trained: warrior.trained,
      equipment: {},
    });

    const expected = Math.round(
      classDef('warrior').startingStats.con * (warrior.level + 1) * classDef('warrior').hpFactor,
    );
    expect(derived.health).toBe(expected);
  });

  it('gives the tankiest class more health than the squishiest at equal constitution', () => {
    const shared = {
      level: 20,
      trained: { str: 0, dex: 0, int: 0, con: 50, lck: 0 },
      equipment: {},
    };
    const warrior = deriveStats({ ...shared, classId: 'warrior' });
    const mage = deriveStats({ ...shared, classId: 'mage' });
    expect(warrior.health).toBeGreaterThan(mage.health * 1.9);
  });

  it('adds gear attributes on top of class and trained points', () => {
    const chest = itemFor('chest');
    const base = deriveStats({
      classId: 'warrior',
      level: 5,
      trained: hero().trained,
      equipment: {},
    });
    const geared = deriveStats({
      classId: 'warrior',
      level: 5,
      trained: hero().trained,
      equipment: { chest },
    });

    const gearTotal = Object.values(chest.attrs).reduce((sum, value) => sum + (value ?? 0), 0);
    const baseTotal = Object.values(base.attributes).reduce((sum, value) => sum + value, 0);
    const gearedTotal = Object.values(geared.attributes).reduce((sum, value) => sum + value, 0);
    expect(gearedTotal - baseTotal).toBe(gearTotal);
  });

  it('caps damage reduction at the class limit however much armour is worn', () => {
    const derived = deriveStats({
      classId: 'mage',
      level: 5,
      trained: hero().trained,
      // Absurd armour: the cap must still hold.
      equipment: { chest: { ...itemFor('chest'), armour: 999_999 } },
    });
    expect(derived.damageReduction).toBeCloseTo(classDef('mage').drCap, 5);
  });

  it('caps crit chance at 50%', () => {
    const derived = deriveStats({
      classId: 'swashbuckler',
      level: 1,
      trained: { str: 0, dex: 0, int: 0, con: 0, lck: 10_000 },
      equipment: {},
    });
    expect(derived.critChance).toBe(0.5);
  });

  it('still reports a damage range with no weapon equipped', () => {
    const derived = deriveStats({
      classId: 'hunter',
      level: 3,
      trained: hero().trained,
      equipment: {},
    });
    expect(derived.damage.max).toBeGreaterThan(0);
  });
});

describe('item comparison (the tooltip that drives every loot decision)', () => {
  it('reports gains against an empty slot for every slot', () => {
    const subject = hero();
    for (const slot of SLOT_IDS) {
      const item = itemFor(slot, 'warrior', 7);
      const delta = compareItem(
        { classId: subject.classId, level: subject.level, trained: subject.trained, equipment: {} },
        item,
      );

      expect(delta.slotWasEmpty).toBe(true);
      const attributeGain = Object.values(delta.attributes).reduce((sum, v) => sum + v, 0);
      expect(attributeGain).toBeGreaterThan(0);
    }
  });

  it('reports a loss when the candidate is worse than what is worn', () => {
    const strong = itemFor('chest', 'warrior', 1, 40);
    const weak = itemFor('chest', 'warrior', 2, 5);
    const subject = hero();

    const delta = compareItem(
      {
        classId: subject.classId,
        level: 20,
        trained: subject.trained,
        equipment: { chest: strong },
      },
      weak,
    );

    expect(delta.slotWasEmpty).toBe(false);
    expect(delta.armour).toBeLessThan(0);
  });

  it('reflects a weapon swap in damage, not just attributes', () => {
    const subject = hero();
    const weapon = itemFor('weapon', 'warrior', 3, 30);
    const delta = compareItem(
      { classId: subject.classId, level: 10, trained: subject.trained, equipment: {} },
      weapon,
    );
    expect(delta.damageAverage).toBeGreaterThan(0);
  });

  it('does not mutate the hero’s equipment while comparing', () => {
    const equipment = {};
    compareItem(
      { classId: 'warrior', level: 5, trained: hero().trained, equipment },
      itemFor('chest'),
    );
    expect(Object.keys(equipment)).toHaveLength(0);
  });
});
