/**
 * Mount tests.
 *
 * Three properties. **A mount buys time and nothing else** — the moment it touches rewards or
 * Vigor it stops being a convenience and starts being power for sale. **Expiry is the clock's
 * job**, so a week away expires the rental correctly with nothing having run. And **renewing
 * must never cost a day already paid for**, which is the one place a "simpler" implementation
 * quietly robs the player.
 */

import { describe, expect, it } from 'vitest';
import { goldPerVigor, VIGOR_PER_DAY } from '@/engine/progression/rewards';
import { MOUNTS, MOUNTS_BY_ID, mount as mountDef, type MountId } from '@/data/mounts';
import {
  MAX_RUNWAY_MS,
  MOUNT_TERM_DAYS,
  MOUNT_TERM_MS,
  RENEWAL_REMINDER_MS,
  activeMount,
  daysRemainingOnMount,
  expireMount,
  isMountActive,
  mountPrice,
  mountedDurationMs,
  mountedMinutes,
  msRemainingOnMount,
  needsRenewalSoon,
  quoteRental,
  rentMount,
  type MountRental,
} from './mounts';

const NOW = new Date('2026-07-30T09:00:00').getTime();
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

function rental(mountId: MountId, startedAt = NOW): MountRental {
  return { mountId, rentedAt: startedAt, expiresAt: startedAt + MOUNT_TERM_MS };
}

const rent = (over: Partial<Parameters<typeof quoteRental>[0]> = {}) =>
  quoteRental({
    mountId: 'mule',
    current: null,
    heroLevel: 20,
    gold: 1_000_000,
    dice: 99,
    now: NOW,
    ...over,
  });

describe('the stalls', () => {
  it('offers exactly the four the spec names, in ascending speed', () => {
    expect(MOUNTS.map((m) => m.id)).toEqual(['mule', 'courser', 'warhorse', 'griffin']);
    const bonuses = MOUNTS.map((m) => m.speedBonus);
    expect(bonuses).toEqual([...bonuses].sort((a, b) => a - b));
  });

  it('prices exactly one mount in Golden Dice, and it is the fastest', () => {
    // Dice are earn-only (CLAUDE.md rule 6): the premium stall must stay reachable, and there
    // must be a gold ladder underneath it.
    const priced = MOUNTS.filter((m) => m.diceCost > 0);
    expect(priced.map((m) => m.id)).toEqual(['griffin']);
    expect(mountDef('griffin').speedBonus).toBe(Math.max(...MOUNTS.map((m) => m.speedBonus)));
  });

  it('charges gold for every mount that is not the Griffin', () => {
    for (const def of MOUNTS) {
      if (def.id === 'griffin') expect(def.goldFactor).toBe(0);
      else expect(def.goldFactor, def.id).toBeGreaterThan(0);
    }
  });

  it('has unique ids', () => {
    expect(new Set(MOUNTS.map((m) => m.id)).size).toBe(MOUNTS.length);
  });
});

describe('prices track the level, not a flat number', () => {
  it('scales gold prices with goldPerVigor', () => {
    for (const level of [1, 25, 60, 100]) {
      expect(mountPrice(mountDef('mule'), level).gold).toBe(Math.round(20 * goldPerVigor(level)));
      expect(mountPrice(mountDef('warhorse'), level).gold).toBe(
        Math.round(130 * goldPerVigor(level)),
      );
    }
  });

  it('keeps a week’s rental inside a sane share of the week’s income at every level', () => {
    // §4: rentals must stay a recurring pinch, not a wall and not a rounding error.
    for (const level of [5, 25, 55, 100]) {
      const weeklyGold = 7 * VIGOR_PER_DAY * goldPerVigor(level);
      for (const def of MOUNTS) {
        if (def.diceCost > 0) continue;
        const share = mountPrice(def, level).gold / weeklyGold;
        expect(share, `${def.id} @${level}`).toBeGreaterThan(0.002);
        expect(share, `${def.id} @${level}`).toBeLessThan(0.2);
      }
    }
  });

  it('charges the Griffin in dice and no gold, at any level', () => {
    for (const level of [1, 50, 100]) {
      expect(mountPrice(mountDef('griffin'), level)).toEqual({ gold: 0, dice: 6 });
    }
  });

  it('treats a nonsense level as level 1', () => {
    expect(mountPrice(mountDef('mule'), 0)).toEqual(mountPrice(mountDef('mule'), 1));
    expect(mountPrice(mountDef('mule'), -7)).toEqual(mountPrice(mountDef('mule'), 1));
  });
});

