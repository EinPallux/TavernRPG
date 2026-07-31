/**
 * Guild chat generation (guilds spec §3).
 *
 * The illusion engine, and the module most able to break the illusion. It inherits the Town
 * Crier's contract without softening it: **a message is either backed by something the
 * simulation did, or it is tagged as colour.** No line invents a level-up, a drop or a rank.
 *
 * Three things make a hall feel inhabited rather than generated, and all three are here:
 *
 * 1. **The right people talk.** Volume comes off the roster's sociability, and a line tagged for
 *    a gruff voice never comes out of a chatty one. A quiet hall is quiet because quiet people
 *    joined it.
 * 2. **They sleep.** Each bot has a timezone offset, so messages cluster in that member's waking
 *    hours. A hall of northerners goes still at the same time every night, which is what makes
 *    logging in at 3am feel like 3am.
 * 3. **They answer you.** A player post draws replies from members who are awake and inclined,
 *    matched to what was said — greeting for greeting, grats or a ribbing for a brag.
 *
 * Pure module.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { botIdentity } from '@/engine/world/identity';
import type { SimEvent } from '@/engine/world/simulate';
import type { WorldState } from '@/engine/world/generate';
import { PLAYER_LADDER_ID } from '@/engine/world/ladder';
import {
  chatLineAt,
  renderChatLine,
  usableChatLines,
  type ChatCategory,
  type ChatSlots,
  type ChatTemplate,
} from '@/data/guildChat';

/** Messages kept (spec §3). Older ones scroll off; nobody reads back further than this. */
export const CHAT_CAPACITY = 200;

/** Messages a day, at the extremes of roster sociability (spec §3). */
export const MIN_MESSAGES_PER_DAY = 6;
export const MAX_MESSAGES_PER_DAY = 20;

/** Days of chatter replayed in one catch-up. Past this the hall is summarised by its silence. */
export const MAX_CHAT_CATCHUP_DAYS = 3;

/** Hours a bot is plausibly awake, around their own local noon. */
const WAKING_FROM = 8;
const WAKING_TO = 23;

/**
 * How many lines back a template stays "just said".
 *
 * Colour is drawn from thirty-two lines (fourteen greetings, eighteen idles) and then narrowed
 * again by voice, so an unconstrained pick over a two-day catch-up produced "Evening. Anyone
 * still up?" four times on one screen. Nothing was wrong with the roll — that is simply what
 * uniform sampling of a small pool looks like when you can see all of it at once, and a hall
 * that repeats itself is the single loudest tell that nobody is home.
 *
 * So a line that has just been said is off the table until it scrolls out of this window. It
 * never *forbids* a pick: if the window swallows every candidate the constraint is dropped for
 * that message rather than losing the line altogether.
 */
const RECENTLY_SAID = 12;

/**
 * Pick a line nobody has used lately, remembering it.
 *
 * Deterministic — `index` still comes off the day's seeded stream, and the window is rebuilt in
 * the same order on every replay, so the same day generates the same conversation.
 */
function pickFresh(
  lines: readonly ChatTemplate[],
  index: number,
  recent: string[],
): ChatTemplate | null {
  const fresh = lines.filter((line) => !recent.includes(line.id));
  const template = chatLineAt(fresh.length > 0 ? fresh : lines, index);
  if (!template) return null;

  recent.push(template.id);
  if (recent.length > RECENTLY_SAID) recent.shift();
  return template;
}

export type ChatAuthor =
  | { readonly kind: 'bot'; readonly botId: number; readonly name: string }
  | { readonly kind: 'player'; readonly name: string }
  /** Joins, promotions, bounty milestones — the hall itself talking. */
  | { readonly kind: 'system' };

export interface ChatMessage {
  readonly id: string;
  readonly at: number;
  readonly author: ChatAuthor;
  readonly text: string;
  readonly category: ChatCategory;
  /**
   * What this message is about. Null only for `idle`, `greeting` and `reply` — the audit test
   * asserts exactly that, so a null anywhere else is a hall that made something up.
   */
  readonly sourceEvent: SimEvent | null;
}

