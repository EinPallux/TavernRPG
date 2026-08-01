/**
 * Schools of arms — what each fighter's blows look like (combat spec §4 step 2).
 *
 * The spec has asked for "slash arc / **magic flare per class**" since Phase 4, and what shipped
 * was two sprite sets: one for a hit and one for a crit. Every fighter in Emberhollow therefore
 * threw identical sparks — a Mage's bolt and a Tank's shoulder-charge were the same twelve orange
 * specks, which is the single largest reason the stage read as a health-bar simulator with a
 * backdrop rather than as a fight.
 *
 * A **school** is the whole visual grammar of one fighter's offence: what gathers before the blow,
 * what crosses the gap, what happens where it lands, and in what colour. There are ten, keyed on
 * `CombatantCard.kind` — the five class names and the five archetype names, which is every value
 * that field can hold (`combatVfx.test.ts` proves it, so a sixth class cannot ship unpainted).
 *
 * ## Why this is data and not ten branches in the particle layer
 *
 * The same argument as `data/gearSets.ts`: thirty bonuses would have been thirty branches in
 * `fight()` and are instead a list of named levers. Ten schools would be ten branches in a canvas
 * draw loop; they are instead ten records the loop reads. Adding a sixth class is a change to this
 * file. Only a genuinely new *behaviour* — a beam that persists, a ground effect — costs work in
 * `ParticleLayer`.
 *
 * ## The one rule that keeps it honest
 *
 * **A school is a look, never a number.** Nothing here reaches the resolver, so no amount of
 * re-painting can change who wins. `fight()` does not import this file and cannot: it is content,
 * and content in this codebase is data with a schema test.
 *
 * Pure module — no React, no DOM. Runs in Node.
 */

/** Where the Kenney CC0 pack lives (asset-pipeline §1). Sprite names are relative to it. */
export const VFX_SPRITE_ROOT = '/assets/vfx/kenney-particles/PNG (Transparent)';

export const SCHOOL_IDS = [
  'steel',
  'song',
  'arcane',
  'arrow',
  'blades',
  'beast',
  'venom',
  'hex',
  'stone',
  'chitin',
] as const;
export type SchoolId = (typeof SCHOOL_IDS)[number];

/**
 * One puff of particles.
 *
 * `cone` is the interesting field. A burst sprayed evenly in every direction reads as an
 * explosion, which is right for a fireball and wrong for a sword: a blow has a *direction*, and
 * throwing its sparks away from the fighter who swung is most of what makes a hit look like it
 * came from someone. Zero means a full bloom; anything smaller is a fan pointed downrange.
 */
export interface VfxBurst {
  readonly sprites: readonly string[];
  readonly count: number;
  /** Centre of the speed range, px/s. Each particle varies around it. */
  readonly speed: number;
  /** Fan width in radians, aimed along the blow. 0 for a full 360° bloom. */
  readonly cone: number;
  /** Sprite edge length in px, before the per-particle jitter. */
  readonly size: number;
  readonly life: number;
  /** px/s². Sparks fall; smoke and motes drift up on a negative one. */
  readonly gravity: number;
  /** Which of the palette's two tints this burst wears. */
  readonly tint: 'core' | 'glow' | 'spark';
}

/** A projectile crossing the stage, for the schools that do not close the distance. */
export interface VfxTravel {
  readonly sprites: readonly string[];
  readonly size: number;
  /** Radians per second. A spinning bolt reads as magic; an arrow must not spin. */
  readonly spin: number;
  /** Height of the flight path as a share of the gap, 0 for a flat bolt. */
  readonly arc: number;
  /** Motes shed along the flight. `every` is in units of flight progress, so speed is irrelevant. */
  readonly trail: {
    readonly sprites: readonly string[];
    readonly every: number;
    readonly size: number;
    readonly life: number;
  } | null;
}

