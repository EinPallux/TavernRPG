/**
 * The delve: descend, fight, advance or fall back (dungeons spec §2).
 *
 * The loop is deliberately the simplest one in the game — there is no timer, no cost and no
 * queue. You are always facing exactly one monster: the floor you have not cleared. Win and you
 * are facing the next one, immediately, in the same visit. Lose and the door shuts for half an
 * hour.
 *
 * Two rules carry the whole design.
 *
 * **An attempt is seeded by its number, not by the floor.** A mission commits its seed at accept
 * because its outcome must survive the timer; a dungeon floor is free and repeatable, so a seed
 * fixed per floor would make a wall you lost to *unloseable in the same way forever* — the same
 * fight, replayed, with no reason to come back. Seeding on the attempt counter keeps every
 * attempt reproducible while making the next one a genuinely different fight.
 *
 * **Losing leaves something behind.** The share of the monster's health you took off is kept as
 * a best attempt, because between two gear upgrades that number is the only progress a player
 * has. "You took it to 71%" is a target; a bare "you lost" is a wall.
 *
 * Pure module.
 */

import { deriveSeed, createRng } from '@/engine/rng';
import { fight } from '@/engine/combat/fight';
import { buildHeroCombatant } from '@/engine/combat/combatant';
import type { BattleResult } from '@/engine/combat/types';
import { rollDungeonDrops } from '@/engine/items/drops';
import type { Rarity, SlotId } from '@/engine/items/types';
import { NO_BONUS, type PayoutBonus } from '@/engine/progression/rewards';
import type { Hero } from '@/engine/save/schema';
import {
  FLOORS_PER_DUNGEON,
  dungeon,
  floorDef,
  floorLevel,
  isBossFloor,
  type DungeonId,
} from '@/data/dungeons';
import { CLEAR_DICE, attemptShare, buildFloorCombatant, floorPayout } from './floors';

/** `[TUNE]` Q17 — how long the horrors take to regroup after they see you off. */
export const LOSS_COOLDOWN_MS = 30 * 60_000;

/**
 * One dungeon's persisted state.
 *
 * `bestAttempts` is indexed by floor − 1 and holds a 0–1 share; a floor never attempted is 0.
 * `attempts` is a monotonic counter, and is what makes each descent its own fight.
 */
export interface DungeonProgress {
  readonly floorsCleared: number;
  readonly cooldownUntil: number;
  readonly bestAttempts: readonly number[];
  readonly attempts: number;
  /** When floor 10 fell. The trophy's date, and null until it does. */
  readonly clearedAt: number | null;
}

export function emptyProgress(): DungeonProgress {
  return {
    floorsCleared: 0,
    cooldownUntil: 0,
    bestAttempts: Array.from({ length: FLOORS_PER_DUNGEON }, () => 0),
    attempts: 0,
    clearedAt: null,
  };
}

/** The floor a delver is standing in front of. `null` once all ten are behind them. */
export function currentFloor(progress: DungeonProgress): number | null {
  return progress.floorsCleared >= FLOORS_PER_DUNGEON ? null : progress.floorsCleared + 1;
}

export type DelveRefusal =
  | { readonly kind: 'no-hero' }
  | { readonly kind: 'no-key'; readonly keyName: string }
  | { readonly kind: 'below-gate'; readonly gateLevel: number }
  | { readonly kind: 'cooling-down'; readonly msRemaining: number }
  | { readonly kind: 'already-cleared' };

/**
 * May the player go down right now?
 *
 * Every reason is separate and named, because "the door will not open" is the least useful
 * message a locked door can give. The hub renders each of these as its own state.
 */
export function checkDelve(options: {
  readonly id: DungeonId;
  readonly heroLevel: number;
  readonly hasKey: boolean;
  readonly progress: DungeonProgress;
  readonly now: number;
}): DelveRefusal | null {
  const definition = dungeon(options.id);

  if (options.heroLevel < definition.gateLevel) {
    return { kind: 'below-gate', gateLevel: definition.gateLevel };
  }
  if (!options.hasKey) return { kind: 'no-key', keyName: definition.keyName };
  if (currentFloor(options.progress) === null) return { kind: 'already-cleared' };
  if (options.progress.cooldownUntil > options.now) {
    return { kind: 'cooling-down', msRemaining: options.progress.cooldownUntil - options.now };
  }
  return null;
}

