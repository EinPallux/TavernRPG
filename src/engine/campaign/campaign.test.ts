import { describe, expect, it } from 'vitest';
import { CHAPTERS, STAGES_PER_CHAPTER, TOTAL_STAGES, stageLevel } from '@/data/campaign';
import { buildReferenceCombatant, monsterStatBudget } from '@/engine/combat/combatant';
import { fight } from '@/engine/combat/fight';
import { createRng } from '@/engine/rng';
import { CLASSES } from '@/data/classes';
import { createHero } from '@/engine/hero/actions';
import { addItem, equipItem } from '@/engine/hero/actions';
import { generateItem } from '@/engine/items/generate';
import type { Hero } from '@/engine/save/schema';
import {
  BOSS_REWARD_MULTIPLIER,
  STAGE_VIGOR_COST,
  buildStageCombatant,
  stagePayout,
} from './stages';
import {
  checkPush,
  emptyProgress,
  isCleared,
  isReachable,
  push,
  wallStage,
  type CampaignProgress,
} from './push';

/**
 * The Long Road, as a machine (campaign spec §2–§3).
 *
 * Two halves. The first is the loop's rules — advance on a win, keep the ground on a loss, pay
 * once and never again — which are cheap and exact. The second measures the **wall**: how many
 * levels above a boss's own level an on-curve hero needs before the fight is even. That is the
 * whole design in one number per chapter, and it cannot be read off the data because the archetype
 * is worth up to fifteen levels and the signature two or three.
 */

const SEED = 12_345;

/**
 * A real hero, geared *and* trained.
 *
 * "On curve" means both (CLAUDE.md): a level-30 hero still swinging their starter blade with
 * untouched attributes loses to a level-14 monster, which is correct behaviour and useless as a
 * fixture. Same 62/28/10 split `materializeBot` gives a bot on the same budget, and the same
 * helper the dungeon tests use — the two systems must be measured against the same player.
 */
function heroAt(level: number): Hero {
  let subject = createHero({
    name: 'Walker',
    classId: 'warrior',
    now: 0,
    rng: createRng(SEED, 'starter'),
  });
  subject = { ...subject, level };

  const rng = createRng(SEED, 'test:on-curve');
  for (const slot of ['weapon', 'chest', 'helmet', 'gloves', 'boots', 'belt'] as const) {
    const item = generateItem({ slot, rarity: 'rare', classId: subject.classId, level, rng });
    subject = addItem(subject, item).hero;
    subject = equipItem(subject, item);
  }

  const budget = monsterStatBudget(level);
  return {
    ...subject,
    trained: {
      ...subject.trained,
      str: Math.round(budget * 0.62),
      con: Math.round(budget * 0.28),
      lck: Math.round(budget * 0.1),
    },
  };
}

