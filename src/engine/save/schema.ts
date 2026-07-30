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
import { CRIER_CATEGORIES, RIVAL_ARCHETYPES } from '@/data/crierTemplates';
import { CHAT_CATEGORIES } from '@/data/guildChat';
import { BANNER_COLOURS, GUILD_NAME_MAX, SIGIL_ICONS } from '@/data/guilds';
import { BANNER_IDS, ROLL_OUTCOMES } from '@/data/banners';
import { PET_ID_LIST, PET_RARITIES } from '@/data/pets';
import { PROGRESS_METRICS } from '@/data/progress';
import { RARITIES, SLOT_IDS } from '@/engine/items/types';

/** Bump whenever a persisted shape changes, and add the matching migration. */
export const CURRENT_SCHEMA_VERSION = 15;

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

export const materialsSchema = z.object({
  scrap: z.number().int().min(0),
  essence: z.number().int().min(0),
  starmetal: z.number().int().min(0),
});

export const verseIdSchema = z.enum(['battle-hymn', 'ironsong', 'discord']);

export const EMPTY_MATERIALS: Materials = { scrap: 0, essence: 0, starmetal: 0 };

export const heroSchema = z.object({
  name: z.string().min(1).max(16),
  classId: classIdSchema,
  level: z.number().int().min(1),
  xp: z.number().min(0),
  /** Points bought with gold — the cost basis for further training. */
  trained: attributesSchema,
  gold: z.number().min(0),
  dice: z.number().int().min(0),
  /**
   * Ladder honor (schema v9). Lives on the hero rather than in the arena slice because it is a
   * player stat like gold — the Hall of Fame shows it beside the level, and it outlives any
   * single arena session.
   */
  honor: z.number().min(0),
  /**
   * The forge's three tiers (schema v12).
   *
   * On the hero rather than in a forge slice, for the same reason gold is: materials are a
   * currency the player carries, and the Emberforge is only the shop that takes them. Phase 7's
   * scrap quote has been naming these numbers since the Armory opened; this is the purse they
   * finally go into.
   */
  materials: materialsSchema,
  /**
   * The Verse a Bard opens on, once a Maestro five-piece has earned them the choice (schema v12).
   *
   * Null for everybody else, and harmless if it survives the set being taken off — `openingVerse`
   * in `items/sets.ts` gates on the bonus being active, so a stale choice simply stops applying
   * rather than needing to be cleared.
   */
  openingVerse: verseIdSchema.nullable(),
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
  /**
   * Missions completed per zone (schema v14).
   *
   * Exists for one pet — the Wisp wants forty contracts at the Sunken Chapel — but it is a
   * *counter of things the player did*, which is the shape every derived-ownership source has to
   * take. Sparse: a zone the hero has never visited is an absent key, not a zero.
   */
  zoneMissions: z.record(z.string(), z.number().int().min(0)),
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
  zoneMissions: {},
};

/* ── The simulated world (schema v8) ───────────────────────────────────────────── */

/**
 * A bot's **divergence** from what the seed already says (world-simulation spec §7).
 *
 * Name, class, culture, personality and timezone are deliberately absent: they are recomputed
 * from `(worldSeed, id)` by `engine/world/identity.ts`. Storing 1,500 names would cost more
 * than the rest of the save put together, and would let a stored name drift from the seed that
 * is supposed to imply it.
 */
export const botRecordSchema = z.object({
  id: z.number().int().min(0),
  level: z.number().int().min(1),
  xp: z.number().min(0),
  honor: z.number().min(0),
  /** Guild index, or -1 for the unguilded. */
  guildId: z.number().int().min(-1),
  gearScore: z.number().min(0),
  dormantUntil: timestampSchema,
});

export const guildRecordSchema = z.object({
  id: z.number().int().min(0),
  memberIds: z.array(z.number().int().min(0)),
  treasury: z.number().min(0),
  active: z.boolean(),
});

export const rivalSchema = z.object({
  botId: z.number().int().min(0),
  archetype: z.enum(RIVAL_ARCHETYPES),
  heat: z.number().min(0).max(100),
  since: timestampSchema,
  everBeaten: z.boolean(),
});

const simEventSchema = z.object({
  kind: z.enum(['levelUp', 'ladderPass', 'milestone', 'dormant', 'returned']),
  at: timestampSchema,
  botId: z.number().int().min(0),
  otherId: z.number().int().min(0).optional(),
  level: z.number().int().min(1).optional(),
  rank: z.number().int().min(1).optional(),
});

export const feedEntrySchema = z.object({
  id: z.string().min(1),
  at: timestampSchema,
  category: z.enum(CRIER_CATEGORIES),
  text: z.string().min(1),
  relation: z.enum(['rival', 'guildmate', 'neighbour', 'stranger', 'world']),
  /** Null only for world flavour — every other headline carries the delta behind it. */
  sourceEvent: simEventSchema.nullable(),
});

export const worldSchema = z.object({
  seed: seedSchema,
  createdAt: timestampSchema,
  /** Last timestamp the simulation was advanced to. */
  lastSimAt: timestampSchema,
  bots: z.array(botRecordSchema),
  guilds: z.array(guildRecordSchema),
  /**
   * Ladder order, best first. Bots are 0…1,499; **-1 is the player** (`PLAYER_LADDER_ID`), who
   * takes their seat when the world is raised. The floor is -1 rather than 0 for exactly that
   * reason — a `min(0)` here would reject every save the moment the arena opened.
   */
  ladder: z.array(z.number().int().min(-1)),
  rivals: z.array(rivalSchema),
  /** Newest first, capped at 300 (spec §7). */
  feed: z.array(feedEntrySchema),
});

/* ── The arena (schema v9) ─────────────────────────────────────────────────────── */

/** A bot attack the player has not answered yet (arena spec §1 step 6). */
export const grudgeSchema = z.object({
  botId: z.number().int().min(0),
  at: timestampSchema,
  /** True when the bot won, which is what earns the revenge chip. */
  lost: z.boolean(),
  /** Ranks the attack cost, for the "they took rank 412 off you" line. */
  ranksLost: z.number().int().min(0),
});

/** One week's closing top ten, archived for the Hall of Fame's Legends tab (spec §2). */
export const legendsWeekSchema = z.object({
  /** The Sunday the week closed on. */
  weekKey: z.string().min(1),
  /** Ladder ids, best first. -1 is the player, on the week they managed it. */
  ids: z.array(z.number().int().min(-1)),
  /** The player's own rank that week, so the archive reads as their history too. */
  playerRank: z.number().int().min(0),
});

export const arenaSchema = z.object({
  /** The three opponents on offer. Empty until the first draw of the day. */
  draw: z.array(z.number().int().min(0)),
  /** Day the draw belongs to; a different day redraws. */
  drawDay: dayKeySchema.nullable(),
  /** Rerolls bought today. Part of the draw seed, and priced after the free one. */
  rerollsToday: z.number().int().min(0),
  /** Next moment a fight is allowed. */
  cooldownUntil: timestampSchema,
  /** Wins that still paid gold and XP today, against the daily cap. */
  rewardedWinsToday: z.number().int().min(0),
  /** Cooldown skips bought today, against the 3/day cap. */
  skipsToday: z.number().int().min(0),
  /** Unanswered bot attacks, newest first. */
  revengeQueue: z.array(grudgeSchema),
  /** Best rank ever held, for milestone stingers that must fire only once. */
  bestRank: z.number().int().min(0),
  /** Rank at the last visit to the Hall of Fame, for the "▲ 12 overnight" chip. */
  lastSeenRank: z.number().int().min(0),
  /** Last week key the ladder payout was made for (arena spec §3). */
  lastPayoutWeek: z.string().nullable(),
  /**
   * Last day index (days since the epoch) whose bot attacks have been rolled.
   *
   * A day's raid is seeded by its index, so re-running it picks the same attacker and replays the
   * same fight — which applies the honor loss a second time. This is the high-water mark that
   * stops a reload being an attack.
   */
  lastRaidDay: z.number().int().min(0),
  /** Newest first, capped — the Legends tab is an archive, not a ledger. */
  legends: z.array(legendsWeekSchema),
});

/** Weeks kept in the Legends archive. A year of Sundays is plenty of history to browse. */
export const LEGENDS_ARCHIVE_CAP = 52;

export const DEFAULT_ARENA: Arena = {
  draw: [],
  drawDay: null,
  rerollsToday: 0,
  cooldownUntil: 0,
  rewardedWinsToday: 0,
  skipsToday: 0,
  revengeQueue: [],
  bestRank: 0,
  lastSeenRank: 0,
  lastPayoutWeek: null,
  lastRaidDay: 0,
  legends: [],
};

/* ── The Guild Hall (schema v10) ───────────────────────────────────────────────── */

/** A message in the hall. Bot lines, the player's own, and the hall's system notices. */
export const chatMessageSchema = z.object({
  id: z.string().min(1),
  at: timestampSchema,
  author: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('bot'), botId: z.number().int().min(0), name: z.string().min(1) }),
    z.object({ kind: z.literal('player'), name: z.string().min(1) }),
    z.object({ kind: z.literal('system') }),
  ]),
  text: z.string().min(1),
  category: z.enum(CHAT_CATEGORIES),
  /**
   * The event behind the line. Null only for colour, hellos and replies — the audit test asserts
   * exactly that, so a null anywhere else is a hall that made something up.
   */
  sourceEvent: simEventSchema.nullable(),
});

