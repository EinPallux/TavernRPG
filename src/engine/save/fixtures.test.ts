/**
 * Historical save fixtures.
 *
 * One real save file per shipped schema version, captured from an actual build. These are the
 * regression net behind "saves are sacred": if a migration ever stops opening a released
 * format, this test fails instead of a player's save.
 *
 * When bumping the schema: add a fixture for the *previous* version here, never edit an old one.
 */

import { describe, expect, it } from 'vitest';
import v1Phase0 from './fixtures/v1-phase0.json';
import v2Phase1 from './fixtures/v2-phase1.json';
import v3Phase3 from './fixtures/v3-phase3.json';
import { migrateSave } from './migrations';
import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS } from './schema';

describe('save fixtures — every shipped version still loads', () => {
  it('opens a Phase 0 (v1) save and upgrades it to the current format', () => {
    const result = migrateSave(structuredClone(v1Phase0));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(1);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('preserves the player’s world across every upgrade step (v1 → current)', () => {
    const result = migrateSave(structuredClone(v1Phase0));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The things a player would notice if we got this wrong.
    expect(result.save.worldSeed).toBe(3863720897);
    expect(result.save.clock.lastSeen).toBe(1785062400000);
    expect(result.save.slot).toBe(1);
    // Their world survives; they simply have no hero yet, so creation opens.
    expect(result.save.hero).toBeNull();
  });

  it('fills newly added settings with defaults rather than leaving them undefined', () => {
    const result = migrateSave(structuredClone(v1Phase0));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('opens a Phase 1 (v2) save and keeps the settings the player chose', () => {
    const result = migrateSave(structuredClone(v2Phase1));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(2);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // Settings are the player's own choices — a migration must never reset them. Keys added
    // by later versions arrive at their defaults.
    expect(result.save.settings).toEqual({
      navCollapsed: true,
      motion: 'reduced',
      sfxEnabled: true,
      musicEnabled: false,
      volume: 0.4,
      battleSpeed: DEFAULT_SETTINGS.battleSpeed,
      battleSkipDefault: DEFAULT_SETTINGS.battleSkipDefault,
    });
    expect(result.save.worldSeed).toBe(208181039);
    expect(result.save.slot).toBe(2);
    expect(result.save.clock.clampCount).toBe(1);
    expect(result.save.hero).toBeNull();
  });

  it('drops the retired walking-skeleton payload', () => {
    const result = migrateSave(structuredClone(v2Phase1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save).not.toHaveProperty('skeleton');
  });

  it('opens a Phase 3 (v3) save with a geared hero intact', () => {
    const result = migrateSave(structuredClone(v3Phase3));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(3);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // A hero is the thing a player would most notice losing.
    const hero = result.save.hero;
    expect(hero).not.toBeNull();
    expect(hero?.name).toBe('Wren Ashdown');
    expect(hero?.classId).toBe('hunter');
    expect(hero?.level).toBe(12);
    expect(hero?.trained).toEqual({ str: 0, dex: 14, int: 0, con: 5, lck: 0 });
    // Four equipped pieces and the spare in the bags.
    expect(Object.keys(hero?.equipment ?? {}).sort()).toEqual([
      'amulet',
      'chest',
      'helmet',
      'weapon',
    ]);
    expect(hero?.backpack.filter(Boolean)).toHaveLength(1);
  });

  it('adds the Phase 4 battle preferences without touching the rest of settings', () => {
    const result = migrateSave(structuredClone(v3Phase3));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.settings).toEqual({
      navCollapsed: false,
      motion: 'full',
      sfxEnabled: false,
      musicEnabled: true,
      volume: 0.85,
      battleSpeed: 1,
      battleSkipDefault: false,
    });
  });

  it('is idempotent — re-migrating an already-current save changes nothing', () => {
    const once = migrateSave(structuredClone(v1Phase0));
    expect(once.ok).toBe(true);
    if (!once.ok) return;

    const twice = migrateSave(structuredClone(once.save));
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;

    expect(twice.save).toEqual(once.save);
    expect(twice.migratedFrom).toBeNull();
  });
});
