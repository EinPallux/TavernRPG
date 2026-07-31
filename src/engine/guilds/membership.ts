/**
 * Guild membership (guilds spec §1).
 *
 * Sixty halls that already exist, with rosters, requirements and opinions — or one of your own
 * for 500 gold. The design promise is that **the sixty are a choice, not a list**: each one has a
 * vibe read off its members' personalities, a requirement bar set by who is already in it, and an
 * answer that takes real time to arrive and can be no.
 *
 * Almost everything here is *derived* rather than stored. A guild's vibe, requirements, buff
 * steps and character all come from `(worldSeed, guildId, roster)`, which means the sixty stay
 * 99 bytes a bot in the save and still differ from each other in ways a player can name. The only
 * things written down are the divergences: who the player applied to, when, and what was said.
 *
 * Pure module.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { botIdentity, type Personality } from '@/engine/world/identity';
import type { GuildRecord, WorldState } from '@/engine/world/generate';
import { PLAYER_LADDER_ID } from '@/engine/world/ladder';
import {
  GUILD_CAPACITY,
  GUILD_COUNT,
  PLAYER_GUILD_ID,
  guild as guildDef,
  type BannerColour,
} from '@/data/guilds';
import type { SigilIcon } from '@/data/guilds';
import type { VibeTag } from '@/data/guildChat';
import { stepsAffordable, type TrackId } from './buffs';

/** Founding costs this much gold (spec §1). */
export const FOUNDING_COST = 500;

/** A decision arrives somewhere in this window (spec §1). */
export const DECISION_MIN_MS = 5 * 60_000;
export const DECISION_MAX_MS = 90 * 60_000;

/** A refusal never locks the door — it just asks you to wait a day. */
export const REAPPLY_COOLDOWN_MS = 24 * 3_600_000;

/* ── What a hall is like ───────────────────────────────────────────────────────── */

/** Mean personality across a roster. The basis for both the vibe and the requirements. */
function rosterPersonality(world: WorldState, members: readonly number[]): Personality {
  const total: Personality = {
    dedication: 0,
    aggression: 0,
    sociability: 0,
    hoarding: 0,
    volatility: 0,
  };
  if (members.length === 0) return total;

  let counted = 0;
  for (const id of members) {
    if (id === PLAYER_LADDER_ID) continue;
    const { personality } = botIdentity(world.seed, id);
    (Object.keys(total) as (keyof Personality)[]).forEach((key) => {
      (total as Record<keyof Personality, number>)[key] += personality[key];
    });
    counted += 1;
  }
  if (counted === 0) return total;

  return Object.fromEntries(
    (Object.keys(total) as (keyof Personality)[]).map((key) => [key, total[key] / counted]),
  ) as unknown as Personality;
}

/** Mean hour-offset of the roster, which is what makes some halls "EU" and some "NA". */
export function rosterHours(world: WorldState, members: readonly number[]): number {
  const bots = members.filter((id) => id !== PLAYER_LADDER_ID);
  if (bots.length === 0) return 0;
  let total = 0;
  for (const id of bots) total += botIdentity(world.seed, id).timezoneOffset;
  return total / bots.length;
}

/**
 * What an ordinary *hall* looks like in this world.
 *
 * Vibe tags are comparative — "night owls" can only mean late compared with the other halls — so
 * the scoring needs both a centre and a spread, and both have to come from the population the
 * comparison is against. Two earlier versions got this wrong in instructive ways:
 *
 * - Hardcoded midpoints labelled fifty-eight of sixty halls "early risers", because the mean
 *   timezone offset of any roster sits near the population mean and the formula did not know it.
 * - Sampling *all bots* still made thirty-five of sixty "cozy", because guilded bots are not a
 *   random sample of bots — a hall is being compared against people who never joined one.
 *
 * So the baseline is the mean and spread **across the sixty rosters**, and a hall's tag is
 * whichever trait it is furthest from the middle on, in standard deviations. That makes the tags
 * relative by construction: the sixty cannot all read the same, because they are being scored
 * against each other.
 */
