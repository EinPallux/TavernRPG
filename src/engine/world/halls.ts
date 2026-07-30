/**
 * Guild standings for the Hall of Fame (arena spec §2).
 *
 * A guild's honor is the **sum of its top twenty members**, not all of them. The distinction is
 * the whole ranking: totalling every member would make guild rank a recruitment-count contest,
 * where the winning strategy is to accept anybody with a pulse. Twenty is small enough that a
 * tight guild of committed players beats a sprawling one, and large enough that a single carry
 * cannot hold a hall up on their own.
 *
 * Pure module.
 */

import { GUILDS } from '@/data/guilds';
import type { WorldState } from './generate';

/** `[TUNE]` arena spec §2 — members counted toward a guild's honor. */
export const COUNTED_MEMBERS = 20;

export interface GuildStanding {
  readonly guildId: number;
  readonly name: string;
  readonly motto: string;
  /** Sum of the top `COUNTED_MEMBERS` members' honor. */
  readonly honor: number;
  readonly memberCount: number;
  /** Best member's bot id, for the "led by" line. */
  readonly championId: number | null;
  /** Their best member's ladder rank, 0 if the guild is empty. */
  readonly bestRank: number;
}

/**
 * Every guild, best first.
 *
 * One pass over the bots rather than sixty filters: at 1,500 heroes the difference is invisible,
 * but this runs on every Hall of Fame open and the tab is supposed to appear instantly.
 */
export function guildStandings(world: WorldState): GuildStanding[] {
  const members = new Map<number, number[]>();
  for (const bot of world.bots) {
    if (bot.guildId < 0) continue;
    const list = members.get(bot.guildId);
    if (list) list.push(bot.id);
    else members.set(bot.guildId, [bot.id]);
  }

  const rankOf = new Map<number, number>();
  world.ladder.forEach((id, index) => rankOf.set(id, index + 1));

  const standings = GUILDS.map((hall): GuildStanding => {
    const ids = members.get(hall.id) ?? [];
    const sorted = [...ids].sort(
      (a, b) => (world.bots[b]?.honor ?? 0) - (world.bots[a]?.honor ?? 0),
    );
    const counted = sorted.slice(0, COUNTED_MEMBERS);

    let honor = 0;
    for (const id of counted) honor += world.bots[id]?.honor ?? 0;

    // Best *rank*, which is not always the highest honor — the ladder and honor drift apart
    // between fights, and rank is what the player recognises.
    let championId: number | null = null;
    let bestRank = 0;
    for (const id of ids) {
      const rank = rankOf.get(id) ?? 0;
      if (rank > 0 && (bestRank === 0 || rank < bestRank)) {
        bestRank = rank;
        championId = id;
      }
    }

    return {
      guildId: hall.id,
      name: hall.name,
      motto: hall.motto,
      honor,
      memberCount: ids.length,
      championId,
      bestRank,
    };
  });

  return standings.sort((a, b) => b.honor - a.honor || a.guildId - b.guildId);
}

/** A guild's members, best rank first. Used by the guild row's expanded roster. */
export function guildRoster(world: WorldState, guildId: number, limit = COUNTED_MEMBERS): number[] {
  const rankOf = new Map<number, number>();
  world.ladder.forEach((id, index) => rankOf.set(id, index + 1));

  return world.bots
    .filter((bot) => bot.guildId === guildId)
    .map((bot) => bot.id)
    .sort((a, b) => (rankOf.get(a) ?? Infinity) - (rankOf.get(b) ?? Infinity))
    .slice(0, limit);
}
