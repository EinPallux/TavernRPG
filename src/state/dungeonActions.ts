/**
 * The Undertavern, as save-to-save transitions (dungeons spec §2).
 *
 * Same contract as `missionActions` and `guildActions`: every function takes a `SaveFile` and
 * returns a new one, and none of them reads a clock or a store. The room does the drawing; this
 * does the deciding.
 *
 * One transition carries the whole loop — `descend` fights the floor in front of the player and
 * applies everything that follows from it: XP and gold, drops into the bags, the trophy, the
 * cooldown on a loss, the best-attempt bar either way. There is no accept, no timer and no
 * queue to model, because a delve has none.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { addItem as addItemToHero } from '@/engine/hero/actions';
import { generateItem } from '@/engine/items/generate';
import type { Item } from '@/engine/items/types';
import { applyXp } from '@/engine/progression/xp';
import {
  LOSS_COOLDOWN_MS,
  currentFloor,
  checkDelve,
  delve as runDelve,
  emptyProgress,
  type DelveOutcome,
  type DelveRefusal,
  type DungeonProgress,
} from '@/engine/dungeons/delve';
import { buildFloorCombatant, floorPayout } from '@/engine/dungeons/floors';
import { keyInPlay } from '@/engine/dungeons/keys';
import type { Hero, SaveFile } from '@/engine/save/schema';
import { guildBonus } from './guildActions';
import {
  DUNGEONS,
  FLOORS_PER_DUNGEON,
  dungeon,
  floorDef,
  floorLevel,
  isBossFloor,
  type DungeonDef,
  type DungeonId,
} from '@/data/dungeons';

export type { DelveRefusal, DungeonProgress };
export { LOSS_COOLDOWN_MS };

/** One dungeon's state, reconciled from the save. Never stored in this shape. */
export function progressOf(save: SaveFile, id: DungeonId): DungeonProgress {
  const stored = save.dungeons.progress[id];
  if (!stored) return emptyProgress();

  // A stored `bestAttempts` is always ten long — the schema says so — but a save hand-edited by
  // the dev drawer is not, and a short array here would silently shorten the hub's bars.
  const bestAttempts = Array.from(
    { length: FLOORS_PER_DUNGEON },
    (_unused, index) => stored.bestAttempts[index] ?? 0,
  );
  return { ...stored, bestAttempts };
}

export function hasKey(save: SaveFile, id: DungeonId): boolean {
  return save.dungeons.keys.includes(dungeon(id).keyId);
}

/** Everything a door in the hub needs to draw itself. */
export interface DoorView {
  readonly definition: DungeonDef;
  readonly progress: DungeonProgress;
  readonly hasKey: boolean;
  /** The floor waiting behind the door, or null once all ten are behind it. */
  readonly floor: number | null;
  readonly floorLevel: number | null;
  readonly floorName: string | null;
  readonly isBoss: boolean;
  /** How much health the current floor's monster has, so a best attempt reads as damage. */
  readonly floorHealth: number;
  /** What the next floor pays, so the door is a decision rather than a mystery. */
  readonly reward: { readonly gold: number; readonly xp: number } | null;
  /** Null when the player may go down right now; otherwise exactly why not. */
  readonly refusal: DelveRefusal | null;
  readonly cleared: boolean;
}

export function doorViews(save: SaveFile, now: number): readonly DoorView[] {
  const heroLevel = save.hero?.level ?? 0;
  const bonus = guildBonus(save);

  return DUNGEONS.map((definition) => {
    const progress = progressOf(save, definition.id);
    const floor = currentFloor(progress);
    const combatant = floor === null ? null : buildFloorCombatant(definition.id, floor);

    return {
      definition,
      progress,
      hasKey: hasKey(save, definition.id),
      floor,
      floorLevel: floor === null ? null : floorLevel(definition.id, floor),
      floorName: floor === null ? null : (floorDef(definition.id, floor)?.name ?? null),
      isBoss: floor !== null && isBossFloor(floor),
      floorHealth: combatant?.maxHealth ?? 0,
      reward: floor === null ? null : floorPayout(definition.id, floor, heroLevel, bonus),
      refusal: checkDelve({
        id: definition.id,
        heroLevel,
        hasKey: hasKey(save, definition.id),
        progress,
        now,
      }),
      cleared: floor === null,
    };
  });
}

