/**
 * Hero mutations as pure functions.
 *
 * The store calls these and stores the result; nothing here touches React, storage or the
 * clock. That makes every rule — can this class wear this? is there room? can they afford it? —
 * unit-testable without a browser, and keeps the store a thin shell (CLAUDE.md purity split).
 *
 * Every function returns a *new* hero and never mutates its input.
 */

import { classDef } from '@/data/classes';
import {
  statCost,
  statCostFor,
  type AttributeId,
  type Attributes,
} from '@/engine/progression/stats';
import { BACKPACK_SLOTS, EMPTY_MATERIALS, SATCHEL_SLOTS, type Hero } from '@/engine/save/schema';
import { starterKit } from '@/engine/items/starterKit';
import type { RngStream } from '@/engine/rng';
import type { ClassId, Item, SlotId } from '@/engine/items/types';

export interface HeroCreationInput {
  readonly name: string;
  readonly classId: ClassId;
  readonly now: number;
  /** Starting purse — enough to feel the training loop immediately (tutorial spec §2 beat 5). */
  readonly startingGold?: number;
  /**
   * Seeded stream for the starting kit. Omit and the hero starts empty-handed, which is only
   * ever right for tests that are measuring something else — a real hero needs a weapon.
   */
  readonly rng?: RngStream;
}

export function createHero({
  name,
  classId,
  now,
  startingGold = 100,
  rng,
}: HeroCreationInput): Hero {
  const blank: Hero = {
    name: name.trim(),
    classId,
    level: 1,
    xp: 0,
    trained: { str: 0, dex: 0, int: 0, con: 0, lck: 0 },
    gold: startingGold,
    dice: 0,
    materials: { ...EMPTY_MATERIALS },
    openingVerse: null,
    // Set properly when the world raises and the player takes the bottom rung; zero until then
    // means "not yet on the ladder" rather than "worst hero alive".
    honor: 0,
    equipment: {},
    backpack: Array.from({ length: BACKPACK_SLOTS }, () => null),
    satchel: [],
    createdAt: now,
  };

  if (!rng) return blank;

  // Kit goes straight onto the body, not into the bags: nobody's first act should be
  // opening the backpack to put their own trousers on.
  return starterKit(classId, rng).reduce(
    (hero, item) => equipItem(addItem(hero, item).hero, item),
    blank,
  );
}

