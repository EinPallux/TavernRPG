import { describe, expect, it } from 'vitest';
import {
  BOSS_BUDGET,
  CHAPTERS,
  CHAPTER_COUNT,
  STAGES_PER_CHAPTER,
  TOTAL_STAGES,
  chapterOf,
  firstStageOf,
  isBoss,
  isBossStage,
  isValidStage,
  stageBudget,
  stageLevel,
  stageMonster,
  stepOf,
} from './campaign';
import { ZONES, ZONES_BY_ID } from './zones';
import { MONSTERS_BY_ID } from './monsters';

/**
 * The road, checked end to end (campaign spec §1).
 *
 * A campaign is a hundred and twenty numbers, and every way it can be wrong is quiet: a chapter
 * that is easier than the one before it, a stage with nothing standing on it, a boss that is not
 * harder than the stage in front of it. None of that throws. All of it is arithmetic.
 */

describe('the Long Road', () => {
  it('is one chapter per zone, in the order the road leaves town', () => {
    expect(CHAPTERS).toHaveLength(CHAPTER_COUNT);
    expect(CHAPTER_COUNT).toBe(ZONES.length);
    expect(TOTAL_STAGES).toBe(CHAPTER_COUNT * STAGES_PER_CHAPTER);

    CHAPTERS.forEach((chapter, index) => {
      expect(chapter.chapter, 'chapters are numbered by their position').toBe(index + 1);
      expect(ZONES_BY_ID[chapter.zoneId], `${chapter.name} names a zone that exists`).toBeDefined();
      expect(chapter.zoneId, 'the road walks the zones in order').toBe(ZONES[index]!.id);
    });
  });

  it('never gets easier — not once, in a hundred and twenty stages', () => {
    /*
     * The assertion the whole file is for, and the dungeon taught it: a ramp that sags is
     * invisible in the data and obvious in play. Zone level bands *overlap*, so interpolating
     * inside each band rather than declaring the chapter's own range would dip at three chapter
     * boundaries — the road would get easier the moment you beat a boss.
     *
     * Difficulty is (level, then budget): a stage at the same level as the one before it must at
     * least be worth more stat budget.
     */
    for (let stage = 2; stage <= TOTAL_STAGES; stage += 1) {
      const previous = { level: stageLevel(stage - 1), budget: stageBudget(stage - 1) };
      const current = { level: stageLevel(stage), budget: stageBudget(stage) };

      const climbed =
        current.level > previous.level ||
        (current.level === previous.level && current.budget > previous.budget);

      expect(
        climbed,
        `stage ${stage} (lv ${current.level}, ×${current.budget.toFixed(2)}) is not above ` +
          `stage ${stage - 1} (lv ${previous.level}, ×${previous.budget.toFixed(2)})`,
      ).toBe(true);
    }
  });

  it('starts at level 1 and ends past the bot ceiling', () => {
    /*
     * Stage 1 has to be beatable by the hero who has just been handed a starter kit; the last
     * stage sits above the ordinary bot ceiling, so the road outlasts the ladder.
     *
     * The end was pinned at exactly 100 until the far country added four chapters and took it to
     * 164. Pinning it again would only mean re-editing the number next time — what the road
     * actually promises is that it starts where a new hero is and finishes past where the world
     * does, and both ends of that are asserted here.
     */
    expect(stageLevel(1)).toBe(1);
    expect(stageLevel(TOTAL_STAGES)).toBeGreaterThan(100);
  });

  it('puts a named boss at the end of every chapter, and nowhere else', () => {
    for (let stage = 1; stage <= TOTAL_STAGES; stage += 1) {
      expect(isBossStage(stage)).toBe(stepOf(stage) === STAGES_PER_CHAPTER);
    }

    for (const chapter of CHAPTERS) {
      const last = firstStageOf(chapter.chapter) + STAGES_PER_CHAPTER - 1;
      const entry = stageMonster(last);
      expect(entry, `chapter ${chapter.numeral} has no boss`).not.toBeNull();
      expect(isBoss(entry!)).toBe(true);
      expect((entry as { id: string }).id).toBe(chapter.boss.id);
      expect(stageBudget(last)).toBe(BOSS_BUDGET);
    }
  });

  it('gives every stage something to fight, from its own chapter’s zone', () => {
    for (let stage = 1; stage <= TOTAL_STAGES; stage += 1) {
      const entry = stageMonster(stage);
      expect(entry, `stage ${stage} is empty`).not.toBeNull();

      if (isBossStage(stage)) continue;
      // An ordinary stage draws from the chapter's zone, which is what makes the road a journey
      // rather than a shuffled bestiary.
      const chapter = CHAPTERS[chapterOf(stage) - 1]!;
      expect(MONSTERS_BY_ID[(entry as { id: string }).id]?.zoneId, `stage ${stage}`).toBe(
        chapter.zoneId,
      );
    }
  });

  it('gives every boss a distinct name, id and signature', () => {
    const ids = CHAPTERS.map((chapter) => chapter.boss.id);
    const names = CHAPTERS.map((chapter) => chapter.boss.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);

    for (const { boss, numeral } of CHAPTERS) {
      expect(boss.signature.label.length, numeral).toBeGreaterThan(3);
      // The explainer is the whole point of a signature: a player who walls should be able to say
      // what beat them, in words, before the first blow.
      expect(boss.signature.explainer.length, numeral).toBeGreaterThan(40);
      expect(boss.flavor.length, numeral).toBeGreaterThan(10);
    }
  });

  it('re-uses the three signature shapes rather than inventing a fourth', () => {
    // The Undertavern already taught these; the road should be a place to recognise them.
    const kinds = new Set(CHAPTERS.map((chapter) => chapter.boss.signature.proc.kind));
    expect([...kinds].sort()).toEqual(['hardening', 'siphon', 'swarm-call']);
  });

  it('makes every boss a heavy, which is the difficulty dial', () => {
    /*
     * At the boss budget the archetype is worth up to fifteen hero levels and the signature two or
     * three, so only the two heavy archetypes make a wall at all — a skirmisher boss loses to a
     * hero *under* its own level. The rising wall this produces is measured in
     * `engine/campaign/campaign.test.ts` against real fights; this only pins the choice so it
     * cannot be quietly re-flavoured into a swarm.
     */
    for (const { boss, numeral } of CHAPTERS) {
      expect(['tank', 'bruiser'], `chapter ${numeral}'s boss is not a heavy`).toContain(
        boss.archetypeId,
      );
    }
    // Tanks early, bruisers late: the same archetype gets harder as the levels climb, so the
    // switch is what keeps the last four chapters from being unreachable.
    expect(CHAPTERS.slice(0, 6).every((c) => c.boss.archetypeId === 'tank')).toBe(true);
    expect(CHAPTERS.slice(6).every((c) => c.boss.archetypeId === 'bruiser')).toBe(true);
  });

  it('reads a stage number the same way from either end', () => {
    expect(chapterOf(1)).toBe(1);
    expect(stepOf(1)).toBe(1);
    expect(chapterOf(STAGES_PER_CHAPTER)).toBe(1);
    expect(stepOf(STAGES_PER_CHAPTER)).toBe(STAGES_PER_CHAPTER);
    expect(chapterOf(STAGES_PER_CHAPTER + 1)).toBe(2);
    expect(stepOf(STAGES_PER_CHAPTER + 1)).toBe(1);
    expect(chapterOf(TOTAL_STAGES)).toBe(CHAPTER_COUNT);

    for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter += 1) {
      expect(chapterOf(firstStageOf(chapter))).toBe(chapter);
      expect(stepOf(firstStageOf(chapter))).toBe(1);
    }
  });

  it('refuses a stage number off either end of the road', () => {
    expect(isValidStage(0)).toBe(false);
    expect(isValidStage(1)).toBe(true);
    expect(isValidStage(TOTAL_STAGES)).toBe(true);
    expect(isValidStage(TOTAL_STAGES + 1)).toBe(false);
    expect(isValidStage(1.5)).toBe(false);
    expect(stageMonster(0)).toBeNull();
    expect(stageMonster(TOTAL_STAGES + 1)).toBeNull();
  });
});
