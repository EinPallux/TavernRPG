/**
 * The Town Crier (world-simulation spec §6).
 *
 * The feed is the **proof of life** for the whole simulation. Everything else the sim does is
 * invisible — a bot levelling in the middle of the ladder changes a number nobody looks at — so
 * the feed is where fifteen hundred simulated heroes become something the player can see.
 *
 * That gives this module exactly one rule, and it is a hard one: **every entry is backed by a
 * `SimEvent` the tick actually produced.** There is no "generate some plausible news" path. If
 * the simulation did not do it, the Crier does not say it, and the audit test walks a hundred
 * entries checking the delta is really there. The single exception is `flavour` — lines about
 * the world rather than its people — which carries no `sourceEvent` and is tagged so the audit
 * can tell it apart.
 *
 * Priority is the second rule: **names the player knows come first** (rivals > guildmates >
 * ladder neighbours > strangers). Thirty entries a day is not many when the sim produces a
 * thousand, and spending them on strangers wastes the only channel the world has.
 *
 * Pure module.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { guild as guildById } from '@/data/guilds';
import {
  renderHeadline,
  usableTemplates,
  type CrierCategory,
  type CrierSlots,
} from '@/data/crierTemplates';
import { botIdentity } from './identity';
import { rankOf, type WorldState } from './generate';
import type { SimEvent } from './simulate';
import type { Rival } from './rivals';

/** Most entries surfaced for one day (spec §6). */
export const MAX_ENTRIES_PER_DAY = 30;
/** The feed is capped in the save; older entries are trimmed (spec §7). */
export const FEED_CAPACITY = 300;

/** How close counts as a "ladder neighbour" for priority purposes. */
export const NEIGHBOUR_BAND = 50;

/**
 * Most of the board one category may occupy.
 *
 * Pure score ranking made the feed monotonous: the sim emits roughly twice as many ladder passes
 * as level-ups and ladder scores higher, so fourteen slots came out fourteen ladder passes. A
 * board that says the same kind of thing every line is the wallpaper the spec is trying to
 * avoid, however true each line is.
 */
export const MAX_CATEGORY_SHARE = 0.4;

export type CrierRelation = 'rival' | 'guildmate' | 'neighbour' | 'stranger' | 'world';

/** Priority order. Higher wins a contested slot. */
const RELATION_WEIGHT: Readonly<Record<CrierRelation, number>> = {
  rival: 100,
  guildmate: 60,
  neighbour: 30,
  stranger: 8,
  world: 4,
};

/** How interesting each kind of thing is, before relation is taken into account. */
const KIND_WEIGHT: Readonly<Record<SimEvent['kind'], number>> = {
  milestone: 40,
  ladderPass: 18,
  levelUp: 10,
  returned: 14,
  dormant: 9,
};

export interface FeedEntry {
  readonly id: string;
  readonly at: number;
  readonly category: CrierCategory;
  readonly text: string;
  readonly relation: CrierRelation;
  /**
   * The event this headline is reporting. Null only for `flavour`, and the audit test asserts
   * exactly that — a null here in any other category is a Crier that made something up.
   */
  readonly sourceEvent: SimEvent | null;
}

export interface CrierContext {
  readonly world: WorldState;
  readonly rivals: readonly Rival[];
  readonly playerRank: number;
  readonly playerGuildId: number;
}

function relationOf(context: CrierContext, botId: number): CrierRelation {
  if (context.rivals.some((rival) => rival.botId === botId)) return 'rival';

  const record = context.world.bots[botId];
  if (record && context.playerGuildId >= 0 && record.guildId === context.playerGuildId) {
    return 'guildmate';
  }

  if (context.playerRank > 0) {
    const rank = rankOf(context.world, botId);
    if (Math.abs(rank - context.playerRank) <= NEIGHBOUR_BAND) return 'neighbour';
  }

  return 'stranger';
}

