/**
 * The Menagerie, measured (ROADMAP Phase 14 acceptance).
 *
 * Four claims are made about this system and each is a place it could quietly be wrong:
 *
 * - **Ownership is derived, so it is retroactive and it cannot drift.** Every one of the twelve
 *   sources is exercised from a save that has never heard of pets, and the pet appears the moment
 *   the fact that earns it becomes true.
 * - **The hints and the checks agree.** A silhouette that names a dungeon floor the engine does
 *   not look at is the exact failure `data/pets.ts` claims to make impossible; here the ids in
 *   every source are matched against the real dungeon and zone tables.
 * - **The boost stays deliberately minor.** A fully-grown, fully-upgraded pet has to stay under
 *   the one-gear-upgrade line the spec draws, and the half-rate three have to actually be halved.
 * - **The drops ride their own forks.** Scraps and the egg must not move a single existing
 *   mission roll, and the egg must land at its published one-in-two-hundred.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { createHero } from '@/engine/hero/actions';
import { generateItem } from '@/engine/items/generate';
import { buildReferenceCombatant } from '@/engine/combat/combatant';
import { createNewSave, type SaveFile } from '@/engine/save/schema';
import { DUNGEONS_BY_ID } from '@/data/dungeons';
import { ZONES } from '@/data/zones';
import {
  BOOST_BASE,
  BOOST_PER_LEVEL,
  FEEDS_PER_DAY,
  PETS,
  PET_IDS,
  PET_MAX_LEVEL,
  RARITY_BONUS,
  RARITY_STEPS,
  SCRAPS_PER_DROP,
  SCRAP_DROP_CHANCE,
  pet,
  type PetId,
} from '@/data/pets';
import { collectionProgress, isEarned, newArrivals, ownedPets, ownsPet } from './ownership';
import {
  afterFeed,
  boostShare,
  clearFedToday,
  feedGoldCost,
  isHalfRate,
  nextUpgrade,
  progressOf,
  quoteFeed,
  quoteUpgrade,
  rarityIndex,
  NEW_PET,
  type PetProgress,
} from './feeding';
import { activeBoost, boostedArmour, boostedAttribute, combineBonus, rewardBonus } from './boost';
import { rollEgg, rollScraps } from './eggs';

const NOW = new Date('2026-08-05T10:00:00').getTime();
const SEED = 0x14_5e_ed;

function save(): SaveFile {
  const base = createNewSave({ slot: 1, worldSeed: SEED, now: NOW });
  const hero = createHero({
    name: 'Ysolde',
    classId: 'hunter',
    now: NOW,
    startingGold: 500_000,
    rng: createRng(9, 'starter'),
  });
  return { ...base, hero: { ...hero, level: 30 } };
}

/** A save in which one dungeon has been taken to `floor`. */
function cleared(file: SaveFile, dungeonId: string, floor: number): SaveFile {
  return {
    ...file,
    dungeons: {
      ...file.dungeons,
      progress: {
        ...file.dungeons.progress,
        [dungeonId]: {
          floorsCleared: floor,
          cooldownUntil: 0,
          bestAttempts: Array.from({ length: 10 }, () => 0),
          attempts: floor,
          clearedAt: null,
        },
      },
    },
  };
}

function grown(level: number, rarity: PetProgress['rarity'] = 'common'): PetProgress {
  return { level, rarity, fedToday: 0 };
}

/* ── The roster itself ───────────────────────────────────────────────────────────── */