export interface FloorSpoils {
  readonly gold: number;
  readonly xp: number;
  readonly dice: number;
  readonly items: readonly { readonly slot: SlotId; readonly rarity: Rarity }[];
  /** Awarded once, on the floor that finishes the dungeon. */
  readonly trophyId: string | null;
}

export interface DelveOutcome {
  readonly battle: BattleResult;
  readonly won: boolean;
  readonly floor: number;
  readonly floorLevel: number;
  readonly isBoss: boolean;
  /** True when this win took the tenth floor — the ceremony's cue. */
  readonly cleared: boolean;
  /** The share of the monster's health this attempt took off, 0–1. */
  readonly share: number;
  /** Whether that beat the previous best on this floor — the hub animates the bar if so. */
  readonly newBest: boolean;
  readonly spoils: FloorSpoils;
  readonly progress: DungeonProgress;
}

const NO_SPOILS: FloorSpoils = { gold: 0, xp: 0, dice: 0, items: [], trophyId: null };

/**
 * Fight the floor in front of you and take what follows.
 *
 * Deterministic in `(worldSeed, dungeonId, floor, attemptNumber)`: calling this twice with the
 * same progress produces the same battle log and the same loot, which the UI relies on — it
 * resolves once to play the fight and the store resolves again to grant the rewards, and the two
 * must agree. Advancing the attempt counter is what makes the *next* descent different.
 */
export function delve(options: {
  readonly id: DungeonId;
  readonly hero: Hero;
  readonly progress: DungeonProgress;
  readonly worldSeed: number;
  readonly now: number;
  readonly bonus?: PayoutBonus;
}): DelveOutcome | null {
  const { id, hero, progress, worldSeed, now } = options;
  const floor = currentFloor(progress);
  if (floor === null || !floorDef(id, floor)) return null;

  const foe = buildFloorCombatant(id, floor);
  if (!foe) return null;

  const attempt = progress.attempts + 1;
  const seed = deriveSeed(worldSeed, 'delve', id, floor, attempt);
  const battle = fight(buildHeroCombatant(hero), foe, seed);

  const won = battle.winner === 'a';
  const share = attemptShare(foe.maxHealth, battle.remainingHealth.b);
  const previousBest = progress.bestAttempts[floor - 1] ?? 0;
  const newBest = share > previousBest;

  const bestAttempts = progress.bestAttempts.map((value, index) =>
    index === floor - 1 ? Math.max(value, share) : value,
  );

  if (!won) {
    // No resource cost — the delve is free, and the only price of failing is the wait (spec §2).
    return {
      battle,
      won: false,
      floor,
      floorLevel: floorLevel(id, floor),
      isBoss: isBossFloor(floor),
      cleared: false,
      share,
      newBest,
      spoils: NO_SPOILS,
      progress: { ...progress, cooldownUntil: now + LOSS_COOLDOWN_MS, bestAttempts, attempts: attempt },
    };
  }

  const cleared = floor >= FLOORS_PER_DUNGEON;
  const payout = floorPayout(id, floor, hero.level, options.bonus ?? NO_BONUS);
  const items = rollDungeonDrops(
    floor,
    createRng(deriveSeed(seed, 'loot'), `delve/${id}/${floor}/${attempt}`),
    { weaponLevelsBehind: hero.level - (hero.equipment.weapon?.level ?? 1) },
  );

  return {
    battle,
    won: true,
    floor,
    floorLevel: floorLevel(id, floor),
    isBoss: isBossFloor(floor),
    cleared,
    share: 1,
    newBest: previousBest < 1,
    spoils: {
      gold: payout.gold,
      xp: payout.xp,
      dice: cleared ? CLEAR_DICE : 0,
      items,
      trophyId: cleared ? dungeon(id).trophy.id : null,
    },
    progress: {
      ...progress,
      floorsCleared: floor,
      // A win clears the cooldown outright: chaining the next floor in the same visit is the
      // reward for a gear spike, and is what makes a good delve feel like a run (spec §2).
      cooldownUntil: 0,
      bestAttempts: bestAttempts.map((value, index) => (index === floor - 1 ? 1 : value)),
      attempts: attempt,
      clearedAt: cleared ? (progress.clearedAt ?? now) : progress.clearedAt,
    },
  };
}
