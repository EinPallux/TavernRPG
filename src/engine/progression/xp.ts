/**
 * Experience and levels.
 *
 * The curves live in docs/design/balancing-formulas.md §1 — this module is their only
 * implementation. Tuning happens by editing the constants here *and* the doc in the same PR.
 *
 * Pure module: no React, no DOM, no clock.
 */

/** `[TUNE]` — xpNeeded(L) = round(60·L^2.1 + 240·L). No level cap. */
const XP_COEFFICIENT = 60;
const XP_EXPONENT = 2.1;
const XP_LINEAR = 240;

/** XP required to go from `level` to `level + 1`. */
export function xpNeeded(level: number): number {
  const clamped = Math.max(1, Math.floor(level));
  return Math.round(XP_COEFFICIENT * clamped ** XP_EXPONENT + XP_LINEAR * clamped);
}

/**
 * XP earned per point of Vigor spent at this level (balancing §1). Missions, arena and
 * dungeons all scale off this one primitive, which is what keeps their relative worth stable
 * as the curve steepens.
 */
export function xpPerVigor(level: number): number {
  return xpNeeded(level) / 320;
}

export interface LevelUpResult {
  readonly level: number;
  readonly xp: number;
  /** How many levels were gained — a single mission can carry more than one early on. */
  readonly levelsGained: number;
}

/**
 * Apply an XP award, rolling over as many levels as it covers.
 * Returns the new level and the leftover XP toward the next one.
 */
export function applyXp(level: number, xp: number, gained: number): LevelUpResult {
  let currentLevel = Math.max(1, Math.floor(level));
  let currentXp = Math.max(0, xp) + Math.max(0, gained);
  let levelsGained = 0;

  // Guarded loop: a pathological award can't spin forever.
  while (levelsGained < 1000) {
    const needed = xpNeeded(currentLevel);
    if (currentXp < needed) break;
    currentXp -= needed;
    currentLevel += 1;
    levelsGained += 1;
  }

  return { level: currentLevel, xp: Math.round(currentXp), levelsGained };
}

/** Total XP from level 1 to `level` — used by the world simulation to place bots on the curve. */
export function totalXpToLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.max(1, Math.floor(level)); l += 1) {
    total += xpNeeded(l);
  }
  return total;
}

/** Progress toward the next level, 0–1. */
export function levelProgress(level: number, xp: number): number {
  const needed = xpNeeded(level);
  return needed <= 0 ? 0 : Math.min(1, Math.max(0, xp / needed));
}
