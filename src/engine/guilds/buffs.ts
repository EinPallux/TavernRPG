/**
 * The two buff tracks (guilds spec §2, balancing §11).
 *
 * Treasury pays gold, Drillmaster pays experience, both at +0.25% a step to a cap of +25%. This
 * is the economic heart of guilds and the reason joining one is a decision rather than a
 * formality: **an established bot guild hands you a quarter more of everything on your first
 * day, and a hall you found yourself starts at nothing.** Identity or income — a real trade.
 *
 * The cost curve is superlinear (`500·s^1.7`) so the last steps cost roughly forty times the
 * first. That is what keeps a large guild from simply buying the cap in week one, and what makes
 * a small guild's slow climb up the track feel like progress rather than arithmetic.
 *
 * Pure module.
 */

/** `[TUNE]` balancing §11 — gold for step `s`, paid from the pooled donations. */
export const STEP_COST_BASE = 500;
export const STEP_COST_EXPONENT = 1.7;

/** Each step is worth this much, on its own track. */
export const BONUS_PER_STEP = 0.0025;
/** One hundred steps, so the cap is +25%. */
export const MAX_STEPS = 100;

/** A Golden Die thrown in the pot is worth this in gold (spec §2, optional flex). */
export const DICE_GOLD_EQUIVALENT = 400;

export const TRACKS = ['treasury', 'drillmaster'] as const;
export type TrackId = (typeof TRACKS)[number];

export const TRACK_LABEL: Readonly<Record<TrackId, string>> = {
  treasury: 'Treasury',
  drillmaster: 'Drillmaster',
};

/** What each track pays, for the panel copy. */
export const TRACK_PAYS: Readonly<Record<TrackId, 'gold' | 'xp'>> = {
  treasury: 'gold',
  drillmaster: 'xp',
};

/** Gold to buy step `s` (1-indexed). Step 0 is "not bought yet". */
export function stepCost(step: number): number {
  const s = Math.max(1, Math.floor(step));
  if (s > MAX_STEPS) return Infinity;
  return Math.round(STEP_COST_BASE * Math.pow(s, STEP_COST_EXPONENT));
}

/** Everything it would cost to go from nothing to `step`. */
export function totalCostThrough(step: number): number {
  let total = 0;
  for (let s = 1; s <= Math.min(MAX_STEPS, Math.floor(step)); s += 1) total += stepCost(s);
  return total;
}

/**
 * How far a pool of gold reaches from a given step, and what is left over.
 *
 * Returns the *whole* steps it buys. A track never sits half-bought: the pool carries the
 * remainder forward, which is what lets a guild of five save toward a step they cannot afford in
 * one week rather than watching their donations evaporate.
 */
export function stepsAffordable(
  fromStep: number,
  pool: number,
): { readonly steps: number; readonly spent: number; readonly remainder: number } {
  let steps = 0;
  let spent = 0;
  let left = Math.max(0, pool);

  for (let s = Math.floor(fromStep) + 1; s <= MAX_STEPS; s += 1) {
    const cost = stepCost(s);
    if (cost > left) break;
    left -= cost;
    spent += cost;
    steps += 1;
  }

  return { steps, spent, remainder: left };
}

/** The multiplier a track at this step is worth. 1.0 at step 0, 1.25 at the cap. */
export function bonusFor(step: number): number {
  return 1 + BONUS_PER_STEP * Math.max(0, Math.min(MAX_STEPS, Math.floor(step)));
}

export interface GuildMultipliers {
  /** Multiply mission and patrol gold by this. */
  readonly gold: number;
  /** Multiply mission and patrol XP by this. */
  readonly xp: number;
}

export const NO_GUILD_BONUS: GuildMultipliers = { gold: 1, xp: 1 };

/**
 * What a member gets right now.
 *
 * Takes membership as a flag rather than inferring it, because "am I in a guild?" is a save-level
 * question and this module is not allowed to know what a save looks like. Leaving a guild drops
 * the multipliers the same instant — the buff is a benefit of standing in the hall, not something
 * that vests.
 */
export function guildMultipliers(options: {
  readonly isMember: boolean;
  readonly treasuryStep: number;
  readonly drillmasterStep: number;
}): GuildMultipliers {
  if (!options.isMember) return NO_GUILD_BONUS;
  return {
    gold: bonusFor(options.treasuryStep),
    xp: bonusFor(options.drillmasterStep),
  };
}

/** The gold value of a donation of coin and dice together. */
export function donationValue(gold: number, dice: number): number {
  return Math.max(0, Math.floor(gold)) + Math.max(0, Math.floor(dice)) * DICE_GOLD_EQUIVALENT;
}

/**
 * Apply a pooled donation to one track.
 *
 * Pure: hands back the new step and the pool that is still saving toward the next one, and never
 * spends more than it was given.
 */
export function applyDonation(options: {
  readonly step: number;
  readonly pool: number;
  readonly amount: number;
}): { readonly step: number; readonly pool: number; readonly stepsGained: number } {
  const pool = Math.max(0, options.pool) + Math.max(0, options.amount);
  const { steps, remainder } = stepsAffordable(options.step, pool);
  return {
    step: Math.min(MAX_STEPS, options.step + steps),
    pool: remainder,
    stepsGained: steps,
  };
}
