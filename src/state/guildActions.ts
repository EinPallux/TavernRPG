'use client';

/**
 * The Guild Hall, as store transitions.
 *
 * Save in, save out, same as every other action module. The wrinkle this one has that the others
 * do not: **a player's hall is either one of the sixty or one of their own, and almost everything
 * has to work the same either way.** Buffs, chat, the bounty and the roster all read through
 * `hallOf`, which resolves the difference once so nothing downstream has to care.
 *
 * Where the two differ is where they genuinely differ. The sixty keep their rosters and their
 * donated gold in the world slice, which the simulation already grows every tick; a founded hall
 * keeps its own, because nothing else in the world knows it exists yet.
 */

import type { DayKey } from '@/engine/clock';
import type { PayoutBonus } from '@/engine/progression/rewards';
import type { SimEvent } from '@/engine/world/simulate';
import type { WorldState } from '@/engine/world/generate';
import { PLAYER_LADDER_ID } from '@/engine/world/ladder';
import { botIdentity } from '@/engine/world/identity';
import {
  PLAYER_GUILD_ID,
  guild as guildDef,
  validateGuildName,
  type BannerColour,
  type GuildNameRefusal,
  type SigilIcon,
} from '@/data/guilds';
import { applyDonation, donationValue, guildMultipliers, type TrackId } from '@/engine/guilds/buffs';
import {
  FOUNDING_COST,
  GUILD_CAPACITY,
  applyToGuild,
  decideApplication,
  derivedTracks,
  rollApplicants,
  type ApplyRefusal,
} from '@/engine/guilds/membership';
import {
  contribute as contributeToState,
  bountyForDay,
  settleBounty,
  simulateBotContribution,
  viewBounty,
  type BountyChest,
} from '@/engine/guilds/bounty';
import {
  generateChat,
  mergeChat,
  replyToPlayer,
  systemMessage,
  type ChatMessage,
} from '@/engine/guilds/chat';
import { bountyById, type BountyMetric } from '@/data/bounties';
import type { Guild, SaveFile, StoredChatMessage } from '@/engine/save/schema';

export type GuildRefusal =
  | { readonly kind: 'no-hero' }
  | { readonly kind: 'no-world' }
  | { readonly kind: 'not-in-a-guild' }
  | { readonly kind: 'not-guildmaster' }
  | { readonly kind: 'apply'; readonly reason: ApplyRefusal }
  | { readonly kind: 'bad-name'; readonly reason: GuildNameRefusal }
  | { readonly kind: 'insufficient-gold'; readonly needed: number; readonly available: number }
  | { readonly kind: 'insufficient-dice'; readonly needed: number; readonly available: number }
  | { readonly kind: 'full'; readonly capacity: number }
  | { readonly kind: 'nothing-to-do' };

export type GuildTransition =
  | { readonly ok: true; readonly save: SaveFile }
  | { readonly ok: false; readonly refusal: GuildRefusal };

const refuse = (refusal: GuildRefusal): { readonly ok: false; readonly refusal: GuildRefusal } => ({
  ok: false,
  refusal,
});

function withGuild(save: SaveFile, guild: Partial<Guild>): SaveFile {
  return { ...save, guild: { ...save.guild, ...guild } };
}

function toEngine(world: NonNullable<SaveFile['world']>): WorldState {
  return {
    seed: world.seed,
    createdAt: world.createdAt,
    lastSimAt: world.lastSimAt,
    bots: world.bots,
    guilds: world.guilds,
    ladder: world.ladder,
  };
}

/* ── Which hall am I in ────────────────────────────────────────────────────────── */

export interface Hall {
  readonly id: number;
  readonly name: string;
  readonly motto: string;
  readonly field: BannerColour;
  readonly charge: BannerColour;
  readonly sigil: SigilIcon | null;
  /** Bot members. The player is not in this list; they are always implied. */
  readonly roster: readonly number[];
  readonly memberCount: number;
  readonly treasuryStep: number;
  readonly drillmasterStep: number;
  /**
   * Gold already banked toward the *next* step on each track.
   *
   * Carried for both kinds of hall so the Pot reads the same either way. A founded hall keeps it
   * in the save; one of the sixty has it derived back out of its world treasury, which is what
   * lets a donation into somebody else's pot still show up as movement rather than vanishing
   * into a number too big to see it.
   */
  readonly treasuryPool: number;
  readonly drillmasterPool: number;
  /** True when the player founded it, which is what unlocks the Guildmaster tools. */
  readonly isOwn: boolean;
}