interface Baseline {
  readonly mean: Readonly<Record<string, number>>;
  readonly spread: Readonly<Record<string, number>>;
}

const TRAITS = ['dedication', 'aggression', 'sociability', 'hoarding', 'hours'] as const;
type Trait = (typeof TRAITS)[number];

const baselineCache = new Map<number, Baseline>();

/** One hall's numbers, in the shape the scoring compares. */
function rosterTraits(world: WorldState, members: readonly number[]): Record<Trait, number> {
  const mix = rosterPersonality(world, members);
  return {
    dedication: mix.dedication,
    aggression: mix.aggression,
    sociability: mix.sociability,
    hoarding: mix.hoarding,
    hours: rosterHours(world, members),
  };
}

function worldBaseline(world: WorldState): Baseline {
  const cached = baselineCache.get(world.seed);
  if (cached) return cached;

  const rows = world.guilds
    .filter((record) => record.memberIds.length > 0)
    .map((record) => rosterTraits(world, record.memberIds));

  const mean: Record<string, number> = {};
  const spread: Record<string, number> = {};

  for (const trait of TRAITS) {
    const values = rows.map((row) => row[trait]);
    const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const variance =
      values.reduce((sum, value) => sum + (value - average) ** 2, 0) / Math.max(1, values.length);
    mean[trait] = average;
    // A floor, so a world where every hall happens to agree on a trait does not divide by zero.
    spread[trait] = Math.max(1e-6, Math.sqrt(variance));
  }

  const computed: Baseline = { mean, spread };
  baselineCache.set(world.seed, computed);
  return computed;
}

/**
 * The hall's character, in one or two words (spec §1).
 *
 * Scored rather than branched, so the tags stay comparable: whichever trait the hall is furthest
 * from the middle on names it. A hall of hoarders becomes "collectors" because it recruited
 * hoarders, not because anybody decided it should be.
 */
export function vibeFor(world: WorldState, members: readonly number[]): VibeTag {
  if (members.length === 0) return 'quiet';
  const traits = rosterTraits(world, members);
  const par = worldBaseline(world);
  const z = (trait: Trait) => (traits[trait] - par.mean[trait]!) / par.spread[trait]!;

  const candidates: { tag: VibeTag; score: number }[] = [
    { tag: 'hardcore', score: z('dedication') },
    { tag: 'cozy', score: -z('dedication') },
    { tag: 'night owls', score: z('hours') },
    { tag: 'early risers', score: -z('hours') },
    { tag: 'scrappers', score: z('aggression') },
    { tag: 'collectors', score: z('hoarding') },
    { tag: 'loud', score: z('sociability') },
    { tag: 'quiet', score: -z('sociability') },
  ];

  return candidates.reduce((best, entry) => (entry.score > best.score ? entry : best)).tag;
}

/**
 * The bar the leadership has set (spec §1).
 *
 * Read off the roster rather than authored, which makes it *fair* in a way an authored number
 * could not be: a hall of level-60s asks for a level-60, and a hall that has been recruiting
 * anybody asks for very little. It also drifts on its own as the roster changes, which is the
 * "requirements drift with their roster" line in §5 for free.
 */
export interface GuildRequirements {
  readonly minLevel: number;
  readonly minHonor: number;
}

export function requirementsFor(world: WorldState, members: readonly number[]): GuildRequirements {
  const bots = members
    .map((id) => world.bots[id])
    .filter((bot): bot is NonNullable<typeof bot> => !!bot);
  if (bots.length === 0) return { minLevel: 1, minHonor: 0 };

  const levels = bots.map((bot) => bot.level).sort((a, b) => a - b);
  const honors = bots.map((bot) => bot.honor).sort((a, b) => a - b);
  // The 30th percentile: a hall will take somebody a bit under its middle, but not far under.
  const at = (values: number[], share: number) =>
    values[Math.min(values.length - 1, Math.floor(values.length * share))] ?? 0;

  return {
    // Rounded to fives so the browse list reads as a set of bars rather than sixty odd numbers.
    minLevel: Math.max(1, Math.floor(at(levels, 0.3) / 5) * 5),
    minHonor: Math.max(0, Math.round(at(honors, 0.25) / 100) * 100),
  };
}

