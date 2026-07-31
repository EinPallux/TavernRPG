/**
 * Mission lifecycle: accept → wait → resolve (docs/design/systems/tavern-and-patrol.md §3).
 *
 * The functions here are the whole core loop, minus the drawing of it. Each one takes the world
 * as arguments and returns the new world; none of them read a clock, a store or a save. That is
 * what makes "does a mission survive a reload mid-timer?" a question with an obvious answer:
 * there is no in-memory state to lose, only two timestamps in the save.
 *
 * **Missions never auto-resolve.** A timer that expires while the tab is closed leaves the fight
 * waiting at the board. The battle is the payoff moment (spec §3) — resolving it in the
 * background would hand the player a result they never got to watch.
 *
 * Pure module.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { fight } from '@/engine/combat/fight';
import { buildHeroCombatant, buildMonsterCombatant } from '@/engine/combat/combatant';
import type { BattleResult } from '@/engine/combat/types';
import { missionDropTable, rollMissionDrops } from '@/engine/items/drops';
import { rollKeyDrop } from '@/engine/dungeons/keys';
import { rollEgg, rollScraps } from '@/engine/pets/eggs';
import type { PetContribution } from '@/engine/combat/combatant';
import { xpNeeded } from '@/engine/progression/xp';
import {
  consolationPayout,
  missionPayout,
  NO_BONUS,
  type MissionDuration,
  type PayoutBonus,
} from '@/engine/progression/rewards';
import type { Hero } from '@/engine/save/schema';
import { monster as monsterDef } from '@/data/monsters';
import type { ActiveMission, MissionOffer, MissionSpoils } from './types';

const MS_PER_MINUTE = 60_000;

export type AcceptFailure =
  | { readonly kind: 'no-hero' }
  | { readonly kind: 'mission-running' }
  | { readonly kind: 'insufficient-vigor'; readonly needed: number; readonly available: number };

export type AcceptResult =
  | { readonly ok: true; readonly mission: ActiveMission; readonly vigorSpent: number }
  | { readonly ok: false; readonly failure: AcceptFailure };

export interface AcceptOptions {
  readonly offer: MissionOffer;
  readonly duration: MissionDuration;
  readonly heroLevel: number;
  readonly vigor: number;
  readonly now: number;
  /** Already on a job? Only one at a time (spec §3). */
  readonly missionRunning: boolean;
  /** Mount reduction, 0–1, applied to the *timer only* — never to cost or rewards (§6). */
  readonly durationMultiplier?: number;
}

/**
 * Sign the contract.
 *
 * Vigor is spent here, at accept, which is why a mission accepted at 23:58 is unaffected by the
 * midnight reset four minutes later (spec §6) — the player already paid.
 */
export function acceptMission({
  offer,
  duration,
  heroLevel,
  vigor,
  now,
  missionRunning,
  durationMultiplier = 1,
}: AcceptOptions): AcceptResult {
  if (missionRunning) return { ok: false, failure: { kind: 'mission-running' } };

  const cost = duration;
  if (vigor < cost) {
    return {
      ok: false,
      failure: { kind: 'insufficient-vigor', needed: cost, available: vigor },
    };
  }

  const realMinutes = duration * Math.min(1, Math.max(0.1, durationMultiplier));

  return {
    ok: true,
    vigorSpent: cost,
    mission: {
      offer,
      duration,
      startedAt: now,
      endsAt: now + Math.round(realMinutes * MS_PER_MINUTE),
      vigorSpent: cost,
      heroLevel,
    },
  };
}

/** Bring the hero home early, for a Golden Die (spec §3). */
export function skipMissionTimer(mission: ActiveMission, now: number): ActiveMission {
  return { ...mission, endsAt: Math.min(mission.endsAt, now) };
}

export interface MissionOutcome {
  readonly battle: BattleResult;
  readonly spoils: MissionSpoils;
}

/**
 * Fight the mission and total up what it paid.
 *
 * Deterministic in the mission's committed seed: the same mission always produces the same
 * battle log and the same loot, however many times this is called. The UI leans on that — it
 * resolves once to show the fight, and the store resolves again to grant the rewards, and the
 * two must agree.
 */
export function resolveMission(
  mission: ActiveMission,
  hero: Hero,
  bonus: PayoutBonus = NO_BONUS,
  /** Keys already hanging on the hero's belt, so a second one is never rolled. */
  ownedKeys: readonly string[] = [],
  /** The active pet, if any — it fights alongside (pets spec §2). */
  petBoost: PetContribution | null = null,
  /** Eggs already hatched, so the rarest drop in the game is never a duplicate. */
  ownedEggs: readonly string[] = [],
): MissionOutcome {
  const template = monsterDef(mission.offer.monsterId);
  const foe = buildMonsterCombatant({
    id: mission.offer.monsterId,
    name: template?.name ?? 'Something in the dark',
    archetypeId: template?.archetypeId ?? 'bruiser',
    level: mission.offer.monsterLevel,
  });

  const battle = fight(
    buildHeroCombatant(hero, 'hero', petBoost),
    foe,
    deriveSeed(mission.offer.seed, 'fight'),
  );

  const victory = battle.winner === 'a';
  // Priced at the level the contract was signed at, so levelling mid-mission never pays less.
  const full = missionPayout(
    mission.heroLevel,
    mission.duration,
    xpNeeded(mission.heroLevel),
    bonus,
  );

  if (!victory) {
    const consolation = consolationPayout(full);
    return {
      battle,
      spoils: {
        victory: false,
        ...consolation,
        dice: 0,
        ale: false,
        item: null,
        key: null,
        scraps: 0,
        egg: null,
      },
    };
  }

  const dropStream = createRng(
    deriveSeed(mission.offer.seed, 'drops'),
    `drops/${mission.offer.id}`,
  );
  const drops = rollMissionDrops(missionDropTable(mission.duration), dropStream, {
    weaponLevelsBehind: hero.level - (hero.equipment.weapon?.level ?? 1),
  });

  return {
    battle,
    spoils: {
      victory: true,
      gold: full.gold,
      xp: full.xp,
      dice: drops.dice,
      ale: drops.ale,
      item: drops.item,
      // Its own fork of the mission's committed stream: the key is decided at accept like
      // everything else, and adding it cannot shift a single existing drop.
      key: rollKeyDrop({
        heroLevel: hero.level,
        owned: ownedKeys,
        rng: dropStream.fork('dungeon-key'),
      }),
      // Two more forks, for the same reason the key got one: a new drop must not move an
      // existing one. Scraps and the egg are decided by the mission's committed seed like
      // everything else, so watching the fight twice cannot roll a second Frost Fox.
      scraps: rollScraps(dropStream.fork('scraps')),
      egg: rollEgg({
        zoneId: mission.offer.zoneId,
        owned: ownedEggs,
        rng: dropStream.fork('egg'),
      }),
    },
  };
}
