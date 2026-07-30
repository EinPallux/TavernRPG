/**
 * Turning a Golden Die into a card (gacha spec §4–§5).
 *
 * One function, `rollBanner`, and everything the room does goes through it. It is pure: the
 * caller hands it a snapshot of what the player owns and an `RngStream`, and gets back a
 * `GachaResult` describing what happened — including what the *pity* and *track* counters now
 * are. Nothing is applied here; `state/gachaActions.ts` does the applying, the same split every
 * other system in the game uses.
 *
 * Three rules worth stating outright, because each is the difference between a gacha that is
 * honest and one that merely looks it:
 *
 * 1. **Pity is checked before the roll**, exactly as the forge's ember meter is. A floor that
 *    only pays out when the dice would have failed anyway is not a floor.
 * 2. **Featured is missing-first.** A featured hit draws from the pieces of that set the player
 *    does *not* have; only when the set is complete does it produce a duplicate, and a duplicate
 *    is converted rather than handed over (§5). There is no way to spend a die and get nothing.
 * 3. **The free daily roll does not advance weekly pity** (§3). It is a different banner, so in
 *    practice this falls out for free — but a free roll on the weekly banner would be a slow
 *    way to farm the pity counter, and the guard is written down rather than implied.
 *
 * Pure module.
 */

import type { RngStream } from '@/engine/rng';
import { generateItem, generateSetPiece } from '@/engine/items/generate';
import type { ClassId, Item, MaterialBundle } from '@/engine/items/types';
import { gearSet, type SetSlot } from '@/data/gearSets';
import { goldPerVigor } from '@/engine/progression/rewards';
import {
  DUPE_SHARDS,
  DUPE_STARMETAL,
  GOLD_CACHE_VIGOR,
  MATERIAL_BUNDLES,
  ROLL_OUTCOMES,
  SNAIL_CHANCE,
  GILDED_SNAIL,
  type BannerDef,
  type RollOutcome,
} from '@/data/banners';
import { DAILY_SLOTS, dailySlotWeights, type ActiveBanner } from './schedule';

/** Everything the roll needs to know about the player, and nothing it does not. */
export interface RollContext {
  readonly classId: ClassId;
  readonly level: number;
  /** `setId:slot` for every set piece held anywhere — the missing-first draw reads this. */
  readonly ownedSetPieces: ReadonlySet<string>;
  /** Rolls banked toward this banner's pity. Ignored when the banner has none. */
  readonly pityCount: number;
  /** True when the featured set is the one the pity counter has been following. */
  readonly pityMatchesFeatured: boolean;
  /** Ales already drunk plus held, against the daily cap — a capped Ale pays gold instead (§4). */
  readonly aleCapped: boolean;
  /** Free rolls never advance pity (§3). */
  readonly free?: boolean;
}

export type GachaReward =
  | { readonly kind: 'item'; readonly item: Item }
  | { readonly kind: 'materials'; readonly materials: MaterialBundle }
  | { readonly kind: 'gold'; readonly gold: number }
  | { readonly kind: 'ale' }
  /** A duplicate set piece, melted on the table (§5). */
  | {
      readonly kind: 'dupe';
      readonly setId: string;
      readonly slot: SetSlot;
      readonly materials: MaterialBundle;
      readonly shards: number;
    };

export interface GachaResult {
  readonly outcome: RollOutcome;
  readonly reward: GachaReward;
  /** True when the pity counter paid for this rather than the dice. */
  readonly pitied: boolean;
  /** The pity counter after this roll — zero on a featured hit, however it arrived. */
  readonly pityCount: number;
  /** The one-in-a-hundred pet, on top of whatever else happened (pets spec §1). */
  readonly snail: boolean;
  /** What the room says about it, so the reveal and the history log agree. */
  readonly label: string;
}

/* ── The outcome roll ────────────────────────────────────────────────────────────── */

/** Draw one of the seven outcomes off a banner's published weights. */
export function rollOutcome(definition: BannerDef, rng: RngStream): RollOutcome {
  return rng.weighted(
    ROLL_OUTCOMES.map((outcome) => ({ value: outcome, weight: definition.odds[outcome] })),
  );
}

/**
 * The featured card.
 *
 * On the weekly and monthly that is a piece of the featured set — a missing one while one is
 * missing, a duplicate (converted) once the set is whole. On the daily it is a Rare in a
 * highlighted slot, which is a smaller promise honestly kept: the daily's rate-up moves *which
 * slot*, never how often "featured" comes up.
 */
