/**
 * The three dungeons (docs/design/systems/dungeons.md §1–§2, content plan §3).
 *
 * A dungeon is *ten named floors and a level curve*. Like mission monsters, a floor's stat block
 * is generated from an archetype at fight time rather than written out — the difference is that a
 * dungeon monster's level is **fixed**, not scaled to the player. That single property is what
 * makes a dungeon a benchmark instead of content: floor 7 of the Rat Cellars is level 26 whether
 * you meet it at 20 or at 60, so beating it means something and failing it tells you exactly how
 * far short you are.
 *
 * Floors 5 and 10 are bosses, and each carries a **signature** — a named ability with a written
 * explainer, announced before the first blow. Three different *shapes* of ability rather than
 * three bigger numbers: one adds damage on a rhythm, one punishes a defence, one ramps. A player
 * who walls should be able to say what beat them.
 *
 * Art resolves through the override manifest (`asset-pipeline.md` §3): drop
 * `art/monsters/<id>.png` in and it appears, with no code change. Until then a floor shows its
 * archetype silhouette under the dungeon's tint, which is the documented fallback.
 *
 * Pure data module.
 */

import type { CombatProc } from '@/engine/combat/types';
import type { ArchetypeId } from './monsterArchetypes';

export type DungeonId = 'rat-cellars' | 'barrowdeep' | 'emberdeep';

/** Ten floors, always. The type says so, so a short dungeon is a compile error. */
export const FLOORS_PER_DUNGEON = 10;
/** Which floors are bosses (spec §2). */
export const BOSS_FLOORS: readonly number[] = [5, 10];

export function isBossFloor(floor: number): boolean {
  return BOSS_FLOORS.includes(floor);
}

export interface DungeonFloorDef {
  /** 1–10. */
  readonly floor: number;
  readonly id: string;
  readonly name: string;
  readonly archetypeId: ArchetypeId;
  /** One line, shown on the plaque and the battle nameplate. */
  readonly flavor: string;
  /**
   * A boss's named ability. Present on floors 5 and 10 only — the content test enforces both
   * directions, because a boss without one is a big monster and an ordinary floor with one is a
   * difficulty spike nobody designed.
   */
  readonly signature?: {
    readonly label: string;
    readonly explainer: string;
    readonly proc: CombatProc;
  };
  readonly artOverride?: string;
}

export interface DungeonDef {
  readonly id: DungeonId;
  readonly name: string;
  /** One line of place, on the door in the Undertavern. */
  readonly tagline: string;
  /** Hero level the door will open at, alongside the key. */
  readonly gateLevel: number;
  /** The key that unlocks it, once and permanently. */
  readonly keyId: DungeonKeyId;
  readonly keyName: string;
  /** Floor N is `levelBase + N × levelStep` (balancing §5). */
  readonly levelBase: number;
  readonly levelStep: number;
  /** Awarded for clearing floor 10, and shown on the profile forever after. */
  readonly trophy: { readonly id: string; readonly name: string };
  readonly backdrop: string;
  /** Colour wash, so one cellar backdrop reads as three different depths. */
  readonly tint: string;
  readonly floors: readonly DungeonFloorDef[];
}

export type DungeonKeyId = 'rusty-key' | 'bone-key' | 'brand-key';

const BG = '/assets/backgrounds/dungeons_background.png';

/*
 * ── Why the archetypes climb in the order they do ─────────────────────────────────
 *
 * A floor's difficulty is its *level* plus its *archetype*, and the second of those turns out to
 * be worth as much as six floors of the first. Measured against an on-curve reference hero at a
 * ×1.35 budget, the five archetypes need wildly different heroes to beat: a swarm falls to a hero
 * thirteen levels under it, a tank needs one at its own level. Twelve levels of spread, on a
 * dungeon whose ten floors span eighteen.
 *
 * The first draft picked archetypes for flavour alone and the ramp came out non-monotonic —
 * Barrowdeep floor 7 fell to a level-33 hero when floor 6 needed 46, so a player would clear
 * seven and bounce off six they had already passed. A dungeon that gets *easier* as you descend
 * is not a benchmark.
 *
 * So each dungeon runs its archetypes in ascending order of that measured difficulty —
 * swarm → caster → skirmisher → bruiser → tank — with the level curve pushing in the same
 * direction rather than against it. Floors 5 and 10 sit a further step up on the ×1.6 boss
 * budget, and the floor after a boss is chosen to clear the bump rather than dip under it.
 *
 * The other half of the rule: **floor 5 teaches what floor 10 tests.** Each dungeon's mid-boss
 * carries a weaker version of its final boss's signature, so the mechanic that ends the dungeon
 * is one the player has already met and survived. `dungeons.test.ts` asserts both the ramp and
 * the pairing.
 */