/**
 * The player's hall, whichever kind it is. Null when they have none.
 *
 * The one place the two shapes are reconciled. Everything else in this module and in the UI
 * reads a `Hall` and never asks which sort it came from — which is what stops "does this work
 * for a founded guild too?" being a question anyone has to keep answering.
 */
export function hallOf(save: SaveFile): Hall | null {
  const { guild, world } = save;
  if (guild.guildId === null || !world) return null;

  if (guild.guildId === PLAYER_GUILD_ID) {
    const founded = guild.founded;
    if (!founded) return null;
    return {
      id: PLAYER_GUILD_ID,
      name: founded.name,
      motto: founded.motto,
      field: founded.field,
      charge: founded.charge,
      sigil: founded.sigil,
      roster: guild.roster,
      memberCount: guild.roster.length + 1,
      treasuryStep: guild.treasuryStep,
      drillmasterStep: guild.drillmasterStep,
      treasuryPool: guild.treasuryPool,
      drillmasterPool: guild.drillmasterPool,
      isOwn: true,
    };
  }

  const record = world.guilds[guild.guildId];
  const definition = guildDef(guild.guildId);
  if (!record || !definition) return null;

  const tracks = derivedTracks(world.seed, record);
  return {
    id: guild.guildId,
    name: definition.name,
    motto: definition.motto,
    field: definition.field,
    charge: definition.charge,
    sigil: null,
    roster: record.memberIds,
    memberCount: record.memberIds.length + 1,
    treasuryStep: tracks.treasury.step,
    drillmasterStep: tracks.drillmaster.step,
    treasuryPool: tracks.treasury.pool,
    drillmasterPool: tracks.drillmaster.pool,
    isOwn: false,
  };
}

/** The multipliers the player is currently earning. `1×` when they are unguilded. */
export function guildBonus(save: SaveFile): PayoutBonus {
  const hall = hallOf(save);
  return guildMultipliers({
    isMember: hall !== null,
    treasuryStep: hall?.treasuryStep ?? 0,
    drillmasterStep: hall?.drillmasterStep ?? 0,
  });
}

/* ── Applying and joining ──────────────────────────────────────────────────────── */

export function applyTo(save: SaveFile, guildId: number, now: number): GuildTransition {
  const { hero, world, guild } = save;
  if (!hero) return refuse({ kind: 'no-hero' });
  if (!world) return refuse({ kind: 'no-world' });

  const result = applyToGuild({
    world: toEngine(world),
    guildId,
    heroLevel: hero.level,
    heroHonor: hero.honor,
    now,
    inGuild: guild.guildId !== null,
    pending: guild.application,
    refusedAt: numericKeys(guild.refusedAt),
  });

  if (!result.ok) return refuse({ kind: 'apply', reason: result.refusal });
  return { ok: true, save: withGuild(save, { application: result.application }) };
}

export interface DecisionResult {
  readonly save: SaveFile;
  /** Null while the hall is still reading the letter. */
  readonly decision: { readonly accepted: boolean; readonly reason: string } | null;
}

/**
 * Has the answer arrived?
 *
 * Called on load and whenever the Guild Hall is opened. Deterministic in the application, so
 * checking twice cannot turn a no into a yes — and a refusal writes the cooldown that keeps the
 * door shut for a day.
 */
export function checkApplication(save: SaveFile, now: number): DecisionResult {
  const { world, hero, guild } = save;
  if (!world || !hero || !guild.application) return { save, decision: null };

  const decision = decideApplication({
    world: toEngine(world),
    application: guild.application,
    heroLevel: hero.level,
    now,
  });
  if (!decision) return { save, decision: null };

  const guildId = guild.application.guildId;
  if (!decision.accepted) {
    return {
      decision,
      save: withGuild(save, {
        application: null,
        refusedAt: { ...guild.refusedAt, [String(guildId)]: now },
      }),
    };
  }

  const definition = guildDef(guildId);
  const joined = withGuild(save, {
    application: null,
    guildId,
    joinedAt: now,
    // A fresh hall means a fresh log; the last one's conversation is not yours to read.
    chat: [],
    lastChatDay: Math.floor(now / 86_400_000) - 1,
    bounty: null,
    contributions: {},
  });

  return {
    decision,
    save: withGuild(joined, {
      chat: toStored([
        systemMessage(now, `${hero.name} joined ${definition?.name ?? 'the hall'}.`, `join-${now}`),
      ]),
    }),
  };
}