describe('the twelve, as data', () => {
  it('has a unique id, icon and boost story for each', () => {
    expect(PETS).toHaveLength(12);
    expect(new Set(PETS.map((entry) => entry.id)).size).toBe(12);
    expect(new Set(PETS.map((entry) => entry.name)).size).toBe(12);
    expect(new Set(PETS.map((entry) => entry.iconId)).size).toBe(12);
    expect(PETS.map((entry) => entry.id)).toEqual([...PET_IDS]);

    // Every boost is reachable, so no pet is a worse copy of another with nothing of its own.
    expect(new Set(PETS.map((entry) => entry.boost)).size).toBe(8);
  });

  it('points every source at something that exists', () => {
    const zoneIds = new Set<string>(ZONES.map((zone) => zone.id));

    for (const entry of PETS) {
      const source = entry.source;
      if (source.kind === 'dungeon-floor') {
        const dungeon = DUNGEONS_BY_ID[source.dungeonId as keyof typeof DUNGEONS_BY_ID];
        expect(dungeon, `${entry.id} names dungeon ${source.dungeonId}`).toBeTruthy();
        expect(source.floor).toBeGreaterThanOrEqual(1);
        expect(source.floor).toBeLessThanOrEqual(dungeon.floors.length);
      }
      if (source.kind === 'zone-missions') {
        expect(zoneIds.has(source.zoneId), `${entry.id} names zone ${source.zoneId}`).toBe(true);
      }
      if (source.kind === 'egg') {
        expect(source.zoneIds.length).toBeGreaterThan(0);
        for (const zoneId of source.zoneIds) expect(zoneIds.has(zoneId)).toBe(true);
      }
    }
  });

  it('writes a hint for every stall, and never leaves one blank', () => {
    for (const entry of PETS) {
      expect(entry.hint.length).toBeGreaterThan(12);
      expect(entry.flavour.length).toBeGreaterThan(12);
      expect(entry.hint.endsWith('.')).toBe(true);
    }
  });
});

/* ── Ownership ───────────────────────────────────────────────────────────────────── */

describe('ownership is derived from the facts that earned it', () => {
  it('starts a new hero with nothing, and no stored list to be wrong about it', () => {
    const file = save();
    expect(ownedPets(file)).toHaveLength(0);
    expect(collectionProgress(file)).toEqual({ owned: 0, of: 12 });
    expect(file.pets.progress).toEqual({});
  });

  it('hands over a dungeon pet retroactively — the floor was already cleared', () => {
    // A Phase 11 player who took Barrowdeep to five, then stopped playing. The Menagerie opens
    // and the Gloom Cat is already theirs, with no migration and no reconciliation pass.
    const file = cleared(save(), 'barrowdeep', 5);
    expect(ownsPet(file, 'gloom-cat')).toBe(true);
    // The pet gated on floor ten is not, and neither is another dungeon's.
    expect(ownsPet(file, 'cellar-rat-king')).toBe(false);
    expect(ownsPet(file, 'ember-pup')).toBe(false);
  });

  it('holds a floor pet back until the exact floor', () => {
    const four = cleared(save(), 'rat-cellars', 4);
    const five = cleared(save(), 'rat-cellars', 5);
    expect(ownsPet(four, 'ember-pup')).toBe(false);
    expect(ownsPet(five, 'ember-pup')).toBe(true);
  });

  it('counts lifetime missions and per-zone missions separately', () => {
    const base = save();
    const ninetyNine = { ...base, activity: { ...base.activity, missionsCompleted: 99 } };
    const hundred = { ...base, activity: { ...base.activity, missionsCompleted: 100 } };
    expect(ownsPet(ninetyNine, 'tankard-imp')).toBe(false);
    expect(ownsPet(hundred, 'tankard-imp')).toBe(true);

    // A hundred contracts everywhere is not forty contracts at the Sunken Chapel.
    expect(ownsPet(hundred, 'wisp-of-the-chapel')).toBe(false);
    const chapel = {
      ...hundred,
      activity: { ...hundred.activity, zoneMissions: { 'sunken-chapel': 40 } },
    };
    expect(ownsPet(chapel, 'wisp-of-the-chapel')).toBe(true);
  });

  it('never mistakes "not on the ladder" for rank zero', () => {
    const base = save();
    // bestRank starts at 0 meaning *unseated*, which is numerically inside the top 500. A naive
    // `<= 500` hands a brand-new hero the Raven for a rank they have never held.
    expect(base.arena.bestRank).toBe(0);
    expect(ownsPet(base, 'sooty-raven')).toBe(false);

    const seated = { ...base, arena: { ...base.arena, bestRank: 501 } };
    expect(ownsPet(seated, 'sooty-raven')).toBe(false);
    const ranked = { ...base, arena: { ...base.arena, bestRank: 500 } };
    expect(ownsPet(ranked, 'sooty-raven')).toBe(true);
  });

  it('reads the two granted kinds from their own lists, not from a derivation', () => {
    const base = save();
    expect(isEarned({ kind: 'gacha' }, base)).toBe(false);
    expect(isEarned({ kind: 'egg', zoneIds: ['silverpine-pass'], chance: 0.005 }, base)).toBe(
      false,
    );

    const fromVesna = { ...base, gacha: { ...base.gacha, pets: ['owl-of-vesna'] } };
    expect(ownsPet(fromVesna, 'owl-of-vesna')).toBe(true);

    const hatched: SaveFile = {
      ...base,
      pets: { ...base.pets, eggs: ['frost-fox'] },
    };
    expect(ownsPet(hatched, 'frost-fox')).toBe(true);
  });

  it('answers "no" honestly for the two Phase 15 owns', () => {
    const everything: SaveFile = {
      ...cleared(save(), 'rat-cellars', 10),
      activity: {
        ...save().activity,
        missionsCompleted: 10_000,
        zoneMissions: Object.fromEntries(ZONES.map((zone) => [zone.id, 999])),
      },
      arena: { ...save().arena, bestRank: 1 },
    };
    // The login calendar and the Notice Board streak do not exist yet, and no amount of other
    // progress is allowed to stand in for them.
    expect(ownsPet(everything, 'moss-tortoise')).toBe(false);
    expect(ownsPet(everything, 'coin-toad')).toBe(false);
  });

  it('counts arrivals against a remembered number, and never goes negative', () => {
    const file = cleared(save(), 'barrowdeep', 5);
    expect(newArrivals(file)).toBe(1);

    const seen = { ...file, pets: { ...file.pets, seenCount: 1 } };
    expect(newArrivals(seen)).toBe(0);

    // A stale high-water mark reads as "nothing new", not as a negative badge.
    const stale = { ...save(), pets: { ...file.pets, seenCount: 4 } };
    expect(newArrivals(stale)).toBe(0);
  });
});

