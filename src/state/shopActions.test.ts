/**
 * Shop and stable transition tests.
 *
 * These are the money paths, so they get the paranoid treatment: **the ledger must balance**
 * (every coin out of the purse is an item in the bag and vice versa), **nothing is ever paid for
 * twice**, and **midnight restocks without eating anything the player was holding**.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { createHero } from '@/engine/hero/actions';
import { createNewSave, type SaveFile } from '@/engine/save/schema';
import { shopPrice, REROLL_DICE_COST } from '@/engine/shops/stock';
import { MOUNT_TERM_MS, mountPrice } from '@/engine/stables/mounts';
import { mount as mountDef } from '@/data/mounts';
import { processResets } from '@/engine/reset/resetEngine';
import { buyItem, quoteSale, refreshShop, rerollShop, sellItem, shopStock } from './shopActions';
import { quoteMount, takeMount } from './stableActions';
import { accept } from './missionActions';
import { drawBoard } from '@/engine/missions/board';

const NOW = new Date('2026-07-30T10:00:00').getTime();
const TODAY = '2026-07-30';
const TOMORROW = '2026-07-31';
const DAY = 86_400_000;

function save(over: { gold?: number; dice?: number; level?: number } = {}): SaveFile {
  const base = createNewSave({ slot: 1, worldSeed: 4242, now: NOW });
  const hero = createHero({
    name: 'Kargath',
    classId: 'warrior',
    now: NOW,
    startingGold: over.gold ?? 500_000,
    rng: createRng(9, 'starter'),
  });
  return {
    ...base,
    hero: { ...hero, level: over.level ?? 20, dice: over.dice ?? 10 },
  };
}

/** A save with today's Armory shelf already drawn. */
function shopping(over: Parameters<typeof save>[0] = {}) {
  return refreshShop(save(over), 'armory', TODAY);
}

describe('opening the shop', () => {
  it('draws a shelf on the first visit of the day', () => {
    const opened = shopping();
    const stock = shopStock(opened, 'armory');

    expect(stock).not.toBeNull();
    expect(stock?.day).toBe(TODAY);
    expect(stock?.items).toHaveLength(6);
    expect(stock?.sold).toEqual([]);
  });

  it('does not redraw on a second visit the same day', () => {
    // Otherwise browsing away and back would be a free reroll.
    const first = shopping();
    const second = refreshShop(first, 'armory', TODAY);

    expect(second).toBe(first);
  });

  it('keeps the sold slots when revisiting', () => {
    const opened = shopping();
    const stock = shopStock(opened, 'armory')!;
    const bought = buyItem(opened, 'armory', 0, shopPrice(stock.items[0]!));
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    const revisited = refreshShop(bought.save, 'armory', TODAY);
    expect(shopStock(revisited, 'armory')?.sold).toEqual([0]);
  });

  it('draws a new shelf after midnight, and nothing is still marked sold', () => {
    const opened = shopping();
    const stock = shopStock(opened, 'armory')!;
    const bought = buyItem(opened, 'armory', 2, shopPrice(stock.items[2]!));
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    // Midnight goes through the Reset Engine, which clears the shelves.
    const reset = processResets(
      { ...bought.save.activity, lastProcessedDay: TODAY },
      TOMORROW,
      () => [TOMORROW],
    );
    const nextDay = refreshShop({ ...bought.save, activity: reset.state }, 'armory', TOMORROW);
    const fresh = shopStock(nextDay, 'armory')!;

    expect(fresh.day).toBe(TOMORROW);
    expect(fresh.sold).toEqual([]);
    expect(fresh.items).not.toEqual(stock.items);
  });

  it('does nothing without a hero', () => {
    const empty = createNewSave({ slot: 1, worldSeed: 1, now: NOW });
    expect(refreshShop(empty, 'armory', TODAY)).toBe(empty);
  });

  it('keeps the two shops’ shelves apart', () => {
    const both = refreshShop(shopping(), 'facet', TODAY);

    expect(shopStock(both, 'armory')?.items).not.toEqual(shopStock(both, 'facet')?.items);
    expect(shopStock(both, 'armory')).not.toBeNull();
  });
});

