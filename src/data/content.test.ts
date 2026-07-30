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
import { HILDY_ARENA_LINES, hildySays, type ArenaMoment } from './arenaBarks';
import {
  CHAT_CATEGORIES,
  CHAT_TEMPLATES,
  chatLineAt,
  renderChatLine,
  usableChatLines,
  type ChatSlot,
  type ChatSlots,
} from './guildChat';
import { BOUNTIES, BOUNTY_METRICS, bountyTarget, bountyTitle } from './bounties';
import { GUILD_NAME_MAX, SIGIL_ICONS, validateGuildName } from './guilds';
import { ICON_IDS } from './icons';
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

describe('Hildy at the Proving Grounds', () => {
  const MOMENTS: readonly ArenaMoment[] = [
    'browse',
    'waiting',
    'won',
    'lost',
    'past-cap',
    'milestone',
    'rerolled',
    'broke',
    'raided',
    'revenge',
    'newcomer',
  ];

  it('has something to say at every moment', () => {
    for (const moment of MOMENTS) {
      expect(HILDY_ARENA_LINES[moment], moment).toBeDefined();
      expect(HILDY_ARENA_LINES[moment]!.length, moment).toBeGreaterThan(0);
    }
  });

  it('picks by index rather than rolling — the same tick is the same line', () => {
    for (const moment of MOMENTS) {
      expect(hildySays(moment, 3)).toBe(hildySays(moment, 3));
      const pool = HILDY_ARENA_LINES[moment]!;
      expect(hildySays(moment, pool.length)).toBe(hildySays(moment, 0));
    }
  });

  it('falls back rather than rendering nothing for an unknown moment', () => {
    expect(hildySays('nonsense' as ArenaMoment, 0)).toBe(hildySays('browse', 0));
  });

  it('never puts a number in the player’s ear — the arena is read, not calculated', () => {
    for (const lines of Object.values(HILDY_ARENA_LINES)) {
      for (const line of lines) {
        expect(line, line).not.toMatch(/\d/);
      }
    }
  });
});

describe('guild chat corpus', () => {
  it('carries the volume the content plan asks for', () => {
    // ≥150 lines across the categories (content plan §5). Below that the same joke comes round
    // twice a day and the hall stops sounding like people.
    expect(CHAT_TEMPLATES.length).toBeGreaterThanOrEqual(150);
    expect(new Set(CHAT_TEMPLATES.map((line) => line.id)).size).toBe(CHAT_TEMPLATES.length);
  });

  it('has lines in every category', () => {
    for (const category of CHAT_CATEGORIES) {
      const lines = CHAT_TEMPLATES.filter((line) => line.category === category);
      expect(lines.length, category).toBeGreaterThanOrEqual(6);
    }
  });

  it('declares every placeholder it uses', () => {
    // The whole honesty guarantee: a line that wants {other} must say so, or the generator will
    // happily pick it with nothing to put there and ship a message with a hole in it.
    for (const line of CHAT_TEMPLATES) {
      for (const token of line.text.match(/\{([a-z]+)\}/g) ?? []) {
        const slot = token.slice(1, -1) as ChatSlot;
        expect(line.needs, `${line.id} uses ${token}`).toContain(slot);
      }
    }
  });

  it('never declares a slot it does not use', () => {
    for (const line of CHAT_TEMPLATES) {
      for (const slot of line.needs) {
        expect(line.text, `${line.id} needs ${slot}`).toContain(`{${slot}}`);
      }
    }
  });

  it('leaves no hole once rendered', () => {
    const slots: ChatSlots = {
      hero: 'Kargath',
      other: 'Serathiel the Unbowed',
      guild: 'The Amber Blades',
      level: 42,
      rank: 118,
      count: 7,
      gold: 4_200,
      item: 'Emberforged Maul',
      zone: 'Fogmoor Marsh',
      bounty: 'Complete 120 contracts',
      percent: 64,
    };
    for (const line of CHAT_TEMPLATES) {
      expect(renderChatLine(line, slots), line.id).not.toMatch(/\{[a-z]+\}/);
    }
  });

  it('never states a specific it did not get from a slot', () => {
    // The honesty rule, in the form that is actually checkable. Mood is fine — "Long week, that
    // is all" cannot be false. A *quantity* cannot be: a line that says "six missions" when the
    // speaker ran two is the corpus lying, and the fix is to take the number from a slot so the
    // generator cannot pick the line without one.
    for (const line of CHAT_TEMPLATES) {
      const withoutSlots = line.text.replace(/\{[a-z]+\}/g, '');
      expect(withoutSlots, `${line.id} states a bare number`).not.toMatch(/\d/);
      // "one" is left out on purpose — it is almost always idiomatic here ("nice one", "the
      // lesser one") rather than a count, and banning it would cost more voice than it buys.
      expect(withoutSlots, `${line.id} spells out a quantity`).not.toMatch(
        /\b(two|three|four|five|six|seven|eight|nine|ten|dozen|fortnight)\b/i,
      );
    }
  });

  it('keeps `idle` free of any claim at all', () => {
    // The Crier's `flavour` carve-out, in guild form: colour about the hall, never about a hero.
    const idle = CHAT_TEMPLATES.filter((line) => line.category === 'idle');
    expect(idle.every((line) => line.needs.length === 0)).toBe(true);
  });

  it('always has something usable, even with nothing to say', () => {
    // A hall with no news still has to be able to open its mouth.
    expect(usableChatLines('idle', {}).length).toBeGreaterThan(0);
    expect(usableChatLines('greeting', {}).length).toBeGreaterThan(0);
    expect(usableChatLines('reply', {}).length).toBeGreaterThan(0);
    // And a category that needs a name has nothing to say without one.
    expect(usableChatLines('welcome', {})).toEqual([]);
    expect(usableChatLines('welcome', { hero: 'Kargath' }).length).toBeGreaterThan(0);
  });

  it('keeps a voice in its own mouth', () => {
    const gruff = usableChatLines('greeting', { hero: 'Kargath', guild: 'X' }, 'gruff');
    expect(gruff.every((line) => line.voice === undefined || line.voice === 'gruff')).toBe(true);
  });

  it('picks by index, never rolls', () => {
    const lines = usableChatLines('idle', {});
    expect(chatLineAt(lines, 3)).toBe(chatLineAt(lines, 3));
    expect(chatLineAt(lines, lines.length)).toBe(chatLineAt(lines, 0));
    expect(chatLineAt([], 0)).toBeNull();
  });
});

