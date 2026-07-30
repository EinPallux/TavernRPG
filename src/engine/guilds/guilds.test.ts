/**
 * Guild engine tests.
 *
 * Three acceptance criteria live here. **Buffs are verifiably applied** to mission and patrol
 * payouts rather than merely stored. **Chat references real events only** — the same audit the
 * Crier gets, because the moment a hall can speak without a delta behind it, it stops being
 * evidence and becomes wallpaper. And **bots apply at the spec'd rate**, which is a statistical
 * claim and needs a statistical test.
 */

import { describe, expect, it } from 'vitest';
import { weekKeyFor } from '@/engine/clock';
import { generateWorld, type WorldState } from '@/engine/world/generate';
import { botIdentity } from '@/engine/world/identity';
import { PLAYER_LADDER_ID, joinLadder } from '@/engine/world/ladder';
import { simTick } from '@/engine/world/simulate';
import { missionPayout, xpPatrolPerHour, goldPatrolPerHour } from '@/engine/progression/rewards';
import { xpNeeded } from '@/engine/progression/xp';
import { patrolEarnings } from '@/engine/patrol/patrol';
import { BOUNTIES, bountyById, bountyTarget } from '@/data/bounties';
import { GUILD_COUNT } from '@/data/guilds';
import { VIBE_TAGS } from '@/data/guildChat';
import {
  BONUS_PER_STEP,
  DICE_GOLD_EQUIVALENT,
  MAX_STEPS,
  applyDonation,
  bonusFor,
  donationValue,
  guildMultipliers,
  stepCost,
  stepsAffordable,
  totalCostThrough,
} from './buffs';
import {
  DECISION_MAX_MS,
  DECISION_MIN_MS,
  GUILD_CAPACITY,
  REAPPLY_COOLDOWN_MS,
  applicantsPerDay,
  applyToGuild,
  browseGuilds,
  decideApplication,
  derivedTracks,
  guildProfile,
  requirementsFor,
  resumeFor,
  rollApplicants,
  vibeFor,
} from './membership';
import {
  PARTIAL_THRESHOLD,
  bountyForDay,
  contribute,
  drawBounty,
  playerWeight,
  settleBounty,
  simulateBotContribution,
  viewBounty,
} from './bounty';
import {
  CHAT_CAPACITY,
  MAX_MESSAGES_PER_DAY,
  MIN_MESSAGES_PER_DAY,
  generateChat,
  isAwake,
  mergeChat,
  messagesPerDay,
  readIntent,
  replyToPlayer,
  systemMessage,
} from './chat';

const SEED = 20_260_801;
const T0 = Date.parse('2026-08-03T09:00:00Z'); // A Monday.
const DAY = 86_400_000;

const base = generateWorld(SEED, T0);
const world: WorldState = { ...base, ladder: joinLadder(base.ladder) };

/**
 * A hall with a roster worth reading *and* a place free.
 *
 * The generator fills halls right up to the cap, so a naive "biggest guild" pick lands on a full
 * one and tests "sorry, we are full" over and over instead of the paths that matter.
 */
const populated = world.guilds.find(
  (record) => record.memberIds.length >= 8 && record.memberIds.length < GUILD_CAPACITY,
)!;

