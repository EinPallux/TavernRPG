import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, hashString, restoreRng } from './rng';

describe('rng — determinism', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 20 }, createRng(1).next);
    const b = Array.from({ length: 20 }, createRng(2).next);
    expect(a).not.toEqual(b);
  });

  it('is frozen against regression (golden values for seed 42)', () => {
    // If this fails, the RNG changed and every committed seed in every save now
    // resolves differently. That is a breaking change, not a test to update lightly.
    const rng = createRng(42);
    const drawn = Array.from({ length: 5 }, () => rng.next());
    expect(drawn.map((n) => n.toFixed(10))).toMatchSnapshot();
  });

  it('resumes exactly from a snapshot', () => {
    const rng = createRng(999);
    Array.from({ length: 7 }, () => rng.next());
    const snapshot = rng.snapshot();
    const expected = Array.from({ length: 5 }, () => rng.next());

    const resumed = restoreRng(snapshot);
    expect(Array.from({ length: 5 }, () => resumed.next())).toEqual(expected);
  });

  it('survives a JSON round-trip of its snapshot (saves store these)', () => {
    const original = createRng(7, 'combat:7');
    Array.from({ length: 3 }, () => original.next());

    const revived = restoreRng(
      JSON.parse(JSON.stringify(original.snapshot())) as ReturnType<typeof original.snapshot>,
    );

    // Both streams must now yield identical continuations.
    expect(Array.from({ length: 5 }, () => revived.next())).toEqual(
      Array.from({ length: 5 }, () => original.next()),
    );
    expect(revived.name).toBe('combat:7');
    expect(revived.seed).toBe(7);
  });
});

describe('rng — forking', () => {
  it('forks are stable regardless of how much the parent has drawn', () => {
    const parentA = createRng(500);
    const childA = parentA.fork('shop:2026-07-29');

    const parentB = createRng(500);
    Array.from({ length: 250 }, () => parentB.next()); // parent used heavily first
    const childB = parentB.fork('shop:2026-07-29');

    expect(Array.from({ length: 10 }, () => childA.next())).toEqual(
      Array.from({ length: 10 }, () => childB.next()),
    );
  });

  it('different fork names yield different streams', () => {
    const parent = createRng(500);
    const shop = parent.fork('shop');
    const gacha = parent.fork('gacha');
    expect(Array.from({ length: 10 }, () => shop.next())).not.toEqual(
      Array.from({ length: 10 }, () => gacha.next()),
    );
  });

  it('carries a readable stream name for debugging', () => {
    expect(createRng(1, 'root').fork('mission:88').name).toBe('root/mission:88');
  });
});

describe('rng — helpers', () => {
  it('int() covers both bounds inclusively and never exceeds them', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.int(1, 6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('int() handles a single-value range and rejects an empty one', () => {
    const rng = createRng(4);
    expect(rng.int(5, 5)).toBe(5);
    expect(() => rng.int(6, 5)).toThrow(/empty range/);
  });

  it('bool() honours edge probabilities exactly', () => {
    const rng = createRng(5);
    expect(rng.bool(0)).toBe(false);
    expect(rng.bool(1)).toBe(true);
  });

  it('bool() approximates the requested probability', () => {
    const rng = createRng(6);
    const hits = Array.from({ length: 20_000 }, () => rng.bool(0.25)).filter(Boolean).length;
    expect(hits / 20_000).toBeCloseTo(0.25, 2);
  });

  it('pick() throws on an empty list', () => {
    expect(() => createRng(7).pick([])).toThrow(/empty list/);
  });

  it('weighted() respects the weights', () => {
    const rng = createRng(8);
    const table = [
      { value: 'common', weight: 90 },
      { value: 'rare', weight: 10 },
      { value: 'never', weight: 0 },
    ];
    const counts = { common: 0, rare: 0, never: 0 };
    for (let i = 0; i < 20_000; i += 1) {
      counts[rng.weighted(table) as keyof typeof counts] += 1;
    }
    expect(counts.never).toBe(0);
    expect(counts.rare / 20_000).toBeCloseTo(0.1, 2);
  });

  it('weighted() rejects unusable tables', () => {
    const rng = createRng(9);
    expect(() => rng.weighted([])).toThrow(/empty table/);
    expect(() => rng.weighted([{ value: 'x', weight: 0 }])).toThrow(/total weight/);
    expect(() => rng.weighted([{ value: 'x', weight: -1 }])).toThrow(/invalid weight/);
  });

  it('shuffle() permutes without mutating the input', () => {
    const rng = createRng(10);
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle(source);
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(source);
  });

  it('shuffle() is unbiased enough (each element reaches each position)', () => {
    const rng = createRng(11);
    const positions = new Map<number, Set<number>>();
    for (let i = 0; i < 2000; i += 1) {
      rng.shuffle([0, 1, 2, 3]).forEach((value, index) => {
        const set = positions.get(value) ?? new Set<number>();
        set.add(index);
        positions.set(value, set);
      });
    }
    for (const set of positions.values()) {
      expect(set.size).toBe(4);
    }
  });
});

describe('rng — seed derivation', () => {
  it('hashString is stable and order-sensitive', () => {
    expect(hashString('tavern')).toBe(hashString('tavern'));
    expect(hashString('tavern')).not.toBe(hashString('nrevat'));
  });

  it('deriveSeed mixes parts deterministically', () => {
    expect(deriveSeed(1, 'shop', '2026-07-29')).toBe(deriveSeed(1, 'shop', '2026-07-29'));
    expect(deriveSeed(1, 'shop', '2026-07-29')).not.toBe(deriveSeed(1, 'shop', '2026-07-30'));
    expect(deriveSeed(1, 'a', 'b')).not.toBe(deriveSeed(1, 'b', 'a'));
  });

  it('produces unsigned 32-bit seeds', () => {
    const seed = deriveSeed(-1, 'x');
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});
