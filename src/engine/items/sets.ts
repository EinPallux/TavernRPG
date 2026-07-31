/**
 * Set progress and what it is worth (gear-sets spec §1, §4).
 *
 * Two jobs, and keeping them in one small module is deliberate: **counting** the set pieces a
 * hero is wearing, and **folding** the bonuses that unlocks into the single `CombatModifiers` bag
 * the resolver reads. Thirty bonuses across ten sets would be thirty branches in `fight()` if
 * they were written as code; declared as data in `gearSets.ts` and folded here, the resolver
 * gains one parameter and a handful of reads.
 *
 * Progress is **derived, never stored** — the same rule guild halls follow. What a hero is
 * wearing is already in the save; a second copy of "you have four Oathsworn pieces" would be the
 * same fact written twice and free to drift out of step the moment a piece is unequipped.
 *
 * Pure module.
 */

import {
  GEAR_SETS,
  activeBonuses,
  gearSet,
  type GearSetDef,
  type SetEffect,
  type SetSlot,
} from '@/data/gearSets';
import type { RngStream } from '@/engine/rng';
import type { CombatModifiers, VerseId } from '@/engine/combat/types';
import type { Item, SlotId } from './types';

/**
 * A fighter wearing nothing. Every lever off, so the resolver's common path costs nothing and
 * `bag === NO_MODIFIERS` is a cheap "does this fighter have any sets at all?".
 */
export const NO_MODIFIERS: CombatModifiers = {
  damage: 0,
  armour: 0,
  health: 0,
  crit: 0,
  critDamage: 0,
  block: 0,
  dodge: 0,
  doubleStrike: 0,
  followUpDamage: 0,
  healthyDamage: null,
  verseLength: 0,
  verseDamage: 0,
  verseHeal: 0,
  discord: 0,
  chooseVerse: false,
  reflect: 0,
  lifesteal: 0,
  absorb: null,
  dodgeFury: null,
  counter: 0,
  shred: null,
  thirdStrike: null,
  firstStrikeCrit: false,
  steady: 0,
  execute: 0,
};

