/**
 * Drop rate tests.
 *
 * The game promises the player visible odds. That promise is only worth something if the table
 * the card prints is the table the dice actually obey, so these run large seeded batches and
 * check the *measured* rate against the published one. A tuning change that forgets to update
 * the doc will fail here rather than quietly shipping a lie.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { RARITIES } from './types';
import {
  DUNGEON_CLEAR_DROPS,
  DUNGEON_EPIC_CHANCE,
  DUNGEON_FLOOR_DROPS,
  MISSION_DROPS,
  dungeonDropTable,
  missionDropTable,
  rarityOdds,
  rollDungeonDrops,
  rollMissionDrops,
  rollRarity,
} from './drops';

const BATCH = 40_000;
/** Sampling slack for a batch this size — tight enough to catch a real drift. */
const TOLERANCE = 0.012;

function batch(duration: number, count = BATCH) {
  const table = missionDropTable(duration);
  let items = 0;
  let dice = 0;
  let ale = 0;
  const byRarity = new Map<string, number>();

  for (let i = 0; i < count; i += 1) {
    const roll = rollMissionDrops(table, createRng(i + 1, `drops/${duration}`));
    if (roll.item) {
      items += 1;
      byRarity.set(roll.item.rarity, (byRarity.get(roll.item.rarity) ?? 0) + 1);
    }
    dice += roll.dice;
    if (roll.ale) ale += 1;
  }

  return { table, count, items, dice, ale, byRarity };
}

describe('mission drop rates match the published table', () => {
  it.each([5, 10, 15, 20])('drops an item at the advertised rate (%i min)', (duration) => {
    const result = batch(duration);
    expect(result.items / result.count).toBeCloseTo(result.table.itemChance, 2);
  });

  it('pays the twenty-minute mission in odds, not in more gold', () => {
    // The design rule from §6: long missions are attractive because of *what* drops.
    expect(MISSION_DROPS[20]!.itemChance).toBeGreaterThan(MISSION_DROPS[5]!.itemChance);
    expect(MISSION_DROPS[20]!.rarityWeights.epic).toBeGreaterThan(
      MISSION_DROPS[5]!.rarityWeights.epic,
    );
    expect(MISSION_DROPS[20]!.diceChance).toBeGreaterThan(MISSION_DROPS[5]!.diceChance);
  });

  it.each([5, 20])('splits rarities by the published weights (%i min)', (duration) => {
    const result = batch(duration);

    for (const rarity of RARITIES) {
      const measured = ((result.byRarity.get(rarity) ?? 0) / result.count) * 100;
      const published = rarityOdds(result.table, rarity);
      expect(Math.abs(measured - published), `${rarity}: ${measured} vs ${published}`).toBeLessThan(
        TOLERANCE * 100,
      );
    }
  });

  it('never drops a Set piece from a mission — those are earned elsewhere', () => {
    for (const duration of [5, 10, 15, 20]) {
      expect(missionDropTable(duration).rarityWeights.set).toBe(0);
    }
    expect(batch(20, 20_000).byRarity.get('set')).toBeUndefined();
  });

  it('drops Golden Dice at the advertised trickle', () => {
    const short = batch(5);
    const long = batch(20);

    expect(short.dice / short.count).toBeCloseTo(0.006, 2);
    expect(long.dice / long.count).toBeCloseTo(0.015, 2);
  });

  it('drops Ale at 2% regardless of duration', () => {
    for (const duration of [5, 20]) {
      const result = batch(duration);
      expect(result.ale / result.count, `${duration}m`).toBeCloseTo(0.02, 2);
    }
  });

  it('spreads item drops across every slot', () => {
    const slots = new Set<string>();
    for (let i = 0; i < 4_000; i += 1) {
      const roll = rollMissionDrops(missionDropTable(20), createRng(i + 1, 'drops/slots'));
      if (roll.item) slots.add(roll.item.slot);
    }
    expect(slots.size).toBe(10);
  });
});

describe('determinism', () => {
  it('gives the same seed the same loot, every time', () => {
    const table = missionDropTable(20);
    const once = rollMissionDrops(table, createRng(1234, 'mission:1234'));
    const twice = rollMissionDrops(table, createRng(1234, 'mission:1234'));

    expect(once).toEqual(twice);
  });

  it('keeps drop kinds independent — adding one cannot shift another', () => {
    // Each kind draws from its own named fork, so a table with no Ale must roll the same item
    // as a table with Ale. This is what lets new drop types ship without invalidating seeds.
    const base = missionDropTable(20);
    const noAle = { ...base, aleChance: 0 };

    for (let seed = 1; seed <= 200; seed += 1) {
      const withAle = rollMissionDrops(base, createRng(seed, 'independence'));
      const without = rollMissionDrops(noAle, createRng(seed, 'independence'));
      expect(without.item, `seed ${seed}`).toEqual(withAle.item);
      expect(without.dice, `seed ${seed}`).toBe(withAle.dice);
    }
  });
});

