import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNewSave, type Hero, type SaveFile } from '@/engine/save/schema';
import { createHero } from '@/engine/hero/actions';
import {
  deleteSave,
  exportSave,
  importSave,
  listSlots,
  readSave,
  resetPersistenceForTests,
  writeSave,
} from './persistence';

const NOW = new Date(2026, 6, 29, 12, 0, 0).getTime();

function freshSave(overrides: Partial<SaveFile> = {}): SaveFile {
  return { ...createNewSave({ slot: 1, worldSeed: 1234, now: NOW }), ...overrides };
}

function heroNamed(name: string): Hero {
  return createHero({ name, classId: 'warrior', now: NOW });
}

/** Write directly to the store, bypassing validation, to simulate corruption on disk. */
async function corruptMainSlot(value: unknown): Promise<void> {
  const { openDB } = await import('idb');
  const db = await openDB('tavernrpg', 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('saves')) database.createObjectStore('saves');
    },
  });
  await db.put('saves', value, 'slot-1');
  db.close();
}

beforeEach(() => {
  // Every test starts against an empty database.
  globalThis.indexedDB = new IDBFactory();
  resetPersistenceForTests();
});

describe('persistence — round trip', () => {
  it('returns "empty" for an untouched slot', async () => {
    expect((await readSave(1)).status).toBe('empty');
  });

  it('writes a save and reads back exactly what was written', async () => {
    const save = freshSave();
    await writeSave(save);

    const result = await readSave(1);
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.save).toEqual(save);
    expect(result.recoveredFromBackup).toBe(false);
    expect(result.migratedFrom).toBeNull();
  });

  it('keeps slots independent', async () => {
    await writeSave(freshSave({ slot: 1, worldSeed: 111 }));
    await writeSave(freshSave({ slot: 2, worldSeed: 222 }));

    const first = await readSave(1);
    const second = await readSave(2);
    expect(first.status === 'loaded' && first.save.worldSeed).toBe(111);
    expect(second.status === 'loaded' && second.save.worldSeed).toBe(222);
    expect((await readSave(3)).status).toBe('empty');
  });

  it('overwrites a slot on the next write', async () => {
    await writeSave(freshSave({ hero: heroNamed('Brenna') }));
    await writeSave(freshSave({ hero: heroNamed('Kargath') }));

    const result = await readSave(1);
    expect(result.status === 'loaded' && result.save.hero?.name).toBe('Kargath');
  });

  it('refuses to write an invalid save rather than poisoning the slot', async () => {
    const invalid = { ...freshSave(), worldSeed: -5 } as SaveFile;
    await expect(writeSave(invalid)).rejects.toThrow(/invalid save/i);
    expect((await readSave(1)).status).toBe('empty');
  });

  it('deletes a slot including its backup', async () => {
    await writeSave(freshSave());
    await writeSave(freshSave({ savedAt: NOW + 1000 }));
    await deleteSave(1);
    expect((await readSave(1)).status).toBe('empty');
  });
});

describe('persistence — corruption recovery', () => {
  it('falls back to the backup when the main copy is damaged', async () => {
    await writeSave(freshSave({ hero: heroNamed('Brenna') }));
    // Second write rotates the good save into the backup key.
    await writeSave(freshSave({ hero: heroNamed('Kargath') }));

    await corruptMainSlot({ schemaVersion: 3, garbage: true });

    const result = await readSave(1);
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.recoveredFromBackup).toBe(true);
    expect(result.save.hero?.name).toBe('Brenna');
  });

  it('reports a human-readable failure when both copies are unusable', async () => {
    await corruptMainSlot({ schemaVersion: 3, garbage: true });

    const result = await readSave(1);
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.message).toMatch(/damaged/i);
  });

  it('does not mistake a future-version save for corruption', async () => {
    await corruptMainSlot({ ...freshSave(), schemaVersion: 99 });

    const result = await readSave(1);
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.failure.kind).toBe('from_future');
    expect(result.message).toMatch(/newer version/i);
  });
});

describe('persistence — slots, export and import', () => {
  it('summarises which slots are occupied', async () => {
    await writeSave(freshSave({ slot: 2 }));
    const slots = await listSlots();
    expect(slots.map((s) => s.occupied)).toEqual([false, true, false]);
    expect(slots[1]?.savedAt).toBe(NOW);
  });

  it('exports a save as readable text and imports it back', async () => {
    await writeSave(freshSave({ hero: heroNamed('Serathiel') }));

    const exported = await exportSave(1);
    expect(exported).toBeTypeOf('string');

    const imported = await importSave(exported!, 3);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.save.slot).toBe(3);
    expect(imported.save.hero?.name).toBe('Serathiel');

    const reread = await readSave(3);
    expect(reread.status === 'loaded' && reread.save.hero?.name).toBe('Serathiel');
  });

  it('exports nothing for an empty slot', async () => {
    expect(await exportSave(2)).toBeNull();
  });

  it('rejects unreadable import text without throwing', async () => {
    const result = await importSave('not json at all', 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/readable/i);
    expect((await readSave(1)).status).toBe('empty');
  });

  it('rejects a well-formed file that is not a save', async () => {
    const result = await importSave(JSON.stringify({ hello: 'world' }), 1);
    expect(result.ok).toBe(false);
  });
});
