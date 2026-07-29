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
import { MISSION_DROPS, missionDropTable, rarityOdds, rollMissionDrops, rollRarity } from './drops';

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
    const onlyRare = { common: 0, uncommon: 0, rare: 1, epic: 0, set: 0 };
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
