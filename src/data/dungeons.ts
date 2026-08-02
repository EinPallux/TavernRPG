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

export type DungeonId =
  | 'rat-cellars'
  | 'barrowdeep'
  | 'emberdeep'
  // ── Below the Foundry: the two the far country opened ──────────────────────────
  | 'drowned-vault'
  | 'sunless-court'
  // ── Below everything: where the named arms were made ───────────────────────────
  | 'sundered-anvil';

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

export type DungeonKeyId =
  'rusty-key' | 'bone-key' | 'brand-key' | 'sluice-key' | 'seal-of-court' | 'anvil-shard';

const BG = '/assets/backgrounds/dungeons_background.webp';

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

/**
 * The Drowned Vault — below the Foundry, where the water table finally wins.
 *
 * Floors 97 to 142, for a hero past 85. Both bosses **siphon**, which is the rule rather than a
 * choice: floor five teaches a dungeon's mechanic and floor ten tests it, so a player who walls at
 * the bottom can name what beat them (`dungeons.test.ts` asserts the pair).
 *
 * The archetype order is the same ladder all five dungeons walk — swarm, caster, caster,
 * skirmisher, caster, skirmisher, bruiser, bruiser, tank, tank. That is not decoration either:
 * archetype is worth more difficulty than six floors of the level curve, so an order picked on
 * flavour makes a dungeon that gets easier in the middle. The first draft of this one did, and
 * the ramp test caught it at floor four.
 */
const DROWNED_VAULT: readonly DungeonFloorDef[] = [
  {
    floor: 1,
    id: 'sluicegate-shoal',
    name: 'Sluicegate Shoal',
    archetypeId: 'swarm',
    flavor: 'Something got in when the sluice failed. Several somethings.',
  },
  {
    floor: 2,
    id: 'the-ledgerkeeper',
    name: 'The Ledgerkeeper',
    archetypeId: 'caster',
    flavor: 'Still counting what was stored here. It does not care for a discrepancy.',
  },
  {
    floor: 3,
    id: 'the-tidewright',
    name: 'The Tidewright',
    archetypeId: 'caster',
    flavor: 'Built the sluices, regrets the sluices, is doing something about the sluices.',
  },
  {
    floor: 4,
    id: 'vaultline-eel',
    name: 'Vaultline Eel',
    archetypeId: 'skirmisher',
    flavor: 'Uses the flooded corridors as a run. You are standing in the run.',
  },
  {
    floor: 5,
    id: 'the-drowned-assessor',
    name: 'The Drowned Assessor',
    archetypeId: 'caster',
    flavor: 'Came to value the contents four hundred years ago and has not filed yet.',
    signature: {
      label: 'The Assessment',
      explainer:
        'He keeps what he takes off you — every blow he lands puts him back on his feet. The door at the bottom does this harder.',
      proc: { kind: 'siphon', healShare: 0.09 },
    },
  },
  {
    floor: 6,
    id: 'deadlight-lantern',
    name: 'Deadlight Lantern',
    archetypeId: 'skirmisher',
    flavor: 'A lamp bobbing ahead of you at exactly your walking pace.',
  },
  {
    floor: 7,
    id: 'brackwater-brute',
    name: 'Brackwater Brute',
    archetypeId: 'bruiser',
    flavor: 'Grew up down here, in the dark, on whatever came down the pipe.',
  },
  {
    floor: 8,
    id: 'coffer-mimic',
    name: 'Coffer Mimic',
    archetypeId: 'bruiser',
    flavor: 'A strongbox with opinions, most of them about being opened.',
  },
  {
    floor: 9,
    id: 'the-bulkhead',
    name: 'The Bulkhead',
    archetypeId: 'tank',
    flavor:
      'It has been holding the sea back since the Foundry was warm. It resents the interruption.',
  },
  {
    floor: 10,
    id: 'the-vault-itself',
    name: 'The Vault Itself',
    archetypeId: 'tank',
    flavor: 'The door was the guardian all along, and it has decided to stop being a door.',
    signature: {
      label: 'Deep Draw',
      explainer:
        'It drinks what it takes and stands taller for it. Burst it down — every round you spend, it spends better.',
      proc: { kind: 'siphon', healShare: 0.12 },
    },
  },
];

