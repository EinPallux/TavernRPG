/**
 * The sound of Emberhollow, as recipes (asset-pipeline.md §6).
 *
 * **Synthesized, not sampled.** The plan named CC0 packs; this environment cannot reach them, and
 * rather than ship silence the cues are written as oscillator recipes and built at play time by
 * the Web Audio API. That turned out to be the better answer on three counts: the whole sound
 * design is about two kilobytes of data instead of twenty files, there is no attribution to keep
 * in step with a licence, and a cue is *editable* — "the coin is too bright" is a number here
 * rather than a request to whoever made the sample. Swapping in real samples later is a change to
 * the player, not to any caller: every screen asks for `play('coin')` and does not care how.
 *
 * A cue is layers. Each layer is one oscillator (or a burst of noise) with a frequency slide and
 * an attack/decay envelope, and stacking two or three is what stops them sounding like a 1980s
 * calculator: a coin is a bright ping over a short metallic click, a crit is a low thump under a
 * rising whistle.
 *
 * **Everything is short**, and the interface is shortest. No cue runs past 900ms, and the four
 * that fire on every click and hover are all under 150 — a game that plays a two-second flourish
 * when you touch a button is a game people mute. Both ceilings are asserted in `sfx.test.ts`
 * rather than left as an intention, because the cue that breaks them will be written by someone
 * who is pleased with it.
 *
 * Pure data module — no Web Audio, no DOM. `state/sfx.ts` is what actually makes noise.
 */

export const SFX_IDS = [
  // ── Interface ────────────────────────────────────────────────────────────────
  'tick',
  'select',
  'panel',
  'refuse',
  // ── Coin and commerce ────────────────────────────────────────────────────────
  'coin',
  'dice',
  'buy',
  'sell',
  // ── The forge ────────────────────────────────────────────────────────────────
  'anvil',
  'smelt',
  // ── A fight ──────────────────────────────────────────────────────────────────
  'hit',
  'crit',
  'block',
  'dodge',
  'miss',
  'ko',
  'victory',
  'defeat',
  // ── Reveals ──────────────────────────────────────────────────────────────────
  'loot',
  'loot-rare',
  'loot-epic',
  'card',
  // ── Progress ─────────────────────────────────────────────────────────────────
  'level-up',
  'unlock',
] as const;
export type SfxId = (typeof SFX_IDS)[number];

/**
 * Cue families, which is how throttling works.
 *
 * A battle at ×4 can ask for eight hits in a second and the UI can fire a tick per pointer move.
 * Throttling *per family* rather than globally means a crit landing during a flurry of ticks
 * still gets heard — the thing the player is watching is never suppressed by the thing they are
 * only touching.
 */
export type SfxCategory = 'ui' | 'combat' | 'reward' | 'forge';

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

export interface SfxLayer {
  readonly wave: Waveform;
  /** Hz at the start of the layer. */
  readonly from: number;
  /** Hz at the end — equal to `from` for a steady tone, higher or lower for a slide. */
  readonly to: number;
  /** Seconds. */
  readonly duration: number;
  /** Seconds to reach full loudness. Short is a click, long is a swell. */
  readonly attack: number;
  /** Seconds to wait before this layer starts, for cues built out of two beats. */
  readonly delay?: number;
  /** Layer loudness, 0–1, before the cue's own gain and the player's volume. */
  readonly gain: number;
  /** Low-pass cutoff in Hz. Noise without one is a hiss; with one it is a thud. */
  readonly filter?: number;
}

export interface SfxDef {
  readonly id: SfxId;
  readonly category: SfxCategory;
  /** Overall loudness, 0–1. The mix lives here so no caller ever passes a volume. */
  readonly gain: number;
  readonly layers: readonly SfxLayer[];
}

