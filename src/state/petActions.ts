/**
 * The Menagerie, as save-to-save transitions (pets spec §2).
 *
 * Same contract as every other actions module: a `SaveFile` in, a new one out, no clock and no
 * store. Four things happen in this room — a pet is fed, a pet is upgraded, a pet is put at your
 * side, and the collection is marked as seen — and each is one function.
 *
 * Nothing here grants a *pet*. Ownership is derived from the facts that earned it
 * (`engine/pets/ownership.ts`), so "granting" one means making its source true — which happens
 * wherever that source lives: a dungeon floor cleared, a hundredth mission run, Vesna dealing a
 * card. The one exception is the egg, and it lands through the mission path below.
 */

import { addMaterials } from '@/engine/forge/forgeConfig';
import { ownedPets } from '@/engine/pets/ownership';
import {
  afterFeed,
  clearFedToday,
  progressOf,
  quoteFeed,
  quoteUpgrade,
  type FeedRefusal,
  type PetProgress,
  type UpgradeRefusal,
} from '@/engine/pets/feeding';
import {
  activeBoost,
  boostedAttribute,
  boostedArmour,
  combineBonus,
  rewardBonus,
} from '@/engine/pets/boost';
import type { PetContribution } from '@/engine/combat/combatant';
import type { PayoutBonus } from '@/engine/progression/rewards';
import { deriveStats, type Equipment } from '@/engine/hero/derived';
import { pet, type PetId } from '@/data/pets';
import { guildBonus } from './guildActions';
import type { SaveFile } from '@/engine/save/schema';

export type PetRefusal =
  | { readonly kind: 'no-hero' }
  | { readonly kind: 'not-owned' }
  | { readonly kind: 'feed'; readonly reason: FeedRefusal }
  | { readonly kind: 'upgrade'; readonly reason: UpgradeRefusal };

const refuse = (refusal: PetRefusal) => ({ ok: false as const, refusal });

export interface PetTransition {
  readonly ok: true;
  readonly save: SaveFile;
  readonly progress: PetProgress;
}

export type PetResult = PetTransition | { readonly ok: false; readonly refusal: PetRefusal };

/* ── Reads ───────────────────────────────────────────────────────────────────────── */

/** The one at your side, resolved. Null when there is none, or it is somehow not owned. */
export function currentBoost(save: SaveFile) {
  return activeBoost(save, ownedPets(save));
}

/**
 * What the fight sees — the attribute or armour share the active pet adds.
 *
 * Handed to `buildHeroCombatant` at every call site that has a save, which is how a pet reaches
 * a mission, a duel and a delve without `combatant.ts` learning what a save is.
 */
export function petContribution(save: SaveFile): PetContribution | null {
  const boost = currentBoost(save);
  const attribute = boostedAttribute(boost);
  if (attribute) return { stat: attribute.stat, share: attribute.share };
  const armour = boostedArmour(boost);
  return armour > 0 ? { stat: 'armour', share: armour } : null;
}

/**
 * Every multiplier on a payout, in one object: the hall's cut, the pet's, and the gear specials
 * that have been advertising "+3% gold found" since Phase 2 without ever being applied.
 *
 * One function so no call site can compose a *subset* — the failure mode is silent and the only
 * defence is that there is nothing else to call.
 */
export function payoutBonus(save: SaveFile): PayoutBonus {
  const hero = save.hero;
  if (!hero) return guildBonus(save);

  const derived = deriveStats({
    classId: hero.classId,
    level: hero.level,
    trained: hero.trained,
    equipment: hero.equipment as Equipment,
  });

  return combineBonus(
    guildBonus(save),
    rewardBonus(currentBoost(save), { goldFind: derived.goldFind, xpBonus: derived.xpBonus }),
  );
}

/* ── Writes ──────────────────────────────────────────────────────────────────────── */

function withProgress(save: SaveFile, id: string, progress: PetProgress): SaveFile {
  return { ...save, pets: { ...save.pets, progress: { ...save.pets.progress, [id]: progress } } };
}