/**
 * A bot guild's buff steps, derived from its treasury.
 *
 * Not stored: the world already tracks donated gold per guild and grows it every tick, so a
 * second field would be the same number written twice and free to drift. The split between the
 * two tracks is seeded per guild, because a hall that has poured everything into the Drillmaster
 * is a different proposition from one that went all-in on the Treasury.
 */
export function derivedTracks(
  worldSeed: number,
  record: GuildRecord,
): Readonly<Record<TrackId, { readonly step: number; readonly pool: number }>> {
  const rng = createRng(deriveSeed(worldSeed, 'guild-split', record.id), `guild:${record.id}`);
  const toTreasury = rng.float(0.3, 0.7);
  const treasury = stepsAffordable(0, record.treasury * toTreasury);
  const drillmaster = stepsAffordable(0, record.treasury * (1 - toTreasury));
  return {
    treasury: { step: treasury.steps, pool: Math.round(treasury.remainder) },
    drillmaster: { step: drillmaster.steps, pool: Math.round(drillmaster.remainder) },
  };
}

/**
 * Just the steps, for the callers that only rank halls against each other.
 *
 * The remainder matters to exactly one screen — the member standing in the hall, who has just
 * put gold in the pot and deserves to see it land somewhere — so it is carried by `derivedTracks`
 * and dropped here.
 */
export function derivedSteps(
  worldSeed: number,
  record: GuildRecord,
): Readonly<Record<TrackId, number>> {
  const tracks = derivedTracks(worldSeed, record);
  return { treasury: tracks.treasury.step, drillmaster: tracks.drillmaster.step };
}

export interface GuildProfile {
  readonly id: number;
  readonly name: string;
  readonly motto: string;
  readonly field: BannerColour;
  readonly charge: BannerColour;
  readonly memberCount: number;
  readonly capacity: number;
  readonly vibe: VibeTag;
  readonly requirements: GuildRequirements;
  readonly treasuryStep: number;
  readonly drillmasterStep: number;
  /** Median member level, so the player can see whether they would fit. */
  readonly medianLevel: number;
  readonly active: boolean;
}

/** The browse card for one of the sixty. */
export function guildProfile(world: WorldState, guildId: number): GuildProfile | null {
  const record = world.guilds[guildId];
  const definition = guildDef(guildId);
  if (!record || !definition) return null;

  const levels = record.memberIds.map((id) => world.bots[id]?.level ?? 0).sort((a, b) => a - b);
  const steps = derivedSteps(world.seed, record);

  return {
    id: guildId,
    name: definition.name,
    motto: definition.motto,
    field: definition.field,
    charge: definition.charge,
    memberCount: record.memberIds.length,
    capacity: GUILD_CAPACITY,
    vibe: vibeFor(world, record.memberIds),
    requirements: requirementsFor(world, record.memberIds),
    treasuryStep: steps.treasury,
    drillmasterStep: steps.drillmaster,
    medianLevel: levels[Math.floor(levels.length / 2)] ?? 1,
    active: record.active,
  };
}

/** Every hall, best-funded first — the order the browse list opens in. */
export function browseGuilds(world: WorldState): GuildProfile[] {
  const profiles: GuildProfile[] = [];
  for (let id = 0; id < GUILD_COUNT; id += 1) {
    const profile = guildProfile(world, id);
    if (profile?.active) profiles.push(profile);
  }
  return profiles.sort(
    (a, b) => b.treasuryStep + b.drillmasterStep - (a.treasuryStep + a.drillmasterStep),
  );
}

/* ── Applying ──────────────────────────────────────────────────────────────────── */

