/**
 * Save migration chain.
 *
 * Every load runs through `migrateSave`: unknown data in, a validated current-version
 * save out — or a precise, human-explainable reason why not. Loading a save written by
 * any previously shipped version must succeed forever (docs/tech/architecture.md §3).
 *
 * Pure module: no DOM, no storage.
 */

import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_ACTIVITY,
  DEFAULT_ARENA,
  DEFAULT_DUNGEONS,
  DEFAULT_FORGE,
  DEFAULT_GUILD,
  DEFAULT_SETTINGS,
  EMPTY_MATERIALS,
  saveFileSchema,
  type SaveFile,
} from './schema';

export interface Migration {
  /** Schema version this migration reads. */
  readonly from: number;
  /** Schema version it produces (always `from + 1` in practice). */
  readonly to: number;
  /** Short description, surfaced in logs and the corrupted-save triage screen. */
  readonly describe: string;
  migrate(data: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Shipped migrations, ordered oldest first.
 *
 * Every entry here is load-bearing forever: a save written by any released build must still
 * open. Never edit a shipped migration to "fix" it — add the next one.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    from: 1,
    to: 2,
    describe: 'Phase 1: add player settings (nav, motion, audio)',
    migrate: (data) => ({ ...data, settings: { ...DEFAULT_SETTINGS } }),
  },
  {
    from: 2,
    to: 3,
    describe: 'Phase 2: replace the walking-skeleton payload with the hero slice',
    migrate: (data) => {
      // `skeleton` was always explicitly temporary (Phase 0's door-knock counter). Dropping it
      // loses nothing a player would recognise as progress; the world seed, settings and clock
      // — everything that identifies their save — carry over untouched.
      const { skeleton: _skeleton, ...rest } = data as { skeleton?: unknown };
      return { ...rest, hero: null };
    },
  },
  {
    from: 3,
    to: 4,
    describe: 'Phase 4: remember battle playback speed and skip preference',
    migrate: (data) => {
      // Additive: only the two new keys are filled in. Everything the player already chose
      // in settings is carried through untouched.
      const settings = (data['settings'] ?? {}) as Record<string, unknown>;
      return {
        ...data,
        settings: {
          ...settings,
          battleSpeed: DEFAULT_SETTINGS.battleSpeed,
          battleSkipDefault: DEFAULT_SETTINGS.battleSkipDefault,
        },
      };
    },
  },
  {
    from: 4,
    to: 5,
    describe: 'Phase 5: add the activity slice (Vigor, mission board, active mission)',
    migrate: (data) => {
      // Purely additive. An existing hero wakes up with a full day of Vigor and an empty
      // board, which redraws on first read — exactly what they would get after a reset.
      return { ...data, activity: { ...DEFAULT_ACTIVITY } };
    },
  },
  {
    from: 5,
    to: 6,
    describe: 'Phase 6: add the City Watch patrol shift',
    migrate: (data) => {
      // Additive, and additive *inside* the activity slice — everything the player has in
      // flight (their board, a running mission, their Vigor) carries through untouched.
      const activity = (data['activity'] ?? { ...DEFAULT_ACTIVITY }) as Record<string, unknown>;
      return { ...data, activity: { ...activity, patrol: null, patrolsCompleted: 0 } };
    },
  },
  {
    from: 6,
    to: 7,
    describe: 'Phase 7: add shop shelves and the mount stall',
    migrate: (data) => {
      // Additive again. An empty `shops` map is exactly what a player sees the morning after a
      // restock — the shelves draw lazily on first visit — so nobody arrives to a broken shop.
      const activity = (data['activity'] ?? { ...DEFAULT_ACTIVITY }) as Record<string, unknown>;
      return { ...data, activity: { ...activity, shops: {}, mount: null } };
    },
  },
  {
    from: 7,
    to: 8,
    describe: 'Phase 8: add the simulated world (1,500 heroes, guilds, ladder, feed)',
    migrate: (data) => {
      // Null rather than generated. Generating here would need a clock this pure function does
      // not have, and the load path already knows how to raise a world for a hero who has none
      // — which is exactly what an existing player is.
      return { ...data, world: null };
    },
  },
  {
    from: 8,
    to: 9,
    describe: 'Phase 9: the player joins the ladder — honor, arena state, weekly payout',
    migrate: (data) => {
      // Honor starts at zero and the load path seats the hero at the foot of the ladder, the
      // same way it does for a brand-new world. An existing player is a newcomer to the arena
      // even if they are not a newcomer to the game.
      const hero = data['hero'] as Record<string, unknown> | null;
      return {
        ...data,
        ...(hero ? { hero: { ...hero, honor: 0 } } : {}),
        arena: { ...DEFAULT_ARENA },
      };
    },
  },
  {
    from: 9,
    to: 10,
    describe: 'Phase 10: the Guild Hall — membership, the two tracks, chat and the bounty',
    migrate: (data) => {
      // Purely additive: an existing player is simply unguilded, which is the same state a new
      // hero starts in. Nothing about their hero, world or arena changes, and the sixty halls
      // they can now apply to were already in the world slice — they just had no door until now.
      return { ...data, guild: { ...DEFAULT_GUILD } };
    },
  },
  {
    from: 10,
    to: 11,
    describe: 'Phase 11: the Undertavern — dungeon progress, keys and trophies',
    migrate: (data) => {
      // Purely additive, and deliberately empty rather than generous: an existing player has no
      // keys, so the doors are shut until a mission turns one up. Granting the Rusty Key here
      // would hand every returning player the one drop the whole unlock is built around.
      return { ...data, dungeons: { ...DEFAULT_DUNGEONS } };
    },
  },
  {
    from: 11,
    to: 12,
    describe: 'Phase 12: gear sets and the Emberforge — materials, the forge, set recipes',
    migrate: (data) => {
      /*
       * The hero gains a purse and a Verse preference; the save gains the forge.
       *
       * Materials start empty even though the player has almost certainly scrapped things
       * already — Phase 7's disposal quoted the yield and then threw it away, because there was
       * nowhere to put it. Back-paying a stockpile nobody earned would hand a returning player a
       * Master forge on their first visit, which is exactly the moment the room is meant to be
       * introducing itself.
       */
      const hero = data['hero'] as Record<string, unknown> | null;
      return {
        ...data,
        ...(hero ? { hero: { ...hero, materials: { ...EMPTY_MATERIALS }, openingVerse: null } } : {}),
        forge: { ...DEFAULT_FORGE },
      };
    },
  },
];

