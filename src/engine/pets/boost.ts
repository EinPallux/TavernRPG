/**
 * What the pet at your side is actually doing (pets spec §2).
 *
 * **One pet at a time**, and it boosts exactly one thing. That constraint is what keeps the whole
 * system from becoming a second character screen, and it is why this module is fifty lines rather
 * than five hundred: there is no stacking, no set of pets, no synergy to resolve.
 *
 * The boost lands in one of two places depending on what it improves:
 *
 * - **str/dex/int/con/lck and armour** go through `deriveStats`, the one place a hero's numbers
 *   are computed. That way the character screen's breakdown, the compare tooltips and the fight
 *   all see the same figure, and a pet cannot be worth more in a battle than it says on the chip.
 * - **goldFind and xpBonus** become a `PayoutBonus`, which composes with the guild's by
 *   multiplying — exactly as `rewards.ts` anticipated.
 *
 * Pure module.
 */

import { pet, type PetBoost, type PetDef } from '@/data/pets';
import type { PayoutBonus } from '@/engine/progression/rewards';
import type { AttributeId } from '@/engine/progression/stats';
import { boostShare, progressOf, type PetProgress } from './feeding';
import type { SaveFile } from '@/engine/save/schema';

/** The active pet's contribution, resolved once. */
export interface ResolvedBoost {
  readonly petId: string;
  readonly name: string;
  readonly stat: PetBoost;
  /** A share: 0.032 is +3.2%. */
  readonly share: number;
  readonly progress: PetProgress;
  readonly definition: PetDef;
}

/**
 * The boost in force, or null.
 *
 * Null when there is no active pet **or when the active pet is not owned** — the second guard
 * matters because ownership is derived: a save could name a pet whose source has stopped being
 * true, and while nothing in the game currently un-earns a pet, a boost that survives losing its
 * pet is the kind of thing that only shows up in a bug report six phases later.
 */
export function activeBoost(save: SaveFile, owned: readonly PetDef[]): ResolvedBoost | null {
  const id = save.pets.activeId;
  if (!id) return null;

  const definition = owned.find((entry) => entry.id === id) ?? null;
  if (!definition) return null;

  const progress = progressOf(save.pets.progress, id);
  return {
    petId: id,
    name: definition.name,
    stat: definition.boost,
    share: boostShare(definition, progress),
    progress,
    definition,
  };
}

/** The attribute a boost raises, or null when it raises something else. */
export function boostedAttribute(boost: ResolvedBoost | null): {
  readonly stat: AttributeId;
  readonly share: number;
} | null {
  if (!boost) return null;
  const attributes: readonly PetBoost[] = ['str', 'dex', 'int', 'con', 'lck'];
  return attributes.includes(boost.stat)
    ? { stat: boost.stat as AttributeId, share: boost.share }
    : null;
}

/** The armour share a boost adds, or zero. */
export function boostedArmour(boost: ResolvedBoost | null): number {
  return boost?.stat === 'armour' ? boost.share : 0;
}

/**
 * The gold and XP multipliers in force, from the pet **and from gear specials**.
 *
 * Gear has advertised `+3% gold found` since Phase 2 and it has never been applied to anything —
 * `deriveStats` computed the number and no payout ever read it. Fixed here rather than in its own
 * phase because this is the moment the composition machinery exists: one `PayoutBonus`, built
 * from every source, multiplied into the payout the way `rewards.ts` always intended.
 */
export function rewardBonus(
  boost: ResolvedBoost | null,
  gear: { readonly goldFind: number; readonly xpBonus: number },
): PayoutBonus {
  const petGold = boost?.stat === 'goldFind' ? boost.share : 0;
  const petXp = boost?.stat === 'xpBonus' ? boost.share : 0;
  return {
    gold: (1 + petGold) * (1 + gear.goldFind / 100),
    xp: (1 + petXp) * (1 + gear.xpBonus / 100),
  };
}

/**
 * Fold any number of bonuses together. Multiplicative, per `rewards.ts`.
 *
 * Variadic since the greenhorn's due joined the guild tracks and the pet boost (balancing §19) —
 * three sources nested as `combine(a, combine(b, c))` reads like an accident of arity rather than
 * the design, which is that every source multiplies and none of them is special.
 */
export function combineBonus(...bonuses: readonly PayoutBonus[]): PayoutBonus {
  return bonuses.reduce((all, one) => ({ gold: all.gold * one.gold, xp: all.xp * one.xp }), {
    gold: 1,
    xp: 1,
  });
}

export { pet };