describe('buying', () => {
  it('charges the asking price and puts the item in the bag', () => {
    const before = shopping();
    const stock = shopStock(before, 'armory')!;
    const target = stock.items[0]!;
    const price = shopPrice(target);

    const result = buyItem(before, 'armory', 0, price);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.paid).toBe(price);
    expect(result.save.hero!.gold).toBe(before.hero!.gold - price);
    const held = result.save.hero!.backpack.find((entry) => entry?.uid === target.uid);
    expect(held).toBeDefined();
  });

  it('marks the slot sold, leaving the shelf’s shape alone', () => {
    const before = shopping();
    const stock = shopStock(before, 'armory')!;

    const result = buyItem(before, 'armory', 3, shopPrice(stock.items[3]!));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = shopStock(result.save, 'armory')!;
    expect(after.sold).toEqual([3]);
    expect(after.items).toEqual(stock.items);
  });

  it('will not sell the same item twice', () => {
    // A double-clicked buy button must not charge twice for one sword.
    const before = shopping();
    const price = shopPrice(shopStock(before, 'armory')!.items[1]!);

    const first = buyItem(before, 'armory', 1, price);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = buyItem(first.save, 'armory', 1, price);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.refusal.kind).toBe('sold-out');
  });

  it('refuses when the purse is short, and says by how much', () => {
    const before = shopping({ gold: 10 });
    const price = shopPrice(shopStock(before, 'armory')!.items[0]!);

    const result = buyItem(before, 'armory', 0, price);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (result.refusal.kind !== 'insufficient-gold') expect.unreachable('wrong refusal');
    else {
      expect(result.refusal.needed).toBe(price);
      expect(result.refusal.available).toBe(10);
    }
  });

  it('refuses rather than overflowing a full bag', () => {
    // `addItem` discards the oldest satchel item to make room for a *drop*. That is right for
    // loot nobody asked for and wrong for something just paid for in gold.
    const before = shopping();
    const filler = shopStock(before, 'armory')!.items[0]!;
    const stuffed: SaveFile = {
      ...before,
      hero: {
        ...before.hero!,
        backpack: before.hero!.backpack.map((_, i) => ({ ...filler, uid: `pack-${i}` })),
        satchel: Array.from({ length: 5 }, (_, i) => ({ ...filler, uid: `sat-${i}` })),
      },
    };

    const result = buyItem(stuffed, 'armory', 1, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.kind).toBe('no-room');
  });

  it('does not charge for a purchase it refuses', () => {
    const before = shopping({ gold: 10 });
    const result = buyItem(before, 'armory', 0, 999_999);
    expect(result.ok).toBe(false);
    // The refusal returns no save at all, so the purse is untouched by construction.
    expect(before.hero!.gold).toBe(10);
  });

  it('refuses a slot that is not on the shelf', () => {
    const result = buyItem(shopping(), 'armory', 99, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.kind).toBe('sold-out');
  });

  it('refuses when the shop has not been opened today', () => {
    const result = buyItem(save(), 'armory', 0, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.kind).toBe('no-stock');
  });
});

