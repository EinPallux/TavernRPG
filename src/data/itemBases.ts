/**
 * Item name parts (docs/design/content-plan.md §3).
 *
 * The main gear stream is procedural, so what content authoring means here is *vocabulary*:
 * base nouns per slot and class, rarity prefixes, and attribute-flavoured suffixes. The
 * generator combines them into "Runed Ironclad Helm of the Badger".
 *
 * Pure data module — no React.
 */

import type { IconId } from './icons';
import type { AttributeId, ClassId, Rarity, SlotId } from '@/engine/items/types';

export interface ItemBase {
  readonly id: string;
  readonly noun: string;
  readonly iconId: IconId;
  /** Weapons and offhands only. */
  readonly classId?: ClassId;
}

/** Weapon bases, class-locked (items spec §1). */
export const WEAPON_BASES: readonly ItemBase[] = [
  // Warrior — one-handed, paired with a shield.
  { id: 'w-broadsword', noun: 'Broadsword', iconId: 'sword', classId: 'warrior' },
  { id: 'w-longsword', noun: 'Longsword', iconId: 'sword', classId: 'warrior' },
  { id: 'w-warblade', noun: 'Warblade', iconId: 'sword', classId: 'warrior' },
  { id: 'w-battleaxe', noun: 'Battleaxe', iconId: 'axe', classId: 'warrior' },
  { id: 'w-cleaver', noun: 'Cleaver', iconId: 'axe', classId: 'warrior' },
  { id: 'w-warmace', noun: 'Warmace', iconId: 'mace', classId: 'warrior' },
  { id: 'w-morningstar', noun: 'Morningstar', iconId: 'mace', classId: 'warrior' },

  // Bard — instruments.
  { id: 'b-lute', noun: 'Lute', iconId: 'lute', classId: 'bard' },
  { id: 'b-mandolin', noun: 'Mandolin', iconId: 'lute', classId: 'bard' },
  { id: 'b-hurdygurdy', noun: 'Hurdy-Gurdy', iconId: 'lute', classId: 'bard' },
  { id: 'b-warhorn', noun: 'Warhorn', iconId: 'horn', classId: 'bard' },
  { id: 'b-cornet', noun: 'Cornet', iconId: 'horn', classId: 'bard' },
  { id: 'b-marchdrum', noun: 'March Drum', iconId: 'drum', classId: 'bard' },
  { id: 'b-tabor', noun: 'Tabor', iconId: 'drum', classId: 'bard' },

  // Mage — two-handed foci.
  { id: 'm-staff', noun: 'Staff', iconId: 'staff', classId: 'mage' },
  { id: 'm-emberstaff', noun: 'Ember Staff', iconId: 'staff', classId: 'mage' },
  { id: 'm-runestaff', noun: 'Runestaff', iconId: 'staff', classId: 'mage' },
  { id: 'm-wand', noun: 'Wand', iconId: 'wand', classId: 'mage' },
  { id: 'm-scepter', noun: 'Scepter', iconId: 'wand', classId: 'mage' },
  { id: 'm-rod', noun: 'Rod', iconId: 'wand', classId: 'mage' },

  // Hunter — ranged.
  { id: 'h-shortbow', noun: 'Shortbow', iconId: 'bow', classId: 'hunter' },
  { id: 'h-longbow', noun: 'Longbow', iconId: 'bow', classId: 'hunter' },
  { id: 'h-recurve', noun: 'Recurve Bow', iconId: 'bow', classId: 'hunter' },
  { id: 'h-crossbow', noun: 'Crossbow', iconId: 'crossbow', classId: 'hunter' },
  { id: 'h-arbalest', noun: 'Arbalest', iconId: 'crossbow', classId: 'hunter' },

  // Swashbuckler — light blades.
  { id: 's-saber', noun: 'Saber', iconId: 'saber', classId: 'swashbuckler' },
  { id: 's-cutlass', noun: 'Cutlass', iconId: 'saber', classId: 'swashbuckler' },
  { id: 's-falchion', noun: 'Falchion', iconId: 'saber', classId: 'swashbuckler' },
  { id: 's-rapier', noun: 'Rapier', iconId: 'rapier', classId: 'swashbuckler' },
  { id: 's-smallsword', noun: 'Smallsword', iconId: 'rapier', classId: 'swashbuckler' },
];

/** Offhand bases, class-locked — each class's proc leans on its own kind. */
export const OFFHAND_BASES: readonly ItemBase[] = [
  { id: 'o-buckler', noun: 'Buckler', iconId: 'shield', classId: 'warrior' },
  { id: 'o-kiteshield', noun: 'Kite Shield', iconId: 'shield', classId: 'warrior' },
  { id: 'o-towershield', noun: 'Tower Shield', iconId: 'shield', classId: 'warrior' },

  { id: 'o-songbook', noun: 'Songbook', iconId: 'songbook', classId: 'bard' },
  { id: 'o-chapbook', noun: 'Chapbook', iconId: 'songbook', classId: 'bard' },
  { id: 'o-hymnal', noun: 'Hymnal', iconId: 'songbook', classId: 'bard' },

  { id: 'o-orb', noun: 'Orb', iconId: 'orb', classId: 'mage' },
  { id: 'o-focusstone', noun: 'Focus Stone', iconId: 'orb', classId: 'mage' },
  { id: 'o-scryglass', noun: 'Scrying Glass', iconId: 'orb', classId: 'mage' },

  { id: 'o-quiver', noun: 'Quiver', iconId: 'quiver', classId: 'hunter' },
  { id: 'o-bandolier', noun: 'Bolt Bandolier', iconId: 'quiver', classId: 'hunter' },

  { id: 'o-parrydagger', noun: 'Parry Dagger', iconId: 'dagger', classId: 'swashbuckler' },
  { id: 'o-maingauche', noun: 'Main-Gauche', iconId: 'dagger', classId: 'swashbuckler' },
  { id: 'o-stiletto', noun: 'Stiletto', iconId: 'dagger', classId: 'swashbuckler' },
];