/* ── Who is awake ──────────────────────────────────────────────────────────────── */

/** Local hour for a member at a given moment, given their offset from the player's midnight. */
export function localHour(at: number, offset: number): number {
  const hour = new Date(at).getHours() + offset;
  return ((hour % 24) + 24) % 24;
}

export function isAwake(at: number, offset: number): boolean {
  const hour = localHour(at, offset);
  return hour >= WAKING_FROM && hour <= WAKING_TO;
}

/** The members who could plausibly be typing right now. */
export function awakeMembers(
  world: WorldState,
  memberIds: readonly number[],
  at: number,
): number[] {
  return memberIds.filter((id) => {
    if (id === PLAYER_LADDER_ID) return false;
    const record = world.bots[id];
    if (!record || record.dormantUntil > at) return false;
    return isAwake(at, botIdentity(world.seed, id).timezoneOffset);
  });
}

/** Roster sociability, 0–1. Drives how much the hall says. */
function chattiness(world: WorldState, memberIds: readonly number[]): number {
  const bots = memberIds.filter((id) => id !== PLAYER_LADDER_ID);
  if (bots.length === 0) return 0;
  let total = 0;
  for (const id of bots) total += botIdentity(world.seed, id).personality.sociability;
  return total / bots.length;
}

export function messagesPerDay(world: WorldState, memberIds: readonly number[]): number {
  const span = MAX_MESSAGES_PER_DAY - MIN_MESSAGES_PER_DAY;
  return Math.round(MIN_MESSAGES_PER_DAY + span * chattiness(world, memberIds));
}

/** Which voice a member speaks in, from their personality. */
function voiceOf(world: WorldState, botId: number): ChatTemplate['voice'] {
  const { personality } = botIdentity(world.seed, botId);
  if (personality.sociability > 0.66) return 'sociable';
  if (personality.sociability < 0.34) return 'gruff';
  return personality.dedication > 0.8 ? 'keen' : undefined;
}

/* ── Turning events into talk ──────────────────────────────────────────────────── */

/** The category an event gets talked about in, and the slots it fills. */
function talkFor(
  world: WorldState,
  event: SimEvent,
  memberIds: readonly number[],
  guildName: string,
): { category: ChatCategory; slots: ChatSlots } | null {
  const subject = world.bots[event.botId];
  if (!subject) return null;
  const name = event.botId === PLAYER_LADDER_ID ? 'you' : botIdentity(world.seed, event.botId).name;
  const other =
    event.otherId !== undefined && world.bots[event.otherId]
      ? botIdentity(world.seed, event.otherId).name
      : undefined;

  // Only talk about the hall's own people. A guild discussing strangers is a news feed.
  if (!memberIds.includes(event.botId)) return null;

  switch (event.kind) {
    case 'levelUp':
      return event.level === undefined
        ? null
        : { category: 'brag', slots: { hero: name, level: event.level, guild: guildName } };
    case 'milestone':
      return event.rank === undefined
        ? null
        : { category: 'arena', slots: { hero: name, rank: event.rank, guild: guildName } };
    case 'ladderPass':
      return event.rank === undefined
        ? null
        : {
            category: 'brag',
            slots: { hero: name, rank: event.rank, guild: guildName, ...(other ? { other } : {}) },
          };
    case 'dormant':
      return { category: 'farewell', slots: { hero: name, guild: guildName } };
    case 'returned':
      return { category: 'farewell', slots: { hero: name, guild: guildName } };
  }
}

export interface GenerateChatOptions {
  readonly world: WorldState;
  readonly memberIds: readonly number[];
  readonly guildName: string;
  readonly events: readonly SimEvent[];
  readonly from: number;
  readonly to: number;
  /** Last day index already generated, so a reload does not re-fill the log. */
  readonly lastChatDay: number;
}

/**
 * The messages the hall posted while the player was away.
 *
 * Day-keyed and gated on a high-water mark, for the same reason arena raids are: the roll is
 * seeded by the day, so re-running it produces the same messages — and appending them a second
 * time would fill the log with duplicates on every page load.
 */