/** How many pieces of each set are equipped. Only sets with at least one piece appear. */
export function equippedSetCounts(
  equipment: Partial<Record<SlotId, Item>>,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const item of Object.values(equipment)) {
    if (!item?.setId) continue;
    counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Fold one effect into the bag.
 *
 * Shares **add** rather than multiply: two sources of "+8% damage" make +16%, not ×1.08². Nothing
 * in the game grants the same lever twice today — a hero wears one set at a time by construction,
 * since five slots cover a whole set — but the rule matters the moment pets and jewellery start
 * granting the same levers in Phase 14, and additive is the one a player can do in their head.
 */
function fold(bag: CombatModifiers, effect: SetEffect): CombatModifiers {
  switch (effect.kind) {
    case 'damage':
      return { ...bag, damage: bag.damage + effect.share };
    case 'armour':
      return { ...bag, armour: bag.armour + effect.share };
    case 'health':
      return { ...bag, health: bag.health + effect.share };
    case 'crit':
      return { ...bag, crit: bag.crit + effect.points };
    case 'crit-damage':
      return { ...bag, critDamage: bag.critDamage + effect.share };
    case 'block':
      return { ...bag, block: bag.block + effect.points };
    case 'dodge':
      return { ...bag, dodge: bag.dodge + effect.points };
    case 'double-strike':
      return { ...bag, doubleStrike: bag.doubleStrike + effect.points };
    case 'follow-up-damage':
      return { ...bag, followUpDamage: bag.followUpDamage + effect.share };
    case 'healthy-damage':
      return { ...bag, healthyDamage: { share: effect.share, above: effect.above } };
    case 'verse-length':
      return { ...bag, verseLength: bag.verseLength + effect.rounds };
    case 'verse-damage':
      return { ...bag, verseDamage: bag.verseDamage + effect.share };
    case 'verse-heal':
      return { ...bag, verseHeal: bag.verseHeal + effect.share };
    case 'discord':
      return { ...bag, discord: bag.discord + effect.points };
    case 'choose-verse':
      return { ...bag, chooseVerse: true };
    case 'reflect':
      return { ...bag, reflect: bag.reflect + effect.share };
    case 'lifesteal':
      return { ...bag, lifesteal: bag.lifesteal + effect.share };
    case 'absorb':
      return { ...bag, absorb: { threshold: effect.threshold, share: effect.share } };
    case 'dodge-fury':
      return { ...bag, dodgeFury: { share: effect.share, stacks: effect.stacks } };
    case 'counter':
      return { ...bag, counter: bag.counter + effect.share };
    case 'shred':
      return { ...bag, shred: { points: effect.points, stacks: effect.stacks } };
    case 'third-strike':
      return { ...bag, thirdStrike: { chance: effect.chance, share: effect.share } };
    case 'first-strike-crit':
      return { ...bag, firstStrikeCrit: true };
    case 'steady':
      return { ...bag, steady: Math.max(bag.steady, effect.share) };
    case 'execute':
      return { ...bag, execute: Math.max(bag.execute, effect.threshold) };
  }
}

/** What the pieces a hero is wearing add up to. */
export function modifiersFor(equipment: Partial<Record<SlotId, Item>>): CombatModifiers {
  let bag = NO_MODIFIERS;
  for (const [setId, pieces] of equippedSetCounts(equipment)) {
    const definition = gearSet(setId);
    if (!definition) continue;
    for (const bonus of activeBonuses(definition, pieces)) {
      for (const effect of bonus.effects) bag = fold(bag, effect);
    }
  }
  return bag;
}

export function hasModifiers(bag: CombatModifiers): boolean {
  return bag !== NO_MODIFIERS;
}

/* ── Collections ─────────────────────────────────────────────────────────────────── */

export interface SetProgress {
  readonly definition: GearSetDef;
  /** Slots owned anywhere — worn, in the bags, or in the satchel. */
  readonly owned: ReadonlySet<string>;
  /** Slots actually worn, which is what the bonuses count. */
  readonly equipped: ReadonlySet<string>;
  readonly complete: boolean;
}

/**
 * A hero's standing with every set their class can wear.
 *
 * Owned *and* equipped, separately, because they answer different questions: "how far off am I?"
 * is about the collection, and "why is my four-piece not firing?" is about the paperdoll. A page
 * that conflated them would be a page that cannot explain either.
 */
export function setProgress(
  classId: string,
  equipment: Partial<Record<SlotId, Item>>,
  carried: readonly (Item | null)[],
): readonly SetProgress[] {
  const worn = Object.values(equipment).filter((item): item is Item => Boolean(item));
  const all = [...worn, ...carried.filter((item): item is Item => Boolean(item))];

  return GEAR_SETS.filter((definition) => definition.classId === classId).map((definition) => {
    const owned = new Set(
      all.filter((item) => item.setId === definition.id).map((item) => item.slot),
    );
    const equipped = new Set(
      worn.filter((item) => item.setId === definition.id).map((item) => item.slot),
    );
    return { definition, owned, equipped, complete: owned.size >= definition.pieces.length };
  });
}

/** The Verse a Maestro five-piece opens on, or null when the choice is not theirs to make. */
export function openingVerse(
  bag: CombatModifiers,
  chosen: VerseId | null | undefined,
): VerseId | null {
  return bag.chooseVerse && chosen ? chosen : null;
}

/* ── Acquisition ─────────────────────────────────────────────────────────────────── */

/** Every `setId:slot` the hero holds anywhere — worn, bagged or in the satchel. */
export function ownedSetPieces(hero: {
  readonly equipment: Partial<Record<SlotId, Item>>;
  readonly backpack: readonly (Item | null)[];
  readonly satchel: readonly Item[];
}): Set<string> {
  const owned = new Set<string>();
  const all = [...Object.values(hero.equipment), ...hero.backpack, ...hero.satchel].filter(
    (item): item is Item => Boolean(item),
  );

  for (const item of all) {
    if (item.setId) owned.add(`${item.setId}:${item.slot}`);
  }
  return owned;
}

/**
 * A set piece this class can wear and does not already have.
 *
 * The no-dupe rule (items spec §7), and it is a rule about *the whole pool* rather than about one
 * set: drawing a set first and then a slot would keep offering pieces of a finished set. Drawing
 * uniformly across every missing piece of both the class's sets means the chase always advances
 * something.
 *
 * Null when there is nothing left to want — the caller then falls back to an Epic, which is the
 * honest thing to hand a player who has finished both sets.
 */
export function drawMissingPiece(
  classId: string,
  owned: ReadonlySet<string>,
  rng: RngStream,
): { readonly setId: string; readonly slot: SetSlot } | null {
  const missing: { setId: string; slot: SetSlot }[] = [];
  for (const definition of GEAR_SETS) {
    if (definition.classId !== classId) continue;
    for (const piece of definition.pieces) {
      if (!owned.has(`${definition.id}:${piece.slot}`)) {
        missing.push({ setId: definition.id, slot: piece.slot });
      }
    }
  }
  return missing.length === 0 ? null : (rng.pick(missing) ?? null);
}
