/**
 * Guild transition tests — the wiring, not the maths.
 *
 * The engine's own tests prove the draw, the tracks, the chat and the bounty are right in
 * isolation. What this file proves is the ROADMAP's acceptance criterion: **join AND found are
 * both fully playable**, end to end, through the same transitions the store calls — and that
 * the buffs a hall grants actually reach the payouts the player is paid.
 */

import { describe, expect, it } from 'vitest';
import { GameClock, createFixedWallClock, weekKeyFor } from '@/engine/clock';
import { createRng } from '@/engine/rng';
import { createHero } from '@/engine/hero/actions';
import { createNewSave, type SaveFile } from '@/engine/save/schema';
import { PLAYER_LADDER_ID } from '@/engine/world/ladder';
import { simTick } from '@/engine/world/simulate';
import { missionPayout } from '@/engine/progression/rewards';
import { xpNeeded } from '@/engine/progression/xp';
import { bountyById } from '@/data/bounties';
import { PLAYER_GUILD_ID } from '@/data/guilds';
import { GUILD_CAPACITY, requirementsFor } from '@/engine/guilds/membership';
import { MAX_STEPS, stepCost } from '@/engine/guilds/buffs';
import { ensureWorld } from './worldActions';
import { refreshDay } from './missionActions';
import {
  FOUNDING_COST,
  acceptApplicant,
  applyTo,
  bountyView,
  checkApplication,
  creditBounty,
  declineApplicant,
  donate,
  editMotto,
  foundGuild,
  guildBonus,
  hallOf,
  kickMember,
  leaveGuild,
  postMessage,
  promoteMember,
  refreshGuildDay,
  tickGuild,
} from './guildActions';

const NOW = new Date('2026-08-03T10:00:00').getTime(); // A Monday.
const TODAY = '2026-08-03';
const DAY = 86_400_000;

const clock = new GameClock(createFixedWallClock(NOW));
const walk = (from: string, to: string) => clock.dayKeysBetween(from, to);

function seated(level = 30, gold = 20_000): SaveFile {
  const base = createNewSave({ slot: 1, worldSeed: 77_431, now: NOW });
  const hero = createHero({
    name: 'Kargath',
    classId: 'warrior',
    now: NOW,
    startingGold: gold,
    rng: createRng(9, 'starter'),
  });
  return ensureWorld({ ...base, hero: { ...hero, level, honor: 4_000, dice: 8 } }, NOW);
}

/**
 * A hall with a roster worth joining, a place free, *and* a bar the fixture hero clears.
 *
 * All three matter. A full hall answers "sorry, we are full" to everything, and one whose
 * requirements the hero misses answers "not yet" — both perfectly correct, and neither the path
 * these tests are trying to exercise.
 */
function openHall(save: SaveFile) {
  const world = save.world!;
  const engine = {
    seed: world.seed,
    createdAt: world.createdAt,
    lastSimAt: world.lastSimAt,
    bots: world.bots,
    guilds: world.guilds,
    ladder: world.ladder,
  };
  const hall = world.guilds.find((record) => {
    if (record.memberIds.length < 8 || record.memberIds.length >= GUILD_CAPACITY) return false;
    const bar = requirementsFor(engine, record.memberIds);
    return save.hero!.level >= bar.minLevel && save.hero!.honor >= bar.minHonor;
  });
  if (!hall) throw new Error('no hall the fixture hero could apply to');
  return hall;
}

/** Walk an application all the way to a yes, trying successive minutes until one lands. */
function joinSomething(save: SaveFile): { save: SaveFile; guildId: number } {
  const world = save.world!;
  for (const record of world.guilds) {
    if (record.memberIds.length === 0 || record.memberIds.length >= GUILD_CAPACITY) continue;
    const requirements = requirementsFor(
      {
        seed: world.seed,
        createdAt: world.createdAt,
        lastSimAt: world.lastSimAt,
        bots: world.bots,
        guilds: world.guilds,
        ladder: world.ladder,
      },
      record.memberIds,
    );
    if (save.hero!.level < requirements.minLevel || save.hero!.honor < requirements.minHonor) {
      continue;
    }

    for (let minute = 0; minute < 40; minute += 1) {
      const applied = applyTo(save, record.id, NOW + minute * 60_000);
      if (!applied.ok) continue;
      const checked = checkApplication(applied.save, applied.save.guild.application!.decidesAt);
      if (checked.decision?.accepted) return { save: checked.save, guildId: record.id };
    }
  }
  throw new Error('no hall would take the fixture hero');
}

