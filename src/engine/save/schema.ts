/**
 * The save envelope — validated on every load, versioned, and migrated forward.
 *
 * "Saves are sacred" (CLAUDE.md): any change to a persisted shape ships a migration and a
 * fixture test in the same PR. The remaining slices (activity / world) land in later phases,
 * each as a new schema version with a migration.
 *
 * This module is pure: no DOM, no IndexedDB, no clock. See docs/tech/data-models.md.
 */

import { z } from 'zod';
import { ICON_IDS } from '@/data/icons';
import { MOUNT_IDS } from '@/data/mounts';
import { RARITIES, SLOT_IDS } from '@/engine/items/types';

/** Bump whenever a persisted shape changes, and add the matching migration. */
export const CURRENT_SCHEMA_VERSION = 7;

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

export const classIdSchema = z.enum(['warrior', 'bard', 'mage', 'hunter', 'swashbuckler']);
export const slotIdSchema = z.enum(SLOT_IDS);
export const raritySchema = z.enum(RARITIES);

export const attributesSchema = z.object({
  str: z.number().int().min(0),
  dex: z.number().int().min(0),
  int: z.number().int().min(0),
  con: z.number().int().min(0),
  lck: z.number().int().min(0),
});

export const itemSchema = z.object({
  uid: z.string().min(1),
  slot: slotIdSchema,
  rarity: raritySchema,
  level: z.number().int().min(1),
  classLock: classIdSchema.optional(),
  name: z.string().min(1),
  iconId: z.enum(ICON_IDS),
  baseId: z.string().min(1),
  attrs: attributesSchema.partial(),
  weapon: z.object({ min: z.number(), max: z.number() }).optional(),
  armour: z.number().min(0).optional(),
  specials: z
    .object({ goldFind: z.number().optional(), xpBonus: z.number().optional() })
    .optional(),
  setId: z.string().optional(),
  value: z.number().min(0),
  scrapYield: z.object({
    scrap: z.number().int().min(0),
    essence: z.number().int().min(0),
    starmetal: z.number().int().min(0),
  }),
  locked: z.boolean(),
});

/** Backpack capacity at 1.0 start; premium expansions raise it (character spec §4). */
export const BACKPACK_SLOTS = 15;
/** Overflow catch for loot that arrives with a full backpack. */
export const SATCHEL_SLOTS = 5;

export const heroSchema = z.object({
  name: z.string().min(1).max(16),
  classId: classIdSchema,
  level: z.number().int().min(1),
  xp: z.number().min(0),
  /** Points bought with gold — the cost basis for further training. */
  trained: attributesSchema,
  gold: z.number().min(0),
  dice: z.number().int().min(0),
  /** Sparse by design: an empty slot is an absent key, not a null. */
  equipment: z.partialRecord(slotIdSchema, itemSchema),
  /** Fixed-length grid; null is an empty slot so positions stay stable. */
  backpack: z.array(itemSchema.nullable()),
  satchel: z.array(itemSchema),
  createdAt: timestampSchema,
});

/**
 * Player preferences. Added in schema v2 (Phase 1) — the first real migration, and the
 * reason a v1 save from Phase 0 still loads today.
 */
export const settingsSchema = z.object({
  /** Nav rail collapsed to icons only. */
  navCollapsed: z.boolean(),
  /**
   * Motion preference. 'system' follows `prefers-reduced-motion`; the explicit options let a
   * player opt out of ceremonies (or back into them) regardless of their OS setting.
   */
  motion: z.enum(['system', 'full', 'reduced']),
  /** Audio, wired up in Phase 17 (SFX + the optional bgm.mp3 drop-in). */
  sfxEnabled: z.boolean(),
  musicEnabled: z.boolean(),
  volume: z.number().min(0).max(1),
  /**
   * Battle playback speed, remembered between fights (combat spec §4 step 5). A player who
   * has settled on ×4 should never be dropped back to ×1 by opening a new mission.
   */
  battleSpeed: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  /** Jump straight to the result screen instead of watching the fight. */
  battleSkipDefault: z.boolean(),
});

export const DEFAULT_SETTINGS: Settings = {
  navCollapsed: false,
  motion: 'system',
  sfxEnabled: true,
  musicEnabled: true,
  volume: 0.7,
  battleSpeed: 1,
  battleSkipDefault: false,
};

/** `YYYY-MM-DD`, local. The reset engine compares these rather than elapsed hours. */
const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const missionDurationSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(20),
]);

/** A job on the board. Persisted so a refresh cannot reshuffle the day's work. */
export const missionOfferSchema = z.object({
  id: z.string().min(1),
  zoneId: z.string().min(1),
  monsterId: z.string().min(1),
  blurbId: z.string().min(1),
  backdropIndex: z.number().int().min(0),
  /** Committed at draw: the fight and the loot both fork from here. */
  seed: seedSchema,
  monsterLevel: z.number().int().min(1),
});

export const activeMissionSchema = z.object({
  offer: missionOfferSchema,
  duration: missionDurationSchema,
  /** Wall-clock stamps, so the timer keeps running with the tab closed. */
  startedAt: timestampSchema,
  endsAt: timestampSchema,
  vigorSpent: z.number().min(0),
  /** Level at signing — rewards are priced when the contract is signed, not when it is paid. */
  heroLevel: z.number().int().min(1),
});