describe('a mount shortens the road and nothing else', () => {
  it('reduces a mission’s wait by exactly its tier', () => {
    const twentyMinutes = 20 * MINUTE;
    expect(mountedDurationMs(twentyMinutes, mountDef('mule'))).toBe(18 * MINUTE);
    expect(mountedDurationMs(twentyMinutes, mountDef('courser'))).toBe(16 * MINUTE);
    expect(mountedDurationMs(twentyMinutes, mountDef('warhorse'))).toBe(14 * MINUTE);
    expect(mountedDurationMs(twentyMinutes, mountDef('griffin'))).toBe(10 * MINUTE);
  });

  it('changes nothing without a mount', () => {
    expect(mountedDurationMs(15 * MINUTE, null)).toBe(15 * MINUTE);
    expect(mountedMinutes(15, null)).toBe(15);
  });

  it('never reaches zero, however fast the mount', () => {
    for (const def of MOUNTS) {
      expect(mountedDurationMs(5 * MINUTE, def), def.id).toBeGreaterThan(0);
    }
  });

  it('previews minutes the same way it computes milliseconds', () => {
    for (const def of MOUNTS) {
      for (const minutes of [5, 10, 15, 20]) {
        const viaMs = mountedDurationMs(minutes * MINUTE, def) / MINUTE;
        expect(mountedMinutes(minutes, def), `${def.id} ${minutes}m`).toBeCloseTo(viaMs, 5);
      }
    }
  });
});

describe('expiry is the clock’s job', () => {
  it('runs for exactly one week', () => {
    const r = rental('courser');
    expect(msRemainingOnMount(r, NOW)).toBe(MOUNT_TERM_MS);
    expect(isMountActive(r, NOW + MOUNT_TERM_MS - 1)).toBe(true);
    expect(isMountActive(r, NOW + MOUNT_TERM_MS)).toBe(false);
  });

  it('is expired when the tab reopens a fortnight later, with nothing having run', () => {
    const r = rental('warhorse');
    expect(activeMount(r, NOW + 14 * DAY)).toBeNull();
    expect(expireMount(r, NOW + 14 * DAY)).toBeNull();
  });

  it('never reports negative time left', () => {
    expect(msRemainingOnMount(rental('mule'), NOW + 90 * DAY)).toBe(0);
    expect(daysRemainingOnMount(rental('mule'), NOW + 90 * DAY)).toBe(0);
  });

  it('counts a part-day as a day left, so "1 day" shows until it is truly gone', () => {
    const r = rental('mule');
    expect(daysRemainingOnMount(r, r.expiresAt - HOUR)).toBe(1);
    expect(daysRemainingOnMount(r, r.expiresAt - 1)).toBe(1);
    expect(daysRemainingOnMount(r, r.expiresAt)).toBe(0);
  });

  it('keeps a live rental when asked to expire it', () => {
    const r = rental('mule');
    expect(expireMount(r, NOW + DAY)).toBe(r);
  });

  it('handles an empty stall everywhere', () => {
    expect(isMountActive(null, NOW)).toBe(false);
    expect(activeMount(null, NOW)).toBeNull();
    expect(msRemainingOnMount(null, NOW)).toBe(0);
    expect(needsRenewalSoon(null, NOW)).toBe(false);
    expect(expireMount(null, NOW)).toBeNull();
  });
});

describe('the renewal nudge', () => {
  it('starts with a day to go and not before', () => {
    const r = rental('griffin');
    expect(needsRenewalSoon(r, r.expiresAt - RENEWAL_REMINDER_MS - MINUTE)).toBe(false);
    expect(needsRenewalSoon(r, r.expiresAt - RENEWAL_REMINDER_MS)).toBe(true);
    expect(needsRenewalSoon(r, r.expiresAt - MINUTE)).toBe(true);
  });

  it('stops once the mount is gone — nothing left to renew', () => {
    const r = rental('griffin');
    expect(needsRenewalSoon(r, r.expiresAt)).toBe(false);
  });
});