/* ── The Rat Cellars ─────────────────────────────────────────────────────────────── */

const RAT_CELLARS: readonly DungeonFloorDef[] = [
  {
    floor: 1,
    id: 'cellar-nipper',
    name: 'Cellar Nipper',
    archetypeId: 'swarm',
    flavor: 'Marla swears she has never seen one. Marla is lying.',
  },
  {
    floor: 2,
    id: 'mould-speaker',
    name: 'Mould Speaker',
    archetypeId: 'caster',
    flavor: 'Something in the damp has learned three words and is very pleased about it.',
  },
  {
    floor: 3,
    id: 'bottle-glass-seer',
    name: 'Bottle-Glass Seer',
    archetypeId: 'caster',
    flavor: 'Reads futures in broken green glass. Yours is short.',
  },
  {
    floor: 4,
    id: 'barrel-gnawer',
    name: 'Barrel Gnawer',
    archetypeId: 'skirmisher',
    flavor: 'It got into the good ale and it is not sorry.',
  },
  {
    floor: 5,
    id: 'whiskerbone-priest',
    name: 'Whiskerbone Priest',
    archetypeId: 'caster',
    flavor: 'Preaching to a congregation you cannot see, and can definitely hear.',
    signature: {
      label: 'The Congregation',
      explainer:
        'Every third round the flock answers its sermon, and a flock is not something you parry. Finish the sermon.',
      proc: { kind: 'swarm-call', everyRounds: 3, damageShare: 0.5 },
    },
  },
  {
    floor: 6,
    id: 'the-tithe-taker',
    name: 'The Tithe-Taker',
    archetypeId: 'skirmisher',
    flavor: 'Collects a coin from everyone who passes. Everyone.',
  },
  {
    floor: 7,
    id: 'tallow-fed-brute',
    name: 'Tallow-Fed Brute',
    archetypeId: 'bruiser',
    flavor: 'Years of dripped candle fat, made ambulatory.',
  },
  {
    floor: 8,
    id: 'grease-drowned-hound',
    name: 'Grease-Drowned Hound',
    archetypeId: 'bruiser',
    flavor: 'It was a good dog once. It is still very loyal, to something else.',
  },
  {
    floor: 9,
    id: 'the-cellarer',
    name: 'The Cellarer',
    archetypeId: 'tank',
    flavor: 'Wears a soup pot. Has opinions about trespassers.',
  },
  {
    floor: 10,
    id: 'cellar-king-riddletail',
    name: 'Cellar King Riddletail',
    archetypeId: 'tank',
    flavor: 'Crowned in bottle caps, and every bit as serious about it as you would expect.',
    signature: {
      label: 'Rat Swarm',
      explainer:
        'Riddletail whistles up the swarm every third round. It goes through armour and around everything else.',
      proc: { kind: 'swarm-call', everyRounds: 3, damageShare: 0.85 },
    },
  },
];

/* ── Barrowdeep Crypt ────────────────────────────────────────────────────────────── */

