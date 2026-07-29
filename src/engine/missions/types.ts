/**
 * Mission types (docs/design/systems/tavern-and-patrol.md §7).
 *
 * The load-bearing idea in here is the **seed committed at accept**. Everything about a mission's
 * outcome — who you fight, how the fight goes, what drops — is decided by that one number the
 * moment the contract is stamped, and nothing afterwards can move it. Reloading mid-timer,
 * watching the fight twice, or closing the tab for a day all replay the same result.
 *
 * That is what lets the fight wait for the player instead of resolving without them: the
 * mission's outcome already exists, the battle is just the telling of it.
 *
 * Pure module.
 */

import type { MissionDuration } from '@/engine/progression/rewards';
import type { Rarity, SlotId } from '@/engine/items/types';

/** A job on the board. Cheap and disposable — the board redraws daily. */
export interface MissionOffer {
  readonly id: string;
  readonly zoneId: string;
  readonly monsterId: string;
  readonly blurbId: string;
  /** Which of the zone's backdrops this mission uses. */
  readonly backdropIndex: number;
  /**
   * Committed at *draw* time, not accept, so the preview a player reads is the mission they get.
   * The fight and the loot both fork from here.
   */
  readonly seed: number;
  /** Levels the monster will be built at — jittered from the hero (balancing §5). */
  readonly monsterLevel: number;
}

/** An accepted mission, counting down. */
export interface ActiveMission {
  readonly offer: MissionOffer;
  readonly duration: MissionDuration;
  /** Wall-clock stamps, so the timer keeps running with the tab closed. */
  readonly startedAt: number;
  readonly endsAt: number;
  /** Vigor actually spent, recorded so a refund is exact if one is ever needed. */
  readonly vigorSpent: number;
  /** Hero level at accept — rewards are priced when the contract is signed, not when it's paid. */
  readonly heroLevel: number;
}

/** What a finished mission owes the player, before it is applied to the save. */
export interface MissionSpoils {
  readonly victory: boolean;
  readonly gold: number;
  readonly xp: number;
  readonly dice: number;
  readonly ale: boolean;
  /** Description of the drop; the item itself is generated when it is granted. */
  readonly item: { readonly slot: SlotId; readonly rarity: Rarity } | null;
}

export type MissionPhase = 'idle' | 'running' | 'returned';

/** Where a mission is right now, given the time. */
export function missionPhase(mission: ActiveMission | null, now: number): MissionPhase {
  if (!mission) return 'idle';
  return now >= mission.endsAt ? 'returned' : 'running';
}

/** Milliseconds left on the clock; zero once the hero is back. */
export function msRemaining(mission: ActiveMission, now: number): number {
  return Math.max(0, mission.endsAt - now);
}

/** 0–1 through the journey, for the progress ring. */
export function missionProgress(mission: ActiveMission, now: number): number {
  const span = mission.endsAt - mission.startedAt;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (now - mission.startedAt) / span));
}