/** The category a raw event belongs in. */
function categoryFor(event: SimEvent): CrierCategory {
  switch (event.kind) {
    case 'levelUp':
      return 'levelUp';
    case 'ladderPass':
      return 'ladder';
    case 'milestone':
      return 'milestone';
    case 'dormant':
    case 'returned':
      return 'lifecycle';
  }
}

/** Everything a template might need, read off the event and the world. Never invented. */
function slotsFor(context: CrierContext, event: SimEvent): CrierSlots {
  const identity = botIdentity(context.world.seed, event.botId);
  const record = context.world.bots[event.botId];
  const home = record && record.guildId >= 0 ? guildById(record.guildId) : null;

  const other =
    event.otherId === undefined ? undefined : botIdentity(context.world.seed, event.otherId).name;

  return {
    hero: identity.name,
    ...(other !== undefined ? { other } : {}),
    ...(home ? { guild: home.name } : {}),
    ...(event.level !== undefined ? { level: event.level } : {}),
    ...(event.rank !== undefined ? { rank: event.rank } : {}),
  };
}

/**
 * Turn one event into a headline, or null when no template can be filled from it.
 *
 * Returning null rather than falling back is deliberate: a half-filled line with a literal
 * `{other}` in it would be worse than the event going unreported.
 */
export function headlineFor(
  context: CrierContext,
  event: SimEvent,
  variantSeed: number,
): FeedEntry | null {
  const category = categoryFor(event);
  const slots = slotsFor(context, event);
  const usable = usableTemplates(category, slots);
  if (usable.length === 0) return null;

  const template = usable[Math.abs(variantSeed) % usable.length]!;

  return {
    id: `${event.kind}-${event.botId}-${event.at}`,
    at: event.at,
    category,
    text: renderHeadline(template, slots),
    relation: relationOf(context, event.botId),
    sourceEvent: event,
  };
}

/** A rival, saying something. Backed by the rivalry itself rather than by a tick event. */
export function tauntFor(
  context: CrierContext,
  rival: Rival,
  at: number,
  variantSeed: number,
): FeedEntry | null {
  const identity = botIdentity(context.world.seed, rival.botId);
  const record = context.world.bots[rival.botId];
  const home = record && record.guildId >= 0 ? guildById(record.guildId) : null;

  const slots: CrierSlots = {
    hero: identity.name,
    ...(home ? { guild: home.name } : {}),
    rank: rankOf(context.world, rival.botId),
  };

  const usable = usableTemplates('taunt', slots);
  if (usable.length === 0) return null;
  const template = usable[Math.abs(variantSeed) % usable.length]!;

  return {
    id: `taunt-${rival.botId}-${at}`,
    at,
    category: 'taunt',
    text: renderHeadline(template, slots),
    relation: 'rival',
    // A taunt reports the rivalry, which is real state, but not a tick delta — so it carries
    // its own synthetic source rather than pretending to be a level-up.
    sourceEvent: { kind: 'returned', at, botId: rival.botId },
  };
}

/** World flavour. The only category with nothing behind it, and tagged as such. */
export function flavourEntry(seed: number, at: number): FeedEntry | null {
  const usable = usableTemplates('flavour', {});
  if (usable.length === 0) return null;
  const template = usable[Math.abs(seed) % usable.length]!;

  return {
    id: `flavour-${template.id}-${at}`,
    at,
    category: 'flavour',
    text: template.text,
    relation: 'world',
    sourceEvent: null,
  };
}

export interface BuildFeedOptions {
  readonly context: CrierContext;
  readonly events: readonly SimEvent[];
  /** Existing feed, newest first. New entries are merged in and the whole thing re-trimmed. */
  readonly existing?: readonly FeedEntry[];
  readonly now: number;
  /** Days the events span, so the daily cap scales with a long absence. */
  readonly days?: number;
}

/**
 * Build the feed.
 *
 * Scores everything, keeps the best `MAX_ENTRIES_PER_DAY × days`, and sorts by time for
 * display. Scoring rather than filtering is what makes the priority rule work: a stranger
 * taking rank one still beats a guildmate gaining a level, which is the correct call and would
 * be impossible with a hard "guildmates first" cut.
 */