export type ApplyRefusal =
  | { readonly kind: 'already-in-a-guild' }
  | { readonly kind: 'full'; readonly capacity: number }
  | { readonly kind: 'folded' }
  | { readonly kind: 'below-requirements'; readonly requirements: GuildRequirements }
  | { readonly kind: 'cooldown'; readonly untilMs: number }
  | { readonly kind: 'already-applied' };

export interface Application {
  readonly guildId: number;
  readonly appliedAt: number;
  /** When the answer arrives. 5–90 min, personality-weighted (spec §1). */
  readonly decidesAt: number;
}

export interface ApplyOptions {
  readonly world: WorldState;
  readonly guildId: number;
  readonly heroLevel: number;
  readonly heroHonor: number;
  readonly now: number;
  /** Already a member somewhere? */
  readonly inGuild: boolean;
  readonly pending: Application | null;
  /** Last refusal per guild, so the 24h cooldown can be checked. */
  readonly refusedAt: Readonly<Record<number, number>>;
}

/**
 * Send an application.
 *
 * The wait is the feature. An instant answer makes the sixty halls a dropdown; five to ninety
 * minutes makes them people who have to read your letter. A sociable roster answers quickly, a
 * quiet one leaves you hanging — which is the same personality data doing double duty.
 */
export function applyToGuild(
  options: ApplyOptions,
):
  | { readonly ok: true; readonly application: Application }
  | { readonly ok: false; readonly refusal: ApplyRefusal } {
  const { world, guildId, heroLevel, heroHonor, now, inGuild, pending, refusedAt } = options;

  if (inGuild) return { ok: false, refusal: { kind: 'already-in-a-guild' } };
  if (pending) return { ok: false, refusal: { kind: 'already-applied' } };

  const record = world.guilds[guildId];
  if (!record || !record.active) return { ok: false, refusal: { kind: 'folded' } };
  if (record.memberIds.length >= GUILD_CAPACITY) {
    return { ok: false, refusal: { kind: 'full', capacity: GUILD_CAPACITY } };
  }

  const refused = refusedAt[guildId] ?? 0;
  if (refused > 0 && now - refused < REAPPLY_COOLDOWN_MS) {
    return { ok: false, refusal: { kind: 'cooldown', untilMs: refused + REAPPLY_COOLDOWN_MS } };
  }

  const requirements = requirementsFor(world, record.memberIds);
  if (heroLevel < requirements.minLevel || heroHonor < requirements.minHonor) {
    return { ok: false, refusal: { kind: 'below-requirements', requirements } };
  }

  // A chatty hall reads its post; a quiet one gets to it eventually.
  const mix = rosterPersonality(world, record.memberIds);
  const promptness = Math.min(
    1,
    Math.max(0, mix.sociability * 0.6 + ((mix.dedication - 0.15) / 0.95) * 0.4),
  );
  const rng = createRng(
    deriveSeed(world.seed, 'apply', guildId, Math.floor(now / 60_000)),
    'apply',
  );
  const span = DECISION_MAX_MS - DECISION_MIN_MS;
  const wait = DECISION_MIN_MS + Math.round(span * (1 - promptness) * rng.float(0.6, 1.2));

  return {
    ok: true,
    application: { guildId, appliedAt: now, decidesAt: now + Math.min(DECISION_MAX_MS, wait) },
  };
}

export interface Decision {
  readonly accepted: boolean;
  /** Written out for the player. A refusal is flavour, never a scolding (spec §1). */
  readonly reason: string;
}

/** Refusals in the world's voice. Indexed, never rolled. */
const REJECTIONS: readonly string[] = [
  '{guild} regret that they are looking for someone a little further along.',
  '{guild} have gone with somebody else. No hard feelings, they say.',
  '{guild} regret… actually, {leader} just does not like Tuesdays.',
  '{guild} say the roster is fuller than it looks on paper.',
  '{guild} thank you for your interest and would like you to try again another time.',
  '{guild} have decided to keep the hall as it is for now.',
];

