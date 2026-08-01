/**
 * The Long Road as save-to-save transitions.
 *
 * `engine/campaign` proves the fight and the curve; this proves the *bank*. One stage moves five
 * things at once — Vigor, gold, XP, the wall and the progress ledger — and the interesting cases
 * are the ones where some of those must move and the rest must not:
 *
 * - a **loss** takes the Vigor and nothing else, and leaves the wall exactly where it was;
 * - a **practice win** takes the Vigor and pays nothing, which is the rule that stops a hundred
 *   Vigor a day becoming a hundred stages of income;
 * - a **refusal** is a no-op, not a partial charge;
 * - `campaignStages` is credited on new ground only, so a task that says "clear three stages"
 *   cannot be finished by clicking stage one three times;
 * - the views the screen draws (`chapterView`, `openChapters`, `wallView`) agree with the ledger
 *   rather than keeping their own idea of where the player is.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { createHero } from '@/engine/hero/actions';
import { createNewSave, type Hero, type SaveFile } from '@/engine/save/schema';
import { generateItem } from '@/engine/items/generate';
import { SLOT_IDS } from '@/engine/items/types';
import { CHAPTERS, STAGES_PER_CHAPTER, TOTAL_STAGES } from '@/data/campaign';
import { xpNeeded } from '@/engine/progression/xp';
import { STAGE_VIGOR_COST } from '@/engine/campaign/stages';
import {
  chapterView,
  fightStage,
  openChapters,
  roadOf,
  wallView,
  type FightStageResult,
} from './campaignActions';

const NOW = new Date('2026-08-05T10:00:00').getTime();
const SEED = 4_411_902;

/**
 * A hero on curve at `level` — geared *and* trained.
 *
 * CLAUDE.md: "on curve" means both. A hand-built hero with perfect gear and untouched attributes
 * sits well under the line the monsters are built against, and every conclusion drawn from one is
 * wrong in the same direction.
 */
function heroAt(level: number): Hero {
  const rng = createRng(SEED, 'fixture');
  const base = createHero({
    name: 'Ysolde Marrow',
    classId: 'warrior',
    now: NOW,
    startingGold: 50_000,
    rng,
  });

  const equipment = Object.fromEntries(
    SLOT_IDS.map((slot) => [
      slot,
      generateItem({ level, slot, rarity: 'uncommon', classId: 'warrior', rng }),
    ]),
  );

  const trained = Math.max(0, Math.round(level * 1.6));
  return {
    ...base,
    level,
    equipment,
    trained: { str: trained, dex: 0, int: 0, con: Math.round(trained / 2), lck: 0 },
  };
}

function save(over: { level?: number; cleared?: number; vigor?: number } = {}): SaveFile {
  const base = createNewSave({ slot: 1, worldSeed: SEED, now: NOW });
  return {
    ...base,
    hero: heroAt(over.level ?? 12),
    activity: { ...base.activity, vigor: over.vigor ?? 100 },
    campaign: { ...base.campaign, stagesCleared: over.cleared ?? 0 },
  };
}

/** Fight the wall until it falls or the budget runs out. Returns the save as it ends up. */
function pushUntil(start: SaveFile, stopAfter: number): { save: SaveFile; cleared: number } {
  let current = start;
  for (let attempt = 0; attempt < stopAfter; attempt += 1) {
    const wall = roadOf(current).stagesCleared + 1;
    const result = fightStage(current, wall, NOW);
    if (!result.ok) break;
    current = result.save;
  }
  return { save: current, cleared: roadOf(current).stagesCleared };
}

/** The last stage of a chapter — the boss, and the only two-sided wall on the road. */
function bossOf(chapter: number): number {
  return chapter * STAGES_PER_CHAPTER;
}

function ok(result: FightStageResult) {
  if (!result.ok) throw new Error(`refused: ${result.refusal.kind}`);
  return result;
}