describe('the two buff tracks', () => {
  it('prices steps superlinearly, so the cap cannot be bought in a week', () => {
    expect(stepCost(1)).toBe(500);
    expect(stepCost(10)).toBeGreaterThan(stepCost(1) * 10);
    // The last step should cost dramatically more than the first — that is the whole shape.
    expect(stepCost(MAX_STEPS)).toBeGreaterThan(stepCost(1) * 40);
    expect(stepCost(MAX_STEPS + 1)).toBe(Infinity);
  });

  it('caps at +25%', () => {
    expect(bonusFor(0)).toBe(1);
    expect(bonusFor(MAX_STEPS)).toBeCloseTo(1 + BONUS_PER_STEP * MAX_STEPS, 10);
    expect(bonusFor(MAX_STEPS)).toBeCloseTo(1.25, 10);
    // Past the cap it stops, rather than continuing quietly.
    expect(bonusFor(MAX_STEPS + 50)).toBe(bonusFor(MAX_STEPS));
  });

  it('never spends more than it was given, and carries the remainder', () => {
    const pool = totalCostThrough(4) + 123;
    const { steps, spent, remainder } = stepsAffordable(0, pool);

    expect(steps).toBe(4);
    expect(spent).toBe(totalCostThrough(4));
    expect(remainder).toBe(123);
    expect(spent + remainder).toBe(pool);
  });

  it('saves toward a step it cannot yet afford rather than losing the gold', () => {
    // The reason a hall of five is viable at all: donations accumulate.
    const first = applyDonation({ step: 0, pool: 0, amount: 300 });
    expect(first.stepsGained).toBe(0);
    expect(first.pool).toBe(300);

    const second = applyDonation({ step: first.step, pool: first.pool, amount: 300 });
    expect(second.stepsGained).toBe(1);
    expect(second.step).toBe(1);
    expect(second.pool).toBe(100);
  });

  it('values a Golden Die at its stated gold', () => {
    expect(donationValue(100, 2)).toBe(100 + 2 * DICE_GOLD_EQUIVALENT);
    expect(donationValue(-50, -1)).toBe(0);
  });

  it('pays nothing to somebody who is not in the hall', () => {
    expect(guildMultipliers({ isMember: false, treasuryStep: 100, drillmasterStep: 100 })).toEqual({
      gold: 1,
      xp: 1,
    });
  });

  it('applies to the mission payout the player is actually shown — ROADMAP acceptance', () => {
    const level = 30;
    const plain = missionPayout(level, 20, xpNeeded(level));
    const buffed = missionPayout(
      level,
      20,
      xpNeeded(level),
      guildMultipliers({ isMember: true, treasuryStep: 40, drillmasterStep: 20 }),
    );

    // Treasury 40 is +10% gold; Drillmaster 20 is +5% XP. Rounding aside, exactly that.
    expect(buffed.gold).toBe(Math.round(plain.gold * 1.1));
    expect(buffed.xp).toBe(Math.round(plain.xp * 1.05));
    // And the tracks do not leak into each other.
    expect(buffed.gold / plain.gold).toBeGreaterThan(buffed.xp / plain.xp);
  });

  it('applies to patrol earnings too — ROADMAP acceptance', () => {
    const shift = { startedAt: T0, endsAt: T0 + 8 * 3_600_000, hours: 8, heroLevel: 30 };
    const at = T0 + 8 * 3_600_000;
    const plain = patrolEarnings(shift, at, xpNeeded(30));
    const buffed = patrolEarnings(
      shift,
      at,
      xpNeeded(30),
      guildMultipliers({ isMember: true, treasuryStep: 100, drillmasterStep: 100 }),
    );

    expect(plain.gold).toBe(Math.floor(goldPatrolPerHour(30) * 8));
    expect(buffed.gold).toBe(Math.floor(goldPatrolPerHour(30) * 8 * 1.25));
    expect(buffed.xp).toBe(Math.floor(xpPatrolPerHour(30, xpNeeded(30)) * 8 * 1.25));
  });
});

