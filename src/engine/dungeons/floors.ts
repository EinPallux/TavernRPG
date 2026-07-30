/**
 * One floor of a dungeon: the thing on it, and what it pays (dungeons spec §2–§3).
 *
 * The whole difference between a dungeon and a mission lives in this file. A mission monster is
 * drawn at *your* level and is meant to lose; a floor monster stands at a **fixed** level with a
 * ×1.35 stat budget (bosses ×1.6) and is meant to stop you. Floor 7 of the Rat Cellars is level
 * 26 whether you meet it at 20 or at 60 — that is what makes the hub able to say "you are four
 * levels short" and be telling the truth.
 *
 * Rewards follow from the same idea: **a floor pays what the floor is worth**, priced off its own
 * level rather than the hero's. Two consequences, both wanted. Beating a wall well above your
 * level is a genuine windfall, because you are being paid at the wall's rate. And sweeping the
 * Rat Cellars at level 90 is pocket change, so back-filling old dungeons needs no special rule to
 * stop it becoming a farm — it simply is not one.
 *
 * Pure module.
 */

import { buildMonsterCombatant } from '@/engine/combat/combatant';
import type { Combatant } from '@/engine/combat/types';
import { xpNeeded } from '@/engine/progression/xp';
import { goldPerVigor, xpPerVigor, NO_BONUS, type PayoutBonus } from '@/engine/progression/rewards';
import {
  FLOORS_PER_DUNGEON,
  floorDef,
  floorLevel,
  isBossFloor,
  type DungeonId,
} from '@/data/dungeons';

/** `[TUNE]` balancing §5 — a floor monster's stat budget against a same-level mission monster. */
export const FLOOR_BUDGET = 1.35;
/**
 * `[TUNE]` The finale, at the spec's ×1.6.
 *
 * Floor 10 is the hardest thing in its dungeon and is meant to be a real stop.
 */
export const BOSS_BUDGET = 1.6;
/**
 * `[TUNE]` The mid-boss, at a smaller step — and this one was measured, not chosen.
 *
 * At the full ×1.6, Emberdeep's floor 5 needed a level-81 hero while floor 6 needed 76: the boss
 * bump was worth more than the four levels the floor curve gains in a step, so the dungeon got
 * *easier* on the far side of its own mid-boss. Rather than swapping Korrig for a flimsier
 * archetype to hide it, the rule is now the one the design already implies — **floor 5 teaches
 * and floor 10 tests** — so the teaching wall is a smaller wall. At ×1.5 every dungeon's ramp
 * climbs without a dip, and floor 5 still lands a clear step above the floor beneath it.
 */
export const MID_BOSS_BUDGET = 1.5;

/**
 * `[TUNE]` What a floor is worth, in Vigor-equivalents (spec §2: "big XP, `90 × xpPerVigor`").
 *
 * Four and a half times a twenty-minute mission, and it costs no Vigor — which sounds enormous
 * until you notice a floor pays **once**. Ten floors is the entire lifetime yield of a dungeon,
 * and it is gated behind walls that take days of gear to pass.
 */
export const FLOOR_VIGOR_EQUIVALENT = 90;

/** `[TUNE]` A boss is the wall; the payoff is scaled to match. */
export const BOSS_REWARD_MULTIPLIER = 1.5;

/** Golden Dice for clearing a dungeon outright (spec §2). Earned, never bought. */
export const CLEAR_DICE = 3;

export function floorBudget(floor: number): number {
  if (floor >= FLOORS_PER_DUNGEON) return BOSS_BUDGET;
  return isBossFloor(floor) ? MID_BOSS_BUDGET : FLOOR_BUDGET;
}

/**
 * The monster standing on a floor.
 *
 * Bosses carry their signature through to the resolver *and* their explainer through to the
 * scene, which is the whole reason `Combatant.signature` exists: `fight()` never imports data,
 * so the words have to travel on the snapshot.
 */
export function buildFloorCombatant(id: DungeonId, floor: number): Combatant | null {
  const definition = floorDef(id, floor);
  if (!definition) return null;

  const { signature } = definition;
  return buildMonsterCombatant({
    id: definition.id,
    name: definition.name,
    archetypeId: definition.archetypeId,
    level: floorLevel(id, floor),
    budgetMultiplier: floorBudget(floor),
    ...(signature
      ? {
          extraProc: signature.proc,
          signature: { label: signature.label, explainer: signature.explainer },
        }
      : {}),
  });
}

export interface FloorPayout {
  readonly gold: number;
  readonly xp: number;
}

/**
 * Gold and XP for clearing a floor.
 *
 * **Gold at the floor's level, XP at the lower of the two**, and the split is deliberate.
 *
 * Gold is an absolute amount, so pricing it at the floor keeps the rule at the top of this file:
 * a level-90 hero sweeping the Rat Cellars is paid level-14 money and back-filling is worthless
 * without a special case forbidding it.
 *
 * XP is not absolute — `xpPerVigor` returns a share of *a* level's requirement, and which level
 * decides how far the bar moves. Pricing it at the floor's level meant a fresh level-10 hero
 * clearing floor 1 collected two level-14 levels' worth in one fight and came out somewhere near
 * 13; four chainable floors would have taken them to 20 in a single visit and torn a hole in the
 * pacing curve. Taking the lower of the two pays a below-level delver a full, generous day at
 * *their* rate, and still pays an over-levelled one almost nothing.
 *
 * The guild bonus applies exactly as it does to a mission — a member's buffs do not stop at a
 * door.
 */
export function floorPayout(
  id: DungeonId,
  floor: number,
  heroLevel: number,
  bonus: PayoutBonus = NO_BONUS,
): FloorPayout {
  const level = floorLevel(id, floor);
  const xpLevel = Math.max(1, Math.min(Math.floor(heroLevel), level));
  const scale = FLOOR_VIGOR_EQUIVALENT * (isBossFloor(floor) ? BOSS_REWARD_MULTIPLIER : 1);

  return {
    gold: Math.round(goldPerVigor(level) * scale * bonus.gold),
    xp: Math.round(xpPerVigor(xpLevel, xpNeeded(xpLevel)) * scale * bonus.xp),
  };
}

/**
 * How close an attempt came, 0–1.
 *
 * The number behind the hub's best-attempt bars, and the only progress a *loss* leaves behind.
 * Between two gear upgrades a player has nothing else to look at, so "you took it to 71% last
 * time" is the difference between a wall and a target.
 */
export function attemptShare(monsterMaxHealth: number, remainingHealth: number): number {
  if (monsterMaxHealth <= 0) return 0;
  const taken = (monsterMaxHealth - Math.max(0, remainingHealth)) / monsterMaxHealth;
  return Math.max(0, Math.min(1, taken));
}
