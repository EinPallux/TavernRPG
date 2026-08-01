/**
 * Battle choreography — every timing in the battle scene, in one file (combat spec §4).
 *
 * The engine decides what happens; this decides how long each beat takes to show. Keeping the
 * two apart means the fight can be re-choreographed without touching a single rule, and that a
 * balance change can never accidentally alter pacing.
 *
 * All durations are milliseconds at ×1 speed, before the reduced-motion pass.
 */

export interface BattleChoreo {
  /** Opening: backdrop settle, fighters slide in, plates and health bars unfurl. */
  readonly entryDuration: number;
  /** Pause on the round number before the first swing of a round. */
  readonly roundBeat: number;
  /** Lunge out, connect, return. */
  readonly attackWindUp: number;
  readonly attackImpact: number;
  readonly attackRecover: number;
  /** Extra hold on a critical hit — the little slow-motion that sells it. */
  readonly critHold: number;
  /** A follow-up strike lands quicker than the swing that set it up. */
  readonly followUpScale: number;
  /** Block, dodge and miss each get their own moment, shorter than a hit. */
  readonly defenceBeat: number;
  /** Verse banner sweeping across the stage. */
  readonly verseBeat: number;
  /** How long a floating damage number lives. */
  readonly damageNumberLife: number;
  /** Health bar chip is instant; the ghost trail behind it drains over this. */
  readonly healthGhostDrain: number;
  /**
   * A boss announcing its signature, before the first blow (dungeons spec §2).
   *
   * The longest beat in the file after the entrance, and deliberately so: it is the only chance
   * the fight gets to *teach*, and a player who reads "the Margrave feeds on your misses" here
   * loses to it once instead of three times. Fixed — never compressed with the exchange.
   */
  readonly bossTraitBeat: number;
  /** The swarm arriving. A telegraph, then the hit lands on the normal damage beat. */
  readonly swarmBeat: number;
  /** A boss healing off a failed attack, or its armour thickening for the round. */
  readonly bossTickBeat: number;
  /** Knockout: slow-motion, desaturation, the fall. */
  readonly knockoutBeat: number;
  /** Beat after the last blow before the result screen slides in. */
  readonly finishBeat: number;
  /** Screen shake magnitude, px, for a hit worth ≥15% of max health. */
  readonly shakeMagnitude: number;
  readonly shakeDuration: number;

  /* ── The VFX pass ─────────────────────────────────────────────────────────────
   *
   * Five windows, all measured in timeline milliseconds rather than as shares of a beat — which
   * is the important choice. A beat compresses when the fight is long (`PACE_FLOOR`), and a flash
   * that compressed with it would vanish in exactly the twenty-round fight where the player most
   * needs to see which blows landed. Playback speed still scales them, because it scales the
   * clock itself, and that is the one place they *should* move.
   */

  /**
   * Anticipation for a fighter who throws rather than swings.
   *
   * Longer than `attackWindUp` and it has to be. A sword swing is one motion; a cast is gather,
   * release, *travel*, land — and the travel has to be long enough to see. At the melee wind-up
   * the bolt existed for about a hundred milliseconds, which is six frames of a thing crossing
   * eight hundred pixels: technically drawn, and a smear in practice.
   *
   * This is the one place the choreography knows a fighter's *stance*, and it stops there: the
   * timeline takes a boolean per side, never a school. Which fighters throw is content
   * (`data/combatVfx.ts`); how long a throw takes is choreography, and this is the file for it.
   */
  readonly castWindUp: number;
  /**
   * How much of a ranged attack beat is spent gathering before the bolt leaves.
   *
   * A share rather than a duration, because this one genuinely belongs to its beat: the cast and
   * the flight are two halves of one swing and have to add up to it, or the bolt lands after the
   * damage number.
   */
  readonly castLead: number;
  /** White impact flash on the struck fighter. */
  readonly impactFlash: number;
  /** Knockback: how long the shove takes to settle. */
  readonly recoilBeat: number;
  /** Knockback distance in px for a hit worth the whole `SHAKE_THRESHOLD`. */
  readonly recoilDistance: number;
  /** How long a set bonus keeps its name on screen (gear-sets spec §3). */
  readonly procLabelLife: number;
}

