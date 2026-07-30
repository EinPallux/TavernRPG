/**
 * Mission lifecycle tests.
 *
 * The core loop's two promises are tested here. First: **the board is stable.** A player who
 * refreshes the page must see the same three jobs, or the daily reroll is free and the Golden
 * Die sink is a lie. Second: **the outcome is committed at accept.** Whatever the mission is
 * going to pay, it decided the moment the contract was stamped — reloading, waiting, or
 * watching the fight twice cannot move it.
 */

import { describe, expect, it } from 'vitest';
import { addItem, createHero, equipItem, trainAttribute } from '@/engine/hero/actions';
import { compareItem } from '@/engine/hero/derived';
import { generateItem } from '@/engine/items/generate';
import { createRng } from '@/engine/rng';
import { monsterStatBudget } from '@/engine/combat/combatant';
import { MISSION_DURATIONS } from '@/engine/progression/rewards';
import { applyXp, xpNeeded } from '@/engine/progression/xp';
import type { ClassId } from '@/engine/items/types';
import { CLASSES } from '@/data/classes';
import { monstersInZone } from '@/data/monsters';
import { zonesForLevel } from '@/data/zones';
import { BOARD_SIZE, FREE_REROLLS_PER_DAY, MIN_BOARD_ZONES, drawBoard, rerollCost } from './board';
import { acceptMission, resolveMission, skipMissionTimer } from './lifecycle';
import { missionPhase, missionProgress, msRemaining } from './types';

const WORLD_SEED = 8_675_309;
const DAY = '2026-07-29';
const NOW = new Date('2026-07-29T10:00:00').getTime();

const board = (heroLevel = 12, rerollCount = 0) =>
  drawBoard({ worldSeed: WORLD_SEED, dayKey: DAY, heroLevel, rerollCount });

/**
 * Would wearing this beat what is already in the slot? The judgement a player makes on sight.
 *
 * Damage is weighted heavily on purpose: it is linear in the weapon and it is what actually
 * decides fights. An earlier version of this helper summed only health, armour and attributes,
 * so a hero would leave a vastly better weapon sitting in their bag — and the test dutifully
 * reported the resulting losses as a balance problem.
 */
function isUpgrade(hero: ReturnType<typeof heroAt>, item: Parameters<typeof equipItem>[1]) {
  const delta = compareItem(hero, item);
  const attrs = Object.values(delta.attributes ?? {}).reduce<number>((s, v) => s + (v ?? 0), 0);
  return delta.health + delta.armour + delta.damageAverage * 20 + attrs > 0;
}

/** A hero as the game actually creates one: with their starter kit on. */
function heroAt(level: number, classId: ClassId = 'hunter') {
  const hero = createHero({
    name: 'Wren',
    classId,
    now: NOW,
    rng: createRng(4242, 'test:starter'),
  });
  return { ...hero, level, gold: 0 };
}

/**
 * A hero who has kept up — gear at their level *and* gold spent on training.
 *
 * Both halves matter. Balancing §5's "stats track the level curve" is not just about drops:
 * `buildReferenceCombatant` models a player who trains, and a hero in perfect gear with
 * untouched attributes is still well below the line the monsters are built against.
 */
function onCurveHeroAt(level: number, classId: ClassId = 'hunter') {
  let hero = heroAt(level, classId);
  const rng = createRng(77, 'test:on-curve');

  for (const slot of ['weapon', 'chest', 'helmet', 'gloves', 'boots', 'belt'] as const) {
    const item = generateItem({ slot, rarity: 'rare', classId, level, rng });
    hero = addItem(hero, item).hero;
    hero = equipItem(hero, item);
  }

  // The same 62/28/10 split the reference combatant assumes, on the same stat budget.
  const definition = CLASSES.find((entry) => entry.id === classId)!;
  const budget = monsterStatBudget(level);
  return {
    ...hero,
    trained: {
      ...hero.trained,
      [definition.mainStat]: Math.round(budget * 0.62),
      con: Math.round(budget * 0.28),
      lck: Math.round(budget * 0.1),
    },
  };
}

function accept(level = 12, duration: (typeof MISSION_DURATIONS)[number] = 10, vigor = 100) {
  const result = acceptMission({
    offer: board(level)[0]!,
    duration,
    heroLevel: level,
    vigor,
    now: NOW,
    missionRunning: false,
  });
  if (!result.ok) throw new Error(`accept failed: ${result.failure.kind}`);
  return result;
}

