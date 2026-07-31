'use client';

/**
 * The mission loop, as store transitions.
 *
 * Every function here takes the whole save and returns a new one. Keeping them out of the
 * Zustand closure means the core loop — accept, reroll, resolve, claim — can be tested by
 * calling functions with plain objects, without a store, a browser or IndexedDB.
 *
 * The store's job is to call these and schedule the write. That is the whole of it.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { generateItem } from '@/engine/items/generate';
import { drawBoard, rerollCost, SKIP_DICE_COST } from '@/engine/missions/board';
import { acceptMission, resolveMission, skipMissionTimer } from '@/engine/missions/lifecycle';
import { missionPhase, type MissionSpoils } from '@/engine/missions/types';
import { ALE_DICE_COST, ALE_VIGOR, type MissionDuration } from '@/engine/progression/rewards';
import { canDrinkAle, processResets, vigorCeiling } from '@/engine/reset/resetEngine';
import type { WeeklyPayout } from '@/engine/arena/payout';
import type { BountyChest } from '@/engine/guilds/bounty';
import { refreshArenaDay } from './arenaActions';
import { refreshGuildDay } from './guildActions';
import { credit, creditAll } from './progressActions';
import { refreshForgeDay } from './forgeActions';
import { refreshGachaDay } from './gachaActions';
import { creditMissionDrops, payoutBonus, petContribution, refreshPetDay } from './petActions';
import { ensureTasks, refreshBoardDay } from './boardActions';
import { refreshTutorialDay } from './tutorialActions';
import { stampToday, type StampTransition } from './calendarActions';
import { activeMount } from '@/engine/stables/mounts';
import { applyXp } from '@/engine/progression/xp';
import { addItem as addItemToHero } from '@/engine/hero/actions';
import type { BattleResult } from '@/engine/combat/types';
import type { Activity, Hero, SaveFile, StoredActiveMission } from '@/engine/save/schema';
import type { Item } from '@/engine/items/types';

/** Why an action could not be taken, phrased for the player. */
export type MissionRefusal =
  | { readonly kind: 'no-hero' }
  | { readonly kind: 'mission-running' }
  | { readonly kind: 'insufficient-vigor'; readonly needed: number; readonly available: number }
  | { readonly kind: 'insufficient-dice'; readonly needed: number }
  | { readonly kind: 'ale-cap-reached' }
  | { readonly kind: 'no-ale-held' }
  | { readonly kind: 'nothing-to-do' };

export type MissionTransition =
  | { readonly ok: true; readonly save: SaveFile }
  | { readonly ok: false; readonly refusal: MissionRefusal };

const refuse = (refusal: MissionRefusal): MissionTransition => ({ ok: false, refusal });

function withActivity(save: SaveFile, activity: Partial<Activity>): SaveFile {
  return { ...save, activity: { ...save.activity, ...activity } };
}

/**
 * Bring the save up to date with the wall clock, then make sure a board exists.
 *
 * Called on load and whenever the tavern is opened. Every daily rule in the game funnels
 * through here rather than each screen asking the clock itself (daily-loop spec §4).
 */