describe('the sixty halls', () => {
  it('all have a card, and it is stable', () => {
    const list = browseGuilds(world);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(GUILD_COUNT);
    expect(browseGuilds(world)).toEqual(list);
  });

  it('differ from one another in more than their names', () => {
    const list = browseGuilds(world);
    // A browse list of sixty near-identical rows is the failure the whole derivation exists to
    // avoid, and it is easy to ship by accident: an earlier scoring pass against hardcoded
    // midpoints labelled fifty-eight of sixty "early risers", and a second against the whole bot
    // population made thirty-five of them "cozy". Scoring halls against *halls* is what fixes it,
    // so the test asserts the outcome that proves it: every tag in use, none of them swamping.
    const counts = new Map<string, number>();
    for (const hall of list) counts.set(hall.vibe, (counts.get(hall.vibe) ?? 0) + 1);

    expect(counts.size).toBe(VIBE_TAGS.length);
    expect(Math.max(...counts.values())).toBeLessThan(list.length * 0.35);

    expect(new Set(list.map((hall) => hall.requirements.minLevel)).size).toBeGreaterThan(3);
    expect(new Set(list.map((hall) => hall.treasuryStep)).size).toBeGreaterThan(3);
  });

  it('sets the bar off its own roster', () => {
    const requirements = requirementsFor(world, populated.memberIds);
    const levels = populated.memberIds.map((id) => world.bots[id]!.level).sort((a, b) => a - b);

    // Under the middle of the hall, but not far under — and never above its best member.
    expect(requirements.minLevel).toBeLessThanOrEqual(levels[Math.floor(levels.length / 2)]!);
    expect(requirements.minLevel).toBeLessThanOrEqual(levels.at(-1)!);
    expect(requirements.minLevel % 5).toBe(0);
  });

  it('calls an empty hall quiet rather than crashing on it', () => {
    expect(vibeFor(world, [])).toBe('quiet');
    expect(requirementsFor(world, [])).toEqual({ minLevel: 1, minHonor: 0 });
  });

  it('never generates a hall over its own capacity', () => {
    // Phase 8 did not know about the cap, and the Guild Hall's browse list duly opened on five
    // halls advertising "78/25 members" — a number that reads as a bug from across the room.
    for (const record of world.guilds) {
      expect(record.memberIds.length, `guild ${record.id}`).toBeLessThanOrEqual(GUILD_CAPACITY);
    }
  });

  it('gives the sixty buffs worth choosing between — balancing §11', () => {
    // The economic heart of guilds: joining the best-funded hall has to be visibly better than
    // joining the worst. The Phase 8 seeded treasury predated `stepCost` and left every hall at
    // +1.25%, which made the whole browse list a formality.
    const list = browseGuilds(world);
    const gold = list.map((hall) => hall.treasuryStep * BONUS_PER_STEP).sort((a, b) => b - a);

    // A well-established hall is somewhere near the spec's "~+15% by month 2"…
    expect(gold[0]!).toBeGreaterThan(0.09);
    expect(gold[0]!).toBeLessThanOrEqual(0.25);
    // …and the spread between best and worst is a real decision, not rounding.
    expect(gold[0]! / gold.at(-1)!).toBeGreaterThan(2);
  });

  it('reads buff steps off the treasury the world already tracks', () => {
    const profile = guildProfile(world, populated.id)!;
    expect(profile.treasuryStep + profile.drillmasterStep).toBeGreaterThan(0);
    // Two tracks out of one pot: a hall cannot have maxed both from a ninety-day treasury.
    expect(profile.treasuryStep).toBeLessThan(MAX_STEPS);
  });

  it('keeps the change, so a donation into one of the sixty still lands somewhere', () => {
    // A hall's pot has seven digits in it and its next step costs six, so without the remainder
    // the player gives ten thousand gold and every number on the screen stays exactly the same.
    const tracks = derivedTracks(world.seed, populated);
    for (const track of ['treasury', 'drillmaster'] as const) {
      expect(tracks[track].pool).toBeGreaterThanOrEqual(0);
      expect(tracks[track].pool).toBeLessThan(stepCost(tracks[track].step + 1));
    }
    // And the two together are the treasury the world actually holds, to within rounding.
    const banked =
      totalCostThrough(tracks.treasury.step) +
      totalCostThrough(tracks.drillmaster.step) +
      tracks.treasury.pool +
      tracks.drillmaster.pool;
    expect(Math.abs(banked - populated.treasury)).toBeLessThanOrEqual(2);
  });
});

