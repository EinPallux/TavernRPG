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

/**
 * `[TUNE]` The day's work: Vigor spent today that pays a Golden Die (balancing §18).
 *
 * Rungs, not a rate, and stated as a rising list rather than a stride so the spacing is a
 * decision anybody can read. Three of them, because three Ale is the day's ceiling and the point
 * of the track is that **a player who actually spends the Vigor gets the Ale back**:
 *
 * | spent | source           | dice |
 * |-------|------------------|------|
 * | 50    | half a base day  | 1    |
 * | 100   | the whole of it  | 2    |
 * | 150   | needs all 3 Ale  | 3    |
 *
 * The third rung is deliberately out of reach on 100 Vigor. Buying Ale to reach it costs exactly
 * what the rung pays, so the trade is *time for time* and never dice for dice — the loop closes
 * without ever running away, which is the property a premium currency that cannot be bought has
 * to have. And because Ale is capped at three, the whole track is bounded by construction: there
 * is no amount of play that turns into a fourth die.
 *
 * Missions and the Long Road are the only things that spend Vigor, so this is also the one number
 * that makes the road *pay* on a day it does not clear a chapter.
 */
export const DAY_WORK_RUNGS = [50, 100, 150] as const;

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
 * **Re-fitted in the Phase 17 pacing pass** (28 / 1.2 → 42 / 1.5). Two things forced it. The
 * economy sim had never counted patrol XP, so every milestone it reported — including the
 * "L10 day 4" that used to sit in this comment as a measured fact — was pessimistic by about a
 * third of a day's progression. And the sim rounded a milestone up to the end of the day it
 * landed on, which at a three-day target is a third of the whole budget.
 *
 * With both fixed, `engine/pacing/` measures the reference player at **L10 3.5 days, L25 11.4,
 * L55 34.5** against §0's 3 / 14 / 30 — inside the ±20% the ROADMAP asks for, on all three.
 *
 * A *linear* divisor cannot do better than that here, and the reason is worth knowing before
 * anybody tries: hitting 3 / 14 / 30 exactly requires the average cost per level to **fall**
 * between the 10–24 band and the 25–54 band (96.8 Vigor to 70.4), which is a curve that speeds
 * up as you climb. The table's middle row is the outlier; see USER_QUESTIONS Q22.
 */
/*
 * `[TUNE]` The two numbers that set the pace of the entire game.
 *
 * They carried no marker until the Phase 17 inventory went looking — which is worth recording,
 * because the pass exists to review every tunable and the most-tuned constant in the build was
 * invisible to it. A number nobody has flagged is not a number nobody has changed.
 */
export const XP_DIVISOR_BASE = 42;
export const XP_DIVISOR_PER_LEVEL = 1.5;

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
 * `[TUNE]` The greenhorn's due — Emberhollow overpays a new hero (balancing §19).
 *
 * `vigorPerLevel` already curves: 2.3 levels per hundred Vigor at level 1, 0.98 at forty. That is
 * a *decay*, but it is far too flat to feel like one. Two contracts bought a level at level one
 * and a bit over two bought a level at level fifteen, so the first fortnight had no shape at all
 * — the same forty minutes of waiting per level, over and over, at exactly the point a new player
 * is deciding whether this game rewards them.
 *
 * So the town pays over the odds while you are nobody, and stops by the time you are somebody:
 * ×1.6 at level 1, sliding to ×1 at level 25.
 *
 * **Concentrated rather than spread**, and the pacing sweep is why. Two shapes give the same
 * level-10 day: ×1.6 fading by 25, or ×1.4 fading by 40. The short one moves level 55 by 8%
 * against the long one's 10% while giving a *stronger* early kick — because the help is spent
 * where the player is deciding whether to stay rather than dribbled across a fortnight they had
 * already committed to. The contrast is the point: fast, then normal, and the change legible.
 *
 * **It multiplies gold and XP by the same factor, and that is the whole safety argument.** Gold
 * per *level* is `goldPerVigor(L) × vigorPerLevel(L)`; scale both sides by B and the player
 * reaches each level having earned exactly the gold they would have earned before, so their
 * trained attributes at level 20 are what they always were. The power curve is untouched and only
 * the clock moves. Boosting XP alone would have levelled players into monsters they could not
 * afford to fight — a faster ride into a wall, which is the opposite of the ask.
 */
export const GREENHORN_PEAK = 1.6;
export const GREENHORN_UNTIL = 25;

/**
 * The multiplier a hero of this level earns on everything they spend Vigor on.
 *
 * Linear rather than curved on purpose: a player cannot see an exponent, but they can see a
 * number that shrinks a little every level, and the Tankard prints it. Never below 1 — this is a
 * gift that runs out, not a penalty that starts.
 */
export function greenhornBonus(level: number): number {
  const safe = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  if (safe >= GREENHORN_UNTIL) return 1;
  const remaining = (GREENHORN_UNTIL - safe) / (GREENHORN_UNTIL - 1);
  return 1 + (GREENHORN_PEAK - 1) * remaining;
}

/** As a `PayoutBonus`, for the fold. Gold and XP move together — see the note above. */
export function greenhornPayoutBonus(level: number): PayoutBonus {
  const factor = greenhornBonus(level);
  return { gold: factor, xp: factor };
}

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
