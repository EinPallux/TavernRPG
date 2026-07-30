/**
 * Combat contract (docs/design/systems/combat.md §1, §3).
 *
 * The engine takes two `Combatant` snapshots and a seed, and returns a `BattleResult` whose
 * `log` is a plain serializable array of events. That log is the firewall between rules and
 * presentation: Phase 4's animated scene renders it, saves can store it, and the maths can be
 * changed without touching a single component (or vice versa).
 *
 * Pure module.
 */

import type { AttributeId, Attributes } from '@/engine/progression/stats';

/** Which side of the fight. `a` is the attacker/challenger, `b` the defender. */
export type Side = 'a' | 'b';

export type VerseId = 'battle-hymn' | 'ironsong' | 'discord';

/**
 * A resolved combat ability. Class kits, monster archetype traits and (from Phase 12) set
 * bonuses all reduce to this shape, so the resolver treats them uniformly.
 */
export type CombatProc =
  | { readonly kind: 'block'; readonly chance: number }
  | { readonly kind: 'dodge'; readonly chance: number }
  | { readonly kind: 'double-strike'; readonly chance: number; readonly damageMultiplier: number }
  | { readonly kind: 'verses' }
  /** Attacks cannot be blocked or dodged. */
  | { readonly kind: 'arcane-certainty' }
  /*
   * ── Boss signatures (dungeons spec §2) ──────────────────────────────────────────
   *
   * Three abilities no ordinary monster has, and deliberately three *different shapes* of
   * ability rather than three numbers: one adds damage on a rhythm, one punishes a defence, one
   * ramps. A player who walls on floor 5 should be able to say what beat them, which is why each
   * of these fires a visible event rather than quietly adjusting a multiplier.
   */
  /** An extra unavoidable hit on every `everyRounds`-th round. Riddletail's swarm. */
  | {
      readonly kind: 'swarm-call';
      readonly everyRounds: number;
      /** Share of a normal swing, before the target's armour. */
      readonly damageShare: number;
    }
  /** Heals when the *opponent's* attack fails to land. The Margrave feeds on a miss. */
  | { readonly kind: 'siphon'; readonly healShare: number }
  /** Damage reduction cap grows every round. Vulkarr cools into his own armour. */
  | { readonly kind: 'hardening'; readonly perRound: number; readonly cap: number };

export interface CombatantCard {
  readonly id: string;
  readonly name: string;
  /** Class name or monster archetype, for the battle scene's nameplate. */
  readonly kind: string;
  readonly level: number;
  readonly maxHealth: number;
  readonly portrait?: string;
}

/**
 * Everything the resolver needs about one fighter, computed *before* the fight starts.
 * A snapshot by design: the engine never reads live game state, which is what makes a fight
 * reproducible from a stored seed months later.
 */
export interface Combatant {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly level: number;
  readonly maxHealth: number;
  readonly attributes: Attributes;
  readonly mainStat: AttributeId;
  readonly weapon: { readonly min: number; readonly max: number };
  readonly armour: number;
  /** Maximum share of a hit that armour may absorb. */
  readonly damageReductionCap: number;
  readonly procs: readonly CombatProc[];
  readonly portrait?: string;
  /**
   * The one-line name and explanation of a signature ability, announced before the first blow.
   *
   * Content, carried on the snapshot rather than looked up by the resolver, so `fight()` keeps
   * its "no data imports" rule. Present only on bosses: a floor-5 wall has to *teach*, and a
   * player who cannot name the thing that killed them will bounce off the same floor twice
   * (dungeons spec §2).
   */
  readonly signature?: { readonly label: string; readonly explainer: string };
  /**
   * What this fighter's gear sets are worth, already folded to numbers (gear-sets spec §4).
   *
   * On the snapshot rather than looked up, for the same reason `signature` is: `fight()` never
   * imports data. Absent for monsters and for anyone wearing no set, and the resolver reads it
   * through `NO_MODIFIERS` so the common path costs nothing.
   */
  readonly modifiers?: CombatModifiers;
  /** The Verse this fighter opens on, when a five-piece has earned them the choice. */
  readonly openingVerse?: VerseId;
}

/**
 * Everything a gear set can change about a fight (gear-sets spec §2).
 *
 * Declared here rather than in `items/sets.ts` so the combat contract owns its own vocabulary —
 * the folding lives with the items, the *meaning* lives with the resolver that reads it.
 */