export function refreshDay(
  save: SaveFile,
  today: string,
  daysBetween: (from: string, to: string) => readonly string[],
): {
  readonly save: SaveFile;
  readonly didReset: boolean;
  readonly vigorForfeited: number;
  /** Weeks that closed while the player was away (arena spec §3). Usually empty. */
  readonly payouts: readonly WeeklyPayout[];
  /** The guild bounty chest, if a Sunday passed and the hall earned one. */
  readonly chest: BountyChest | null;
  /** Today's calendar square, if this refresh was the one that stamped it (spec §2). */
  readonly calendarStamp: StampTransition | null;
  /** Whole days the player was away — what the absence card counts. */
  readonly daysAway: number;
} {
  const outcome = processResets(save.activity, today, daysBetween);
  let next = { ...save, activity: outcome.state as Activity };

  // The arena's counters and the Sunday payout hang off the same boundaries. They are handed the
  // list rather than asking the clock: one owner decides it is tomorrow (daily-loop spec §4).
  const arenaDay = refreshArenaDay(next, outcome.daysProcessed, outcome.didReset);
  next = arenaDay.save;

  const guildDay = refreshGuildDay(next, outcome.daysProcessed, today, outcome.didReset);
  next = guildDay.save;

  // The crucible cools with everything else. A week away is one reset, not seven — the same
  // rule Vigor and the shop shelves follow (crafting spec §2).
  if (outcome.didReset) next = refreshForgeDay(next);

  // And Vesna deals a fresh card on the house. Same boundary, same owner (gacha spec §3).
  if (outcome.didReset) next = refreshGachaDay(next);

  // Twelve empty bowls in the Menagerie (pets spec §2).
  if (outcome.didReset) next = refreshPetDay(next);

  // Three fresh notices and an empty tally (daily-loop spec §1). The week's claim count rolls
  // here too, which is why the board is handed `today` rather than working it out.
  if (outcome.didReset) next = refreshBoardDay(next, today);

  // And the Next Step chip gets another go: a hint waved away yesterday is a nudge declined, not
  // a preference (tutorial spec §4).
  if (outcome.didReset) next = refreshTutorialDay(next);

  /*
   * Then the ledger stamps itself.
   *
   * Auto-stamping on first load of the day is the spec's own wording (§2), and doing it inside
   * the one reset walk rather than on the Notice Board screen is what makes it true: a player
   * who logs in, runs a mission and closes the tab has still been marked present. `stampToday`
   * is idempotent, so calling it on every refresh — which is every load and every tick — is
   * exactly as safe as calling it once.
   */
  const stamped = stampToday(next, today);
  const calendarStamp = stamped.ok ? stamped : null;
  if (stamped.ok) next = stamped.save;

  // The day's three are drawn lazily, after the reset and after the stamp, so a board drawn on
  // the way in already reflects a level the calendar's reward might have paid for.
  next = ensureTasks(next, today);

  // A board is drawn lazily: on the first visit of the day, after a reroll, or after a reset
  // nulled it. Drawing it here rather than at midnight means a player who never opens the
  // tavern never has a stale board to explain.
  if (next.hero && (next.activity.boardDay !== today || next.activity.board.length === 0)) {
    next = withActivity(next, {
      board: [
        ...drawBoard({
          worldSeed: next.worldSeed,
          dayKey: today,
          heroLevel: next.hero.level,
          rerollCount: next.activity.boardRerollsToday,
        }),
      ],
      boardDay: today,
    });
  }

  return {
    save: next,
    didReset: outcome.didReset,
    vigorForfeited: outcome.vigorForfeited,
    payouts: arenaDay.payouts,
    chest: guildDay.chest,
    calendarStamp,
    daysAway: outcome.daysAway,
  };
}

/** Sign a contract: spend the Vigor, start the clock. */
export function accept(
  save: SaveFile,
  offerId: string,
  duration: MissionDuration,
  now: number,
): MissionTransition {
  const { hero, activity } = save;
  if (!hero) return refuse({ kind: 'no-hero' });
  if (activity.mission || activity.pendingMission) return refuse({ kind: 'mission-running' });

  const offer = activity.board.find((entry) => entry.id === offerId);
  if (!offer) return refuse({ kind: 'nothing-to-do' });

  // A mount shortens the road and nothing else: the Vigor cost below is still `duration`, and
  // `resolveMission` still prices the rewards off `duration` (shops spec §4).
  const mount = activeMount(activity.mount, now);

  const result = acceptMission({
    offer,
    duration,
    heroLevel: hero.level,
    vigor: activity.vigor,
    now,
    missionRunning: false,
    ...(mount ? { durationMultiplier: 1 - mount.speedBonus } : {}),
  });

  if (!result.ok) {
    return refuse(
      result.failure.kind === 'insufficient-vigor'
        ? {
            kind: 'insufficient-vigor',
            needed: result.failure.needed,
            available: result.failure.available,
          }
        : { kind: 'mission-running' },
    );
  }

  // Signed, not won: `missionsAccepted` is credited here and `missions` only on a victory. The
  // tutorial reads this one, because a first contract that loses still taught the lesson.
  const signed = credit(save, 'missionsAccepted', 1);

  return {
    ok: true,
    save: withActivity(signed, {
      vigor: activity.vigor - result.vigorSpent,
      mission: result.mission,
      // The taken job leaves the board; the other two stay for tomorrow's comparison.
      board: activity.board.filter((entry) => entry.id !== offerId),
    }),
  };
}

