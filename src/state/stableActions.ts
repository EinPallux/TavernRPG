'use client';

/**
 * The Stables, as store transitions.
 *
 * Save in, save out. The rental rules — extend vs replace, the runway cap, what a switch throws
 * away — all live in `engine/stables/mounts.ts`; this only moves gold and dice.
 */

import { quoteRental, rentMount, type RentQuote, type RentRefusal } from '@/engine/stables/mounts';
import type { MountId } from '@/data/mounts';
import type { SaveFile } from '@/engine/save/schema';

export type StableRefusal = RentRefusal | { readonly kind: 'no-hero' };

export interface RentalResult {
  readonly save: SaveFile;
  readonly quote: RentQuote;
}

export type StableTransition =
  ({ readonly ok: true } & RentalResult) | { readonly ok: false; readonly refusal: StableRefusal };

/** What renting would cost and displace — read-only, for the stall card and its confirm. */
export function quoteMount(save: SaveFile, mountId: MountId, now: number) {
  const { hero, activity } = save;
  if (!hero) return null;

  return quoteRental({
    mountId,
    current: activity.mount,
    heroLevel: hero.level,
    gold: hero.gold,
    dice: hero.dice,
    now,
  });
}

/**
 * Take the stall.
 *
 * The previous rental is not refunded and not kept — switching forfeits the remainder, which the
 * quote reported before the player confirmed (shops spec §4).
 */
export function takeMount(save: SaveFile, mountId: MountId, now: number): StableTransition {
  const { hero, activity } = save;
  if (!hero) return { ok: false, refusal: { kind: 'no-hero' } };

  const result = rentMount({
    mountId,
    current: activity.mount,
    heroLevel: hero.level,
    gold: hero.gold,
    dice: hero.dice,
    now,
  });

  if (!result.ok) return { ok: false, refusal: result.refusal };

  const { price } = result.quote;
  return {
    ok: true,
    save: {
      ...save,
      hero: { ...hero, gold: hero.gold - price.gold, dice: hero.dice - price.dice },
      activity: { ...activity, mount: result.rental },
    },
    quote: result.quote,
  };
}
