/**
 * The Proving Grounds (docs/design/systems/arena-and-hall-of-fame.md §1).
 *
 * Three opponents near your rank, a ten-minute cooldown, and a ladder that moves when you win.
 * Everything about rank and honor goes through `world/ladder.ts` — the same call the world
 * simulation makes for its thousands of bot fights — because the moment the player's fights and
 * the bots' fights use different code, the ladder the player experiences is not the ladder the
 * game was balanced against.
 *
 * The one rule the draw exists to serve: **an opponent must be worth fighting.** One slightly
 * above (the climb), one level (the fair fight), one slightly below (the safe points). A uniform
 * draw from a ±4% band gives three strangers of no particular significance.
 *
 * Pure module.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import type { Combatant } from '@/engine/combat/types';
import { ATTACK_BAND_DOWN, ATTACK_BAND_UP, PLAYER_LADDER_ID } from '@/engine/world/ladder';
import type { WorldState } from '@/engine/world/generate';

/** Opponents on offer at once (§1 step 1). */
export const DRAW_SIZE = 3;

/** How far either side of the player the draw reaches — ±4% of ladder position (§1 step 1). */
export const DRAW_BAND_SHARE = 0.04;
/** …but never so narrow that a top-ten player has nobody to fight. */
export const MIN_DRAW_BAND = 8;

/** Between fights (§1 step 4). */
export const COOLDOWN_MS = 10 * 60_000;
/** Skipping it costs a die, three times a day. */
export const SKIP_DICE_COST = 1;
export const MAX_SKIPS_PER_DAY = 3;

/** Rerolling the draw is free once the cooldown has elapsed, otherwise a die (§1 step 2). */
export const REROLL_DICE_COST = 1;

/** Wins past this still swap ranks, they just stop paying gold and XP (§1 step 5). */
export const REWARDED_WINS_PER_DAY = 10;

/** Where in the band each of the three opponents is drawn from. */
const DRAW_SLOTS = [
  /** Above: the climb. */
  { from: -1, to: -0.25 },
  /** Level: the fair fight. */
  { from: -0.2, to: 0.2 },
  /** Below: the safe points. */
  { from: 0.25, to: 1 },
] as const;

export function drawBandFor(rank: number, size: number): number {
  return Math.max(MIN_DRAW_BAND, Math.round(size * DRAW_BAND_SHARE * (rank / size)));
}

/**
 * Draw three opponents.
 *
 * Deterministic in `(worldSeed, dayKey, rerollCount, rank)` so the card you looked at is the card
 * you fight — and so a reload is not a free reroll, exactly as with the mission board and the
 * shop shelves.
 */
export function drawOpponents(
  world: WorldState,
  playerRank: number,
  worldSeed: number,
  dayKey: string,
  rerollCount: number,
  now: number,
): number[] {
  const size = world.ladder.length;
  if (size <= 1 || playerRank <= 0) return [];

  const band = drawBandFor(playerRank, size);
  const rng = createRng(
    deriveSeed(worldSeed, 'arena', dayKey, rerollCount, playerRank),
    `arena:${dayKey}:${rerollCount}`,
  );

  const picked: number[] = [];

  for (const slot of DRAW_SLOTS) {
    // Rank space, not index space: negative offsets are *up* the ladder.
    const low = Math.round(playerRank + slot.from * band);
    const high = Math.round(playerRank + slot.to * band);

    const candidates: number[] = [];
    for (let rank = Math.max(1, low); rank <= Math.min(size, high); rank += 1) {
      const id = world.ladder[rank - 1];
      if (id === undefined || id === PLAYER_LADDER_ID || picked.includes(id)) continue;
      // A dormant hero is not a duel, they are a wall with a name on it.
      if ((world.bots[id]?.dormantUntil ?? 0) > now) continue;
      candidates.push(id);
    }

    if (candidates.length > 0) picked.push(rng.pick(candidates));
  }

  // A player at the very top or bottom cannot fill all three slots from their own side — nobody
  // is above rank 1, and nobody is below the last rung. Widen rather than show two cards.
  //
  // Outward from the player, alternating sides, and *not* by sweeping the widened band from the
  // top: that walk hands a brand-new player at the foot of the ladder somebody 120 rungs above
  // them, which is not a duel, it is a lesson. Nearest-first keeps the third card fightable.
  if (picked.length < DRAW_SIZE) {
    for (let step = 1; step <= band * 2 && picked.length < DRAW_SIZE; step += 1) {
      for (const rank of [playerRank - step, playerRank + step]) {
        if (picked.length >= DRAW_SIZE) break;
        if (rank < 1 || rank > size) continue;
        const id = world.ladder[rank - 1];
        if (id === undefined || id === PLAYER_LADDER_ID || picked.includes(id)) continue;
        if ((world.bots[id]?.dormantUntil ?? 0) > now) continue;
        picked.push(id);
      }
    }
  }

  return picked;
}

