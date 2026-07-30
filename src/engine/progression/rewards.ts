/**
 * Reward curves (docs/design/balancing-formulas.md §1–2, §6).
 *
 * Everything a mission, patrol shift or arena bout pays out comes from here, so "how much gold
 * is a minute of play worth?" has exactly one answer and tuning it is a one-line change.
 *
 * The design rule underneath: **rewards scale linearly with Vigor spent**. A 20-minute mission
 * pays four times a 5-minute one because it costs four times the Vigor — the long mission is
 * bought with the scarce resource, not with patience, and the player is never punished for
 * playing in short bursts. Its only edge is better item odds (§7), which is a *flavour* of
 * reward rather than more of it.
 *
 * Pure module.
 */

/** Mission durations in minutes; Vigor cost equals the duration (§6). */
export const MISSION_DURATIONS = [5, 10, 15, 20] as const;
export type MissionDuration = (typeof MISSION_DURATIONS)[number];

/** Vigor a day holds, before Ale. */
export const VIGOR_PER_DAY = 100;
/** Ale grants this much, up to `ALE_PER_DAY` times. */
export const ALE_VIGOR = 20;
export const ALE_PER_DAY = 3;
export const ALE_DICE_COST = 1;

export function isMissionDuration(value: number): value is MissionDuration {
  return (MISSION_DURATIONS as readonly number[]).includes(value);
}

/**
 * How many points of Vigor buy one level, at that level.
 *
 * **Retuned in Phase 6.** The published formula was a flat `xpNeeded(L) / 320`, which put
 * 100 Vigor at 0.31 levels a day *forever* — level 10, where every remaining feature unlocks,
 * arrived on **day 29** against a design target of day 2–3. (Balancing §1's own prose said
 * "~3.2 levels/day early game", which is `/32`: the shipped constant had an extra zero.)
 *
 * A flat divisor cannot be right in either direction, because it makes levels-per-day constant
 * — the hundredth level costs the same number of missions as the second. Growing the divisor
 * with level is what produces a curve: fast onboarding, a long tail.
 *
 * Measured against balancing §0 (missions only, 100 Vigor/day): L10 day 4, L25 day 11,
 * L55 day 34. The §0 table also wants L100 around day 180, which no simple divisor reaches
 * from these three — see the note in balancing §1.
 */
export const XP_DIVISOR_BASE = 28;
export const XP_DIVISOR_PER_LEVEL = 1.2;

export function vigorPerLevel(level: number): number {
  return XP_DIVISOR_BASE + XP_DIVISOR_PER_LEVEL * Math.max(1, level);
}

/**
 * XP earned per point of Vigor at a given level.
 *
 * Expressed as a share of the level's own XP requirement, which is what keeps the curve
 * self-correcting: no absolute number needs re-tuning when `xpNeeded` changes.
 */
export function xpPerVigor(level: number, xpNeededForLevel: number): number {
  return xpNeededForLevel / vigorPerLevel(level);
}

/** Gold earned per point of Vigor at a given level (§2). */
export function goldPerVigor(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return Math.round(3.5 * safe ** 1.35 + 8);
}

/** Gold per hour on patrol — deliberately ~55% of the mission rate (§2). Phase 6 spends this. */
export function goldPatrolPerHour(level: number): number {
  return Math.round(14 * goldPerVigor(level) * 0.55);
}

/** XP per hour on patrol — deliberately weak, so missions always dominate (§1). */
export function xpPatrolPerHour(level: number, xpNeededForLevel: number): number {
  return Math.round(4 * xpPerVigor(level, xpNeededForLevel));
}

export interface MissionPayout {
  readonly gold: number;
  readonly xp: number;
}

/**
 * A multiplicative bonus on a payout. Guild tracks are the first source (guilds spec §2); pets
 * and set bonuses will be the next, and they compose by multiplying rather than by summing.
 */
export interface PayoutBonus {
  readonly gold: number;
  readonly xp: number;
}

export const NO_BONUS: PayoutBonus = { gold: 1, xp: 1 };

/**
 * What a mission of this length pays a hero of this level, before drops.
 * `vigorCost` and the duration are the same number by design (§6) — the parameter is separate
 * only so a future effect can discount one without silently discounting the other.
 *
 * The bonus is applied **here rather than at the till** so that every quote the player is shown
 * — the mission card's preview, the result screen, the economy simulation — is the same number
 * they are actually paid. A buff applied only on collection is a buff nobody believes in.
 */
export function missionPayout(
  level: number,
  duration: MissionDuration,
  xpNeededForLevel: number,
  bonus: PayoutBonus = NO_BONUS,
): MissionPayout {
  return {
    gold: Math.round(goldPerVigor(level) * duration * bonus.gold),
    xp: Math.round(xpPerVigor(level, xpNeededForLevel) * duration * bonus.xp),
  };
}

/** A loss still pays half the gold, no XP and no item (tavern spec §3). */
export function consolationPayout(full: MissionPayout): MissionPayout {
  return { gold: Math.round(full.gold * 0.5), xp: 0 };
}
