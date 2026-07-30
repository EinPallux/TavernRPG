'use client';

/**
 * Patrol, as store transitions.
 *
 * Same shape as `missionActions`: save in, save out, no store and no clock of their own. The
 * exclusivity rule lives in the engine (`startShift` refuses while a mission runs) so it holds
 * for every caller rather than only for the button that happens to check.
 */

import {
  patrolEarnings,
  startShift,
  type PatrolRefusal,
  type PatrolShift,
} from '@/engine/patrol/patrol';
import { applyXp, xpNeeded } from '@/engine/progression/xp';
import type { SaveFile } from '@/engine/save/schema';
import { creditBounty, guildBonus } from './guildActions';

/** Everything that can stop a shift starting, phrased for the player. */
export type PatrolRefusalReason = PatrolRefusal | { readonly kind: 'no-hero' };

export type PatrolTransition =
  | { readonly ok: true; readonly save: SaveFile }
  | { readonly ok: false; readonly refusal: PatrolRefusalReason };

/** Clock the hero on. */
export function beginPatrol(save: SaveFile, hours: number, now: number): PatrolTransition {
  const { hero, activity } = save;
  if (!hero) return { ok: false, refusal: { kind: 'no-hero' } };

  const result = startShift({
    hours,
    heroLevel: hero.level,
    now,
    // A mission *waiting to be watched* still counts as being out: the hero is at the door,
    // not on the beat, and letting patrol start would strand the unwatched fight.
    missionRunning: Boolean(activity.mission ?? activity.pendingMission),
    alreadyOnDuty: activity.patrol !== null,
  });

  if (!result.ok) return { ok: false, refusal: result.refusal };

  return { ok: true, save: { ...save, activity: { ...activity, patrol: result.shift } } };
}

export interface PatrolCollection {
  readonly save: SaveFile;
  readonly shift: PatrolShift;
  readonly gold: number;
  readonly xp: number;
  readonly minutes: number;
  /** True when collected before the shift was up — the payout is pro-rated. */
  readonly early: boolean;
  readonly leveledTo: number | null;
}

/**
 * Clock off and take the pay.
 *
 * The same call serves "collect a finished shift" and "cancel early" — the only difference is
 * how much time had been served, which the engine already computes from the clock. One path
 * means a cancelled shift can never be paid by different rules than a completed one.
 */
export function collectPatrol(save: SaveFile, now: number): PatrolCollection | null {
  const { hero, activity } = save;
  if (!hero || !activity.patrol) return null;

  const shift = activity.patrol;
  const earned = patrolEarnings(shift, now, xpNeeded(shift.heroLevel), guildBonus(save));
  const levelled = applyXp(hero.level, hero.xp, earned.xp);

  // Hours on the Watch count toward the week's bounty when that is the target.
  const credited = creditBounty(save, 'patrolHours', Math.floor(earned.minutes / 60));

  return {
    save: {
      ...credited,
      hero: {
        ...hero,
        level: levelled.level,
        xp: levelled.xp,
        gold: hero.gold + earned.gold,
      },
      activity: {
        ...activity,
        patrol: null,
        // Only a shift served to the end counts as one completed; walking off at ten minutes
        // should not tick Hildy's ledger.
        patrolsCompleted: activity.patrolsCompleted + (now >= shift.endsAt ? 1 : 0),
      },
    },
    shift,
    gold: earned.gold,
    xp: earned.xp,
    minutes: earned.minutes,
    early: now < shift.endsAt,
    leveledTo: levelled.level > hero.level ? levelled.level : null,
  };
}