/** A bot waiting on the Guildmaster's answer. */
export const applicantSchema = z.object({
  botId: z.number().int().min(0),
  at: timestampSchema,
});

/** The player's own letter, out with one of the sixty. */
export const applicationSchema = z.object({
  guildId: z.number().int().min(0),
  appliedAt: timestampSchema,
  decidesAt: timestampSchema,
});

/** The hall the player founded, if they did. */
export const foundedGuildSchema = z.object({
  id: z.number().int().min(0),
  name: z.string().min(1).max(GUILD_NAME_MAX),
  motto: z.string().max(80),
  field: z.enum(BANNER_COLOURS),
  charge: z.enum(BANNER_COLOURS),
  sigil: z.enum(SIGIL_ICONS),
  foundedAt: timestampSchema,
});

/** The week's co-op target and what has been done toward it. */
export const bountyStateSchema = z.object({
  weekKey: z.string().min(1),
  bountyId: z.string().min(1),
  target: z.number().min(0),
  playerUnits: z.number().min(0),
  botUnits: z.number().min(0),
  settled: z.boolean(),
});

export const guildSchema = z.object({
  /**
   * The hall the player belongs to: 0–59 for one of the sixty, `PLAYER_GUILD_ID` for their own,
   * null for nobody. One field rather than two booleans, because "in a bot guild" and "in my own
   * guild" are the same membership as far as buffs, chat and the bounty are concerned.
   */
  guildId: z.number().int().min(0).nullable(),
  joinedAt: timestampSchema,
  founded: foundedGuildSchema.nullable(),
  /** Out with one of the sixty, awaiting an answer. */
  application: applicationSchema.nullable(),
  /** Last refusal per guild id, for the 24h reapply cooldown. */
  refusedAt: z.record(z.string(), timestampSchema),
  /** Bot members of the *founded* hall. The sixty keep their rosters in the world slice. */
  roster: z.array(z.number().int().min(0)),
  officers: z.array(z.number().int().min(0)),
  applicants: z.array(applicantSchema),
  /** Day index high-water marks, so a reload never re-rolls a day (the arena's lesson). */
  lastApplicantDay: z.number().int().min(0),
  lastChatDay: z.number().int().min(0),
  lastBountyDay: z.number().int().min(0),
  /**
   * The two tracks, for a founded hall. A player in one of the sixty reads the steps off that
   * guild's own treasury instead — one number, in the world slice, that the simulation already
   * grows.
   */
  treasuryStep: z.number().int().min(0),
  treasuryPool: z.number().min(0),
  drillmasterStep: z.number().int().min(0),
  drillmasterPool: z.number().min(0),
  /** Gold donated this week, by member. Keyed by bot id, or `player`. */
  contributions: z.record(z.string(), z.number().min(0)),
  chat: z.array(chatMessageSchema),
  bounty: bountyStateSchema.nullable(),
});

