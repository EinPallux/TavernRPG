// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { readSave, resetPersistenceForTests } from './persistence';
import { resetGameStoreForTests, useGameStore } from './gameStore';

const store = () => useGameStore.getState();

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetPersistenceForTests();
  resetGameStoreForTests();
});

describe('gameStore — lifecycle', () => {
  it('creates and persists a world on first run', async () => {
    await store().hydrate(1);

    expect(store().status).toBe('ready');
    expect(store().save?.skeleton.doorKnocks).toBe(0);
    expect(store().isSaving).toBe(false);

    // The new world is on disk immediately, not just in memory.
    const persisted = await readSave(1);
    expect(persisted.status).toBe('loaded');
  });

  it('rolls a different world seed for each new world', async () => {
    await store().hydrate(1);
    const first = store().save?.worldSeed;

    await store().startOver();
    expect(store().save?.worldSeed).not.toBe(first);
  });

  it('rehydrates an existing world instead of replacing it', async () => {
    await store().hydrate(1);
    const seed = store().save!.worldSeed;
    store().knock();
    store().knock();
    await store().flush();

    resetGameStoreForTests();
    await store().hydrate(1);

    expect(store().save?.worldSeed).toBe(seed);
    expect(store().save?.skeleton.doorKnocks).toBe(2);
  });

  it('keeps knocks in memory until a save is flushed', async () => {
    await store().hydrate(1);
    store().knock();

    // Autosave is debounced, so disk still shows the pre-knock state.
    const beforeFlush = await readSave(1);
    expect(beforeFlush.status === 'loaded' && beforeFlush.save.skeleton.doorKnocks).toBe(0);

    await store().flush();

    const afterFlush = await readSave(1);
    expect(afterFlush.status === 'loaded' && afterFlush.save.skeleton.doorKnocks).toBe(1);
  });

  it('stamps the knock time and advances savedAt', async () => {
    await store().hydrate(1);
    expect(store().save?.skeleton.lastKnockAt).toBeNull();

    store().knock();
    await store().flush();

    expect(store().save?.skeleton.lastKnockAt).toBeTypeOf('number');
    expect(store().save!.savedAt).toBeGreaterThanOrEqual(store().save!.skeleton.createdAt);
  });

  it('startOver wipes progress but keeps the slot', async () => {
    await store().hydrate(1);
    store().knock();
    await store().flush();

    await store().startOver();

    expect(store().save?.skeleton.doorKnocks).toBe(0);
    expect(store().save?.slot).toBe(1);
    const persisted = await readSave(1);
    expect(persisted.status === 'loaded' && persisted.save.skeleton.doorKnocks).toBe(0);
  });

  it('reports a damaged save in human language instead of crashing', async () => {
    const { openDB } = await import('idb');
    const db = await openDB('tavernrpg', 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('saves')) database.createObjectStore('saves');
      },
    });
    await db.put('saves', { schemaVersion: 1, nonsense: true }, 'slot-1');
    db.close();

    await store().hydrate(1);

    expect(store().status).toBe('failed');
    expect(store().error).toMatch(/damaged/i);
    expect(store().save).toBeNull();
  });

  it('ignores knocks before a world is loaded', () => {
    expect(() => store().knock()).not.toThrow();
    expect(store().save).toBeNull();
  });
});
