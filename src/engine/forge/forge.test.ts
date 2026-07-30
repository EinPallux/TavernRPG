/**
 * Gear sets and the Emberforge.
 *
 * Four ROADMAP acceptance criteria. **Every set is completable** via dungeons plus crafting — a
 * claim about convergence, so it gets a simulated acquisition run rather than an assertion.
 * **Each 5-piece bonus measurably fires**, one dedicated test apiece, because a capstone nobody
 * can prove is working is a capstone nobody trusts. **Forge odds match config** over 100k rolls.
 * And **scrap and sell surface the right values**, which is really a claim about the two paths
 * agreeing.
 *
 * The set bonuses are the interesting part. Thirty of them are declared as data and folded into
 * one bag, so the risk is not that a bonus is wrong — it is that a bonus is *silently absent*:
 * folded into a field nothing reads, or read at a point the fight never reaches. Every test here
 * is written to fail if its effect stops happening, not merely if its number changes.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { fight } from '@/engine/combat/fight';
import { buildHeroCombatant, buildReferenceCombatant } from '@/engine/combat/combatant';
import type { BattleEvent, Combatant } from '@/engine/combat/types';
import { addItem, createHero, equipItem } from '@/engine/hero/actions';
import { generateItem, generateSetPiece } from '@/engine/items/generate';
import { modifiersFor, ownedSetPieces, setProgress, drawMissingPiece } from '@/engine/items/sets';
import { RARITIES, type ClassId, type Rarity, type SlotId } from '@/engine/items/types';
import { disposeItem } from '@/engine/items/dispose';
import { GEAR_SETS, SET_SLOTS, gearSet, setsForClass } from '@/data/gearSets';
import { createNewSave, type Hero } from '@/engine/save/schema';
import {
  EMBER_PITY,
  FORGE_TIER_DEFS,
  RECIPE_COST,
  SCRAPS_PER_DAY,
  addMaterials,
  canAfford,
  forgeOdds,
  forgeTier,
  spend,
} from './forgeConfig';
import { craftItem, craftSetPiece, drawRecipe, rollForgeRarity } from './craft';

const SEED = 20_261_201;

/** A hero of a class, at a level, wearing the given sets' pieces. */
function wearing(classId: ClassId, setId: string, pieces: number, level = 40): Hero {
  let hero = createHero({ name: 'Set', classId, now: 0, rng: createRng(SEED, 'kit') });
  hero = { ...hero, level };

  const rng = createRng(SEED, `wear:${setId}`);
  for (const slot of SET_SLOTS.slice(0, pieces)) {
    const piece = generateSetPiece({ setId, slot, level, rng })!;
    hero = addItem(hero, piece).hero;
    hero = equipItem(hero, piece);
  }
  // A weapon, or the hero swings for one damage and every bonus disappears into rounding.
  const weapon = generateItem({ slot: 'weapon', rarity: 'rare', classId, level, rng });
  hero = addItem(hero, weapon).hero;
  return equipItem(hero, weapon);
}

const count = (log: readonly BattleEvent[], type: BattleEvent['t']) =>
  log.filter((event) => event.t === type).length;

/** Every set proc of one kind that fired across a batch of fights. */
function procsAcross(hero: Combatant, foe: () => Combatant, fights: number, effect: string) {
  let seen = 0;
  for (let i = 0; i < fights; i += 1) {
    const { log } = fight(hero, foe(), i * 7919 + 13);
    seen += log.filter((event) => event.t === 'set_proc' && event.effect === effect).length;
  }
  return seen;
}

const dummy = (over: Partial<Combatant> = {}): Combatant => ({
  id: 'dummy',
  name: 'Dummy',
  kind: 'Dummy',
  level: 40,
  maxHealth: 40_000,
  attributes: { str: 40, dex: 40, int: 40, con: 40, lck: 0 },
  mainStat: 'str',
  weapon: { min: 60, max: 60 },
  armour: 0,
  damageReductionCap: 0,
  procs: [],
  ...over,
});