/* ── Feeding ─────────────────────────────────────────────────────────────────────── */

describe('feeding', () => {
  it('treats a pet with no save entry as a fresh level one', () => {
    expect(progressOf({}, 'gloom-cat')).toEqual(NEW_PET);
    expect(NEW_PET).toEqual({ level: 1, rarity: 'common', fedToday: 0 });
  });

  it('gives exactly three feeds a day and then refuses with a reason', () => {
    let progress = NEW_PET;
    const wallet = { scraps: 99, gold: 999_999 };

    for (let i = 0; i < FEEDS_PER_DAY; i += 1) {
      const quote = quoteFeed(progress, wallet);
      expect(quote.ok).toBe(true);
      progress = afterFeed(progress);
    }

    expect(progress.level).toBe(1 + FEEDS_PER_DAY);
    const fourth = quoteFeed(progress, wallet);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.refusal.kind).toBe('fed-out');
  });

  it('quotes every refusal before it would charge for it', () => {
    const broke = quoteFeed(NEW_PET, { scraps: 5, gold: 0 });
    expect(broke.ok).toBe(false);
    if (!broke.ok) {
      expect(broke.refusal.kind).toBe('insufficient-gold');
      if (broke.refusal.kind === 'insufficient-gold') {
        expect(broke.refusal.needed).toBe(feedGoldCost(1));
      }
    }

    const empty = quoteFeed(NEW_PET, { scraps: 0, gold: 999_999 });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.refusal.kind).toBe('no-scraps');

    const grownUp = quoteFeed(grown(PET_MAX_LEVEL), { scraps: 9, gold: 999_999 });
    expect(grownUp.ok).toBe(false);
    if (!grownUp.ok) expect(grownUp.refusal.kind).toBe('max-level');
  });

  it('climbs the gold cost with the level, so late feeds are a decision', () => {
    expect(feedGoldCost(1)).toBeLessThan(feedGoldCost(25));
    expect(feedGoldCost(25)).toBeLessThan(feedGoldCost(PET_MAX_LEVEL));
    // Clamped at both ends rather than extrapolating off the curve.
    expect(feedGoldCost(0)).toBe(feedGoldCost(1));
    expect(feedGoldCost(999)).toBe(feedGoldCost(PET_MAX_LEVEL));
  });

  it('caps the level and never overshoots on the last feed', () => {
    const nearly = afterFeed(grown(PET_MAX_LEVEL - 1));
    expect(nearly.level).toBe(PET_MAX_LEVEL);
    expect(afterFeed(nearly).level).toBe(PET_MAX_LEVEL);
  });

  it('empties every bowl at midnight without touching the levels', () => {
    const progress: Record<string, PetProgress> = {
      'gloom-cat': { level: 12, rarity: 'common', fedToday: 3 },
      'ember-pup': { level: 4, rarity: 'uncommon', fedToday: 0 },
    };
    const next = clearFedToday(progress);
    expect(next['gloom-cat']).toEqual({ level: 12, rarity: 'common', fedToday: 0 });
    // Untouched entries keep their identity, so the store can skip the write.
    expect(next['ember-pup']).toBe(progress['ember-pup']);
  });
});