export const DEFAULT_GUILD: Guild = {
  guildId: null,
  joinedAt: 0,
  founded: null,
  application: null,
  refusedAt: {},
  roster: [],
  officers: [],
  applicants: [],
  lastApplicantDay: 0,
  lastChatDay: 0,
  lastBountyDay: 0,
  treasuryStep: 0,
  treasuryPool: 0,
  drillmasterStep: 0,
  drillmasterPool: 0,
  contributions: {},
  chat: [],
  bounty: null,
};

/* ── The Undertavern (schema v11) ─────────────────────────────────────────────────── */

/**
 * One dungeon's progress.
 *
 * `bestAttempts` is a fixed ten-slot array indexed by floor − 1, holding the share of the
 * monster's health that attempt took off. Kept for *losses*: between two gear upgrades it is the
 * only progress a player has to look at, and "you took it to 71%" is a target where a bare "you
 * lost" is a wall.
 */
export const dungeonProgressSchema = z.object({
  floorsCleared: z.number().int().min(0).max(10),
  cooldownUntil: timestampSchema,
  bestAttempts: z.array(z.number().min(0).max(1)).length(10),
  /**
   * How many times the player has gone down. Seeds each attempt, so the same descent replays
   * identically while the *next* one is a genuinely different fight — a floor you lost to must
   * not be the same fight forever.
   */
  attempts: z.number().int().min(0),
  clearedAt: timestampSchema.nullable(),
});

