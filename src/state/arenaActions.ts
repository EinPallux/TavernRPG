'use client';

/**
 * The Proving Grounds, as store transitions.
 *
 * Save in, save out, same as `missionActions` and `shopActions`. Nothing here reads a clock or a
 * store — the day key and the timestamp are passed in, which is what makes "does the payout fire
 * twice if you open the tab twice?" a test with plain objects rather than a two-week wait.
 *
 * The one structural decision worth naming: **the player is seated on the ladder when the world
 * is raised, not when the arena unlocks.** Phase 8 shipped a world the player could watch but not
 * enter, and it showed — `updateRivals` bails on `playerRank <= 0`, so nobody ever got a rival and
 * the Crier never had a personal line to write. A seat costs nothing before the Proving Grounds
 * opens at level 4, and everything downstream of rank suddenly works.
 */

import type { DayKey } from '@/engine/clock';
import { applyXp } from '@/engine/progression/xp';
import {
  COOLDOWN_MS,
  MAX_SKIPS_PER_DAY,
  REROLL_DICE_COST,
  SKIP_DICE_COST,
  canSkipCooldown,
  drawOpponents,
  isReady,
  rerollCost,
} from '@/engine/arena/arena';
import { resolveDuel, type DuelResult } from '@/engine/arena/duel';
import { petContribution } from './petActions';
import { clearGrudge, queueGrudges, runRaids, type RaidResult } from '@/engine/arena/raids';
import { LEGENDS_SNAPSHOT_SIZE, weeklyPayouts, type WeeklyPayout } from '@/engine/arena/payout';
import { PLAYER_LADDER_ID, joinLadder, newcomerHonor } from '@/engine/world/ladder';
import type { BotRecord, WorldState } from '@/engine/world/generate';
import { updateRivals } from '@/engine/world/rivals';
import { creditAll } from './progressActions';
import {
  LEGENDS_ARCHIVE_CAP,
  type Arena,
  type LegendsWeek,
  type SaveFile,
  type StoredWorld,
} from '@/engine/save/schema';

export type ArenaRefusal =
  | { readonly kind: 'no-hero' }
  | { readonly kind: 'no-world' }
  | { readonly kind: 'not-on-ladder' }
  | { readonly kind: 'cooling-down'; readonly msRemaining: number }
  | { readonly kind: 'insufficient-dice'; readonly needed: number; readonly available: number }
  | { readonly kind: 'skip-cap-reached'; readonly cap: number }
  | { readonly kind: 'no-such-opponent' };

export type ArenaTransition =
  | { readonly ok: true; readonly save: SaveFile }
  | { readonly ok: false; readonly refusal: ArenaRefusal };

const refuse = (refusal: ArenaRefusal): { readonly ok: false; readonly refusal: ArenaRefusal } => ({
  ok: false,
  refusal,
});

function withArena(save: SaveFile, arena: Partial<Arena>): SaveFile {
  return { ...save, arena: { ...save.arena, ...arena } };
}

/** The stored world in the shape the pure engine wants. */
function toEngine(stored: StoredWorld): WorldState {
  return {
    seed: stored.seed,
    createdAt: stored.createdAt,
    lastSimAt: stored.lastSimAt,
    bots: stored.bots,
    guilds: stored.guilds,
    ladder: stored.ladder,
  };
}

/** The player's rank, or 0 if they are somehow not seated. */
export function rankOfPlayer(save: SaveFile): number {
  const index = save.world?.ladder.indexOf(PLAYER_LADDER_ID) ?? -1;
  return index + 1;
}

/* ── Seating ───────────────────────────────────────────────────────────────────── */

/**
 * Put the player on the ladder if they are not already there. Idempotent.
 *
 * They arrive at the foot of it with a newcomer's honor — just under the bottom rung, so their
 * first win is a real climb rather than a formality. Called from `ensureWorld` for new saves and
 * from the load path for every save written before Phase 9, which have a world but no seat.
 */
export function seatPlayer(save: SaveFile): SaveFile {
  const { world, hero } = save;
  if (!world || !hero) return save;
  if (world.ladder.includes(PLAYER_LADDER_ID)) return save;

  const ladder = joinLadder(world.ladder);
  return {
    ...save,
    world: { ...world, ladder },
    // Never lower an existing figure: a returning player's honor is theirs.
    hero: { ...hero, honor: Math.max(hero.honor, newcomerHonor(ladder.length)) },
  };
}

