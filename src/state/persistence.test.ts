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
  archiveSave,
  exportRaw,
  listArchives,
  readActiveSlot,
  resetPersistenceForTests,
  writeActiveSlot,
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

/**
 * The triage path — what happens after `readSave` says "failed".
 *
 * Everything above proves the *detection* is right. These prove the recovery is, and the property
 * they are really guarding is that **nothing on this path destroys anything**. A player whose save
 * will not open is the one player who cannot afford a mistake here.
 */
describe('persistence — triage', () => {
  it('hands back the bytes of a save that will not open', async () => {
    await corruptMainSlot({ schemaVersion: 3, garbage: true });
    expect((await readSave(1)).status).toBe('failed');

    const raw = await exportRaw(1, 1_700_000_000_000);
    expect(raw, 'a damaged save must still be exportable').not.toBeNull();

    const parsed = JSON.parse(raw!) as { exportedAt: number; main: Record<string, unknown> };
    expect(parsed.exportedAt).toBe(1_700_000_000_000);
    // Unrepaired and unmigrated: whatever went wrong has to reach the copy.
    expect(parsed.main.garbage).toBe(true);
    expect(parsed.main.schemaVersion).toBe(3);
  });

  it('exports the backup alongside the main copy', async () => {
    await writeSave(freshSave({ hero: heroNamed('Brenna') }));
    await writeSave(freshSave({ hero: heroNamed('Kargath') }));

    const parsed = JSON.parse((await exportRaw(1, 1))!) as {
      main: { hero: { name: string } };
      backup: { hero: { name: string } };
    };
    expect(parsed.main.hero.name).toBe('Kargath');
    expect(parsed.backup.hero.name).toBe('Brenna');
  });

  it('returns nothing for a slot that was never written', async () => {
    expect(await exportRaw(2, 1)).toBeNull();
  });

  it('sets a save aside instead of deleting it', async () => {
    await writeSave(freshSave({ hero: heroNamed('Sigrun') }));
    await archiveSave(1, '1700000000000');

    // The slot reads empty, so the game can start clean...
    expect((await readSave(1)).status).toBe('empty');
    // ...but the hero is still on disk under a dated key.
    const archives = await listArchives(1);
    expect(archives).toHaveLength(1);
    expect(archives[0]).toContain('1700000000000');
  });

  it('archives a damaged save just as readily as a good one', async () => {
    // The only case that actually happens. An archive that only works on valid data is an
    // archive that never runs.
    await corruptMainSlot({ schemaVersion: 3, garbage: true });
    await archiveSave(1, '42');

    expect((await readSave(1)).status).toBe('empty');
    expect(await listArchives(1)).toHaveLength(1);
  });

  it('keeps every archive rather than overwriting the last one', async () => {
    await writeSave(freshSave({ hero: heroNamed('First') }));
    await archiveSave(1, '1000');
    await writeSave(freshSave({ hero: heroNamed('Second') }));
    await archiveSave(1, '2000');

    // Newest first, so a triage screen can name the most recent without sorting again.
    expect(await listArchives(1)).toEqual([
      'slot-1:archived-2000-main',
      'slot-1:archived-1000-main',
    ]);
  });

  it('leaves other slots alone', async () => {
    await writeSave(freshSave({ hero: heroNamed('Keep me') }));
    await writeSave({ ...freshSave({ hero: heroNamed('Also me') }), slot: 2 });

    await archiveSave(1, '1');

    const other = await readSave(2);
    expect(other.status).toBe('loaded');
    if (other.status !== 'loaded') return;
    expect(other.save.hero?.name).toBe('Also me');
    expect(await listArchives(2)).toEqual([]);
  });
});

describe('three slots, and remembering which one', () => {
  it('names who is in each slot rather than just saying "occupied"', async () => {
    /*
     * A picker that can only say "slot 2 has bytes in it" is a picker nobody can choose from.
     * The summary carries the three facts that identify a character to the person who made them.
     */
    await writeSave(freshSave({ slot: 1, hero: heroNamed('Ysolde') }));
    await writeSave(freshSave({ slot: 3, hero: { ...heroNamed('Kargath'), level: 12 } }));

    const slots = await listSlots();
    expect(slots[0]?.hero).toEqual({ name: 'Ysolde', classId: 'warrior', level: 1 });
    expect(slots[1]?.hero).toBeNull();
    expect(slots[2]?.hero).toEqual({ name: 'Kargath', classId: 'warrior', level: 12 });
  });

  it('separates "has a save file" from "has a character"', async () => {
    // Glancing at an empty slot writes an envelope before anybody has been made. That slot is
    // occupied on disk and empty to the player, and the picker must side with the player.
    await writeSave(freshSave({ slot: 2, hero: null }));

    const slots = await listSlots();
    expect(slots[1]?.occupied, 'the file is there').toBe(true);
    expect(slots[1]?.hero, 'but nobody is').toBeNull();
  });

  it('shows a slot that will not open rather than hiding it', async () => {
    await corruptMainSlot({ schemaVersion: 999, slot: 1 });

    const slots = await listSlots();
    expect(slots[0]?.broken).toBe(true);
    expect(slots[0]?.hero).toBeNull();
  });

  it('remembers the slot last played, and defaults to the first', async () => {
    expect(await readActiveSlot(), 'a browser that has never chosen').toBe(1);

    await writeActiveSlot(3);
    expect(await readActiveSlot()).toBe(3);
  });

  it('refuses a stored slot that is not a slot', async () => {
    // A hand-edited or half-written value must never lock a player out of their game.
    const { openDB } = await import('idb');
    const db = await openDB('tavernrpg', 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('saves')) database.createObjectStore('saves');
      },
    });
    await db.put('saves', 'seven', 'active-slot');
    db.close();

    expect(await readActiveSlot()).toBe(1);
  });

  it('keeps the other slots when one is deleted', async () => {
    await writeSave(freshSave({ slot: 1, hero: heroNamed('Ysolde') }));
    await writeSave(freshSave({ slot: 2, hero: heroNamed('Kargath') }));

    await deleteSave(1);

    const slots = await listSlots();
    expect(slots[0]?.hero).toBeNull();
    expect(slots[1]?.hero?.name, 'the neighbour went with it').toBe('Kargath');
  });
});