describe('drawBoard', () => {
  it('puts exactly three jobs on the board', () => {
    expect(board()).toHaveLength(BOARD_SIZE);
  });

  it('is stable — reading it twice gives the same three jobs', () => {
    // A refresh must not reshuffle the work, or the reroll costs nothing.
    expect(board()).toEqual(board());
  });

  it('draws a different board for a different day', () => {
    const today = drawBoard({ worldSeed: WORLD_SEED, dayKey: DAY, heroLevel: 12 });
    const tomorrow = drawBoard({ worldSeed: WORLD_SEED, dayKey: '2026-07-30', heroLevel: 12 });

    expect(tomorrow).not.toEqual(today);
  });

  it('draws a different board for a different world', () => {
    const other = drawBoard({ worldSeed: WORLD_SEED + 1, dayKey: DAY, heroLevel: 12 });
    expect(other).not.toEqual(board());
  });

  it('genuinely changes on a reroll', () => {
    // Paying a Golden Die for the same three cards would be theft.
    expect(board(12, 1)).not.toEqual(board(12, 0));
    expect(board(12, 2)).not.toEqual(board(12, 1));
  });

  it('always spans at least two zones', () => {
    // Spec §6. The last card is forced onto a new zone when the first two collided, so this
    // has to hold across every level and every day, not just on average.
    for (let level = 1; level <= 100; level += 1) {
      for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
        for (let reroll = 0; reroll < 3; reroll += 1) {
          const offers = drawBoard({
            worldSeed: WORLD_SEED,
            dayKey: day,
            heroLevel: level,
            rerollCount: reroll,
          });
          const zones = new Set(offers.map((offer) => offer.zoneId));
          expect(zones.size, `level ${level} ${day} r${reroll}`).toBeGreaterThanOrEqual(
            MIN_BOARD_ZONES,
          );
        }
      }
    }
  });

  it('only offers zones and monsters the hero could plausibly be sent to', () => {
    for (const level of [1, 12, 30, 60, 95]) {
      const allowed = new Set<string>(zonesForLevel(level).map((z) => z.id));
      for (const offer of board(level)) {
        expect(allowed.has(offer.zoneId), `level ${level}: ${offer.zoneId}`).toBe(true);

        // The monster must actually live in the zone the card names.
        const roster = monstersInZone(offer.zoneId).map((m) => m.id);
        expect(roster, `${offer.zoneId}`).toContain(offer.monsterId);
      }
    }
  });

  it('jitters the monster level around the hero, never below 1', () => {
    for (const level of [1, 2, 40]) {
      for (const offer of board(level)) {
        expect(offer.monsterLevel).toBeGreaterThanOrEqual(1);
        expect(offer.monsterLevel).toBeGreaterThanOrEqual(level - 1);
        expect(offer.monsterLevel).toBeLessThanOrEqual(level + 2);
      }
    }
  });

  it('gives every card a distinct id and its own seed', () => {
    const offers = board();
    expect(new Set(offers.map((o) => o.id)).size).toBe(BOARD_SIZE);
    expect(new Set(offers.map((o) => o.seed)).size).toBe(BOARD_SIZE);
  });
});

describe('rerollCost', () => {
  it('is free once a day, then costs a die', () => {
    expect(rerollCost(0)).toBe(0);
    expect(rerollCost(FREE_REROLLS_PER_DAY)).toBe(1);
    expect(rerollCost(9)).toBe(1);
  });
});