const BARROWDEEP: readonly DungeonFloorDef[] = [
  {
    floor: 1,
    id: 'the-choir-below',
    name: 'The Choir Below',
    archetypeId: 'swarm',
    flavor: 'Beautiful, actually. That is the problem.',
  },
  {
    floor: 2,
    id: 'pale-mourner',
    name: 'Pale Mourner',
    archetypeId: 'caster',
    flavor: 'Weeping for someone who has been dead four hundred years.',
  },
  {
    floor: 3,
    id: 'corpse-candle',
    name: 'Corpse Candle',
    archetypeId: 'caster',
    flavor: 'It goes ahead of you, helpfully. You should not follow it.',
  },
  {
    floor: 4,
    id: 'graverobbers-ghost',
    name: 'Graverobber’s Ghost',
    archetypeId: 'skirmisher',
    flavor: 'Came down here for the same reason you did.',
  },
  {
    floor: 5,
    id: 'countess-thin',
    name: 'Countess Thin',
    archetypeId: 'caster',
    flavor: 'Starved herself pale on purpose. It worked, in the worst way.',
    signature: {
      label: 'Cold Communion',
      explainer:
        'Every swing that fails to land — blocked, dodged or wide — feeds her a little. Stop missing.',
      proc: { kind: 'siphon', healShare: 0.05 },
    },
  },
  {
    floor: 6,
    id: 'grave-sexton',
    name: 'Grave Sexton',
    archetypeId: 'skirmisher',
    flavor: 'Still doing the rounds. Nobody has told him.',
  },
  {
    floor: 7,
    id: 'barrow-hound',
    name: 'Barrow Hound',
    archetypeId: 'bruiser',
    flavor: 'Buried at its master’s feet, and not remotely finished.',
  },
  {
    floor: 8,
    id: 'the-last-heir',
    name: 'The Last Heir',
    archetypeId: 'bruiser',
    flavor: 'Inherited everything, including this.',
  },
  {
    floor: 9,
    id: 'ossuary-warden',
    name: 'Ossuary Warden',
    archetypeId: 'tank',
    flavor: 'Counts the bones every night. Notices at once when one is missing.',
  },
  {
    floor: 10,
    id: 'the-pale-margrave',
    name: 'The Pale Margrave',
    archetypeId: 'tank',
    flavor: 'He has been holding court down here since before the town had a name.',
    signature: {
      label: 'Pale Communion',
      explainer:
        'The Margrave drinks every failed swing — blocked, dodged or wide — and mends by eight percent. A patient fight is a losing one.',
      proc: { kind: 'siphon', healShare: 0.08 },
    },
  },
];

/* ── Emberdeep Foundry ───────────────────────────────────────────────────────────── */

const EMBERDEEP: readonly DungeonFloorDef[] = [
  {
    floor: 1,
    id: 'the-quenching-pool',
    name: 'The Quenching Pool',
    archetypeId: 'swarm',
    flavor: 'Whatever went in came out in pieces, and the pieces learned to swim.',
  },
  {
    floor: 2,
    id: 'cinder-wisp',
    name: 'Cinder Wisp',
    archetypeId: 'caster',
    flavor: 'Follows you at a polite distance. Getting warmer.',
  },
  {
    floor: 3,
    id: 'runegraver',
    name: 'The Runegraver',
    archetypeId: 'caster',
    flavor: 'Carving something into the wall. It is nearly finished.',
  },
  {
    floor: 4,
    id: 'deepshaft-warden',
    name: 'Deepshaft Warden',
    archetypeId: 'skirmisher',
    flavor: 'Knows every gallery down here. Has been letting you take the long way.',
  },
  {
    floor: 5,
    id: 'foreman-korrig',
    name: 'Foreman Korrig',
    archetypeId: 'bruiser',
    flavor: 'Never finished his shift. Takes a very dim view of anyone who might.',
    signature: {
      label: 'Cooling Iron',
      explainer:
        'His plate thickens every round he is kept standing. Hit hard and hit early — a long fight is his fight.',
      proc: { kind: 'hardening', perRound: 0.015, cap: 0.1 },
    },
  },
  {
    floor: 6,
    id: 'slag-walker',
    name: 'Slag Walker',
    archetypeId: 'tank',
    flavor: 'Poured, cooled, and got up.',
  },
  {
    floor: 7,
    id: 'the-pour',
    name: 'The Pour',
    archetypeId: 'bruiser',
    flavor: 'A ladle’s worth of the old work, walking.',
  },
  {
    floor: 8,
    id: 'the-last-casting',
    name: 'The Last Casting',
    archetypeId: 'bruiser',
    flavor: 'Whatever they were making when the fires went out, this is it.',
  },
  {
    floor: 9,
    id: 'bellows-thrall',
    name: 'Bellows-Thrall',
    archetypeId: 'tank',
    flavor: 'Still pumping air into a forge that went out a century ago. It will not be stopped.',
  },
  {
    floor: 10,
    id: 'foundry-tyrant-vulkarr',
    name: 'Foundry Tyrant Vulkarr',
    archetypeId: 'tank',
    flavor: 'The last thing the dwarves made, and the only one still working.',
    signature: {
      label: 'Living Forge',
      explainer:
        'Vulkarr cools into his own armour — two more points of it every round, to a ceiling. Whatever you are going to do, do it now.',
      proc: { kind: 'hardening', perRound: 0.02, cap: 0.16 },
    },
  },
];

