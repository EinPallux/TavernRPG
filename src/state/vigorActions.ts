/**
 * The one place Vigor leaves the save, and the one place the day's work pays for it.
 *
 * Two things spend Vigor — signing a contract and walking a stage of the Long Road — and before
 * this they each did `vigor: activity.vigor - n` inline. That was fine while spending Vigor had no
 * consequence beyond the number going down. It stopped being fine the moment the spend *earned*
 * something: two subtractions in two files means two places for a payout to go missing, which is
 * the mistake this codebase has recorded from three directions already (the guild bounty's second
 * copy of a target, the forge tile's second copy of a rate, the rail and the map each holding
 * their own badge).
 *
 * So there is one function. It takes the Vigor off, adds it to the day's total, and hands over
 * whatever dice that crossed a rung for. A caller that forgets to use it does not silently pay
 * nothing — `vigorSpentToday` stops moving, and `dayWork.test.ts` walks a whole day through the
 * real actions and would notice.
 *
 * The dice are returned rather than applied, because the two callers assemble their `Hero` update
 * differently — the road is already adding gold, XP and a chapter's die in the same breath — and
 * a helper that reached in to bump `hero.dice` itself would be racing the caller's own spread.
 */

import { dicePaidFor } from '@/engine/progression/dayWork';
import type { SaveFile } from '@/engine/save/schema';

export interface VigorSpend {
  /** The save with the Vigor taken off and the day's total moved on. */
  readonly save: SaveFile;
  /** Dice the spend earned by crossing a rung of the day's work. Usually zero. */
  readonly dice: number;
}

/**
 * Spend Vigor, and pay the day's work for it.
 *
 * `vigor` is clamped at zero the way both call sites already did — a rounding error should cost
 * the player nothing rather than putting the meter into deficit — but the *spent* total counts
 * what was asked for, not what was available. That is deliberate: the track measures the day's
 * work, and a contract signed with the last of the day's Vigor is the same day's work whether the
 * arithmetic came out at 0.0 or −0.4.
 */
export function spendVigor(save: SaveFile, amount: number): VigorSpend {
  const spent = Math.max(0, amount);
  if (spent === 0) return { save, dice: 0 };

  const before = save.activity.vigorSpentToday;
  const after = before + spent;

  return {
    save: {
      ...save,
      activity: {
        ...save.activity,
        vigor: Math.max(0, save.activity.vigor - spent),
        vigorSpentToday: after,
      },
    },
    dice: dicePaidFor(before, after),
  };
}