/** General gear — unrestricted, any class may wear it (items spec §1). */
export const GENERAL_BASES: Readonly<Record<Exclude<SlotId, 'weapon' | 'offhand'>, ItemBase[]>> = {
  helmet: [
    { id: 'g-coif', noun: 'Coif', iconId: 'helm' },
    { id: 'g-helm', noun: 'Helm', iconId: 'helm' },
    { id: 'g-barbute', noun: 'Barbute', iconId: 'helm' },
    { id: 'g-circlet', noun: 'Circlet', iconId: 'helm' },
    { id: 'g-hood', noun: 'Hood', iconId: 'helm' },
  ],
  chest: [
    { id: 'g-jerkin', noun: 'Jerkin', iconId: 'chestplate' },
    { id: 'g-hauberk', noun: 'Hauberk', iconId: 'chestplate' },
    { id: 'g-breastplate', noun: 'Breastplate', iconId: 'chestplate' },
    { id: 'g-robe', noun: 'Robe', iconId: 'chestplate' },
    { id: 'g-brigandine', noun: 'Brigandine', iconId: 'chestplate' },
  ],
  gloves: [
    { id: 'g-gloves', noun: 'Gloves', iconId: 'gloves' },
    { id: 'g-gauntlets', noun: 'Gauntlets', iconId: 'gloves' },
    { id: 'g-bracers', noun: 'Bracers', iconId: 'gloves' },
    { id: 'g-wraps', noun: 'Hand Wraps', iconId: 'gloves' },
  ],
  boots: [
    { id: 'g-boots', noun: 'Boots', iconId: 'boots' },
    { id: 'g-greaves', noun: 'Greaves', iconId: 'boots' },
    { id: 'g-sabatons', noun: 'Sabatons', iconId: 'boots' },
    { id: 'g-striders', noun: 'Striders', iconId: 'boots' },
  ],
  belt: [
    { id: 'g-belt', noun: 'Belt', iconId: 'belt' },
    { id: 'g-girdle', noun: 'Girdle', iconId: 'belt' },
    { id: 'g-sash', noun: 'Sash', iconId: 'belt' },
    { id: 'g-warbelt', noun: 'War Belt', iconId: 'belt' },
  ],
  amulet: [
    { id: 'g-amulet', noun: 'Amulet', iconId: 'amulet' },
    { id: 'g-pendant', noun: 'Pendant', iconId: 'amulet' },
    { id: 'g-talisman', noun: 'Talisman', iconId: 'amulet' },
    { id: 'g-torc', noun: 'Torc', iconId: 'amulet' },
  ],
  ring: [
    { id: 'g-ring', noun: 'Ring', iconId: 'ring' },
    { id: 'g-band', noun: 'Band', iconId: 'ring' },
    { id: 'g-signet', noun: 'Signet', iconId: 'ring' },
    { id: 'g-loop', noun: 'Seal Ring', iconId: 'ring' },
  ],
  trinket: [
    { id: 'g-charm', noun: 'Charm', iconId: 'trinket' },
    { id: 'g-fetish', noun: 'Fetish', iconId: 'trinket' },
    { id: 'g-idol', noun: 'Idol', iconId: 'trinket' },
    { id: 'g-keepsake', noun: 'Keepsake', iconId: 'trinket' },
  ],
};

/** Rarity prefixes — the first read on how good a drop is, before any numbers. */
export const RARITY_PREFIXES: Readonly<Record<Rarity, readonly string[]>> = {
  common: ['Worn', 'Plain', 'Chipped', 'Simple', 'Rough'],
  uncommon: ['Sturdy', 'Keen', 'Hardy', 'Fine', 'Tempered'],
  rare: ['Runed', 'Gilded', 'Emberforged', 'Silverpine', 'Storm-touched'],
  epic: ['Ancient', 'Wyrmbound', 'Starmetal', 'Duskwoven', 'Thornfell'],
  set: ['Oathsworn', 'Wolfblood', 'Maestro’s', 'Dawnchorus', 'Emberweave'],
  // Never used to build a name: a legendary's name is authored in `data/legendaries.ts`, because
  // the whole of a named blade is that it is named. Present so the record stays exhaustive, and
  // so a future caller that does reach for it gets something in the right register.
  legendary: ['Unbroken', 'Sundered', 'Kingsmourn', 'Last', 'Undying'],
};

/** Suffixes keyed to the item's dominant attribute — flavour that also reads as information. */
export const ATTRIBUTE_SUFFIXES: Readonly<Record<AttributeId, readonly string[]>> = {
  str: ['of the Bear', 'of the Ox', 'of Iron Thews', 'of the Boar'],
  dex: ['of the Fox', 'of Quick Hands', 'of the Hare', 'of the Falcon'],
  int: ['of the Owl', 'of Quiet Study', 'of the Ember', 'of the Deep'],
  con: ['of the Badger', 'of Long Roads', 'of the Tortoise', 'of Stout Heart'],
  lck: ['of the Magpie', 'of Fortune', 'of the Cat', 'of Fool’s Grace'],
};

export function weaponBasesFor(classId: ClassId): ItemBase[] {
  return WEAPON_BASES.filter((base) => base.classId === classId);
}

export function offhandBasesFor(classId: ClassId): ItemBase[] {
  return OFFHAND_BASES.filter((base) => base.classId === classId);
}