export const dungeonsSchema = z.object({
  /** Keys found on missions. A key is a one-time unlock; the door then stays open. */
  keys: z.array(z.string()),
  /** Cleared-dungeon crests, shown on the profile forever after. */
  trophies: z.array(z.string()),
  /** Keyed by `DungeonId`. Absent means never entered, which reads the same as empty. */
  progress: z.record(z.string(), dungeonProgressSchema),
});

export const DEFAULT_DUNGEONS: Dungeons = { keys: [], trophies: [], progress: {} };

/* ── The Emberforge (schema v12) ──────────────────────────────────────────────────── */

export const forgeSchema = z.object({
  /** Scraps spent today, against the ten-a-day cap (crafting spec §2). Reset at midnight. */
  scrapsUsedToday: z.number().int().min(0),
  /**
   * The ember meter: one per Master forge, and at five the next one is an Epic for certain
   * (crafting spec §3). A pity track, so a run of bad luck has a floor under it.
   */
  emberMeter: z.number().int().min(0),
  /** Set recipes found on dungeon floors 5 and 10. Each unlocks that set's guaranteed craft. */
  recipes: z.array(z.string()),
  /** Total forges struck, for the room to say something other than nothing on a first visit. */
  crafted: z.number().int().min(0),
});

export const DEFAULT_FORGE: Forge = {
  scrapsUsedToday: 0,
  emberMeter: 0,
  recipes: [],
  crafted: 0,
};

/* ── Fortune's Table (schema v13) ──────────────────────────────────────────────── */