export type MigrationFailure =
  | { readonly kind: 'malformed'; readonly detail: string }
  | { readonly kind: 'from_future'; readonly saveVersion: number; readonly supported: number }
  | { readonly kind: 'no_migration_path'; readonly stuckAt: number }
  | { readonly kind: 'invalid'; readonly detail: string };

export type MigrationResult =
  | { readonly ok: true; readonly save: SaveFile; readonly migratedFrom: number | null }
  | { readonly ok: false; readonly failure: MigrationFailure };

/** Player-facing explanation for a failed load. No error codes in the UI. */
export function describeFailure(failure: MigrationFailure): string {
  switch (failure.kind) {
    case 'malformed':
      return "This file doesn't look like a TavernRPG save.";
    case 'from_future':
      return `This save was written by a newer version of the game (format ${failure.saveVersion}; this build understands up to ${failure.supported}). Update the game and try again.`;
    case 'no_migration_path':
      return `This save uses an old format (${failure.stuckAt}) that this build can no longer upgrade.`;
    case 'invalid':
      return 'This save is damaged and could not be read.';
  }
}

function readVersion(data: Record<string, unknown>): number | null {
  const version = data['schemaVersion'];
  return typeof version === 'number' && Number.isInteger(version) ? version : null;
}

/**
 * Upgrade arbitrary parsed JSON to the current save format.
 * `chain` is injectable so tests can exercise multi-step upgrades.
 */
export function migrateSave(
  raw: unknown,
  chain: readonly Migration[] = MIGRATIONS,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): MigrationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      failure: {
        kind: 'malformed',
        detail: `expected an object, got ${raw === null ? 'null' : typeof raw}`,
      },
    };
  }

  let data = { ...(raw as Record<string, unknown>) };
  const startVersion = readVersion(data);

  if (startVersion === null) {
    return {
      ok: false,
      failure: { kind: 'malformed', detail: 'missing or non-integer schemaVersion' },
    };
  }
  if (startVersion > targetVersion) {
    return {
      ok: false,
      failure: { kind: 'from_future', saveVersion: startVersion, supported: targetVersion },
    };
  }

  let version = startVersion;
  while (version < targetVersion) {
    const step = chain.find((migration) => migration.from === version);
    if (!step) {
      return { ok: false, failure: { kind: 'no_migration_path', stuckAt: version } };
    }
    data = step.migrate(data);
    data['schemaVersion'] = step.to;
    version = step.to;
  }

  const parsed = saveFileSchema.safeParse(data);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const where = issue?.path.join('.') || '(root)';
    return {
      ok: false,
      failure: { kind: 'invalid', detail: `${where}: ${issue?.message ?? 'unknown problem'}` },
    };
  }

  return {
    ok: true,
    save: parsed.data,
    migratedFrom: startVersion === targetVersion ? null : startVersion,
  };
}