/** Walk out. The buffs stop the same instant (spec §2). */
export function leaveGuild(save: SaveFile, now: number): GuildTransition {
  if (save.guild.guildId === null) return refuse({ kind: 'not-in-a-guild' });

  return {
    ok: true,
    save: withGuild(save, {
      guildId: null,
      joinedAt: 0,
      chat: [],
      bounty: null,
      contributions: {},
      // A founded hall is kept: leaving your own guild disbands it, but the identity stays so a
      // player who founds again is not asked to invent a second name.
      ...(save.guild.guildId === PLAYER_GUILD_ID ? { roster: [], officers: [], applicants: [] } : {}),
      lastChatDay: Math.floor(now / 86_400_000),
    }),
  };
}

/* ── Founding ──────────────────────────────────────────────────────────────────── */

export interface FoundOptions {
  readonly name: string;
  readonly motto: string;
  readonly field: BannerColour;
  readonly charge: BannerColour;
  readonly sigil: SigilIcon;
}

export function foundGuild(save: SaveFile, options: FoundOptions, now: number): GuildTransition {
  const { hero, guild } = save;
  if (!hero) return refuse({ kind: 'no-hero' });
  if (guild.guildId !== null) return refuse({ kind: 'apply', reason: { kind: 'already-in-a-guild' } });

  const valid = validateGuildName(options.name);
  if (!valid.ok) return refuse({ kind: 'bad-name', reason: valid.refusal });
  if (hero.gold < FOUNDING_COST) {
    return refuse({ kind: 'insufficient-gold', needed: FOUNDING_COST, available: hero.gold });
  }

  const founded = {
    id: PLAYER_GUILD_ID,
    name: options.name.trim(),
    motto: options.motto.trim(),
    field: options.field,
    charge: options.charge,
    sigil: options.sigil,
    foundedAt: now,
  };

  return {
    ok: true,
    save: {
      ...withGuild(save, {
        guildId: PLAYER_GUILD_ID,
        joinedAt: now,
        founded,
        application: null,
        roster: [],
        officers: [],
        applicants: [],
        // Yesterday, so the first catch-up has a day of knocking to report.
        lastApplicantDay: Math.floor(now / 86_400_000) - 1,
        lastChatDay: Math.floor(now / 86_400_000) - 1,
        treasuryStep: 0,
        treasuryPool: 0,
        drillmasterStep: 0,
        drillmasterPool: 0,
        contributions: {},
        bounty: null,
        chat: toStored([
          systemMessage(now, `${founded.name} was founded. Long may it stand.`, `founded-${now}`),
        ]),
      }),
      hero: { ...hero, gold: hero.gold - FOUNDING_COST },
    },
  };
}

/* ── The Guildmaster's desk ────────────────────────────────────────────────────── */

export function acceptApplicant(save: SaveFile, botId: number, now: number): GuildTransition {
  const { guild, world } = save;
  if (guild.guildId !== PLAYER_GUILD_ID) return refuse({ kind: 'not-guildmaster' });
  if (!world) return refuse({ kind: 'no-world' });
  if (!guild.applicants.some((applicant) => applicant.botId === botId)) {
    return refuse({ kind: 'nothing-to-do' });
  }
  if (guild.roster.length + 1 >= GUILD_CAPACITY) {
    return refuse({ kind: 'full', capacity: GUILD_CAPACITY });
  }

  const name = botIdentity(world.seed, botId).name;
  return {
    ok: true,
    save: withGuild(save, {
      roster: [...guild.roster, botId],
      applicants: guild.applicants.filter((applicant) => applicant.botId !== botId),
      chat: toStored(
        mergeChat(fromStored(guild.chat), [
          systemMessage(now, `${name} joined the hall.`, `accept-${botId}-${now}`),
        ]),
      ),
    }),
  };
}

export function declineApplicant(save: SaveFile, botId: number): GuildTransition {
  const { guild } = save;
  if (guild.guildId !== PLAYER_GUILD_ID) return refuse({ kind: 'not-guildmaster' });

  return {
    ok: true,
    save: withGuild(save, {
      applicants: guild.applicants.filter((applicant) => applicant.botId !== botId),
    }),
  };
}

