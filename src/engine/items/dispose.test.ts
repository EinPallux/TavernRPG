/**
 * `disposeItem` tests.
 *
 * The load-bearing property: **nothing leaves the bags by accident**. Everything here is a way
 * a player could lose gear they wanted — a locked piece, an heirloom, a Rare sold on a stray
 * click — and every one of them has to be refused or gated by the same rule in every shop.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { createHero } from '@/engine/hero/actions';
import { generateItem } from '@/engine/items/generate';
import type { Hero } from '@/engine/save/schema';
import type { Item, Rarity } from './types';
import { disposeItem, heldItem, quoteDisposal, sellValueOf } from './dispose';

const NOW = new Date('2026-07-30T10:00:00').getTime();

function hero(): Hero {
  return createHero({ name: 'Kargath', classId: 'warrior', now: NOW, startingGold: 500 });
}

let counter = 0;
function item(rarity: Rarity, over: Partial<Item> = {}): Item {
  counter += 1;
  const generated = generateItem({
    level: 20,
    slot: 'chest',
    rarity,
    classId: 'warrior',
    rng: createRng(1000 + counter, `test:${counter}`),
  });
  return { ...generated, ...over };
}

/** Put an item in the first free backpack cell. */
function holding(base: Hero, ...items: Item[]): Hero {
  const backpack = [...base.backpack];
  for (const entry of items) {
    const free = backpack.findIndex((cell) => cell === null);
    backpack[free] = entry;
  }
  return { ...base, backpack };
}

describe('selling', () => {
  it('pays exactly the item’s value — 100%, not a haggle', () => {
    const sword = item('uncommon');
    const before = holding(hero(), sword);

    const result = disposeItem(before, sword.uid, 'sell');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.quote.gold).toBe(sword.value);
    expect(result.hero.gold).toBe(before.gold + sword.value);
  });

  it('takes the item out of the bags', () => {
    const boots = item('common');
    const before = holding(hero(), boots);

    const result = disposeItem(before, boots.uid, 'sell');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(heldItem(result.hero, boots.uid)).toBeNull();
  });

  it('does not ask before letting junk go', () => {
    for (const rarity of ['common', 'uncommon'] as const) {
      const junk = item(rarity);
      const quote = quoteDisposal(holding(hero(), junk), junk.uid, 'sell');

      expect(quote.ok, rarity).toBe(true);
      if (quote.ok) expect(quote.quote.confirm, rarity).toBe('none');
    }
  });

  it('asks once before a Rare or an Epic', () => {
    for (const rarity of ['rare', 'epic'] as const) {
      const good = item(rarity);
      const quote = quoteDisposal(holding(hero(), good), good.uid, 'sell');

      expect(quote.ok, rarity).toBe(true);
      if (quote.ok) expect(quote.quote.confirm, rarity).toBe('confirm');
    }
  });

  it('refuses an heirloom outright — Set pieces are earned, not merchandise', () => {
    const heirloom = item('set');
    const quote = quoteDisposal(holding(hero(), heirloom), heirloom.uid, 'sell');

    expect(quote.ok).toBe(false);
    if (!quote.ok) expect(quote.refusal.kind).toBe('set-piece');
  });

  it('leaves the purse alone when it refuses', () => {
    const heirloom = item('set');
    const before = holding(hero(), heirloom);

    const result = disposeItem(before, heirloom.uid, 'sell');
    expect(result.ok).toBe(false);
    expect(heldItem(before, heirloom.uid)).not.toBeNull();
  });
});

describe('what is protected', () => {
  it('refuses a locked item, whatever the intent', () => {
    const treasured = item('rare', { locked: true });
    const before = holding(hero(), treasured);

    for (const intent of ['sell', 'scrap'] as const) {
      const quote = quoteDisposal(before, treasured.uid, intent);
      expect(quote.ok, intent).toBe(false);
      if (!quote.ok) expect(quote.refusal.kind, intent).toBe('locked');
    }
  });

  it('refuses something the hero is wearing — take it off first', () => {
    // A starter kit is equipped at creation, so this is a real item in a real slot.
    const worn = createHero({
      name: 'Kargath',
      classId: 'warrior',
      now: NOW,
      startingGold: 0,
      rng: createRng(7, 'starter'),
    });
    const chest = worn.equipment.chest;
    expect(chest).toBeDefined();

    const quote = quoteDisposal(worn, chest!.uid, 'sell');
    expect(quote.ok).toBe(false);
    if (!quote.ok) expect(quote.refusal.kind).toBe('not-held');
  });

  it('refuses an item that is not there at all', () => {
    const quote = quoteDisposal(hero(), 'itm-nope', 'sell');
    expect(quote.ok).toBe(false);
    if (!quote.ok) expect(quote.refusal.kind).toBe('not-held');
  });
});