/**
 * The Sunless Court — deeper again, and the thing The Hollow Crown is only the memory of.
 *
 * Floors 148 to 202: the bottom of the game as it currently stands.
 *
 * Its ladder climbs a rung earlier than the shallower dungeons — two skirmishers before the
 * mid-boss, bruisers straight after it, three tanks to close. That is not flavour: a boss is
 * worth roughly two levels of ordinary floor, and at level 177 two levels is more than a level
 * step can absorb, so the floor after a boss has to step *up* in archetype rather than sideways.
 * The Rat Cellars get away with the flat ladder because two levels at level 22 is a lot.
 *
 * Both bosses **swarm-call**,
 * and the throne's is the hardest in the game at a full share — the first mechanic a player ever
 * met, back on floor five of the Rat Cellars, turned up as far as it goes.
 */
const SUNLESS_COURT: readonly DungeonFloorDef[] = [
  {
    floor: 1,
    id: 'the-antechamber-host',
    name: 'The Antechamber Host',
    archetypeId: 'swarm',
    flavor: 'Somebody is always waiting to be seen. Nine hundred somebodies.',
  },
  {
    floor: 2,
    id: 'protocol-adept',
    name: 'Protocol Adept',
    archetypeId: 'caster',
    flavor: 'You have entered incorrectly. It intends to correct you.',
  },
  {
    floor: 3,
    id: 'gallery-stalker',
    name: 'Gallery Stalker',
    archetypeId: 'skirmisher',
    flavor: 'Runs the long gallery, and knows which portraits are hung wrong.',
  },
  {
    floor: 4,
    id: 'the-understair-thing',
    name: 'The Understair Thing',
    archetypeId: 'skirmisher',
    flavor: 'Lives below the last stair. There is not supposed to be a below.',
  },
  {
    floor: 5,
    id: 'lord-chamberlain-vess',
    name: 'Lord Chamberlain Vess',
    archetypeId: 'caster',
    flavor: 'He announces the name of everyone who enters. He has just announced yours.',
    signature: {
      label: 'Announced',
      explainer:
        'Every third round he says your name and the room agrees — a share of his blow lands again from behind you. The throne below does this harder.',
      proc: { kind: 'swarm-call', everyRounds: 3, damageShare: 0.55 },
    },
  },
  {
    floor: 6,
    id: 'regalia-animate',
    name: 'Regalia Animate',
    archetypeId: 'bruiser',
    flavor: 'Crown, sceptre and orb, and nobody at all wearing them.',
  },
  {
    floor: 7,
    id: 'the-lord-marshal',
    name: 'The Lord Marshal',
    archetypeId: 'bruiser',
    flavor: 'Commanded the last army this place ever fielded. Has not been relieved.',
  },
  {
    floor: 8,
    id: 'the-perpetual-mourner',
    name: 'The Perpetual Mourner',
    archetypeId: 'tank',
    flavor: 'Weeping for a king who is arguably still in the room, and not to be moved from it.',
  },
  {
    floor: 9,
    id: 'the-standing-guard',
    name: 'The Standing Guard',
    archetypeId: 'tank',
    flavor: 'Has not moved in six centuries. Is about to.',
  },
  {
    floor: 10,
    id: 'the-sunless-throne',
    name: 'The Sunless Throne',
    archetypeId: 'tank',
    flavor: 'Nobody sits here. That is not at all the same as it being empty.',
    signature: {
      label: 'The Court Rises',
      explainer:
        'Every third round the whole court stands with it and the answering blow is nearly a second attack — the hardest call in the game. Do not still be there at round nine.',
      proc: { kind: 'swarm-call', everyRounds: 3, damageShare: 1.0 },
    },
  },
];

/* ── The Sundered Anvil ───────────────────────────────────────────────────────────
 *
 * The sixth door, and the one the Legendary tier comes out of (`legendaries.md` §5). Where
 * Aldenvale's named arms were made, and unmade — which is also why Torvald can re-roll one at the
 * Emberforge: he is working from what this place gives up.
 *
 * Ten floors and two bosses, on the same ladder as the other five. A Legendary Dungeon of a
 * *different shape* — an endless descent, say — would be fighting the delve engine, the album's
 * derived pages and this file's ramp test all at once, and the novelty of the tier belongs in the
 * tier.
 *
 * Its signature is `harden`: the anvil's work does not hit harder, it becomes harder to hurt.
 * Floor 5 teaches it and floor 10 tests it, the rule every dungeon here keeps.
 */

