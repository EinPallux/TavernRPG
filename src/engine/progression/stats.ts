/**
 * Attribute training — the game's primary gold sink (balancing §3).
 *
 * Points are bought with gold at a per-attribute rising price, so gold never stops mattering
 * and there is no build to brick: every purchase is a permanent, additive improvement.
 *
 * Pure module.
 */

export const ATTRIBUTE_IDS = ['str', 'dex', 'int', 'con', 'lck'] as const;
export type AttributeId = (typeof ATTRIBUTE_IDS)[number];
export type Attributes = Record<AttributeId, number>;

export const ATTRIBUTE_LABELS: Readonly<Record<AttributeId, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  int: 'Intelligence',
  con: 'Constitution',
  lck: 'Luck',
};

export const ATTRIBUTE_BLURBS: Readonly<Record<AttributeId, string>> = {
  str: 'Damage for Warriors.',
  dex: 'Damage for Hunters and Swashbucklers.',
  int: 'Damage for Mages and Bards.',
  con: 'Health for everyone.',
  lck: 'Critical hit chance.',
};

/** `[TUNE]` — statCost(n) = round(2 + 0.6·n^1.65) gold for the n-th point of one attribute. */
const COST_BASE = 2;
const COST_COEFFICIENT = 0.6;
const COST_EXPONENT = 1.65;

/**
 * Gold price of the next point, where `owned` is how many points of that attribute have been
 * *bought* — gear, pets and set bonuses never make training more expensive.
 */
export function statCost(owned: number): number {
  const n = Math.max(0, Math.floor(owned));
  return Math.round(COST_BASE + COST_COEFFICIENT * n ** COST_EXPONENT);
}

/** Total gold to buy `count` more points starting from `owned`. */
export function statCostFor(owned: number, count: number): number {
  let total = 0;
  for (let i = 0; i < Math.max(0, Math.floor(count)); i += 1) {
    total += statCost(owned + i);
  }
  return total;
}

export interface AffordablePurchase {
  /** How many points the gold covers. */
  readonly points: number;
  /** What they cost in total. */
  readonly cost: number;
}

/**
 * The largest purchase `gold` can cover, for the "Max" button.
 * Walks point by point — prices rise per point, so there is no closed form, and the loop is
 * bounded by a sanity cap in case of absurd gold values.
 */
export function maxAffordable(owned: number, gold: number, cap = 10_000): AffordablePurchase {
  let points = 0;
  let cost = 0;

  while (points < cap) {
    const next = statCost(owned + points);
    if (cost + next > gold) break;
    cost += next;
    points += 1;
  }

  return { points, cost };
}

export function emptyAttributes(): Attributes {
  return { str: 0, dex: 0, int: 0, con: 0, lck: 0 };
}

export function addAttributes(a: Attributes, b: Partial<Attributes>): Attributes {
  return {
    str: a.str + (b.str ?? 0),
    dex: a.dex + (b.dex ?? 0),
    int: a.int + (b.int ?? 0),
    con: a.con + (b.con ?? 0),
    lck: a.lck + (b.lck ?? 0),
  };
}