const ACCEPTANCES: readonly string[] = [
  '{guild} would be glad to have you.',
  '{guild} say yes. Someone has already moved a chair.',
  '{leader} read your letter twice and then said yes.',
  '{guild} are in. Welcome aboard.',
];

/**
 * Has the answer arrived, and what is it?
 *
 * Deterministic in `(worldSeed, guildId, appliedAt)`, so reloading the tab cannot re-roll a
 * rejection into an acceptance. Acceptance is likelier the better the player fits the roster's
 * *spread* — not simply the higher their level, because a level-90 applying to a hall of
 * level-20s is as odd a fit as the reverse and gets turned down for it.
 */
export function decideApplication(options: {
  readonly world: WorldState;
  readonly application: Application;
  readonly heroLevel: number;
  readonly now: number;
}): Decision | null {
  const { world, application, heroLevel, now } = options;
  if (now < application.decidesAt) return null;

  const record = world.guilds[application.guildId];
  const definition = guildDef(application.guildId);
  if (!record || !definition || !record.active) {
    return { accepted: false, reason: 'That hall is no longer taking anybody.' };
  }
  if (record.memberIds.length >= GUILD_CAPACITY) {
    return {
      accepted: false,
      reason: `${definition.name} filled the last place while you waited.`,
    };
  }

  const levels = record.memberIds.map((id) => world.bots[id]?.level ?? 0);
  const median = [...levels].sort((a, b) => a - b)[Math.floor(levels.length / 2)] ?? heroLevel;
  // How well the player sits in the roster's band. 1 at the median, falling away both ways.
  const fit = 1 / (1 + Math.abs(heroLevel - median) / Math.max(8, median * 0.5));

  const mix = rosterPersonality(world, record.memberIds);
  // A hall short of members is keener; a full one can afford to be picky.
  const room = 1 - record.memberIds.length / GUILD_CAPACITY;
  const odds = Math.min(0.95, Math.max(0.15, fit * 0.55 + room * 0.25 + mix.sociability * 0.2));

  const rng = createRng(
    deriveSeed(world.seed, 'decision', application.guildId, application.appliedAt),
    'decision',
  );
  const accepted = rng.bool(odds);
  const leader =
    record.memberIds[0] !== undefined
      ? botIdentity(world.seed, record.memberIds[0]).name
      : 'the Guildmaster';
  const pool = accepted ? ACCEPTANCES : REJECTIONS;
  const line = pool[Math.floor(rng.next() * pool.length) % pool.length]!;

  return {
    accepted,
    reason: line.replace('{guild}', definition.name).replace('{leader}', leader),
  };
}

/* ── Founding ──────────────────────────────────────────────────────────────────── */

export interface FoundedGuild {
  readonly id: number;
  readonly name: string;
  readonly motto: string;
  readonly field: BannerColour;
  readonly charge: BannerColour;
  readonly sigil: SigilIcon;
  readonly foundedAt: number;
}

/**
 * How often a bot knocks on a newly founded hall's door (spec §1).
 *
 * "First applicants within hours, ~8–12 members by week 2" is the target, so the base rate is
 * roughly one a day and rises with the player's standing — a rank-200 founder is a more
 * interesting prospect than a rank-1,400 one, which is the whole reason to climb before founding.
 */
export const BASE_APPLICANTS_PER_DAY = 0.42;
export const MAX_APPLICANTS_PER_DAY = 2;

export function applicantsPerDay(
  playerRank: number,
  ladderSize: number,
  memberCount: number,
): number {
  // Standing, as a 0–1 share. Rank 1 is 1, the foot of the ladder is 0.
  const standing = ladderSize > 1 ? 1 - (playerRank - 1) / (ladderSize - 1) : 0;
  // A hall filling up is less of a novelty; interest tails off as it approaches capacity.
  const room = Math.max(0, 1 - memberCount / GUILD_CAPACITY);
  return Math.min(
    MAX_APPLICANTS_PER_DAY,
    BASE_APPLICANTS_PER_DAY * (0.6 + standing * 1.4) * (0.35 + room),
  );
}

