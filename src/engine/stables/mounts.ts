/**
 * Mount rentals (docs/design/systems/shops-and-stables.md §4).
 *
 * A rental is one id and one expiry timestamp. Like a patrol shift, whether it is still running
 * is *computed from the clock* rather than tracked by a ticker — so a mount bought on Monday is
 * correctly expired when the tab reopens on the following Tuesday, with nothing having run in
 * between.
 *
 * Two rules shape the rest:
 *
 * 1. **Renewing the same mount extends; switching replaces.** Paying for a mount you already
 *    have should never cost you days you already paid for, which is what a flat "reset to seven
 *    days" would do to anyone who renews before the last hour. Switching *does* forfeit the
 *    remainder — that is the trade the spec asks for — and the confirm says how many days.
 * 2. **Runway is capped at two terms.** Prices are pinned to `goldPerVigor(level)` at purchase,
 *    so without a cap a level-10 player could buy a season of Warhorse for pocket change and
 *    ride it into their forties. Two terms keeps renewal safe while bounding the arbitrage to
 *    one term's worth.
 *
 * Pure module.
 */

import { goldPerVigor } from '@/engine/progression/rewards';
import { MOUNTS_BY_ID, type MountDef, type MountId } from '@/data/mounts';

const MS_PER_DAY = 86_400_000;

/** Every rental is a week (§4, Q5: shorter terms, faster recurring sink). */
export const MOUNT_TERM_DAYS = 7;
export const MOUNT_TERM_MS = MOUNT_TERM_DAYS * MS_PER_DAY;

/** Most time a stall will hold for you at once — two terms (see the header). */
export const MAX_RUNWAY_MS = 2 * MOUNT_TERM_MS;

/** Odo starts reminding you with a day to go (§4). */
export const RENEWAL_REMINDER_MS = MS_PER_DAY;

/** A rental in progress. Two fields, because that is all a rental is. */
export interface MountRental {
  readonly mountId: MountId;
  readonly expiresAt: number;
  /** When it was first taken out — for "rented since" and nothing load-bearing. */
  readonly rentedAt: number;
}

export interface MountPrice {
  readonly gold: number;
  readonly dice: number;
}

/** What Odo is asking today, at this hero's level (§4, balancing §2). */
export function mountPrice(def: MountDef, heroLevel: number): MountPrice {
  const level = Math.max(1, Math.floor(heroLevel));
  return {
    gold: def.goldFactor === 0 ? 0 : Math.round(def.goldFactor * goldPerVigor(level)),
    dice: def.diceCost,
  };
}

/** Is this rental still good? */
export function isMountActive(rental: MountRental | null, now: number): boolean {
  return rental !== null && now < rental.expiresAt;
}

/** The mount actually in the stall right now — null once the term has run out. */
export function activeMount(rental: MountRental | null, now: number): MountDef | null {
  return isMountActive(rental, now) ? MOUNTS_BY_ID[rental!.mountId] : null;
}

export function msRemainingOnMount(rental: MountRental | null, now: number): number {
  if (!rental) return 0;
  return Math.max(0, rental.expiresAt - now);
}

/** Whole days left, rounded up — "1 day left" should show until it is genuinely gone. */
export function daysRemainingOnMount(rental: MountRental | null, now: number): number {
  return Math.ceil(msRemainingOnMount(rental, now) / MS_PER_DAY);
}

/** True in the last 24 hours, which is when Odo starts nudging (§4). */
export function needsRenewalSoon(rental: MountRental | null, now: number): boolean {
  if (!isMountActive(rental, now)) return false;
  return msRemainingOnMount(rental, now) <= RENEWAL_REMINDER_MS;
}

/**
 * How long a mission takes with this mount up.
 *
 * The **only** thing a mount touches. Vigor cost, rewards and patrol all read the unmodified
 * duration, which is why this takes milliseconds and returns milliseconds rather than being
 * folded into `missionPayout` where it would be one refactor away from paying differently.
 */
export function mountedDurationMs(baseMs: number, mount: MountDef | null): number {
  if (!mount) return baseMs;
  return Math.round(baseMs * (1 - mount.speedBonus));
}

