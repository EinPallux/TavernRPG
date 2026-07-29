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

  it('preserves the player’s world across a two-step upgrade (v1 → v3)', () => {
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
    // Settings are the player's own choices — a migration must never reset them.
    expect(result.save.settings).toEqual({
      navCollapsed: true,
      motion: 'reduced',
      sfxEnabled: true,
      musicEnabled: false,
      volume: 0.4,
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