describe('fighting a stage', () => {
  it('spends exactly one Vigor and pays a first clear', () => {
    const before = save({ level: 12 });
    const result = ok(fightStage(before, 1, NOW));

    expect(result.outcome.won).toBe(true);
    expect(result.outcome.practice).toBe(false);
    expect(result.save.activity.vigor).toBe(before.activity.vigor - STAGE_VIGOR_COST);
    expect(result.save.hero!.gold).toBeGreaterThan(before.hero!.gold);
    expect(result.save.campaign.stagesCleared).toBe(1);
    expect(result.save.campaign.attempts).toBe(1);
  });

  it('takes the Vigor on a loss and leaves the wall standing', () => {
    // A level-one hero against a level-eight boss: the wall is doing its job.
    const before = save({ level: 1, cleared: bossOf(1) - 1 });
    const result = ok(fightStage(before, bossOf(1), NOW));

    expect(result.outcome.won).toBe(false);
    expect(result.save.activity.vigor).toBe(before.activity.vigor - STAGE_VIGOR_COST);
    // Nothing else moved: same gold, same level, same ground.
    expect(result.save.hero!.gold).toBe(before.hero!.gold);
    expect(result.save.hero!.level).toBe(before.hero!.level);
    expect(result.save.campaign.stagesCleared).toBe(before.campaign.stagesCleared);
    // What a loss *does* leave behind is a mark on the wall.
    expect(result.save.campaign.attempts).toBe(1);
    expect(result.save.campaign.bestAttempt).toBeGreaterThan(0);
  });

  it('pays nothing for a stage already cleared, and still charges for it', () => {
    const walked = pushUntil(save({ level: 12 }), 5);
    expect(walked.cleared).toBeGreaterThanOrEqual(3);

    const before = walked.save;
    const result = ok(fightStage(before, 1, NOW));

    expect(result.outcome.practice).toBe(true);
    expect(result.outcome.spoils).toEqual({ gold: 0, xp: 0, dice: 0 });
    expect(result.save.hero!.gold).toBe(before.hero!.gold);
    expect(result.save.hero!.xp).toBe(before.hero!.xp);
    expect(result.save.activity.vigor).toBe(before.activity.vigor - STAGE_VIGOR_COST);
    // And it does not move the road in either direction.
    expect(result.save.campaign.stagesCleared).toBe(before.campaign.stagesCleared);
  });

  it('credits new ground only, so practice cannot finish a daily task', () => {
    const first = ok(fightStage(save({ level: 12 }), 1, NOW));
    expect(first.save.tasks.lifetime['campaignStages']).toBe(1);

    // Twice more over the same stage. The counter must not budge.
    const twice = ok(fightStage(first.save, 1, NOW));
    const thrice = ok(fightStage(twice.save, 1, NOW));
    expect(thrice.save.tasks.lifetime['campaignStages']).toBe(1);
    // Three fights happened, though — the attempt counter is the honest one.
    expect(thrice.save.campaign.attempts).toBe(3);
  });

  it('refuses a stage past the wall without touching the save', () => {
    const before = save({ level: 12 });
    const result = fightStage(before, 40, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toEqual({ kind: 'not-reached', wall: 1 });
  });

  it('refuses when the day is spent, and says how short they are', () => {
    const result = fightStage(save({ vigor: 0 }), 1, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toEqual({
      kind: 'out-of-vigor',
      needed: STAGE_VIGOR_COST,
      available: 0,
    });
  });

  it('refuses with no hero rather than throwing', () => {
    const empty = createNewSave({ slot: 1, worldSeed: SEED, now: NOW });
    const result = fightStage(empty, 1, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toEqual({ kind: 'no-hero' });
  });

  it('reports the level the hero crossed into, for the HUD', () => {
    const base = save({ level: 12 });
    // One XP short of thirteen, so the stage's payout is guaranteed to carry them over.
    const start: SaveFile = { ...base, hero: { ...base.hero!, xp: xpNeeded(12) - 1 } };
    const result = ok(fightStage(start, 1, NOW));

    expect(result.outcome.won).toBe(true);
    expect(result.leveledTo).toBe(13);
    expect(result.save.hero!.level).toBe(13);
  });

  it('reports no level when the win did not earn one', () => {
    const result = ok(fightStage(save({ level: 12 }), 1, NOW));
    expect(result.leveledTo).toBeNull();
  });

  it('is deterministic — the same save fought twice gives the same fight', () => {
    const before = save({ level: 12 });
    const a = ok(fightStage(before, 1, NOW));
    const b = ok(fightStage(before, 1, NOW));

    expect(a.outcome.battle.log).toEqual(b.outcome.battle.log);
    expect(a.outcome.spoils).toEqual(b.outcome.spoils);
  });

  it('makes the *next* attempt a different fight, so a wall is worth coming back to', () => {
    // Same stage, one attempt apart. A seed fixed per stage would make these identical, and a
    // wall you lost to would stay lost no matter what you bought.
    const before = save({ level: 1, cleared: bossOf(1) - 1 });
    const first = ok(fightStage(before, bossOf(1), NOW));
    const second = ok(fightStage(first.save, bossOf(1), NOW));

    expect(second.outcome.battle.log).not.toEqual(first.outcome.battle.log);
  });
});

describe('the views the road draws', () => {
  it('opens one chapter at a time, and only the one the player has reached', () => {
    expect(openChapters(save({ cleared: 0 }))).toBe(1);
    expect(openChapters(save({ cleared: STAGES_PER_CHAPTER - 1 }))).toBe(1);
    // Clearing a chapter's last stage is what opens the next.
    expect(openChapters(save({ cleared: STAGES_PER_CHAPTER }))).toBe(2);
    expect(openChapters(save({ cleared: TOTAL_STAGES }))).toBe(CHAPTERS.length);
  });

  it('marks exactly one stage on the whole road as the wall', () => {
    const current = save({ cleared: 20 });
    const walls = CHAPTERS.flatMap(
      (chapter) => chapterView(current, chapter.chapter)?.stages.filter((s) => s.isWall) ?? [],
    );

    expect(walls).toHaveLength(1);
    expect(walls[0]?.stage).toBe(21);
  });

  it('draws a chapter as cleared / wall / out of reach, in that order', () => {
    const view = chapterView(save({ cleared: 14 }), 2);
    expect(view).not.toBeNull();
    if (!view) return;

    // Chapter 2 is stages 13–24, and this player has walked two of them.
    expect(view.stages[0]?.stage).toBe(13);
    expect(view.clearedCount).toBe(2);
    expect(view.complete).toBe(false);
    expect(view.open).toBe(true);
    expect(view.stages.map((stage) => stage.cleared)).toEqual([
      true,
      true,
      ...Array.from({ length: STAGES_PER_CHAPTER - 2 }, () => false),
    ]);
    expect(view.stages.filter((stage) => stage.reachable)).toHaveLength(3);
    expect(view.stages.at(-1)?.isBoss).toBe(true);
  });

  it('has no chapter beyond the last, rather than an empty one', () => {
    expect(chapterView(save(), CHAPTERS.length + 1)).toBeNull();
    expect(chapterView(save(), 0)).toBeNull();
  });

  it('describes the wall with the monster’s own numbers, and what beating it pays', () => {
    const view = wallView(save({ cleared: 11 }));
    expect(view).not.toBeNull();
    if (!view) return;

    expect(view.stage).toBe(12);
    expect(view.chapter).toBe(1);
    expect(view.step).toBe(STAGES_PER_CHAPTER);
    expect(view.isBoss).toBe(true);
    // A boss announces its signature before the first blow — that is the whole point of the panel.
    expect(view.signature?.label).toBeTruthy();
    expect(view.health).toBeGreaterThan(0);
    expect(view.reward.gold).toBeGreaterThan(0);
    expect(view.reward.xp).toBeGreaterThan(0);
  });

  it('has no wall once the road is behind them', () => {
    expect(wallView(save({ cleared: TOTAL_STAGES }))).toBeNull();
  });
});