describe('renting', () => {
  it('takes an empty stall for a full term', () => {
    const result = rentMount({
      mountId: 'courser',
      current: null,
      heroLevel: 20,
      gold: 1_000_000,
      dice: 0,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rental.mountId).toBe('courser');
    expect(result.rental.expiresAt).toBe(NOW + MOUNT_TERM_MS);
    expect(result.quote.replaces).toBeNull();
    expect(result.quote.daysForfeited).toBe(0);
  });

  it('refuses when the purse is short, and says by how much', () => {
    const price = mountPrice(mountDef('warhorse'), 20).gold;
    const result = rent({ mountId: 'warhorse', gold: price - 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (result.refusal.kind !== 'insufficient-gold') expect.unreachable('wrong refusal');
    else {
      expect(result.refusal.needed).toBe(price);
      expect(result.refusal.available).toBe(price - 1);
    }
  });

  it('refuses the Griffin without the dice', () => {
    const result = rent({ mountId: 'griffin', dice: 5 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (result.refusal.kind !== 'insufficient-dice') expect.unreachable('wrong refusal');
    else expect(result.refusal.needed).toBe(6);
  });

  it('lets a hero with no gold at all still ride the Griffin on earned dice', () => {
    // The F2P promise cuts both ways: dice are never sold, and gold is never required for them.
    expect(rent({ mountId: 'griffin', gold: 0, dice: 6 }).ok).toBe(true);
  });
});

describe('renewing extends; switching replaces', () => {
  it('adds a term to the existing expiry rather than restarting it', () => {
    // Renewing with three days left must not throw those three days away.
    const current = rental('mule');
    const threeDaysIn = NOW + 4 * DAY;

    const result = rentMount({
      mountId: 'mule',
      current,
      heroLevel: 20,
      gold: 1_000_000,
      dice: 0,
      now: threeDaysIn,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.renews).toBe(true);
    expect(result.quote.daysForfeited).toBe(0);
    expect(result.rental.expiresAt).toBe(current.expiresAt + MOUNT_TERM_MS);
  });

  it('keeps the original start date across a renewal', () => {
    const current = rental('mule');
    const result = rentMount({
      mountId: 'mule',
      current,
      heroLevel: 20,
      gold: 1_000_000,
      dice: 0,
      now: NOW + DAY,
    });

    expect(result.ok && result.rental.rentedAt).toBe(current.rentedAt);
  });

  it('will not stockpile more than two terms', () => {
    const current: MountRental = {
      mountId: 'mule',
      rentedAt: NOW,
      expiresAt: NOW + MAX_RUNWAY_MS - HOUR,
    };
    const result = rent({ mountId: 'mule', current });

    expect(result.ok).toBe(false);
    if (!result.ok && result.refusal.kind === 'runway-full') {
      expect(result.refusal.maxDays).toBe(MOUNT_TERM_DAYS * 2);
    } else {
      expect.unreachable('expected runway-full');
    }
  });

  it('reports the days a switch throws away, rounded up', () => {
    const current = rental('mule');
    // Two and a half days left.
    const later = current.expiresAt - 2 * DAY - 12 * HOUR;
    const result = rent({ mountId: 'warhorse', current, now: later });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.renews).toBe(false);
    expect(result.quote.replaces?.id).toBe('mule');
    expect(result.quote.daysForfeited).toBe(3);
  });

  it('gives a switch a fresh full term from now — no partial refunds', () => {
    const current = rental('mule');
    const later = NOW + 2 * DAY;
    const result = rentMount({
      mountId: 'griffin',
      current,
      heroLevel: 20,
      gold: 0,
      dice: 6,
      now: later,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rental.expiresAt).toBe(later + MOUNT_TERM_MS);
    expect(result.rental.rentedAt).toBe(later);
  });

  it('treats an expired rental as an empty stall, not a replacement', () => {
    const stale = rental('warhorse');
    const result = rent({ mountId: 'mule', current: stale, now: stale.expiresAt + DAY });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.replaces).toBeNull();
    expect(result.quote.daysForfeited).toBe(0);
  });

  it('lets a lapsed rental of the same mount start fresh rather than extend from the past', () => {
    const stale = rental('mule');
    const wayLater = stale.expiresAt + 30 * DAY;
    const result = rentMount({
      mountId: 'mule',
      current: stale,
      heroLevel: 20,
      gold: 1_000_000,
      dice: 0,
      now: wayLater,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rental.expiresAt).toBe(wayLater + MOUNT_TERM_MS);
  });
});

describe('quoting never lies', () => {
  it('quotes the expiry the rental then gets', () => {
    for (const id of Object.keys(MOUNTS_BY_ID) as MountId[]) {
      const options = {
        mountId: id,
        current: rental('mule'),
        heroLevel: 30,
        gold: 10_000_000,
        dice: 99,
        now: NOW + DAY,
      };
      const quote = quoteRental(options);
      const done = rentMount(options);

      expect(quote.ok && done.ok, id).toBe(true);
      if (!quote.ok || !done.ok) continue;
      expect(done.rental.expiresAt, id).toBe(quote.quote.expiresAt);
    }
  });
});
