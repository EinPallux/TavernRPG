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
  | { readonly kind: 'arcane-certainty' };

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