/** One line in the history log — what was rolled, on what, and when (gacha spec §7). */
export const rollRecordSchema = z.object({
  at: timestampSchema,
  bannerId: z.enum(BANNER_IDS),
  outcome: z.enum(ROLL_OUTCOMES),
  /** What it was called on the reveal, so the log and the card never disagree. */
  label: z.string().min(1),
  /** True when the pity counter paid rather than the dice. */
  pitied: z.boolean(),
  /** True when the roll cost nothing (the Daily Draw's free card). */
  free: z.boolean(),
});

/** `[TUNE]` Rolls kept in the log (gacha spec §8). Enough to answer "what did I get?" for weeks. */
export const ROLL_HISTORY_LIMIT = 200;

export const gachaSchema = z.object({
  /**
   * The weekly banner's pity counter, and **which set it has been counting toward**.
   *
   * Two fields rather than one because the counter persists across weeks *for the same set*
   * (gacha spec §4) — a player twelve rolls into Oathsworn does not lose those rolls when the
   * table turns over to Wolfblood, they simply stop advancing until Oathsworn comes round again.
   * A bare counter with no set attached would either reset every Monday (punishing) or pay out
   * on whatever happened to be featured (a lie).
   */
  weeklyPity: z.number().int().min(0),
  weeklyPitySet: z.string().nullable(),
  /** Lifetime rolls on the Grand Reading. The track's rungs are derived from it, never stored. */
  monthlyRolls: z.number().int().min(0),
  /**
   * Monthly rolls the track has already been paid out for — a **high-water mark in rolls**, not
   * a count of rungs.
   *
   * The fifth of these in the save, and it is here for the fifth time for the same reason
   * (CLAUDE.md): a payout derived from a counter is reproducible, which is the opposite of
   * idempotent. Holding the mark separately from `monthlyRolls` also means a rung that somehow
   * failed to land — a thrown error, a half-written save — is simply paid on the next roll,
   * rather than silently skipped forever.
   */
  monthlyPaidThrough: z.number().int().min(0),
  /** Shards from duplicate set pieces; five make a recipe (spec §5). */
  shards: z.number().int().min(0),
  /** Free Daily Draw rolls taken today, capped at one. Cleared by the Reset Engine. */
  freeRollsToday: z.number().int().min(0),
  /** Lifetime rolls, for the room to have something to say on a return visit. */
  rolls: z.number().int().min(0),
  /**
   * Pets Vesna has handed over.
   *
   * Only *her* grants. The Menagerie (Phase 14) derives ownership of all twelve from their
   * documented sources — dungeon trophies, mission counters, arena rank, the login calendar —
   * every one of which is already a fact in this save. A second list of "pets owned" would be
   * the same fact written twice, free to drift, and would need reconciling on every load.
   */
  pets: z.array(z.string()),
  /** Newest first, capped at `ROLL_HISTORY_LIMIT`. */
  history: z.array(rollRecordSchema),
});

export const DEFAULT_GACHA: Gacha = {
  weeklyPity: 0,
  weeklyPitySet: null,
  monthlyRolls: 0,
  monthlyPaidThrough: 0,
  shards: 0,
  freeRollsToday: 0,
  rolls: 0,
  pets: [],
  history: [],
};

/* ── The Menagerie (schema v14) ────────────────────────────────────────────────── */

export const petProgressSchema = z.object({
  /** 1–50; one feed, one level (pets spec §2). */
  level: z.number().int().min(1),
  rarity: z.enum(PET_RARITIES),
  /** Feeds taken today, against the three-a-day cap. Cleared by the Reset Engine. */
  fedToday: z.number().int().min(0),
});