export function promoteMember(save: SaveFile, botId: number, now: number): GuildTransition {
  const { guild, world } = save;
  if (guild.guildId !== PLAYER_GUILD_ID) return refuse({ kind: 'not-guildmaster' });
  if (!world || !guild.roster.includes(botId)) return refuse({ kind: 'nothing-to-do' });
  if (guild.officers.includes(botId)) return { ok: true, save };

  const name = botIdentity(world.seed, botId).name;
  return {
    ok: true,
    save: withGuild(save, {
      officers: [...guild.officers, botId],
      chat: toStored(
        mergeChat(fromStored(guild.chat), [
          systemMessage(now, `${name} is an officer now.`, `promote-${botId}-${now}`),
        ]),
      ),
    }),
  };
}

/** Kick, and let the hall react (spec §1: "bots react in chat"). */
export function kickMember(save: SaveFile, botId: number, now: number): GuildTransition {
  const { guild, world } = save;
  if (guild.guildId !== PLAYER_GUILD_ID) return refuse({ kind: 'not-guildmaster' });
  if (!world || !guild.roster.includes(botId)) return refuse({ kind: 'nothing-to-do' });

  const roster = guild.roster.filter((id) => id !== botId);
  const name = botIdentity(world.seed, botId).name;
  const reactions = replyToPlayer({
    world: toEngine(world),
    memberIds: roster,
    playerName: save.hero?.name ?? 'the Guildmaster',
    text: `${name} is out`,
    at: now,
  });

  return {
    ok: true,
    save: withGuild(save, {
      roster,
      officers: guild.officers.filter((id) => id !== botId),
      chat: toStored(
        mergeChat(fromStored(guild.chat), [
          systemMessage(now, `${name} was shown the door.`, `kick-${botId}-${now}`),
          ...reactions,
        ]),
      ),
    }),
  };
}

export function editMotto(save: SaveFile, motto: string): GuildTransition {
  const { guild } = save;
  if (guild.guildId !== PLAYER_GUILD_ID || !guild.founded) return refuse({ kind: 'not-guildmaster' });
  return {
    ok: true,
    save: withGuild(save, { founded: { ...guild.founded, motto: motto.trim().slice(0, 80) } }),
  };
}

/* ── Donating ──────────────────────────────────────────────────────────────────── */

export interface DonateOptions {
  readonly track: TrackId;
  readonly gold: number;
  readonly dice: number;
}

/**
 * Put something in the pot.
 *
 * A founded hall banks it in the save; one of the sixty banks it in that guild's own treasury in
 * the world slice, which is the same number the simulation grows and the same number the browse
 * card reads. One pot per hall, wherever the hall lives.
 */
export function donate(save: SaveFile, options: DonateOptions, now: number): GuildTransition {
  const { hero, world, guild } = save;
  if (!hero) return refuse({ kind: 'no-hero' });
  if (!world) return refuse({ kind: 'no-world' });
  const hall = hallOf(save);
  if (!hall) return refuse({ kind: 'not-in-a-guild' });

  const gold = Math.max(0, Math.floor(options.gold));
  const dice = Math.max(0, Math.floor(options.dice));
  if (gold <= 0 && dice <= 0) return refuse({ kind: 'nothing-to-do' });
  if (hero.gold < gold) return refuse({ kind: 'insufficient-gold', needed: gold, available: hero.gold });
  if (hero.dice < dice) return refuse({ kind: 'insufficient-dice', needed: dice, available: hero.dice });

  const value = donationValue(gold, dice);
  const spent = { ...hero, gold: hero.gold - gold, dice: hero.dice - dice };
  const contributions = {
    ...guild.contributions,
    player: (guild.contributions['player'] ?? 0) + value,
  };

  // Also counted toward the bounty when the week's target is the pot.
  const bountyState = guild.bounty
    ? contributeToState(guild.bounty, 'goldDonated', value)
    : guild.bounty;

  if (!hall.isOwn) {
    const record = world.guilds[hall.id];
    if (!record) return refuse({ kind: 'not-in-a-guild' });
    const guilds = world.guilds.map((entry) =>
      entry.id === hall.id ? { ...entry, treasury: entry.treasury + value } : entry,
    );
    return {
      ok: true,
      save: {
        ...withGuild(save, { contributions, bounty: bountyState }),
        hero: spent,
        world: { ...world, guilds },
      },
    };
  }

  const track = options.track;
  const applied = applyDonation({
    step: track === 'treasury' ? guild.treasuryStep : guild.drillmasterStep,
    pool: track === 'treasury' ? guild.treasuryPool : guild.drillmasterPool,
    amount: value,
  });

  const stepped =
    applied.stepsGained > 0
      ? [
          systemMessage(
            now,
            `The ${track === 'treasury' ? 'Treasury' : 'Drillmaster'} reached step ${applied.step}.`,
            `step-${track}-${applied.step}`,
          ),
        ]
      : [];

  return {
    ok: true,
    save: {
      ...withGuild(save, {
        contributions,
        bounty: bountyState,
        ...(track === 'treasury'
          ? { treasuryStep: applied.step, treasuryPool: applied.pool }
          : { drillmasterStep: applied.step, drillmasterPool: applied.pool }),
        ...(stepped.length > 0
          ? { chat: toStored(mergeChat(fromStored(guild.chat), stepped)) }
          : {}),
      }),
      hero: spent,
    },
  };
}