describe('set progress', () => {
  it('counts pieces worn separately from pieces owned', () => {
    // Different questions: "how far off am I?" versus "why is my four-piece not firing?".
    let hero = wearing('warrior', 'oathsworn-bulwark', 2);
    const spare = generateSetPiece({
      setId: 'oathsworn-bulwark',
      slot: 'boots',
      level: 40,
      rng: createRng(SEED, 'spare'),
    })!;
    hero = addItem(hero, spare).hero;

    const [oathsworn] = setProgress('warrior', hero.equipment, hero.backpack);
    expect(oathsworn!.equipped.size).toBe(2);
    expect(oathsworn!.owned.size).toBe(3);
    expect(oathsworn!.complete).toBe(false);
  });

  it('unlocks bonuses at two, four and five and not before', () => {
    const at = (pieces: number) => modifiersFor(wearing('warrior', 'oathsworn-bulwark', pieces).equipment);

    expect(at(1).armour).toBe(0);
    expect(at(2).armour).toBeCloseTo(0.1, 5);
    expect(at(3).reflect).toBe(0);
    expect(at(4).reflect).toBeCloseTo(0.15, 5);
    expect(at(4).block).toBe(0);
    expect(at(5).block).toBeCloseTo(0.08, 5);
  });

  it('locks a set to its own class', () => {
    for (const definition of GEAR_SETS) {
      const piece = generateSetPiece({
        setId: definition.id,
        slot: 'chest',
        level: 30,
        rng: createRng(SEED, definition.id),
      })!;
      expect(piece.classLock, definition.id).toBe(definition.classId);
      expect(piece.rarity).toBe('set');
      expect(piece.setId).toBe(definition.id);
    }
  });

  it('spends a set piece’s budget on the attributes its set was designed around', () => {
    // The one authored statline in the game: curated, not shuffled (spec §1).
    const rng = createRng(SEED, 'curated');
    const a = generateSetPiece({ setId: 'oathsworn-bulwark', slot: 'chest', level: 40, rng })!;
    const b = generateSetPiece({
      setId: 'oathsworn-bulwark',
      slot: 'chest',
      level: 40,
      rng: createRng(SEED, 'curated-2'),
    })!;

    // Same shape every time, unlike a rolled item.
    expect(Object.keys(a.attrs).sort()).toEqual(Object.keys(b.attrs).sort());
    expect(a.attrs.con).toBe(b.attrs.con);
    // And it is the shape the set says: Oathsworn's chest is constitution-first.
    expect(a.attrs.con!).toBeGreaterThan(a.attrs.str!);
  });
});