export interface Applicant {
  readonly botId: number;
  readonly at: number;
}

/**
 * The bots who came knocking while the player was away.
 *
 * Day-keyed and gated on a stored high-water mark, exactly like arena raids — for exactly the
 * same reason. The roll is seeded by the day index, so re-running a day produces the same
 * applicants, and *applying* them twice would quietly double the hall's intake on every reload.
 */
export function rollApplicants(options: {
  readonly world: WorldState;
  readonly playerRank: number;
  readonly memberIds: readonly number[];
  readonly from: number;
  readonly to: number;
  readonly lastRollDay: number;
}): { readonly applicants: Applicant[]; readonly lastRollDay: number } {
  const DAY = 86_400_000;
  const lastDay = Math.floor(options.to / DAY);
  const firstDay = Math.max(Math.floor(options.from / DAY), options.lastRollDay + 1, lastDay - 13);
  if (options.to <= options.from || firstDay > lastDay) {
    return { applicants: [], lastRollDay: Math.max(options.lastRollDay, lastDay) };
  }

  const held = new Set(options.memberIds);
  const applicants: Applicant[] = [];
  let count = options.memberIds.length;

  for (let dayIndex = firstDay; dayIndex <= lastDay; dayIndex += 1) {
    const rng = createRng(
      deriveSeed(options.world.seed, 'applicants', dayIndex),
      `applicants:${dayIndex}`,
    );
    const rate = applicantsPerDay(options.playerRank, options.world.ladder.length, count);

    // A fractional rate is a probability, a rate above one is that many plus a probability.
    const guaranteed = Math.floor(rate);
    const extra = rng.bool(rate - guaranteed) ? 1 : 0;

    for (let i = 0; i < guaranteed + extra; i += 1) {
      if (count >= GUILD_CAPACITY) break;
      // Drawn from the unguilded, near enough the player's rung to have heard of them.
      const candidate = pickUnguilded(options.world, rng, held);
      if (candidate === null) break;
      held.add(candidate);
      count += 1;
      applicants.push({ botId: candidate, at: Math.min(options.to, (dayIndex + 1) * DAY) });
    }
  }

  return { applicants, lastRollDay: lastDay };
}

/** A bot with no hall of their own, or one who would leave theirs. Null if there is nobody. */
function pickUnguilded(
  world: WorldState,
  rng: ReturnType<typeof createRng>,
  taken: ReadonlySet<number>,
): number | null {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const id = Math.floor(rng.next() * world.bots.length);
    const record = world.bots[id];
    if (!record || taken.has(id)) continue;
    if (record.guildId >= 0) continue;
    return id;
  }
  return null;
}

/** A bot's application, as the Guildmaster sees it (spec §1's "resume"). */
export interface ApplicantResume {
  readonly botId: number;
  readonly name: string;
  readonly level: number;
  readonly honor: number;
  readonly rank: number;
  readonly portraitClass: string;
  /** "Plays most days", "on and off", "hard to pin down" — the activity pattern, in words. */
  readonly activity: string;
  readonly at: number;
}

export function resumeFor(world: WorldState, applicant: Applicant): ApplicantResume | null {
  const record = world.bots[applicant.botId];
  if (!record) return null;
  const identity = botIdentity(world.seed, applicant.botId);
  const { dedication, volatility } = identity.personality;

  const activity =
    volatility > 0.7
      ? 'hard to pin down'
      : dedication > 0.85
        ? 'plays most days, all day'
        : dedication > 0.5
          ? 'on most evenings'
          : 'on and off';

  return {
    botId: applicant.botId,
    name: identity.name,
    level: record.level,
    honor: record.honor,
    rank: world.ladder.indexOf(applicant.botId) + 1,
    portraitClass: identity.classId,
    activity,
    at: applicant.at,
  };
}

/** Re-exported so callers get the capacity and the player's hall id from one import. */
export { GUILD_CAPACITY, PLAYER_GUILD_ID };
