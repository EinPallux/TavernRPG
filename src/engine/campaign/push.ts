/**
 * The push: fight the stage in front of you, and keep going (campaign spec §3).
 *
 * The loop the player asked for, in one function. You are always facing exactly one stage — the
 * first one you have not cleared. Win and you are facing the next, immediately, in the same
 * session. Lose and nothing is taken from you but the Vigor: no cooldown, no lost ground, no lost
 * stage. You go and get stronger and come back to the same monster.
 *
 * Three rules carry the design, and each of them is a decision that could have gone the other way.
 *
 * **Progress is permanent and contiguous.** `stagesCleared` is one number, because you cannot
 * clear stage 5 without clearing 4 — so a set of cleared stages would be a list that can only ever
 * hold `1..n`, which is a number wearing a costume. Everything else the screen shows (which
 * chapter, how far through it, what is next) is derived from it.
 *
 * **A stage pays once.** Re-entering a cleared stage is *practice*: it costs the Vigor, plays the
 * fight, and pays nothing. That is what stops a hundred Vigor a day from becoming a hundred stages
 * of income, and it is why the road can afford to be generous with a first clear.
 *
 * **An attempt is seeded by its number, not by the stage.** A mission commits its seed at accept
 * because its outcome must survive a timer; a stage is repeatable, so a seed fixed per stage would
 * make a wall you lost to unloseable in the same way forever — the identical fight, replayed, with
 * no reason to come back after buying a sword. Seeding on a monotonic attempt counter keeps every
 * attempt reproducible while making the next one genuinely different.
 *
 * Pure module.
 */

import { deriveSeed } from '@/engine/rng';
import { fight } from '@/engine/combat/fight';
import { buildHeroCombatant, type PetContribution } from '@/engine/combat/combatant';
import type { BattleResult } from '@/engine/combat/types';
import { NO_BONUS, type PayoutBonus } from '@/engine/progression/rewards';
import type { Hero } from '@/engine/save/schema';
import {
  STAGES_PER_CHAPTER,
  TOTAL_STAGES,
  chapterOf,
  isBossStage,
  isValidStage,
  stageLevel,
  stepOf,
} from '@/data/campaign';
import {
  CHAPTER_DICE,
  STAGE_VIGOR_COST,
  attemptShare,
  buildStageCombatant,
  stagePayout,
} from './stages';

/**
 * The road, as the save holds it.
 *
 * Four facts, and nothing derivable. `bestAttempt` belongs to the wall stage only and resets the
 * moment it falls — the number is there to give a stuck player a target, and a target for a stage
 * you already beat is noise.
 */
export interface CampaignProgress {
  readonly stagesCleared: number;
  /** Best share of the wall stage's health taken off, 0–1. Reset on advancing. */
  readonly bestAttempt: number;
  /** Monotonic; what makes each attempt its own fight. */
  readonly attempts: number;
  /** When the hundred and twentieth fell. The trophy's date, and null until it does. */
  readonly finishedAt: number | null;
}

export function emptyProgress(): CampaignProgress {
  return { stagesCleared: 0, bestAttempt: 0, attempts: 0, finishedAt: null };
}

/** The stage a player is being stopped by. `null` once the whole road is behind them. */
export function wallStage(progress: CampaignProgress): number | null {
  return progress.stagesCleared >= TOTAL_STAGES ? null : progress.stagesCleared + 1;
}

/** Has this stage been beaten before? Cleared stages are re-enterable, and pay nothing. */
export function isCleared(progress: CampaignProgress, stage: number): boolean {
  return stage <= progress.stagesCleared;
}

/** May a player set foot on this stage at all? Only the ones behind them, plus the wall. */
export function isReachable(progress: CampaignProgress, stage: number): boolean {
  return isValidStage(stage) && stage <= progress.stagesCleared + 1;
}

export type PushRefusal =
  | { readonly kind: 'no-hero' }
  | { readonly kind: 'road-finished' }
  | { readonly kind: 'not-reached'; readonly wall: number }
  | { readonly kind: 'out-of-vigor'; readonly needed: number; readonly available: number };

/**
 * May the player fight this stage right now?
 *
 * Every refusal is separate and named, because "you cannot" is the least useful thing a refusal
 * can say. The screen renders each of these as its own sentence.
 */
export function checkPush(options: {
  readonly stage: number;
  readonly progress: CampaignProgress;
  readonly vigor: number;
  readonly hasHero: boolean;
}): PushRefusal | null {
  if (!options.hasHero) return { kind: 'no-hero' };

  if (!isValidStage(options.stage)) {
    return wallStage(options.progress) === null
      ? { kind: 'road-finished' }
      : { kind: 'not-reached', wall: options.progress.stagesCleared + 1 };
  }
  if (!isReachable(options.progress, options.stage)) {
    return { kind: 'not-reached', wall: options.progress.stagesCleared + 1 };
  }
  if (options.vigor < STAGE_VIGOR_COST) {
    return { kind: 'out-of-vigor', needed: STAGE_VIGOR_COST, available: options.vigor };
  }
  return null;
}