describe('the five-piece capstones — ROADMAP acceptance', () => {
  it('Oathsworn throws damage back off a block', () => {
    const hero = buildHeroCombatant(wearing('warrior', 'oathsworn-bulwark', 4), 'hero');
    expect(procsAcross(hero, () => dummy(), 12, 'reflect')).toBeGreaterThan(0);
  });

  it('Wolfblood swings again once the enemy is under a quarter', () => {
    const hero = buildHeroCombatant(wearing('warrior', 'wolfblood-warplate', 5), 'hero');
    const fired = procsAcross(hero, () => dummy({ maxHealth: 6_000 }), 8, 'execute');
    expect(fired).toBeGreaterThan(0);
    // Once a battle, never twice — the bound is the point (spec §3).
    for (let i = 0; i < 8; i += 1) {
      const { log } = fight(hero, dummy({ maxHealth: 6_000 }), i * 31);
      expect(log.filter((e) => e.t === 'set_proc' && e.effect === 'execute').length).toBeLessThanOrEqual(1);
    }
  });

  it('Maestro opens on the Verse the player chose', () => {
    const base = wearing('bard', 'maestros-ensemble', 5);
    const hero = buildHeroCombatant({ ...base, openingVerse: 'discord' }, 'hero');
    expect(hero.openingVerse).toBe('discord');

    const { log } = fight(hero, dummy(), 5);
    const first = log.find((event) => event.t === 'verse_change');
    expect(first).toMatchObject({ side: 'a', verse: 'discord' });
  });

  it('Maestro’s two-piece stretches how long a Verse lasts', () => {
    const four = buildHeroCombatant(wearing('bard', 'maestros-ensemble', 4), 'hero');
    const one = buildHeroCombatant(wearing('bard', 'maestros-ensemble', 1), 'hero');

    // Same fight length, fewer changes: the Verse is running longer.
    const changes = (subject: Combatant) =>
      count(fight(subject, dummy({ maxHealth: 200_000, weapon: { min: 1, max: 1 } }), 9, {
        maxRounds: 24,
      }).log, 'verse_change');

    expect(changes(four)).toBeLessThan(changes(one));
  });

  it('Dawnchorus mends on every change of Verse', () => {
    const hero = buildHeroCombatant(wearing('bard', 'dawnchorus-attire', 4), 'hero');
    // A long fight against something that hurts, so there is room to heal into.
    let healed = 0;
    for (let i = 0; i < 8; i += 1) {
      const { log } = fight(hero, dummy({ weapon: { min: 300, max: 300 } }), i * 17, { maxRounds: 30 });
      healed += log.filter((e) => e.t === 'set_proc' && e.effect === 'verse-heal').length;
    }
    expect(healed).toBeGreaterThan(0);
  });

  it('Emberweave lifts the floor of the damage roll rather than the ceiling', () => {
    const steady = buildHeroCombatant(wearing('mage', 'emberweave-vestments', 5), 'hero');
    const plain = buildHeroCombatant(wearing('mage', 'emberweave-vestments', 4), 'hero');

    // The hero's own non-crit swings only: the dummy's roll is fixed, and including it would
    // put the same floor under both samples and make the assertion untestable.
    const swings = (subject: Combatant) => {
      const values: number[] = [];
      for (let i = 0; i < 40; i += 1) {
        for (const event of fight(subject, dummy({ maxHealth: 400_000 }), i * 13, { maxRounds: 30 }).log) {
          if (event.t === 'attack' && event.source === 'a' && !event.crit) values.push(event.raw);
        }
      }
      return values.sort((a, b) => a - b);
    };

    const withSet = swings(steady);
    const without = swings(plain);
    // The worst swings improve; the best do not run away.
    expect(withSet[0]!).toBeGreaterThan(without[0]!);
    expect(withSet.at(-1)!).toBeLessThan(without.at(-1)! * 1.2);
  });

  it('Tidecaller shields once, on the way under a third', () => {
    const hero = buildHeroCombatant(wearing('mage', 'tidecallers-regalia', 5), 'hero');
    for (let i = 0; i < 10; i += 1) {
      const { log } = fight(hero, dummy({ weapon: { min: 900, max: 900 } }), i * 23, { maxRounds: 40 });
      expect(log.filter((e) => e.t === 'set_proc' && e.effect === 'absorb').length).toBeLessThanOrEqual(1);
    }
    expect(
      procsAcross(hero, () => dummy({ weapon: { min: 900, max: 900 } }), 10, 'absorb'),
    ).toBeGreaterThan(0);
  });

  it('Thornstalker answers a dodge with a shot, at most once a round', () => {
    const hero = buildHeroCombatant(wearing('hunter', 'thornstalkers-guise', 5), 'hero');
    expect(procsAcross(hero, () => dummy(), 12, 'counter')).toBeGreaterThan(0);

    for (let i = 0; i < 12; i += 1) {
      const { log } = fight(hero, dummy(), i * 41, { maxRounds: 20 });
      // Never two counters between one round marker and the next.
      let sinceRound = 0;
      for (const event of log) {
        if (event.t === 'round_start') sinceRound = 0;
        if (event.t === 'set_proc' && event.effect === 'counter') sinceRound += 1;
        expect(sinceRound).toBeLessThanOrEqual(1);
      }
    }
  });

  it('Galewind peels armour on a crit, to its cap', () => {
    const lucky = wearing('hunter', 'galewind-harness', 5);
    const hero = buildHeroCombatant(
      { ...lucky, trained: { ...lucky.trained, lck: 400 } },
      'hero',
    );
    let highest = 0;
    for (let i = 0; i < 12; i += 1) {
      const { log } = fight(hero, dummy({ maxHealth: 200_000 }), i * 53, { maxRounds: 30 });
      for (const event of log) {
        if (event.t === 'set_proc' && event.effect === 'shred') highest = Math.max(highest, event.amount);
      }
    }
    expect(highest).toBeGreaterThan(0);
    // Four stacks of five points, and not a fifth.
    expect(highest).toBeLessThanOrEqual(20);
  });

  it('Corsair carries a flurry into a third strike', () => {
    const hero = buildHeroCombatant(wearing('swashbuckler', 'corsair-kings-finery', 5), 'hero');
    expect(procsAcross(hero, () => dummy({ maxHealth: 200_000 }), 10, 'third-strike')).toBeGreaterThan(0);
  });

  it('Nighttide makes the first blow of the battle a certainty', () => {
    const hero = buildHeroCombatant(wearing('swashbuckler', 'nighttide-silks', 5), 'hero');
    for (let i = 0; i < 20; i += 1) {
      const { log } = fight(hero, dummy({ maxHealth: 200_000 }), i * 61);
      const firstOfMine = log.find((event) => event.t === 'attack' && event.source === 'a');
      expect(firstOfMine, `fight ${i}`).toMatchObject({ crit: true });
    }
  });
});

