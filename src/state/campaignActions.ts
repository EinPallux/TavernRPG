/**
 * The Long Road, as save-to-save transitions (campaign spec §3).
 *
 * Same contract as `missionActions` and `dungeonActions`: every function takes a `SaveFile` and
 * returns a new one, and none of them reads a clock or a store. The road does the drawing; this
 * does the deciding.
 *
 * One transition carries the whole loop. `fightStage` spends the Vigor, resolves the fight, and
 * applies everything that follows — XP, gold, the chapter's Golden Die, the wall moving forward,
 * the best-attempt bar. There is no accept, no timer, no queue and no cooldown to model, because
 * a stage has none of those: the ration is Vigor and the wall is the monster.
 */

import { applyXp } from '@/engine/progression/xp';
import {
  CHAPTERS,
  CHAPTERS_BY_NUMBER,
  STAGES_PER_CHAPTER,
  TOTAL_STAGES,
  chapterOf,
  firstStageOf,
  isBoss,
  isBossStage,
  stageLevel,
  stageMonster,
  stepOf,
  type CampaignChapterDef,
} from '@/data/campaign';
import { buildStageCombatant, stagePayout, STAGE_VIGOR_COST } from '@/engine/campaign/stages';
import {
  checkPush,
  isCleared,
  isReachable,
  push as runPush,
  wallStage,
  type CampaignProgress,
  type PushOutcome,
  type PushRefusal,
} from '@/engine/campaign/push';
import type { Hero, SaveFile } from '@/engine/save/schema';
import { payoutBonus, petContribution } from './petActions';
import { credit } from './progressActions';
import { spendVigor } from './vigorActions';

export type { PushRefusal, PushOutcome, CampaignProgress };
export { STAGE_VIGOR_COST, TOTAL_STAGES, STAGES_PER_CHAPTER };

/** The road, as the save holds it. Stored in exactly this shape — nothing here is derived. */
export function roadOf(save: SaveFile): CampaignProgress {
  return save.campaign;
}

/** One stage, as the row of stones draws it. */
export interface StageView {
  readonly stage: number;
  readonly step: number;
  readonly level: number;
  readonly name: string;
  readonly flavor: string;
  readonly isBoss: boolean;
  readonly cleared: boolean;
  /** The wall: the first stage not yet cleared. At most one stage on the road is this. */
  readonly isWall: boolean;
  readonly reachable: boolean;
}

/** Everything the screen needs about one chapter. */
export interface ChapterView {
  readonly definition: CampaignChapterDef;
  readonly stages: readonly StageView[];
  readonly clearedCount: number;
  /** True once every stage in it is behind the player. */
  readonly complete: boolean;
  /** The chapter is open if its first stage is reachable — i.e. the one before it is done. */
  readonly open: boolean;
}

export function chapterView(save: SaveFile, chapter: number): ChapterView | null {
  const definition = CHAPTERS_BY_NUMBER[chapter];
  if (!definition) return null;

  const progress = roadOf(save);
  const first = firstStageOf(chapter);

  const stages = Array.from({ length: STAGES_PER_CHAPTER }, (_unused, index) => {
    const stage = first + index;
    const entry = stageMonster(stage);
    return {
      stage,
      step: stepOf(stage),
      level: stageLevel(stage),
      name: entry?.name ?? 'Something',
      flavor: entry?.flavor ?? '',
      isBoss: isBossStage(stage),
      cleared: isCleared(progress, stage),
      isWall: wallStage(progress) === stage,
      reachable: isReachable(progress, stage),
    } satisfies StageView;
  });

  const clearedCount = stages.filter((entry) => entry.cleared).length;
  return {
    definition,
    stages,
    clearedCount,
    complete: clearedCount === STAGES_PER_CHAPTER,
    open: isReachable(progress, first),
  };
}

/** Every chapter the player has reached, plus the one they are standing at the mouth of. */
export function openChapters(save: SaveFile): number {
  return Math.min(
    CHAPTERS.length,
    chapterOf(Math.min(TOTAL_STAGES, roadOf(save).stagesCleared + 1)),
  );
}

/** What is in front of the player right now, for the road's header. */
export interface WallView {
  readonly stage: number;
  readonly chapter: number;
  readonly step: number;
  readonly level: number;
  readonly name: string;
  readonly flavor: string;
  readonly isBoss: boolean;
  /** The signature's words, when the wall is a boss — announced before the first blow. */
  readonly signature: { readonly label: string; readonly explainer: string } | null;
  /** Health the monster has, so a best attempt reads as damage rather than as a percentage. */
  readonly health: number;
  readonly bestAttempt: number;
  /** What a first clear pays, so the road is a decision rather than a mystery. */
  readonly reward: { readonly gold: number; readonly xp: number };
}