export interface CombatSchool {
  readonly id: SchoolId;
  /** Shown in `/dev/battle`, never in the game — the fight explains itself by looking right. */
  readonly label: string;
  /**
   * Does this fighter close the distance, or plant and throw?
   *
   * The whole difference between a duel and a duel *with a wizard in it*. A melee school lunges
   * on the attack beat; a ranged one braces, gathers its cast and sends something across the gap
   * that arrives exactly as the beat ends and the damage lands.
   */
  readonly melee: boolean;
  /** Lunge amplitude in px for a melee school; the brace-back distance for a ranged one. */
  readonly lunge: number;
  readonly palette: {
    readonly core: string;
    readonly glow: string;
    readonly spark: string;
  };
  /** Gathering before the blow. Null for schools that simply swing. */
  readonly cast: VfxBurst | null;
  readonly travel: VfxTravel | null;
  readonly impact: VfxBurst;
  readonly crit: VfxBurst;
}

/* ── The palettes ─────────────────────────────────────────────────────────────────
 *
 * Every colour is a design token (`globals.css`), not a hand-picked hex. Two consequences worth
 * knowing: the fight cannot drift away from the rest of Emberhollow, and the one deliberate
 * asymmetry below is legible rather than accidental — **the player's magic is teal and the
 * monsters' is red.** A caster's hex and a Mage's bolt are the same shape at a glance, and in a
 * fast exchange the colour is the only thing telling you which way the damage is going.
 */
const AMBER = { core: '#e8a33d', glow: '#f7d9a3', spark: '#f0b862' } as const;
const TEAL = { core: '#3fa7a0', glow: '#f2e8cb', spark: '#3fa7a0' } as const;
const MOSS = { core: '#6cae58', glow: '#f2e8cb', spark: '#4c7a3f' } as const;
const BLOOD = { core: '#a73a2e', glow: '#e0655a', spark: '#e0655a' } as const;
const EMBER = { core: '#d96c2f', glow: '#f0895a', spark: '#f0895a' } as const;
const BONE = { core: '#e8d9b0', glow: '#f2e8cb', spark: '#e8a33d' } as const;