/** Redraw the board. Free once a day, then a Golden Die (tavern spec §3). */
export function rerollBoard(save: SaveFile, today: string): MissionTransition {
  const { hero, activity } = save;
  if (!hero) return refuse({ kind: 'no-hero' });

  const cost = rerollCost(activity.boardRerollsToday);
  if (cost > hero.dice) return refuse({ kind: 'insufficient-dice', needed: cost });

  const rerolls = activity.boardRerollsToday + 1;
  return {
    ok: true,
    save: {
      ...save,
      hero: { ...hero, dice: hero.dice - cost },
      activity: {
        ...activity,
        boardRerollsToday: rerolls,
        boardDay: today,
        board: [
          ...drawBoard({
            worldSeed: save.worldSeed,
            dayKey: today,
            heroLevel: hero.level,
            rerollCount: rerolls,
          }),
        ],
      },
    },
  };
}

/** Buy back the remaining wait for a Golden Die — the impatience sink. */
export function skipTimer(save: SaveFile, now: number): MissionTransition {
  const { hero, activity } = save;
  if (!hero) return refuse({ kind: 'no-hero' });
  if (!activity.mission) return refuse({ kind: 'nothing-to-do' });
  if (hero.dice < SKIP_DICE_COST)
    return refuse({ kind: 'insufficient-dice', needed: SKIP_DICE_COST });

  return {
    ok: true,
    save: {
      ...save,
      hero: { ...hero, dice: hero.dice - SKIP_DICE_COST },
      activity: { ...activity, mission: skipMissionTimer(activity.mission, now) },
    },
  };
}

/**
 * Move a finished mission out of the timer slot and into "waiting to be watched".
 *
 * A separate step from claiming so the fight can be shown before anything is banked — the
 * rewards must not exist until the player has seen how they were earned.
 */
export function landMission(save: SaveFile, now: number): SaveFile {
  const { mission } = save.activity;
  if (!mission || missionPhase(mission, now) !== 'returned') return save;

  // Counted here rather than at the claim: this is the moment the *waiting* ended, which is a
  // different lesson from the fight that follows it. Safe to run on every tick — the guard above
  // makes it fire exactly once per contract.
  return withActivity(credit(save, 'missionsReturned', 1), {
    mission: null,
    pendingMission: mission,
  });
}

export interface ClaimResult {
  readonly save: SaveFile;
  readonly spoils: MissionSpoils;
  /**
   * The fight itself.
   *
   * Returned rather than re-derived by the screen: claiming levels the hero and puts the drop
   * in their bags, so resolving a second time afterwards would stage a *different* fight from
   * the one that was actually paid out. Resolve once, show what you paid for.
   */
  readonly battle: BattleResult;
  /** The generated drop, if there was one — the result screen shows this exact item. */
  readonly item: Item | null;
  readonly leveledTo: number | null;
}

/**
 * Bank a watched mission.
 *
 * Re-resolves rather than trusting a value passed in from the UI: the mission's seed already
 * decides the outcome, so the engine is the single source of truth and a tampered client
 * value has nothing to tamper with.
 *
 * Refuses anything that is not the currently pending mission. Without that check a
 * double-clicked Continue button — or a component that mounts twice — pays out twice, which
 * is the single most expensive bug a reward flow can have.
 */
