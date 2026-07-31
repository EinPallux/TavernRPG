/**
 * Dungeon engine tests.
 *
 * Four ROADMAP acceptance criteria live here. **All 30 floors are fightable with tuned walls** —
 * a statistical claim, so it gets the balance harness rather than a spot check. **Progress and
 * cooldowns persist**, which is really a claim about the transition being total. **Keys drop per
 * spec.** And **boss procs render with explainer lines**, which is half a content claim and half
 * a combat one.
 *
 * The harness is the interesting part. A dungeon's whole job is to be a *benchmark*, and a
 * benchmark that gets easier as you descend is not one — so the load-bearing assertion is that
 * the level needed to clear a floor never falls as the floors go down. It caught a real one:
 * archetype is worth up to twelve levels of difficulty at dungeon budget, which is more than the
 * level curve gains across six floors, so the first draft's flavour-first ordering had three
 * separate places where floor N+1 was easier than floor N.
 */

import { describe, expect, it } from 'vitest';
import { buildReferenceCombatant } from '@/engine/combat/combatant';
import { fight } from '@/engine/combat/fight';
import { createRng } from '@/engine/rng';
import { xpNeeded } from '@/engine/progression/xp';
import { VIGOR_PER_DAY, goldPerVigor, xpPerVigor } from '@/engine/progression/rewards';
import { CLASS_IDS } from '@/engine/items/types';
import {
  DUNGEONS,
  FLOORS_PER_DUNGEON,
  dungeon,
  floorDef,
  floorLevel,
  isBossFloor,
  type DungeonId,
} from '@/data/dungeons';
import { createNewSave, type Hero } from '@/engine/save/schema';
import { addItem, createHero, equipItem } from '@/engine/hero/actions';
import { generateItem } from '@/engine/items/generate';
import { monsterStatBudget } from '@/engine/combat/combatant';
import {
  BOSS_BUDGET,
  FLOOR_BUDGET,
  MID_BOSS_BUDGET,
  attemptShare,
  buildFloorCombatant,
  floorBudget,
  floorPayout,
} from './floors';
import {
  LOSS_COOLDOWN_MS,
  checkDelve,
  currentFloor,
  delve,
  emptyProgress,
  type DungeonProgress,
} from './delve';
import { KEY_DROP_CHANCE, keyInPlay, rollKeyDrop } from './keys';

const SEED = 20_261_101;

/** An on-curve reference hero — the same yardstick `balance.test.ts` measures monsters against. */
function winRate(heroLevel: number, id: DungeonId, floor: number, samples = 40): number {
  let wins = 0;
  let total = 0;
  for (const classId of CLASS_IDS) {
    const hero = buildReferenceCombatant(classId, heroLevel, 'hero');
    for (let i = 0; i < samples; i += 1) {
      if (fight(hero, buildFloorCombatant(id, floor)!, i * 7919 + heroLevel * 31).winner === 'a') {
        wins += 1;
      }
      total += 1;
    }
  }
  return wins / total;
}

/**
 * The lowest on-curve level that clears a floor three times in five.
 *
 * This *is* the benchmark the hub is promising: "floor 7 wants a level-26 hero". Everything the
 * dungeon claims about being a power gauge reduces to this number behaving sensibly.
 */
function clearLevel(id: DungeonId, floor: number): number {
  const start = Math.max(3, dungeon(id).gateLevel - 12);
  for (let level = start; level <= start + 140; level += 1) {
    if (winRate(level, id, floor) >= 0.6) return level;
  }
  return -1;
}

/**
 * A real hero for the lifecycle tests, geared *and* trained.
 *
 * "On curve" means both (CLAUDE.md): a level-30 hero still swinging their starter blade with
 * untouched attributes loses to a level-14 floor, which is correct behaviour and useless as a
 * fixture. The 62/28/10 split is the one `materializeBot` gives a bot on the same stat budget.
 */