export function generateChat({
  world,
  memberIds,
  guildName,
  events,
  from,
  to,
  lastChatDay,
}: GenerateChatOptions): { readonly messages: ChatMessage[]; readonly lastChatDay: number } {
  const DAY = 86_400_000;
  const lastDay = Math.floor(to / DAY);
  const firstDay = Math.max(
    Math.floor(from / DAY),
    lastChatDay + 1,
    lastDay - MAX_CHAT_CATCHUP_DAYS + 1,
  );
  if (to <= from || firstDay > lastDay || memberIds.length === 0) {
    return { messages: [], lastChatDay: Math.max(lastChatDay, lastDay) };
  }

  const perDay = messagesPerDay(world, memberIds);
  const messages: ChatMessage[] = [];
  // Events are consumed rather than reused, so the same level-up is not congratulated twice.
  const unspoken = events.filter((event) => memberIds.includes(event.botId));
  const recent: string[] = [];
  let cursor = 0;
  let lastSpeaker = -1;

  for (let dayIndex = firstDay; dayIndex <= lastDay; dayIndex += 1) {
    const rng = createRng(deriveSeed(world.seed, 'chat', dayIndex), `chat:${dayIndex}`);

    for (let slot = 0; slot < perDay; slot += 1) {
      // Spread across the day, then filtered by who is actually up at that hour.
      const at = Math.min(
        to,
        dayIndex * DAY + Math.floor(((slot + rng.float(0, 1)) / perDay) * DAY),
      );
      if (at < from) continue;

      const awake = awakeMembers(world, memberIds, at);
      if (awake.length === 0) continue;

      // Nobody talks to themselves twice in a row while the room is full, so if the roll picks
      // the last speaker again and there is anyone else up, it goes to them instead.
      const floor = awake.filter((id) => id !== lastSpeaker);
      const pool = floor.length > 0 ? floor : awake;
      const speaker = pool[Math.floor(rng.next() * pool.length) % pool.length]!;
      const voice = voiceOf(world, speaker);
      lastSpeaker = speaker;

      // An event to talk about, if there is one going spare; otherwise colour.
      const event = cursor < unspoken.length ? unspoken[cursor] : undefined;
      const talk = event ? talkFor(world, event, memberIds, guildName) : null;

      const category: ChatCategory = talk?.category ?? (rng.bool(0.4) ? 'greeting' : 'idle');
      const slots: ChatSlots = talk?.slots ?? { guild: guildName };
      const lines = usableChatLines(category, slots, voice);
      const template = pickFresh(lines, rng.int(0, 4096), recent);
      if (!template) continue;

      if (talk) cursor += 1;

      messages.push({
        id: `chat-${dayIndex}-${slot}-${speaker}`,
        at,
        author: { kind: 'bot', botId: speaker, name: botIdentity(world.seed, speaker).name },
        text: renderChatLine(template, slots),
        category,
        sourceEvent: talk && event ? event : null,
      });
    }
  }

  return { messages, lastChatDay: lastDay };
}

/* ── Replying to the player ────────────────────────────────────────────────────── */

/** What the player appears to have said. Matched on shape, never on meaning. */
export type PlayerIntent = 'greeting' | 'brag' | 'grumble' | 'question' | 'chatter';

/**
 * Read a player's message.
 *
 * Deliberately crude, and deliberately *not* an LLM (spec §3: "never uncanny — curated templates
 * only"). A shallow match that answers "hello" with "hello" is better than a clever one that
 * occasionally answers something nobody said.
 */
export function readIntent(text: string): PlayerIntent {
  const lower = text.toLowerCase().trim();
  if (/^(hi|hey|hello|yo|morning|evening|greetings|o\/)\b/.test(lower)) return 'greeting';
  if (lower.endsWith('?')) return 'question';
  if (/\b(dinged|hit \d|level \d|got a|pulled a|finally|rank \d|beat)\b/.test(lower)) return 'brag';
  if (/\b(lost|died|nothing|again|ugh|terrible|unlucky|broke)\b/.test(lower)) return 'grumble';
  return 'chatter';
}

