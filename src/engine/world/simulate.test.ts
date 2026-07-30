/**
 * Simulation tests — what the world *does*.
 *
 * The remaining two acceptance criteria live here. **A fortnight's absence reconciles in under a
 * second**, because a visible "simulating…" stall on load would undo the illusion the whole
 * system exists to create. And **every feed entry references a real sim delta**, audited over a
 * hundred entries — the Town Crier is evidence that the world moved, and evidence that can be
 * fabricated is not evidence.
 */

import { describe, expect, it } from 'vitest';
import { CRIER_TEMPLATES } from '@/data/crierTemplates';
import { generateWorld, rankOf } from './generate';
import { botIdentity } from './identity';
import {
  ATTACK_BAND_UP,
  DOWN_FIGHT_HONOR,
  FAILED_ATTACK_PENALTY,
  UPSET_HONOR_SHARE,
  attackableRanks,
  rankIn,
  resolveLadderFight,
} from './ladder';
import {
  ACTIVE_HOUR_SHARE,
  MAX_REPLAY_DAYS,
  botHourlyXp,
  integrateProgress,
  simTick,
  type SimContext,
} from './simulate';
import {
  HEAT_FLOOR,
  HEAT_START,
  archetypeFor,
  decayHeat,
  heatAfterEncounter,
  markBeaten,
  updateRivals,
  type Rival,
} from './rivals';
import { FEED_CAPACITY, MAX_ENTRIES_PER_DAY, buildFeed, summariseAbsence } from './crier';

const SEED = 20260730;
const T0 = Date.parse('2026-08-01T00:00:00Z');
const DAY = 86_400_000;

const world = generateWorld(SEED, T0);

const context: SimContext = {
  playerRank: 700,
  rivalIds: [12, 45, 900],
  guildmateIds: [3, 88, 400],
};

describe('the reconciliation budget — ROADMAP acceptance', () => {
  it('replays a fortnight in well under a second', () => {
    const started = performance.now();
    const result = simTick(world, T0 + MAX_REPLAY_DAYS * DAY, context);
    const elapsed = performance.now() - started;

    expect(result.hoursReplayed).toBe(MAX_REPLAY_DAYS * 24);
    expect(elapsed, `${elapsed.toFixed(0)}ms`).toBeLessThan(1_000);
  });

  it('costs no more for a year away than for a fortnight', () => {
    // The whole point of integrating the prefix: an absence of any length is one load.
    const started = performance.now();
    const result = simTick(world, T0 + 365 * DAY, context);
    const elapsed = performance.now() - started;

    expect(result.integrated).toBe(true);
    expect(result.hoursReplayed).toBe(MAX_REPLAY_DAYS * 24);
    expect(elapsed, `${elapsed.toFixed(0)}ms`).toBeLessThan(1_000);
  });

  it('does nothing when there is nothing to do', () => {
    const result = simTick(world, T0, context);
    expect(result.world).toBe(world);
    expect(result.events).toEqual([]);
  });

  it('refuses to run backwards', () => {
    const result = simTick(world, T0 - 5 * DAY, context);
    expect(result.world).toBe(world);
  });
});

describe('determinism', () => {
  it('lands on the same world from the same inputs', () => {
    const a = simTick(world, T0 + 3 * DAY, context);
    const b = simTick(world, T0 + 3 * DAY, context);
    expect(a.world).toEqual(b.world);
    expect(a.events).toEqual(b.events);
  });

  it('is unaffected by iteration order within a tick', () => {
    // Bands are sets, and a bot's hour is keyed by `(seed, botId, hour)` — so shuffling who
    // gets processed first cannot change where anybody ends up.
    const shuffled: SimContext = { ...context, rivalIds: [900, 12, 45] };
    expect(simTick(world, T0 + 2 * DAY, shuffled).world.bots).toEqual(
      simTick(world, T0 + 2 * DAY, context).world.bots,
    );
  });

  it('gives different worlds different histories', () => {
    const other = generateWorld(SEED + 1, T0);
    expect(simTick(other, T0 + DAY, context).events).not.toEqual(
      simTick(world, T0 + DAY, context).events,
    );
  });
});