const SCHOOL_LIST: readonly CombatSchool[] = [
  /* ── The five classes ─────────────────────────────────────────────────────── */

  {
    id: 'steel',
    label: 'Steel — the Warrior',
    melee: true,
    lunge: 46,
    palette: AMBER,
    cast: null,
    travel: null,
    // Heavy and low: a broad arc, sparks thrown downrange and falling hard, because the fantasy
    // is weight. The Warrior is the school every other one is legible *against*.
    impact: {
      sprites: ['slash_01.png', 'slash_02.png', 'spark_01.png', 'spark_05.png'],
      count: 14,
      speed: 150,
      cone: 1.5,
      size: 24,
      life: 460,
      gravity: 520,
      tint: 'spark',
    },
    crit: {
      sprites: ['slash_03.png', 'slash_04.png', 'flare_01.png', 'star_08.png', 'spark_06.png'],
      count: 26,
      speed: 235,
      cone: 2.1,
      size: 36,
      life: 720,
      gravity: 420,
      tint: 'glow',
    },
  },

  {
    id: 'song',
    label: 'Song — the Bard',
    melee: true,
    lunge: 34,
    palette: TEAL,
    // The only melee school with a cast: the Bard's blow lands on a note, so something rings
    // before it connects. Rising rather than falling — sound goes up.
    cast: {
      sprites: ['symbol_01.png', 'symbol_02.png', 'star_04.png'],
      count: 5,
      speed: 46,
      cone: 0,
      size: 20,
      life: 420,
      gravity: -80,
      tint: 'core',
    },
    travel: null,
    impact: {
      sprites: ['star_02.png', 'star_04.png', 'twirl_01.png', 'light_01.png'],
      count: 12,
      speed: 130,
      cone: 1.8,
      size: 22,
      life: 540,
      gravity: -60,
      tint: 'core',
    },
    crit: {
      sprites: ['twirl_02.png', 'twirl_03.png', 'star_06.png', 'light_03.png', 'symbol_02.png'],
      count: 22,
      speed: 200,
      cone: 0,
      size: 34,
      life: 780,
      gravity: -110,
      tint: 'core',
    },
  },

  {
    id: 'arcane',
    label: 'Arcane — the Mage',
    melee: false,
    lunge: 18,
    palette: TEAL,
    cast: {
      sprites: ['magic_01.png', 'magic_04.png', 'star_03.png'],
      count: 9,
      speed: 70,
      cone: 0,
      size: 20,
      life: 380,
      gravity: -40,
      tint: 'core',
    },
    travel: {
      sprites: ['magic_05.png'],
      size: 44,
      spin: 5.2,
      arc: 0.16,
      trail: { sprites: ['magic_02.png', 'star_01.png'], every: 0.055, size: 20, life: 320 },
    },
    impact: {
      sprites: ['magic_03.png', 'star_05.png', 'light_02.png', 'circle_02.png'],
      count: 16,
      speed: 165,
      cone: 0,
      size: 26,
      life: 560,
      gravity: 60,
      tint: 'core',
    },
    crit: {
      sprites: ['magic_05.png', 'flare_01.png', 'light_03.png', 'star_09.png', 'window_02.png'],
      count: 28,
      speed: 250,
      cone: 0,
      size: 40,
      life: 820,
      gravity: 30,
      tint: 'core',
    },
  },

  {
    id: 'arrow',
    label: 'Arrow — the Hunter',
    melee: false,
    lunge: 12,
    palette: MOSS,
    // A muzzle flash at the loose rather than a gathering: the Hunter's power is already stored
    // in the draw, so what the player sees is the release.
    cast: {
      sprites: ['muzzle_02.png', 'muzzle_04.png'],
      count: 3,
      speed: 90,
      cone: 0.9,
      size: 30,
      life: 200,
      gravity: 0,
      tint: 'glow',
    },
    travel: {
      // Flat, fast and *unspun* — an arrow that tumbles is a thrown stick.
      //
      // Sized up from 34/14 after the canvas probe in `e2e/battle.spec.ts` measured it at 53 lit
      // pixels mid-gap against the Mage's 436. An arrow should be the *thinnest* thing that
      // crosses the stage, not an invisible one, and the probe is the only thing on this project
      // that can tell the difference — a screenshot at 90ms intervals kept missing it entirely.
      sprites: ['trace_01.png'],
      size: 44,
      spin: 0,
      arc: 0.05,
      trail: { sprites: ['trace_06.png'], every: 0.05, size: 20, life: 240 },
    },
    impact: {
      sprites: ['scratch_01.png', 'spark_04.png', 'trace_03.png'],
      count: 11,
      speed: 175,
      cone: 1.1,
      size: 20,
      life: 420,
      gravity: 560,
      tint: 'spark',
    },
    crit: {
      sprites: ['scratch_01.png', 'star_07.png', 'spark_07.png', 'flare_01.png'],
      count: 22,
      speed: 265,
      cone: 1.4,
      size: 30,
      life: 640,
      gravity: 480,
      tint: 'glow',
    },
  },

  {
    id: 'blades',
    label: 'Blades — the Swashbuckler',
    melee: true,
    lunge: 52,
    palette: BONE,
    cast: null,
    travel: null,
    // Many small fast slashes rather than one big one: the Flurry is the class's whole identity
    // and a follow-up strike has to look like part of a *rhythm*.
    impact: {
      sprites: ['slash_02.png', 'slash_04.png', 'spark_02.png', 'spark_03.png'],
      count: 16,
      speed: 195,
      cone: 1.2,
      size: 17,
      life: 340,
      gravity: 300,
      tint: 'spark',
    },
    crit: {
      sprites: ['slash_01.png', 'slash_03.png', 'star_07.png', 'spark_06.png', 'flare_01.png'],
      count: 28,
      speed: 285,
      cone: 1.7,
      size: 26,
      life: 560,
      gravity: 260,
      tint: 'glow',
    },
  },

  /* ── The five monster archetypes ──────────────────────────────────────────── */

  {
    id: 'beast',
    label: 'Beast — the Bruiser',
    melee: true,
    lunge: 44,
    palette: EMBER,
    cast: null,
    travel: null,
    impact: {
      sprites: ['scratch_01.png', 'dirt_01.png', 'dirt_03.png', 'smoke_04.png'],
      count: 13,
      speed: 145,
      cone: 1.6,
      size: 27,
      life: 500,
      gravity: 600,
      tint: 'core',
    },
    crit: {
      sprites: ['scratch_01.png', 'slash_03.png', 'dirt_02.png', 'scorch_02.png', 'smoke_06.png'],
      count: 24,
      speed: 225,
      cone: 2.0,
      size: 38,
      life: 700,
      gravity: 520,
      tint: 'core',
    },
  },

  {
    id: 'venom',
    label: 'Venom — the Skirmisher',
    melee: true,
    lunge: 48,
    palette: MOSS,
    cast: null,
    travel: null,
    impact: {
      sprites: ['smoke_02.png', 'circle_03.png', 'spark_03.png'],
      count: 12,
      speed: 120,
      cone: 1.4,
      size: 22,
      life: 620,
      gravity: -90,
      tint: 'spark',
    },
    crit: {
      sprites: ['smoke_05.png', 'circle_05.png', 'star_03.png', 'twirl_01.png'],
      count: 22,
      speed: 190,
      cone: 1.9,
      size: 33,
      life: 860,
      gravity: -130,
      tint: 'core',
    },
  },

  {
    id: 'hex',
    label: 'Hex — the Caster',
    melee: false,
    lunge: 16,
    palette: BLOOD,
    cast: {
      sprites: ['symbol_01.png', 'magic_02.png', 'circle_04.png'],
      count: 8,
      speed: 62,
      cone: 0,
      size: 22,
      life: 400,
      gravity: -30,
      tint: 'core',
    },
    travel: {
      sprites: ['magic_01.png'],
      size: 40,
      spin: -3.4,
      arc: 0.22,
      trail: { sprites: ['circle_01.png', 'smoke_03.png'], every: 0.06, size: 18, life: 380 },
    },
    impact: {
      sprites: ['magic_03.png', 'scorch_01.png', 'circle_02.png', 'smoke_07.png'],
      count: 15,
      speed: 155,
      cone: 0,
      size: 27,
      life: 620,
      gravity: 40,
      tint: 'glow',
    },
    crit: {
      sprites: ['magic_04.png', 'scorch_03.png', 'window_03.png', 'flare_01.png', 'smoke_09.png'],
      count: 26,
      speed: 235,
      cone: 0,
      size: 40,
      life: 840,
      gravity: 20,
      tint: 'glow',
    },
  },

  {
    id: 'stone',
    label: 'Stone — the Tank',
    melee: true,
    lunge: 30,
    palette: EMBER,
    cast: null,
    travel: null,
    // Slow, few, heavy and falling fast. A tank should look like it costs something to swing.
    impact: {
      sprites: ['dirt_01.png', 'dirt_02.png', 'smoke_08.png', 'spark_01.png'],
      count: 10,
      speed: 115,
      cone: 1.9,
      size: 30,
      life: 560,
      gravity: 700,
      tint: 'core',
    },
    crit: {
      sprites: ['dirt_03.png', 'scorch_02.png', 'smoke_10.png', 'flame_02.png', 'spark_05.png'],
      count: 20,
      speed: 185,
      cone: 2.3,
      size: 44,
      life: 760,
      gravity: 620,
      tint: 'core',
    },
  },

  {
    id: 'chitin',
    label: 'Chitin — the Swarm',
    melee: true,
    lunge: 38,
    palette: BONE,
    cast: null,
    travel: null,
    // The one school defined by *count* rather than size: forty specks the size of a grain, which
    // is the only way "a swarm hit you" reads differently from "something hit you".
    impact: {
      sprites: ['spark_02.png', 'spark_03.png', 'star_01.png'],
      count: 30,
      speed: 165,
      cone: 0,
      size: 10,
      life: 420,
      gravity: 240,
      tint: 'core',
    },
    crit: {
      sprites: ['spark_04.png', 'spark_07.png', 'star_05.png', 'circle_01.png'],
      count: 46,
      speed: 230,
      cone: 0,
      size: 14,
      life: 600,
      gravity: 200,
      tint: 'spark',
    },
  },
];

