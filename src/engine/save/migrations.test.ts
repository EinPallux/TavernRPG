import { describe, expect, it } from 'vitest';
import { describeFailure, migrateSave, MIGRATIONS, type Migration } from './migrations';
import { CURRENT_SCHEMA_VERSION, createNewSave } from './schema';

const NOW = new Date(2026, 6, 29, 12, 0, 0).getTime();
const validSave = createNewSave({ slot: 1, worldSeed: 4242, now: NOW });

describe('migrateSave — current-version saves', () => {
  it('accepts a freshly created save unchanged', () => {
    const result = migrateSave(structuredClone(validSave));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save).toEqual(validSave);
    expect(result.migratedFrom).toBeNull();
  });

  it('survives a JSON round-trip (what actually happens on export/import)', () => {
    const result = migrateSave(JSON.parse(JSON.stringify(validSave)));
    expect(result.ok).toBe(true);
  });
});

describe('migrateSave — rejections', () => {
  it('rejects non-objects', () => {
    for (const input of [null, undefined, 42, 'save', [validSave]]) {
      const result = migrateSave(input);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.kind).toBe('malformed');
    }
  });

  it('rejects data without a schema version', () => {
    const result = migrateSave({ hero: 'Brenna' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('malformed');
  });

  it('refuses saves from a future version rather than mangling them', () => {
    const result = migrateSave({ ...validSave, schemaVersion: CURRENT_SCHEMA_VERSION + 5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('from_future');
    expect(describeFailure(result.failure)).toMatch(/newer version of the game/);
  });

  it('reports a missing upgrade path instead of guessing', () => {
    const result = migrateSave({ schemaVersion: 0, anything: true }, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('no_migration_path');
  });

  it('reports which field is damaged', () => {
    const damaged = { ...structuredClone(validSave), worldSeed: -12 };
    const result = migrateSave(damaged);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('invalid');
    if (result.failure.kind !== 'invalid') return;
    expect(result.failure.detail).toMatch(/worldSeed/);
  });

  it('rejects a save whose nested state is the wrong shape', () => {
    const damaged = { ...structuredClone(validSave), clock: { lastSeen: 'yesterday' } };
    const result = migrateSave(damaged);
    expect(result.ok).toBe(false);
  });
});

describe('migrateSave — the upgrade chain', () => {
  /**
   * A synthetic pre-release step, prepended to the *real* shipped chain. Testing against the
   * real tail matters: it proves a hypothetical older format still reaches the current schema
   * through every migration we actually ship, not just through a toy one.
   */
  const zeroToOne: Migration = {
    from: 0,
    to: 1,
    describe: 'beta: rename knocks -> doorKnocks',
    migrate: (data) => {
      const { knocks, ...rest } = data as { knocks?: number };
      return {
        ...rest,
        savedAt: NOW,
        slot: 1,
        worldSeed: 4242,
        clock: { lastSeen: NOW, clampCount: 0 },
        skeleton: { doorKnocks: knocks ?? 0, createdAt: NOW, lastKnockAt: null },
      };
    },
  };

  const withRealTail = (head: Migration[]): Migration[] => [...head, ...MIGRATIONS];

  it('upgrades an old save and reports where it came from', () => {
    const result = migrateSave({ schemaVersion: 0, knocks: 7 }, withRealTail([zeroToOne]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.skeleton.doorKnocks).toBe(7);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.migratedFrom).toBe(0);
  });

  it('runs several steps in order', () => {
    const steps: number[] = [];
    const chain = withRealTail([
      { from: -2, to: -1, describe: 'a', migrate: (d) => (steps.push(-2), d) },
      { from: -1, to: 0, describe: 'b', migrate: (d) => (steps.push(-1), d) },
      { from: 0, to: 1, describe: 'c', migrate: (d) => (steps.push(0), zeroToOne.migrate(d)) },
    ]);
    const result = migrateSave({ schemaVersion: -2, knocks: 3 }, chain);
    expect(steps).toEqual([-2, -1, 0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.skeleton.doorKnocks).toBe(3);
  });

  it('still validates the final result, so a broken migration fails loudly', () => {
    const brokenChain = withRealTail([
      { from: 0, to: 1, describe: 'drops required fields', migrate: () => ({}) },
    ]);
    const result = migrateSave({ schemaVersion: 0 }, brokenChain);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('invalid');
  });

  it('reports the version it got stuck at when a step is missing', () => {
    // Nothing knows how to read format 0, so the chain cannot start.
    const result = migrateSave({ schemaVersion: 0 }, MIGRATIONS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('no_migration_path');
    if (result.failure.kind !== 'no_migration_path') return;
    expect(result.failure.stuckAt).toBe(0);
  });
});