const DUNGEON_LIST = [
  {
    id: 'rat-cellars',
    name: 'The Rat Cellars',
    tagline: 'Under the Tankard, and deeper than anyone admits.',
    gateLevel: 10,
    keyId: 'rusty-key',
    keyName: 'Rusty Key',
    levelBase: 12,
    levelStep: 2,
    trophy: { id: 'crown-of-caps', name: 'Crown of Caps' },
    backdrop: BG,
    tint: 'from-wood-900 via-wood-700/40 to-wood-900/60',
    floors: RAT_CELLARS,
  },
  {
    id: 'barrowdeep',
    name: 'Barrowdeep Crypt',
    tagline: 'The old families are still at home.',
    gateLevel: 25,
    keyId: 'bone-key',
    keyName: 'Bone Key',
    levelBase: 28,
    levelStep: 3,
    trophy: { id: 'margraves-signet', name: 'The Margrave’s Signet' },
    backdrop: BG,
    tint: 'from-wood-900 via-arcane-500/25 to-wood-900/70',
    floors: BARROWDEEP,
  },
  {
    id: 'emberdeep',
    name: 'Emberdeep Foundry',
    tagline: 'The fires were banked, not put out.',
    gateLevel: 55,
    keyId: 'brand-key',
    keyName: 'Brand Key',
    levelBase: 55,
    levelStep: 4,
    trophy: { id: 'tyrants-brand', name: 'The Tyrant’s Brand' },
    backdrop: BG,
    tint: 'from-wood-900 via-ember-500/30 to-wood-900/65',
    floors: EMBERDEEP,
  },
] as const satisfies readonly DungeonDef[];

export const DUNGEONS: readonly DungeonDef[] = DUNGEON_LIST;

export const DUNGEONS_BY_ID: Readonly<Record<DungeonId, DungeonDef>> = Object.fromEntries(
  DUNGEONS.map((entry) => [entry.id, entry]),
) as Record<DungeonId, DungeonDef>;

export function dungeon(id: DungeonId): DungeonDef {
  return DUNGEONS_BY_ID[id];
}

export function dungeonById(id: string): DungeonDef | null {
  return DUNGEONS.find((entry) => entry.id === id) ?? null;
}

/** The monster on a given floor. Null for a floor that does not exist. */
export function floorDef(id: DungeonId, floor: number): DungeonFloorDef | null {
  return dungeon(id).floors.find((entry) => entry.floor === floor) ?? null;
}

/**
 * The level of a floor's monster — fixed, and the reason a dungeon is a benchmark.
 *
 * A mission monster is drawn at the player's level; this one is not. Floor 7 of the Rat Cellars
 * is level 26 for everybody, forever, which is what lets the hub say "you are four levels short"
 * and mean it.
 */
export function floorLevel(id: DungeonId, floor: number): number {
  const definition = dungeon(id);
  return definition.levelBase + Math.max(1, Math.min(FLOORS_PER_DUNGEON, floor)) * definition.levelStep;
}

/** Every key in the game, in the order the doors open. */
export const DUNGEON_KEYS: readonly DungeonKeyId[] = DUNGEONS.map((entry) => entry.keyId);

export function dungeonForKey(keyId: string): DungeonDef | null {
  return DUNGEONS.find((entry) => entry.keyId === keyId) ?? null;
}
