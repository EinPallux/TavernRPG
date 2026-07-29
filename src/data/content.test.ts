/**
 * Content integrity.
 *
 * "Content is data" only pays off if the data is trustworthy. A zone with no monsters, a monster
 * pointing at a zone that was renamed, or a backdrop path with a typo would each surface as a
 * blank mission card or a crash at accept — bugs that no amount of engine testing catches,
 * because the engine is working perfectly on bad input.
 */

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARCHETYPES_BY_ID } from './monsterArchetypes';
import { MISSION_BLURBS, blurbsForDuration, renderBlurb } from './missionBlurbs';
import { MONSTERS, monstersInZone } from './monsters';
import { MIN_ZONE_CHOICES, ZONES, ZONES_BY_ID, backdropFor, zonesForLevel } from './zones';

describe('zones', () => {
  it('has unique ids', () => {
    const ids = ZONES.map((zone) => zone.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares sane, ascending level bands', () => {
    for (const zone of ZONES) {
      expect(zone.minLevel, zone.id).toBeGreaterThanOrEqual(1);
      expect(zone.maxLevel, zone.id).toBeGreaterThan(zone.minLevel);
    }

    // Ordered by entry level, so "the next zone" means something.
    const entries = ZONES.map((zone) => zone.minLevel);
    expect([...entries].sort((a, b) => a - b)).toEqual(entries);
  });

  it('covers every level from 1 upward with no gaps', () => {
    // A level with no zone is a player with no missions.
    for (let level = 1; level <= 120; level += 1) {
      expect(zonesForLevel(level).length, `level ${level}`).toBeGreaterThan(0);
    }
  });

  it('always offers enough zones for a board to span two of them', () => {
    // The bands only overlap for part of the ladder, so this leans on the neighbour top-up.
    for (let level = 1; level <= 120; level += 1) {
      expect(zonesForLevel(level).length, `level ${level}`).toBeGreaterThanOrEqual(
        MIN_ZONE_CHOICES,
      );
    }
  });

  it('offers the neighbours, not the whole world', () => {
    // A level-50 hero belongs in Ember Caves; they should not be sent to the starter woods.
    const ids = zonesForLevel(50).map((zone) => zone.id);
    expect(ids).toContain('ember-caves');
    expect(ids).not.toContain('whispering-woods');
    expect(ids.length).toBeLessThanOrEqual(3);
  });

  it('keeps a zone on the board for a while after you outgrow it', () => {
    // Levelling out of a place should not make it vanish overnight.
    expect(zonesForLevel(9).map((zone) => zone.id)).toContain('whispering-woods');
  });

  it('points at backdrops that actually exist on disk', () => {
    for (const zone of ZONES) {
      expect(zone.backdrops.length, zone.id).toBeGreaterThan(0);
      for (const path of zone.backdrops) {
        expect(existsSync(`public${path}`), `${zone.id}: ${path}`).toBe(true);
      }
    }
  });

  it('picks a stable backdrop for a given index, and wraps', () => {
    const road = ZONES_BY_ID['old-kings-road'];
    expect(backdropFor(road, 0)).toBe(road.backdrops[0]);
    expect(backdropFor(road, 1)).toBe(road.backdrops[1]);
    expect(backdropFor(road, 2)).toBe(road.backdrops[0]);
    // Negative indices must not produce undefined.
    expect(backdropFor(road, -3)).toBe(road.backdrops[1]);
  });

  it('keeps working past the end of the ladder — there is no level cap', () => {
    // The last band is open-ended, so a level-999 hero is still in it, with the chapel next door.
    const ids = zonesForLevel(999).map((zone) => zone.id);
    expect(ids).toContain('frostfell-ridge');
    expect(ids).toContain('sunken-chapel');
  });
});

describe('monsters', () => {
  it('has unique ids', () => {
    const ids = MONSTERS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique names — two identical nameplates read as a bug', () => {
    const names = MONSTERS.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('references only real zones and real archetypes', () => {
    for (const entry of MONSTERS) {
      expect(ZONES_BY_ID[entry.zoneId], `${entry.id} zone`).toBeDefined();
      expect(ARCHETYPES_BY_ID[entry.archetypeId], `${entry.id} archetype`).toBeDefined();
    }
  });

  it('gives every zone a populated roster', () => {
    for (const zone of ZONES) {
      expect(monstersInZone(zone.id).length, zone.id).toBeGreaterThanOrEqual(5);
    }
  });

  it('carries the full roster through the bands this phase ships (levels 1–36)', () => {
    // content-plan §2 targets ~9–10 per zone; the later zones fill in the content pass.
    for (const id of [
      'whispering-woods',
      'millers-fields',
      'old-kings-road',
      'fogmoor-marsh',
      'thornhill-ruins',
    ] as const) {
      expect(monstersInZone(id).length, id).toBeGreaterThanOrEqual(9);
    }
  });

  it('offers a spread of archetypes in every zone, so fights are not all the same shape', () => {
    for (const zone of ZONES) {
      const archetypes = new Set(monstersInZone(zone.id).map((entry) => entry.archetypeId));
      expect(archetypes.size, zone.id).toBeGreaterThanOrEqual(4);
    }
  });

  it('gives every monster a line of flavour', () => {
    for (const entry of MONSTERS) {
      expect(entry.flavor.length, entry.id).toBeGreaterThan(10);
    }
  });
});

describe('mission blurbs', () => {
  it('has unique ids', () => {
    const ids = MISSION_BLURBS.map((blurb) => blurb.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only uses placeholders the renderer knows about', () => {
    for (const blurb of MISSION_BLURBS) {
      const placeholders = blurb.text.match(/\{[a-z]+\}/g) ?? [];
      for (const token of placeholders) {
        expect(['{monster}', '{zone}'], blurb.id).toContain(token);
      }
    }
  });

  it('leaves no placeholder unfilled after rendering', () => {
    for (const blurb of MISSION_BLURBS) {
      const rendered = renderBlurb(blurb.text, { monster: 'Sootback Boar', zone: 'the Woods' });
      expect(rendered, blurb.id).not.toMatch(/\{(monster|zone)\}/);
    }
  });

  it('always has something to say, at every duration', () => {
    for (const minutes of [5, 10, 15, 20]) {
      expect(blurbsForDuration(minutes).length, `${minutes}m`).toBeGreaterThan(0);
    }
    // Short missions must not draw the "you will not be home before dark" lines.
    expect(blurbsForDuration(5).some((blurb) => blurb.minMinutes)).toBe(false);
    expect(blurbsForDuration(20).length).toBeGreaterThan(blurbsForDuration(5).length);
  });
});
