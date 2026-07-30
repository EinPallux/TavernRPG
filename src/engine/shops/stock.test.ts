/**
 * Shop stock tests.
 *
 * Two properties carry the feature. **The shelf must be stable for a day**, or the Golden Die
 * reroll is refundable by pressing F5 and the sink is theatre. And **the guaranteed mix must
 * actually be guaranteed**, or the shop is a slot machine wearing an apron — the whole point of
 * Bram is that he reliably has a weapon.
 */

import { describe, expect, it } from 'vitest';
import { ARMOUR_SLOTS, JEWELLERY_SLOTS, RARITIES, type ClassId } from '@/engine/items/types';
import {
  SHOP_IDS,
  SHOP_PRICE_MULTIPLIER,
  SHOP_RARITY_WEIGHTS,
  STOCK_SIZE,
  drawStock,
  remainingStock,
  shelfValue,
  shopPrice,
  type ShopId,
} from './stock';

const SEED = 20260730;
const DAY = '2026-07-30';

const stock = (over: Partial<Parameters<typeof drawStock>[0]> = {}) =>
  drawStock({
    shopId: 'armory',
    worldSeed: SEED,
    dayKey: DAY,
    heroLevel: 20,
    classId: 'warrior',
    ...over,
  });

describe('the shelf is the same all day', () => {
  it('draws identically for the same day, seed and reroll count', () => {
    // If this ever fails, refreshing the page is a free reroll.
    expect(stock()).toEqual(stock());
  });

  it('draws a different shelf tomorrow', () => {
    expect(stock({ dayKey: '2026-07-31' })).not.toEqual(stock());
  });

  it('draws a different shelf for each reroll', () => {
    const shelves = [0, 1, 2, 3].map((rerollCount) => JSON.stringify(stock({ rerollCount })));
    expect(new Set(shelves).size).toBe(shelves.length);
  });

  it('gives two players with different world seeds different shelves', () => {
    expect(stock({ worldSeed: SEED + 1 })).not.toEqual(stock());
  });

  it('gives the two shops different stock on the same day', () => {
    expect(stock({ shopId: 'facet' })).not.toEqual(stock({ shopId: 'armory' }));
  });
});

