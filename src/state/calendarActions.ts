/**
 * Marla's ledger, as save-to-save transitions (daily-loop spec §2).
 *
 * One function does the work — `stampToday` — and everything interesting about it is what it
 * refuses to do. It does not check a streak, because there is no streak. It does not punish an
 * absence, because a paused calendar is the design. And it will not stamp twice on the same day,
 * which is the only rule it actually enforces.
 */

import type { DayKey } from '@/engine/clock';
import { addMaterials } from '@/engine/forge/forgeConfig';
import { createRng, deriveSeed } from '@/engine/rng';
import { generateItem } from '@/engine/items/generate';
import { goldPerVigor } from '@/engine/progression/rewards';
import {
  canStamp,
  pendingDay,
  squares,
  stamp,
  type CalendarSquare,
} from '@/engine/calendar/calendar';
import type { CalendarRewardDef } from '@/data/calendar';
import type { Item } from '@/engine/items/types';
import type { SaveFile } from '@/engine/save/schema';

export interface StampTransition {
  readonly ok: true;
  readonly save: SaveFile;
  readonly day: number;
  readonly reward: CalendarRewardDef;
  /** Gold actually paid, at this hero's level. */
  readonly gold: number;
  /** The day-28 item, when the square carries one. */
  readonly item: Item | null;
  readonly cycleClosed: boolean;
}

export type StampResultState =
  StampTransition | { readonly ok: false; readonly refusal: 'no-hero' | 'already-stamped' };

/** Today's square, whether or not it can be stamped — for the ledger page. */
export function ledger(save: SaveFile, today: DayKey): readonly CalendarSquare[] {
  return squares(save.calendar, today);
}

export function stampAvailable(save: SaveFile, today: DayKey): boolean {
  return Boolean(save.hero) && canStamp(save.calendar, today);
}

/** The square today's mark would land on — the ledger highlights it before the click. */
export function todaySquare(save: SaveFile, today: DayKey): number {
  return pendingDay(save.calendar, today);
}

/**
 * Stamp today and pay the square.
 *
 * Auto-called on first load of the day (spec §2), so it has to be safe to call on every load —
 * `canStamp` is the whole guard, and it compares a stored day key rather than counting anything.
 */
export function stampToday(save: SaveFile, today: DayKey): StampResultState {
  const { hero } = save;
  if (!hero) return { ok: false, refusal: 'no-hero' };

  const result = stamp(save.calendar, today);
  if (!result) return { ok: false, refusal: 'already-stamped' };

  const { reward } = result;
  const gold = Math.round(reward.goldVigor * goldPerVigor(hero.level));

  // Seeded on the *square*, not the day: the item a player gets on day 28 is fixed by which
  // square it is, so a reload cannot re-roll it and neither can crossing a midnight mid-claim.
  const item = reward.item
    ? generateItem({
        level: hero.level,
        slot: createRng(
          deriveSeed(save.worldSeed, 'calendar', result.state.cyclesCompleted),
          'slot',
        ).pick(['weapon', 'chest', 'helmet', 'gloves', 'boots', 'belt']),
        rarity: reward.item,
        classId: hero.classId,
        rng: createRng(
          deriveSeed(save.worldSeed, 'calendar-item', result.state.cyclesCompleted),
          'item',
        ),
      })
    : null;

  return {
    ok: true,
    save: {
      ...save,
      calendar: result.state,
      hero: {
        ...hero,
        gold: hero.gold + gold,
        dice: hero.dice + (reward.dice ?? 0),
        materials: addMaterials(hero.materials, {
          scrap: reward.scrap ?? 0,
          essence: reward.essence ?? 0,
          starmetal: reward.starmetal ?? 0,
        }),
      },
      activity: { ...save.activity, alesHeld: save.activity.alesHeld + (reward.ale ?? 0) },
      pets: { ...save.pets, scraps: save.pets.scraps + (reward.petScraps ?? 0) },
    },
    day: result.state.day,
    reward,
    gold,
    item,
    cycleClosed: result.cycleClosed,
  };
}