describe('scrapping', () => {
  it('returns the yield rolled at generation, not a fresh roll', () => {
    // Yields are stored on the item so a piece pays the same whenever it is broken up.
    const relic = item('epic');
    const before = holding(hero(), relic);

    const first = quoteDisposal(before, relic.uid, 'scrap');
    const second = quoteDisposal(before, relic.uid, 'scrap');

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.quote.materials).toEqual(relic.scrapYield);
    expect(second.quote.materials).toEqual(relic.scrapYield);
  });

  it('pays no gold', () => {
    const junk = item('common');
    const result = disposeItem(holding(hero(), junk), junk.uid, 'scrap');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.gold).toBe(0);
    expect(result.hero.gold).toBe(hero().gold);
  });

  it('asks twice before an heirloom — the one thing selling refuses outright', () => {
    const heirloom = item('set');
    const quote = quoteDisposal(holding(hero(), heirloom), heirloom.uid, 'scrap');

    expect(quote.ok).toBe(true);
    if (quote.ok) expect(quote.quote.confirm).toBe('double');
  });

  it('respects a daily cap when the caller sets one', () => {
    // The Emberforge owns this number (crafting spec §2); the service only enforces it.
    const junk = item('common');
    const before = holding(hero(), junk);

    const under = quoteDisposal(before, junk.uid, 'scrap', { scrapsToday: 9, scrapLimit: 10 });
    expect(under.ok).toBe(true);

    const over = quoteDisposal(before, junk.uid, 'scrap', { scrapsToday: 10, scrapLimit: 10 });
    expect(over.ok).toBe(false);
    if (!over.ok && over.refusal.kind === 'scrap-limit') {
      expect(over.refusal.used).toBe(10);
      expect(over.refusal.limit).toBe(10);
    } else {
      expect.unreachable('expected a scrap-limit refusal');
    }
  });

  it('has no cap unless one is passed', () => {
    const junk = item('common');
    const quote = quoteDisposal(holding(hero(), junk), junk.uid, 'scrap', { scrapsToday: 9_999 });
    expect(quote.ok).toBe(true);
  });
});

describe('quoting never changes anything', () => {
  it('leaves the hero untouched', () => {
    const relic = item('epic');
    const before = holding(hero(), relic);
    const snapshot = structuredClone(before);

    quoteDisposal(before, relic.uid, 'sell');
    quoteDisposal(before, relic.uid, 'scrap');

    expect(before).toEqual(snapshot);
  });

  it('quotes what disposal then actually pays', () => {
    // The number on the confirm button has to be the number that lands in the purse.
    for (const rarity of ['common', 'uncommon', 'rare', 'epic'] as const) {
      const piece = item(rarity);
      const before = holding(hero(), piece);

      const quote = quoteDisposal(before, piece.uid, 'sell');
      const done = disposeItem(before, piece.uid, 'sell');

      expect(quote.ok && done.ok, rarity).toBe(true);
      if (!quote.ok || !done.ok) continue;
      expect(done.hero.gold - before.gold, rarity).toBe(quote.quote.gold);
    }
  });
});

describe('sellValueOf', () => {
  it('totals what a batch would fetch', () => {
    const a = item('common');
    const b = item('rare');
    expect(sellValueOf([a, b])).toBe(a.value + b.value);
  });

  it('skips what cannot be sold, so the preview is not a lie', () => {
    const junk = item('common');
    const locked = item('rare', { locked: true });
    const heirloom = item('set');

    expect(sellValueOf([junk, locked, heirloom])).toBe(junk.value);
  });
});