const SUNDERED_ANVIL: readonly DungeonFloorDef[] = [
  {
    floor: 1,
    id: 'slag-swarm',
    name: 'Slag Swarm',
    archetypeId: 'swarm',
    flavor: 'What ran off the moulds, and kept running.',
  },
  {
    floor: 2,
    id: 'the-quench-warden',
    name: 'The Quench Warden',
    archetypeId: 'caster',
    flavor: 'Tends a trough that has not been filled in four hundred years, very carefully.',
  },
  {
    floor: 3,
    id: 'pattern-wraith',
    name: 'Pattern Wraith',
    archetypeId: 'caster',
    flavor: 'The shape a blade is drawn as, before anybody makes it.',
  },
  {
    floor: 4,
    id: 'the-half-struck',
    name: 'The Half-Struck',
    archetypeId: 'skirmisher',
    flavor: 'Finished on one side. Extremely aware of the other.',
  },
  {
    floor: 5,
    id: 'the-tempering-master',
    name: 'The Tempering Master',
    archetypeId: 'caster',
    flavor: 'Every blow you land, he counts, and writes down, and learns.',
    signature: {
      label: 'Tempering',
      explainer:
        'Every round he takes, his armour thickens a little more, and it does not come back off. The anvil below does this twice as fast — bring the fight to an end.',
      proc: { kind: 'hardening', perRound: 0.01, cap: 0.09 },
    },
  },
  {
    floor: 6,
    id: 'the-billet',
    name: 'The Billet',
    archetypeId: 'skirmisher',
    flavor: 'A bar of something the Foundry could not cut. It has opinions about being cut.',
  },
  {
    floor: 7,
    id: 'the-owners-mark',
    name: "The Owner's Mark",
    archetypeId: 'bruiser',
    flavor: 'Every named blade was stamped. The stamp resents having been left behind.',
  },
  {
    floor: 8,
    id: 'kingsmourn-unfinished',
    name: 'Kingsmourn, Unfinished',
    archetypeId: 'bruiser',
    flavor: 'The blade they were making when the news arrived. It never got a hilt.',
  },
  {
    floor: 9,
    id: 'the-last-apprentice',
    name: 'The Last Apprentice',
    archetypeId: 'tank',
    flavor: 'Told to hold the door while the masters finished. Did.',
  },
  {
    floor: 10,
    id: 'the-sundered-anvil',
    name: 'The Sundered Anvil',
    archetypeId: 'tank',
    flavor: 'It broke making the last one. It has been getting harder ever since.',
    signature: {
      label: 'The Anvil Sets',
      explainer:
        'Every round it survives, it sets a little further, and nothing you do takes that back. This is a race, and the anvil is patient.',
      proc: { kind: 'hardening', perRound: 0.018, cap: 0.16 },
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
  {
    id: 'drowned-vault',
    name: 'The Drowned Vault',
    tagline: 'The Foundry had a cellar. The cellar has a tide.',
    gateLevel: 85,
    keyId: 'sluice-key',
    keyName: 'Sluice Key',
    levelBase: 92,
    levelStep: 5,
    trophy: { id: 'assessors-seal', name: 'The Assessor’s Seal' },
    backdrop: BG,
    tint: 'from-wood-900 via-arcane-500/32 to-wood-900/70',
    floors: DROWNED_VAULT,
  },
  {
    id: 'sunless-court',
    name: 'The Sunless Court',
    tagline: 'Still in session, and you have just been announced.',
    gateLevel: 130,
    keyId: 'seal-of-court',
    keyName: 'Seal of Court',
    levelBase: 142,
    levelStep: 6,
    trophy: { id: 'sunless-diadem', name: 'The Sunless Diadem' },
    backdrop: BG,
    tint: 'from-wood-900 via-blood-600/26 to-amber-500/12',
    floors: SUNLESS_COURT,
  },
  {
    id: 'sundered-anvil',
    name: 'The Sundered Anvil',
    tagline: 'Where the named blades were made. Some of them are still angry.',
    gateLevel: 165,
    keyId: 'anvil-shard',
    keyName: 'Anvil Shard',
    levelBase: 178,
    levelStep: 7,
    trophy: { id: 'the-cold-hammer', name: 'The Cold Hammer' },
    backdrop: BG,
    tint: 'from-wood-900 via-ember-600/34 to-blood-600/20',
    floors: SUNDERED_ANVIL,
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
  return (
    definition.levelBase + Math.max(1, Math.min(FLOORS_PER_DUNGEON, floor)) * definition.levelStep
  );
}

/** Every key in the game, in the order the doors open. */
export const DUNGEON_KEYS: readonly DungeonKeyId[] = DUNGEONS.map((entry) => entry.keyId);

export function dungeonForKey(keyId: string): DungeonDef | null {
  return DUNGEONS.find((entry) => entry.keyId === keyId) ?? null;
}