function featuredReward(
  active: ActiveBanner,
  context: RollContext,
  rng: RngStream,
): GachaReward | null {
  if (active.definition.id === 'daily') {
    const slot = rng.weighted(
      dailySlotWeights(active.slot ?? DAILY_SLOTS[0]!).map((entry) => ({
        value: entry.slot,
        weight: entry.weight,
      })),
    );
    return {
      kind: 'item',
      item: generateItem({
        slot,
        rarity: 'rare',
        classId: context.classId,
        level: context.level,
        rng: rng.fork('daily-featured'),
      }),
    };
  }

  const definition = active.set;
  if (!definition) return null;

  const missing = definition.pieces.filter(
    (piece) => !context.ownedSetPieces.has(`${definition.id}:${piece.slot}`),
  );

  if (missing.length > 0) {
    const picked = rng.fork('piece').pick(missing);
    const item = generateSetPiece({
      setId: definition.id,
      slot: picked.slot,
      level: context.level,
      rng: rng.fork('make'),
    });
    return item ? { kind: 'item', item } : null;
  }

  // The set is whole. The card still comes up — it is simply melted on the table (§5), which is
  // why this is its own reward kind and its own reveal frame rather than a silent substitution.
  const slot = rng.fork('dupe').pick(definition.pieces).slot;
  return {
    kind: 'dupe',
    setId: definition.id,
    slot,
    materials: { scrap: 0, essence: 0, starmetal: DUPE_STARMETAL },
    shards: DUPE_SHARDS,
  };
}

function consolationReward(
  outcome: Exclude<RollOutcome, 'featured'>,
  context: RollContext,
  rng: RngStream,
): GachaReward {
  switch (outcome) {
    case 'epic':
    case 'rare':
    case 'uncommon':
      return {
        kind: 'item',
        item: generateItem({
          slot: rng.fork('slot').pick(DAILY_SLOTS),
          rarity: outcome,
          classId: context.classId,
          level: context.level,
          rng: rng.fork('item'),
        }),
      };

    case 'materials': {
      const bundle = rng.weighted(
        MATERIAL_BUNDLES.map((entry) => ({ value: entry, weight: entry.weight })),
      );
      return {
        kind: 'materials',
        materials: { scrap: bundle.scrap, essence: bundle.essence, starmetal: bundle.starmetal },
      };
    }

    case 'gold':
      return {
        kind: 'gold',
        gold: Math.round(GOLD_CACHE_VIGOR * goldPerVigor(context.level)),
      };

    case 'ale':
      // A capped Ale is worth nothing, so it pays what an Ale is worth instead (§4). Never a
      // dead card — that is the one rule this table has to keep.
      return context.aleCapped
        ? { kind: 'gold', gold: Math.round(GOLD_CACHE_VIGOR * goldPerVigor(context.level) * 0.6) }
        : { kind: 'ale' };
  }
}

/** What the reveal and the history log both call it. */
function labelFor(reward: GachaReward): string {
  switch (reward.kind) {
    case 'item':
      return reward.item.name;
    case 'materials':
      return 'A bundle of stock';
    case 'gold':
      return 'A cache of gold';
    case 'ale':
      return 'A tankard of Ale';
    case 'dupe':
      return `${gearSet(reward.setId)?.name ?? 'A set piece'}, melted`;
  }
}

/**
 * One roll.
 *
 * Deterministic in the stream it is handed, so the same die spent on the same roll index
 * produces the same card — which is what lets the ceremony animate a result the save already
 * holds, exactly as the forge's anvil does.
 */
export function rollBanner(
  active: ActiveBanner,
  context: RollContext,
  rng: RngStream,
): GachaResult {
  const { definition } = active;

  // Pity first (rule 1). It only applies to the counter's own set: switching weeks does not
  // reset the counter, but it does stop it paying until that set is back on the table (§4).
  const pityReady =
    definition.pity > 0 && context.pityMatchesFeatured && context.pityCount >= definition.pity;

  const outcome: RollOutcome = pityReady ? 'featured' : rollOutcome(definition, rng.fork('table'));

  const reward =
    outcome === 'featured'
      ? (featuredReward(active, context, rng.fork('featured')) ??
        consolationReward('epic', context, rng.fork('fallback')))
      : consolationReward(outcome, context, rng.fork('consolation'));

  // A featured hit clears the counter however it arrived; everything else banks one. Free rolls
  // bank nothing (rule 3).
  const banked = context.free ? context.pityCount : context.pityCount + 1;
  const pityCount = outcome === 'featured' ? 0 : banked;

  return {
    outcome,
    reward,
    pitied: pityReady,
    pityCount,
    snail: definition.id === 'monthly' && rng.fork('snail').bool(SNAIL_CHANCE),
    label: labelFor(reward),
  };
}

export { GILDED_SNAIL };