export function claimMission(save: SaveFile, mission: StoredActiveMission): ClaimResult | null {
  const hero = save.hero;
  if (!hero) return null;

  const pending = save.activity.pendingMission;
  if (!pending || pending.offer.id !== mission.offer.id) return null;

  // The hall's cut, applied where the payout is computed so the result screen and the ledger
  // agree with the quote (guilds spec §2).
  /*
   * Every multiplier the hero has earned, and the companion at their side.
   *
   * `payoutBonus` rather than `guildBonus` since Phase 14: it composes the hall's cut with the
   * pet's and with the gear specials that had been computed and thrown away since Phase 2.
   */
  const { spoils, battle } = resolveMission(
    mission,
    hero,
    payoutBonus(save),
    save.dungeons.keys,
    petContribution(save),
    save.pets.eggs,
  );
  const item = spoils.item
    ? generateItem({
        slot: spoils.item.slot,
        rarity: spoils.item.rarity,
        classId: hero.classId,
        level: Math.max(1, mission.offer.monsterLevel),
        rng: createRng(deriveSeed(mission.offer.seed, 'item'), `item/${mission.offer.id}`),
      })
    : null;

  const levelled = applyXp(hero.level, hero.xp, spoils.xp);
  let next: Hero = {
    ...hero,
    level: levelled.level,
    xp: levelled.xp,
    gold: hero.gold + spoils.gold,
    dice: hero.dice + spoils.dice,
  };
  if (item) next = addItemToHero(next, item).hero;

  const activity = save.activity;
  const gainedFreeAle = spoils.ale && activity.freeAlesToday < 1;
  /*
   * A won contract counts, and only a won one — the same units `activity.missionsCompleted` and
   * `activity.zoneMissions` use. Three counters that mean "a contract you finished" have to be
   * counted the same way or the gates built on them quietly disagree.
   */
  const credited = creditMissionDrops(
    creditAll(save, [
      ['missions', spoils.victory ? 1 : 0],
      ['levelsGained', levelled.level - hero.level],
    ]),
    {
      zoneId: mission.offer.zoneId,
      victory: spoils.victory,
      scraps: spoils.scraps,
      egg: spoils.egg,
    },
  );

  return {
    save: {
      ...credited,
      hero: next,
      activity: {
        ...credited.activity,
        pendingMission: null,
        missionsCompleted: activity.missionsCompleted + (spoils.victory ? 1 : 0),
        ...(gainedFreeAle
          ? { alesHeld: activity.alesHeld + 1, freeAlesToday: activity.freeAlesToday + 1 }
          : {}),
      },
      // A key opens its door permanently, so it goes on the belt and never comes off. The
      // guard is belt-and-braces: `rollKeyDrop` already refuses to hand out one twice.
      ...(spoils.key && !save.dungeons.keys.includes(spoils.key)
        ? { dungeons: { ...save.dungeons, keys: [...save.dungeons.keys, spoils.key] } }
        : {}),
    },
    spoils,
    battle,
    item,
    leveledTo: levelled.level > hero.level ? levelled.level : null,
  };
}

/** Buy an Ale from Marla for a Golden Die. */
export function buyAle(save: SaveFile): MissionTransition {
  const { hero, activity } = save;
  if (!hero) return refuse({ kind: 'no-hero' });
  if (!canDrinkAle(activity.alesToday)) return refuse({ kind: 'ale-cap-reached' });
  if (hero.dice < ALE_DICE_COST)
    return refuse({ kind: 'insufficient-dice', needed: ALE_DICE_COST });

  return {
    ok: true,
    save: {
      ...save,
      hero: { ...hero, dice: hero.dice - ALE_DICE_COST },
      activity: { ...activity, alesHeld: activity.alesHeld + 1 },
    },
  };
}

/**
 * Drink one. Both bought and free Ales count against the same 3/day cap (tavern spec §2) —
 * the cap is on how much a day can be stretched, not on how the Ale was obtained.
 */
export function drinkAle(save: SaveFile): MissionTransition {
  const { activity } = save;
  if (activity.alesHeld < 1) return refuse({ kind: 'no-ale-held' });
  if (!canDrinkAle(activity.alesToday)) return refuse({ kind: 'ale-cap-reached' });

  const alesToday = activity.alesToday + 1;
  return {
    ok: true,
    save: withActivity(save, {
      alesHeld: activity.alesHeld - 1,
      alesToday,
      vigor: Math.min(vigorCeiling(alesToday), activity.vigor + ALE_VIGOR),
    }),
  };
}
