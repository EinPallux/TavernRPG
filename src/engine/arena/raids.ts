/**
 * Bot attacks on the player, and the revenge they earn (arena spec §1 step 6, §3).
 *
 * The ladder is supposed to cut both ways. If the player can only ever be the attacker, the
 * ladder is a climbing wall; if bots come for their rank while they sleep, it is a place they
 * live. This module schedules those attacks during offline reconciliation and turns the losses
 * into revenge chips.
 *
 * The number that matters is the **cap**. One or two attacks a day makes a morning eventful;
 * twelve makes it punishing, and a player who logs in to find they have been knocked down forty
 * ranks by people they never met stops opening the game. Frequency scales with rivalry heat
 * because being hunted by someone you know is a story, and being hunted by strangers is weather.
 *
 * Pure module.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import type { Hero, Grudge } from '@/engine/save/schema';
import type { WorldState } from '@/engine/world/generate';
import { PLAYER_LADDER_ID, attackersOf } from '@/engine/world/ladder';
import type { Rival } from '@/engine/world/rivals';
import { attackPressure } from '@/engine/world/rivals';
import { resolveBotAttack } from './duel';
import type { PetContribution } from '@/engine/combat/combatant';

const DAY = 86_400_000;

/** Attacks a day, before rivalry heat (arena spec §3). */
export const BASE_RAIDS_PER_DAY = 1;
/** Hard ceiling per day, however hot the rivalries are. */
export const MAX_RAIDS_PER_DAY = 2;
/** Most grudges kept; older ones fall off rather than becoming a chore list. */
export const REVENGE_QUEUE_CAP = 5;

/** Most days of attacks replayed in one catch-up, however long the absence. */
export const MAX_RAID_CATCHUP_DAYS = 14;

export interface RaidResult {
  readonly ladder: readonly number[];
  readonly heroHonor: number;
  /** Honor to write back, by bot id. */
  readonly botHonor: ReadonlyMap<number, number>;
  /** Newest first. Only losses earn a chip, but wins are still reported. */
  readonly grudges: readonly Grudge[];
  /** Net ranks moved by the raids. Negative means the player slipped. */
  readonly ranksLost: number;
  /** Highest day index rolled, to be stored so the same day never rolls twice. */
  readonly lastRaidDay: number;
}

export interface RaidOptions {
  readonly hero: Hero;
  readonly world: WorldState;
  readonly rivals: readonly Rival[];
  /** Start of the window being reconciled. */
  readonly from: number;
  readonly to: number;
  /** Last day index already rolled. 0 on a save that has never seen a raid. */
  readonly lastRaidDay: number;
  /** The pet was home when they came knocking (pets spec §2). */
  readonly petBoost?: PetContribution | null;
}

/** The day a timestamp belongs to, as a whole number of days since the epoch. */
export function dayIndexOf(at: number): number {
  return Math.floor(at / DAY);
}

/**
 * Run the attacks the player missed.
 *
 * Scheduled per *day* rather than per hour: the outcome is the same and the player only ever
 * sees the aggregate, so an hourly roll would be 24× the work for a number nobody reads.
 *
 * **A day rolls once, ever.** The seed is the day index, so re-running a day produces the same
 * attacker and the same fight — which sounds like idempotence and is the opposite of it, because
 * the honor loss gets *applied* again. Before `lastRaidDay` existed, reloading the page twenty
 * times in an afternoon meant twenty attacks; an e2e test caught it as two honor going missing
 * across a reload. The caller stores the returned index and hands it back next time.
 */