export const petsSchema = z.object({
  /**
   * Per-pet progress, **sparse**: a pet that has never been fed has no entry, and reads as
   * level 1 / common / unfed. Writing twelve default rows into every save to say "nothing has
   * happened" would be twelve rows of nothing.
   *
   * Note what is *not* here: ownership. `engine/pets/ownership.ts` derives that from the facts
   * that earned each pet — floors cleared, missions run, best rank, what Vesna handed over —
   * so there is no second list to reconcile and a player who cleared Barrowdeep in Phase 11
   * owns the Gloom Cat the moment this room opens.
   */
  progress: z.record(z.string(), petProgressSchema),
  /** The one at your side, or null. Switching is free and instant (spec §2). */
  activeId: z.enum(PET_ID_LIST).nullable(),
  /** Tavern Scraps — pet food, from missions and the daily loop. */
  scraps: z.number().int().min(0),
  /**
   * Pets that hatched rather than being earned.
   *
   * The one place ownership *is* stored, because for a 0.5% egg the luck itself is the fact —
   * there is nothing else in the save to derive it from.
   */
  eggs: z.array(z.enum(PET_ID_LIST)),
  /** Pets the player had last time they looked, for the "something new" cue on the rail. */
  seenCount: z.number().int().min(0),
});

export const DEFAULT_PETS: Pets = {
  progress: {},
  activeId: null,
  scraps: 0,
  eggs: [],
  seenCount: 0,
};

/* ── The Notice Board and the ledger (schema v15) ─────────────────────────────────── */

/**
 * Everything counted today, keyed by `ProgressMetric`.
 *
 * Sparse, and cleared at every day boundary. This is the one thing in the daily loop that has to
 * be *stored* rather than derived: a task asks what you did **today**, and a lifetime total
 * cannot answer that without a snapshot to diff against — which would be the same storage wearing
 * a cleverer name.
 */
export const progressTallySchema = z.partialRecord(
  z.enum(PROGRESS_METRICS),
  z.number().int().min(0),
);

export const tasksSchema = z.object({
  /** The day's three, as ids. Definitions, points and progress are all looked up. */
  taskIds: z.array(z.string()).max(8),
  /** Day the board was drawn for; a mismatch redraws lazily on the next read. */
  drawnFor: dayKeySchema.nullable(),
  /** Today's counters. Cleared by the Reset Engine, never by a screen. */
  today: progressTallySchema,
  /**
   * Lifetime counters, for the draw's neglect weighting.
   *
   * Kept beside the daily tally rather than derived, because most of these metrics have no
   * lifetime home anywhere else — nothing counts scrapped items or gold spent on training.
   */
  lifetime: progressTallySchema,
  /**
   * Day the daily chest was last paid. **A high-water mark, not a flag** — the seventh in
   * CLAUDE.md's list, and it exists because a chest keyed on a day and applied to the save pays
   * twice on reload without one.
   */
  lastChestDay: dayKeySchema.nullable(),
  /** Week key the weekly chest was last paid for. Same rule, coarser boundary. */
  lastWeeklyChestWeek: dayKeySchema.nullable(),
  /** Daily chests claimed in the current week, against the seven the weekly chest wants. */
  claimsThisWeek: z.number().int().min(0),
  /** The week `claimsThisWeek` belongs to; a new week zeroes it. */
  claimsWeek: dayKeySchema.nullable(),
  /** Lifetime daily-chest claims. Thirty of them earn the Coin Toad (pets spec §1). */
  totalChests: z.number().int().min(0),
});

export const DEFAULT_TASKS: Tasks = {
  taskIds: [],
  drawnFor: null,
  today: {},
  lifetime: {},
  lastChestDay: null,
  lastWeeklyChestWeek: null,
  claimsThisWeek: 0,
  claimsWeek: null,
  totalChests: 0,
};

/**
 * Marla's ledger (daily-loop spec §2).
 *
 * Note the absence of a streak. `day` is a **count of squares attended**, so missing a day
 * pauses the calendar rather than resetting it — there is no field here a lapse could reduce,
 * which is the rule implemented as a shape rather than as a branch.
 */
export const calendarSchema = z.object({
  day: z.number().int().min(0).max(28),
  /** The day the last stamp landed. One stamp per day, guarded by comparison. */
  lastStampedDay: dayKeySchema.nullable(),
  /** Closed 28-day cycles. The first one earns the Moss Tortoise (pets spec §1). */
  cyclesCompleted: z.number().int().min(0),
});