export interface CombatModifiers {
  readonly damage: number;
  readonly armour: number;
  readonly health: number;
  readonly crit: number;
  readonly critDamage: number;
  readonly block: number;
  readonly dodge: number;
  readonly doubleStrike: number;
  readonly followUpDamage: number;
  readonly healthyDamage: { readonly share: number; readonly above: number } | null;
  readonly verseLength: number;
  readonly verseDamage: number;
  readonly verseHeal: number;
  readonly discord: number;
  readonly chooseVerse: boolean;
  readonly reflect: number;
  readonly lifesteal: number;
  readonly absorb: { readonly threshold: number; readonly share: number } | null;
  readonly dodgeFury: { readonly share: number; readonly stacks: number } | null;
  readonly counter: number;
  readonly shred: { readonly points: number; readonly stacks: number } | null;
  readonly thirdStrike: { readonly chance: number; readonly share: number } | null;
  readonly firstStrikeCrit: boolean;
  readonly steady: number;
  readonly execute: number;
}

export type BattleEvent =
  | {
      readonly t: 'battle_start';
      readonly a: CombatantCard;
      readonly b: CombatantCard;
      readonly first: Side;
    }
  | { readonly t: 'round_start'; readonly n: number }
  | { readonly t: 'verse_change'; readonly side: Side; readonly verse: VerseId }
  | {
      readonly t: 'attack';
      readonly source: Side;
      /** Damage before armour and procs — what the swing was "worth". */
      readonly raw: number;
      readonly final: number;
      readonly crit: boolean;
      /** True for the bonus hit of a double-strike. */
      readonly followUp?: boolean;
    }
  | { readonly t: 'blocked'; readonly target: Side }
  | { readonly t: 'dodged'; readonly target: Side }
  | { readonly t: 'missed'; readonly source: Side }
  | {
      readonly t: 'damage';
      readonly target: Side;
      readonly amount: number;
      readonly hpAfter: number;
      readonly overkill?: number;
    }
  | { readonly t: 'ko'; readonly target: Side }
  /** A boss naming its trick, once, before the fight starts. */
  | {
      readonly t: 'boss_trait';
      readonly side: Side;
      readonly label: string;
      readonly explainer: string;
    }
  /** The swarm arrives. Followed by a normal `damage` event, so health handling is unchanged. */
  | { readonly t: 'swarm'; readonly source: Side; readonly label: string }
  | {
      readonly t: 'heal';
      readonly target: Side;
      readonly amount: number;
      readonly hpAfter: number;
    }
  /** Armour thickening by the round. `reduction` is the *total* extra cap, not the increment. */
  | { readonly t: 'harden'; readonly side: Side; readonly reduction: number }
  /**
   * A gear set doing something the player should see (gear-sets spec §3).
   *
   * One event for all of them rather than eight, because the scene draws them the same way — a
   * named flourish over the fighter it fired for. The `effect` is what distinguishes them, and
   * the label is already written in the set data.
   */
  | {
      readonly t: 'set_proc';
      readonly side: Side;
      readonly effect:
        | 'reflect'
        | 'lifesteal'
        | 'absorb'
        | 'counter'
        | 'shred'
        | 'third-strike'
        | 'execute'
        | 'verse-heal';
      readonly label: string;
      /** Damage thrown, health mended or points stripped, depending on the effect. */
      readonly amount: number;
    }
  | {
      readonly t: 'battle_end';
      readonly winner: Side;
      readonly rounds: number;
      /** Why it ended — the result screen says "on points" differently from a knockout. */
      readonly reason: 'knockout' | 'round_limit';
    };

export interface BattleResult {
  readonly winner: Side;
  readonly winnerId: string;
  readonly loserId: string;
  readonly rounds: number;
  readonly log: readonly BattleEvent[];
  /** Remaining health per side at the end, for result screens and "closest moment" stats. */
  readonly remainingHealth: Readonly<Record<Side, number>>;
  /** Lowest health each side dropped to — the "closest moment" line (combat spec §6). */
  readonly lowestHealth: Readonly<Record<Side, number>>;
  readonly totalDamage: Readonly<Record<Side, number>>;
  readonly reason: 'knockout' | 'round_limit';
}

/** Hard stop so a mutually unkillable pair cannot spin forever (combat spec §2 rule 3). */
export const MAX_ROUNDS = 100;

export const CRIT_MULTIPLIER = 2.0;

export function findProc<K extends CombatProc['kind']>(
  combatant: Combatant,
  kind: K,
): Extract<CombatProc, { kind: K }> | undefined {
  return combatant.procs.find((proc) => proc.kind === kind) as
    Extract<CombatProc, { kind: K }> | undefined;
}

export function hasProc(combatant: Combatant, kind: CombatProc['kind']): boolean {
  return combatant.procs.some((proc) => proc.kind === kind);
}