/* ── The boost curve ─────────────────────────────────────────────────────────────── */

describe('the boost is deliberately minor', () => {
  const catDef = pet('gloom-cat')!;
  const beetleDef = pet('brass-beetle')!;

  it('runs 1% at level one to 5% at fifty on the full-rate boosts', () => {
    expect(boostShare(catDef, NEW_PET)).toBeCloseTo(BOOST_BASE, 6);
    expect(boostShare(catDef, grown(PET_MAX_LEVEL))).toBeCloseTo(
      BOOST_BASE + BOOST_PER_LEVEL * (PET_MAX_LEVEL - 1),
      6,
    );
  });

  it('halves the three that multiply things already multiplied elsewhere', () => {
    expect(isHalfRate(beetleDef)).toBe(true);
    expect(isHalfRate(catDef)).toBe(false);
    expect(isHalfRate(pet('tankard-imp')!)).toBe(true);
    expect(isHalfRate(pet('sooty-raven')!)).toBe(true);

    const level = grown(PET_MAX_LEVEL);
    expect(boostShare(beetleDef, level)).toBeCloseTo(boostShare(catDef, level) / 2, 6);
  });

  it('adds a flat half-percent per rarity step, unhalved', () => {
    const epic = grown(PET_MAX_LEVEL, 'epic');
    expect(rarityIndex('common')).toBe(0);
    expect(rarityIndex('epic')).toBe(3);
    expect(boostShare(catDef, epic) - boostShare(catDef, grown(PET_MAX_LEVEL))).toBeCloseTo(
      RARITY_BONUS * 3,
      6,
    );
    // Not halved for the half-rate pets either — a quarter of a percent is nothing.
    expect(boostShare(beetleDef, epic) - boostShare(beetleDef, grown(PET_MAX_LEVEL))).toBeCloseTo(
      RARITY_BONUS * 3,
      6,
    );
  });

  it('keeps a maxed pet under one gear upgrade — measured, not asserted', () => {
    // `feeding.ts` claims the whole system caps out below a single item's attribute line. That
    // is a comparison, so it gets measured against the thing it is compared to rather than
    // frozen as a magic band: the reference hero the balance harness uses, and the average Rare
    // line at level 30. Tuning the pet curve up past gear, or gear down past pets, fails here.
    const ceiling = boostShare(catDef, grown(PET_MAX_LEVEL, 'epic'));
    const reference = buildReferenceCombatant('hunter', 30);
    const main = reference.attributes[reference.mainStat];

    const samples = 400;
    let total = 0;
    for (let i = 0; i < samples; i += 1) {
      const item = generateItem({
        level: 30,
        slot: 'chest',
        rarity: 'rare',
        classId: 'hunter',
        rng: createRng(SEED + i, `line/${i}`),
      });
      total += item.attrs[reference.mainStat] ?? 0;
    }
    const gearLine = total / samples / main;

    expect(ceiling).toBeLessThan(gearLine);
    // ...but not so far under it that fifty feeds and three upgrades bought nothing.
    expect(ceiling).toBeGreaterThan(gearLine * 0.75);
  });

  it('offers upgrades at fifteen, thirty and forty-five, and no more after epic', () => {
    expect(RARITY_STEPS.map((step) => step.atLevel)).toEqual([15, 30, 45]);
    expect(nextUpgrade(NEW_PET)?.rarity).toBe('uncommon');
    expect(nextUpgrade(grown(20, 'uncommon'))?.rarity).toBe('rare');
    expect(nextUpgrade(grown(40, 'rare'))?.rarity).toBe('epic');
    expect(nextUpgrade(grown(50, 'epic'))).toBeNull();
  });

  it('refuses an upgrade the level has not reached, and one the purse cannot pay', () => {
    const rich = { scrap: 0, essence: 999, starmetal: 99 };
    const early = quoteUpgrade(grown(14), rich);
    expect(early.ok).toBe(false);
    if (!early.ok && early.refusal.kind === 'level-too-low') expect(early.refusal.needed).toBe(15);

    const poor = quoteUpgrade(grown(15), { scrap: 0, essence: 0, starmetal: 0 });
    expect(poor.ok).toBe(false);
    if (!poor.ok) expect(poor.refusal.kind).toBe('insufficient-materials');

    const ok = quoteUpgrade(grown(15), rich);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.cost).toEqual({ scrap: 0, essence: 12, starmetal: 0 });

    const done = quoteUpgrade(grown(50, 'epic'), rich);
    expect(done.ok).toBe(false);
    if (!done.ok) expect(done.refusal.kind).toBe('fully-upgraded');
  });
});