describe('the weekly bounty pool', () => {
  it('covers every metric it declares', () => {
    for (const metric of BOUNTY_METRICS) {
      expect(BOUNTIES.some((bounty) => bounty.metric === metric), metric).toBe(true);
    }
    expect(new Set(BOUNTIES.map((bounty) => bounty.id)).size).toBe(BOUNTIES.length);
  });

  it('scales with the roster but never below its floor', () => {
    for (const bounty of BOUNTIES) {
      // A guild of five and a guild of twenty-five should both finish a good week.
      expect(bountyTarget(bounty, 1)).toBe(bounty.floor);
      expect(bountyTarget(bounty, 25)).toBeGreaterThan(bountyTarget(bounty, 5));
      expect(bountyTarget(bounty, 5)).toBeGreaterThanOrEqual(bounty.floor);
    }
  });

  it('puts the number on the poster', () => {
    for (const bounty of BOUNTIES) {
      const title = bountyTitle(bounty, bountyTarget(bounty, 12));
      expect(title, bounty.id).not.toContain('{target}');
      expect(title, bounty.id).toMatch(/\d/);
    }
  });
});

describe('founding a hall', () => {
  it('refuses a name one of the sixty already has', () => {
    const taken = validateGuildName('The Amber Blades');
    expect(taken.ok).toBe(false);
    if (taken.ok) return;
    expect(taken.refusal.kind).toBe('taken');
  });

  it('folds case, spacing and curly quotes before comparing', () => {
    // Otherwise "the  amber blades" founds a second one and every line that names a guild
    // becomes ambiguous.
    expect(validateGuildName('the  amber   blades').ok).toBe(false);
    expect(validateGuildName('Serathiels Own').ok).toBe(false);
  });

  it('accepts an original name', () => {
    expect(validateGuildName('The Quiet Kettle').ok).toBe(true);
  });

  it('refuses lengths and characters outside the house style', () => {
    expect(validateGuildName('ab').ok).toBe(false);
    expect(validateGuildName('x'.repeat(GUILD_NAME_MAX + 1)).ok).toBe(false);
    expect(validateGuildName('The <script> Company').ok).toBe(false);
  });

  it('offers sigils the icon family can actually draw', () => {
    for (const sigil of SIGIL_ICONS) {
      expect(ICON_IDS, sigil).toContain(sigil);
    }
  });
});
