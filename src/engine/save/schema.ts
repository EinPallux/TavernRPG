/**
 * The save envelope — validated on every load, versioned, and migrated forward.
 *
 * "Saves are sacred" (CLAUDE.md): any change to a persisted shape ships a migration and a
 * fixture test in the same PR. Phase 0 defines the envelope and one placeholder payload
 * (`skeleton`); the real slices (hero / activity / world / meta) land from Phase 2 onward,
 * each as a new schema version with a migration.
 *
 * This module is pure: no DOM, no IndexedDB, no clock. See docs/tech/data-models.md.
 */

import { z } from 'zod';

/** Bump whenever a persisted shape changes, and add the matching migration. */
export const CURRENT_SCHEMA_VERSION = 1;

export const SAVE_SLOTS = [1, 2, 3] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];

const timestampSchema = z.number().int().min(0);
const seedSchema = z.number().int().min(0).max(0xffffffff);

export const saveSlotSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** Persisted GameClock state — the high-water mark that defeats clock rewinding. */
export const clockStateSchema = z.object({
  lastSeen: timestampSchema,
  clampCount: z.number().int().min(0),
});

/**
 * Phase 0 walking-skeleton payload: knocking on the tavern door proves the full
 * mutate → persist → reload → rehydrate path works. Replaced by real slices in Phase 2.
 */
export const skeletonStateSchema = z.object({
  doorKnocks: z.number().int().min(0),
  createdAt: timestampSchema,
  lastKnockAt: timestampSchema.nullable(),
});

export const saveFileSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  savedAt: timestampSchema,
  slot: saveSlotSchema,
  /** Seeds the entire simulated world; committed at hero creation, never regenerated. */
  worldSeed: seedSchema,
  clock: clockStateSchema,
  skeleton: skeletonStateSchema,
});

export type ClockState = z.infer<typeof clockStateSchema>;
export type SkeletonState = z.infer<typeof skeletonStateSchema>;
export type SaveFile = z.infer<typeof saveFileSchema>;

export interface NewSaveOptions {
  readonly slot: SaveSlot;
  readonly worldSeed: number;
  readonly now: number;
}

/** Build a fresh, valid save. The only place a save is created from nothing. */
export function createNewSave({ slot, worldSeed, now }: NewSaveOptions): SaveFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt: now,
    slot,
    worldSeed: worldSeed >>> 0,
    clock: { lastSeen: now, clampCount: 0 },
    skeleton: { doorKnocks: 0, createdAt: now, lastKnockAt: null },
  };
}

export function isSaveSlot(value: unknown): value is SaveSlot {
  return value === 1 || value === 2 || value === 3;
}
