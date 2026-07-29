// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { generateItem } from '@/engine/items/generate';
import { readSave, resetPersistenceForTests } from './persistence';
import { resetGameStoreForTests, useGameStore } from './gameStore';

const store = () => useGameStore.getState();

const swordFor = (classId: 'warrior' | 'mage' = 'warrior', level = 5) =>
  generateItem({
    level,
    slot: 'weapon',
    rarity: 'rare',
    classId,
    rng: createRng(99, 'test:item'),
  });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetPersistenceForTests();
  resetGameStoreForTests();
});

describe('gameStore — world lifecycle', () => {
  it('creates a world with no hero, which is what opens creation', async () => {
    await store().hydrate(1);

    expect(store().status).toBe('ready');
    expect(store().save?.hero).toBeNull();
  });

  it('rolls a different world seed for each new world', async () => {
    await store().hydrate(1);
    const first = store().save?.worldSeed;

    await store().startOver();
    expect(store().save?.worldSeed).not.toBe(first);
  });
});

describe('gameStore — hero creation', () => {
  it('creates a hero and persists it immediately', async () => {
    await store().hydrate(1);
    await store().createHero('Brenna Thornsong', 'hunter');

    expect(store().save?.hero?.name).toBe('Brenna Thornsong');
    expect(store().save?.hero?.classId).toBe('hunter');
    expect(store().save?.hero?.level).toBe(1);

    // On disk without waiting for the debounce — a lost new hero would be unforgivable.
    const persisted = await readSave(1);
    expect(persisted.status === 'loaded' && persisted.save.hero?.name).toBe('Brenna Thornsong');
  });

  it('rehydrates the hero after a reload', async () => {
    await store().hydrate(1);
    await store().createHero('Kargath', 'warrior');
    store().trainAttribute('str', 3);
    await store().flush();

    resetGameStoreForTests();
    await store().hydrate(1);

    expect(store().save?.hero?.name).toBe('Kargath');
    expect(store().save?.hero?.trained.str).toBe(3);
  });
});

describe('gameStore — hero actions', () => {
  beforeEach(async () => {
    await store().hydrate(1);
    await store().createHero('Kargath', 'warrior');
  });

  it('grants an item into the backpack', () => {
    const sword = swordFor();
    store().grantItem(sword);

    expect(store().save?.hero?.backpack.filter(Boolean)).toHaveLength(1);
    expect(store().save?.hero?.backpack[0]?.uid).toBe(sword.uid);
  });

  it('equips from the backpack and frees the slot it came from', () => {
    const sword = swordFor();
    store().grantItem(sword);
    store().equipItem(sword);

    expect(store().save?.hero?.equipment.weapon?.uid).toBe(sword.uid);
    expect(store().save?.hero?.backpack.filter(Boolean)).toHaveLength(0);
  });

  it('refuses to equip another class’s weapon', () => {
    const staff = swordFor('mage');
    store().grantItem(staff);
    store().equipItem(staff);

    expect(store().save?.hero?.equipment.weapon).toBeUndefined();
    // The item stays in the bag rather than vanishing.
    expect(store().save?.hero?.backpack.filter(Boolean)).toHaveLength(1);
  });

  it('unequips back into the backpack', () => {
    const sword = swordFor();
    store().grantItem(sword);
    store().equipItem(sword);
    store().unequipItem('weapon');

    expect(store().save?.hero?.equipment.weapon).toBeUndefined();
    expect(store().save?.hero?.backpack.filter(Boolean)).toHaveLength(1);
  });

  it('trains attributes and charges gold', () => {
    const before = store().save!.hero!.gold;
    store().trainAttribute('str', 5);

    const hero = store().save!.hero!;
    expect(hero.trained.str).toBe(5);
    expect(hero.gold).toBeLessThan(before);
  });

  it('buys only what the purse covers instead of failing outright', () => {
    // 100 starting gold buys far fewer than 500 points.
    store().trainAttribute('con', 500);

    const hero = store().save!.hero!;
    expect(hero.trained.con).toBeGreaterThan(0);
    expect(hero.gold).toBeGreaterThanOrEqual(0);
  });

  it('locks an item so it cannot be discarded', () => {
    const sword = swordFor();
    store().grantItem(sword);
    store().toggleItemLock(sword.uid);
    store().discardItem(sword.uid);

    expect(store().save?.hero?.backpack.filter(Boolean)).toHaveLength(1);

    store().toggleItemLock(sword.uid);
    store().discardItem(sword.uid);
    expect(store().save?.hero?.backpack.filter(Boolean)).toHaveLength(0);
  });

  it('ignores hero actions when no hero exists', async () => {
    await store().startOver();
    expect(store().save?.hero).toBeNull();

    expect(() => store().trainAttribute('str', 1)).not.toThrow();
    expect(() => store().equipItem(swordFor())).not.toThrow();
    expect(store().save?.hero).toBeNull();
  });
});