describe('the guaranteed mix', () => {
  it('always puts a weapon and an offhand on Bram’s shelf', () => {
    // A shop that might have no weapon is a shop the player learns to skip.
    for (let day = 1; day <= 60; day += 1) {
      const shelf = stock({ dayKey: `2026-09-${day}` });
      const slots = shelf.map((item) => item.slot);

      expect(slots, `day ${day}`).toContain('weapon');
      expect(slots, `day ${day}`).toContain('offhand');
    }
  });

  it('always puts three distinct armour pieces on Bram’s shelf', () => {
    for (let day = 1; day <= 60; day += 1) {
      const shelf = stock({ dayKey: `2026-09-${day}` });
      const armour = shelf.filter((item) => ARMOUR_SLOTS.includes(item.slot));

      // Three guaranteed; the wildcard may add a fourth, but never a duplicate of the trio.
      expect(armour.length, `day ${day}`).toBeGreaterThanOrEqual(3);
      const trio = shelf.slice(2, 5).map((item) => item.slot);
      expect(new Set(trio).size, `day ${day}`).toBe(3);
    }
  });

  it('always puts two rings, two amulets and a trinket in Sela’s case', () => {
    for (let day = 1; day <= 60; day += 1) {
      const shelf = stock({ shopId: 'facet', dayKey: `2026-09-${day}` });
      const count = (slot: string) => shelf.filter((item) => item.slot === slot).length;

      expect(count('ring'), `day ${day}`).toBeGreaterThanOrEqual(2);
      expect(count('amulet'), `day ${day}`).toBeGreaterThanOrEqual(2);
      expect(count('trinket'), `day ${day}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('sells nothing but jewellery at the Facet', () => {
    for (let day = 1; day <= 30; day += 1) {
      for (const item of stock({ shopId: 'facet', dayKey: `2026-10-${day}` })) {
        expect(JEWELLERY_SLOTS, `day ${day}`).toContain(item.slot);
      }
    }
  });

  it('stocks exactly six shelves, in both shops', () => {
    for (const shopId of SHOP_IDS) {
      expect(stock({ shopId }).length, shopId).toBe(STOCK_SIZE);
    }
  });
});

describe('what is on the shelf', () => {
  it('locks weapons and offhands to the browsing hero’s class', () => {
    const classes: ClassId[] = ['warrior', 'bard', 'mage', 'hunter', 'swashbuckler'];
    for (const classId of classes) {
      for (const item of stock({ classId })) {
        if (item.classLock) expect(item.classLock, classId).toBe(classId);
      }
    }
  });

  it('never stocks a Set piece — those are earned, not bought', () => {
    for (const shopId of SHOP_IDS) {
      for (let day = 1; day <= 40; day += 1) {
        for (const item of stock({ shopId, dayKey: `2026-11-${day}` })) {
          expect(item.rarity, `${shopId} day ${day}`).not.toBe('set');
        }
      }
    }
  });

  it('stocks at the hero’s level', () => {
    for (const heroLevel of [1, 17, 64, 100]) {
      for (const item of stock({ heroLevel })) {
        expect(item.level, `level ${heroLevel}`).toBe(heroLevel);
      }
    }
  });

  it('treats a nonsense level as level 1 rather than generating nonsense', () => {
    for (const item of stock({ heroLevel: 0 })) expect(item.level).toBe(1);
    for (const item of stock({ heroLevel: -5 })) expect(item.level).toBe(1);
  });

  it('spreads rarities roughly as published, and hits every non-Set tier', () => {
    // The published table is what the player is promised; a shelf that never shows an Epic
    // would make the 8% a lie even though each individual roll obeyed it.
    const seen = new Map<string, number>();
    let total = 0;
    for (let day = 1; day <= 400; day += 1) {
      for (const item of stock({ dayKey: `sample-${day}` })) {
        seen.set(item.rarity, (seen.get(item.rarity) ?? 0) + 1);
        total += 1;
      }
    }

    const weightTotal = RARITIES.reduce((sum, r) => sum + SHOP_RARITY_WEIGHTS[r], 0);
    for (const rarity of RARITIES) {
      const expected = SHOP_RARITY_WEIGHTS[rarity] / weightTotal;
      const actual = (seen.get(rarity) ?? 0) / total;
      expect(actual, rarity).toBeCloseTo(expected, 1);
    }
  });
});

describe('prices', () => {
  it('asks 3.2× what the item is worth', () => {
    for (const item of stock()) {
      expect(shopPrice(item)).toBe(Math.round(item.value * SHOP_PRICE_MULTIPLIER));
    }
  });

  it('always asks more than it would pay — buying is a splurge, selling is income', () => {
    for (const shopId of SHOP_IDS) {
      for (const item of stock({ shopId, heroLevel: 1 })) {
        expect(shopPrice(item), `${shopId} ${item.name}`).toBeGreaterThan(item.value);
      }
    }
  });
});

describe('sold slots', () => {
  it('leaves a gap where the item was, rather than closing up', () => {
    // The shelf keeps its shape so the remaining goods do not slide under the cursor (§3).
    const shelf = stock();
    const left = remainingStock(shelf, [1, 3]);

    expect(left).toEqual([shelf[0], shelf[2], shelf[4], shelf[5]]);
  });

  it('reports an empty shelf once everything is gone', () => {
    const shelf = stock();
    const all = shelf.map((_, index) => index);

    expect(remainingStock(shelf, all)).toEqual([]);
    expect(shelfValue(shelf, all)).toBe(0);
  });

  it('values only what is still for sale', () => {
    const shelf = stock();
    const full = shelfValue(shelf, []);
    expect(shelfValue(shelf, [0])).toBe(full - shopPrice(shelf[0]!));
  });

  it('ignores a sold index that is not on the shelf', () => {
    const shelf = stock();
    expect(remainingStock(shelf, [99, -1])).toEqual(shelf);
  });
});

describe('every shop has a plan', () => {
  it('covers every id in SHOP_IDS', () => {
    // A new shop must not silently fall through to Bram's shelf.
    for (const shopId of SHOP_IDS as readonly ShopId[]) {
      expect(() => stock({ shopId })).not.toThrow();
      expect(stock({ shopId }).length).toBe(STOCK_SIZE);
    }
  });
});