describe('progress integration', () => {
  it('composes — a fortnight in one step equals fourteen daily steps', () => {
    // This is what lets the closed-form path and the hour-by-hour path meet at the fourteen-day
    // boundary without a seam.
    const personality = botIdentity(SEED, 500).personality;
    const hoursPerDay = 24 * ACTIVE_HOUR_SHARE;

    const oneGo = integrateProgress(20, 0, 14 * hoursPerDay, personality);

    let stepwise = { level: 20, xp: 0 };
    for (let day = 0; day < 14; day += 1) {
      const step = integrateProgress(stepwise.level, stepwise.xp, hoursPerDay, personality);
      stepwise = { level: step.level, xp: step.xp };
    }

    expect(stepwise.level).toBe(oneGo.level);
    expect(stepwise.xp).toBeCloseTo(oneGo.xp, 3);
  });

  it('respects the rising XP wall rather than multiplying through it', () => {
    const personality = botIdentity(SEED, 500).personality;
    const short = integrateProgress(10, 0, 100, personality);
    const long = integrateProgress(10, 0, 1_000, personality);

    // Ten times the hours must not be ten times the levels.
    expect(long.gained).toBeGreaterThan(short.gained);
    expect(long.gained).toBeLessThan(short.gained * 10);
  });

  it('stops at the ceiling instead of running away', () => {
    const personality = botIdentity(SEED, 3).personality;
    const forever = integrateProgress(80, 0, 5_000_000, personality);
    expect(forever.level).toBeLessThanOrEqual(92);
  });

  it('anchors bot XP to the player’s own curve', () => {
    // Change `xpPerVigor` and the whole world re-paces with the player, which is what keeps a
    // pacing fix from silently leaving 1,500 heroes behind.
    const keen = { ...botIdentity(SEED, 500).personality, dedication: 1 };
    const idle = { ...keen, dedication: 0.2 };
    expect(botHourlyXp(30, keen, 0.5)).toBeGreaterThan(botHourlyXp(30, idle, 0.5) * 3);
  });
});