/* ── Talking ───────────────────────────────────────────────────────────────────── */

/** Post a line, and let whoever is awake answer it. */
export function postMessage(save: SaveFile, text: string, now: number): GuildTransition {
  const { hero, world, guild } = save;
  if (!hero) return refuse({ kind: 'no-hero' });
  if (!world) return refuse({ kind: 'no-world' });
  const hall = hallOf(save);
  if (!hall) return refuse({ kind: 'not-in-a-guild' });

  const trimmed = text.trim().slice(0, 200);
  if (trimmed.length === 0) return refuse({ kind: 'nothing-to-do' });

  const mine: ChatMessage = {
    id: `player-${now}`,
    at: now,
    author: { kind: 'player', name: hero.name },
    text: trimmed,
    category: 'reply',
    sourceEvent: null,
  };
  const replies = replyToPlayer({
    world: toEngine(world),
    memberIds: hall.roster,
    playerName: hero.name,
    text: trimmed,
    at: now,
  });

  return {
    ok: true,
    save: withGuild(save, { chat: toStored(mergeChat(fromStored(guild.chat), [mine, ...replies])) }),
  };
}

/* ── Time passing ──────────────────────────────────────────────────────────────── */

export interface GuildTick {
  readonly save: SaveFile;
  /** Bots who knocked while the player was away, for the "you have applicants" badge. */
  readonly newApplicants: number;
  /** Messages posted in the hall since the last tick. */
  readonly newMessages: number;
}

/**
 * Advance the hall: applicants, chatter, and the rest of the roster's bounty work.
 *
 * Runs inside the world catch-up, where "time passed" is already known. Every part is day-keyed
 * against a stored high-water mark for the same reason arena raids are: the rolls are seeded by
 * the day, so re-running one produces the same result — and *applying* it twice would double the
 * hall's intake and fill the chat log with duplicates on every reload.
 */
export function tickGuild(
  save: SaveFile,
  from: number,
  to: number,
  events: readonly SimEvent[],
): GuildTick {
  const hall = hallOf(save);
  const { world, guild } = save;
  if (!hall || !world || to <= from) return { save, newApplicants: 0, newMessages: 0 };

  const engine = toEngine(world);
  let next = save;

  // Bots knock on a founded hall's door; the sixty do their own recruiting in the world sim.
  let newApplicants = 0;
  if (hall.isOwn) {
    const playerRank = world.ladder.indexOf(PLAYER_LADDER_ID) + 1;
    const rolled = rollApplicants({
      world: engine,
      playerRank: playerRank > 0 ? playerRank : world.ladder.length,
      memberIds: [...hall.roster, ...guild.applicants.map((a) => a.botId)],
      from,
      to,
      lastRollDay: guild.lastApplicantDay,
    });
    newApplicants = rolled.applicants.length;
    next = withGuild(next, {
      applicants: [...guild.applicants, ...rolled.applicants],
      lastApplicantDay: rolled.lastRollDay,
    });
  }

  // The hall talks.
  const chatted = generateChat({
    world: engine,
    memberIds: hall.roster,
    guildName: hall.name,
    events,
    from,
    to,
    lastChatDay: next.guild.lastChatDay,
  });
  next = withGuild(next, {
    chat: toStored(mergeChat(fromStored(next.guild.chat), chatted.messages)),
    lastChatDay: chatted.lastChatDay,
  });

  // And gets on with the bounty.
  if (next.guild.bounty) {
    const definition = bountyById(next.guild.bounty.bountyId);
    if (definition) {
      const worked = simulateBotContribution({
        world: engine,
        memberIds: hall.roster,
        definition,
        from,
        to,
        lastRollDay: next.guild.lastBountyDay,
      });
      next = withGuild(next, {
        bounty: { ...next.guild.bounty, botUnits: next.guild.bounty.botUnits + worked.units },
        lastBountyDay: worked.lastRollDay,
      });
    }
  }

  return { save: next, newApplicants, newMessages: chatted.messages.length };
}

