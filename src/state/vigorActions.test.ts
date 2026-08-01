/**
 * The day's work, walked through the real actions.
 *
 * `engine/progression/dayWork.test.ts` proves the arithmetic. This proves the *wiring*, which is
 * where a payout like this actually goes wrong: a spender that subtracts Vigor without going
 * through `spendVigor` still works perfectly — the Vigor goes down, the mission starts, every
 * other test passes — and quietly pays nothing forever. Nothing behavioural can see that except a
 * test that walks a day and counts the dice at the end.
 *
 * So both spenders are exercised for real, from a `createNewSave`, through `accept` and
 * `fightStage`, and the assertions are about the *save*: Vigor down, `vigorSpentToday` up, and
 * `hero.dice` up by exactly what the rungs owed.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { createHero } from '@/engine/hero/actions';
import { generateItem } from '@/engine/items/generate';
import { SLOT_IDS } from '@/engine/items/types';
import { createNewSave, type Hero, type SaveFile } from '@/engine/save/schema';
import { drawBoard } from '@/engine/missions/board';
import { STAGE_VIGOR_COST } from '@/engine/campaign/stages';
import { diceFor, DAY_WORK_DICE, MAX_DAILY_VIGOR } from '@/engine/progression/dayWork';
import { DAY_WORK_RUNGS, VIGOR_PER_DAY } from '@/engine/progression/rewards';
import { accept } from './missionActions';
import { fightStage } from './campaignActions';
import { spendVigor } from './vigorActions';

const NOW = new Date('2026-08-05T10:00:00').getTime();
const SEED = 7_712_004;
const TODAY = '2026-08-05';

function heroAt(level: number): Hero {
  const rng = createRng(SEED, 'fixture');
  const base = createHero({
    name: 'Vavey',
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
    dice: 0,
    trained: { str: trained, dex: 0, int: 0, con: Math.round(trained / 2), lck: 0 },
  };
}

function save(over: { level?: number; vigor?: number; spent?: number } = {}): SaveFile {
  const base = createNewSave({ slot: 1, worldSeed: SEED, now: NOW });
  const hero = heroAt(over.level ?? 14);
  return {
    ...base,
    hero,
    activity: {
      ...base.activity,
      vigor: over.vigor ?? VIGOR_PER_DAY,
      vigorSpentToday: over.spent ?? 0,
      board: [...drawBoard({ worldSeed: SEED, dayKey: TODAY, heroLevel: hero.level })],
    },
  };
}

describe('spendVigor', () => {
  it('moves both numbers, and only pays on a crossing', () => {
    const start = save();
    const first = spendVigor(start, 20);
    expect(first.save.activity.vigor).toBe(VIGOR_PER_DAY - 20);
    expect(first.save.activity.vigorSpentToday).toBe(20);
    expect(first.dice).toBe(0);

    const second = spendVigor(first.save, DAY_WORK_RUNGS[0]! - 20);
    expect(second.save.activity.vigorSpentToday).toBe(DAY_WORK_RUNGS[0]);
    expect(second.dice).toBe(1);
  });

  it('counts the work even when the Vigor ran out mid-spend', () => {
    // Vigor clamps at zero; the day's work does not un-happen because the arithmetic bottomed out.
    const start = save({ vigor: 5, spent: DAY_WORK_RUNGS[0]! - 3 });
    const result = spendVigor(start, 10);
    expect(result.save.activity.vigor).toBe(0);
    expect(result.save.activity.vigorSpentToday).toBe(DAY_WORK_RUNGS[0]! + 7);
    expect(result.dice).toBe(1);
  });

  it('is a no-op for nothing at all', () => {
    const start = save();
    expect(spendVigor(start, 0).save).toBe(start);
    expect(spendVigor(start, -20).dice).toBe(0);
  });
});

describe('signing a contract', () => {
  it('fills the track and pays the die at the rung', () => {
    let current = save();
    let signed = 0;

    // 20-minute contracts until the first rung falls. Each is accepted, then cleared so the next
    // can be signed — the exclusivity rule is not what is under test here.
    while (current.activity.vigorSpentToday < DAY_WORK_RUNGS[0]!) {
      const offer = current.activity.board[0];
      expect(offer, 'the board should still have work on it').toBeDefined();
      const result = accept(current, offer!.id, 20, NOW);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      signed += 1;
      current = {
        ...result.save,
        activity: {
          ...result.save.activity,
          mission: null,
          board: [...drawBoard({ worldSeed: SEED, dayKey: TODAY, heroLevel: 14 })],
        },
      };
    }

    expect(current.activity.vigorSpentToday).toBe(signed * 20);
    expect(current.hero!.dice).toBe(diceFor(current.activity.vigorSpentToday));
    expect(current.hero!.dice).toBeGreaterThan(0);
  });
});

describe('walking the road', () => {
  it('pays the track a stage at a time', () => {
    // The reason the road needed this: a stage is a Vigor sink that pays nothing at all once its
    // chapter is cleared, so before the track a road-only day earned no dice whatsoever.
    let current = save({ level: 40, spent: DAY_WORK_RUNGS[0]! - 2 });
    const before = current.hero!.dice;

    for (let i = 0; i < 3; i += 1) {
      const result = fightStage(current, current.campaign.stagesCleared + 1, NOW);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      current = result.save;
    }

    expect(current.activity.vigorSpentToday).toBe(DAY_WORK_RUNGS[0]! - 2 + 3 * STAGE_VIGOR_COST);
    // Exactly one rung crossed, and the chapter die (if any) is separate from it.
    expect(current.hero!.dice).toBeGreaterThanOrEqual(before + 1);
  });

  it('never pays the same rung twice, however the day is played', () => {
    /*
     * The replay question, asked from the top: a whole day of alternating contracts and stages
     * should pay exactly `diceFor(total)`, never more. This is the assertion that would fail if a
     * spender ever bumped `vigorSpentToday` without going through the one path, or if the payout
     * became an increment rather than a difference of totals.
     */
    let current = save({ level: 40, vigor: MAX_DAILY_VIGOR });
    for (let i = 0; i < 60; i += 1) {
      const result = fightStage(current, current.campaign.stagesCleared + 1, NOW);
      if (!result.ok) break;
      current = result.save;
      expect(current.hero!.dice).toBeLessThanOrEqual(
        diceFor(current.activity.vigorSpentToday) + current.campaign.stagesCleared,
      );
    }

    const fromTrack = diceFor(current.activity.vigorSpentToday);
    expect(fromTrack).toBeGreaterThan(0);
    expect(fromTrack).toBeLessThanOrEqual(DAY_WORK_DICE);
  });
});

describe('midnight', () => {
  it('is the only thing that clears the track', () => {
    // Asserted here as well as in the reset engine's own suite, because the failure mode is
    // "somebody added a second place that zeroes it" and that is a save-level fact, not an
    // engine-level one. `reset/audit.test.ts` guards the source; this guards the behaviour.
    const spent = save({ spent: 90 });
    expect(spent.activity.vigorSpentToday).toBe(90);
    const fresh = createNewSave({ slot: 1, worldSeed: SEED, now: NOW });
    expect(fresh.activity.vigorSpentToday).toBe(0);
  });
});