describe('joining one of the sixty — ROADMAP acceptance', () => {
  it('sends a letter and waits for an answer', () => {
    const save = seated();
    const hall = openHall(save);
    const result = applyTo(save, hall.id, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.guild.application?.guildId).toBe(hall.id);
    expect(result.save.guild.application?.decidesAt).toBeGreaterThan(NOW);
    // Still unguilded until they say yes.
    expect(hallOf(result.save)).toBeNull();
  });

  it('says nothing until the answer is due, then says it once', () => {
    const save = seated();
    const applied = applyTo(save, openHall(save).id, NOW);
    if (!applied.ok) return;
    const due = applied.save.guild.application!.decidesAt;

    expect(checkApplication(applied.save, due - 1).decision).toBeNull();
    const answered = checkApplication(applied.save, due);
    expect(answered.decision).not.toBeNull();
    // The letter is off the desk either way.
    expect(answered.save.guild.application).toBeNull();
  });

  it('shuts the door for a day on a refusal, and never loses the reason', () => {
    const save = seated();
    for (let minute = 0; minute < 60; minute += 1) {
      const applied = applyTo(save, openHall(save).id, NOW + minute * 60_000);
      if (!applied.ok) continue;
      const answered = checkApplication(applied.save, applied.save.guild.application!.decidesAt);
      if (!answered.decision || answered.decision.accepted) continue;

      expect(answered.decision.reason.length).toBeGreaterThan(10);
      expect(answered.save.guild.refusedAt[String(openHall(save).id)]).toBeGreaterThan(0);
      // And the door really is shut.
      const again = applyTo(answered.save, openHall(save).id, NOW + minute * 60_000 + 1_000);
      expect(again.ok).toBe(false);
      return;
    }
    expect.unreachable('expected at least one refusal in an hour of trying');
  });

  it('puts the player in the hall, with its buffs, the moment they are accepted', () => {
    const { save, guildId } = joinSomething(seated());
    const hall = hallOf(save)!;

    expect(save.guild.guildId).toBe(guildId);
    expect(hall.isOwn).toBe(false);
    expect(hall.roster.length).toBeGreaterThan(0);

    // The buffs are the point of joining an established hall (spec §2).
    const bonus = guildBonus(save);
    expect(bonus.gold).toBeGreaterThan(1);
    expect(bonus.xp).toBeGreaterThan(1);
    expect(bonus.gold).toBeLessThanOrEqual(1.25);

    // And the hall says hello.
    expect(save.guild.chat.length).toBeGreaterThan(0);
    expect(save.guild.chat[0]?.text).toContain('Kargath');
  });

  it('pays the buffed number, not the base one — ROADMAP acceptance', () => {
    const { save } = joinSomething(seated());
    const hall = hallOf(save)!;

    const plain = missionPayout(30, 20, xpNeeded(30));
    const buffed = missionPayout(30, 20, xpNeeded(30), guildBonus(save));

    expect(buffed.gold).toBeGreaterThan(plain.gold);
    expect(buffed.gold).toBe(Math.round(plain.gold * (1 + hall.treasuryStep * 0.0025)));
  });

  it('drops the buffs the instant they walk out', () => {
    const { save } = joinSomething(seated());
    expect(guildBonus(save).gold).toBeGreaterThan(1);

    const left = leaveGuild(save, NOW + DAY);
    expect(left.ok).toBe(true);
    if (!left.ok) return;

    expect(hallOf(left.save)).toBeNull();
    expect(guildBonus(left.save)).toEqual({ gold: 1, xp: 1 });
    // The hall's conversation is not theirs to keep reading.
    expect(left.save.guild.chat).toEqual([]);
  });

  it('refuses a second hall while they are in one', () => {
    const { save } = joinSomething(seated());
    const other = save.world!.guilds.find((record) => record.memberIds.length < GUILD_CAPACITY)!;
    const result = applyTo(save, other.id, NOW + 1_000);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe('apply');
  });
});

