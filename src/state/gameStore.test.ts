// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { generateItem } from '@/engine/items/generate';
import { readSave, resetPersistenceForTests } from './persistence';
import { resetGameStoreForTests, useGameStore } from './gameStore';

const store = () => useGameStore.getState();

const swordFor = (classId: 'warrior' | 'mage' = 'warrior', level = 5) =>
  generateItem({
    level,
    slot: 'weapon',
    rarity: 'rare',
    classId,
    rng: createRng(99, 'test:item'),
  });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetPersistenceForTests();
  resetGameStoreForTests();
});

describe('gameStore — world lifecycle', () => {
  it('creates a world with no hero, which is what opens creation', async () => {
    await store().hydrate(1);

    expect(store().status).toBe('ready');
    expect(store().save?.hero).toBeNull();
  });

  it('rolls a different world seed for each new world', async () => {
    await store().hydrate(1);
    const first = store().save?.worldSeed;

    await store().startOver();
    expect(store().save?.worldSeed).not.toBe(first);
  });
});

describe('gameStore — hero creation', () => {
  it('creates a hero and persists it immediately', async () => {
    await store().hydrate(1);
    await store().createHero('Brenna Thornsong', 'hunter');

    expect(store().save?.hero?.name).toBe('Brenna Thornsong');
    expect(store().save?.hero?.classId).toBe('hunter');
    expect(store().save?.hero?.level).toBe(1);

    // On disk without waiting for the debounce — a lost new hero would be unforgivable.
    const persisted = await readSave(1);
    expect(persisted.status === 'loaded' && persisted.save.hero?.name).toBe('Brenna Thornsong');
  });

  it('rehydrates the hero after a reload', async () => {
    await store().hydrate(1);
    await store().createHero('Kargath', 'warrior');
    store().trainAttribute('str', 3);
    await store().flush();

    resetGameStoreForTests();
    await store().hydrate(1);

    expect(store().save?.hero?.name).toBe('Kargath');
    expect(store().save?.hero?.trained.str).toBe(3);
  });
});

describe('gameStore — hero actions', () => {
  beforeEach(async () => {
    await store().hydrate(1);
    await store().createHero('Kargath', 'warrior');
  });

  it('starts the hero in their kit rather than empty-handed', () => {
    // Added in Phase 5: an unarmed hero swings for 1–2 and loses their first mission.
    const hero = store().save!.hero!;
    expect(hero.equipment.weapon).toBeDefined();
    expect(hero.equipment.chest).toBeDefined();
    expect(hero.backpack.filter(Boolean)).toHaveLength(0);
  });

  it('grants an item into the backpack', () => {
    const sword = swordFor();
    store().grantItem(sword);

    expect(store().save?.hero?.backpack.filter(Boolean)).toHaveLength(1);
    expect(store().save?.hero?.backpack[0]?.uid).toBe(sword.uid);
  });

  it('equips from the backpack, swapping the worn piece back into it', () => {
    const sword = swordFor();
    store().grantItem(sword);
    store().equipItem(sword);

    expect(store().save?.hero?.equipment.weapon?.uid).toBe(sword.uid);
    // The starter weapon takes the bag slot the new one vacated — a swap, not a duplication.
    const bagged = store().save!.hero!.backpack.filter(Boolean);
    expect(bagged).toHaveLength(1);
    expect(bagged[0]?.uid).not.toBe(sword.uid);
  });

  it('refuses to equip another class’s weapon', () => {
    const starterUid = store().save!.hero!.equipment.weapon?.uid;
    const staff = swordFor('mage');
    store().grantItem(staff);
    store().equipItem(staff);

    // The warrior keeps their own weapon…
    expect(store().save?.hero?.equipment.weapon?.uid).toBe(starterUid);
    // …and the staff stays in the bag rather than vanishing.
    expect(store().save?.hero?.backpack.filter(Boolean)).toHaveLength(1);
  });

  it('unequips back into the backpack', () => {
    store().unequipItem('weapon');

    expect(store().save?.hero?.equipment.weapon).toBeUndefined();
    expect(store().save?.hero?.backpack.filter(Boolean)).toHaveLength(1);
  });

  it('trains attributes and charges gold', () => {
    const before = store().save!.hero!.gold;
    store().trainAttribute('str', 5);

    const hero = store().save!.hero!;
    expect(hero.trained.str).toBe(5);
    expect(hero.gold).toBeLessThan(before);
  });

  it('buys only what the purse covers instead of failing outright', () => {
    // 100 starting gold buys far fewer than 500 points.
    store().trainAttribute('con', 500);

    const hero = store().save!.hero!;
    expect(hero.trained.con).toBeGreaterThan(0);
    expect(hero.gold).toBeGreaterThanOrEqual(0);
  });

  it('locks an item so it cannot be discarded', () => {
    const sword = swordFor();
    store().grantItem(sword);
    store().toggleItemLock(sword.uid);
    store().discardItem(sword.uid);

    expect(store().save?.hero?.backpack.filter(Boolean)).toHaveLength(1);

    store().toggleItemLock(sword.uid);
    store().discardItem(sword.uid);
    expect(store().save?.hero?.backpack.filter(Boolean)).toHaveLength(0);
  });

  it('ignores hero actions when no hero exists', async () => {
    await store().startOver();
    expect(store().save?.hero).toBeNull();

    expect(() => store().trainAttribute('str', 1)).not.toThrow();
    expect(() => store().equipItem(swordFor())).not.toThrow();
    expect(store().save?.hero).toBeNull();
  });
});

