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
  // mount?: { tier: 1|2|3|4; expiresAt: Timestamp }; // Phase 7 (stables)
  // activePetId?: string; pets: Record<string, PetState>; // Phase 14
  // trophies: TrophyId[];                   // Phase 11 (dungeons)
}
interface ActivityState {
  mission?: ActiveMission;          // { offerSnapshot, duration, startedAt, endsAt, seed }
  patrol?: PatrolShift;             // { startedAt, endsAt, hours, heroLevel } — see below
  arena: ArenaState; dungeons: Record<string, DungeonProgress>;
  forge: ForgeState; gacha: PityState & { history: GachaResult[] };
  board: DailyTasksState; calendar: CalendarState;
}

// ————— World simulation (persisted as divergence; identity derives from seed) —————
interface BotRecord {               // ≤ ~200B hot state each
  id: number;                       // index into seed-derived identity (name/class/personality)
  level: number; xp: number; honor: number; gearScore: number;
  guildId?: number; dormantUntil?: Timestamp; rivalHeat?: number;
}
interface WorldState {
  seed: Seed; createdAt: Timestamp; lastSimAt: Timestamp; lastProcessedDay: DayKey;
  bots: BotRecord[]; guilds: GuildState[]; ladder: number[];   // botId order; player sentinel -1
  rivals: RivalLink[]; feed: FeedEntry[];                      // capped 300
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
// Schema v3 as shipped; `activity` and `world` join in Phases 5 and 8.
interface SaveFile {
  schemaVersion: 4; savedAt: Timestamp; slot: 1|2|3;
  worldSeed: Seed;                  // committed once; seeds the entire simulated world
  clock: { lastSeen: Timestamp; clampCount: number };
  settings: Settings;               // nav, motion, audio, battle playback (v4)
  hero: Hero | null;                // null routes the player to creation
  // activity: ActivityState;       // Phase 5
  // world: WorldState;             // Phase 8
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
