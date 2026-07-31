/**
 * Menagerie transition tests.
 *
 * The engine tests prove the curve and the sources; these prove the *bank*. Every feed moves
 * three things at once — a Scrap, some gold and a level — and every refusal has to leave all
 * three exactly where they were. The paranoid cases each get their own test:
 *
 * - a refused feed is a **no-op**, not a partial charge;
 * - the day boundary empties the bowls and nothing else;
 * - a pet you do not own cannot be fed, upgraded or taken along, whatever the save says;
 * - the mission credit counts the zone on a **win** only, so the per-zone gate means the same
 *   thing as the lifetime one;
 * - `payoutBonus` composes the hall, the pet and the gear specials, and no call site can
 *   assemble a subset.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { createHero } from '@/engine/hero/actions';
import { createNewSave, type SaveFile } from '@/engine/save/schema';
import { FEEDS_PER_DAY, SCRAPS_PER_FEED } from '@/data/pets';
import { feedGoldCost, progressOf } from '@/engine/pets/feeding';
import { ownedPets } from '@/engine/pets/ownership';
import {
  creditMissionDrops,
  currentBoost,
  feedPet,
  grantScraps,
  markPetsSeen,
  payoutBonus,
  petContribution,
  refreshPetDay,
  setActivePet,
  upgradePet,
} from './petActions';

const NOW = new Date('2026-08-05T10:00:00').getTime();
const SEED = 77_014;

/** A hero deep enough in to own the Gloom Cat (Barrowdeep floor five) and nothing else. */
function save(over: { scraps?: number; gold?: number } = {}): SaveFile {
  const base = createNewSave({ slot: 1, worldSeed: SEED, now: NOW });
  const hero = createHero({
    name: 'Ysolde',
    classId: 'hunter',
    now: NOW,
    startingGold: over.gold ?? 100_000,
    rng: createRng(9, 'starter'),
  });

  return {
    ...base,
    hero: { ...hero, level: 30, materials: { scrap: 40, essence: 200, starmetal: 8 } },
    dungeons: {
      ...base.dungeons,
      progress: {
        barrowdeep: {
          floorsCleared: 5,
          cooldownUntil: 0,
          bestAttempts: Array.from({ length: 10 }, () => 0),
          attempts: 5,
          clearedAt: null,
        },
      },
    },
    pets: { ...base.pets, scraps: over.scraps ?? 30 },
  };
}

describe('feeding, as a transaction', () => {
  it('charges a Scrap and the level’s gold, and buys exactly one level', () => {
    const before = save();
    const result = feedPet(before, 'gloom-cat');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.progress.level).toBe(2);
    expect(result.save.pets.scraps).toBe(before.pets.scraps - SCRAPS_PER_FEED);
    expect(result.save.hero!.gold).toBe(before.hero!.gold - feedGoldCost(1));
    // The pet only appears in the save once it has been fed — an unfed pet stores nothing.
    expect(before.pets.progress['gloom-cat']).toBeUndefined();
    expect(result.save.pets.progress['gloom-cat']).toEqual({
      level: 2,
      rarity: 'common',
      fedToday: 1,
    });
  });

  it('stops at three a day and charges nothing for the fourth', () => {
    let file = save();
    for (let i = 0; i < FEEDS_PER_DAY; i += 1) {
      const step = feedPet(file, 'gloom-cat');
      expect(step.ok).toBe(true);
      if (step.ok) file = step.save;
    }
    expect(progressOf(file.pets.progress, 'gloom-cat').level).toBe(1 + FEEDS_PER_DAY);

    const fourth = feedPet(file, 'gloom-cat');
    expect(fourth.ok).toBe(false);
    if (!fourth.ok && fourth.refusal.kind === 'feed') {
      expect(fourth.refusal.reason.kind).toBe('fed-out');
    }
  });

  it('leaves the purse untouched when it refuses', () => {
    const broke = save({ gold: 0, scraps: 5 });
    const result = feedPet(broke, 'gloom-cat');
    expect(result.ok).toBe(false);
    // A refusal returns no save at all, so there is nothing to have partially charged.
    expect(broke.pets.scraps).toBe(5);
    expect(broke.hero!.gold).toBe(0);

    const empty = feedPet(save({ scraps: 0 }), 'gloom-cat');
    expect(empty.ok).toBe(false);
    if (!empty.ok && empty.refusal.kind === 'feed') {
      expect(empty.refusal.reason.kind).toBe('no-scraps');
    }
  });

  it('will not feed, upgrade or equip a pet the hero has not earned', () => {
    const file = save();
    expect(ownedPets(file).map((entry) => entry.id)).toEqual(['gloom-cat']);

    for (const result of [feedPet(file, 'ember-pup'), upgradePet(file, 'ember-pup')]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.kind).toBe('not-owned');
    }
    // Setting an unowned pet active is a silent no-op rather than a refusal — nothing about it
    // is worth a sentence on screen, and the room never offers the button.
    expect(setActivePet(file, 'ember-pup').pets.activeId).toBeNull();
  });
});

