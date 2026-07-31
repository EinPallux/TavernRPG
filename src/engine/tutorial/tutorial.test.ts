/**
 * The tutorial's two engine pieces (tutorial spec §2, §4).
 *
 * The interesting test here is not "does beat 4 come after beat 3" — it is **monotonicity**. The
 * active beat is derived by walking the twelve in order and returning the first the save cannot
 * prove, which is what buys resumability for free; the price is that a predicate which can go
 * back to false drags the whole tour backwards with it.
 *
 * That is not hypothetical. The first draft finished beat 4 on "are your bags empty?", which is
 * false again the moment a second contract drops something — and beat 7 is *"sell Bram what you
 * are not wearing"*, which requires holding loot. Beat 4 would have reactivated every time the
 * player did what beat 7 asked, and the tour could never have reached beat 8. `walks forwards
 * only` below replays a whole playthrough and fails on any step that loses ground.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { createHero } from '@/engine/hero/actions';
import { createNewSave, type SaveFile } from '@/engine/save/schema';
import { BEATS, type BeatId } from '@/data/tutorial';
import { PROGRESS_METRICS, type ProgressMetric } from '@/data/progress';
import { generateItem } from '@/engine/items/generate';
import { activeBeat, beatsDone, isDone, tutorialComplete } from './beats';
import { nextHint } from './hints';

const NOW = new Date('2026-08-05T10:00:00').getTime();
const SEED = 4_242;

function fresh(level = 1): SaveFile {
  const base = createNewSave({ slot: 1, worldSeed: SEED, now: NOW });
  const hero = createHero({
    name: 'Ysolde',
    classId: 'warrior',
    now: NOW,
    startingGold: 0,
    rng: createRng(11, 'starter'),
  });
  return { ...base, hero: { ...hero, level } };
}

/** Add to the lifetime tally directly — this suite is about the predicates, not the credit path. */
function counted(save: SaveFile, metric: ProgressMetric, units: number): SaveFile {
  return {
    ...save,
    tasks: {
      ...save.tasks,
      lifetime: { ...save.tasks.lifetime, [metric]: (save.tasks.lifetime[metric] ?? 0) + units },
    },
  };
}

function wins(save: SaveFile, count: number): SaveFile {
  return {
    ...save,
    activity: { ...save.activity, missionsCompleted: save.activity.missionsCompleted + count },
  };
}

function acknowledged(save: SaveFile, id: BeatId): SaveFile {
  return { ...save, tutorial: { ...save.tutorial, acknowledged: [...save.tutorial.acknowledged, id] } };
}

/** A piece of loot in the bags — the state that used to send the tour backwards. */
function withLoot(save: SaveFile, count: number): SaveFile {
  const hero = save.hero!;
  const backpack = [...hero.backpack];
  for (let index = 0; index < count; index += 1) {
    backpack[index] = generateItem({
      slot: 'helmet',
      rarity: 'common',
      classId: hero.classId,
      level: 3,
      rng: createRng(100 + index, 'loot'),
    });
  }
  return { ...save, hero: { ...hero, backpack } };
}

describe('the curriculum', () => {
  it('starts a brand-new hero at the quest table', () => {
    expect(activeBeat(fresh())?.id).toBe('welcome-in');
  });

  it('shows nothing before there is a hero', () => {
    const base = createNewSave({ slot: 1, worldSeed: SEED, now: NOW });
    expect(activeBeat(base)).toBeNull();
  });

  it('stops at a beat the hero has not levelled into rather than skipping it', () => {
    // Everything through beat 6 is behind them, but the Armory opens at level 2.
    const played = counted(
      counted(counted(wins(fresh(1), 2), 'goldTrained', 500), 'missionsAccepted', 2),
      'missionsReturned',
      2,
    );
    const stuck = counted(played, 'itemsEquipped', 1);
    expect(activeBeat(stuck)).toBeNull();

    // One level and the same save resumes at the beat that was waiting.
    const levelled = { ...stuck, hero: { ...stuck.hero!, level: 2 } };
    expect(activeBeat(levelled)?.id).toBe('the-armory');
  });

  it('treats opting out as "shown nothing", not as "finished nothing"', () => {
    const out = { ...fresh(), tutorial: { ...fresh().tutorial, optedOut: true } };
    expect(activeBeat(out)).toBeNull();
    expect(beatsDone(out)).toBe(BEATS.length);
    expect(tutorialComplete(out)).toBe(true);
  });

  it('finishes a read beat only on acknowledgement', () => {
    const board = BEATS.find((entry) => entry.id === 'notice-board')!;
    const before = fresh(3);
    expect(isDone(board, before)).toBe(false);
    expect(isDone(board, acknowledged(before, 'notice-board'))).toBe(true);
  });
});