/* ── Threat reads (§1 step 1) ──────────────────────────────────────────────────── */

/**
 * What the player is told about an opponent.
 *
 * Deliberately comparative and vague: "their armour looks heavier than yours", never "armour
 * 412". Exact stats turn the arena into a spreadsheet lookup where the right answer is always
 * knowable, and scouting is explicitly post-1.0. A read is a *hint*, and it should sometimes be
 * the wrong hint to act on.
 */
export type ThreatLevel = 'easy' | 'even' | 'risky' | 'dangerous';

export interface ThreatRead {
  readonly level: ThreatLevel;
  /** One line, in the world's voice. */
  readonly summary: string;
  /** Two or three specifics, strongest first. */
  readonly notes: readonly string[];
}

function compare(
  mine: number,
  theirs: number,
): 'much-less' | 'less' | 'same' | 'more' | 'much-more' {
  if (mine <= 0) return theirs > 0 ? 'much-more' : 'same';
  const ratio = theirs / mine;
  if (ratio > 1.35) return 'much-more';
  if (ratio > 1.1) return 'more';
  if (ratio < 0.65) return 'much-less';
  if (ratio < 0.9) return 'less';
  return 'same';
}

const HEALTH_WORDS: Readonly<Record<ReturnType<typeof compare>, string | null>> = {
  'much-more': 'They can take far more punishment than you.',
  more: 'They look sturdier than you.',
  same: null,
  less: 'They look easier to put down than you.',
  'much-less': 'They will not survive a serious exchange.',
};

const DAMAGE_WORDS: Readonly<Record<ReturnType<typeof compare>, string | null>> = {
  'much-more': 'Their swing would end this quickly.',
  more: 'They hit harder than you do.',
  same: null,
  less: 'Their weapon is the lesser one.',
  'much-less': 'They are barely armed by your standards.',
};

const ARMOUR_WORDS: Readonly<Record<ReturnType<typeof compare>, string | null>> = {
  'much-more': 'Their armour looks far heavier than yours.',
  more: 'Their armour looks heavier than yours.',
  same: null,
  less: 'Their guard is lighter than yours.',
  'much-less': 'They have barely bothered with armour.',
};

/** Read an opponent, in the world's voice rather than in numbers. */
export function threatRead(player: Combatant, opponent: Combatant): ThreatRead {
  const health = compare(player.maxHealth, opponent.maxHealth);
  const damage = compare(
    (player.weapon.min + player.weapon.max) / 2,
    (opponent.weapon.min + opponent.weapon.max) / 2,
  );
  const armour = compare(Math.max(1, player.armour), Math.max(1, opponent.armour));

  const score =
    ({ 'much-more': 2, more: 1, same: 0, less: -1, 'much-less': -2 } as const)[health] +
    ({ 'much-more': 2, more: 1, same: 0, less: -1, 'much-less': -2 } as const)[damage] +
    ({ 'much-more': 1, more: 0.5, same: 0, less: -0.5, 'much-less': -1 } as const)[armour];

  const level: ThreatLevel =
    score >= 3 ? 'dangerous' : score >= 1 ? 'risky' : score <= -2 ? 'easy' : 'even';

  const summary =
    level === 'dangerous'
      ? 'You would be the underdog here.'
      : level === 'risky'
        ? 'They have the edge, but not by much.'
        : level === 'easy'
          ? 'You should have the better of this.'
          : 'An even match, near enough.';

  const notes = [DAMAGE_WORDS[damage], HEALTH_WORDS[health], ARMOUR_WORDS[armour]].filter(
    (note): note is string => note !== null,
  );

  return {
    level,
    summary,
    // A read with nothing to say still says something — silence reads as a bug.
    notes: notes.length > 0 ? notes : ['Nothing about them stands out either way.'],
  };
}

/* ── Cooldown and caps ─────────────────────────────────────────────────────────── */

export function msUntilReady(cooldownUntil: number, now: number): number {
  return Math.max(0, cooldownUntil - now);
}

export function isReady(cooldownUntil: number, now: number): boolean {
  return now >= cooldownUntil;
}

/** Rerolling is free once the cooldown has run out; before that it costs a die (§1 step 2). */
export function rerollCost(cooldownUntil: number, now: number): number {
  return isReady(cooldownUntil, now) ? 0 : REROLL_DICE_COST;
}

export function canSkipCooldown(skipsToday: number): boolean {
  return skipsToday < MAX_SKIPS_PER_DAY;
}

/** True while a win still pays gold and XP. Beyond the cap the rank swap alone remains. */
export function isRewarded(rewardedWinsToday: number): boolean {
  return rewardedWinsToday < REWARDED_WINS_PER_DAY;
}

/** May this rank be attacked from that one? Shares the world sim's band (§5). */
export function isAttackable(playerRank: number, targetRank: number): boolean {
  return targetRank >= playerRank - ATTACK_BAND_UP && targetRank <= playerRank + ATTACK_BAND_DOWN;
}