/** The same, phrased for a preview: "20 min → 14 min". */
export function mountedMinutes(baseMinutes: number, mount: MountDef | null): number {
  if (!mount) return baseMinutes;
  return Math.round(baseMinutes * (1 - mount.speedBonus) * 100) / 100;
}

export type RentRefusal =
  | { readonly kind: 'insufficient-gold'; readonly needed: number; readonly available: number }
  | { readonly kind: 'insufficient-dice'; readonly needed: number; readonly available: number }
  /** Already two terms deep on this mount; come back when some of it has been used. */
  | { readonly kind: 'runway-full'; readonly maxDays: number };

/**
 * What renting would do, before doing it.
 *
 * `replaces`/`daysForfeited` are what the confirm dialog is built from — the spec asks the
 * player to be shown what they are throwing away (§4), and the only way that number is right is
 * if the same code computes it and applies it.
 */
export interface RentQuote {
  readonly def: MountDef;
  readonly price: MountPrice;
  /** The mount being displaced, if it is a different one. */
  readonly replaces: MountDef | null;
  /** Days lost by switching. Zero when renewing or when the stall is empty. */
  readonly daysForfeited: number;
  /** True when this extends a rental already running. */
  readonly renews: boolean;
  /** Expiry after the purchase. */
  readonly expiresAt: number;
}

export type RentQuoteResult =
  | { readonly ok: true; readonly quote: RentQuote }
  | { readonly ok: false; readonly refusal: RentRefusal };

export interface RentOptions {
  readonly mountId: MountId;
  readonly current: MountRental | null;
  readonly heroLevel: number;
  readonly gold: number;
  readonly dice: number;
  readonly now: number;
}

export function quoteRental({
  mountId,
  current,
  heroLevel,
  gold,
  dice,
  now,
}: RentOptions): RentQuoteResult {
  const def = MOUNTS_BY_ID[mountId];
  const price = mountPrice(def, heroLevel);

  if (gold < price.gold) {
    return {
      ok: false,
      refusal: { kind: 'insufficient-gold', needed: price.gold, available: gold },
    };
  }
  if (dice < price.dice) {
    return {
      ok: false,
      refusal: { kind: 'insufficient-dice', needed: price.dice, available: dice },
    };
  }

  const running = isMountActive(current, now) ? current : null;
  const renews = running?.mountId === mountId;

  if (renews) {
    // Extend from the existing expiry so early renewal never costs a paid day.
    const extended = running!.expiresAt + MOUNT_TERM_MS;
    if (extended - now > MAX_RUNWAY_MS) {
      return { ok: false, refusal: { kind: 'runway-full', maxDays: MOUNT_TERM_DAYS * 2 } };
    }
    return {
      ok: true,
      quote: { def, price, replaces: null, daysForfeited: 0, renews: true, expiresAt: extended },
    };
  }

  const replaced = running ? MOUNTS_BY_ID[running.mountId] : null;
  return {
    ok: true,
    quote: {
      def,
      price,
      replaces: replaced,
      // Round up: losing eight hours of Warhorse should not be reported as losing nothing.
      daysForfeited: running ? Math.ceil(msRemainingOnMount(running, now) / MS_PER_DAY) : 0,
      renews: false,
      expiresAt: now + MOUNT_TERM_MS,
    },
  };
}

export interface RentResult {
  readonly rental: MountRental;
  readonly quote: RentQuote;
}

export type RentOutcome =
  ({ readonly ok: true } & RentResult) | { readonly ok: false; readonly refusal: RentRefusal };

/** Take the stall. Charging the purse is the caller's job; this owns the rental itself. */
export function rentMount(options: RentOptions): RentOutcome {
  const quoted = quoteRental(options);
  if (!quoted.ok) return quoted;

  const { quote } = quoted;
  return {
    ok: true,
    quote,
    rental: {
      mountId: quote.def.id,
      expiresAt: quote.expiresAt,
      // Renewing keeps the original start date; switching starts a new tenancy.
      rentedAt: quote.renews ? (options.current?.rentedAt ?? options.now) : options.now,
    },
  };
}

/** Clear a rental whose term has run out. Returns null when there is nothing to keep. */
export function expireMount(rental: MountRental | null, now: number): MountRental | null {
  return isMountActive(rental, now) ? rental : null;
}