describe('selling', () => {
  it('pays the item’s value and takes it out of the bags', () => {
    const before = shopping();
    const stock = shopStock(before, 'armory')!;
    const bought = buyItem(before, 'armory', 0, shopPrice(stock.items[0]!));
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    const sold = sellItem(bought.save, bought.item.uid);
    expect(sold.ok).toBe(true);
    if (!sold.ok) return;

    expect(sold.quote.gold).toBe(bought.item.value);
    expect(sold.save.hero!.gold).toBe(bought.save.hero!.gold + bought.item.value);
  });

  it('loses money on a buy-then-sell round trip — buying is a splurge', () => {
    // If this ever inverts, the shop is a gold faucet and the economy is over.
    const before = shopping();
    const stock = shopStock(before, 'armory')!;
    const price = shopPrice(stock.items[0]!);

    const bought = buyItem(before, 'armory', 0, price);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    const sold = sellItem(bought.save, bought.item.uid);
    expect(sold.ok).toBe(true);
    if (!sold.ok) return;

    expect(sold.save.hero!.gold).toBeLessThan(before.hero!.gold);
  });

  it('quotes what the sale then actually pays', () => {
    const before = shopping();
    const bought = buyItem(before, 'armory', 0, shopPrice(shopStock(before, 'armory')!.items[0]!));
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    const quote = quoteSale(bought.save, bought.item.uid);
    const sold = sellItem(bought.save, bought.item.uid);

    expect(quote?.ok).toBe(true);
    expect(sold.ok).toBe(true);
    if (!quote?.ok || !sold.ok) return;
    expect(sold.quote.gold).toBe(quote.quote.gold);
    expect(sold.quote.confirm).toBe(quote.quote.confirm);
  });

  it('passes the engine’s refusal through rather than inventing its own', () => {
    const result = sellItem(shopping(), 'itm-not-here');
    expect(result.ok).toBe(false);
    if (!result.ok && result.refusal.kind === 'cannot-dispose') {
      expect(result.refusal.reason.kind).toBe('not-held');
    } else {
      expect.unreachable('expected a cannot-dispose refusal');
    }
  });
});