/* ── Where the boost lands ───────────────────────────────────────────────────────── */

describe('one pet at a time, in exactly one place', () => {
  function withActive(id: PetId, progress = grown(50, 'epic')): SaveFile {
    const base = cleared(save(), 'barrowdeep', 5);
    return {
      ...base,
      dungeons: {
        ...base.dungeons,
        progress: {
          ...base.dungeons.progress,
          'rat-cellars': {
            floorsCleared: 10,
            cooldownUntil: 0,
            bestAttempts: Array.from({ length: 10 }, () => 0),
            attempts: 10,
            clearedAt: null,
          },
          emberdeep: {
            floorsCleared: 10,
            cooldownUntil: 0,
            bestAttempts: Array.from({ length: 10 }, () => 0),
            attempts: 10,
            clearedAt: null,
          },
        },
      },
      activity: { ...base.activity, missionsCompleted: 500 },
      arena: { ...base.arena, bestRank: 12 },
      pets: { ...base.pets, activeId: id, progress: { [id]: progress } },
    };
  }

  it('resolves nothing when no pet is at your side', () => {
    const file = cleared(save(), 'barrowdeep', 5);
    expect(activeBoost(file, ownedPets(file))).toBeNull();
  });

  it('refuses to boost from a pet that is not owned', () => {
    // A save that names a pet whose source has stopped being true must not keep the boost.
    const file = { ...save(), pets: { ...save().pets, activeId: 'gloom-cat' as PetId } };
    expect(activeBoost(file, ownedPets(file))).toBeNull();
  });

  it('routes an attribute pet through the stat block and nowhere else', () => {
    const file = withActive('gloom-cat');
    const boost = activeBoost(file, ownedPets(file))!;

    expect(boostedAttribute(boost)).toEqual({ stat: 'dex', share: boost.share });
    expect(boostedArmour(boost)).toBe(0);
    expect(rewardBonus(boost, { goldFind: 0, xpBonus: 0 })).toEqual({ gold: 1, xp: 1 });
  });

  it('routes armour to armour and the two payout boosts to the payout', () => {
    const beetle = withActive('brass-beetle');
    const beetleBoost = activeBoost(beetle, ownedPets(beetle))!;
    expect(boostedAttribute(beetleBoost)).toBeNull();
    expect(boostedArmour(beetleBoost)).toBeCloseTo(beetleBoost.share, 6);

    const imp = withActive('tankard-imp');
    const impBoost = activeBoost(imp, ownedPets(imp))!;
    expect(boostedAttribute(impBoost)).toBeNull();
    expect(boostedArmour(impBoost)).toBe(0);
    expect(rewardBonus(impBoost, { goldFind: 0, xpBonus: 0 }).gold).toBeCloseTo(
      1 + impBoost.share,
      6,
    );
    expect(rewardBonus(impBoost, { goldFind: 0, xpBonus: 0 }).xp).toBe(1);

    const raven = withActive('sooty-raven');
    const ravenBoost = activeBoost(raven, ownedPets(raven))!;
    expect(rewardBonus(ravenBoost, { goldFind: 0, xpBonus: 0 }).xp).toBeCloseTo(
      1 + ravenBoost.share,
      6,
    );
  });

  it('finally applies the gear specials that have been decorative since Phase 2', () => {
    // `goldFind: 3` on an item means +3%, and until this phase it was computed and dropped.
    const bare = rewardBonus(null, { goldFind: 3, xpBonus: 5 });
    expect(bare.gold).toBeCloseTo(1.03, 6);
    expect(bare.xp).toBeCloseTo(1.05, 6);
  });

  it('composes with the guild multiplicatively, in one direction only', () => {
    const guild = { gold: 1.1, xp: 1.05 };
    const petOnly = { gold: 1.04, xp: 1 };
    expect(combineBonus(guild, petOnly)).toEqual({
      gold: 1.1 * 1.04,
      xp: 1.05,
    });
    // Order cannot matter, or two call sites would disagree.
    expect(combineBonus(petOnly, guild)).toEqual(combineBonus(guild, petOnly));
  });
});