/* ── The daily draw ────────────────────────────────────────────────────────────── */

/**
 * Today's three opponents, drawn if the day has turned or the board is empty.
 *
 * Lazy for the same reason the mission board and the shop shelves are: a player who never opens
 * the Proving Grounds never has a stale card to explain, and the Reset Engine does not have to
 * know what an opponent is.
 */
export function refreshDraw(save: SaveFile, today: DayKey, now: number): SaveFile {
  const { world, hero, arena } = save;
  if (!world || !hero) return save;
  if (arena.drawDay === today && arena.draw.length > 0) return save;

  const rank = rankOfPlayer(save);
  if (rank === 0) return save;

  return withArena(save, {
    draw: drawOpponents(toEngine(world), rank, world.seed, today, arena.rerollsToday, now),
    drawDay: today,
  });
}

/** The records behind the three cards, in draw order. */
export function drawnOpponents(save: SaveFile): BotRecord[] {
  const bots = save.world?.bots;
  if (!bots) return [];
  return save.arena.draw
    .map((id) => bots[id])
    .filter((record): record is BotRecord => record !== undefined);
}

/**
 * Redraw. Free once the cooldown has run out, a die before that (spec §1 step 2).
 *
 * The reroll count feeds the draw seed, so each one is a genuinely different set rather than a
 * reshuffle of the same three, and a reload is not a free reroll.
 */
export function rerollDraw(save: SaveFile, today: DayKey, now: number): ArenaTransition {
  const { world, hero, arena } = save;
  if (!hero) return refuse({ kind: 'no-hero' });
  if (!world) return refuse({ kind: 'no-world' });

  const rank = rankOfPlayer(save);
  if (rank === 0) return refuse({ kind: 'not-on-ladder' });

  const cost = rerollCost(arena.cooldownUntil, now);
  if (cost > hero.dice) {
    return refuse({ kind: 'insufficient-dice', needed: cost, available: hero.dice });
  }

  const rerollsToday = arena.rerollsToday + 1;
  return {
    ok: true,
    save: {
      ...withArena(save, {
        rerollsToday,
        draw: drawOpponents(toEngine(world), rank, world.seed, today, rerollsToday, now),
        drawDay: today,
      }),
      hero: { ...hero, dice: hero.dice - cost },
    },
  };
}

/** Buy your way past the cooldown: one die, three times a day (spec §1 step 4). */
export function skipCooldown(save: SaveFile, now: number): ArenaTransition {
  const { hero, arena } = save;
  if (!hero) return refuse({ kind: 'no-hero' });
  if (isReady(arena.cooldownUntil, now)) return { ok: true, save };
  if (!canSkipCooldown(arena.skipsToday)) {
    return refuse({ kind: 'skip-cap-reached', cap: MAX_SKIPS_PER_DAY });
  }
  if (hero.dice < SKIP_DICE_COST) {
    return refuse({ kind: 'insufficient-dice', needed: SKIP_DICE_COST, available: hero.dice });
  }

  return {
    ok: true,
    save: {
      ...withArena(save, { cooldownUntil: now, skipsToday: arena.skipsToday + 1 }),
      hero: { ...hero, dice: hero.dice - SKIP_DICE_COST },
    },
  };
}

/* ── The fight ─────────────────────────────────────────────────────────────────── */

export interface DuelTransition {
  readonly save: SaveFile;
  readonly result: DuelResult;
  /** Levels gained from the purse, so the result screen can fire the level-up beat. */
  readonly levelsGained: number;
}

export type DuelOutcome =
  | { readonly ok: true; readonly transition: DuelTransition }
  | { readonly ok: false; readonly refusal: ArenaRefusal };

/**
 * Fight one of the drawn opponents (or a revenge target) and write the result back.
 *
 * The fight itself is `resolveDuel` — the same `fight()` and the same `resolveLadderFight` the
 * world simulation runs thousands of times a day. Everything this function adds is bookkeeping:
 * the purse, the cooldown, the caps, and the ladder written back to the save.
 */