describe('acceptMission', () => {
  it('spends Vigor equal to the duration', () => {
    for (const duration of MISSION_DURATIONS) {
      const result = accept(12, duration);
      expect(result.vigorSpent).toBe(duration);
      expect(result.mission.vigorSpent).toBe(duration);
    }
  });

  it('sets a timer of exactly the chosen length', () => {
    const { mission } = accept(12, 15);
    expect(mission.endsAt - mission.startedAt).toBe(15 * 60_000);
  });

  it('refuses when there is not enough Vigor, and says how short you are', () => {
    const result = acceptMission({
      offer: board()[0]!,
      duration: 20,
      heroLevel: 12,
      vigor: 5,
      now: NOW,
      missionRunning: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toEqual({ kind: 'insufficient-vigor', needed: 20, available: 5 });
  });

  it('refuses a second mission while one is running', () => {
    const result = acceptMission({
      offer: board()[0]!,
      duration: 5,
      heroLevel: 12,
      vigor: 100,
      now: NOW,
      missionRunning: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('mission-running');
  });

  it('lets a mount shorten the wait without touching the price', () => {
    // balancing §6: the mount reduces duration only — never cost, never rewards.
    const mounted = acceptMission({
      offer: board()[0]!,
      duration: 20,
      heroLevel: 12,
      vigor: 100,
      now: NOW,
      missionRunning: false,
      durationMultiplier: 0.5,
    });

    expect(mounted.ok).toBe(true);
    if (!mounted.ok) return;
    expect(mounted.mission.endsAt - mounted.mission.startedAt).toBe(10 * 60_000);
    expect(mounted.vigorSpent).toBe(20);
    expect(mounted.mission.duration).toBe(20);
  });

  it('records the hero level at signing, so levelling mid-mission never pays less', () => {
    const { mission } = accept(12, 10);
    expect(mission.heroLevel).toBe(12);
  });
});

describe('mission timing', () => {
  it('reports running, then returned', () => {
    const { mission } = accept(12, 10);

    expect(missionPhase(mission, NOW)).toBe('running');
    expect(missionPhase(mission, mission.endsAt - 1)).toBe('running');
    expect(missionPhase(mission, mission.endsAt)).toBe('returned');
    expect(missionPhase(null, NOW)).toBe('idle');
  });

  it('counts down and never goes negative', () => {
    const { mission } = accept(12, 5);

    expect(msRemaining(mission, NOW)).toBe(5 * 60_000);
    expect(msRemaining(mission, mission.endsAt + 999_999)).toBe(0);
  });

  it('runs progress from 0 to 1', () => {
    const { mission } = accept(12, 10);

    expect(missionProgress(mission, NOW)).toBe(0);
    expect(missionProgress(mission, NOW + 5 * 60_000)).toBeCloseTo(0.5, 5);
    expect(missionProgress(mission, mission.endsAt)).toBe(1);
    expect(missionProgress(mission, mission.endsAt + 60_000)).toBe(1);
  });

  it('brings the hero home on skip, without rewinding the start', () => {
    const { mission } = accept(12, 20);
    const skipped = skipMissionTimer(mission, NOW + 60_000);

    expect(missionPhase(skipped, NOW + 60_000)).toBe('returned');
    expect(skipped.startedAt).toBe(mission.startedAt);
  });

  it('does not extend a mission that already finished', () => {
    const { mission } = accept(12, 5);
    const late = skipMissionTimer(mission, mission.endsAt + 10 * 60_000);
    expect(late.endsAt).toBe(mission.endsAt);
  });
});

describe('resolveMission', () => {
  it('is deterministic — the same mission always pays the same thing', () => {
    const hero = heroAt(12);
    const { mission } = accept(12, 20);

    const once = resolveMission(mission, hero);
    const twice = resolveMission(mission, hero);

    expect(twice.spoils).toEqual(once.spoils);
    expect(twice.battle.log).toEqual(once.battle.log);
  });

  it('pays the published rate for the duration on a win', () => {
    const hero = heroAt(20);
    const { mission } = accept(20, 15);
    const outcome = resolveMission(mission, hero);

    if (!outcome.spoils.victory) return; // covered by the loss test below
    const expected = Math.round((xpNeeded(20) / 320) * 15);
    expect(outcome.spoils.xp).toBe(expected);
    expect(outcome.spoils.gold).toBeGreaterThan(0);
  });

  it('pays half gold and no XP on a loss', () => {
    // An under-levelled hero against an over-levelled monster loses reliably.
    const hero = heroAt(3);
    const offer = { ...board(3)[0]!, monsterLevel: 60 };
    const result = acceptMission({
      offer,
      duration: 10,
      heroLevel: 3,
      vigor: 100,
      now: NOW,
      missionRunning: false,
    });
    if (!result.ok) throw new Error('accept failed');

    const outcome = resolveMission(result.mission, hero);

    expect(outcome.spoils.victory).toBe(false);
    expect(outcome.spoils.xp).toBe(0);
    expect(outcome.spoils.item).toBeNull();
    expect(outcome.spoils.dice).toBe(0);
    // Gold is halved, not zeroed — the trip still cost Vigor.
    expect(outcome.spoils.gold).toBeGreaterThan(0);
  });

  it('fights the monster the card advertised, at the level it advertised', () => {
    const hero = heroAt(25);
    const { mission } = accept(25, 10);
    const outcome = resolveMission(mission, hero);

    const opening = outcome.battle.log[0];
    expect(opening?.t).toBe('battle_start');
    if (opening?.t !== 'battle_start') return;
    expect(opening.b.level).toBe(mission.offer.monsterLevel);
  });

  /** Run a batch of real missions and report the win rate. */
  function measureWinRate(
    build: (level: number, classId: ClassId) => ReturnType<typeof heroAt>,
    levels: readonly number[],
    perLevel = 12,
  ) {
    let wins = 0;
    let total = 0;

    for (const level of levels) {
      for (const definition of CLASSES) {
        for (let day = 0; day < perLevel; day += 1) {
          const offers = drawBoard({
            worldSeed: WORLD_SEED + day,
            dayKey: `2026-08-${String((day % 28) + 1).padStart(2, '0')}`,
            heroLevel: level,
          });
          const result = acceptMission({
            offer: offers[day % offers.length]!,
            duration: 10,
            heroLevel: level,
            vigor: 100,
            now: NOW,
            missionRunning: false,
          });
          if (!result.ok) continue;
          total += 1;
          if (resolveMission(result.mission, build(level, definition.id)).spoils.victory) {
            wins += 1;
          }
        }
      }
    }

    return wins / total;
  }

  it('a hero who keeps their gear current wins ≥97% of missions', () => {
    // balancing §5: missions are pacing, not challenge. Losses come from gear neglect.
    expect(measureWinRate(onCurveHeroAt, [10, 25, 50])).toBeGreaterThanOrEqual(0.97);
  });

  it('a brand-new hero in their starter kit wins their first missions', () => {
    // The first mission a player ever runs must not be a coin flip. This leans on both the
    // starter kit and the low-level jitter grace band — remove either and it collapses to
    // roughly a 50/50, which is a miserable way to learn what a mission is.
    expect(measureWinRate(heroAt, [1])).toBeGreaterThanOrEqual(0.98);
  });

  it('carries a real player through the opening hours as they equip what drops', () => {
    /**
     * The closest thing to an actual playthrough: start from creation, run missions, take the
     * upgrades that fall, level up. This is the test that would have caught an unwinnable
     * opening — a static hero can be made to pass by choosing a flattering level, but a
     * hundred consecutive missions cannot.
     */
    for (const definition of CLASSES) {
      let hero = createHero({
        name: 'Wren',
        classId: definition.id,
        now: NOW,
        rng: createRng(4242, 'playthrough'),
      });
      let wins = 0;
      const runs = 60;

      for (let i = 0; i < runs; i += 1) {
        const offers = drawBoard({
          worldSeed: WORLD_SEED,
          dayKey: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
          heroLevel: hero.level,
        });
        const accepted = acceptMission({
          offer: offers[i % offers.length]!,
          duration: 10,
          heroLevel: hero.level,
          vigor: 100,
          now: NOW,
          missionRunning: false,
        });
        if (!accepted.ok) continue;

        const { spoils } = resolveMission(accepted.mission, hero);
        if (!spoils.victory) continue;
        wins += 1;

        const levelled = applyXp(hero.level, hero.xp, spoils.xp);
        hero = { ...hero, level: levelled.level, xp: levelled.xp };

        // Take the gold and spend it, which is the other half of staying on curve. A hero who
        // banks their winnings is not a player, and Phase 6's faster levelling makes the
        // difference stark: they outrun their own gear inside a fortnight.
        hero = { ...hero, gold: hero.gold + spoils.gold };
        const attribute = CLASSES.find((c) => c.id === definition.id)!.mainStat;
        hero = trainAttribute(hero, i % 3 === 0 ? 'con' : attribute, 50).hero;

        // Equip the drop when it is an upgrade — including over something already worn, which
        // is the whole point of a drop.
        if (spoils.item) {
          const item = generateItem({
            slot: spoils.item.slot,
            rarity: spoils.item.rarity,
            classId: definition.id,
            level: hero.level,
            rng: createRng(i + 1, 'playthrough:item'),
          });
          hero = addItem(hero, item).hero;

          const worn = hero.equipment[item.slot];
          if (!worn || isUpgrade(hero, item)) hero = equipItem(hero, item);
        }
      }

      expect(wins / runs, definition.id).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('punishes gear neglect rather than bad luck', () => {
    // `heroAt` never upgrades anything, so at level 20 it is a hero still wearing the kit
    // Marla handed them. That should cost you — it is the intended reason to lose a mission,
    // and the loss hints on the result screen name it.
    expect(measureWinRate(heroAt, [20, 30])).toBeLessThan(0.6);
  });

  it('survives a mission naming a monster that no longer exists', () => {
    // Content can be renamed between releases; an old save must not crash on load.
    const hero = heroAt(12);
    const { mission } = accept(12, 10);
    const orphaned = { ...mission, offer: { ...mission.offer, monsterId: 'deleted-in-v2' } };

    expect(() => resolveMission(orphaned, hero)).not.toThrow();
    expect(resolveMission(orphaned, hero).battle.log.length).toBeGreaterThan(0);
  });
});