export interface GuildDayResult {
  readonly save: SaveFile;
  /** Paid out this pass. Usually none; one on a Sunday. */
  readonly chest: BountyChest | null;
}

/**
 * The hall's share of a day boundary: settle last week's bounty, post this week's.
 *
 * Handed the Reset Engine's boundaries rather than asking the clock — one owner decides it is
 * tomorrow (daily-loop spec §4), and the arena payout rides the same list.
 */
export function refreshGuildDay(
  save: SaveFile,
  daysProcessed: readonly DayKey[],
  today: DayKey,
  didReset: boolean,
): GuildDayResult {
  const hall = hallOf(save);
  if (!hall || !save.hero) return { save, chest: null };

  let next = save;
  let chest: BountyChest | null = null;

  // Judge each Sunday that passed, in order, before posting the week that follows it.
  for (const day of daysProcessed) {
    const state = next.guild.bounty;
    if (!state) continue;
    const settled = settleBounty({
      state,
      today: day,
      memberCount: hall.memberCount,
      heroLevel: next.hero!.level,
    });
    if (!settled) continue;

    chest = settled;
    // Gold and dice are credited; the materials are only *reported*. There is no material
    // wallet on the hero yet — it arrives with the Emberforge in Phase 12 — and `dispose.ts`
    // takes the same line for scrapping. Inventing a field to hold them now would mean a second
    // migration when the forge lands and a number nobody could spend in the meantime.
    next = {
      ...withGuild(next, { bounty: { ...state, settled: true } }),
      hero: {
        ...next.hero!,
        gold: next.hero!.gold + settled.gold,
        dice: next.hero!.dice + settled.dice,
      },
    };
    if (settled.gold > 0) {
      next = withGuild(next, {
        chat: toStored(
          mergeChat(fromStored(next.guild.chat), [
            systemMessage(
              Date.parse(`${day}T23:59:00`),
              settled.full ? 'Bounty cleared. Chests all round.' : 'Bounty part-cleared. Half a chest each.',
              `chest-${settled.weekKey}`,
            ),
          ]),
        ),
      });
    }
  }

  // Post the week's bounty — a fresh one whenever the week key has turned.
  const posted = bountyForDay(save.worldSeed, today, hall.memberCount, next.guild.bounty);
  if (posted !== next.guild.bounty) {
    next = withGuild(next, { bounty: posted });
  }

  // Weekly contribution table clears with the bounty, not with the day.
  if (didReset && posted.weekKey !== save.guild.bounty?.weekKey) {
    next = withGuild(next, { contributions: {} });
  }

  return { save: next, chest };
}

/** The player did something the week's bounty counts. */
export function creditBounty(save: SaveFile, metric: BountyMetric, units: number): SaveFile {
  if (!save.guild.bounty || units <= 0) return save;
  const updated = contributeToState(save.guild.bounty, metric, units);
  return updated === save.guild.bounty ? save : withGuild(save, { bounty: updated });
}

/** The bounty as the poster shows it, or null when there is no hall or no week. */
export function bountyView(save: SaveFile) {
  const hall = hallOf(save);
  if (!hall || !save.guild.bounty) return null;
  return viewBounty(save.guild.bounty, hall.memberCount);
}

/* ── Storage shims ─────────────────────────────────────────────────────────────── */

/**
 * The engine's `ChatMessage` and the stored one are the same shape.
 *
 * They are kept as separate types anyway, because the stored one is a schema the save is
 * validated against and the engine one is free to grow a field the save has no business
 * carrying. These two casts are the whole cost of that, and they are checked by Zod on load.
 */
function toStored(messages: readonly ChatMessage[]): StoredChatMessage[] {
  return messages as unknown as StoredChatMessage[];
}

function fromStored(messages: readonly StoredChatMessage[]): ChatMessage[] {
  return messages as unknown as ChatMessage[];
}

/** Zod records key by string; the engine wants numbers. */
function numericKeys(record: Readonly<Record<string, number>>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(record)) out[Number(key)] = value;
  return out;
}

export { FOUNDING_COST, GUILD_CAPACITY, PLAYER_GUILD_ID };