describe('the world actually moves', () => {
  const fortnight = simTick(world, T0 + MAX_REPLAY_DAYS * DAY, context);

  it('levels people up', () => {
    const before = world.bots;
    const levelled = fortnight.world.bots.filter((bot, i) => bot.level > before[i]!.level);
    expect(levelled.length).toBeGreaterThan(100);
  });

  it('churns the ladder without losing anybody', () => {
    expect(fortnight.world.ladder).toHaveLength(world.ladder.length);
    expect(new Set(fortnight.world.ladder).size).toBe(world.ladder.length);

    const moved = fortnight.world.ladder.filter((id, i) => world.ladder[i] !== id).length;
    expect(moved).toBeGreaterThan(20);
  });

  it('produces the events the feed is built from', () => {
    const kinds = new Set(fortnight.events.map((event) => event.kind));
    expect(kinds.has('levelUp')).toBe(true);
    expect(kinds.has('ladderPass')).toBe(true);
    expect(fortnight.events.length).toBeGreaterThan(50);
  });

  it('keeps every event inside the window it replayed', () => {
    for (const event of fortnight.events) {
      expect(event.at).toBeGreaterThanOrEqual(T0 - DAY);
      expect(event.at).toBeLessThanOrEqual(T0 + MAX_REPLAY_DAYS * DAY);
    }
  });

  it('never lets honor go negative', () => {
    for (const bot of fortnight.world.bots) {
      expect(bot.honor, `bot ${bot.id}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('spends its detail near the player', () => {
    // The level-of-detail promise: bots by the player churn, the far ones only progress.
    const near = fortnight.events.filter((event) => {
      const rank = rankOf(world, event.botId);
      return Math.abs(rank - context.playerRank) <= 100;
    });
    expect(near.length / Math.max(1, fortnight.events.length)).toBeGreaterThan(0.3);
  });
});

describe('the ladder service — balancing §10', () => {
  const order = [10, 20, 30, 40, 50];

  it('swaps places and takes honor on an upset', () => {
    const result = resolveLadderFight({
      order,
      attacker: { id: 40, honor: 1_000 },
      defender: { id: 20, honor: 5_000 },
      attackerWon: true,
    });

    expect(result.swapped).toBe(true);
    expect(result.order).toEqual([10, 40, 30, 20, 50]);
    expect(result.attackerHonor).toBe(1_000 + Math.round(5_000 * UPSET_HONOR_SHARE));
    expect(result.defenderHonor).toBe(5_000 - Math.round(5_000 * UPSET_HONOR_SHARE));
    expect(result.attackerRankAfter).toBe(2);
    expect(result.defenderRankAfter).toBe(4);
  });

  it('pays a token point for beating someone below you', () => {
    // Down-fighting should be boring, or the ladder becomes a farm.
    const result = resolveLadderFight({
      order,
      attacker: { id: 20, honor: 5_000 },
      defender: { id: 40, honor: 1_000 },
      attackerWon: true,
    });

    expect(result.swapped).toBe(false);
    expect(result.order).toBe(order);
    expect(result.attackerHonor).toBe(5_000 + DOWN_FIGHT_HONOR);
    expect(result.defenderHonor).toBe(1_000);
  });

  it('costs the attacker honor when the attack fails, and never rank', () => {
    const result = resolveLadderFight({
      order,
      attacker: { id: 40, honor: 1_000 },
      defender: { id: 20, honor: 5_000 },
      attackerWon: false,
    });

    expect(result.swapped).toBe(false);
    expect(result.attackerHonor).toBe(Math.round(1_000 * (1 - FAILED_ATTACK_PENALTY)));
    expect(result.defenderHonor).toBe(5_000);
    expect(result.attackerRankAfter).toBe(result.attackerRankBefore);
  });

  it('never drives honor below zero', () => {
    const result = resolveLadderFight({
      order,
      attacker: { id: 40, honor: 0 },
      defender: { id: 20, honor: 0 },
      attackerWon: false,
    });
    expect(result.attackerHonor).toBe(0);
  });

  it('only ever moves the two fighters', () => {
    // A day of thousands of bot fights must not be able to reshuffle a third party.
    const result = resolveLadderFight({
      order,
      attacker: { id: 50, honor: 100 },
      defender: { id: 10, honor: 900 },
      attackerWon: true,
    });
    expect([...result.order].sort((a, b) => a - b)).toEqual([...order].sort((a, b) => a - b));
    expect(result.order[2]).toBe(30);
  });

  it('refuses a fighter who is not on the ladder rather than inventing a rank', () => {
    const result = resolveLadderFight({
      order,
      attacker: { id: 999, honor: 100 },
      defender: { id: 10, honor: 900 },
      attackerWon: true,
    });
    expect(result.order).toBe(order);
    expect(result.attackerHonor).toBe(100);
  });

  it('bands attacks upward more generously than downward', () => {
    const band = attackableRanks(500, 1_500);
    expect(band.from).toBe(500 - ATTACK_BAND_UP);
    expect(band.to).toBeGreaterThan(500);
    expect(500 - band.from).toBeGreaterThan(band.to - 500);
  });

  it('clamps the band at the ends of the ladder', () => {
    expect(attackableRanks(3, 1_500).from).toBe(1);
    expect(attackableRanks(1_499, 1_500).to).toBe(1_500);
  });

  it('reports a missing id as one past the end', () => {
    expect(rankIn(order, 999)).toBe(order.length + 1);
  });
});

describe('rivals', () => {
  it('promotes two or three from near the player', () => {
    const update = updateRivals({
      world,
      playerRank: 700,
      current: [],
      now: T0,
      daysElapsed: 0,
    });

    expect(update.rivals.length).toBeGreaterThanOrEqual(2);
    expect(update.rivals.length).toBeLessThanOrEqual(3);
    for (const rival of update.rivals) {
      expect(Math.abs(rankOf(world, rival.botId) - 700)).toBeLessThanOrEqual(41);
    }
  });

  it('gives every rival an archetype', () => {
    const update = updateRivals({ world, playerRank: 700, current: [], now: T0, daysElapsed: 0 });
    for (const rival of update.rivals) {
      expect(rival.archetype).toBeTruthy();
      expect(rival.heat).toBe(HEAT_START);
    }
  });

  it('retires a rivalry once the player has climbed away from it', () => {
    // Distance is what ends a rivalry — nothing has to explicitly decide it is over.
    const [rival] = updateRivals({
      world,
      playerRank: 700,
      current: [],
      now: T0,
      daysElapsed: 0,
    }).rivals;

    const update = updateRivals({
      world,
      playerRank: 40,
      current: [rival!],
      now: T0 + 20 * DAY,
      daysElapsed: 20,
    });

    expect(update.retired.map((r) => r.botId)).toContain(rival!.botId);
    expect(update.rivals.map((r) => r.botId)).not.toContain(rival!.botId);
  });

  it('cools faster the further away the rival is', () => {
    expect(decayHeat(100, 5, 60)).toBeLessThan(decayHeat(100, 5, 2));
  });

  it('never cools below zero', () => {
    expect(decayHeat(10, 500, 100)).toBe(0);
  });

  it('heats up on an encounter, and more on an overtake', () => {
    const base = {
      botId: 1,
      archetype: 'veteran' as const,
      heat: 20,
      since: T0,
      everBeaten: false,
    };
    expect(heatAfterEncounter(base, false).heat).toBeGreaterThan(base.heat);
    expect(heatAfterEncounter(base, true).heat).toBeGreaterThan(
      heatAfterEncounter(base, false).heat,
    );
  });

  it('caps heat rather than letting a grind session run away with it', () => {
    let rival: Rival = {
      botId: 1,
      archetype: 'veteran',
      heat: 95,
      since: T0,
      everBeaten: false,
    };
    for (let i = 0; i < 10; i += 1) rival = heatAfterEncounter(rival, true);
    expect(rival.heat).toBe(100);
  });

  it('fires the first-win beat exactly once', () => {
    const base = {
      botId: 1,
      archetype: 'veteran' as const,
      heat: 50,
      since: T0,
      everBeaten: false,
    };
    const first = markBeaten(base);
    expect(first.firstTime).toBe(true);
    expect(markBeaten(first.rival).firstTime).toBe(false);
  });

  it('keeps a warm rivalry alive across a short absence', () => {
    const [rival] = updateRivals({
      world,
      playerRank: 700,
      current: [],
      now: T0,
      daysElapsed: 0,
    }).rivals;
    const update = updateRivals({
      world,
      playerRank: 700,
      current: [rival!],
      now: T0 + DAY,
      daysElapsed: 1,
    });
    expect(update.rivals.some((r) => r.botId === rival!.botId)).toBe(true);
    expect(update.rivals[0]!.heat).toBeGreaterThan(HEAT_FLOOR);
  });

  it('matches personalities to archetypes rather than picking at random', () => {
    const loud = archetypeFor({
      dedication: 0.5,
      aggression: 0.9,
      sociability: 1,
      hoarding: 0.2,
      volatility: 0.2,
    });
    const flaky = archetypeFor({
      dedication: 0.3,
      aggression: 0.2,
      sociability: 0.1,
      hoarding: 0.2,
      volatility: 1,
    });

    expect(loud).toBe('trash-talker');
    expect(flaky).toBe('ghost');
  });
});

describe('the Town Crier — ROADMAP acceptance: no invented news', () => {
  const run = simTick(world, T0 + 7 * DAY, context);
  const rivals = updateRivals({
    world: run.world,
    playerRank: 700,
    current: [],
    now: T0 + 7 * DAY,
    daysElapsed: 7,
  }).rivals;

  const crierContext = {
    world: run.world,
    rivals,
    playerRank: 700,
    playerGuildId: run.world.bots[3]!.guildId,
  };

  const feed = buildFeed({
    context: crierContext,
    events: run.events,
    now: T0 + 7 * DAY,
    days: 7,
  });

  it('produces a feed at all', () => {
    expect(feed.length).toBeGreaterThan(10);
  });

  it('backs every headline with a real sim delta', () => {
    // The audit. A hundred entries, each checked against the events the tick actually emitted —
    // if the Crier can speak without a delta, the feed is decoration rather than evidence.
    const emitted = new Set(run.events.map((event) => `${event.kind}:${event.botId}:${event.at}`));

    const sample = feed.slice(0, 100);
    expect(sample.length).toBeGreaterThanOrEqual(30);

    for (const entry of sample) {
      if (entry.category === 'flavour') {
        // The one category that is about the world rather than its people, and it says so.
        expect(entry.sourceEvent, entry.text).toBeNull();
        continue;
      }

      expect(entry.sourceEvent, entry.text).not.toBeNull();
      const source = entry.sourceEvent!;

      if (entry.category === 'taunt') {
        // A taunt reports the rivalry, which is real state rather than a tick delta.
        expect(
          rivals.some((rival) => rival.botId === source.botId),
          entry.text,
        ).toBe(true);
        continue;
      }

      expect(
        emitted.has(`${source.kind}:${source.botId}:${source.at}`),
        `orphaned headline: ${entry.text}`,
      ).toBe(true);
    }
  });

  it('never renders an unfilled slot', () => {
    for (const entry of feed) {
      expect(entry.text, entry.id).not.toMatch(/\{[a-z]+\}/i);
    }
  });

  it('spends its slots on names the player knows', () => {
    const known = feed.filter(
      (entry) => entry.relation === 'rival' || entry.relation === 'guildmate',
    );
    const strangers = feed.filter((entry) => entry.relation === 'stranger');
    expect(known.length).toBeGreaterThan(0);
    // Not a hard cut — a stranger taking rank one still outranks a guildmate levelling — but
    // the feed must not be mostly people the player has never heard of.
    expect(strangers.length).toBeLessThan(feed.length * 0.8);
  });

  it('honours the daily cap', () => {
    const oneDay = simTick(world, T0 + DAY, context);
    const capped = buildFeed({
      context: { ...crierContext, world: oneDay.world },
      events: oneDay.events,
      now: T0 + DAY,
      days: 1,
    });
    expect(capped.length).toBeLessThanOrEqual(MAX_ENTRIES_PER_DAY + 1);
  });

  it('does not let one category run away with the board', () => {
    // Pure score ranking gave fourteen ladder passes and nothing else: the sim emits about
    // twice as many of those as level-ups and they score higher. Every line being true does not
    // stop the board being wallpaper.
    const counts = new Map<string, number>();
    for (const entry of feed) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);

    const biggest = Math.max(...counts.values());
    expect(biggest / feed.length, [...counts].map(([k, v]) => `${k} ${v}`).join(' ')).toBeLessThan(
      0.75,
    );
    expect(counts.size).toBeGreaterThan(1);
  });

  it('still fills the board on a genuinely one-note day', () => {
    // Diversity is a preference, not a quota — entries held back for variety are used to fill
    // the remainder rather than thrown away.
    const oneNote = run.events.filter((event) => event.kind === 'levelUp').slice(0, 60);
    const built = buildFeed({
      context: crierContext,
      events: oneNote,
      now: T0 + 7 * DAY,
      days: 1,
    });
    expect(built.length).toBeGreaterThan(10);
  });

  it('sorts newest first', () => {
    for (let i = 1; i < feed.length; i += 1) {
      expect(feed[i]!.at).toBeLessThanOrEqual(feed[i - 1]!.at);
    }
  });

  it('de-duplicates when merged with an existing feed', () => {
    const merged = buildFeed({
      context: crierContext,
      events: run.events,
      existing: feed,
      now: T0 + 7 * DAY,
      days: 7,
    });
    expect(new Set(merged.map((entry) => entry.id)).size).toBe(merged.length);
  });

  it('caps the stored feed', () => {
    let accumulated = feed;
    for (let week = 1; week <= 8; week += 1) {
      const later = simTick(run.world, T0 + (7 + week * 7) * DAY, context);
      accumulated = buildFeed({
        context: { ...crierContext, world: later.world },
        events: later.events,
        existing: accumulated,
        now: T0 + (7 + week * 7) * DAY,
        days: 7,
      });
    }
    expect(accumulated.length).toBeLessThanOrEqual(FEED_CAPACITY);
  });

  it('says something even on a dead-quiet day', () => {
    const quiet = buildFeed({ context: crierContext, events: [], now: T0, days: 1 });
    expect(quiet.length).toBeGreaterThan(0);
  });

  it('has a template for every category it can emit', () => {
    const categories = new Set(CRIER_TEMPLATES.map((template) => template.category));
    for (const needed of ['levelUp', 'ladder', 'milestone', 'taunt', 'lifecycle', 'flavour']) {
      expect(categories.has(needed as never), needed).toBe(true);
    }
  });
});

describe('the absence summary', () => {
  it('counts what happened while the player was away', () => {
    const run = simTick(world, T0 + 10 * DAY, context);
    const summary = summariseAbsence(run.events, [], 10, -4);

    expect(summary.days).toBe(10);
    expect(summary.levelUps).toBe(run.events.filter((e) => e.kind === 'levelUp').length);
    expect(summary.ladderMoves).toBe(run.events.filter((e) => e.kind === 'ladderPass').length);
    expect(summary.rankDrift).toBe(-4);
  });

  it('has no headline when nothing happened', () => {
    expect(summariseAbsence([], [], 1, 0).headline).toBeNull();
  });
});