describe('walking the road', () => {
  it('starts everybody at the first stage', () => {
    const progress = emptyProgress();
    expect(progress.stagesCleared).toBe(0);
    expect(wallStage(progress)).toBe(1);
    expect(isReachable(progress, 1)).toBe(true);
    expect(isReachable(progress, 2)).toBe(false);
    expect(isCleared(progress, 1)).toBe(false);
  });

  it('lets you at the wall and everything behind it, and nothing beyond', () => {
    const progress: CampaignProgress = { ...emptyProgress(), stagesCleared: 20 };
    expect(isReachable(progress, 1)).toBe(true);
    expect(isReachable(progress, 20)).toBe(true);
    expect(isReachable(progress, 21)).toBe(true);
    expect(isReachable(progress, 22)).toBe(false);
    expect(isCleared(progress, 20)).toBe(true);
    expect(isCleared(progress, 21)).toBe(false);
  });

  it('refuses in words rather than by failing', () => {
    const progress = emptyProgress();
    expect(checkPush({ stage: 1, progress, vigor: 10, hasHero: false })).toEqual({
      kind: 'no-hero',
    });
    expect(checkPush({ stage: 9, progress, vigor: 10, hasHero: true })).toEqual({
      kind: 'not-reached',
      wall: 1,
    });
    expect(checkPush({ stage: 1, progress, vigor: 0, hasHero: true })).toEqual({
      kind: 'out-of-vigor',
      needed: STAGE_VIGOR_COST,
      available: 0,
    });
    expect(checkPush({ stage: 1, progress, vigor: 1, hasHero: true })).toBeNull();

    const finished: CampaignProgress = { ...progress, stagesCleared: TOTAL_STAGES };
    expect(wallStage(finished)).toBeNull();
    expect(
      checkPush({ stage: TOTAL_STAGES + 1, progress: finished, vigor: 9, hasHero: true }),
    ).toEqual({ kind: 'road-finished' });
  });

  it('advances on a win and pays for it, once', () => {
    // A level-20 hero against stage 1 is not a fight, which is what this test wants.
    const hero = heroAt(20);
    const outcome = push({ stage: 1, hero, progress: emptyProgress(), worldSeed: SEED, now: 1 });

    expect(outcome).not.toBeNull();
    expect(outcome!.won).toBe(true);
    expect(outcome!.practice).toBe(false);
    expect(outcome!.progress.stagesCleared).toBe(1);
    expect(outcome!.vigorSpent).toBe(STAGE_VIGOR_COST);
    expect(outcome!.spoils.gold).toBeGreaterThan(0);
    expect(outcome!.spoils.xp).toBeGreaterThan(0);

    // Re-entering is practice: the fight is real, the money is not.
    const again = push({ stage: 1, hero, progress: outcome!.progress, worldSeed: SEED, now: 2 });
    expect(again!.practice).toBe(true);
    expect(again!.won).toBe(true);
    expect(again!.spoils).toEqual({ gold: 0, xp: 0, dice: 0 });
    expect(again!.vigorSpent, 'practice still costs the Vigor').toBe(STAGE_VIGOR_COST);
    expect(again!.progress.stagesCleared, 'and cannot move the wall').toBe(1);
  });

  it('keeps the ground on a loss, and leaves a target behind', () => {
    // A level-1 hero against a late boss is not a fight either, in the other direction.
    const hero = heroAt(1);
    const progress: CampaignProgress = { ...emptyProgress(), stagesCleared: 95 };
    const outcome = push({ stage: 96, hero, progress, worldSeed: SEED, now: 1 });

    expect(outcome!.won).toBe(false);
    expect(outcome!.progress.stagesCleared, 'a loss never costs a stage').toBe(95);
    expect(outcome!.spoils).toEqual({ gold: 0, xp: 0, dice: 0 });
    expect(outcome!.share).toBeGreaterThanOrEqual(0);
    expect(outcome!.progress.bestAttempt).toBe(outcome!.share);
    expect(outcome!.progress.attempts).toBe(1);
  });

  it('only lets the wall’s own attempts move the best-attempt bar', () => {
    /*
     * A player stuck on stage 47 who goes and wins stage 3 at full health has not made progress on
     * 47, and a bar that says otherwise is a lie in the shape of encouragement.
     */
    const progress: CampaignProgress = { ...emptyProgress(), stagesCleared: 12, bestAttempt: 0.4 };
    const practice = push({ stage: 3, hero: heroAt(40), progress, worldSeed: SEED, now: 1 });

    expect(practice!.practice).toBe(true);
    expect(practice!.newBest).toBe(false);
    expect(practice!.progress.bestAttempt).toBe(0.4);
  });

  it('gives the same fight for the same attempt, and a different one for the next', () => {
    const hero = heroAt(6);
    const progress: CampaignProgress = { ...emptyProgress(), stagesCleared: 7 };

    const a = push({ stage: 8, hero, progress, worldSeed: SEED, now: 1 })!;
    const b = push({ stage: 8, hero, progress, worldSeed: SEED, now: 1 })!;
    expect(b.battle.log.length, 'the screen plays it and the store re-runs it').toBe(
      a.battle.log.length,
    );
    expect(b.won).toBe(a.won);

    // The next attempt is a genuinely different fight, which is why a wall is worth re-trying
    // after buying a sword rather than being the same loss forever.
    const next = push({ stage: 8, hero, progress: a.progress, worldSeed: SEED, now: 2 })!;
    expect(next.battle.log).not.toEqual(a.battle.log);
  });

  it('marks the chapter and the road as they fall', () => {
    const hero = heroAt(60);
    const beforeBoss: CampaignProgress = {
      ...emptyProgress(),
      stagesCleared: STAGES_PER_CHAPTER - 1,
    };
    const boss = push({
      stage: STAGES_PER_CHAPTER,
      hero,
      progress: beforeBoss,
      worldSeed: SEED,
      now: 5,
    })!;

    expect(boss.isBoss).toBe(true);
    expect(boss.won).toBe(true);
    expect(boss.chapterCleared).toBe(true);
    expect(boss.roadFinished).toBe(false);
    expect(boss.spoils.dice, 'a chapter pays a Golden Die').toBeGreaterThan(0);
    expect(boss.progress.bestAttempt, 'the wall moved, so the old target is spent').toBe(0);
  });

  it('prices a stage at its own level, so back-filling is not a farm', () => {
    // Gold is absolute, so a late-game hero sweeping chapter one is paid chapter-one money.
    const early = stagePayout(1, 90);
    const late = stagePayout(TOTAL_STAGES - 1, 90);
    expect(late.gold).toBeGreaterThan(early.gold * 10);

    // A boss pays double its neighbours.
    const beforeBoss = stagePayout(STAGES_PER_CHAPTER - 1, 50);
    const atBoss = stagePayout(STAGES_PER_CHAPTER, 50);
    expect(atBoss.gold / beforeBoss.gold).toBeGreaterThan(BOSS_REWARD_MULTIPLIER * 0.8);

    // XP is capped at the hero's own level, or one lucky win against a level-40 wall would move a
    // level-12 hero's bar by three whole levels.
    const overLevelled = stagePayout(60, 12);
    const atLevel = stagePayout(60, 60);
    expect(overLevelled.xp).toBeLessThan(atLevel.xp);
  });
});

