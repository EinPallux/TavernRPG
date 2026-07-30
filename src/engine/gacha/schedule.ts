/**
 * What is on the table today (gacha spec §2).
 *
 * Three banners run at once and each rotates on its own cadence — daily, Monday, and the first
 * of the month. The schedule is a **pure function of `(dayKey, worldSeed, classId)`**, stored
 * nowhere: a save that has not been opened for a fortnight already knows what was featured on
 * every day it missed, and two players on the same seed see the same table on the same date.
 *
 * That is the same stance the world generator takes toward its 1,500 heroes, and it is here for
 * the same reason. A stored schedule would need a migration every time the banner list changed,
 * would drift the moment a rotation was missed, and would have to be *advanced* by something —
 * which is another feature deciding it is tomorrow, which is what the Reset Engine exists to
 * stop.
 *
 * **Periods, not day keys, are what the seed derives from.** A weekly banner seeded by the day
 * would re-roll every morning; seeded by the Monday of its week it is stable for seven days and
 * changes on exactly the boundary the countdown promises.
 *
 * Pure module.
 */

import { parseDayKey, weekKeyFor, weekStartFor, type DayKey } from '@/engine/clock';
import { createRng, deriveSeed, type Seed } from '@/engine/rng';
import { setsForClass, type GearSetDef, type SetSlot, SET_SLOTS } from '@/data/gearSets';
import { banner, type BannerDef, type BannerId } from '@/data/banners';
import { SLOT_PLURALS, type ClassId, type SlotId } from '@/engine/items/types';

/** The daily highlight is a slot, and any of the ten can come up. */
export const DAILY_SLOTS: readonly SlotId[] = [
  'weapon',
  'offhand',
  'helmet',
  'chest',
  'gloves',
  'boots',
  'belt',
  'amulet',
  'ring',
  'trinket',
];

/** `[TUNE]` How much the Daily Draw's highlighted slot beats the other nine (spec §2). */
export const DAILY_SLOT_RATE_UP = 3;

/**
 * What a banner is featuring right now.
 *
 * `setId` is null on the Daily Draw and `slot` is null on the other two — the two banners
 * feature different *kinds* of thing, and collapsing them into one nullable field would make
 * every reader check which one they were holding.
 */
export interface ActiveBanner {
  readonly definition: BannerDef;
  /** The period this featuring belongs to: a day key, a week key, or `YYYY-MM`. */
  readonly period: string;
  /** Weekly and monthly: the set on the table. */
  readonly set: GearSetDef | null;
  /** Daily: the slot with the rate-up. */
  readonly slot: SlotId | null;
  /** One line naming what is featured, for the card and the Crier. */
  readonly featuring: string;
  /** Local midnight the featuring changes, for the countdown. */
  readonly endsAt: number;
  /** What replaces it — a silhouette and a name, teased on the card (spec §2). */
  readonly next: { readonly period: string; readonly featuring: string };
}

/* ── Periods ─────────────────────────────────────────────────────────────────────── */

/** `YYYY-MM` — the month a day belongs to. */
export function monthKeyFor(dayKey: DayKey): string {
  return dayKey.slice(0, 7);
}

/** The Monday a day's week began on. The weekly banner's period. */
export function weekPeriodFor(dayKey: DayKey): string {
  return weekStartFor(weekKeyFor(dayKey));
}

export function periodFor(rotation: BannerDef['rotation'], dayKey: DayKey): string {
  switch (rotation) {
    case 'daily':
      return dayKey;
    case 'weekly':
      return weekPeriodFor(dayKey);
    case 'monthly':
      return monthKeyFor(dayKey);
  }
}