export interface StageSpoils {
  readonly gold: number;
  readonly xp: number;
  readonly dice: number;
}

const NOTHING: StageSpoils = { gold: 0, xp: 0, dice: 0 };

export interface PushOutcome {
  readonly battle: BattleResult;
  readonly won: boolean;
  readonly stage: number;
  readonly stageLevel: number;
  readonly chapter: number;
  readonly isBoss: boolean;
  /** A stage already beaten: the fight is real, the rewards are not. */
  readonly practice: boolean;
  /** True when this win took the last stage of a chapter — the ceremony's cue. */
  readonly chapterCleared: boolean;
  /** True when this win took stage 120. The end of the road. */
  readonly roadFinished: boolean;
  /** The share of the monster's health this attempt took off, 0–1. */
  readonly share: number;
  /** Whether that beat the previous best on the wall — the screen animates the bar if so. */
  readonly newBest: boolean;
  readonly vigorSpent: number;
  readonly spoils: StageSpoils;
  readonly progress: CampaignProgress;
}

/**
 * Fight one stage and take what follows.
 *
 * Deterministic in `(worldSeed, stage, attemptNumber)`: calling it twice with the same progress
 * produces the same battle log and the same rewards. The screen relies on that — it resolves once
 * to play the fight and the store resolves again to grant what the fight earned, and the two must
 * agree about what happened.
 *
 * Returns `null` only for a stage that does not exist; every other refusal is `checkPush`'s job,
 * because a caller that has already asked should not have to handle a second vocabulary.
 */
export function push(options: {
  readonly stage: number;
  readonly hero: Hero;
  readonly progress: CampaignProgress;
  readonly worldSeed: number;
  readonly now: number;
  readonly bonus?: PayoutBonus;
  /** The active pet walks the road too (pets spec §2). */
  readonly petBoost?: PetContribution | null;
}): PushOutcome | null {
  const { stage, hero, progress, worldSeed, now, bonus = NO_BONUS, petBoost = null } = options;
  if (!isReachable(progress, stage)) return null;

  const foe = buildStageCombatant(stage);
  if (!foe) return null;

  const practice = isCleared(progress, stage);
  const attempt = progress.attempts + 1;
  const seed = deriveSeed(worldSeed, 'campaign', stage, attempt);
  const battle = fight(buildHeroCombatant(hero, 'hero', petBoost), foe, seed);

  const won = battle.winner === 'a';
  const share = attemptShare(foe.maxHealth, battle.remainingHealth.b);
  const boss = isBossStage(stage);

  /*
   * The best attempt only tracks the wall.
   *
   * Practising an old stage must not overwrite it — a player who wins stage 3 at 100% while stuck
   * on stage 47 has not made progress on 47, and a bar that says otherwise is a lie in the shape
   * of encouragement.
   */
  const onWall = !practice;
  const newBest = onWall && share > progress.bestAttempt;

  const base = {
    battle,
    won,
    stage,
    stageLevel: stageLevel(stage),
    chapter: chapterOf(stage),
    isBoss: boss,
    practice,
    share,
    newBest,
    vigorSpent: STAGE_VIGOR_COST,
  } as const;

  if (!won) {
    return {
      ...base,
      chapterCleared: false,
      roadFinished: false,
      spoils: NOTHING,
      progress: {
        ...progress,
        attempts: attempt,
        bestAttempt: onWall ? Math.max(progress.bestAttempt, share) : progress.bestAttempt,
      },
    };
  }

  if (practice) {
    // Won, and it counted for nothing but the practice. The Vigor still went.
    return {
      ...base,
      chapterCleared: false,
      roadFinished: false,
      spoils: NOTHING,
      progress: { ...progress, attempts: attempt },
    };
  }

  const payout = stagePayout(stage, hero.level, bonus);
  const chapterCleared = boss;
  const roadFinished = stage >= TOTAL_STAGES;

  return {
    ...base,
    chapterCleared,
    roadFinished,
    spoils: {
      gold: payout.gold,
      xp: payout.xp,
      // A chapter is a real milestone and pays a die for it; Golden Dice are earned, never sold.
      dice: chapterCleared ? CHAPTER_DICE : 0,
    },
    progress: {
      stagesCleared: stage,
      // The wall moved, so the old target is spent. Nothing has been attempted on the new one yet.
      bestAttempt: 0,
      attempts: attempt,
      finishedAt: roadFinished ? now : progress.finishedAt,
    },
  };
}

/** How far through its chapter the road has got, 0–1 — the chapter's own progress bar. */
export function chapterProgress(progress: CampaignProgress, chapter: number): number {
  const first = (chapter - 1) * STAGES_PER_CHAPTER;
  const done = Math.max(0, Math.min(STAGES_PER_CHAPTER, progress.stagesCleared - first));
  return done / STAGES_PER_CHAPTER;
}

/** Which step of its chapter the wall is on, for "III · 7 of 12". */
export function wallPosition(
  progress: CampaignProgress,
): { readonly chapter: number; readonly step: number } | null {
  const wall = wallStage(progress);
  if (wall === null) return null;
  return { chapter: chapterOf(wall), step: stepOf(wall) };
}