export const DEFAULT_CHOREO: BattleChoreo = {
  entryDuration: 1_000,
  roundBeat: 140,
  attackWindUp: 100,
  attackImpact: 70,
  attackRecover: 110,
  critHold: 140,
  followUpScale: 0.65,
  defenceBeat: 200,
  verseBeat: 420,
  damageNumberLife: 900,
  healthGhostDrain: 300,
  bossTraitBeat: 1_600,
  swarmBeat: 260,
  bossTickBeat: 220,
  knockoutBeat: 620,
  finishBeat: 420,
  shakeMagnitude: 4,
  shakeDuration: 140,
  castWindUp: 300,
  castLead: 0.42,
  impactFlash: 150,
  recoilBeat: 260,
  recoilDistance: 16,
  procLabelLife: 700,
};

/**
 * Target run time for a single fight at ×1 (ROADMAP Phase 4). Fights vary from three rounds to
 * twenty, so the authored timings above are the *comfortable* pace and long fights compress
 * toward this — see `PACE_FLOOR`.
 */
export const TARGET_FIGHT_DURATION = 8_000;

/**
 * Longer targets for the Undertavern (dungeons spec §4).
 *
 * A dungeon floor carries a ×1.35 stat budget and its bosses ×1.6, which is mostly constitution —
 * so the fights are genuinely longer than a mission's. Measured against an on-curve hero at the
 * level that clears them, an ordinary floor runs 6–10 rounds but a tank floor runs 15–17 and a
 * final boss 18. Squeezing eighteen rounds into eight seconds is not a fast fight, it is an
 * unreadable one: `PACE_FLOOR` would clamp it and the whole exchange would arrive as a smear.
 *
 * The rounds themselves are not the problem — at the clear level the player wins about three
 * fights in five, so every one of those rounds is tension rather than a wait, which is exactly
 * the distinction the ~12-round archetype rule exists to protect. What has to give is the
 * *target*, and it only has to give for the room where the long fights live.
 */
export const DUNGEON_FIGHT_DURATION = 11_000;
export const BOSS_FIGHT_DURATION = 14_000;

/**
 * How far the *compressible* part of a beat — anticipation, recovery, the pause on a round
 * number — may be squeezed. The frame where a blow connects is never compressed at all, so
 * even at this floor a hit still registers as a hit. A fight long enough to need more than
 * this is allowed to run over target rather than become an unreadable blur.
 */
export const PACE_FLOOR = 0.35;

/**
 * Reduced motion keeps every beat — the player must still be able to follow what happened —
 * but strips anticipation, shake and slow-motion, and shortens everything (style guide §7).
 */
export const REDUCED_CHOREO: BattleChoreo = {
  ...DEFAULT_CHOREO,
  entryDuration: 300,
  roundBeat: 90,
  attackWindUp: 0,
  attackImpact: 70,
  attackRecover: 40,
  critHold: 0,
  defenceBeat: 130,
  verseBeat: 220,
  damageNumberLife: 500,
  healthGhostDrain: 0,
  // Shorter, but never *short*: the explainer is text to read, not motion to skip, and reduced
  // motion is a request for less movement rather than for less information.
  bossTraitBeat: 1_200,
  swarmBeat: 160,
  bossTickBeat: 130,
  knockoutBeat: 250,
  finishBeat: 250,
  shakeMagnitude: 0,
  shakeDuration: 0,
  /*
   * The cast keeps its *shape* under reduced motion, even though nothing flies.
   *
   * `ParticleLayer` drops out whole here — that has been the behaviour since Phase 4 and
   * `e2e/battle.spec.ts` asserts it — so there is no bolt, no trail and no burst. What survives is
   * the **stance**: `BattleFighter` reads `castLead` to brace a caster back while the power
   * gathers and snap them forward on the release, where a melee school lunges. Shortened, but
   * kept, because it is the only thing left that distinguishes a Mage's attack from a Warrior's,
   * and reduced motion is a request for less movement rather than for less information.
   */
  castWindUp: 220,
  castLead: 0.42,
  impactFlash: 0,
  recoilBeat: 0,
  recoilDistance: 0,
  // Kept in full: a set bonus firing is a *label*, and reading it is the entire point.
  procLabelLife: 700,
};

export const SPEED_OPTIONS = [1, 2, 4] as const;
export type PlaybackSpeed = (typeof SPEED_OPTIONS)[number];

/** A hit worth this much of the target's health earns a screen shake. */
export const SHAKE_THRESHOLD = 0.15;
/** Below this, a health bar pulses in warning. */
export const LOW_HEALTH_THRESHOLD = 0.2;

export function choreoFor(reducedMotion: boolean): BattleChoreo {
  return reducedMotion ? REDUCED_CHOREO : DEFAULT_CHOREO;
}