const SFX_LIST = [
  /* ── Interface ─────────────────────────────────────────────────────────────── */
  {
    id: 'tick',
    category: 'ui',
    gain: 0.1,
    layers: [{ wave: 'sine', from: 1400, to: 1200, duration: 0.03, attack: 0.002, gain: 1 }],
  },
  {
    id: 'select',
    category: 'ui',
    gain: 0.16,
    layers: [
      { wave: 'triangle', from: 620, to: 880, duration: 0.07, attack: 0.004, gain: 1 },
      { wave: 'sine', from: 1240, to: 1760, duration: 0.05, attack: 0.004, gain: 0.35 },
    ],
  },
  {
    id: 'panel',
    category: 'ui',
    gain: 0.13,
    layers: [
      { wave: 'noise', from: 0, to: 0, duration: 0.12, attack: 0.01, gain: 0.5, filter: 900 },
      { wave: 'triangle', from: 300, to: 420, duration: 0.1, attack: 0.008, gain: 0.6 },
    ],
  },
  {
    // Refusals are *low and short*, never a buzzer. The button already said why.
    id: 'refuse',
    category: 'ui',
    gain: 0.16,
    layers: [{ wave: 'square', from: 180, to: 120, duration: 0.11, attack: 0.004, gain: 0.55 }],
  },

  /* ── Coin and commerce ─────────────────────────────────────────────────────── */
  {
    id: 'coin',
    category: 'reward',
    gain: 0.2,
    layers: [
      { wave: 'sine', from: 1970, to: 2640, duration: 0.09, attack: 0.002, gain: 0.8 },
      { wave: 'sine', from: 2640, to: 3140, duration: 0.07, attack: 0.002, delay: 0.04, gain: 0.5 },
      { wave: 'noise', from: 0, to: 0, duration: 0.03, attack: 0.001, gain: 0.25, filter: 6000 },
    ],
  },
  {
    // The premium currency gets the prettier sound. Three notes, up.
    id: 'dice',
    category: 'reward',
    gain: 0.22,
    layers: [
      { wave: 'triangle', from: 880, to: 880, duration: 0.08, attack: 0.004, gain: 0.7 },
      {
        wave: 'triangle',
        from: 1108,
        to: 1108,
        duration: 0.08,
        attack: 0.004,
        delay: 0.07,
        gain: 0.7,
      },
      {
        wave: 'triangle',
        from: 1318,
        to: 1480,
        duration: 0.22,
        attack: 0.006,
        delay: 0.14,
        gain: 0.8,
      },
    ],
  },
  {
    id: 'buy',
    category: 'reward',
    gain: 0.18,
    layers: [
      { wave: 'sine', from: 520, to: 780, duration: 0.12, attack: 0.005, gain: 0.8 },
      { wave: 'noise', from: 0, to: 0, duration: 0.05, attack: 0.002, gain: 0.2, filter: 3000 },
    ],
  },
  {
    id: 'sell',
    category: 'reward',
    gain: 0.18,
    layers: [
      { wave: 'sine', from: 780, to: 520, duration: 0.12, attack: 0.005, gain: 0.8 },
      { wave: 'sine', from: 1560, to: 1900, duration: 0.06, attack: 0.002, delay: 0.06, gain: 0.3 },
    ],
  },

  /* ── The forge ─────────────────────────────────────────────────────────────── */
  {
    // Torvald's hammer: a hard transient, then the ring that follows it.
    id: 'anvil',
    category: 'forge',
    gain: 0.3,
    layers: [
      { wave: 'noise', from: 0, to: 0, duration: 0.05, attack: 0.001, gain: 0.9, filter: 2200 },
      { wave: 'square', from: 220, to: 140, duration: 0.09, attack: 0.001, gain: 0.5 },
      {
        wave: 'sine',
        from: 2100,
        to: 1900,
        duration: 0.55,
        attack: 0.004,
        delay: 0.02,
        gain: 0.35,
      },
    ],
  },
  {
    id: 'smelt',
    category: 'forge',
    gain: 0.22,
    layers: [
      { wave: 'noise', from: 0, to: 0, duration: 0.6, attack: 0.12, gain: 0.7, filter: 1400 },
      { wave: 'sawtooth', from: 150, to: 90, duration: 0.5, attack: 0.1, gain: 0.25, filter: 600 },
    ],
  },

  /* ── A fight ───────────────────────────────────────────────────────────────── */
  {
    id: 'hit',
    category: 'combat',
    gain: 0.24,
    layers: [
      { wave: 'noise', from: 0, to: 0, duration: 0.07, attack: 0.001, gain: 0.8, filter: 1800 },
      { wave: 'square', from: 160, to: 90, duration: 0.08, attack: 0.001, gain: 0.4 },
    ],
  },
  {
    // A crit has to be *recognisably* a hit plus something, or the scene reads as noise.
    id: 'crit',
    category: 'combat',
    gain: 0.32,
    layers: [
      { wave: 'noise', from: 0, to: 0, duration: 0.1, attack: 0.001, gain: 0.9, filter: 2600 },
      { wave: 'square', from: 200, to: 70, duration: 0.14, attack: 0.001, gain: 0.5 },
      { wave: 'sine', from: 900, to: 2400, duration: 0.22, attack: 0.004, delay: 0.02, gain: 0.4 },
    ],
  },
  {
    id: 'block',
    category: 'combat',
    gain: 0.24,
    layers: [
      { wave: 'noise', from: 0, to: 0, duration: 0.05, attack: 0.001, gain: 0.6, filter: 3400 },
      { wave: 'sine', from: 1500, to: 1300, duration: 0.3, attack: 0.002, gain: 0.45 },
    ],
  },
  {
    id: 'dodge',
    category: 'combat',
    gain: 0.18,
    layers: [
      { wave: 'noise', from: 0, to: 0, duration: 0.14, attack: 0.03, gain: 0.5, filter: 5200 },
    ],
  },
  {
    id: 'miss',
    category: 'combat',
    gain: 0.14,
    layers: [{ wave: 'sine', from: 420, to: 260, duration: 0.1, attack: 0.006, gain: 0.5 }],
  },
  {
    id: 'ko',
    category: 'combat',
    gain: 0.3,
    layers: [
      { wave: 'noise', from: 0, to: 0, duration: 0.22, attack: 0.002, gain: 0.7, filter: 900 },
      {
        wave: 'sawtooth',
        from: 180,
        to: 40,
        duration: 0.35,
        attack: 0.002,
        gain: 0.4,
        filter: 700,
      },
    ],
  },
  {
    id: 'victory',
    category: 'reward',
    gain: 0.26,
    layers: [
      { wave: 'triangle', from: 523, to: 523, duration: 0.14, attack: 0.006, gain: 0.7 },
      {
        wave: 'triangle',
        from: 659,
        to: 659,
        duration: 0.14,
        attack: 0.006,
        delay: 0.11,
        gain: 0.7,
      },
      {
        wave: 'triangle',
        from: 784,
        to: 784,
        duration: 0.16,
        attack: 0.006,
        delay: 0.22,
        gain: 0.75,
      },
      {
        wave: 'triangle',
        from: 1046,
        to: 1046,
        duration: 0.42,
        attack: 0.008,
        delay: 0.33,
        gain: 0.8,
      },
    ],
  },
  {
    // Losing costs the Vigor and nothing else, and the sound says so — a soft fall, not a fail.
    id: 'defeat',
    category: 'combat',
    gain: 0.2,
    layers: [
      { wave: 'triangle', from: 392, to: 392, duration: 0.18, attack: 0.01, gain: 0.6 },
      {
        wave: 'triangle',
        from: 311,
        to: 294,
        duration: 0.5,
        attack: 0.02,
        delay: 0.16,
        gain: 0.55,
      },
    ],
  },

  /* ── Reveals ───────────────────────────────────────────────────────────────── */
  {
    id: 'loot',
    category: 'reward',
    gain: 0.18,
    layers: [{ wave: 'sine', from: 700, to: 1050, duration: 0.14, attack: 0.006, gain: 0.7 }],
  },
  {
    id: 'loot-rare',
    category: 'reward',
    gain: 0.22,
    layers: [
      { wave: 'sine', from: 700, to: 1050, duration: 0.14, attack: 0.006, gain: 0.7 },
      { wave: 'sine', from: 1400, to: 2100, duration: 0.3, attack: 0.01, delay: 0.08, gain: 0.4 },
    ],
  },
  {
    // The Epic reveal is the one cue allowed to take its time — it happens rarely enough to earn
    // it, and it is the cue that sets the 900ms ceiling the rest of the family is measured against.
    id: 'loot-epic',
    category: 'reward',
    gain: 0.28,
    layers: [
      { wave: 'sine', from: 300, to: 900, duration: 0.5, attack: 0.14, gain: 0.55 },
      {
        wave: 'triangle',
        from: 1046,
        to: 1318,
        duration: 0.55,
        attack: 0.1,
        delay: 0.2,
        gain: 0.5,
      },
      { wave: 'sine', from: 2093, to: 2637, duration: 0.6, attack: 0.16, delay: 0.3, gain: 0.3 },
    ],
  },
  {
    id: 'card',
    category: 'reward',
    gain: 0.16,
    layers: [
      { wave: 'noise', from: 0, to: 0, duration: 0.09, attack: 0.004, gain: 0.55, filter: 4200 },
    ],
  },

  /* ── Progress ──────────────────────────────────────────────────────────────── */
  {
    id: 'level-up',
    category: 'reward',
    gain: 0.3,
    layers: [
      { wave: 'triangle', from: 523, to: 523, duration: 0.12, attack: 0.005, gain: 0.7 },
      {
        wave: 'triangle',
        from: 784,
        to: 784,
        duration: 0.12,
        attack: 0.005,
        delay: 0.1,
        gain: 0.7,
      },
      {
        wave: 'triangle',
        from: 1046,
        to: 1046,
        duration: 0.5,
        attack: 0.008,
        delay: 0.2,
        gain: 0.85,
      },
      { wave: 'sine', from: 2093, to: 2093, duration: 0.5, attack: 0.05, delay: 0.2, gain: 0.25 },
    ],
  },
  {
    id: 'unlock',
    category: 'reward',
    gain: 0.24,
    layers: [
      { wave: 'noise', from: 0, to: 0, duration: 0.08, attack: 0.002, gain: 0.4, filter: 2000 },
      {
        wave: 'triangle',
        from: 440,
        to: 880,
        duration: 0.28,
        attack: 0.01,
        delay: 0.04,
        gain: 0.7,
      },
    ],
  },
] as const satisfies readonly SfxDef[];