describe('the day boundary', () => {
  it('empties every bowl and touches nothing else', () => {
    let file = save();
    for (let i = 0; i < FEEDS_PER_DAY; i += 1) {
      const step = feedPet(file, 'gloom-cat');
      if (step.ok) file = step.save;
    }
    const fedOut = progressOf(file.pets.progress, 'gloom-cat');
    expect(fedOut.fedToday).toBe(FEEDS_PER_DAY);

    const tomorrow = refreshPetDay(file);
    const fresh = progressOf(tomorrow.pets.progress, 'gloom-cat');
    expect(fresh.fedToday).toBe(0);
    expect(fresh.level).toBe(fedOut.level);
    expect(tomorrow.pets.scraps).toBe(file.pets.scraps);
    expect(tomorrow.hero!.gold).toBe(file.hero!.gold);
  });

  it('returns the same object when there is nothing to clear', () => {
    const file = save();
    // Identity, not equality — a store action that always allocates makes every midnight a write.
    expect(refreshPetDay(file)).toBe(file);
  });
});

describe('rarity upgrades', () => {
  it('spends the materials and keeps the level', () => {
    const base = save();
    const primed: SaveFile = {
      ...base,
      pets: {
        ...base.pets,
        progress: { 'gloom-cat': { level: 15, rarity: 'common', fedToday: 0 } },
      },
    };

    const result = upgradePet(primed, 'gloom-cat');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.progress).toEqual({ level: 15, rarity: 'uncommon', fedToday: 0 });
    expect(result.save.hero!.materials.essence).toBe(primed.hero!.materials.essence - 12);
    expect(result.save.hero!.materials.starmetal).toBe(primed.hero!.materials.starmetal);
  });

  it('refuses before the level and leaves the materials alone', () => {
    const base = save();
    const early: SaveFile = {
      ...base,
      pets: {
        ...base.pets,
        progress: { 'gloom-cat': { level: 14, rarity: 'common', fedToday: 0 } },
      },
    };
    const result = upgradePet(early, 'gloom-cat');
    expect(result.ok).toBe(false);
    expect(early.hero!.materials.essence).toBe(200);
  });
});

describe('the companion at your side', () => {
  it('is free to switch and free to dismiss', () => {
    const file = setActivePet(save(), 'gloom-cat');
    expect(file.pets.activeId).toBe('gloom-cat');
    expect(file.hero!.gold).toBe(save().hero!.gold);

    expect(setActivePet(file, null).pets.activeId).toBeNull();
    // Re-setting the same pet is not a write.
    expect(setActivePet(file, 'gloom-cat')).toBe(file);
  });

  it('reaches the fight as a contribution the combatant builder understands', () => {
    const idle = save();
    expect(petContribution(idle)).toBeNull();

    const active = setActivePet(idle, 'gloom-cat');
    const contribution = petContribution(active)!;
    expect(contribution.stat).toBe('dex');
    expect(contribution.share).toBeCloseTo(currentBoost(active)!.share, 8);
  });

  it('composes the hall, the pet and the gear specials into one payout bonus', () => {
    const plain = payoutBonus(save());
    expect(plain.gold).toBeCloseTo(1, 6);
    expect(plain.xp).toBeCloseTo(1, 6);

    // The Tankard Imp is a gold-find pet, so it has to move gold and leave XP alone.
    const base = save();
    const withImp: SaveFile = {
      ...base,
      activity: { ...base.activity, missionsCompleted: 100 },
      pets: { ...base.pets, activeId: 'tankard-imp' },
    };
    const bonus = payoutBonus(withImp);
    expect(bonus.gold).toBeGreaterThan(1);
    expect(bonus.xp).toBeCloseTo(1, 6);
    expect(bonus.gold).toBeCloseTo(1 + currentBoost(withImp)!.share, 6);
  });
});

describe('what a mission banks', () => {
  it('counts the zone on a win, and not on a loss', () => {
    const base = save();
    const won = creditMissionDrops(base, {
      zoneId: 'sunken-chapel',
      victory: true,
      scraps: 2,
      egg: null,
    });
    expect(won.activity.zoneMissions['sunken-chapel']).toBe(1);
    expect(won.pets.scraps).toBe(base.pets.scraps + 2);

    const lost = creditMissionDrops(won, {
      zoneId: 'sunken-chapel',
      victory: false,
      scraps: 0,
      egg: null,
    });
    expect(lost.activity.zoneMissions['sunken-chapel']).toBe(1);
  });

  it('banks an egg once, and never twice', () => {
    const first = creditMissionDrops(save(), {
      zoneId: 'silverpine-pass',
      victory: true,
      scraps: 0,
      egg: 'frost-fox',
    });
    expect(first.pets.eggs).toEqual(['frost-fox']);
    expect(ownedPets(first).map((entry) => entry.id)).toContain('frost-fox');

    const again = creditMissionDrops(first, {
      zoneId: 'frostfell-ridge',
      victory: true,
      scraps: 0,
      egg: 'frost-fox',
    });
    expect(again.pets.eggs).toEqual(['frost-fox']);
  });

  it('takes scraps from anywhere, and ignores nonsense', () => {
    const base = save();
    expect(grantScraps(base, 5).pets.scraps).toBe(base.pets.scraps + 5);
    expect(grantScraps(base, 0)).toBe(base);
    expect(grantScraps(base, -10)).toBe(base);
  });
});

describe('the arrivals cue', () => {
  it('remembers the count, so the rail stops asking after one visit', () => {
    const file = save();
    expect(file.pets.seenCount).toBe(0);

    const seen = markPetsSeen(file);
    expect(seen.pets.seenCount).toBe(1);
    // Idempotent, and identity-stable, so a mount effect is not a write every render.
    expect(markPetsSeen(seen)).toBe(seen);
  });
});