describe('gameStore — battle preferences', () => {
  it('remembers the playback speed the player chose, across a reload', async () => {
    await store().hydrate(1);
    expect(store().save?.settings.battleSpeed).toBe(1);

    store().setBattleSpeed(4);
    expect(store().save?.settings.battleSpeed).toBe(4);

    await store().flush();
    const persisted = await readSave(1);
    expect(persisted.status).toBe('loaded');
    expect(persisted.status === 'loaded' && persisted.save.settings.battleSpeed).toBe(4);
  });

  it('does not write when the speed did not actually change', async () => {
    await store().hydrate(1);
    store().setBattleSpeed(2);
    await store().flush();

    const before = store().save?.savedAt;
    store().setBattleSpeed(2);
    expect(store().save?.savedAt).toBe(before);
  });

  it('leaves the rest of the player’s settings alone', async () => {
    await store().hydrate(1);
    const settings = store().save!.settings;
    store().applySettings({ ...settings, motion: 'reduced', volume: 0.3 });

    store().setBattleSpeed(4);

    expect(store().save?.settings).toMatchObject({
      motion: 'reduced',
      volume: 0.3,
      battleSpeed: 4,
    });
  });
});

describe('gameStore — the core loop', () => {
  beforeEach(async () => {
    await store().hydrate(1);
    await store().createHero('Kargath', 'warrior');
  });

  const board = () => store().save!.activity.board;
  const activity = () => store().save!.activity;

  it('lays out a board the moment a hero exists', () => {
    // Creation ends at the tavern; an empty quest table would be the first thing they saw.
    expect(board()).toHaveLength(3);
    expect(activity().boardDay).not.toBeNull();
    expect(activity().vigor).toBe(100);
  });

  it('accepts a mission, spending Vigor and starting a timer', () => {
    const offer = board()[0]!;
    expect(store().acceptMission(offer.id, 10)).toBeNull();

    expect(activity().vigor).toBe(90);
    expect(activity().mission?.offer.id).toBe(offer.id);
    // The taken job leaves the board.
    expect(board().some((entry) => entry.id === offer.id)).toBe(false);
  });

  it('refuses a second mission while one runs, and says why', () => {
    store().acceptMission(board()[0]!.id, 5);
    expect(store().acceptMission(board()[0]!.id, 5)).toEqual({ kind: 'mission-running' });
  });

  it('refuses a mission the purse of Vigor cannot cover', () => {
    // Burn the day down to 5 Vigor.
    useGameStore.setState({
      save: { ...store().save!, activity: { ...activity(), vigor: 5 } },
    });

    expect(store().acceptMission(board()[0]!.id, 20)).toEqual({
      kind: 'insufficient-vigor',
      needed: 20,
      available: 5,
    });
  });

  it('survives a reload mid-timer', async () => {
    const offer = board()[0]!;
    store().acceptMission(offer.id, 20);
    const endsAt = activity().mission!.endsAt;
    await store().flush();

    resetGameStoreForTests();
    await store().hydrate(1);

    // The timer is two timestamps in the save; there is no in-memory state to lose.
    expect(activity().mission?.offer.id).toBe(offer.id);
    expect(activity().mission?.endsAt).toBe(endsAt);
    expect(activity().vigor).toBe(80);
  });

  it('lands a finished mission into "waiting to be watched" rather than banking it', () => {
    store().acceptMission(board()[0]!.id, 5);
    const goldBefore = store().save!.hero!.gold;

    // Pull the finish line into the past, as a closed tab would.
    useGameStore.setState({
      save: {
        ...store().save!,
        activity: { ...activity(), mission: { ...activity().mission!, endsAt: 1 } },
      },
    });
    store().landMission();

    expect(activity().mission).toBeNull();
    expect(activity().pendingMission).not.toBeNull();
    // Nothing is paid until the fight has been watched.
    expect(store().save!.hero!.gold).toBe(goldBefore);
  });

  it('survives a reload with a fight waiting to be watched', async () => {
    store().acceptMission(board()[0]!.id, 5);
    useGameStore.setState({
      save: {
        ...store().save!,
        activity: { ...activity(), mission: { ...activity().mission!, endsAt: 1 } },
      },
    });
    store().landMission();
    await store().flush();

    resetGameStoreForTests();
    await store().hydrate(1);

    expect(activity().pendingMission).not.toBeNull();
  });

  it('pays out on claim, and only once', () => {
    store().acceptMission(board()[0]!.id, 10);
    useGameStore.setState({
      save: {
        ...store().save!,
        activity: { ...activity(), mission: { ...activity().mission!, endsAt: 1 } },
      },
    });
    store().landMission();

    const pending = activity().pendingMission!;
    const goldBefore = store().save!.hero!.gold;
    const result = store().claimMission(pending)!;

    expect(result.spoils.gold).toBeGreaterThan(0);
    expect(store().save!.hero!.gold).toBe(goldBefore + result.spoils.gold);
    expect(activity().pendingMission).toBeNull();

    // Claiming again has nothing to claim; the purse must not move.
    const goldAfter = store().save!.hero!.gold;
    store().claimMission(pending);
    expect(store().save!.hero!.gold).toBe(goldAfter);
  });

  it('puts a dropped item in the bags and reports the same one to the result screen', () => {
    // Run missions until one drops something — the 25% table makes this quick.
    for (let i = 0; i < 40; i += 1) {
      const offer = board()[0];
      if (!offer) break;
      if (store().acceptMission(offer.id, 20) !== null) break;

      useGameStore.setState({
        save: {
          ...store().save!,
          activity: { ...activity(), mission: { ...activity().mission!, endsAt: 1 } },
        },
      });
      store().landMission();

      const before = store().save!.hero!.backpack.filter(Boolean).length;
      const result = store().claimMission(activity().pendingMission!)!;

      if (result.item) {
        expect(store().save!.hero!.backpack.filter(Boolean).length).toBe(before + 1);
        expect(
          store().save!.hero!.backpack.find((entry) => entry?.uid === result.item!.uid),
        ).toBeDefined();
        return;
      }

      // Refill Vigor and redraw so the loop can continue.
      useGameStore.setState({
        save: {
          ...store().save!,
          activity: { ...activity(), vigor: 100, boardDay: null, board: [] },
        },
      });
      store().refreshDay();
    }
  });

  it('rerolls the board free once, then charges a die', () => {
    const first = board().map((entry) => entry.id);

    expect(store().rerollBoard()).toBeNull();
    expect(board().map((entry) => entry.id)).not.toEqual(first);
    expect(store().save!.hero!.dice).toBe(0);

    // Second reroll wants a die the hero does not have.
    expect(store().rerollBoard()).toEqual({ kind: 'insufficient-dice', needed: 1 });
  });

  it('skips the wait for a Golden Die', () => {
    store().acceptMission(board()[0]!.id, 20);
    expect(store().skipMissionTimer()).toEqual({ kind: 'insufficient-dice', needed: 1 });

    useGameStore.setState({
      save: { ...store().save!, hero: { ...store().save!.hero!, dice: 2 } },
    });
    expect(store().skipMissionTimer()).toBeNull();
    expect(store().save!.hero!.dice).toBe(1);

    // The hero is home: landing works immediately.
    store().landMission();
    expect(activity().pendingMission).not.toBeNull();
  });

  it('sells Ale for a die and caps drinking at three a day', () => {
    useGameStore.setState({
      save: { ...store().save!, hero: { ...store().save!.hero!, dice: 5 } },
    });

    for (let i = 0; i < 3; i += 1) {
      expect(store().buyAle(), `buy ${i}`).toBeNull();
      expect(store().drinkAle(), `drink ${i}`).toBeNull();
    }

    expect(activity().alesToday).toBe(3);
    expect(store().buyAle()).toEqual({ kind: 'ale-cap-reached' });
  });

  it('raises the Vigor ceiling with Ale rather than overflowing it', () => {
    useGameStore.setState({
      save: {
        ...store().save!,
        hero: { ...store().save!.hero!, dice: 3 },
        activity: { ...activity(), vigor: 100 },
      },
    });

    store().buyAle();
    store().drinkAle();

    // 100 was already the cap; Ale lifts the cap to 120 and the drink fills to it.
    expect(activity().vigor).toBe(120);
  });

  it('refuses to drink Ale nobody is holding', () => {
    expect(store().drinkAle()).toEqual({ kind: 'no-ale-held' });
  });
});