describe('applying to a hall', () => {
  const guildId = populated.id;
  const requirements = requirementsFor(world, populated.memberIds);
  const qualified = {
    world,
    guildId,
    heroLevel: requirements.minLevel + 5,
    heroHonor: requirements.minHonor + 500,
    now: T0,
    inGuild: false,
    pending: null,
    refusedAt: {},
  } as const;

  it('takes 5 to 90 minutes to hear back', () => {
    const result = applyToGuild(qualified);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wait = result.application.decidesAt - T0;
    expect(wait).toBeGreaterThanOrEqual(DECISION_MIN_MS);
    expect(wait).toBeLessThanOrEqual(DECISION_MAX_MS);
  });

  it('refuses somebody under the bar, and says what the bar is', () => {
    const result = applyToGuild({ ...qualified, heroLevel: 1, heroHonor: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe('below-requirements');
    if (result.refusal.kind !== 'below-requirements') return;
    expect(result.refusal.requirements).toEqual(requirements);
  });

  it('refuses a second application while one is pending', () => {
    const first = applyToGuild(qualified);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyToGuild({ ...qualified, pending: first.application });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.refusal.kind).toBe('already-applied');
  });

  it('holds a refused door shut for a day, then opens it again', () => {
    const refusedAt = { [guildId]: T0 - 60_000 };
    const tooSoon = applyToGuild({ ...qualified, refusedAt });
    expect(tooSoon.ok).toBe(false);

    const later = applyToGuild({ ...qualified, refusedAt, now: T0 + REAPPLY_COOLDOWN_MS });
    // Never locks reapplication (spec §1) — it just asks you to wait.
    expect(later.ok).toBe(true);
  });

  it('turns away a hall that is already full', () => {
    const full: WorldState = {
      ...world,
      guilds: world.guilds.map((record) =>
        record.id === guildId
          ? { ...record, memberIds: Array.from({ length: GUILD_CAPACITY }, (_, i) => i) }
          : record,
      ),
    };
    const result = applyToGuild({ ...qualified, world: full });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe('full');
  });

  it('says nothing before the answer is due', () => {
    const result = applyToGuild(qualified);
    if (!result.ok) return;
    expect(
      decideApplication({
        world,
        application: result.application,
        heroLevel: qualified.heroLevel,
        now: result.application.decidesAt - 1,
      }),
    ).toBeNull();
  });

  it('gives the same answer however many times it is asked', () => {
    const result = applyToGuild(qualified);
    if (!result.ok) return;
    const ask = () =>
      decideApplication({
        world,
        application: result.application,
        heroLevel: qualified.heroLevel,
        now: result.application.decidesAt,
      });
    // Otherwise reloading the tab is a re-roll on a rejection.
    expect(ask()).toEqual(ask());
  });

  it('phrases a refusal as flavour, never as a scolding', () => {
    let refused = 0;
    for (let minute = 0; minute < 60 && refused < 3; minute += 1) {
      const applied = applyToGuild({ ...qualified, now: T0 + minute * 60_000 });
      if (!applied.ok) continue;
      const decision = decideApplication({
        world,
        application: applied.application,
        heroLevel: qualified.heroLevel,
        now: applied.application.decidesAt,
      });
      if (!decision || decision.accepted) continue;
      refused += 1;
      expect(decision.reason).not.toMatch(/\{[a-z]+\}/);
      expect(decision.reason.length).toBeGreaterThan(10);
    }
    expect(refused).toBeGreaterThan(0);
  });

  it('prefers an applicant who fits the roster to one who merely outranks it', () => {
    // A level-90 applying to a hall of level-20s is as odd a fit as the reverse.
    const levels = populated.memberIds.map((id) => world.bots[id]!.level).sort((a, b) => a - b);
    const median = levels[Math.floor(levels.length / 2)]!;

    const oddsAt = (heroLevel: number) => {
      let accepted = 0;
      let asked = 0;
      for (let minute = 0; minute < 80; minute += 1) {
        const applied = applyToGuild({ ...qualified, heroLevel, now: T0 + minute * 60_000 });
        if (!applied.ok) continue;
        const decision = decideApplication({
          world,
          application: applied.application,
          heroLevel,
          now: applied.application.decidesAt,
        });
        if (!decision) continue;
        asked += 1;
        if (decision.accepted) accepted += 1;
      }
      return asked > 0 ? accepted / asked : 0;
    };

    expect(oddsAt(median)).toBeGreaterThan(oddsAt(median + 60));
  });
});

describe('founding, and the bots who come knocking', () => {
  it('scales interest with the founder’s standing', () => {
    const size = world.ladder.length;
    expect(applicantsPerDay(50, size, 1)).toBeGreaterThan(applicantsPerDay(1_400, size, 1));
  });

  it('loses interest as the hall fills', () => {
    const size = world.ladder.length;
    expect(applicantsPerDay(200, size, 1)).toBeGreaterThan(
      applicantsPerDay(200, size, GUILD_CAPACITY - 2),
    );
  });

  it('reaches roughly eight to twelve members by week two — ROADMAP acceptance', () => {
    // A statistical claim from the spec, so a statistical test. Run the fortnight the way the
    // load path would: day by day, feeding the roster back in.
    let members: number[] = [PLAYER_LADDER_ID];
    let lastRollDay = Math.floor((T0 - DAY) / DAY);

    for (let day = 0; day < 14; day += 1) {
      const from = T0 + day * DAY;
      const rolled = rollApplicants({
        world,
        playerRank: 400,
        memberIds: members,
        from,
        to: from + DAY,
        lastRollDay,
      });
      lastRollDay = rolled.lastRollDay;
      // Every applicant accepted, which is the upper bound the spec's range describes.
      members = [...members, ...rolled.applicants.map((a) => a.botId)];
    }

    expect(members.length - 1).toBeGreaterThanOrEqual(8);
    expect(members.length - 1).toBeLessThanOrEqual(12);
  });

  it('brings the first applicants within hours, not days', () => {
    const firstDay = rollApplicants({
      world,
      playerRank: 400,
      memberIds: [PLAYER_LADDER_ID],
      from: T0,
      to: T0 + DAY,
      lastRollDay: Math.floor((T0 - DAY) / DAY),
    });
    expect(firstDay.applicants.length).toBeGreaterThan(0);
  });

  it('rolls a day once, however many times the save is reconciled', () => {
    // The same trap arena raids fell into: the roll is seeded by the day, so re-running it
    // produces the same applicants — and applying them twice doubles the hall's intake.
    const first = rollApplicants({
      world,
      playerRank: 400,
      memberIds: [PLAYER_LADDER_ID],
      from: T0,
      to: T0 + 2 * DAY,
      lastRollDay: 0,
    });
    const again = rollApplicants({
      world,
      playerRank: 400,
      memberIds: [PLAYER_LADDER_ID, ...first.applicants.map((a) => a.botId)],
      from: T0,
      to: T0 + 2 * DAY,
      lastRollDay: first.lastRollDay,
    });
    expect(again.applicants).toEqual([]);
  });

  it('never offers the same bot twice, or one who already has a hall', () => {
    const rolled = rollApplicants({
      world,
      playerRank: 100,
      memberIds: [PLAYER_LADDER_ID],
      from: T0,
      to: T0 + 10 * DAY,
      lastRollDay: 0,
    });
    const ids = rolled.applicants.map((a) => a.botId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(world.bots[id]?.guildId).toBe(-1);
  });

  it('writes a resume the Guildmaster can read', () => {
    const rolled = rollApplicants({
      world,
      playerRank: 100,
      memberIds: [PLAYER_LADDER_ID],
      from: T0,
      to: T0 + 3 * DAY,
      lastRollDay: 0,
    });
    const resume = resumeFor(world, rolled.applicants[0]!)!;

    expect(resume.name.length).toBeGreaterThan(0);
    expect(resume.level).toBeGreaterThan(0);
    expect(resume.rank).toBeGreaterThan(0);
    expect(resume.activity).toMatch(/plays|on|hard/);
  });
});

describe('the weekly bounty', () => {
  const monday = '2026-08-03';
  const sunday = weekKeyFor(monday);

  it('draws the same bounty for everyone, all week', () => {
    const drawn = drawBounty(SEED, sunday, 12);
    expect(drawBounty(SEED, sunday, 12)).toEqual(drawn);
    expect(BOUNTIES.some((bounty) => bounty.id === drawn.bountyId)).toBe(true);
    expect(drawn.weekKey).toBe(sunday);
  });

  it('asks a hall of three for less than a hall of twenty-five', () => {
    expect(drawBounty(SEED, sunday, 25).target).toBeGreaterThan(drawBounty(SEED, sunday, 3).target);
  });

  it('keeps the week’s bounty until the week turns', () => {
    const first = bountyForDay(SEED, monday, 12, null);
    expect(bountyForDay(SEED, '2026-08-06', 12, first)).toBe(first);
    // Next Monday is a different Sunday, and therefore a different bounty.
    expect(bountyForDay(SEED, '2026-08-10', 12, first).weekKey).not.toBe(first.weekKey);
  });

  it('counts the player’s own work, and only for the metric on the poster', () => {
    const state = drawBounty(SEED, sunday, 10);
    const wrong = contribute(state, state.bountyId === 'contracts' ? 'arenaWins' : 'missions', 5);
    const right = contribute(state, BOUNTIES.find((b) => b.id === state.bountyId)!.metric, 5);

    expect(right.playerUnits).toBe(5);
    expect(wrong.playerUnits === 0 || wrong.playerUnits === 5).toBe(true);
  });

  it('weights a solo founder’s week more than a full hall’s member', () => {
    // The lever that keeps a hall of three viable (spec §4).
    expect(playerWeight(1)).toBeGreaterThan(playerWeight(GUILD_CAPACITY));
    expect(playerWeight(GUILD_CAPACITY)).toBe(1);
  });

  it('simulates the hall’s own contribution off who is in it', () => {
    const contracts = bountyById('contracts')!;
    const keen = simulateBotContribution({
      world,
      memberIds: populated.memberIds,
      definition: contracts,
      from: T0,
      to: T0 + 5 * DAY,
      lastRollDay: 0,
    });
    expect(keen.units).toBeGreaterThan(0);
    expect(keen.byBot.size).toBeGreaterThan(0);

    // And never twice for the same day.
    const again = simulateBotContribution({
      world,
      memberIds: populated.memberIds,
      definition: contracts,
      from: T0,
      to: T0 + 5 * DAY,
      lastRollDay: keen.lastRollDay,
    });
    expect(again.units).toBe(0);
  });

  /**
   * The bounty is co-operative or it is nothing, and this is the assertion that says so in
   * numbers. A hall's own week has to land the poster in the band where the *player* decides the
   * outcome: comfortably past half so a member who shows up can finish it, and short of the
   * target so a member who does not show up costs them the full chest.
   *
   * It caught a real one. Whole-number metrics — three arena wins a week is 0.43 a day — were
   * being floored per bot per day, so twenty-five members contributed zero and the poster read
   * 0/44 forever. Every metric is checked because the failure was invisible on `missions` and
   * `patrolHours`, whose numbers are large enough to survive the rounding that killed the rest.
   */
  it('leaves the week close enough that the player decides it, on every bounty', () => {
    const to = T0 + 30 * DAY;
    const members = populated.memberIds.length + 1;

    // Every bounty in the pool, so a generous definition cannot hide a mean one.
    for (const definition of BOUNTIES) {
      const { units } = simulateBotContribution({
        world,
        memberIds: populated.memberIds,
        definition,
        from: to - 7 * DAY,
        to,
        lastRollDay: Math.floor((to - 7 * DAY) / DAY),
      });

      const share = units / bountyTarget(definition, members);
      const where = `${definition.id} left the hall at ${Math.round(share * 100)}%`;
      // Past the half-chest line on its own…
      expect(share, where).toBeGreaterThan(PARTIAL_THRESHOLD);
      // …and short of the full one, so the player's week is what finishes it.
      expect(share, where).toBeLessThan(1);
    }
  });

  it('pays a full chest on a clear and half on a near miss — ROADMAP acceptance', () => {
    const state = drawBounty(SEED, sunday, 10);

    const cleared = settleBounty({
      state: { ...state, botUnits: state.target },
      today: sunday,
      memberCount: 10,
      heroLevel: 40,
    })!;
    expect(cleared.full).toBe(true);
    expect(cleared.dice).toBe(1);
    expect(cleared.gold).toBeGreaterThan(0);

    const near = settleBounty({
      state: { ...state, botUnits: Math.ceil(state.target * (PARTIAL_THRESHOLD + 0.05)) },
      today: sunday,
      memberCount: 10,
      heroLevel: 40,
    })!;
    expect(near.full).toBe(false);
    expect(near.gold).toBe(Math.round(cleared.gold * 0.5));

    const missed = settleBounty({
      state: { ...state, botUnits: Math.floor(state.target * 0.2) },
      today: sunday,
      memberCount: 10,
      heroLevel: 40,
    })!;
    expect(missed.gold).toBe(0);
    expect(missed.dice).toBe(0);
  });

  it('judges on the Sunday and never twice', () => {
    const state = { ...drawBounty(SEED, sunday, 10), botUnits: 99_999 };
    expect(settleBounty({ state, today: '2026-08-07', memberCount: 10, heroLevel: 40 })).toBeNull();
    expect(settleBounty({ state, today: sunday, memberCount: 10, heroLevel: 40 })).not.toBeNull();
    expect(
      settleBounty({ state: { ...state, settled: true }, today: sunday, memberCount: 10, heroLevel: 40 }),
    ).toBeNull();
  });

  it('shows a bar the player can read', () => {
    const state = { ...drawBounty(SEED, sunday, 10), botUnits: 0, playerUnits: 0 };
    const empty = viewBounty(state, 10)!;
    expect(empty.share).toBe(0);
    expect(empty.title).not.toContain('{target}');

    const half = viewBounty({ ...state, botUnits: Math.round(state.target / 2) }, 10)!;
    expect(half.share).toBeGreaterThan(0.4);
    expect(half.share).toBeLessThan(0.6);
    expect(half.complete).toBe(false);
  });
});

describe('guild chat', () => {
  const members = populated.memberIds;
  const guildName = 'The Amber Blades';

  /** A real tick, so the events under the chat are ones the simulation actually produced. */
  const ticked = simTick(world, T0 + 2 * DAY, { playerRank: 400, rivalIds: [], guildmateIds: [...members] });

  it('says between six and twenty things a day, by how chatty the hall is', () => {
    const rate = messagesPerDay(world, members);
    expect(rate).toBeGreaterThanOrEqual(MIN_MESSAGES_PER_DAY);
    expect(rate).toBeLessThanOrEqual(MAX_MESSAGES_PER_DAY);
  });

  it('goes quiet while its members are asleep', () => {
    // A hall of northerners stops at the same time every night, which is what makes 3am feel
    // like 3am rather than like a feature being switched off.
    const threeAm = Date.parse('2026-08-04T03:00:00');
    const noon = Date.parse('2026-08-04T12:00:00');
    expect(isAwake(noon, 0)).toBe(true);
    expect(isAwake(threeAm, 0)).toBe(false);
  });

  it('only ever talks about things that happened — ROADMAP acceptance', () => {
    const { messages } = generateChat({
      world,
      memberIds: members,
      guildName,
      events: ticked.events,
      from: T0,
      to: T0 + 2 * DAY,
      lastChatDay: 0,
    });

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      if (message.sourceEvent === null) {
        // The carve-out, and it is narrow: colour and hellos, never a claim.
        expect(['idle', 'greeting', 'reply'], message.text).toContain(message.category);
        continue;
      }
      // Every other line names somebody the simulation actually moved.
      expect(members, message.text).toContain(message.sourceEvent.botId);
      expect(ticked.events, message.text).toContain(message.sourceEvent);
    }
  });

  it('never ships a message with a hole in it', () => {
    const { messages } = generateChat({
      world,
      memberIds: members,
      guildName,
      events: ticked.events,
      from: T0,
      to: T0 + 2 * DAY,
      lastChatDay: 0,
    });
    for (const message of messages) expect(message.text).not.toMatch(/\{[a-z]+\}/);
  });

  it('fills the log once, not once per reload', () => {
    const first = generateChat({
      world,
      memberIds: members,
      guildName,
      events: ticked.events,
      from: T0,
      to: T0 + 2 * DAY,
      lastChatDay: 0,
    });
    const again = generateChat({
      world,
      memberIds: members,
      guildName,
      events: ticked.events,
      from: T0,
      to: T0 + 2 * DAY,
      lastChatDay: first.lastChatDay,
    });
    expect(again.messages).toEqual([]);
  });

  /**
   * The tell this whole module exists to avoid, measured.
   *
   * Colour comes from thirty-two lines narrowed again by voice, so an unconstrained pick over a
   * three-day catch-up put "Evening. Anyone still up?" on the screen four times — nothing wrong
   * with the roll, just what a small pool looks like when the player can see all of it at once.
   * Two properties keep the log reading like a room: most of what is said is said once, and
   * nobody follows themselves while there is anybody else awake.
   */
  it('does not repeat itself, and nobody talks to themselves', () => {
    const { messages } = generateChat({
      world,
      memberIds: members,
      guildName,
      events: [],
      from: T0,
      to: T0 + 3 * DAY,
      lastChatDay: 0,
    });
    expect(messages.length).toBeGreaterThan(20);

    const seen = new Map<string, number>();
    for (const message of messages) seen.set(message.text, (seen.get(message.text) ?? 0) + 1);
    const worst = Math.max(...seen.values());

    expect(seen.size / messages.length).toBeGreaterThan(0.6);
    expect(worst, 'one line said too many times in three days').toBeLessThanOrEqual(3);

    for (let i = 1; i < messages.length; i += 1) {
      const before = messages[i - 1]!.author;
      const after = messages[i]!.author;
      if (before.kind !== 'bot' || after.kind !== 'bot') continue;
      expect(after.botId, messages[i]!.text).not.toBe(before.botId);
    }
  });

  it('reads what the player said, crudely and on purpose', () => {
    expect(readIntent('hey all')).toBe('greeting');
    expect(readIntent('finally hit 40!')).toBe('brag');
    expect(readIntent('lost again, ugh')).toBe('grumble');
    expect(readIntent('anyone know where to farm essence?')).toBe('question');
    expect(readIntent('the weather is nice')).toBe('chatter');
  });

  it('answers a greeting with a greeting and a brag with grats or a ribbing', () => {
    const noon = Date.parse('2026-08-04T12:00:00');
    const replies = replyToPlayer({
      world,
      memberIds: members,
      playerName: 'Kargath',
      text: 'hey all',
      at: noon,
    });

    // At most a couple answer — a hall where everyone replies to everything is a hall of bots.
    expect(replies.length).toBeLessThanOrEqual(2);
    for (const reply of replies) {
      expect(reply.category).toBe('reply');
      expect(reply.at).toBeGreaterThan(noon);
      expect(reply.text).not.toMatch(/\{[a-z]+\}/);
    }
  });

  it('says nothing at all when everybody is asleep', () => {
    const threeAm = Date.parse('2026-08-04T03:00:00');
    const sleepers = members.filter(
      (id) => Math.abs(botIdentity(world.seed, id).timezoneOffset) < 3,
    );
    if (sleepers.length === 0) return;
    const replies = replyToPlayer({
      world,
      memberIds: sleepers,
      playerName: 'Kargath',
      text: 'anyone up?',
      at: threeAm,
    });
    expect(replies).toEqual([]);
  });

  it('keeps the last two hundred, in order', () => {
    const many = Array.from({ length: CHAT_CAPACITY + 40 }, (_, i) =>
      systemMessage(T0 + i * 1_000, `line ${i}`, `sys-${i}`),
    );
    const merged = mergeChat([], many);

    expect(merged).toHaveLength(CHAT_CAPACITY);
    expect(merged.at(-1)!.id).toBe(`sys-${CHAT_CAPACITY + 39}`);
    for (let i = 1; i < merged.length; i += 1) {
      expect(merged[i]!.at).toBeGreaterThanOrEqual(merged[i - 1]!.at);
    }
  });

  it('never adds the same message twice', () => {
    const one = systemMessage(T0, 'Kargath joined.', 'sys-join');
    expect(mergeChat([one], [one])).toHaveLength(1);
  });
});