export function wallView(save: SaveFile): WallView | null {
  const stage = wallStage(roadOf(save));
  if (stage === null) return null;

  const entry = stageMonster(stage);
  const foe = buildStageCombatant(stage);
  if (!entry || !foe) return null;

  return {
    stage,
    chapter: chapterOf(stage),
    step: stepOf(stage),
    level: stageLevel(stage),
    name: entry.name,
    flavor: entry.flavor,
    isBoss: isBossStage(stage),
    signature: isBoss(entry)
      ? { label: entry.signature.label, explainer: entry.signature.explainer }
      : null,
    health: foe.maxHealth,
    bestAttempt: roadOf(save).bestAttempt,
    reward: stagePayout(stage, save.hero?.level ?? 1, payoutBonus(save)),
  };
}

export type FightStageResult =
  | { readonly ok: false; readonly refusal: PushRefusal }
  | {
      readonly ok: true;
      readonly save: SaveFile;
      readonly outcome: PushOutcome;
      /** Set when the win pushed the hero over a level boundary — the HUD's cue. */
      readonly leveledTo: number | null;
    };

/**
 * Fight one stage: spend the Vigor, resolve it, apply everything that follows.
 *
 * The Vigor goes **whatever happens**, which is the only rule here that could reasonably have
 * gone the other way. Refunding a loss would make pushing into a wall free, and a free wall is one
 * a player hammers thirty times in a sitting instead of going and getting stronger — which is the
 * entire loop this feature exists for. A stage costs one Vigor to *attempt*.
 */
export function fightStage(save: SaveFile, stage: number, now: number): FightStageResult {
  const { hero } = save;
  const refusal = checkPush({
    stage,
    progress: roadOf(save),
    vigor: save.activity.vigor,
    hasHero: hero !== null,
  });
  if (refusal) return { ok: false, refusal };
  if (!hero) return { ok: false, refusal: { kind: 'no-hero' } };

  const outcome = runPush({
    stage,
    hero,
    progress: roadOf(save),
    worldSeed: save.worldSeed,
    now,
    bonus: payoutBonus(save),
    petBoost: petContribution(save),
  });
  if (!outcome)
    return { ok: false, refusal: { kind: 'not-reached', wall: roadOf(save).stagesCleared + 1 } };

  /*
   * The Vigor goes through the one spender, which is what makes the road pay on a day it clears
   * no chapter (balancing §18). A stage is one Vigor, so the road fills the day's-work track at
   * exactly the rate the mission board does — a hundred and fifty stages and a hundred and fifty
   * minutes of contracts are the same day's work, priced the same, which is the property that
   * kept this from needing a number of its own.
   */
  const paid = spendVigor({ ...save, campaign: outcome.progress }, outcome.vigorSpent);
  const spent: SaveFile = paid.save;

  const levelled = applyXp(hero.level, hero.xp, outcome.spoils.xp);
  const next: Hero = {
    ...hero,
    level: levelled.level,
    xp: levelled.xp,
    gold: hero.gold + outcome.spoils.gold,
    // A chapter's die and the day's-work die can land on the same stage, and both are owed.
    dice: hero.dice + outcome.spoils.dice + paid.dice,
  };

  /*
   * Credited on a **first clear only**, and that is a deliberate departure from `dungeonFloors`,
   * which counts a floor "first time or not".
   *
   * A dungeon floor cannot be farmed — there is a key and a cooldown in the way. A campaign stage
   * can: stage one is always there, always winnable, and costs a single Vigor. A metric that
   * counted practice would make any daily task built on it a matter of clicking the first stage
   * twenty times, which is not what "clear three stages" means to anybody reading it.
   *
   * So the unit is *new ground*, and the name says so. (CLAUDE.md: two counters that mean the same
   * thing must be counted the same way — and the converse, that two counters measuring different
   * things must not pretend otherwise.)
   */
  const newGround = outcome.won && !outcome.practice ? 1 : 0;
  const withHero: SaveFile = { ...spent, hero: next };

  return {
    ok: true,
    save: credit(withHero, 'campaignStages', newGround),
    outcome,
    leveledTo: levelled.level > hero.level ? levelled.level : null,
  };
}