/* ── The drops ───────────────────────────────────────────────────────────────────── */

describe('scraps and the one egg', () => {
  it('drops scraps at the published rate', () => {
    const runs = 40_000;
    let drops = 0;
    for (let i = 0; i < runs; i += 1) {
      const found = rollScraps(createRng(SEED + i, `scraps/${i}`));
      if (found > 0) {
        expect(found).toBe(SCRAPS_PER_DROP);
        drops += 1;
      }
    }
    expect(drops / runs).toBeCloseTo(SCRAP_DROP_CHANCE, 2);
  });

  it('lays the egg only in its own zones, and only once', () => {
    const wrongZone = Array.from({ length: 5_000 }, (_, i) =>
      rollEgg({ zoneId: 'whispering-woods', owned: [], rng: createRng(SEED + i, `egg/${i}`) }),
    );
    expect(wrongZone.every((result) => result === null)).toBe(true);

    const runs = 60_000;
    let found = 0;
    for (let i = 0; i < runs; i += 1) {
      if (rollEgg({ zoneId: 'silverpine-pass', owned: [], rng: createRng(SEED + i, `e/${i}`) })) {
        found += 1;
      }
    }
    // 0.5%, the rarest thing in the game.
    expect(found / runs).toBeGreaterThan(0.003);
    expect(found / runs).toBeLessThan(0.008);

    // A second egg for a fox you already have is the rarest nothing in the game.
    const held = Array.from({ length: 5_000 }, (_, i) =>
      rollEgg({
        zoneId: 'silverpine-pass',
        owned: ['frost-fox'],
        rng: createRng(SEED + i, `held/${i}`),
      }),
    );
    expect(held.every((result) => result === null)).toBe(true);
  });

  it('is deterministic from the same stream', () => {
    const once = rollEgg({
      zoneId: 'frostfell-ridge',
      owned: [],
      rng: createRng(SEED, 'determinism'),
    });
    const twice = rollEgg({
      zoneId: 'frostfell-ridge',
      owned: [],
      rng: createRng(SEED, 'determinism'),
    });
    expect(once).toBe(twice);
    expect(rollScraps(createRng(SEED, 's'))).toBe(rollScraps(createRng(SEED, 's')));
  });
});