describe('gameStore — the City Watch', () => {
  beforeEach(async () => {
    await store().hydrate(1);
    await store().createHero('Kargath', 'warrior');
  });

  const activity = () => store().save!.activity;
  const board = () => activity().board;

  /**
   * Wind a running shift back in time, so "now" is `minutes` into it. Both stamps move: the
   * shift keeps its length and simply started earlier, which is exactly what a closed tab
   * looks like from the save's point of view.
   */
  const ageShift = (minutes: number) => {
    const shift = activity().patrol!;
    const by = minutes * 60_000;
    useGameStore.setState({
      save: {
        ...store().save!,
        activity: {
          ...activity(),
          patrol: { ...shift, startedAt: shift.startedAt - by, endsAt: shift.endsAt - by },
        },
      },
    });
  };

  it('clocks the hero on for the chosen shift', () => {
    expect(store().startPatrol(6)).toBeNull();

    expect(activity().patrol?.hours).toBe(6);
    expect(activity().patrol!.endsAt - activity().patrol!.startedAt).toBe(6 * 3_600_000);
  });

  it('refuses a shift while a mission is out — the hero cannot be in two places', () => {
    store().acceptMission(board()[0]!.id, 5);
    expect(store().startPatrol(4)).toEqual({ kind: 'mission-running' });
    expect(activity().patrol).toBeNull();
  });

  it('refuses a shift while a fight is waiting to be watched', () => {
    // The hero is at the door, not on the beat; starting patrol would strand the fight.
    store().acceptMission(board()[0]!.id, 5);
    useGameStore.setState({
      save: {
        ...store().save!,
        activity: { ...activity(), mission: { ...activity().mission!, endsAt: 1 } },
      },
    });
    store().landMission();
    expect(activity().pendingMission).not.toBeNull();

    expect(store().startPatrol(4)).toEqual({ kind: 'mission-running' });
  });

  it('refuses a mission while on the beat — exclusivity runs both ways', () => {
    store().startPatrol(8);
    expect(store().acceptMission(board()[0]!.id, 5)).toEqual({ kind: 'mission-running' });
    expect(activity().mission).toBeNull();
    // And no Vigor was spent on the refusal.
    expect(activity().vigor).toBe(100);
  });

  it('refuses a second shift on top of the first', () => {
    store().startPatrol(2);
    expect(store().startPatrol(2)).toEqual({ kind: 'already-on-duty' });
  });

  it('pays out on collection and clears the beat', () => {
    const goldBefore = store().save!.hero!.gold;
    store().startPatrol(4);
    ageShift(4 * 60);

    const collected = store().collectPatrol()!;

    expect(collected.gold).toBeGreaterThan(0);
    expect(collected.minutes).toBe(240);
    expect(collected.early).toBe(false);
    expect(store().save!.hero!.gold).toBe(goldBefore + collected.gold);
    expect(activity().patrol).toBeNull();
    expect(activity().patrolsCompleted).toBe(1);
  });

  it('pro-rates a shift walked off early, and does not count it as completed', () => {
    store().startPatrol(8);
    ageShift(120); // two hours in

    const collected = store().collectPatrol()!;

    expect(collected.early).toBe(true);
    expect(collected.minutes).toBe(120);
    expect(collected.gold).toBeGreaterThan(0);
    // Two hours of an eight-hour shift pays about a quarter.
    expect(activity().patrolsCompleted).toBe(0);
  });

  it('pays nothing for a shift abandoned immediately', () => {
    const goldBefore = store().save!.hero!.gold;
    store().startPatrol(4);

    const collected = store().collectPatrol()!;
    expect(collected.minutes).toBe(0);
    expect(collected.gold).toBe(0);
    expect(store().save!.hero!.gold).toBe(goldBefore);
  });

  it('survives a reload mid-shift and still pays for the time away', async () => {
    store().startPatrol(6);
    ageShift(180);
    const endsAt = activity().patrol!.endsAt;
    await store().flush();

    resetGameStoreForTests();
    await store().hydrate(1);

    // The shift is timestamps in the save; three hours of it already happened.
    expect(activity().patrol?.endsAt).toBe(endsAt);
    const collected = store().collectPatrol()!;
    expect(collected.minutes).toBe(180);
    expect(collected.gold).toBeGreaterThan(0);
  });

  it('frees the hero for missions again once collected', () => {
    store().startPatrol(1);
    ageShift(60);
    store().collectPatrol();

    expect(store().acceptMission(board()[0]!.id, 5)).toBeNull();
  });

  it('has nothing to collect when off duty', () => {
    expect(store().collectPatrol()).toBeNull();
  });
});