/** One feed: a scrap, some gold, and a level. */
export function feedPet(save: SaveFile, id: PetId): PetResult {
  const { hero } = save;
  if (!hero) return refuse({ kind: 'no-hero' });

  const definition = pet(id);
  if (!definition || !ownedPets(save).some((entry) => entry.id === id)) {
    return refuse({ kind: 'not-owned' });
  }

  const progress = progressOf(save.pets.progress, id);
  const quoted = quoteFeed(progress, { scraps: save.pets.scraps, gold: hero.gold });
  if (!quoted.ok) return refuse({ kind: 'feed', reason: quoted.refusal });

  const fed = afterFeed(progress);
  return {
    ok: true,
    save: withProgress(
      {
        ...save,
        hero: { ...hero, gold: hero.gold - quoted.quote.gold },
        pets: { ...save.pets, scraps: save.pets.scraps - quoted.quote.scraps },
      },
      id,
      fed,
    ),
    progress: fed,
  };
}

/** A rarity step: materials for a frame, a trail and half a percent. */
export function upgradePet(save: SaveFile, id: PetId): PetResult {
  const { hero } = save;
  if (!hero) return refuse({ kind: 'no-hero' });
  if (!ownedPets(save).some((entry) => entry.id === id)) return refuse({ kind: 'not-owned' });

  const progress = progressOf(save.pets.progress, id);
  const quoted = quoteUpgrade(progress, hero.materials);
  if (!quoted.ok) return refuse({ kind: 'upgrade', reason: quoted.refusal });

  const upgraded: PetProgress = { ...progress, rarity: quoted.step.rarity };
  return {
    ok: true,
    save: withProgress(
      {
        ...save,
        hero: {
          ...hero,
          materials: addMaterials(hero.materials, {
            scrap: 0,
            essence: -quoted.cost.essence,
            starmetal: -quoted.cost.starmetal,
          }),
        },
      },
      id,
      upgraded,
    ),
    progress: upgraded,
  };
}

/**
 * Put one at your side, or take it away.
 *
 * Free and instant, with no cooldown (spec §2). Generosity is affordable precisely because the
 * boost is minor — a switching cost would make the player think hard about something the design
 * has deliberately made not worth thinking hard about.
 */
export function setActivePet(save: SaveFile, id: PetId | null): SaveFile {
  if (id !== null && !ownedPets(save).some((entry) => entry.id === id)) return save;
  if (save.pets.activeId === id) return save;
  return { ...save, pets: { ...save.pets, activeId: id } };
}

/** Mark the collection as looked at, so the rail stops saying something new is in. */
export function markPetsSeen(save: SaveFile): SaveFile {
  const count = ownedPets(save).length;
  if (save.pets.seenCount === count) return save;
  return { ...save, pets: { ...save.pets, seenCount: count } };
}

/** Midnight: every bowl is empty again (spec §2). */
export function refreshPetDay(save: SaveFile): SaveFile {
  const progress = clearFedToday(save.pets.progress);
  const changed = Object.keys(progress).some((id) => progress[id] !== save.pets.progress[id]);
  return changed ? { ...save, pets: { ...save.pets, progress } } : save;
}

/* ── Drops ───────────────────────────────────────────────────────────────────────── */

/**
 * Bank what a mission turned up for the Menagerie, and count the zone it happened in.
 *
 * The zone counter tracks **victories**, not attempts, because it has to mean the same thing as
 * `activity.missionsCompleted` — the Wisp of the Chapel asks for forty contracts at the Sunken
 * Chapel and the Tankard Imp asks for a hundred anywhere, and one of those being satisfiable by
 * losing would make the harder-sounding gate the easier one.
 */
export function creditMissionDrops(
  save: SaveFile,
  options: {
    readonly zoneId: string;
    readonly victory: boolean;
    readonly scraps: number;
    readonly egg: string | null;
  },
): SaveFile {
  const zoneMissions = options.victory
    ? {
        ...save.activity.zoneMissions,
        [options.zoneId]: (save.activity.zoneMissions[options.zoneId] ?? 0) + 1,
      }
    : save.activity.zoneMissions;

  const eggs =
    options.egg && !save.pets.eggs.includes(options.egg as PetId)
      ? [...save.pets.eggs, options.egg as PetId]
      : save.pets.eggs;

  return {
    ...save,
    activity: { ...save.activity, zoneMissions },
    pets: { ...save.pets, scraps: save.pets.scraps + Math.max(0, options.scraps), eggs },
  };
}

/** Scraps from anywhere else — the guild bounty chest, the daily loop when it lands. */
export function grantScraps(save: SaveFile, amount: number): SaveFile {
  if (amount <= 0) return save;
  return { ...save, pets: { ...save.pets, scraps: save.pets.scraps + amount } };
}
