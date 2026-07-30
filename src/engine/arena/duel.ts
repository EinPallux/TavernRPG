/**
 * Arena duels (arena spec §1 steps 3–5, balancing §10).
 *
 * A player fight is the **same fight a bot has**: the real `fight()` against the opponent's
 * materialized combatant, resolved through the same `resolveLadderFight` the world simulation
 * calls thousands of times a day. Nothing is faked and no outcome is pre-decided — the design
 * promise is that bots are *fair*, and the only way to keep it is to have one code path.
 *
 * Rewards are the one thing that differs, because bots do not have purses: a win pays
 * `25 × goldPerVigor(L)` and `12 × xpPerVigor(L)` for the first ten of the day (balancing §2,
 * §1). Past the cap the rank swap still happens — the ladder is not a daily allowance — but the
 * gold stops, so grinding the arena cannot outpace missions.
 *
 * Pure module.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { fight } from '@/engine/combat/fight';
import { buildHeroCombatant } from '@/engine/combat/combatant';
import type { BattleResult } from '@/engine/combat/types';
import { goldPerVigor, xpPerVigor } from '@/engine/progression/rewards';
import { xpNeeded } from '@/engine/progression/xp';
import type { Hero } from '@/engine/save/schema';
import { materializeBot } from '@/engine/world/materialize';
import { resolveLadderFight, type LadderOutcome } from '@/engine/world/ladder';
import type { BotRecord, WorldState } from '@/engine/world/generate';
import { PLAYER_LADDER_ID } from '@/engine/world/ladder';
import { isRewarded } from './arena';

/** Arena win gold, balancing §2. */
export const ARENA_GOLD_FACTOR = 25;
/** Arena win XP, balancing §1. */
export const ARENA_XP_FACTOR = 12;

/** Ranks that earn a one-time dice bonus and a crowd-roar stinger (arena spec §4). */
export const MILESTONE_RANKS = [500, 100, 10, 1] as const;
/** Dice paid the first time each milestone is reached. */
export const MILESTONE_DICE: Readonly<Record<number, number>> = {
  500: 1,
  100: 2,
  10: 3,
  1: 5,
};

export interface DuelRewards {
  readonly gold: number;
  readonly xp: number;
  /** Honor after the fight — up on a win, down 2% on a failed attack. */
  readonly honor: number;
  readonly honorDelta: number;
  /** Dice from crossing milestone ranks for the first time — the sum, if a leap cleared two. */
  readonly dice: number;
  /** The best milestone crossed, if any, so the UI can fire the right stinger. */
  readonly milestone: number | null;
  /** True when the win came after the daily cap — swap only, no purse. */
  readonly pastCap: boolean;
}

export interface DuelResult {
  readonly battle: BattleResult;
  readonly won: boolean;
  readonly outcome: LadderOutcome;
  readonly rewards: DuelRewards;
  /** Ladder order after the fight. */
  readonly ladder: readonly number[];
  /**
   * Who it was against. `LadderOutcome` deliberately talks in attacker/defender, which swap
   * depending on who started it — the result screen wants "the other one" without having to
   * work out which side that was.
   */
  readonly opponentId: number;
  /** The opponent's honor after the fight, to be written back to their record. */
  readonly opponentHonor: number;
}

export interface DuelOptions {
  readonly hero: Hero;
  readonly world: WorldState;
  readonly opponent: BotRecord;
  /** Wins already rewarded today, against the cap. */
  readonly rewardedWinsToday: number;
  /** Best rank ever held, so a milestone only ever pays once. */
  readonly bestRank: number;
  /** Committed seed. The same duel always plays out the same way. */
  readonly seed: number;
}

/**
 * Fight, then apply the result to the ladder.
 *
 * The battle log is returned intact so the scene can play it — this is the same log the mission
 * fights use, and the same one the golden tests freeze.
 */
