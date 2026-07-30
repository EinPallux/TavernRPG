/**
 * Guild standings.
 *
 * The one rule worth testing hard: **honor is the top twenty, not everybody.** Get that wrong
 * and guild rank becomes a headcount, where the winning move is to accept anyone who applies —
 * which is exactly the guild design the spec is trying to avoid.
 */

import { describe, expect, it } from 'vitest';
import { GUILD_COUNT } from '@/data/guilds';
import { generateWorld } from './generate';
import { COUNTED_MEMBERS, guildRoster, guildStandings } from './halls';

const world = generateWorld(20260730, Date.parse('2026-08-01T00:00:00Z'));

describe('guildStandings', () => {
  const standings = guildStandings(world);

  it('ranks every guild', () => {
    expect(standings).toHaveLength(GUILD_COUNT);
    expect(new Set(standings.map((s) => s.guildId)).size).toBe(GUILD_COUNT);
  });

  it('sorts by honor, best first', () => {
    for (let i = 1; i < standings.length; i += 1) {
      expect(standings[i - 1]!.honor).toBeGreaterThanOrEqual(standings[i]!.honor);
    }
  });

  it('counts only the top twenty members', () => {
    const big = standings.find((s) => s.memberCount > COUNTED_MEMBERS);
    expect(big).toBeDefined();
    if (!big) return;

    const all = world.bots.filter((bot) => bot.guildId === big.guildId);
    const total = all.reduce((sum, bot) => sum + bot.honor, 0);
    const top = [...all]
      .sort((a, b) => b.honor - a.honor)
      .slice(0, COUNTED_MEMBERS)
      .reduce((sum, bot) => sum + bot.honor, 0);

    expect(big.honor).toBe(top);
    // The distinction has to actually bite, or the test proves nothing.
    expect(big.honor).toBeLessThan(total);
  });

  it('names a champion by rank, not by honor', () => {
    const withMembers = standings.find((s) => s.memberCount > 0);
    expect(withMembers).toBeDefined();
    if (!withMembers) return;

    expect(withMembers.championId).not.toBeNull();
    expect(world.ladder.indexOf(withMembers.championId!) + 1).toBe(withMembers.bestRank);
  });

  it('is stable for a given world', () => {
    expect(guildStandings(world)).toEqual(standings);
  });
});

describe('guildRoster', () => {
  it('lists members best rank first, capped', () => {
    const roster = guildRoster(world, 0);
    expect(roster.length).toBeLessThanOrEqual(COUNTED_MEMBERS);

    const ranks = roster.map((id) => world.ladder.indexOf(id) + 1);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(roster.every((id) => world.bots[id]?.guildId === 0)).toBe(true);
  });

  it('returns nothing for a guild nobody joined', () => {
    expect(guildRoster(world, 9_999)).toEqual([]);
  });
});