describe('rollRarity', () => {
  it('respects a degenerate table rather than throwing', () => {
    const onlyRare = { common: 0, uncommon: 0, rare: 1, epic: 0, set: 0, legendary: 0 };
    expect(rollRarity(onlyRare, createRng(7, 'degenerate'))).toBe('rare');
  });
});

describe('rarityOdds', () => {
  it('sums to the overall item chance', () => {
    for (const duration of [5, 20]) {
      const table = missionDropTable(duration);
      const total = RARITIES.reduce((sum, rarity) => sum + rarityOdds(table, rarity), 0);
      expect(total, `${duration}m`).toBeCloseTo(table.itemChance * 100, 6);
    }
  });

  it('prints the numbers the design doc publishes', () => {
    // balancing §7: 20-min mission is 38% overall, weights 55/28/13/4.
    const long = missionDropTable(20);
    expect(rarityOdds(long, 'common')).toBeCloseTo(20.9, 1);
    expect(rarityOdds(long, 'uncommon')).toBeCloseTo(10.64, 1);
    expect(rarityOdds(long, 'rare')).toBeCloseTo(4.94, 1);
    expect(rarityOdds(long, 'epic')).toBeCloseTo(1.52, 1);
  });
});

describe('dungeon drop rates match the published table', () => {
  const SAMPLES = 30_000;

  it('pays a floor twice: the normal roll and a separate Epic on top', () => {
    /*
     * Two rolls, not one, and the test says so in both directions. Balancing §7 publishes a 50%
     * item chance *plus* a 25% Epic roll for floors 1–9, and a single generous roll cannot
     * produce that shape however its weights are written — a floor the player geared up three
     * days to beat has to be able to pay twice.
     */
    const rng = createRng(4242, 'dungeon-drops');
    let normals = 0;
    let epics = 0;
    let both = 0;

    for (let i = 0; i < SAMPLES; i += 1) {
      const drops = rollDungeonDrops(3, rng.fork(`f${i}`));
      if (drops.length === 2) both += 1;
      if (drops.length > 0) normals += 1;
      epics += drops.filter((drop) => drop.rarity === 'epic').length;
    }

    // The normal roll alone accounts for half of all floors…
    expect(normals / SAMPLES).toBeGreaterThan(DUNGEON_FLOOR_DROPS.itemChance);
    // …and the bonus Epic lands on a quarter of them, independently.
    expect(epics / SAMPLES).toBeGreaterThan(DUNGEON_EPIC_CHANCE);
    expect(both / SAMPLES).toBeCloseTo(DUNGEON_FLOOR_DROPS.itemChance * DUNGEON_EPIC_CHANCE, 1);
  });

  it('weights a floor toward the good end of the table, unlike a mission', () => {
    /*
     * Compared as *shares of the table*, not as absolute odds. A dungeon floor drops twice as
     * often as a five-minute mission, so its absolute chance of a Common is higher even though
     * its weights are far kinder — measuring the wrong one of those makes the better shelf look
     * like the worse one.
     */
    const share = (table: typeof DUNGEON_FLOOR_DROPS, rarity: 'common' | 'epic') => {
      const total = RARITIES.reduce((sum, id) => sum + table.rarityWeights[id], 0);
      return table.rarityWeights[rarity] / total;
    };

    // 40/32/20/8 against a mission's 62/26/9.5/2.5 (§7).
    expect(share(DUNGEON_FLOOR_DROPS, 'epic')).toBeGreaterThan(share(missionDropTable(20), 'epic'));
    expect(share(DUNGEON_FLOOR_DROPS, 'common')).toBeLessThan(share(missionDropTable(5), 'common'));
    // And it drops at all twice as often, on top of the better weights.
    expect(DUNGEON_FLOOR_DROPS.itemChance).toBeGreaterThan(missionDropTable(20).itemChance);
  });

  it('always hands over exactly one Epic on the tenth floor', () => {
    const rng = createRng(99, 'clear');
    for (let i = 0; i < 500; i += 1) {
      const drops = rollDungeonDrops(10, rng.fork(`c${i}`));
      // One certain Epic rather than one certain plus one likely: the guarantee comes out of
      // the table, so the bonus roll is switched off for the clear.
      expect(drops).toHaveLength(1);
      expect(drops[0]!.rarity).toBe('epic');
    }
    expect(dungeonDropTable(10)).toBe(DUNGEON_CLEAR_DROPS);
    expect(DUNGEON_CLEAR_DROPS.itemChance).toBe(1);
  });

  it('never turns a dungeon into a Golden Dice faucet', () => {
    // Floor 10 pays them in a lump for finishing; the floors themselves pay none (§7).
    expect(DUNGEON_FLOOR_DROPS.diceChance).toBe(0);
    expect(DUNGEON_CLEAR_DROPS.diceChance).toBe(0);
  });

  it('is fixed by its stream, so watching the fight twice cannot reroll the loot', () => {
    const once = rollDungeonDrops(7, createRng(7, 'delve'));
    const again = rollDungeonDrops(7, createRng(7, 'delve'));
    expect(again).toEqual(once);
  });
});