describe('rerolling the shelf', () => {
  it('costs a Golden Die and produces a different shelf', () => {
    const before = shopping();
    const stock = shopStock(before, 'armory')!;

    const result = rerollShop(before, 'armory', TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.hero!.dice).toBe(before.hero!.dice - REROLL_DICE_COST);
    expect(shopStock(result.save, 'armory')?.items).not.toEqual(stock.items);
    expect(shopStock(result.save, 'armory')?.rerollsToday).toBe(1);
  });

  it('charges for every reroll — there is no free one', () => {
    // Unlike the mission board: the board is the day's *work* and must always be there.
    let current = shopping({ dice: 3 });
    for (let i = 1; i <= 3; i += 1) {
      const result = rerollShop(current, 'armory', TODAY);
      expect(result.ok, `reroll ${i}`).toBe(true);
      if (!result.ok) return;
      current = result.save;
      expect(current.hero!.dice).toBe(3 - i);
    }

    const broke = rerollShop(current, 'armory', TODAY);
    expect(broke.ok).toBe(false);
    if (!broke.ok) expect(broke.refusal.kind).toBe('insufficient-dice');
  });

  it('gives each reroll a genuinely new shelf, not a reshuffle', () => {
    const shelves: string[] = [];
    let current = shopping({ dice: 5 });
    shelves.push(JSON.stringify(shopStock(current, 'armory')?.items));

    for (let i = 0; i < 4; i += 1) {
      const result = rerollShop(current, 'armory', TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      current = result.save;
      shelves.push(JSON.stringify(shopStock(current, 'armory')?.items));
    }

    expect(new Set(shelves).size).toBe(shelves.length);
  });

  it('clears the sold marks — a new shelf has nothing sold off it', () => {
    const before = shopping();
    const bought = buyItem(before, 'armory', 0, shopPrice(shopStock(before, 'armory')!.items[0]!));
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    const rerolled = rerollShop(bought.save, 'armory', TODAY);
    expect(rerolled.ok).toBe(true);
    if (!rerolled.ok) return;
    expect(shopStock(rerolled.save, 'armory')?.sold).toEqual([]);
  });

  it('works on a shop that has not been opened yet', () => {
    const result = rerollShop(save(), 'armory', TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shopStock(result.save, 'armory')?.items).toHaveLength(6);
  });
});

describe('the stables', () => {
  it('charges gold and puts the mount in the stall for a week', () => {
    const before = save();
    const price = mountPrice(mountDef('courser'), before.hero!.level).gold;

    const result = takeMount(before, 'courser', NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.hero!.gold).toBe(before.hero!.gold - price);
    expect(result.save.activity.mount?.mountId).toBe('courser');
    expect(result.save.activity.mount?.expiresAt).toBe(NOW + MOUNT_TERM_MS);
  });

  it('charges the Griffin in dice, not gold', () => {
    const before = save();
    const result = takeMount(before, 'griffin', NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.hero!.dice).toBe(before.hero!.dice - 6);
    expect(result.save.hero!.gold).toBe(before.hero!.gold);
  });

  it('refuses without the price, and takes nothing', () => {
    const before = save({ gold: 5, dice: 0 });
    const result = takeMount(before, 'warhorse', NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.kind).toBe('insufficient-gold');
    expect(before.hero!.gold).toBe(5);
  });

  it('quotes the days a switch throws away before it throws them', () => {
    const mounted = takeMount(save(), 'mule', NOW);
    expect(mounted.ok).toBe(true);
    if (!mounted.ok) return;

    const twoDaysIn = NOW + 2 * DAY;
    const quote = quoteMount(mounted.save, 'warhorse', twoDaysIn);

    expect(quote?.ok).toBe(true);
    if (!quote?.ok) return;
    expect(quote.quote.replaces?.id).toBe('mule');
    expect(quote.quote.daysForfeited).toBe(5);
  });

  it('replaces the mount on a switch rather than keeping both', () => {
    const mounted = takeMount(save(), 'mule', NOW);
    expect(mounted.ok).toBe(true);
    if (!mounted.ok) return;

    const switched = takeMount(mounted.save, 'warhorse', NOW + DAY);
    expect(switched.ok).toBe(true);
    if (!switched.ok) return;

    expect(switched.save.activity.mount?.mountId).toBe('warhorse');
    expect(switched.save.activity.mount?.expiresAt).toBe(NOW + DAY + MOUNT_TERM_MS);
  });
});

describe('the mount shortens the mission timer and nothing else', () => {
  /**
   * A board to sign from, on a save past its first contract.
   *
   * The opt-out matters: the *very first* contract of a save comes home in twenty seconds
   * (tutorial spec §2), which would swamp the multiplier these cases are measuring. A player
   * renting a warhorse is not on their first job.
   */
  function withBoard(base: SaveFile): SaveFile {
    const board = drawBoard({
      worldSeed: base.worldSeed,
      dayKey: TODAY,
      heroLevel: base.hero!.level,
    });
    return {
      ...base,
      tutorial: { ...base.tutorial, optedOut: true },
      activity: { ...base.activity, board: [...board], boardDay: TODAY },
    };
  }

  it('cuts the wait by exactly the mount’s tier', () => {
    const base = withBoard(save());
    const offerId = base.activity.board[0]!.id;

    const onFoot = accept(base, offerId, 20, NOW);
    expect(onFoot.ok).toBe(true);
    if (!onFoot.ok) return;

    const mounted = takeMount(base, 'warhorse', NOW);
    expect(mounted.ok).toBe(true);
    if (!mounted.ok) return;
    const riding = accept(mounted.save, offerId, 20, NOW);
    expect(riding.ok).toBe(true);
    if (!riding.ok) return;

    const walkMs = onFoot.save.activity.mission!.endsAt - NOW;
    const rideMs = riding.save.activity.mission!.endsAt - NOW;
    expect(rideMs).toBe(Math.round(walkMs * 0.7));
  });

  it('still charges the full Vigor — a mount buys time, not price', () => {
    const base = withBoard(save());
    const mounted = takeMount(base, 'griffin', NOW);
    expect(mounted.ok).toBe(true);
    if (!mounted.ok) return;

    const riding = accept(mounted.save, mounted.save.activity.board[0]!.id, 20, NOW);
    expect(riding.ok).toBe(true);
    if (!riding.ok) return;

    expect(riding.save.activity.vigor).toBe(base.activity.vigor - 20);
    expect(riding.save.activity.mission!.duration).toBe(20);
    expect(riding.save.activity.mission!.vigorSpent).toBe(20);
  });

  it('stops helping the moment the rental lapses', () => {
    const base = withBoard(save());
    const mounted = takeMount(base, 'warhorse', NOW);
    expect(mounted.ok).toBe(true);
    if (!mounted.ok) return;

    // Eight days later the stall is empty, even though the record is still in the save.
    const after = NOW + 8 * DAY;
    const riding = accept(mounted.save, mounted.save.activity.board[0]!.id, 20, after);
    expect(riding.ok).toBe(true);
    if (!riding.ok) return;

    expect(riding.save.activity.mission!.endsAt - after).toBe(20 * 60_000);
  });
});
