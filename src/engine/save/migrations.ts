/**
 * Save migration chain.
 *
 * Every load runs through `migrateSave`: unknown data in, a validated current-version
 * save out — or a precise, human-explainable reason why not. Loading a save written by
 * any previously shipped version must succeed forever (docs/tech/architecture.md §3).
 *
 * Pure module: no DOM, no storage.
 */

import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS, saveFileSchema, type SaveFile } from './schema';

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
