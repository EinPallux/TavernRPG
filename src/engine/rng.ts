/**
 * Seeded random number streams — the only sanctioned source of randomness in the game.
 *
 * Everything that rolls dice (loot, missions, shops, gacha, combat, the world simulation)
 * draws from a *named* stream derived from a committed seed, so the same inputs always
 * produce the same outcome on any machine and no result can be re-rolled by reloading.
 * See docs/tech/architecture.md §4.
 *
 * Algorithm: sfc32 (fast, small state, good statistical quality), seeded through splitmix32.
 * All arithmetic is 32-bit integer work, so Node and browsers produce identical sequences.
 */

export type Seed = number;

/** Serializable stream position — lets a stream be stored and resumed mid-sequence. */
export interface RngSnapshot {
  readonly name: string;
  readonly seed: Seed;
  readonly state: readonly [number, number, number, number];
}

export interface WeightedEntry<T> {
  readonly value: T;
  readonly weight: number;
}

export interface RngStream {
  /** Human-readable stream name, e.g. `combat:8412`. Useful in logs and test failures. */
  readonly name: string;
  /** The seed this stream was derived from. */
  readonly seed: Seed;
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** True with the given probability (0–1, default 0.5). */
  bool(chance?: number): boolean;
  /** Uniform pick from a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** Weighted pick; weights need not sum to 1. */
  weighted<T>(entries: readonly WeightedEntry<T>[]): T;
  /** Fisher–Yates shuffle returning a new array (input untouched). */
  shuffle<T>(items: readonly T[]): T[];
  /**
   * Derive a child stream. The child depends only on this stream's seed and the child
   * name — never on how many numbers the parent has already drawn — so forks are stable
   * regardless of call order, and forking the same name twice yields the same sequence.
   */
  fork(childName: string): RngStream;
  /** Current position, for persistence. */
  snapshot(): RngSnapshot;
}

/** FNV-1a, 32-bit. Stable across platforms; used to turn stream names into seeds. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mix a seed with arbitrary parts into a new seed (e.g. `deriveSeed(worldSeed, 'shop', dayKey)`). */
export function deriveSeed(seed: Seed, ...parts: readonly (string | number)[]): Seed {
  let mixed = seed >>> 0;
  for (const part of parts) {
    const partHash = typeof part === 'number' ? part >>> 0 : hashString(part);
    mixed = (Math.imul(mixed ^ partHash, 0x9e3779b1) + 0x7f4a7c15) >>> 0;
  }
  return mixed >>> 0;
}

function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

function initialState(seed: Seed): [number, number, number, number] {
  const gen = splitmix32(seed >>> 0);
  return [gen(), gen(), gen(), gen()];
}

function makeStream(
  name: string,
  seed: Seed,
  state: readonly [number, number, number, number],
): RngStream {
  let [a, b, c, d] = state;

  const nextUint32 = (): number => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    let t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    t = t >>> 0;
    return t;
  };

  const next = (): number => nextUint32() / 4294967296;

  const stream: RngStream = {
    name,
    seed,
    next,

    int(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new RangeError(`rng(${name}).int: bounds must be finite, got ${min}..${max}`);
      }
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      if (hi < lo) {
        throw new RangeError(`rng(${name}).int: empty range ${min}..${max}`);
      }
      return lo + Math.floor(next() * (hi - lo + 1));
    },

    float(min, max) {
      return min + next() * (max - min);
    },

    bool(chance = 0.5) {
      if (chance <= 0) return false;
      if (chance >= 1) return true;
      return next() < chance;
    },

    pick(items) {
      if (items.length === 0) {
        throw new RangeError(`rng(${name}).pick: cannot pick from an empty list`);
      }
      // Non-null assertion is safe: index is bounded by the length check above.
      return items[Math.floor(next() * items.length)]!;
    },

    weighted(entries) {
      if (entries.length === 0) {
        throw new RangeError(`rng(${name}).weighted: cannot pick from an empty table`);
      }
      let total = 0;
      for (const entry of entries) {
        if (entry.weight < 0 || !Number.isFinite(entry.weight)) {
          throw new RangeError(`rng(${name}).weighted: invalid weight ${entry.weight}`);
        }
        total += entry.weight;
      }
      if (total <= 0) {
        throw new RangeError(`rng(${name}).weighted: total weight must be > 0`);
      }
      let roll = next() * total;
      for (const entry of entries) {
        roll -= entry.weight;
        if (roll < 0) return entry.value;
      }
      // Floating-point tail: fall back to the last entry with a non-zero weight.
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i]!;
        if (entry.weight > 0) return entry.value;
      }
      throw new RangeError(`rng(${name}).weighted: no entry with positive weight`);
    },

    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const left = copy[i]!;
        const right = copy[j]!;
        copy[i] = right;
        copy[j] = left;
      }
      return copy;
    },

    fork(childName) {
      const forkedName = `${name}/${childName}`;
      return createRng(deriveSeed(seed, 'fork', childName), forkedName);
    },

    snapshot() {
      return { name, seed, state: [a >>> 0, b >>> 0, c >>> 0, d >>> 0] as const };
    },
  };

  return stream;
}

/** Create a fresh stream from a seed. */
export function createRng(seed: Seed, name = 'root'): RngStream {
  return makeStream(name, seed >>> 0, initialState(seed));
}

/** Resume a stream from a persisted snapshot, continuing exactly where it left off. */
export function restoreRng(snapshot: RngSnapshot): RngStream {
  return makeStream(snapshot.name, snapshot.seed, [...snapshot.state] as [
    number,
    number,
    number,
    number,
  ]);
}