export const SFX: readonly SfxDef[] = SFX_LIST;

/**
 * A `Map`, not an object literal.
 *
 * `Object.fromEntries` inherits `Object.prototype`, so the plain-object version of this answered
 * `sfx('constructor')` with the `Object` constructor — which `state/sfx.ts` would then have read
 * `.layers` off and iterated. Callers are typed now and cannot ask for that, but a lookup keyed
 * on a string should not have opinions about which strings are special.
 */
const BY_ID = new Map<string, SfxDef>(SFX.map((entry) => [entry.id, entry]));

export function sfx(id: string): SfxDef | null {
  return BY_ID.get(id) ?? null;
}

/**
 * `[TUNE]` Shortest gap between two cues of the same family, in ms.
 *
 * Combat is the loosest because the scene is *meant* to be busy; UI is the tightest because a
 * pointer sweeping a list can ask for thirty ticks a second and nobody wants thirty ticks.
 */
export const THROTTLE_MS: Readonly<Record<SfxCategory, number>> = {
  ui: 45,
  combat: 30,
  reward: 60,
  forge: 80,
};

/**
 * Which reveal a rarity has earned.
 *
 * Three cues for five rarities, deliberately: the *sound* is how a player knows something good
 * happened before they have read the card, and five gradations of "good" are not distinguishable
 * across a laptop speaker. Common and uncommon share the plain chime, rare gets the shimmer, and
 * epic and set share the long one — which is also the only cue in the game over half a second,
 * so hearing it means something even from the next room.
 *
 * Takes a string rather than importing `Rarity`: this module is content, and a data module
 * reaching into the engine's item types to name a sound would be the wrong direction.
 */
export function lootCue(rarity: string): SfxId {
  if (rarity === 'epic' || rarity === 'set' || rarity === 'legendary') return 'loot-epic';
  if (rarity === 'rare') return 'loot-rare';
  return 'loot';
}

/** How long a cue actually lasts — the longest layer, delay included. */
export function cueLength(definition: SfxDef): number {
  return definition.layers.reduce(
    (longest, layer) => Math.max(longest, (layer.delay ?? 0) + layer.duration),
    0,
  );
}