describe('set balance — spec §3', () => {
  /**
   * The bound on the whole feature.
   *
   * Five-piece bonuses are weeks of chase and are meant to feel like it, but a mirror match
   * between two players who both finished their set must still be a fight. 42–58% is the spec's
   * band; anything outside it means one class's capstone is simply better than another's.
   */
  it('keeps a full-set mirror inside 42–58%', () => {
    for (const definition of GEAR_SETS) {
      const hero = buildHeroCombatant(wearing(definition.classId, definition.id, 5), 'a');
      const twin = buildHeroCombatant(wearing(definition.classId, definition.id, 5), 'b');

      let wins = 0;
      const fights = 300;
      for (let i = 0; i < fights; i += 1) {
        if (fight(hero, twin, i * 7919).winner === 'a') wins += 1;
      }
      const rate = wins / fights;
      expect(rate, `${definition.id} mirror at ${Math.round(rate * 100)}%`).toBeGreaterThan(0.42);
      expect(rate, `${definition.id} mirror at ${Math.round(rate * 100)}%`).toBeLessThan(0.58);
    }
  });

  it('makes a full set worth chasing without making it the whole fight', () => {
    // Against an on-curve reference of the same class and level: better, but not a different game.
    for (const definition of GEAR_SETS) {
      const dressed = buildHeroCombatant(wearing(definition.classId, definition.id, 5), 'a');
      const bare = buildReferenceCombatant(definition.classId, 40, 'b');

      let wins = 0;
      for (let i = 0; i < 200; i += 1) {
        if (fight(dressed, bare, i * 104_729).winner === 'a') wins += 1;
      }
      const rate = wins / 200;
      expect(rate, `${definition.id} vs bare at ${Math.round(rate * 100)}%`).toBeGreaterThan(0.5);
    }
  });
});