export function resolveDuel({
  hero,
  world,
  opponent,
  rewardedWinsToday,
  bestRank,
  seed,
}: DuelOptions): DuelResult {
  const playerSide = buildHeroCombatant(hero, 'player');
  const opponentSide = materializeBot(world.seed, opponent);

  const rng = createRng(deriveSeed(seed, 'duel', opponent.id), `duel:${opponent.id}`);
  const battle = fight(playerSide, opponentSide, rng.seed);
  const won = battle.winner === 'a';

  const outcome = resolveLadderFight({
    order: world.ladder,
    attacker: { id: PLAYER_LADDER_ID, honor: hero.honor },
    defender: { id: opponent.id, honor: opponent.honor },
    attackerWon: won,
  });

  const rewarded = won && isRewarded(rewardedWinsToday);
  const gold = rewarded ? Math.round(ARENA_GOLD_FACTOR * goldPerVigor(hero.level)) : 0;
  const xp = rewarded
    ? Math.round(ARENA_XP_FACTOR * xpPerVigor(hero.level, xpNeeded(hero.level)))
    : 0;

  // Milestones pay once, ever — `bestRank` is the high-water mark, not the current rank, so
  // falling back below 100 and climbing again does not pay twice. A save that has never held a
  // rank carries 0, which is "no mark yet" rather than "rank zero".
  //
  // Every milestone between the mark and the new rank pays, because a single leap can clear two:
  // a first-ever arena win landing inside the top 100 has passed 500 as well. Paying one and
  // banking the other for whatever fight happens next reads as a bug from the player's chair.
  const reached = outcome.attackerRankAfter;
  const mark = bestRank > 0 ? bestRank : Number.POSITIVE_INFINITY;
  const crossed = won
    ? MILESTONE_RANKS.filter((milestone) => reached <= milestone && mark > milestone)
    : [];
  // The stinger fires for the best rank cleared, not the first one found.
  const headline = crossed.length > 0 ? Math.min(...crossed) : null;

  return {
    battle,
    won,
    outcome,
    ladder: outcome.order,
    opponentId: opponent.id,
    opponentHonor: outcome.defenderHonor,
    rewards: {
      gold,
      xp,
      honor: outcome.attackerHonor,
      honorDelta: outcome.attackerHonor - hero.honor,
      dice: crossed.reduce((sum, milestone) => sum + (MILESTONE_DICE[milestone] ?? 0), 0),
      milestone: headline,
      pastCap: won && !rewarded,
    },
  };
}

/**
 * A bot attacking the player while they were away (arena spec §3).
 *
 * Resolved against the player's *snapshot* rather than live — they were not there to fight, and
 * a fight that reads state at load time would produce a different result depending on when the
 * tab happened to open. The bot is the attacker here, so the ladder rules apply in that
 * direction: they can take the player's rank, and a failed attack costs them honor, not the
 * player.
 */
export function resolveBotAttack({
  hero,
  world,
  attacker,
  seed,
}: {
  hero: Hero;
  world: WorldState;
  attacker: BotRecord;
  seed: number;
}): DuelResult {
  const playerSide = buildHeroCombatant(hero, 'player');
  const attackerSide = materializeBot(world.seed, attacker);

  const rng = createRng(deriveSeed(seed, 'raid', attacker.id), `raid:${attacker.id}`);
  // The bot swings first: they came to the player.
  const battle = fight(attackerSide, playerSide, rng.seed);
  const botWon = battle.winner === 'a';

  const outcome = resolveLadderFight({
    order: world.ladder,
    attacker: { id: attacker.id, honor: attacker.honor },
    defender: { id: PLAYER_LADDER_ID, honor: hero.honor },
    attackerWon: botWon,
  });

  return {
    battle,
    // `won` is always from the player's side, so an attack the bot lost is a player win.
    won: !botWon,
    outcome,
    ladder: outcome.order,
    opponentId: attacker.id,
    opponentHonor: outcome.attackerHonor,
    rewards: {
      gold: 0,
      xp: 0,
      honor: outcome.defenderHonor,
      honorDelta: outcome.defenderHonor - hero.honor,
      dice: 0,
      milestone: null,
      pastCap: false,
    },
  };
}