export const DEFAULT_CALENDAR: Calendar = {
  day: 0,
  lastStampedDay: null,
  cyclesCompleted: 0,
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
  /**
   * The 1,500 (schema v8). Null until the world is generated, which happens at hero creation —
   * a save with no hero has no world to simulate.
   */
  world: worldSchema.nullable(),
  /** The Proving Grounds (schema v9). */
  arena: arenaSchema,
  /** The Guild Hall (schema v10). */
  guild: guildSchema,
  /** The Undertavern (schema v11). */
  dungeons: dungeonsSchema,
  /** The Emberforge (schema v12). */
  forge: forgeSchema,
  /** Fortune's Table (schema v13). */
  gacha: gachaSchema,
  /** The Menagerie (schema v14). */
  pets: petsSchema,
  /** The Notice Board (schema v15). */
  tasks: tasksSchema,
  /** The login calendar (schema v15). */
  calendar: calendarSchema,
});

export type ClockState = z.infer<typeof clockStateSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Hero = z.infer<typeof heroSchema>;
export type Materials = z.infer<typeof materialsSchema>;
export type Forge = z.infer<typeof forgeSchema>;
export type Gacha = z.infer<typeof gachaSchema>;
export type Pets = z.infer<typeof petsSchema>;
export type Tasks = z.infer<typeof tasksSchema>;
export type Calendar = z.infer<typeof calendarSchema>;
export type StoredProgressTally = z.infer<typeof progressTallySchema>;
export type StoredPetProgress = z.infer<typeof petProgressSchema>;
export type StoredRollRecord = z.infer<typeof rollRecordSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type StoredMissionOffer = z.infer<typeof missionOfferSchema>;
export type StoredActiveMission = z.infer<typeof activeMissionSchema>;
export type StoredPatrolShift = z.infer<typeof patrolShiftSchema>;
export type StoredShopStock = z.infer<typeof shopStockSchema>;
export type StoredMountRental = z.infer<typeof mountRentalSchema>;
export type StoredWorld = z.infer<typeof worldSchema>;
export type StoredBotRecord = z.infer<typeof botRecordSchema>;
export type StoredFeedEntry = z.infer<typeof feedEntrySchema>;
export type StoredRival = z.infer<typeof rivalSchema>;
export type Arena = z.infer<typeof arenaSchema>;
export type Guild = z.infer<typeof guildSchema>;
export type Dungeons = z.infer<typeof dungeonsSchema>;
export type StoredDungeonProgress = z.infer<typeof dungeonProgressSchema>;
export type StoredChatMessage = z.infer<typeof chatMessageSchema>;
export type StoredApplication = z.infer<typeof applicationSchema>;
export type StoredApplicant = z.infer<typeof applicantSchema>;
export type StoredFoundedGuild = z.infer<typeof foundedGuildSchema>;
export type StoredBounty = z.infer<typeof bountyStateSchema>;
export type Grudge = z.infer<typeof grudgeSchema>;
export type LegendsWeek = z.infer<typeof legendsWeekSchema>;
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
    // The world is generated at hero creation: a save with no hero has nothing to simulate
    // around, and no rank for the level-of-detail bands to centre on.
    world: null,
    arena: { ...DEFAULT_ARENA },
    guild: { ...DEFAULT_GUILD },
    dungeons: { ...DEFAULT_DUNGEONS },
    forge: { ...DEFAULT_FORGE },
    gacha: { ...DEFAULT_GACHA },
    pets: { ...DEFAULT_PETS },
    tasks: { ...DEFAULT_TASKS },
    calendar: { ...DEFAULT_CALENDAR },
  };
}

export function isSaveSlot(value: unknown): value is SaveSlot {
  return value === 1 || value === 2 || value === 3;
}