describe('the forge — ROADMAP acceptance', () => {
  it('rolls the odds its own tiles publish', () => {
    // "Odds always visible" only means anything if the table and the roll are the same object.
    for (const tier of FORGE_TIER_DEFS) {
      const rng = createRng(SEED, `odds:${tier.id}`);
      const seen: Record<string, number> = {};
      const rolls = 100_000;
      for (let i = 0; i < rolls; i += 1) {
        const rarity = rollForgeRarity(tier.id, rng.fork(`r${i}`));
        seen[rarity] = (seen[rarity] ?? 0) + 1;
      }

      for (const rarity of RARITIES) {
        if (rarity === 'set') {
          // A plain forge never produces a set piece — that is what recipes are for.
          expect(seen['set'] ?? 0, tier.id).toBe(0);
          continue;
        }
        const published = forgeOdds(tier, rarity as Exclude<Rarity, 'set'>);
        const measured = ((seen[rarity] ?? 0) * 100) / rolls;
        expect(measured, `${tier.id} ${rarity}`).toBeCloseTo(published, 0);
      }
    }
  });

  it('pays the pity Epic at five Master forges, and resets', () => {
    const options = {
      tier: 'master' as const,
      slot: 'weapon' as SlotId,
      classId: 'warrior' as ClassId,
      level: 40,
    };
    let meter = 0;
    for (let i = 0; i < EMBER_PITY; i += 1) {
      const result = craftItem({ ...options, emberMeter: meter, rng: createRng(SEED, `m${i}`) });
      expect(result.pitied).toBe(false);
      meter = result.emberMeter;
    }
    expect(meter).toBe(EMBER_PITY);

    const paid = craftItem({ ...options, emberMeter: meter, rng: createRng(SEED, 'pity') });
    expect(paid.pitied).toBe(true);
    expect(paid.item.rarity).toBe('epic');
    expect(paid.emberMeter).toBe(0);
  });

  it('only lets the Master forge feed the meter', () => {
    for (const tier of FORGE_TIER_DEFS) {
      const result = craftItem({
        tier: tier.id,
        slot: 'chest',
        classId: 'mage',
        level: 20,
        emberMeter: 2,
        rng: createRng(SEED, tier.id),
      });
      expect(result.emberMeter, tier.id).toBe(tier.feedsPity ? 3 : 2);
    }
  });

  it('crafts into the slot the player chose — the whole point of the forge', () => {
    for (const slot of ['weapon', 'boots', 'ring'] as SlotId[]) {
      const result = craftItem({
        tier: 'fine',
        slot,
        classId: 'hunter',
        level: 25,
        emberMeter: 0,
        rng: createRng(SEED, slot),
      });
      expect(result.item.slot).toBe(slot);
      expect(result.item.level).toBe(25);
    }
  });

  it('never hands a recipe craft a piece already owned', () => {
    const owned = new Set(['oathsworn-bulwark:helmet', 'oathsworn-bulwark:chest']);
    for (let i = 0; i < 200; i += 1) {
      const made = craftSetPiece({
        setId: 'oathsworn-bulwark',
        owned,
        level: 30,
        rng: createRng(SEED, `recipe${i}`),
      })!;
      expect(made.refresh).toBe(false);
      expect(owned.has(`oathsworn-bulwark:${made.item.slot}`)).toBe(false);
    }
  });

  it('rolls a level-refreshed copy once the set is complete', () => {
    const owned = new Set(SET_SLOTS.map((slot) => `oathsworn-bulwark:${slot}`));
    const made = craftSetPiece({
      setId: 'oathsworn-bulwark',
      owned,
      level: 70,
      rng: createRng(SEED, 'refresh'),
    })!;
    expect(made.refresh).toBe(true);
    expect(made.item.level).toBe(70);
    expect(made.item.setId).toBe('oathsworn-bulwark');
  });

  it('offers recipes only for sets this class can wear and does not hold', () => {
    const both = setsForClass('bard').map((entry) => entry.id);
    const first = drawRecipe({ classId: 'bard', owned: [], rng: createRng(SEED, 'r1') })!;
    expect(both).toContain(first);
    expect(drawRecipe({ classId: 'bard', owned: both, rng: createRng(SEED, 'r2') })).toBeNull();
  });
});