function heroAt(level: number): Hero {
  let subject = createHero({
    name: 'Delver',
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

/** A hero who will lose, but land some blows on the way — for the best-attempt bar. */
function outmatchedHero(): Hero {
  return { ...heroAt(6), level: 6 };
}

describe('the floors themselves', () => {
  it('builds every one of the thirty, at its published level and budget', () => {
    for (const definition of DUNGEONS) {
      for (let floor = 1; floor <= FLOORS_PER_DUNGEON; floor += 1) {
        const foe = buildFloorCombatant(definition.id, floor);
        expect(foe, `${definition.id} f${floor}`).not.toBeNull();
        expect(foe!.level).toBe(floorLevel(definition.id, floor));
        expect(foe!.maxHealth).toBeGreaterThan(0);
      }
    }
  });

  it('runs bosses at a heavier budget than the floors around them', () => {
    expect(floorBudget(1)).toBe(FLOOR_BUDGET);
    expect(floorBudget(5)).toBe(MID_BOSS_BUDGET);
    expect(floorBudget(10)).toBe(BOSS_BUDGET);
    // The mid-boss is the smaller wall on purpose: floor 5 teaches what floor 10 tests, and at
    // the full ×1.6 Emberdeep's floor 5 was harder than the floor below it.
    expect(MID_BOSS_BUDGET).toBeLessThan(BOSS_BUDGET);
    expect(MID_BOSS_BUDGET).toBeGreaterThan(FLOOR_BUDGET);
  });

  it('carries each boss’s signature into the fight, with its explainer', () => {
    for (const definition of DUNGEONS) {
      const boss = buildFloorCombatant(definition.id, FLOORS_PER_DUNGEON)!;
      const signature = floorDef(definition.id, FLOORS_PER_DUNGEON)!.signature!;

      expect(boss.signature?.label).toBe(signature.label);
      expect(boss.procs).toContainEqual(signature.proc);

      // And it is announced in the log, before a blow is struck — ROADMAP acceptance.
      const { log } = fight(buildReferenceCombatant('warrior', boss.level, 'hero'), boss, 3);
      const trait = log.find((event) => event.t === 'boss_trait');
      expect(trait, definition.id).toBeDefined();
      expect(trait).toMatchObject({ side: 'b', explainer: signature.explainer });
    }
  });

  it('gives an ordinary floor no signature and no boss events', () => {
    const plain = buildFloorCombatant('rat-cellars', 3)!;
    expect(plain.signature).toBeUndefined();
    const { log } = fight(buildReferenceCombatant('warrior', 30, 'hero'), plain, 5);
    expect(log.some((event) => event.t === 'boss_trait')).toBe(false);
  });
});

describe('the walls — ROADMAP acceptance', () => {
  // Measured once and shared: thirty binary searches over 200 fights each is not free.
  const ramps = DUNGEONS.map((definition) => ({
    id: definition.id,
    gateLevel: definition.gateLevel,
    levels: Array.from({ length: FLOORS_PER_DUNGEON }, (_unused, index) =>
      clearLevel(definition.id, index + 1),
    ),
  }));

  it('makes every floor fightable — none is a wall nobody can pass', () => {
    for (const ramp of ramps) {
      for (const [index, level] of ramp.levels.entries()) {
        expect(level, `${ramp.id} f${index + 1} is unclearable`).toBeGreaterThan(0);
      }
    }
  });

  it('never gets easier as it goes down', () => {
    /*
     * The assertion the whole ordering exists for, and the one that caught the first draft.
     * Non-decreasing rather than strictly increasing: two floors of equal difficulty are a
     * plateau, which is fine, while a dip means the player clears floor 7 and then bounces off
     * floor 6 they had already passed.
     */
    for (const ramp of ramps) {
      for (let floor = 2; floor <= FLOORS_PER_DUNGEON; floor += 1) {
        const previous = ramp.levels[floor - 2]!;
        const current = ramp.levels[floor - 1]!;
        expect(
          current,
          `${ramp.id}: f${floor} clears at L${current} but f${floor - 1} needs L${previous}`,
        ).toBeGreaterThanOrEqual(previous);
      }
    }
  });

  it('opens with a floor the player can take on the day they get the key', () => {
    // The door has to give something back immediately, or the key is an anticlimax.
    for (const ramp of ramps) {
      expect(ramp.levels[0], `${ramp.id} f1`).toBeLessThanOrEqual(ramp.gateLevel);
    }
  });

  it('walls the player well before the tenth floor', () => {
    // Dungeons are benchmarks, not content: a hero who just earned the key must not sweep all
    // ten in one visit, or there is nothing to come back for.
    for (const ramp of ramps) {
      expect(ramp.levels.at(-1)!, `${ramp.id} f10`).toBeGreaterThan(ramp.gateLevel + 10);
      const walledAt = ramp.levels.findIndex((level) => level > ramp.gateLevel);
      expect(walledAt, `${ramp.id} never walls`).toBeGreaterThan(0);
      expect(walledAt, `${ramp.id} walls on floor ${walledAt + 1}`).toBeLessThan(6);
    }
  });

  it('makes the final boss the hardest thing in its dungeon', () => {
    for (const ramp of ramps) {
      expect(ramp.levels.at(-1)!).toBe(Math.max(...ramp.levels));
    }
  });
});

describe('the delve', () => {
  const rat = 'rat-cellars';

  it('refuses the door for each reason separately, so the hub can say which', () => {
    const progress = emptyProgress();
    expect(checkDelve({ id: rat, heroLevel: 4, hasKey: true, progress, now: 0 })).toEqual({
      kind: 'below-gate',
      gateLevel: 10,
    });
    expect(checkDelve({ id: rat, heroLevel: 20, hasKey: false, progress, now: 0 })).toEqual({
      kind: 'no-key',
      keyName: 'Rusty Key',
    });
    expect(
      checkDelve({
        id: rat,
        heroLevel: 20,
        hasKey: true,
        progress: { ...progress, cooldownUntil: 5_000 },
        now: 1_000,
      }),
    ).toEqual({ kind: 'cooling-down', msRemaining: 4_000 });
    expect(
      checkDelve({
        id: rat,
        heroLevel: 20,
        hasKey: true,
        progress: { ...progress, floorsCleared: 10 },
        now: 0,
      }),
    ).toEqual({ kind: 'already-cleared' });
    expect(checkDelve({ id: rat, heroLevel: 20, hasKey: true, progress, now: 0 })).toBeNull();
  });

  it('always presents the floor you have not cleared', () => {
    expect(currentFloor(emptyProgress())).toBe(1);
    expect(currentFloor({ ...emptyProgress(), floorsCleared: 6 })).toBe(7);
    expect(currentFloor({ ...emptyProgress(), floorsCleared: 10 })).toBeNull();
  });

  it('advances on a win and clears the cooldown, so the next floor can be chained', () => {
    // Level 30 sweeps the early Rat Cellars, which is the point of the chain.
    const hero = heroAt(30);
    const first = delve({ id: rat, hero, progress: emptyProgress(), worldSeed: SEED, now: 1_000 })!;

    expect(first.won).toBe(true);
    expect(first.progress.floorsCleared).toBe(1);
    expect(first.progress.cooldownUntil).toBe(0);
    expect(first.spoils.gold).toBeGreaterThan(0);
    expect(first.spoils.xp).toBeGreaterThan(0);

    const second = delve({ id: rat, hero, progress: first.progress, worldSeed: SEED, now: 2_000 })!;
    expect(second.floor).toBe(2);
    expect(second.progress.floorsCleared).toBe(2);
  });

  it('shuts the door for half an hour on a loss, and costs nothing else', () => {
    // A level-6 hero against a level-14 floor: a loss, reliably.
    const hero = outmatchedHero();
    const result = delve({
      id: rat,
      hero,
      progress: emptyProgress(),
      worldSeed: SEED,
      now: 9_000,
    })!;

    expect(result.won).toBe(false);
    expect(result.progress.floorsCleared).toBe(0);
    expect(result.progress.cooldownUntil).toBe(9_000 + LOSS_COOLDOWN_MS);
    expect(result.spoils).toEqual({ gold: 0, xp: 0, dice: 0, items: [], trophyId: null });
  });

  it('remembers the best attempt, which is all a loss leaves behind', () => {
    const hero = outmatchedHero();
    const result = delve({ id: rat, hero, progress: emptyProgress(), worldSeed: SEED, now: 0 })!;

    expect(result.share).toBeGreaterThan(0);
    expect(result.share).toBeLessThan(1);
    expect(result.progress.bestAttempts[0]).toBe(result.share);
    expect(result.newBest).toBe(true);

    // A worse attempt never overwrites a better one.
    const worse = delve({
      id: rat,
      hero: outmatchedHero(),
      progress: {
        ...result.progress,
        bestAttempts: [0.99, ...result.progress.bestAttempts.slice(1)],
      },
      worldSeed: SEED,
      now: 0,
    })!;
    expect(worse.progress.bestAttempts[0]).toBe(0.99);
    expect(worse.newBest).toBe(false);
  });

  it('is a different fight every attempt, and the same fight when replayed', () => {
    /*
     * The mission rule inverted, and deliberately. A mission commits its seed at accept because
     * its outcome must survive the timer; a floor is free and repeatable, so a seed fixed per
     * floor would make the wall you lost to the same fight forever — no reason to try again.
     */
    const hero = heroAt(18);
    const progress = emptyProgress();

    const once = delve({ id: rat, hero, progress, worldSeed: SEED, now: 0 })!;
    const again = delve({ id: rat, hero, progress, worldSeed: SEED, now: 5_000 })!;
    expect(again.battle.log).toEqual(once.battle.log);

    const next = delve({
      id: rat,
      hero,
      progress: { ...progress, attempts: 1 },
      worldSeed: SEED,
      now: 0,
    })!;
    expect(next.battle.log).not.toEqual(once.battle.log);
  });

  it('hands over the trophy, the dice and a guaranteed Epic on the tenth floor', () => {
    const hero = heroAt(70);
    const progress: DungeonProgress = { ...emptyProgress(), floorsCleared: 9 };
    const result = delve({ id: rat, hero, progress, worldSeed: SEED, now: 0 })!;

    expect(result.won).toBe(true);
    expect(result.cleared).toBe(true);
    expect(result.spoils.trophyId).toBe('crown-of-caps');
    expect(result.spoils.dice).toBe(3);
    expect(result.spoils.items).toHaveLength(1);
    expect(result.spoils.items[0]!.rarity).toBe('epic');
    expect(result.progress.clearedAt).toBe(0);
    // And there is nothing left behind the door.
    expect(currentFloor(result.progress)).toBeNull();
    expect(delve({ id: rat, hero, progress: result.progress, worldSeed: SEED, now: 0 })).toBeNull();
  });

  it('pays a boss more than the floor beneath it', () => {
    expect(floorPayout(rat, 5, 40).gold).toBeGreaterThan(floorPayout(rat, 4, 40).gold);
    expect(floorPayout(rat, 10, 40).gold).toBeGreaterThan(floorPayout(rat, 9, 40).gold);
  });

  it('prices a floor at the floor’s level, so sweeping an old dungeon is not a farm', () => {
    // The rule that means back-filling needs no special case: a level-90 hero clearing a
    // level-14 floor is paid level-14 money, which is nothing to them.
    const early = floorPayout(rat, 1, 90);
    expect(early.gold).toBe(Math.round(goldPerVigor(floorLevel(rat, 1)) * 90));
    expect(early.gold).toBeLessThan(floorPayout('emberdeep', 1, 90).gold / 5);

    /*
     * XP takes the *lower* of the two levels, and what matters is how far it moves the hero's
     * own bar. Priced at the floor's level, one clear paid a level-10 delver two level-14 levels
     * and the four chainable floors behind the Rusty Key would have carried them to 20 in a
     * single visit. Capped at their own level it is a generous day's XP and no more — the same
     * ninety Vigor-equivalents the spec asks for, measured against the right yardstick.
     */
    const fresh = floorPayout(rat, 1, 10).xp / xpNeeded(10);
    const veteran = floorPayout(rat, 1, 90).xp / xpNeeded(90);
    expect(veteran).toBeLessThan(fresh / 20);
    // Never more than a full day of missions at the hero's own level.
    expect(floorPayout(rat, 1, 10).xp).toBeLessThanOrEqual(
      xpPerVigor(10, xpNeeded(10)) * VIGOR_PER_DAY,
    );
  });

  it('reads a best attempt as damage taken off, clamped', () => {
    expect(attemptShare(1_000, 250)).toBe(0.75);
    expect(attemptShare(1_000, 0)).toBe(1);
    expect(attemptShare(1_000, 1_000)).toBe(0);
    expect(attemptShare(0, 0)).toBe(0);
  });
});

describe('keys — ROADMAP acceptance', () => {
  it('offers only the lowest door the hero has reached and cannot yet open', () => {
    expect(keyInPlay(5, [])).toBeNull();
    expect(keyInPlay(10, [])?.id).toBe('rat-cellars');
    // Past all three gates but empty-handed: still the first one. The dungeons are walked in
    // order, and the Emberdeep would eat a hero who skipped to it.
    expect(keyInPlay(80, [])?.id).toBe('rat-cellars');
    expect(keyInPlay(80, ['rusty-key'])?.id).toBe('barrowdeep');
    expect(keyInPlay(80, ['rusty-key', 'bone-key'])?.id).toBe('emberdeep');
    expect(keyInPlay(80, ['rusty-key', 'bone-key', 'brand-key'])).toBeNull();
  });

  it('drops at the published six percent, and never a second time', () => {
    const rng = createRng(SEED, 'keys');
    let drops = 0;
    const runs = 20_000;
    for (let i = 0; i < runs; i += 1) {
      if (rollKeyDrop({ heroLevel: 12, owned: [], rng: rng.fork(`m${i}`) })) drops += 1;
    }
    expect(drops / runs).toBeCloseTo(KEY_DROP_CHANCE, 2);

    // Owned, so nothing is in the pool and the roll cannot fire at all.
    for (let i = 0; i < 500; i += 1) {
      expect(
        rollKeyDrop({ heroLevel: 12, owned: ['rusty-key'], rng: rng.fork(`o${i}`) }),
      ).toBeNull();
    }
  });

  it('drops nothing at all before the first gate', () => {
    const rng = createRng(SEED, 'early');
    for (let i = 0; i < 500; i += 1) {
      expect(rollKeyDrop({ heroLevel: 9, owned: [], rng: rng.fork(`e${i}`) })).toBeNull();
    }
  });

  it('leaves a fresh save with no keys and no trophies', () => {
    const save = createNewSave({ slot: 1, worldSeed: SEED, now: 0 });
    expect(save.dungeons.keys).toEqual([]);
    expect(save.dungeons.trophies).toEqual([]);
    expect(save.dungeons.progress).toEqual({});
  });
});

describe('the shape of a dungeon', () => {
  it('keeps the bosses where the spec put them', () => {
    for (let floor = 1; floor <= FLOORS_PER_DUNGEON; floor += 1) {
      expect(isBossFloor(floor)).toBe(floor === 5 || floor === 10);
    }
  });

  it('previews each finale’s mechanic on its own floor five', () => {
    // Floor 5 teaches what floor 10 tests: the same *kind* of signature, weaker. Meeting
    // "it heals when you miss" for the first time at the final boss is a wasted lesson.
    for (const definition of DUNGEONS) {
      const mid = floorDef(definition.id, 5)!.signature!;
      const last = floorDef(definition.id, 10)!.signature!;
      expect(mid.proc.kind, definition.id).toBe(last.proc.kind);
      expect(mid.label, definition.id).not.toBe(last.label);
    }
  });
});