export function duel(save: SaveFile, opponentId: number, now: number): DuelOutcome {
  const { world, hero, arena } = save;
  if (!hero) return refuse({ kind: 'no-hero' });
  if (!world) return refuse({ kind: 'no-world' });
  if (!isReady(arena.cooldownUntil, now)) {
    return refuse({ kind: 'cooling-down', msRemaining: arena.cooldownUntil - now });
  }

  const opponent = world.bots[opponentId];
  if (!opponent) return refuse({ kind: 'no-such-opponent' });
  if (rankOfPlayer(save) === 0) return refuse({ kind: 'not-on-ladder' });

  const result = resolveDuel({
    hero,
    world: toEngine(world),
    opponent,
    rewardedWinsToday: arena.rewardedWinsToday,
    bestRank: arena.bestRank,
    // Committed: the same duel, replayed, plays out the same way. The cooldown is in the seed so
    // two fights against the same opponent are not the same fight twice.
    seed: opponentId * 7919 + Math.floor(now / 1000),
    petBoost: petContribution(save),
  });

  const levelled = applyXp(hero.level, hero.xp, result.rewards.xp);
  const rankAfter = result.outcome.attackerRankAfter;

  const bots = [...world.bots];
  bots[opponentId] = { ...opponent, honor: result.opponentHonor };

  // A win in the sand counts toward the week's bounty and today's notices, through the one
  // credit path that feeds both (daily-loop spec §1).
  const credited = creditAll(save, [
    ['arenaWins', result.won ? 1 : 0],
    ['levelsGained', levelled.level - hero.level],
  ]);

  return {
    ok: true,
    transition: {
      result,
      levelsGained: levelled.level - hero.level,
      save: {
        ...credited,
        hero: {
          ...hero,
          level: levelled.level,
          xp: levelled.xp,
          gold: hero.gold + result.rewards.gold,
          dice: hero.dice + result.rewards.dice,
          honor: result.rewards.honor,
        },
        world: { ...world, bots, ladder: [...result.ladder] },
        arena: {
          ...arena,
          cooldownUntil: now + COOLDOWN_MS,
          rewardedWinsToday:
            arena.rewardedWinsToday + (result.won && !result.rewards.pastCap ? 1 : 0),
          // The high-water mark only ever improves, which is what makes a milestone pay once.
          bestRank: arena.bestRank === 0 ? rankAfter : Math.min(arena.bestRank, rankAfter),
          // Answering an attack settles it, win or lose — the chip is a grudge, not a quota.
          revengeQueue: clearGrudge(arena.revengeQueue, opponentId),
        },
      },
    },
  };
}

/** The bot ids the player currently owes a fight, newest grudge first. */
export function revengeTargets(save: SaveFile): number[] {
  return save.arena.revengeQueue.map((grudge) => grudge.botId);
}

/**
 * Throw away a draw that no longer belongs to the player's rank.
 *
 * The board is drawn from a band around where the player *is*. Overnight the ladder moves under
 * them — bots climb past, raids knock them down — and a board drawn at rank 700 offers three
 * heroes who are all now above a player sitting at 731. The draw is slotted precisely so the
 * three are a choice; a stale one is three of the same card.
 *
 * Not a free reroll: nothing the player does moves their rank without their knowing, and the
 * reroll counter is untouched, so the redraw is the same board they would have been offered had
 * they arrived a minute later.
 */
export function invalidateDrawOnDrift(save: SaveFile, rankBefore: number): SaveFile {
  if (save.arena.draw.length === 0) return save;
  if (rankBefore === rankOfPlayer(save)) return save;
  return withArena(save, { draw: [], drawDay: null });
}

/* ── Offline: the attacks the player slept through ─────────────────────────────── */

export interface RaidsApplied {
  readonly save: SaveFile;
  readonly raids: RaidResult;
}

/**
 * Run the bot attacks that landed while the player was away (spec §3).
 *
 * Called from the world catch-up, because that is where "time passed" is already known. The
 * fights resolve against the player's *snapshot*: they were not there, and a fight that read live
 * state would give a different answer depending on when the tab happened to open.
 */
