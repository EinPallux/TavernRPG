/**
 * IndexedDB persistence for save slots.
 *
 * Writes keep the previous good save as a backup and swap the main key afterwards, so a
 * crash mid-write can never leave a slot unreadable — a damaged main save silently falls
 * back to the backup on load (docs/tech/architecture.md §3, §7).
 *
 * This is the browser-facing glue; all validation/migration logic lives in the pure engine.
 */

import { openDB, type IDBPDatabase } from 'idb';
import { describeFailure, migrateSave, type MigrationFailure } from '@/engine/save/migrations';
import { SAVE_SLOTS, saveFileSchema, type SaveFile, type SaveSlot } from '@/engine/save/schema';

const DB_NAME = 'tavernrpg';
const DB_VERSION = 1;
const STORE = 'saves';

const mainKey = (slot: SaveSlot): string => `slot-${slot}`;
const backupKey = (slot: SaveSlot): string => `slot-${slot}:backup`;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    },
  });
  return dbPromise;
}

/** Test seam: drops the cached connection so a fresh fake-indexeddb can be used. */
export function resetPersistenceForTests(): void {
  dbPromise = null;
}

export type LoadResult =
  | {
      readonly status: 'loaded';
      readonly save: SaveFile;
      readonly migratedFrom: number | null;
      readonly recoveredFromBackup: boolean;
    }
  | { readonly status: 'empty' }
  | { readonly status: 'failed'; readonly failure: MigrationFailure; readonly message: string };

/** Persist a save, rotating the previous version into the backup key first. */
export async function writeSave(save: SaveFile): Promise<void> {
  // Validate before writing: a bug upstream must never poison a slot on disk.
  const parsed = saveFileSchema.safeParse(save);
  if (!parsed.success) {
    throw new Error(
      `Refusing to write an invalid save: ${parsed.error.issues[0]?.message ?? 'unknown problem'}`,
    );
  }

  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);

  const previous: unknown = await store.get(mainKey(save.slot));
  if (previous !== undefined) {
    await store.put(previous, backupKey(save.slot));
  }
  await store.put(parsed.data, mainKey(save.slot));
  await tx.done;
}

/** Read a slot, migrating it forward and falling back to the backup if the main copy is bad. */
export async function readSave(slot: SaveSlot): Promise<LoadResult> {
  const db = await getDb();
  const main: unknown = await db.get(STORE, mainKey(slot));

  if (main !== undefined) {
    const result = migrateSave(main);
    if (result.ok) {
      return {
        status: 'loaded',
        save: result.save,
        migratedFrom: result.migratedFrom,
        recoveredFromBackup: false,
      };
    }

    const backup: unknown = await db.get(STORE, backupKey(slot));
    if (backup !== undefined) {
      const fallback = migrateSave(backup);
      if (fallback.ok) {
        return {
          status: 'loaded',
          save: fallback.save,
          migratedFrom: fallback.migratedFrom,
          recoveredFromBackup: true,
        };
      }
    }

    return { status: 'failed', failure: result.failure, message: describeFailure(result.failure) };
  }

  return { status: 'empty' };
}

export async function deleteSave(slot: SaveSlot): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  await tx.objectStore(STORE).delete(mainKey(slot));
  await tx.objectStore(STORE).delete(backupKey(slot));
  await tx.done;
}

export interface SlotSummary {
  readonly slot: SaveSlot;
  readonly occupied: boolean;
  readonly savedAt: number | null;
}

/** Slot-picker data: which slots hold a save and when each was last written. */
export async function listSlots(): Promise<SlotSummary[]> {
  const summaries: SlotSummary[] = [];
  for (const slot of SAVE_SLOTS) {
    const result = await readSave(slot);
    summaries.push({
      slot,
      occupied: result.status === 'loaded',
      savedAt: result.status === 'loaded' ? result.save.savedAt : null,
    });
  }
  return summaries;
}

/**
 * Export whatever is on disk, valid or not.
 *
 * `exportSave` below returns null for a save that will not open — which is precisely the save a
 * player most wants a copy of. A corrupted file is often recoverable by hand, and it is *always*
 * irreplaceable, so the triage screen offers these bytes before it offers anything destructive.
 * Unparsed and unmigrated on purpose: whatever went wrong should reach the copy intact.
 */
export async function exportRaw(slot: SaveSlot, exportedAt: number): Promise<string | null> {
  const db = await getDb();
  const main: unknown = await db.get(STORE, mainKey(slot));
  const backup: unknown = await db.get(STORE, backupKey(slot));
  if (main === undefined && backup === undefined) return null;

  // The stamp is passed in rather than read: wall time comes through GameClock, and a support
  // file should carry the same clock the save was written against.
  return JSON.stringify({ exportedAt, slot, main: main ?? null, backup: backup ?? null }, null, 2);
}

/**
 * Move a slot aside instead of deleting it.
 *
 * "Start fresh" has to be available to a player whose save will not open, and it must not be the
 * same button as "destroy the only copy of my hero". The broken data moves to a dated key where
 * a future version — or a hand-edit through devtools — can still reach it. Storage is cheap; a
 * level-fifty hero is not.
 */
export async function archiveSave(slot: SaveSlot, stamp: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);

  for (const [key, suffix] of [
    [mainKey(slot), 'main'],
    [backupKey(slot), 'backup'],
  ] as const) {
    const value: unknown = await store.get(key);
    if (value === undefined) continue;
    await store.put(value, `${key}:archived-${stamp}-${suffix}`);
    await store.delete(key);
  }
  await tx.done;
}

/** Archived slots, newest first — so a triage screen can say what it kept. */
export async function listArchives(slot: SaveSlot): Promise<string[]> {
  const db = await getDb();
  const keys = await db.getAllKeys(STORE);
  return keys
    .map(String)
    .filter((key) => key.startsWith(`${mainKey(slot)}:archived-`))
    .sort()
    .reverse();
}

/**
 * Export a slot as text the player can keep (USER_QUESTIONS Q1).
 * Phase 18 wraps this in the `.tavernsave` compressed file UX; the payload shape is final.
 */
export async function exportSave(slot: SaveSlot): Promise<string | null> {
  const result = await readSave(slot);
  return result.status === 'loaded' ? JSON.stringify(result.save, null, 2) : null;
}

/** Import previously exported text into a slot. Never throws on bad input — reports instead. */
export async function importSave(
  text: string,
  slot: SaveSlot,
): Promise<{ ok: true; save: SaveFile } | { ok: false; message: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "That file isn't readable as a TavernRPG save." };
  }

  const result = migrateSave(parsed);
  if (!result.ok) {
    return { ok: false, message: describeFailure(result.failure) };
  }

  // Importing into a different slot rewrites the slot stamp so the file lands where asked.
  const save: SaveFile = { ...result.save, slot };
  await writeSave(save);
  return { ok: true, save };
}