/** The day key of the next period's first day. */
function nextPeriodStart(rotation: BannerDef['rotation'], dayKey: DayKey): DayKey {
  const [year, month, day] = dayKey.split('-').map(Number);
  const at = new Date(year!, month! - 1, day!, 12, 0, 0, 0);

  if (rotation === 'daily') {
    at.setDate(at.getDate() + 1);
  } else if (rotation === 'weekly') {
    // Forward to the Monday after this one. `getDay()` is 1 on Monday.
    at.setDate(at.getDate() + ((8 - at.getDay()) % 7 || 7));
  } else {
    at.setMonth(at.getMonth() + 1, 1);
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/* ── Featuring ───────────────────────────────────────────────────────────────────── */

/**
 * Which of the class's two sets is on the weekly table this week.
 *
 * Alternating strictly would make the schedule trivially predictable a month out, and rolling
 * freely would sometimes show the same set three weeks running. The seed decides, but a
 * *different* stream per banner: the weekly and the monthly must be able to feature the same
 * set in the same week without one implying the other.
 */
function featuredSet(
  seed: Seed,
  id: BannerId,
  period: string,
  classId: ClassId,
): GearSetDef | null {
  const sets = setsForClass(classId);
  if (sets.length === 0) return null;
  const rng = createRng(deriveSeed(seed, 'banner', id, period), `banner/${id}/${period}`);
  return rng.pick(sets) ?? null;
}

function featuredSlot(seed: Seed, period: string): SlotId {
  const rng = createRng(deriveSeed(seed, 'banner', 'daily', period), `banner/daily/${period}`);
  return rng.pick(DAILY_SLOTS) ?? 'weapon';
}

function describe(id: BannerId, set: GearSetDef | null, slot: SlotId | null): string {
  if (id === 'daily') return SLOT_PLURALS[slot ?? 'weapon'];
  return set?.name ?? 'A pattern nobody here can wear';
}

/** One banner, resolved for a date. */
export function activeBanner(
  id: BannerId,
  dayKey: DayKey,
  worldSeed: Seed,
  classId: ClassId,
): ActiveBanner {
  const definition = banner(id);
  const period = periodFor(definition.rotation, dayKey);
  const set = id === 'daily' ? null : featuredSet(worldSeed, id, period, classId);
  const slot = id === 'daily' ? featuredSlot(worldSeed, period) : null;

  const upcoming = nextPeriodStart(definition.rotation, dayKey);
  const nextPeriod = periodFor(definition.rotation, upcoming);
  const nextSet = id === 'daily' ? null : featuredSet(worldSeed, id, nextPeriod, classId);
  const nextSlot = id === 'daily' ? featuredSlot(worldSeed, nextPeriod) : null;

  return {
    definition,
    period,
    set,
    slot,
    featuring: describe(id, set, slot),
    // Parsed at local midnight on purpose: that *is* the boundary, and the countdown has to name
    // the same instant the Reset Engine will act on.
    endsAt: parseDayKey(upcoming) ?? 0,
    next: { period: nextPeriod, featuring: describe(id, nextSet, nextSlot) },
  };
}

/** All three, in card order. */
export function activeBanners(
  dayKey: DayKey,
  worldSeed: Seed,
  classId: ClassId,
): readonly ActiveBanner[] {
  return (['daily', 'weekly', 'monthly'] as const).map((id) =>
    activeBanner(id, dayKey, worldSeed, classId),
  );
}

/**
 * Slot weights for a Daily Draw's featured result.
 *
 * The highlighted slot is three times as likely as any other — which is the *only* thing the
 * daily's featuring changes. It does not raise the chance of a featured result at all, and the
 * odds panel says so; a rate-up that quietly moves two numbers is a rate-up nobody can verify.
 */
export function dailySlotWeights(highlighted: SlotId): readonly { slot: SlotId; weight: number }[] {
  return DAILY_SLOTS.map((slot) => ({
    slot,
    weight: slot === highlighted ? DAILY_SLOT_RATE_UP : 1,
  }));
}

/** The five slots a set covers, re-exported so callers do not reach past this module. */
export const FEATURED_SET_SLOTS: readonly SetSlot[] = SET_SLOTS;