/** Replies to a greeting are greetings; to a brag, congratulations or a ribbing. */
const REPLY_SHAPE: Readonly<Record<PlayerIntent, readonly string[]>> = {
  greeting: ['p-hi', 'p-hi-2', 'p-hi-3', 'p-hi-4', 'p-welcome-back'],
  brag: ['p-grats', 'p-grats-2', 'p-grats-3', 'p-grats-4', 'p-tease', 'p-tease-2', 'p-tease-3'],
  grumble: ['p-sympathy', 'p-sympathy-2', 'p-sympathy-3', 'p-agree', 'p-agree-3'],
  question: ['p-question', 'p-question-2', 'p-question-3', 'p-shrug'],
  chatter: ['p-agree', 'p-agree-2', 'p-agree-3', 'p-hi-2', 'p-thanks'],
};

export interface ReplyOptions {
  readonly world: WorldState;
  readonly memberIds: readonly number[];
  readonly playerName: string;
  readonly text: string;
  readonly at: number;
}

/**
 * Who answers, and with what.
 *
 * Only members who are awake and inclined reply, and at most a couple do — a hall where every
 * member answers every message is a hall of bots, which is exactly the tell this whole system
 * exists to avoid.
 */
export function replyToPlayer({
  world,
  memberIds,
  playerName,
  text,
  at,
}: ReplyOptions): ChatMessage[] {
  const intent = readIntent(text);
  const awake = awakeMembers(world, memberIds, at);
  if (awake.length === 0) return [];

  const rng = createRng(deriveSeed(world.seed, 'reply', at), `reply:${at}`);
  const wanted = REPLY_SHAPE[intent];
  const replies: ChatMessage[] = [];
  // Two people answering "hey" with the same four words is worse than one person answering.
  const said: string[] = [];

  for (const botId of awake) {
    if (replies.length >= 2) break;
    const { personality, name } = botIdentity(world.seed, botId);
    // Sociability *is* the response rate. A quiet member answering every post would be a
    // different person from the one the roster says they are.
    if (!rng.bool(personality.sociability * 0.55)) continue;

    const others = awake.filter((id) => id !== botId);
    const slots: ChatSlots = {
      hero: playerName,
      ...(others[0] !== undefined ? { other: botIdentity(world.seed, others[0]).name } : {}),
    };
    const lines = usableChatLines('reply', slots, voiceOf(world, botId)).filter(
      (line) => wanted.includes(line.id) && !said.includes(line.id),
    );
    const template = chatLineAt(lines, rng.int(0, 4096));
    if (!template) continue;
    said.push(template.id);

    replies.push({
      // Offset so the replies land after the player's own line and in a readable order.
      id: `reply-${at}-${botId}`,
      at: at + (replies.length + 1) * 4_000 + Math.round(rng.float(0, 6_000)),
      author: { kind: 'bot', botId, name },
      text: renderChatLine(template, slots),
      category: 'reply',
      sourceEvent: null,
    });
  }

  return replies;
}

/* ── The log ───────────────────────────────────────────────────────────────────── */

/** A system line — a join, a promotion, a bounty cleared. */
export function systemMessage(at: number, text: string, id: string): ChatMessage {
  return { id, at, author: { kind: 'system' }, text, category: 'idle', sourceEvent: null };
}

/**
 * Merge new messages into the log, oldest first, capped.
 *
 * Sorted by time rather than appended, because catch-up produces a batch spanning days that has
 * to interleave with whatever was already there — and because replies are timestamped a few
 * seconds after the message they answer, which only reads correctly in order.
 */
export function mergeChat(
  existing: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const seen = new Set(existing.map((message) => message.id));
  const merged = [...existing];
  for (const message of incoming) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    merged.push(message);
  }
  merged.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return merged.slice(-CHAT_CAPACITY);
}