export const SCHOOLS: Readonly<Record<SchoolId, CombatSchool>> = Object.fromEntries(
  SCHOOL_LIST.map((school) => [school.id, school]),
) as Record<SchoolId, CombatSchool>;

/**
 * `CombatantCard.kind` → school.
 *
 * The keys are exactly the ten strings that field can hold: `classes.ts` sets it to the class
 * `name`, `monsterArchetypes.ts` to the archetype `name`. Keyed on the display name rather than
 * the id because the display name is what the card carries and the card is all the scene gets —
 * `combatVfx.test.ts` derives both lists from their own modules and fails if either drifts.
 */
export const SCHOOL_BY_KIND: Readonly<Record<string, SchoolId>> = {
  Warrior: 'steel',
  Bard: 'song',
  Mage: 'arcane',
  Hunter: 'arrow',
  Swashbuckler: 'blades',
  Bruiser: 'beast',
  Skirmisher: 'venom',
  Caster: 'hex',
  Tank: 'stone',
  Swarm: 'chitin',
};

/**
 * The school for a fighter, by the only identity the battle scene has.
 *
 * Falls back to steel rather than throwing: an unpainted fighter should look ordinary, not crash
 * the showpiece. The census test is what stops the fallback from ever being reached in practice.
 */
export function schoolFor(kind: string): CombatSchool {
  return SCHOOLS[SCHOOL_BY_KIND[kind] ?? 'steel'];
}

