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
 * XP earned per point of Vigor at a given level.
 *
 * Expressed as a share of the level's own XP requirement, which is what makes the curve
 * self-correcting: early levels fall in a few missions, later ones take days, and no absolute
 * number ever needs re-tuning when `xpNeeded` changes.
 */
export function xpPerVigor(level: number, xpNeededForLevel: number): number {
  void level;
  return xpNeededForLevel / 320;
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
 * What a mission of this length pays a hero of this level, before drops and guild bonuses.
 * `vigorCost` and the duration are the same number by design (§6) — the parameter is separate
 * only so a future effect can discount one without silently discounting the other.
 */
export function missionPayout(
  level: number,
  duration: MissionDuration,
  xpNeededForLevel: number,
): MissionPayout {
  return {
    gold: Math.round(goldPerVigor(level) * duration),
    xp: Math.round(xpPerVigor(level, xpNeededForLevel) * duration),
  };
}

/** A loss still pays half the gold, no XP and no item (tavern spec §3). */
export function consolationPayout(full: MissionPayout): MissionPayout {
  return { gold: Math.round(full.gold * 0.5), xp: 0 };
}