export function runRaids({
  hero,
  world,
  rivals,
  from,
  to,
  lastRaidDay,
  petBoost = null,
}: RaidOptions): RaidResult {
  const playerIndex = world.ladder.indexOf(PLAYER_LADDER_ID);
  const lastDay = dayIndexOf(to);
  // Never walk back further than the cap, however long the absence — and never re-roll a day.
  const firstDay = Math.max(dayIndexOf(from), lastRaidDay + 1, lastDay - MAX_RAID_CATCHUP_DAYS + 1);

  if (playerIndex === -1 || to <= from || firstDay > lastDay) {
    return {
      ladder: world.ladder,
      heroHonor: hero.honor,
      botHonor: new Map(),
      grudges: [],
      ranksLost: 0,
      lastRaidDay: Math.max(lastRaidDay, lastDay),
    };
  }

  const startRank = playerIndex + 1;
  let ladder = [...world.ladder];
  let heroHonor = hero.honor;
  const botHonor = new Map<number, number>();
  const grudges: Grudge[] = [];

  const heat = rivals.reduce((most, rival) => Math.max(most, attackPressure(rival)), 1);
  const perDay = Math.min(MAX_RAIDS_PER_DAY, Math.round(BASE_RAIDS_PER_DAY * heat));

  for (let dayIndex = firstDay; dayIndex <= lastDay; dayIndex += 1) {
    // Timestamped at the end of that day, or at `to` for the day still in progress.
    const at = Math.min(to, (dayIndex + 1) * DAY);
    const rng = createRng(deriveSeed(world.seed, 'raid', dayIndex), `raid:${dayIndex}`);

    for (let raid = 0; raid < perDay; raid += 1) {
      // Not every day brings a visitor; the cap is a ceiling, not a quota.
      if (!rng.bool(0.55)) continue;

      const rank = ladder.indexOf(PLAYER_LADDER_ID) + 1;
      if (rank <= 0) break;

      // Attackers come from below — someone climbing *through* the player. That is the 60-rank
      // side of the band, not the 15-rank one: `attackersOf` is the inverse of the range the
      // player themselves can reach, and using the wrong one leaves them attackable only by
      // people already behind them, which is nobody worth the trouble.
      //
      // A player at the very foot of the ladder has no one below and is left in peace. That is
      // the right outcome twice over: beating last place gains a bot nothing, and a brand-new
      // hero should not be raided on their first morning.
      const band = attackersOf(rank, ladder.length);
      const rivalNearby = rivals.filter((rival) => {
        const rivalRank = ladder.indexOf(rival.botId) + 1;
        return rivalRank > rank && rivalRank <= band.to;
      });

      let attackerId: number | undefined;
      if (rivalNearby.length > 0 && rng.bool(0.6)) {
        attackerId = rng.pick(rivalNearby).botId;
      } else {
        const below: number[] = [];
        for (let r = rank + 1; r <= band.to; r += 1) {
          const id = ladder[r - 1];
          if (id !== undefined && id !== PLAYER_LADDER_ID) below.push(id);
        }
        if (below.length > 0) attackerId = rng.pick(below);
      }

      if (attackerId === undefined) continue;
      const attacker = world.bots[attackerId];
      if (!attacker || attacker.dormantUntil > at) continue;

      const result = resolveBotAttack({
        hero: { ...hero, honor: heroHonor },
        world: { ...world, ladder },
        attacker: { ...attacker, honor: botHonor.get(attackerId) ?? attacker.honor },
        seed: deriveSeed(world.seed, 'raid', dayIndex, raid),
        petBoost,
      });

      ladder = [...result.ladder];
      heroHonor = result.rewards.honor;
      botHonor.set(attackerId, result.opponentHonor);

      grudges.unshift({
        botId: attackerId,
        at,
        lost: !result.won,
        ranksLost: result.outcome.swapped
          ? Math.max(0, result.outcome.attackerRankBefore - rank)
          : 0,
      });
    }
  }

  const endRank = ladder.indexOf(PLAYER_LADDER_ID) + 1;

  return {
    ladder,
    heroHonor,
    botHonor,
    grudges: grudges.slice(0, REVENGE_QUEUE_CAP),
    ranksLost: Math.max(0, endRank - startRank),
    lastRaidDay: lastDay,
  };
}

/** Merge new grudges into the queue, newest first, capped. */
export function queueGrudges(existing: readonly Grudge[], incoming: readonly Grudge[]): Grudge[] {
  // Only losses earn a chip — you cannot take revenge for a fight you won.
  const wanted = incoming.filter((grudge) => grudge.lost);
  const seen = new Set<string>();
  const merged: Grudge[] = [];

  for (const grudge of [...wanted, ...existing]) {
    const key = `${grudge.botId}:${grudge.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(grudge);
    if (merged.length >= REVENGE_QUEUE_CAP) break;
  }

  return merged;
}

/** Drop a grudge once it has been answered. */
export function clearGrudge(queue: readonly Grudge[], botId: number): Grudge[] {
  return queue.filter((grudge) => grudge.botId !== botId);
}