export const NAME_RULES = {
  minLength: 3,
  maxLength: 16,
  /** Letters, spaces, apostrophes and hyphens (character spec §1). */
  pattern: /^[\p{L}][\p{L} '-]*$/u,
} as const;

export function validateHeroName(raw: string): { ok: true } | { ok: false; reason: string } {
  const name = raw.trim();
  if (name.length < NAME_RULES.minLength) {
    return { ok: false, reason: `At least ${NAME_RULES.minLength} characters.` };
  }
  if (name.length > NAME_RULES.maxLength) {
    return { ok: false, reason: `At most ${NAME_RULES.maxLength} characters.` };
  }
  if (!NAME_RULES.pattern.test(name)) {
    return { ok: false, reason: 'Letters, spaces, apostrophes and hyphens only.' };
  }
  return { ok: true };
}

/** Whether this hero may equip this item (items spec §5). */
export function canEquip(hero: Hero, item: Item): { ok: true } | { ok: false; reason: string } {
  if (item.classLock && item.classLock !== hero.classId) {
    return {
      ok: false,
      reason: `${classDef(item.classLock).name}s only — your hero cannot use this.`,
    };
  }
  return { ok: true };
}

function firstFreeBackpackIndex(hero: Hero): number {
  return hero.backpack.findIndex((slot) => slot === null);
}

/**
 * Whether `count` more items would fit without the satchel having to shove anything out.
 *
 * `addItem` never refuses loot — a full satchel discards its oldest unlocked piece rather than
 * dropping the drop. That is right for a mission, where the loot is already earned, and wrong
 * for a *purchase*: a shop, a forge or a gacha spin has to be able to say "there is nowhere to
 * put this" before it takes the payment. Three screens were each computing this inline; one of
 * them counted the satchel wrong.
 */
export function hasRoom(hero: Hero, count = 1): boolean {
  const free =
    hero.backpack.filter((slot) => slot === null).length +
    Math.max(0, SATCHEL_SLOTS - hero.satchel.length);
  return free >= Math.max(1, count);
}

export interface AddItemResult {
  readonly hero: Hero;
  /** Where it landed, so the UI can flash the right cell. */
  readonly placement: 'backpack' | 'satchel' | 'discarded';
  /** Item pushed out of the satchel to make room, if any. */
  readonly discarded?: Item;
}

/**
 * Put an item in the backpack, overflowing to the satchel when full (character spec §4).
 * A full satchel discards its oldest *unlocked* item rather than refusing loot outright.
 */
export function addItem(hero: Hero, item: Item): AddItemResult {
  const free = firstFreeBackpackIndex(hero);
  if (free !== -1) {
    const backpack = [...hero.backpack];
    backpack[free] = item;
    return { hero: { ...hero, backpack }, placement: 'backpack' };
  }

  if (hero.satchel.length < SATCHEL_SLOTS) {
    return { hero: { ...hero, satchel: [...hero.satchel, item] }, placement: 'satchel' };
  }

  const oldestUnlocked = hero.satchel.findIndex((entry) => !entry.locked);
  if (oldestUnlocked === -1) {
    // Everything is locked: refuse the new item rather than destroying a protected one.
    return { hero, placement: 'discarded', discarded: item };
  }

  const satchel = [...hero.satchel];
  const [discarded] = satchel.splice(oldestUnlocked, 1);
  satchel.push(item);
  return {
    hero: { ...hero, satchel },
    placement: 'satchel',
    ...(discarded ? { discarded } : {}),
  };
}

/** Equip from backpack or satchel; whatever was worn goes back where the new item came from. */
export function equipItem(hero: Hero, item: Item): Hero {
  if (!canEquip(hero, item).ok) return hero;

  const previous = hero.equipment[item.slot];
  const backpackIndex = hero.backpack.findIndex((entry) => entry?.uid === item.uid);
  const satchelIndex = hero.satchel.findIndex((entry) => entry.uid === item.uid);

  const backpack = [...hero.backpack];
  let satchel = [...hero.satchel];

  if (backpackIndex !== -1) {
    backpack[backpackIndex] = previous ?? null;
  } else if (satchelIndex !== -1) {
    satchel = satchel.filter((entry) => entry.uid !== item.uid);
    if (previous) {
      const free = backpack.findIndex((slot) => slot === null);
      if (free !== -1) backpack[free] = previous;
      else satchel.push(previous);
    }
  } else {
    // Equipping something not held (dev tools, future rewards): stow the old piece if we can.
    if (previous) {
      const free = backpack.findIndex((slot) => slot === null);
      if (free !== -1) backpack[free] = previous;
      else satchel.push(previous);
    }
  }

  return {
    ...hero,
    backpack,
    satchel,
    equipment: { ...hero.equipment, [item.slot]: item },
  };
}

/** Take a piece off. Refuses when there is nowhere to put it, rather than deleting it. */
export function unequipItem(hero: Hero, slot: SlotId): Hero {
  const item = hero.equipment[slot];
  if (!item) return hero;

  const free = firstFreeBackpackIndex(hero);
  if (free === -1 && hero.satchel.length >= SATCHEL_SLOTS) return hero;

  const equipment = { ...hero.equipment };
  delete equipment[slot];

  if (free !== -1) {
    const backpack = [...hero.backpack];
    backpack[free] = item;
    return { ...hero, equipment, backpack };
  }
  return { ...hero, equipment, satchel: [...hero.satchel, item] };
}

/** Toggle the lock that protects an item from being sold, scrapped or auto-discarded. */
export function toggleLock(hero: Hero, uid: string): Hero {
  const flip = (item: Item): Item => (item.uid === uid ? { ...item, locked: !item.locked } : item);
  return {
    ...hero,
    backpack: hero.backpack.map((entry) => (entry ? flip(entry) : entry)),
    satchel: hero.satchel.map(flip),
  };
}

/** Remove an item from the bags. Locked items are protected. */
export function discardItem(hero: Hero, uid: string): Hero {
  const held =
    hero.backpack.find((entry) => entry?.uid === uid) ??
    hero.satchel.find((entry) => entry.uid === uid);
  if (!held || held.locked) return hero;

  return {
    ...hero,
    backpack: hero.backpack.map((entry) => (entry?.uid === uid ? null : entry)),
    satchel: hero.satchel.filter((entry) => entry.uid !== uid),
  };
}

export interface TrainResult {
  readonly hero: Hero;
  readonly pointsBought: number;
  readonly goldSpent: number;
}

/**
 * Buy attribute points with gold (balancing §3). Buys as many as the purse allows up to
 * `count`, so a "+25" button with 20 points' worth of gold buys 20 instead of failing.
 */
export function trainAttribute(hero: Hero, attribute: AttributeId, count: number): TrainResult {
  let bought = 0;
  let spent = 0;
  const owned = hero.trained[attribute];

  for (let i = 0; i < Math.max(0, Math.floor(count)); i += 1) {
    const price = statCost(owned + bought);
    if (spent + price > hero.gold) break;
    spent += price;
    bought += 1;
  }

  if (bought === 0) return { hero, pointsBought: 0, goldSpent: 0 };

  const trained: Attributes = { ...hero.trained, [attribute]: owned + bought };
  return {
    hero: { ...hero, trained, gold: hero.gold - spent },
    pointsBought: bought,
    goldSpent: spent,
  };
}

/** What the next `count` points would cost — for the button's price badge. */
export function trainingCost(hero: Hero, attribute: AttributeId, count: number): number {
  return statCostFor(hero.trained[attribute], count);
}
