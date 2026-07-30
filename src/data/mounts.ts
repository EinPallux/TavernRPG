/**
 * The Wandering Stables' four stalls (docs/design/systems/shops-and-stables.md §4).
 *
 * A mount buys back *time*, and nothing else — never Vigor, never rewards, never patrol. That
 * single restriction is what keeps a mount a convenience rather than a power purchase, and it
 * is why the Royal Griffin can cost Golden Dice without breaking the F2P promise: the most a
 * paying-with-earned-dice player gets is the same day, sooner.
 *
 * Gold prices are multipliers of `goldPerVigor(L)` rather than flat numbers, so a rental stays
 * the same *share* of a day's income at level 4 and level 94 (balancing §2, §9).
 *
 * Pure data module.
 */

import type { IconId } from './icons';

export const MOUNT_IDS = ['mule', 'courser', 'warhorse', 'griffin'] as const;
export type MountId = (typeof MOUNT_IDS)[number];

export interface MountDef {
  readonly id: MountId;
  readonly name: string;
  /** Odo's one-line pitch, said in his voice. */
  readonly blurb: string;
  /** Share taken off a mission's wait, 0–1. */
  readonly speedBonus: number;
  /** Gold price as a multiple of `goldPerVigor(heroLevel)`. Zero for the Griffin. */
  readonly goldFactor: number;
  /** Golden Dice price. Zero for everything but the Griffin. */
  readonly diceCost: number;
  readonly iconId: IconId;
  /** Art override hook: `art/mounts/<id>.png` when the user drops a file in. */
  readonly artOverride?: string;
}

const MOUNT_LIST = [
  {
    id: 'mule',
    name: 'Pack Mule',
    blurb: 'Stubborn as a debt, but she has never once thrown a rider.',
    speedBonus: 0.1,
    goldFactor: 20,
    diceCost: 0,
    iconId: 'mule',
  },
  {
    id: 'courser',
    name: 'Dappled Courser',
    blurb: 'Light-footed. Likes the open road and dislikes being told about it.',
    speedBonus: 0.2,
    goldFactor: 55,
    diceCost: 0,
    iconId: 'courser',
  },
  {
    id: 'warhorse',
    name: 'Armoured Warhorse',
    blurb: 'Eats like a garrison. Worth every sack of it.',
    speedBonus: 0.3,
    goldFactor: 130,
    diceCost: 0,
    iconId: 'warhorse',
  },
  {
    id: 'griffin',
    name: 'Royal Griffin',
    blurb: 'Half the road is under him and he knows it. Do not feed him by hand.',
    speedBonus: 0.5,
    goldFactor: 0,
    diceCost: 6,
    iconId: 'griffin',
  },
] as const satisfies readonly MountDef[];

export const MOUNTS: readonly MountDef[] = MOUNT_LIST;

export const MOUNTS_BY_ID: Readonly<Record<MountId, MountDef>> = Object.fromEntries(
  MOUNT_LIST.map((mount) => [mount.id, mount]),
) as Record<MountId, MountDef>;

export function mount(id: MountId): MountDef {
  return MOUNTS_BY_ID[id];
}

export function isMountId(value: string): value is MountId {
  return (MOUNT_IDS as readonly string[]).includes(value);
}
