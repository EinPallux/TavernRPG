# Data Models (TypeScript sketch)

> The shared vocabulary for all systems — written as real TS so Phase 3+ lifts these into
> `src/engine/types.ts` / `src/data/` nearly verbatim. Sketch-level: fields may grow, names are
> canon. Zod schemas mirror persisted types 1:1 (validation + migrations).

```ts
// ————— Identity & primitives —————
type ClassId = 'warrior' | 'bard' | 'mage' | 'hunter' | 'swashbuckler';
type AttributeId = 'str' | 'dex' | 'int' | 'con' | 'lck';
type Attributes = Record<AttributeId, number>;
type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'set';
type SlotId = 'weapon' | 'offhand' | 'helmet' | 'chest' | 'gloves' | 'boots' | 'belt'
            | 'amulet' | 'ring' | 'trinket';
type Timestamp = number;            // ms epoch, only GameClock produces "now"
type DayKey = string;               // 'YYYY-MM-DD' local — reset comparisons use this, never hours
type Seed = number;

// ————— Content definitions (src/data, authored) —————
interface ClassDef {
  id: ClassId; name: string; portrait: AssetRef; hpFactor: number; drCap: number;
  proc: ProcDef;                    // block/dodge/flurry/verses/arcane-certainty (discriminated union)
  weaponBases: WeaponBaseDef[]; offhandBases: OffhandBaseDef[];
  startingStats: Attributes; flavor: string;
}
interface ZoneDef { id: string; name: string; levelBand: [number, number];
  backdrops: AssetRef[]; monsterIds: string[]; blurbIds: string[]; }
interface MonsterDef { id: string; name: string; zoneId: string | DungeonRef;
  archetype: 'bruiser'|'skirmisher'|'caster'|'tank'|'swarm';
  proc?: ProcDef;                   // bosses only
  iconId: IconId; artOverride?: AssetRef; flavor: string; }
interface GearSetDef { id: string; classId: ClassId; name: string; theme: string;
  pieces: Record<SetPieceSlot, CuratedStatline>;      // helm/chest/gloves/boots/belt
  bonuses: { 2: SetBonus; 4: SetBonus; 5: SetBonus }; sigilIconId: IconId; }
interface PetDef { id: string; name: string; boost: { stat: AttributeId | 'armor' | 'goldFind' | 'xp';
  baseRate: number }; source: PetSource; iconId: IconId; artOverride?: AssetRef; }
interface BannerDef { id: string; kind: 'daily'|'weekly'|'monthly'; dropTable: DropTable;
  pityRule: PityRule; }
interface DungeonDef { id: string; name: string; gateLevel: number; keyItemId: string;
  floors: [MonsterId × 10]; theme: DungeonTheme; }

// ————— Items (owned instances — always generated, never authored) —————
interface Item {
  uid: string;                      // ulid from owning rng stream
  slot: SlotId; rarity: Rarity; level: number;        // level at generation (pins budget/value)
  classLock?: ClassId;              // weapons/offhands/sets only
  name: string; iconId: IconId;
  attrs: Partial<Attributes>;       // 1–3 lines (epic ALL-stats flag instead)
  allStats?: number;
  weapon?: { min: number; max: number }; armor?: number;
  special?: { goldFind?: number; xp?: number };       // jewelry lines
  setId?: string; setPiece?: SetPieceSlot;
  value: number; scrapYield: MaterialBundle;          // computed at generation
  locked: boolean;
}

// ————— Hero & activity state (persisted) —————
// As built in Phase 2 (src/engine/save/schema.ts). Commented fields are planned for the phase
// noted; each arrives as a new schema version with a migration.
interface Hero {
  name: string; classId: ClassId; level: number; xp: number;
  trained: Attributes;              // points bought with gold (the cost basis for more)
  gold: number; dice: number;
  equipment: Partial<Record<SlotId, Item>>;   // sparse: an empty slot is an absent key
  backpack: (Item | null)[];        // fixed length 15; null = empty cell, so positions are stable
  satchel: Item[];                  // overflow, max 5
  createdAt: Timestamp;
  // materials: MaterialWallet;              // Phase 12 (forge)
  // vigor: { current: number; alesToday: number };  // Phase 5 (missions)
  // (the mount lives on ActivityState, not the hero — it is time-bound, like a shift)
  // activePetId?: string; pets: Record<string, PetState>; // Phase 14
  // trophies: TrophyId[];                   // Phase 11 (dungeons)
}
interface ActivityState {
  mission?: ActiveMission;          // { offerSnapshot, duration, startedAt, endsAt, seed }
  patrol?: PatrolShift;             // { startedAt, endsAt, hours, heroLevel } — see below
  shops: Record<ShopId, ShopStock>; // v7: { day, items[6], sold[], rerollsToday }
  mount?: MountRental;              // v7: { mountId, rentedAt, expiresAt } — clock decides if live
  arena: ArenaState;                // (dungeon progress moved to its own v11 slice)
  forge: ForgeState; gacha: PityState & { history: GachaResult[] };
  board: DailyTasksState; calendar: CalendarState;
  missionsCompleted: number;        // lifetime VICTORIES; a pet source
  zoneMissions: Record<ZoneId, number>;  // v14: per-zone victories; sparse, same units as above
}

// ————— World simulation (persisted as divergence; identity derives from seed) —————
interface BotRecord {               // measured 99 B each — identity is derived, never stored
  id: number;                       // index into seed-derived identity (name/class/personality)
  level: number; xp: number; honor: number; gearScore: number;
  guildId: number;                  // -1 for the unguilded
  dormantUntil: Timestamp;          // 0 when they are around
}                                   // rival heat lives on WorldState.rivals, not per bot
interface WorldState {
  seed: Seed; createdAt: Timestamp; lastSimAt: Timestamp; lastProcessedDay: DayKey;
  bots: BotRecord[]; guilds: GuildState[]; ladder: number[];   // botId order; player sentinel -1
  rivals: RivalLink[]; feed: FeedEntry[];                      // capped 300
}
interface GuildState {              // v8: a hall's divergence. Name/banner/motto derive from id
  id: number; memberIds: number[];  // capped at GUILD_CAPACITY (25)
  treasury: number;                 // v10: buff steps derive from this, never stored beside it
}

// ————— The player's guild (v10) —————
interface Guild {                   // one slice, whichever kind of hall they are in
  guildId: number | null;           // null = unguilded; PLAYER_GUILD_ID (1000) = they founded it
  joinedAt: Timestamp | null;
  application: { guildId: number; appliedAt: Timestamp; decidesAt: Timestamp } | null;
  refusedAt: Record<string, Timestamp>;       // 24h reapply cooldown, per hall
  founded: FoundedGuild | null;     // name, motto, field, charge, sigil — only when they founded
  roster: number[]; officers: number[]; applicants: Applicant[];   // founded halls only
  treasuryStep: number; treasuryPool: number;                      // founded halls only:
  drillmasterStep: number; drillmasterPool: number;                // one of the sixty derives both
  contributions: Record<string, number>;      // this week, keyed by botId or 'player'
  chat: StoredChatMessage[];        // capped 200
  bounty: BountyState | null;       // { weekKey, bountyId, target, playerUnits, botUnits, settled }
  lastApplicantDay: number; lastChatDay: number; lastBountyDay: number;   // high-water marks
}

// ————— Combat (engine I/O — pure) —————
interface Combatant {               // snapshot; built by buildCombatant(hero|bot|monster)
  id: string; label: string; classOrArchetype: string; level: number;
  hp: number; attrs: Attributes; weapon: { min: number; max: number };
  armor: number; drCap: number; procs: ResolvedProc[];         // class + set + offhand, uniform
  portrait: AssetRef;
}
type BattleEvent =
  | { t: 'battle_start'; a: CombatantCard; b: CombatantCard; verse?: VerseId }
  | { t: 'round_start'; n: number }
  | { t: 'verse_change'; verse: VerseId }
  | { t: 'attack'; source: 'a'|'b'; raw: number; final: number; crit: boolean; followUp?: boolean }
  | { t: 'blocked' | 'dodged'; target: 'a'|'b' }
  | { t: 'damage'; target: 'a'|'b'; amount: number; hpAfter: number }
  | { t: 'ko'; target: 'a'|'b' }
  | { t: 'battle_end'; winner: 'a'|'b'; rounds: number; mvpStat: string };
interface BattleResult { winnerId: string; rounds: number; log: BattleEvent[];
  hpTimeline: [number, number][]; }

// ————— Save envelope —————
interface SaveFile {
  schemaVersion: 15; savedAt: Timestamp; slot: 1|2|3;
  worldSeed: Seed;                  // committed once; seeds the entire simulated world
  clock: { lastSeen: Timestamp; clampCount: number };
  settings: Settings;               // nav, motion, audio, battle playback (v4)
  hero: Hero | null;                // null routes the player to creation
  activity: ActivityState;          // v5–v7: missions, patrol, shops, mount, arena
  world: WorldState | null;         // v8: raised on first entry, null until then
  guild: Guild;                     // v10
  dungeons: Dungeons;               // v11
  forge: ForgeState;                // v12
  gacha: GachaState;                // v13
  pets: Pets;                       // v14
  tasks: Tasks;                     // v15
  calendar: Calendar;               // v15
}

// ————— The Undertavern (v11) —————
interface Dungeons {
  keys: string[];                   // one-time unlocks; the door then stays open
  trophies: string[];               // cleared-dungeon crests, shown on the profile
  progress: Record<DungeonId, DungeonProgress>;   // absent = never entered
}
interface DungeonProgress {
  floorsCleared: number;            // 0–10
  cooldownUntil: Timestamp;         // 30 min after a loss; a win clears it outright
  bestAttempts: number[];           // fixed 10; share 0–1 of the floor monster's health taken off
  attempts: number;                 // seeds each descent, so the next one is a different fight
  clearedAt: Timestamp | null;
}

// ————— The Emberforge (v12) —————
interface MaterialBundle { scrap: number; essence: number; starmetal: number; }
interface ForgeState {
  scrapsUsedToday: number;          // 0–10; the Reset Engine clears it, nothing here reads a date
  emberMeter: number;               // 0–5; only Master forges bank one, 5 → next is a sure Epic
  recipes: string[];                // set ids the player holds a pattern for
  crafted: number;                  // monotonic; seeds each strike, like the dungeon attempt count
}
// On the Hero, not here, for the same reason gold is — they are the player's, not the room's:
//   materials: MaterialBundle;
//   openingVerse: VerseId | null;   // honoured only while a Maestro five-piece is worn

// ————— Fortune's Table (v13) —————
interface GachaState {
  weeklyPity: number;               // counts toward the *set*, not the week
  weeklyPitySet: SetId | null;      // which set those rolls belong to
  monthlyRolls: number;             // the track's rungs are floor(rolls/15), never stored
  monthlyPaidThrough: number;       // high-water mark in ROLLS, so a rung cannot pay twice
  shards: number;                   // from duplicate set pieces; 5 = a recipe
  freeRollsToday: number;           // the Daily Draw's free card; cleared by the Reset Engine
  rolls: number;                    // lifetime
  pets: PetId[];                    // ONLY Vesna's grants — see below
  history: RollRecord[];            // newest first, capped at 200
}
interface RollRecord { at: Timestamp; bannerId: BannerId; outcome: RollOutcome;
  label: string; pitied: boolean; free: boolean; }
// The banner *schedule* is deliberately absent: it is a pure function of (dayKey, worldSeed,
// classId), so a save that missed a fortnight already knows what was featured on every day of it.
// `pets` records what this room handed over, not what the player owns — see Pets below.

// ————— The Menagerie (v14) —————
interface Pets {
  progress: Record<PetId, PetProgress>;  // SPARSE: a pet never fed stores nothing at all
  activeId: PetId | null;                // one at a time; free to switch, no cooldown
  scraps: number;                        // Tavern Scraps, the feeding currency
  eggs: PetId[];                         // hatched — the ONE stored grant, see below
  seenCount: number;                     // owned-count high-water mark, for the rail's badge
}
interface PetProgress { level: number; rarity: PetRarity; fedToday: number; }
// There is NO "owned" field, here or anywhere. `ownedPets(save)` derives all twelve from the
// facts that earned them — dungeons.progress[id].floorsCleared, activity.missionsCompleted,
// activity.zoneMissions[zoneId] (v14, victories only), arena.bestRank. Every one of those was
// already in the save before this slice existed, which is why a Phase 11 player owns their
// dungeon pets retroactively with no migration and no reconciliation pass.
//
// The two exceptions are the luck-based pets, and they are stored *because* they are luck: a
// 0.5% egg and Vesna's 1% slot have nothing else in the save to be read back from. Those live in
// `pets.eggs` and `gacha.pets`, beside the systems that produce them.
//
// The boost lands in one of two places, never both — attributes and armour go through
// deriveStats(); goldFind and xpBonus become a PayoutBonus composed with the guild's.

// ————— The Notice Board and the ledger (v15) —————
type ProgressTally = Partial<Record<ProgressMetric, number>>;   // sparse
interface Tasks {
  taskIds: string[];                // the day's three, as ids; definitions are looked up
  drawnFor: DayKey | null;          // a mismatch redraws lazily on next read
  today: ProgressTally;             // cleared by the reset walk, never by a screen
  lifetime: ProgressTally;          // feeds the draw's neglect weighting
  lastChestDay: DayKey | null;      // high-water mark #7 — a chest pays once
  lastWeeklyChestWeek: DayKey | null;  // #8, same rule at a coarser boundary
  claimsThisWeek: number; claimsWeek: DayKey | null;   // the ladder's seven rungs
  totalChests: number;              // lifetime; thirty earn the Coin Toad
}
interface Calendar {
  day: number;                      // 0–28, a COUNT OF DAYS ATTENDED — not a streak
  lastStampedDay: DayKey | null;    // one stamp per day, compared not incremented
  cyclesCompleted: number;          // the first closed cycle earns the Moss Tortoise
}
// `today` is the one thing in the daily loop that must be *stored* rather than derived: a task
// asks what you did today, and a lifetime total cannot answer that without a snapshot to diff
// against — which is the same storage wearing a cleverer name.
//
// `Calendar` has no streak field, which is how "missing a day pauses rather than resets" is
// implemented: there is nothing here an absence could reduce, so there is no branch to get wrong.
//
// `ProgressMetric` is the single vocabulary in data/progress.ts. BountyMetric is a subset of it,
// and the daily tasks narrow the same union from the other end — neither owns it.

// ————— Gear sets (content, v12) —————
// A set *bonus* is data the engine folds, not a proc: `SetEffect` is a flat union of ~24 named
// levers ('damage' | 'reflect' | 'counter' | 'shred' | 'choose-verse' | …), `modifiersFor()`
// folds every active one into a single CombatModifiers bag, and `fight()` reads that bag at the
// dozen points it matters. Thirty bonuses would otherwise be thirty branches in the resolver.
interface SetEffectBearingBonus { pieces: 2|4|5; text: string; effects: SetEffect[]; }
interface SetProgress {             // derived from the hero, never stored
  definition: GearSetDef;
  owned: Set<SetPieceSlot>;         // anywhere — worn, bagged or in the satchel
  equipped: Set<SetPieceSlot>;      // what the bonuses actually count
  complete: boolean;
}
```

## Conventions

1. **Persisted types are Zod-first** (`schema.parse` on load); ephemeral UI state is never in `SaveFile`.
2. **Content defs are `as const satisfies XDef[]`** modules — typo = type error at build.
3. **All randomness parameters live in defs/config**, never inline in logic (tunability).
4. **`AssetRef`/`IconId`** resolve through the asset manifest (`asset-pipeline.md`) — components
   never hardcode paths, enabling the later per-item art swap.
5. Derived values (combatant stats, set progress, ladder rank) are **computed, never stored**,
   except where snapshotting is the mechanic (mission seeds, arena draws, item statlines).