/* ── The bursts nobody owns ───────────────────────────────────────────────────────
 *
 * A block looks the same whoever is blocking, because it is a property of the *shield*, not of
 * the attacker's school. Same for a dodge's displaced air, a mend and a set bonus firing. Four
 * shared bursts rather than four per school: forty records would have been forty chances for one
 * to be wrong, and none of them would have told the player anything the shared one does not.
 */

export const BLOCK_BURST: VfxBurst = {
  sprites: ['spark_01.png', 'star_07.png', 'light_01.png'],
  count: 10,
  speed: 135,
  cone: 1.3,
  size: 20,
  life: 360,
  gravity: 420,
  tint: 'spark',
};

export const DODGE_BURST: VfxBurst = {
  sprites: ['smoke_01.png', 'smoke_03.png', 'circle_01.png'],
  count: 8,
  speed: 70,
  cone: 0,
  size: 24,
  life: 480,
  gravity: -40,
  tint: 'glow',
};

export const HEAL_BURST: VfxBurst = {
  sprites: ['star_02.png', 'light_01.png', 'circle_02.png'],
  count: 12,
  speed: 80,
  cone: 0,
  size: 18,
  life: 700,
  // The only burst in the file that rises hard, and the only one that needs to: a heal reads as
  // the opposite of a hit or the player watches a boss drink their swing and thinks they are winning.
  gravity: -190,
  tint: 'core',
};

export const PROC_BURST: VfxBurst = {
  sprites: ['star_06.png', 'light_02.png', 'twirl_01.png', 'circle_03.png'],
  count: 14,
  speed: 120,
  cone: 0,
  size: 22,
  life: 620,
  gravity: -50,
  tint: 'core',
};

/** The eight set effects, in the colour each one means (gear-sets spec §3). */
export const PROC_PALETTE = {
  reflect: AMBER,
  lifesteal: BLOOD,
  absorb: TEAL,
  counter: AMBER,
  shred: EMBER,
  'third-strike': BONE,
  execute: BLOOD,
  'verse-heal': MOSS,
} as const satisfies Record<string, { core: string; glow: string; spark: string }>;

export type ProcEffect = keyof typeof PROC_PALETTE;

/** The palettes a shared burst can be drawn in, so the layer never invents a colour. */
export const SHARED_PALETTE = { block: AMBER, dodge: BONE, heal: MOSS } as const;

/** Every sprite this module can ask for — the preload list, and what the census test checks. */
export function allVfxSprites(): readonly string[] {
  const names = new Set<string>();
  const eat = (burst: VfxBurst | null) => burst?.sprites.forEach((name) => names.add(name));

  for (const school of SCHOOL_LIST) {
    eat(school.cast);
    eat(school.impact);
    eat(school.crit);
    school.travel?.sprites.forEach((name) => names.add(name));
    school.travel?.trail?.sprites.forEach((name) => names.add(name));
  }
  for (const burst of [BLOCK_BURST, DODGE_BURST, HEAL_BURST, PROC_BURST]) eat(burst);

  return [...names].sort();
}
