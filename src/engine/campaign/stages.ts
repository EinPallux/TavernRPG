/**
 * One stage of the Long Road: the thing standing on it, and what it is worth (campaign spec §2).
 *
 * The difference between a campaign stage, a mission monster and a dungeon floor is all here.
 *
 * - A **mission** monster is drawn at *your* level and is meant to lose.
 * - A **floor** stands at a fixed level with a ×1.35 budget and is meant to stop you, once, behind
 *   a key and a cooldown.
 * - A **stage** stands at a fixed level too, but there are a hundred and twenty of them in a line
 *   and the only thing rationing them is Vigor. So a stage is cheap, small, and pays **once** —
 *   the road's whole value is spread across its length rather than banked in any one fight.
 *
 * That last rule is what keeps 1 Vigor a stage from swallowing the game. At a hundred Vigor a day
 * a player could fight a hundred stages, but they can only *first-clear* the ones in front of
 * them, and there are only a hundred and twenty in total. Re-entering a cleared stage costs the
 * Vigor and pays nothing: it is practice, and the screen says so before you spend.
 *
 * Pure module.
 */

import { buildMonsterCombatant } from '@/engine/combat/combatant';
import type { Combatant } from '@/engine/combat/types';
import { xpNeeded } from '@/engine/progression/xp';
import { goldPerVigor, xpPerVigor, NO_BONUS, type PayoutBonus } from '@/engine/progression/rewards';
import {
  isBoss,
  isBossStage,
  isValidStage,
  stageBudget,
  stageLevel,
  stageMonster,
} from '@/data/campaign';

/** What one stage costs. One, as designed — the road is meant to be walked, not rationed. */
export const STAGE_VIGOR_COST = 1;

/**
 * `[TUNE]` What a first clear is worth, in Vigor-equivalents (balancing §17).
 *
 * Six times what the Vigor cost buys on the mission board, which sounds enormous until you notice
 * the two bounds around it: a stage pays **once**, and there are a hundred and twenty of them. The
 * entire road is therefore worth about 900 Vigor-equivalents — nine days of a full mission board —
 * spread across the months it takes to reach the end of it. Set against that, a stage being a
 * *good* use of a Vigor is the point: it is the reward for pushing into something that can beat
 * you, and it is the reason a new player has somewhere to spend a day's Vigor on day one.
 */
export const STAGE_VIGOR_EQUIVALENT = 6;

/** `[TUNE]` A chapter boss is the wall; it pays like one. */
export const BOSS_REWARD_MULTIPLIER = 2;

/** Golden Dice for finishing a chapter (spec §2). Earned, never bought. */
export const CHAPTER_DICE = 1;

/**
 * The monster on a stage.
 *
 * Bosses carry their signature through to the resolver *and* their explainer through to the
 * scene — `fight()` never imports data, so the words have to travel on the snapshot.
 */
export function buildStageCombatant(stage: number): Combatant | null {
  if (!isValidStage(stage)) return null;

  const entry = stageMonster(stage);
  if (!entry) return null;

  const level = stageLevel(stage);
  const budgetMultiplier = stageBudget(stage);

  if (isBoss(entry)) {
    return buildMonsterCombatant({
      id: entry.id,
      name: entry.name,
      archetypeId: entry.archetypeId,
      level,
      budgetMultiplier,
      extraProc: entry.signature.proc,
      signature: { label: entry.signature.label, explainer: entry.signature.explainer },
    });
  }

  return buildMonsterCombatant({
    id: entry.id,
    name: entry.name,
    archetypeId: entry.archetypeId,
    level,
    budgetMultiplier,
  });
}

export interface StagePayout {
  readonly gold: number;
  readonly xp: number;
}

/**
 * Gold and XP for a first clear.
 *
 * Priced exactly the way a dungeon floor is, and for the same two reasons. **Gold at the stage's
 * level**, so a level-90 hero who goes back to sweep chapter one is paid chapter-one money and
 * back-filling needs no rule against it — it simply is not worth doing. **XP at the lower of the
 * hero's level and the stage's**, because `xpPerVigor` returns a share of *a* level's requirement,
 * and pricing a level-40 stage at its own rate for a level-12 hero who somehow beat it would move
 * their bar by three levels in one fight.
 *
 * Guild buffs apply exactly as they do to a contract — a member's bonuses do not stop at the town
 * gate.
 */
export function stagePayout(
  stage: number,
  heroLevel: number,
  bonus: PayoutBonus = NO_BONUS,
): StagePayout {
  if (!isValidStage(stage)) return { gold: 0, xp: 0 };

  const level = stageLevel(stage);
  const xpLevel = Math.max(1, Math.min(Math.floor(heroLevel), level));
  const scale = STAGE_VIGOR_EQUIVALENT * (isBossStage(stage) ? BOSS_REWARD_MULTIPLIER : 1);

  return {
    gold: Math.round(goldPerVigor(level) * scale * bonus.gold),
    xp: Math.round(xpPerVigor(xpLevel, xpNeeded(xpLevel)) * scale * bonus.xp),
  };
}

/**
 * How close an attempt came, 0–1.
 *
 * The only thing a loss leaves behind, and between two gear upgrades the only progress a walled
 * player has to look at. "You took it to 71%" is a target; "you lost" is a wall.
 */
export function attemptShare(monsterMaxHealth: number, remainingHealth: number): number {
  if (monsterMaxHealth <= 0) return 0;
  const taken = (monsterMaxHealth - Math.max(0, remainingHealth)) / monsterMaxHealth;
  return Math.max(0, Math.min(1, taken));
}