export function applyRaids(save: SaveFile, from: number, to: number): RaidsApplied {
  const { world, hero } = save;
  if (!world || !hero || rankOfPlayer(save) === 0) {
    return {
      save,
      raids: {
        ladder: world?.ladder ?? [],
        heroHonor: hero?.honor ?? 0,
        botHonor: new Map(),
        grudges: [],
        ranksLost: 0,
        lastRaidDay: save.arena.lastRaidDay,
      },
    };
  }

  const raids = runRaids({
    hero,
    world: toEngine(world),
    rivals: world.rivals,
    from,
    to,
    lastRaidDay: save.arena.lastRaidDay,
    petBoost: petContribution(save),
  });

  const bots = [...world.bots];
  for (const [botId, honor] of raids.botHonor) {
    const record = bots[botId];
    if (record) bots[botId] = { ...record, honor };
  }

  return {
    raids,
    save: {
      ...save,
      hero: { ...hero, honor: raids.heroHonor },
      world: { ...world, bots, ladder: [...raids.ladder] },
      arena: {
        ...save.arena,
        revengeQueue: queueGrudges(save.arena.revengeQueue, raids.grudges),
        // The whole point of the field: a day that has been rolled never rolls again.
        lastRaidDay: raids.lastRaidDay,
      },
    },
  };
}

/* ── Midnight and Sunday ───────────────────────────────────────────────────────── */

export interface ArenaDayResult {
  readonly save: SaveFile;
  /** Weeks that closed, oldest first. Usually none, sometimes one, four after a month away. */
  readonly payouts: readonly WeeklyPayout[];
}

/**
 * The arena's share of a day boundary: clear the counters, then pay any week that ended.
 *
 * Driven by the Reset Engine's list of boundaries rather than by asking the clock — the Reset
 * Engine is the one owner of "it is tomorrow", and a second opinion here is precisely the drift
 * bug that module exists to prevent. Four Sundays in the list means four payouts; the same
 * Sunday twice means one.
 */
export function refreshArenaDay(
  save: SaveFile,
  daysProcessed: readonly DayKey[],
  didReset: boolean,
): ArenaDayResult {
  if (!save.hero || !save.world || daysProcessed.length === 0) {
    return { save, payouts: [] };
  }

  const rank = rankOfPlayer(save);
  const payouts = weeklyPayouts({
    daysProcessed,
    lastPaidWeek: save.arena.lastPayoutWeek,
    playerRank: rank,
    ladder: save.world.ladder,
  });

  // Payouts arrive oldest first, the archive reads newest first — so they go on reversed. A
  // month away must leave the tab open on last Sunday, not on the Sunday four weeks ago.
  const archive: LegendsWeek[] = [
    ...payouts
      .map((payout) => ({
        weekKey: payout.weekKey,
        ids: [...payout.legends].slice(0, LEGENDS_SNAPSHOT_SIZE),
        playerRank: payout.rank,
      }))
      .reverse(),
    ...save.arena.legends,
  ].slice(0, LEGENDS_ARCHIVE_CAP);

  const dice = payouts.reduce((sum, payout) => sum + payout.dice, 0);
  const lastPaid = payouts.at(-1)?.weekKey ?? save.arena.lastPayoutWeek;

  return {
    payouts,
    save: {
      ...save,
      hero: { ...save.hero, dice: save.hero.dice + dice },
      arena: {
        ...save.arena,
        // The counters are the *day's*, so they only clear when a day actually turned.
        ...(didReset
          ? { rerollsToday: 0, skipsToday: 0, rewardedWinsToday: 0, drawDay: null, draw: [] }
          : {}),
        lastPayoutWeek: lastPaid,
        legends: archive,
      },
    },
  };
}

/**
 * Refresh the rival set now that the player has a rank.
 *
 * Phase 8 called this from the world catch-up with `playerRank: 0`, which promoted nobody. Seating
 * the player is what turns it on; this exists so a save that has *just* been seated gets its
 * rivals immediately rather than on whatever tick happens next.
 */
export function refreshRivals(save: SaveFile, now: number, daysElapsed: number): SaveFile {
  const { world } = save;
  if (!world) return save;

  const update = updateRivals({
    world: toEngine(world),
    playerRank: rankOfPlayer(save),
    current: world.rivals,
    now,
    daysElapsed,
  });

  return { ...save, world: { ...world, rivals: [...update.rivals] } };
}

export { REROLL_DICE_COST, SKIP_DICE_COST, MAX_SKIPS_PER_DAY };