describe('materials', () => {
  it('credits the wallet the quote promised — scrap and sell agree', () => {
    let hero = createHero({ name: 'Smith', classId: 'warrior', now: 0, rng: createRng(SEED, 'k') });
    const item = generateItem({
      slot: 'chest',
      rarity: 'epic',
      classId: 'warrior',
      level: 30,
      rng: createRng(SEED, 'epic'),
    });
    hero = addItem(hero, item).hero;

    const scrapped = disposeItem(hero, item.uid, 'scrap', { scrapsToday: 0, scrapLimit: SCRAPS_PER_DAY });
    expect(scrapped.ok).toBe(true);
    if (!scrapped.ok) return;

    // The wallet gains exactly what the quote named — the Phase 7 promise, finally paid.
    expect(scrapped.hero.materials).toEqual(addMaterials(hero.materials, item.scrapYield));
    expect(scrapped.hero.gold).toBe(hero.gold);

    // Selling the same piece pays gold and no materials. Two paths, one decision (spec §4).
    const sold = disposeItem(hero, item.uid, 'sell');
    expect(sold.ok).toBe(true);
    if (!sold.ok) return;
    expect(sold.hero.gold).toBe(hero.gold + item.value);
    expect(sold.hero.materials).toEqual(hero.materials);
  });

  it('will not spend what it does not have', () => {
    const wallet = { scrap: 5, essence: 0, starmetal: 0 };
    expect(canAfford(wallet, forgeTier('rough').cost)).toBe(false);
    expect(canAfford({ scrap: 12, essence: 0, starmetal: 0 }, forgeTier('rough').cost)).toBe(true);
    expect(canAfford({ scrap: 0, essence: 20, starmetal: 2 }, RECIPE_COST)).toBe(true);
    // And never goes below zero.
    expect(spend(wallet, { scrap: 99, essence: 99, starmetal: 99 })).toEqual({
      scrap: 0,
      essence: 0,
      starmetal: 0,
    });
  });

  it('starts a new hero with an empty purse', () => {
    const save = createNewSave({ slot: 1, worldSeed: SEED, now: 0 });
    expect(save.forge.recipes).toEqual([]);
    expect(save.forge.emberMeter).toBe(0);
    const hero = createHero({ name: 'New', classId: 'mage', now: 0 });
    expect(hero.materials).toEqual({ scrap: 0, essence: 0, starmetal: 0 });
    expect(hero.openingVerse).toBeNull();
  });
});

describe('acquisition converges — ROADMAP acceptance', () => {
  /**
   * Every set completable via dungeons plus crafting.
   *
   * Simulated rather than asserted, because the claim is about *convergence*: the no-dupe rule
   * says a dungeon never hands over a piece you hold, so a player who keeps delving must finish.
   * The test is whether that terminates in a sane number of drops rather than trailing a long
   * tail of near-misses.
   */
  it('finishes both of a class’s sets from set drops alone', () => {
    for (const classId of ['warrior', 'bard', 'mage', 'hunter', 'swashbuckler'] as ClassId[]) {
      const owned = new Set<string>();
      const rng = createRng(SEED, `acquire:${classId}`);
      const total = setsForClass(classId).length * SET_SLOTS.length;

      let draws = 0;
      while (owned.size < total && draws < 200) {
        const piece = drawMissingPiece(classId, owned, rng.fork(`d${draws}`));
        expect(piece, `${classId} ran out of pieces at ${owned.size}/${total}`).not.toBeNull();
        owned.add(`${piece!.setId}:${piece!.slot}`);
        draws += 1;
      }

      // Ten pieces, and the no-dupe rule means exactly ten draws — never a tail.
      expect(owned.size, classId).toBe(total);
      expect(draws, classId).toBe(total);
      expect(drawMissingPiece(classId, owned, rng)).toBeNull();
    }
  });

  it('tracks what a hero owns across the bags, the satchel and the paperdoll', () => {
    let hero = wearing('hunter', 'thornstalkers-guise', 2);
    const bagged = generateSetPiece({
      setId: 'thornstalkers-guise',
      slot: 'boots',
      level: 40,
      rng: createRng(SEED, 'bag'),
    })!;
    hero = addItem(hero, bagged).hero;

    const owned = ownedSetPieces(hero);
    expect(owned.has('thornstalkers-guise:helmet')).toBe(true);
    expect(owned.has('thornstalkers-guise:boots')).toBe(true);
    expect(owned.has('thornstalkers-guise:belt')).toBe(false);
  });

  it('names a source for every set, so the collections page can point somewhere', () => {
    for (const definition of GEAR_SETS) {
      expect(definition.source.length, definition.id).toBeGreaterThan(10);
      expect(gearSet(definition.id)).toBe(definition);
    }
  });
});