/**
 * A City Watch shift. Three numbers and a level: what it has earned is computed from the clock,
 * never accumulated, which is why it survives a closed tab without a background timer.
 */
export const patrolShiftSchema = z.object({
  startedAt: timestampSchema,
  endsAt: timestampSchema,
  hours: z.number().int().min(1).max(12),
  /** Level at signing — the shift pays what it was worth when it started. */
  heroLevel: z.number().int().min(1),
});

/**
 * A shop's shelf for a day (schema v7).
 *
 * The six items are persisted rather than regenerated from the seed on read. Regenerating would
 * be smaller, but it would mean a change to `generateItem` could swap what a player is looking
 * at between opening the shop and clicking buy — and a shop that sells you something other than
 * the thing on the card is the one bug a shop must not have.
 */
export const shopStockSchema = z.object({
  /** The day this shelf was drawn for. A different day means restock. */
  day: dayKeySchema,
  items: z.array(itemSchema),
  /** Indices of `items` already bought. Sold slots keep their place (shops spec §3). */
  sold: z.array(z.number().int().min(0)),
  /** Rerolls bought today; part of the draw seed, and priced from the second one on. */
  rerollsToday: z.number().int().min(0),
});

/**
 * A mount rental (schema v7). One id and an expiry — whether it is still running is computed
 * from the clock, the same way a patrol shift is.
 */
export const mountRentalSchema = z.object({
  mountId: z.enum(MOUNT_IDS),
  rentedAt: timestampSchema,
  expiresAt: timestampSchema,
});

/**
 * Everything time-bound about the player's day. Added in schema v5 (Phase 5), when missions
 * gave the game its first thing that happens while you are not looking; patrol joined in v6,
 * shop shelves and the mount stall in v7.
 */
export const activitySchema = z.object({
  vigor: z.number().min(0),
  /** Ales drunk today, against the 3/day cap. */
  alesToday: z.number().int().min(0),
  /** Free Ales received today, capped at one (balancing §7). */
  freeAlesToday: z.number().int().min(0),
  /** Unopened Ales the player is holding. */
  alesHeld: z.number().int().min(0),
  /** The day's board, and the day it was drawn for. */
  board: z.array(missionOfferSchema),
  boardDay: dayKeySchema.nullable(),
  boardRerollsToday: z.number().int().min(0),
  /** The job in progress, if any. Only one at a time (tavern spec §3). */
  mission: activeMissionSchema.nullable(),
  /**
   * A finished mission whose fight has not been watched yet.
   *
   * Missions never auto-resolve: the battle is the payoff, so a timer that expired while the
   * tab was closed leaves the fight waiting here rather than quietly banking the rewards.
   */
  pendingMission: activeMissionSchema.nullable(),
  /** Last day boundary the reset engine processed. */
  lastProcessedDay: dayKeySchema.nullable(),
  /** Lifetime counter, for tasks and the "closest moment" flavour. */
  missionsCompleted: z.number().int().min(0),
  /**
   * The City Watch shift in progress, if any (schema v6). Mutually exclusive with `mission` —
   * the hero cannot be in two places at once (tavern spec §5).
   */
  patrol: patrolShiftSchema.nullable(),
  /** Lifetime counter, for tasks and Hildy's regard. */
  patrolsCompleted: z.number().int().min(0),
  /** Both shops' shelves, keyed by shop id (schema v7). */
  shops: z.record(z.string(), shopStockSchema),
  /** The mount in the stall, if any (schema v7). */
  mount: mountRentalSchema.nullable(),
});

export const DEFAULT_ACTIVITY: Activity = {
  vigor: 100,
  alesToday: 0,
  freeAlesToday: 0,
  alesHeld: 0,
  board: [],
  boardDay: null,
  boardRerollsToday: 0,
  mission: null,
  pendingMission: null,
  lastProcessedDay: null,
  missionsCompleted: 0,
  patrol: null,
  patrolsCompleted: 0,
  shops: {},
  mount: null,
};

export const saveFileSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  savedAt: timestampSchema,
  slot: saveSlotSchema,
  /** Seeds the entire simulated world; committed at hero creation, never regenerated. */
  worldSeed: seedSchema,
  clock: clockStateSchema,
  settings: settingsSchema,
  /** Null until the player finishes creation — that is what routes them to the class picker. */
  hero: heroSchema.nullable(),
  activity: activitySchema,
});

export type ClockState = z.infer<typeof clockStateSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Hero = z.infer<typeof heroSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type StoredMissionOffer = z.infer<typeof missionOfferSchema>;
export type StoredActiveMission = z.infer<typeof activeMissionSchema>;
export type StoredPatrolShift = z.infer<typeof patrolShiftSchema>;
export type StoredShopStock = z.infer<typeof shopStockSchema>;
export type StoredMountRental = z.infer<typeof mountRentalSchema>;
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
    settings: { ...DEFAULT_SETTINGS },
    hero: null,
    activity: { ...DEFAULT_ACTIVITY },
  };
}

export function isSaveSlot(value: unknown): value is SaveSlot {
  return value === 1 || value === 2 || value === 3;
}