/* ── The wall ─────────────────────────────────────────────────────────────────────── */

/**
 * Win rate of an on-curve hero of `level` against a stage, across all five classes.
 *
 * A hundred fights per reading. Forty was enough to see the shape and *not* enough to place the
 * boundary: chapters seven and eight measured +4/+4 in the tuning pass and +5/+3 here, purely on
 * sampling, which is a false failure waiting for whoever next runs CI. The band below is tolerant
 * of a level for the same reason.
 */
function winRate(level: number, stage: number, fightsPerClass = 20): number {
  let wins = 0;
  for (const definition of CLASSES) {
    for (let i = 0; i < fightsPerClass; i += 1) {
      const foe = buildStageCombatant(stage)!;
      const hero = buildReferenceCombatant(definition.id, level, 'hero');
      if (fight(hero, foe, i * 977 + stage * 13).winner === 'a') wins += 1;
    }
  }
  return wins / (CLASSES.length * fightsPerClass);
}

/**
 * Extra hero levels, above the boss's own level, needed for an even fight.
 *
 * A threshold search, and therefore the *noisiest* way to read a wall — it returns the first level
 * whose sampled win rate crosses 50%, so a rate moving five points a level turns a two-point
 * sampling wobble into a whole level of answer. Good for a headline, useless for comparing two
 * chapters, which is why the comparison below uses a fixed offset instead.
 */
function wallOf(chapter: number): number {
  const stage = chapter * STAGES_PER_CHAPTER;
  const level = stageLevel(stage);
  for (let delta = -6; delta <= 24; delta += 1) {
    if (winRate(level + delta, stage) >= 0.5) return delta;
  }
  return 99;
}

/**
 * How a chapter's boss treats a hero exactly four levels above it.
 *
 * One measurement rather than a search, and directly comparable between chapters: a boss that is a
 * harder wall than another one beats the same relative hero more often. This is the number the
 * ordering assertion uses.
 */
function rateAtFourOver(chapter: number): number {
  const stage = chapter * STAGES_PER_CHAPTER;
  return winRate(stageLevel(stage) + 4, stage, 40);
}

describe('the wall each chapter puts in front of you', () => {
  /*
   * The measurement that decides whether the road is a road.
   *
   * Too low and a chapter boss is a speed bump — you never stop, never train, and the loop the
   * campaign exists for ("battle as far as you can, then go and get stronger") never happens. Too
   * high and it is the Undertavern with extra steps.
   */
  const walls = CHAPTERS.map((chapter) => ({
    chapter: chapter.chapter,
    wall: wallOf(chapter.chapter),
  }));

  it('is a real stop by the middle of the road, and never a brick', () => {
    for (const { chapter, wall } of walls) {
      // Chapters one to three are the road teaching itself and may be beaten at level.
      const floor = chapter <= 3 ? -1 : 1;
      expect(wall, `chapter ${chapter} wall is +${wall}`).toBeGreaterThanOrEqual(floor);
      // Eight levels is about a week of play at the pace the §0 table sets. More than that and a
      // wall stops being a target and becomes a place people quit.
      expect(wall, `chapter ${chapter} wall is +${wall}`).toBeLessThanOrEqual(8);
    }
  });

  it('gets harder down the road, measured at a fixed distance', () => {
    /*
     * The same hero, four levels over each boss, ten times. A rising road means that hero wins
     * less often the further out they go — and unlike a threshold search this is one sample per
     * chapter, so it can carry an ordering claim.
     *
     * Compared in thirds rather than pair by pair: neighbouring chapters are deliberately tuned to
     * similar walls (the table in `data/campaign.ts` has three pairs at the same level), so an
     * assertion about neighbours would be asserting sampling noise.
     */
    const rates = CHAPTERS.map((chapter) => rateAtFourOver(chapter.chapter));
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;

    const early = mean(rates.slice(0, 3));
    const middle = mean(rates.slice(3, 7));
    const late = mean(rates.slice(7));
    const report = rates.map((rate, i) => `${i + 1}:${Math.round(rate * 100)}%`).join(' ');

    expect(early, report).toBeGreaterThan(middle);
    expect(middle, report).toBeGreaterThan(late);
    expect(early, `the first three chapters should be walkable — ${report}`).toBeGreaterThan(0.8);
    expect(late, `the last three should not be — ${report}`).toBeLessThan(0.6);
  });

  it('makes the last chapter the hardest thing on the road', () => {
    expect(walls[walls.length - 1]!.wall).toBeGreaterThan(walls[0]!.wall);
  });
});