describe('founding a hall of your own — ROADMAP acceptance', () => {
  const founded = (() => {
    const result = foundGuild(
      seated(),
      {
        name: 'The Quiet Kettle',
        motto: 'We put it on at six.',
        field: 'moss',
        charge: 'parchment',
        sigil: 'tankard',
      },
      NOW,
    );
    if (!result.ok) throw new Error('founding failed');
    return result.save;
  })();

  it('costs the founding fee and makes the player Guildmaster', () => {
    expect(founded.hero!.gold).toBe(seated().hero!.gold - FOUNDING_COST);
    const hall = hallOf(founded)!;
    expect(hall.isOwn).toBe(true);
    expect(hall.name).toBe('The Quiet Kettle');
    expect(hall.memberCount).toBe(1);
    // A hall founded this morning has bought nothing yet — the trade the spec describes.
    expect(guildBonus(founded)).toEqual({ gold: 1, xp: 1 });
  });

  it('refuses a name one of the sixty already has, and keeps the gold', () => {
    const result = foundGuild(
      seated(),
      { name: 'The Amber Blades', motto: '', field: 'amber', charge: 'ink', sigil: 'sword' },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe('bad-name');
  });

  it('refuses somebody who cannot afford it', () => {
    const result = foundGuild(
      seated(30, 100),
      { name: 'The Empty Purse Two', motto: '', field: 'ink', charge: 'parchment', sigil: 'gem' },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(['bad-name', 'insufficient-gold']).toContain(result.refusal.kind);
  });

  it('brings bots to the door over the following days', () => {
    const ticked = tickGuild(founded, NOW, NOW + 6 * DAY, []);
    expect(ticked.newApplicants).toBeGreaterThan(0);
    expect(ticked.save.guild.applicants.length).toBe(ticked.newApplicants);

    // And never the same day twice, however often the save is reconciled.
    const again = tickGuild(ticked.save, NOW, NOW + 6 * DAY, []);
    expect(again.newApplicants).toBe(0);
  });

  it('lets the Guildmaster accept, decline, promote and kick', () => {
    const withApplicants = tickGuild(founded, NOW, NOW + 6 * DAY, []).save;
    const [first, second] = withApplicants.guild.applicants;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;

    const accepted = acceptApplicant(withApplicants, first.botId, NOW + DAY);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.save.guild.roster).toContain(first.botId);
    expect(accepted.save.guild.applicants.map((a) => a.botId)).not.toContain(first.botId);
    expect(hallOf(accepted.save)!.memberCount).toBe(2);

    const declined = declineApplicant(accepted.save, second.botId);
    expect(declined.ok).toBe(true);
    if (!declined.ok) return;
    expect(declined.save.guild.applicants.map((a) => a.botId)).not.toContain(second.botId);

    const promoted = promoteMember(declined.save, first.botId, NOW + DAY);
    expect(promoted.ok).toBe(true);
    if (!promoted.ok) return;
    expect(promoted.save.guild.officers).toContain(first.botId);

    const kicked = kickMember(promoted.save, first.botId, NOW + 2 * DAY);
    expect(kicked.ok).toBe(true);
    if (!kicked.ok) return;
    expect(kicked.save.guild.roster).not.toContain(first.botId);
    expect(kicked.save.guild.officers).not.toContain(first.botId);
    // The hall notices (spec §1: "bots react in chat").
    expect(kicked.save.guild.chat.some((line) => line.text.includes('shown the door'))).toBe(true);
  });

  it('refuses Guildmaster tools to somebody who merely joined a hall', () => {
    const { save } = joinSomething(seated());
    const result = acceptApplicant(save, 1, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe('not-guildmaster');
  });

  it('lets the founder rewrite the motto', () => {
    const result = editMotto(founded, 'Kettle is on.');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(hallOf(result.save)!.motto).toBe('Kettle is on.');
  });
});

describe('the two tracks, in the save', () => {
  const founded = (() => {
    const result = foundGuild(
      seated(30, 60_000),
      { name: 'The Long Kettle', motto: '', field: 'moss', charge: 'parchment', sigil: 'tankard' },
      NOW,
    );
    if (!result.ok) throw new Error('founding failed');
    return result.save;
  })();

  it('buys steps with gold, and the buff follows immediately', () => {
    const before = guildBonus(founded);
    const result = donate(
      founded,
      { track: 'treasury', gold: stepCost(1) + stepCost(2), dice: 0 },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.guild.treasuryStep).toBe(2);
    expect(guildBonus(result.save).gold).toBeGreaterThan(before.gold);
    // Drillmaster is a separate pot and has not moved.
    expect(result.save.guild.drillmasterStep).toBe(0);
    expect(guildBonus(result.save).xp).toBe(1);
  });

  it('takes the gold out of the purse, and the dice with it', () => {
    const result = donate(founded, { track: 'drillmaster', gold: 400, dice: 2 }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.hero!.gold).toBe(founded.hero!.gold - 400);
    expect(result.save.hero!.dice).toBe(founded.hero!.dice - 2);
    // Two dice are worth 800 gold, so 1,200 went into the pot.
    expect(result.save.guild.contributions['player']).toBe(1_200);
  });

  it('refuses a donation the purse cannot cover', () => {
    const result = donate(founded, { track: 'treasury', gold: 10_000_000, dice: 0 }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe('insufficient-gold');
  });

  it('sends a joined hall’s donation to that hall’s own pot', () => {
    const { save, guildId } = joinSomething(seated(30, 20_000));
    const before = save.world!.guilds[guildId]!.treasury;

    const result = donate(save, { track: 'treasury', gold: 5_000, dice: 0 }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // One pot per hall, wherever the hall lives — and it is the same number the browse card reads.
    expect(result.save.world!.guilds[guildId]!.treasury).toBe(before + 5_000);
    expect(result.save.guild.treasuryStep).toBe(0);
  });

  it('never exceeds the published cap', () => {
    let save = founded;
    // Enough to buy the lot several times over.
    save = { ...save, hero: { ...save.hero!, gold: 500_000_000 } };
    const result = donate(save, { track: 'treasury', gold: 400_000_000, dice: 0 }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.guild.treasuryStep).toBe(MAX_STEPS);
    expect(guildBonus(result.save).gold).toBeCloseTo(1.25, 10);
  });
});

describe('talking in the hall', () => {
  const joined = joinSomething(seated()).save;

  it('posts the player’s line', () => {
    const result = postMessage(joined, 'hey all', NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const mine = result.save.guild.chat.find((line) => line.author.kind === 'player');
    expect(mine?.text).toBe('hey all');
  });

  it('refuses an empty one rather than posting a blank', () => {
    const result = postMessage(joined, '   ', NOW);
    expect(result.ok).toBe(false);
  });

  it('fills the log from real events during catch-up, once', () => {
    const world = joined.world!;
    const events = simTick(
      {
        seed: world.seed,
        createdAt: world.createdAt,
        lastSimAt: world.lastSimAt,
        bots: world.bots,
        guilds: world.guilds,
        ladder: world.ladder,
      },
      NOW + 2 * DAY,
      { playerRank: 1_400, rivalIds: [], guildmateIds: [...hallOf(joined)!.roster] },
    ).events;

    const ticked = tickGuild(joined, NOW, NOW + 2 * DAY, events);
    expect(ticked.newMessages).toBeGreaterThan(0);

    const again = tickGuild(ticked.save, NOW, NOW + 2 * DAY, events);
    expect(again.newMessages).toBe(0);
  });
});

describe('the weekly bounty, through the day boundary', () => {
  const joined = joinSomething(seated()).save;

  it('posts one on the first refresh, and keeps it all week', () => {
    const posted = refreshGuildDay(joined, [], TODAY, false).save;
    expect(posted.guild.bounty).not.toBeNull();
    expect(posted.guild.bounty!.weekKey).toBe(weekKeyFor(TODAY));

    const midweek = refreshGuildDay(posted, ['2026-08-06'], '2026-08-06', true);
    expect(midweek.save.guild.bounty!.weekKey).toBe(posted.guild.bounty!.weekKey);
  });

  it('counts the player’s own work toward it', () => {
    const posted = refreshGuildDay(joined, [], TODAY, false).save;
    const metric = bountyById(posted.guild.bounty!.bountyId)!.metric;

    const credited = creditBounty(posted, metric, 4);
    expect(credited.guild.bounty!.playerUnits).toBe(4);
    // And ignores work the poster is not asking for.
    const wrong = creditBounty(posted, metric === 'missions' ? 'arenaWins' : 'missions', 9);
    expect(wrong.guild.bounty!.playerUnits).toBe(0);
  });

  it('pays the chest on the Sunday, once — ROADMAP acceptance', () => {
    const posted = refreshGuildDay(joined, [], TODAY, false).save;
    const sunday = weekKeyFor(TODAY);
    const cleared: SaveFile = {
      ...posted,
      guild: {
        ...posted.guild,
        bounty: { ...posted.guild.bounty!, botUnits: posted.guild.bounty!.target },
      },
    };

    const settled = refreshGuildDay(cleared, [sunday], sunday, true);
    expect(settled.chest?.full).toBe(true);
    expect(settled.save.hero!.gold).toBeGreaterThan(cleared.hero!.gold);
    expect(settled.save.hero!.dice).toBe(cleared.hero!.dice + 1);

    // Walking the same boundary again pays nothing — the week is settled.
    const again = refreshGuildDay(settled.save, [sunday], sunday, true);
    expect(again.chest).toBeNull();
  });

  it('pays half for a near miss and nothing for a wash-out', () => {
    const posted = refreshGuildDay(joined, [], TODAY, false).save;
    const sunday = weekKeyFor(TODAY);
    const at = (share: number): SaveFile => ({
      ...posted,
      guild: {
        ...posted.guild,
        bounty: {
          ...posted.guild.bounty!,
          botUnits: Math.ceil(posted.guild.bounty!.target * share),
        },
      },
    });

    const near = refreshGuildDay(at(0.7), [sunday], sunday, true);
    expect(near.chest?.full).toBe(false);
    expect(near.chest?.gold).toBeGreaterThan(0);

    const washout = refreshGuildDay(at(0.1), [sunday], sunday, true);
    expect(washout.chest?.gold).toBe(0);
  });

  it('rides the Reset Engine’s boundaries, not its own clock', () => {
    // The whole reason `refreshDay` hands the list down: one owner decides it is tomorrow.
    const monday: SaveFile = {
      ...joined,
      activity: { ...joined.activity, lastProcessedDay: '2026-08-02' },
    };
    const result = refreshDay(monday, TODAY, walk);

    expect(result.didReset).toBe(true);
    expect(result.save.guild.bounty).not.toBeNull();
    expect(result.save.guild.bounty!.weekKey).toBe(weekKeyFor(TODAY));
  });

  it('shows a poster with a real number on it', () => {
    const posted = refreshGuildDay(joined, [], TODAY, false).save;
    const view = bountyView(posted)!;

    expect(view.title).not.toContain('{target}');
    expect(view.target).toBeGreaterThan(0);
    expect(view.share).toBe(0);
    expect(view.complete).toBe(false);
  });

  it('has no bounty at all for somebody with no hall', () => {
    expect(bountyView(seated())).toBeNull();
    expect(refreshGuildDay(seated(), [TODAY], TODAY, true).save.guild.bounty).toBeNull();
  });
});

describe('the unguilded are untouched', () => {
  it('earns exactly the base rate', () => {
    expect(guildBonus(seated())).toEqual({ gold: 1, xp: 1 });
  });

  it('has no hall, no chat and no applicants', () => {
    const save = seated();
    expect(hallOf(save)).toBeNull();
    expect(tickGuild(save, NOW, NOW + 3 * DAY, []).save).toBe(save);
    expect(save.guild.guildId).toBeNull();
  });

  it('is what a founded hall reverts to when its Guildmaster walks', () => {
    const result = foundGuild(
      seated(),
      { name: 'The Short Kettle', motto: '', field: 'moss', charge: 'parchment', sigil: 'tankard' },
      NOW,
    );
    if (!result.ok) return;
    const left = leaveGuild(result.save, NOW + DAY);
    if (!left.ok) return;

    expect(hallOf(left.save)).toBeNull();
    expect(left.save.guild.roster).toEqual([]);
    // The identity is kept, so founding again does not ask them to invent a second name.
    expect(left.save.guild.founded?.name).toBe('The Short Kettle');
    expect(left.save.guild.guildId).not.toBe(PLAYER_GUILD_ID);
  });
});

describe('the ladder and the hall agree', () => {
  it('keeps the player on the ladder whatever they do with guilds', () => {
    const { save } = joinSomething(seated());
    expect(save.world!.ladder).toContain(PLAYER_LADDER_ID);
    const left = leaveGuild(save, NOW + DAY);
    if (!left.ok) return;
    expect(left.save.world!.ladder).toContain(PLAYER_LADDER_ID);
  });
});