export function buildFeed({
  context,
  events,
  existing = [],
  now,
  days = 1,
}: BuildFeedOptions): FeedEntry[] {
  const rng = createRng(
    deriveSeed(context.world.seed, 'crier', Math.floor(now / 3_600_000)),
    'crier',
  );

  const scored: { entry: FeedEntry; score: number }[] = [];
  for (const event of events) {
    const entry = headlineFor(context, event, rng.int(0, 4096));
    if (!entry) continue;
    // Recency is a tie-breaker, not a driver: a rival taking rank one last Tuesday still beats
    // a stranger levelling an hour ago.
    const ageDays = Math.max(0, (now - event.at) / 86_400_000);
    const score =
      RELATION_WEIGHT[entry.relation] + KIND_WEIGHT[event.kind] - Math.min(30, ageDays * 2);
    scored.push({ entry, score });
  }

  // Rivals get a word in even on a quiet day — they are the point of the feature.
  for (const rival of context.rivals) {
    if (rival.heat < 40) continue;
    const taunt = tauntFor(context, rival, now, rng.int(0, 4096));
    if (taunt) scored.push({ entry: taunt, score: RELATION_WEIGHT.rival + rival.heat / 4 });
  }

  const budget = Math.max(MAX_ENTRIES_PER_DAY, Math.ceil(MAX_ENTRIES_PER_DAY * Math.min(3, days)));
  scored.sort((a, b) => b.score - a.score);

  // Best-first, but no category may run away with the board. Anything skipped for diversity is
  // held back and used to fill the remainder, so a genuinely one-note day still fills up.
  const perCategory = Math.max(2, Math.floor(budget * MAX_CATEGORY_SHARE));
  const used = new Map<CrierCategory, number>();
  const chosen: FeedEntry[] = [];
  const overflow: FeedEntry[] = [];

  for (const { entry } of scored) {
    if (chosen.length >= budget) break;
    const count = used.get(entry.category) ?? 0;
    if (count >= perCategory) {
      overflow.push(entry);
      continue;
    }
    used.set(entry.category, count + 1);
    chosen.push(entry);
  }

  for (const entry of overflow) {
    if (chosen.length >= budget) break;
    chosen.push(entry);
  }

  // A genuinely quiet stretch gets one flavour line rather than an empty board.
  if (chosen.length < 3) {
    const flavour = flavourEntry(rng.int(0, 4096), now);
    if (flavour) chosen.push(flavour);
  }

  // Merge with what is already there, newest first, de-duplicated by id.
  const seen = new Set<string>();
  const merged: FeedEntry[] = [];
  for (const entry of [...chosen, ...existing].sort((a, b) => b.at - a.at)) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
    if (merged.length >= FEED_CAPACITY) break;
  }

  return merged;
}

/** What the "while you were away" card summarises (spec §4). */
export interface AbsenceSummary {
  readonly days: number;
  readonly levelUps: number;
  readonly ladderMoves: number;
  readonly milestones: number;
  /** Ranks the player lost by standing still, if any. */
  readonly rankDrift: number;
  /** The single most notable thing that happened, for the headline line. */
  readonly headline: FeedEntry | null;
}

export function summariseAbsence(
  events: readonly SimEvent[],
  feed: readonly FeedEntry[],
  days: number,
  rankDrift: number,
): AbsenceSummary {
  return {
    days,
    levelUps: events.filter((event) => event.kind === 'levelUp').length,
    ladderMoves: events.filter((event) => event.kind === 'ladderPass').length,
    milestones: events.filter((event) => event.kind === 'milestone').length,
    rankDrift,
    headline:
      feed.find((entry) => entry.category === 'milestone') ??
      feed.find((entry) => entry.relation === 'rival') ??
      feed[0] ??
      null,
  };
}