describe('every beat is monotone', () => {
  /**
   * A whole playthrough, step by step, in the order a player produces the facts.
   *
   * Deliberately includes the two shapes that broke the first draft: loot sitting in the bags
   * while later beats are live, and a second contract in flight.
   */
  const PLAYTHROUGH: readonly (readonly [string, (save: SaveFile) => SaveFile])[] = [
    ['signs a contract', (save) => counted(save, 'missionsAccepted', 1)],
    ['the contract comes home', (save) => counted(save, 'missionsReturned', 1)],
    ['wins the fight', (save) => wins(save, 1)],
    ['picks up a drop', (save) => withLoot(save, 1)],
    ['puts it on', (save) => counted(save, 'itemsEquipped', 1)],
    ['trains an attribute', (save) => counted(save, 'goldTrained', 400)],
    ['signs a second contract', (save) => counted(save, 'missionsAccepted', 1)],
    ['brings it home', (save) => counted(save, 'missionsReturned', 1)],
    ['wins again', (save) => wins(save, 1)],
    ['and comes back with two more pieces', (save) => withLoot(save, 3)],
    ['reaches level 2', (save) => ({ ...save, hero: { ...save.hero!, level: 2 } })],
    ['sells one to Bram', (save) => counted(save, 'itemsSold', 1)],
    ['reads the Notice Board', (save) => acknowledged(save, 'notice-board')],
    ['reaches level 4', (save) => ({ ...save, hero: { ...save.hero!, level: 4 } })],
    ['takes a rank', (save) => counted(save, 'arenaWins', 1)],
    ['walks a patrol', (save) => counted(save, 'patrolHours', 4)],
    ['reads the Crier', (save) => acknowledged(save, 'overnight')],
    ['takes a rank back', (save) => counted(save, 'arenaWins', 1)],
  ];

  it('walks forwards only', () => {
    let save = fresh(1);
    let done = beatsDone(save);

    for (const [label, step] of PLAYTHROUGH) {
      save = step(save);
      const now = beatsDone(save);
      expect(now, `beats went backwards after "${label}": ${done} → ${now}`).toBeGreaterThanOrEqual(
        done,
      );
      done = now;
    }

    expect(done).toBe(BEATS.length);
    expect(activeBeat(save)).toBeNull();
  });

  it('does not reopen the paperdoll beat when the bags refill', () => {
    // The exact deadlock: beat 7 asks the player to hold loot for Bram, and beat 4 used to
    // reactivate the moment they did.
    const sold = PLAYTHROUGH.slice(0, 12).reduce((save, [, step]) => step(save), fresh(1));
    const atBoard = { ...sold, hero: { ...sold.hero!, level: 3 } };
    expect(activeBeat(atBoard)?.id).toBe('notice-board');

    // Five pieces in the bags, which is exactly what beat 7 asked them to accumulate.
    expect(activeBeat(withLoot(atBoard, 5))?.id).toBe('notice-board');
  });

  it('lets a losing streak past the fight beat rather than stranding it', () => {
    // Two contracts home, no victories: nothing left to teach about watching a fight.
    const unlucky = counted(counted(fresh(1), 'missionsAccepted', 2), 'missionsReturned', 2);
    expect(activeBeat(unlucky)?.id).toBe('first-loot');
  });
});

describe('the Next Step hint', () => {
  it('says nothing before there is a hero', () => {
    expect(nextHint(createNewSave({ slot: 1, worldSeed: SEED, now: NOW }))).toBeNull();
  });

  it('prefers the perishable one', () => {
    // A full day of Vigor with nothing signed for outranks gold sitting in the purse, because
    // midnight takes the Vigor and the gold will still be there tomorrow.
    const idle = fresh(1);
    const rich = { ...idle, hero: { ...idle.hero!, gold: 50_000 } };
    expect(nextHint(rich)?.id).toBe('vigor-burning');
  });

  it('falls through to the next rule once one is dismissed', () => {
    const idle = fresh(1);
    const rich = { ...idle, hero: { ...idle.hero!, gold: 50_000 } };
    const waved = {
      ...rich,
      tutorial: { ...rich.tutorial, dismissedHints: ['vigor-burning'] },
    };
    expect(nextHint(waved)?.id).toBe('unspent-gold');
  });

  it('sends every hint somewhere', () => {
    const idle = fresh(1);
    let save = { ...idle, hero: { ...idle.hero!, gold: 50_000 } };
    const seen: string[] = [];

    // Walk the whole rule list by waving each speaking hint away in turn.
    for (let guard = 0; guard < 20; guard += 1) {
      const hint = nextHint(save);
      if (!hint) break;
      expect(hint.place).toBeTruthy();
      expect(hint.text.length).toBeGreaterThan(10);
      seen.push(hint.id);
      save = {
        ...save,
        tutorial: { ...save.tutorial, dismissedHints: [...save.tutorial.dismissedHints, hint.id] },
      };
    }

    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('the vocabulary the beats read', () => {
  it('has a metric for each of the three mission moments', () => {
    for (const metric of ['missionsAccepted', 'missionsReturned', 'missions'] as const) {
      expect(PROGRESS_METRICS).toContain(metric);
    }
  });
});