/** The key currently in the mission drop pool, for the Tavern to hint at. Null when none is. */
export function keyOnOffer(save: SaveFile): DungeonDef | null {
  if (!save.hero) return null;
  return keyInPlay(save.hero.level, save.dungeons.keys);
}

export interface DelveTransition {
  readonly ok: true;
  readonly save: SaveFile;
  readonly outcome: DelveOutcome;
  /** Generated here rather than in the engine, which deals in slots and rarities. */
  readonly items: readonly Item[];
  readonly leveledTo: number | null;
}

export type DelveResult = DelveTransition | { readonly ok: false; readonly refusal: DelveRefusal };

/**
 * Go down one floor.
 *
 * Everything the delve produces is applied here in one pass, including on a loss — the cooldown
 * and the best attempt are both consequences of the fight and both belong in the same write. A
 * caller that granted rewards separately would be a caller that could grant them twice.
 */
export function descend(save: SaveFile, id: DungeonId, now: number): DelveResult {
  const { hero } = save;
  if (!hero) return { ok: false, refusal: { kind: 'no-hero' } };

  const progress = progressOf(save, id);
  const refusal = checkDelve({
    id,
    heroLevel: hero.level,
    hasKey: hasKey(save, id),
    progress,
    now,
  });
  if (refusal) return { ok: false, refusal };

  const outcome = runDelve({
    id,
    hero,
    progress,
    worldSeed: save.worldSeed,
    now,
    bonus: guildBonus(save),
  });
  if (!outcome) return { ok: false, refusal: { kind: 'already-cleared' } };

  const withProgress: SaveFile = {
    ...save,
    dungeons: {
      ...save.dungeons,
      // The engine deals in readonly arrays and the schema in mutable ones; Zod re-validates
      // this on the way to disk, which is what makes the widening safe rather than merely quiet.
      progress: {
        ...save.dungeons.progress,
        [id]: { ...outcome.progress, bestAttempts: [...outcome.progress.bestAttempts] },
      },
      ...(outcome.spoils.trophyId && !save.dungeons.trophies.includes(outcome.spoils.trophyId)
        ? { trophies: [...save.dungeons.trophies, outcome.spoils.trophyId] }
        : {}),
    },
  };

  if (!outcome.won) {
    // No resource cost on a loss — the only price is the wait (spec §2). The attempt counter and
    // the best-attempt bar have already moved inside `delve`.
    return { ok: true, save: withProgress, outcome, items: [], leveledTo: null };
  }

  // Drops are described by the engine and *made* here, at the floor's level rather than the
  // hero's — a level-40 Epic out of a level-32 floor would make the floor the wrong reward.
  const items = outcome.spoils.items.map((drop, index) =>
    generateItem({
      slot: drop.slot,
      rarity: drop.rarity,
      classId: hero.classId,
      level: Math.max(1, outcome.floorLevel),
      rng: createRng(
        deriveSeed(save.worldSeed, 'delve-item', id, outcome.floor, outcome.progress.attempts, index),
        `delve-item/${id}/${outcome.floor}/${index}`,
      ),
    }),
  );

  const levelled = applyXp(hero.level, hero.xp, outcome.spoils.xp);
  let next: Hero = {
    ...hero,
    level: levelled.level,
    xp: levelled.xp,
    gold: hero.gold + outcome.spoils.gold,
    dice: hero.dice + outcome.spoils.dice,
  };
  for (const item of items) next = addItemToHero(next, item).hero;

  return {
    ok: true,
    save: { ...withProgress, hero: next },
    outcome,
    items,
    leveledTo: levelled.level > hero.level ? levelled.level : null,
  };
}
