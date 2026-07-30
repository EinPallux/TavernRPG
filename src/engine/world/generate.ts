/**
 * World generation (world-simulation spec §2).
 *
 * Runs once per save and produces a server that looks about ninety days old: 1,500 heroes spread
 * across a log-normal level curve (median ~28, p95 ~74, max ~92), sixty guilds holding roughly
 * 55% of them, and a ladder already sorted by honor. The player starts at the bottom of a living
 * ladder rather than at the top of an empty one — which is the whole point of the system.
 *
 * Only **divergence** is produced here (spec §7). Names, classes and personalities are not in
 * the output because they are recomputed from the seed by `identity.ts`; what a `BotRecord`
 * holds is the handful of numbers the simulation actually changes.
 *
 * Pure module.
 */

import { createRng, deriveSeed } from '@/engine/rng';
import { GUILD_CAPACITY, GUILD_COUNT } from '@/data/guilds';
import { LEGEND_COUNT } from '@/data/legends';
import { BOT_COUNT, botIdentity, dedicationPercentile } from './identity';

/** Share of the population that starts in a guild (spec §2). */
export const GUILDED_SHARE = 0.55;

/**
 * `[TUNE]` Gold a ninety-day-old hall has banked, per member, across both tracks.
 *
 * Solved backwards from `stepCost` rather than guessed. The Phase 8 figure was 900 a member,
 * written before the buff curve existed; read back through it, a full hall came to +1.25% against
 * balancing §11's "~+15% by month 2". Steps cost `500·s^1.7`, so step 60 is about twelve million
 * gold and a hall's pot has to be in the millions for the browse list to show any difference
 * between one hall and another.
 */
export const TREASURY_PER_MEMBER = 420_000;

/**
 * Level distribution, solved for the §12 shape: median ~28, p95 ~74, max ~92.
 *
 * Log-normal with `median = exp(mu)` and `p95 = exp(mu + 1.645σ)`, so σ = ln(74/28)/1.645 ≈ 0.59.
 * A raw log-normal's tail overshoots badly at n = 1,500 — the 1-in-1500 draw lands near level
 * 185 — so the top is **compressed asymptotically** rather than clamped. Clamping piles dozens
 * of heroes on the cap, and a ladder with seventy-five level-92s at the top is not a believable
 * server, it is a wall.
 */
const LEVEL_MEDIAN = 28;
const LEVEL_SIGMA = 0.59;
/** Above this the curve starts bending; below it the distribution is untouched. */
const SOFT_CAP_KNEE = 70;
/** How strongly dedication predicts level. A Gaussian copula, so the marginal stays log-normal. */
const DEDICATION_CORRELATION = 0.65;

export const MIN_BOT_LEVEL = 2;
export const MAX_BOT_LEVEL = 92;
/**
 * The ceiling for everybody who is not a legend.
 *
 * Reserving the top ten levels for the top ten names is what makes the legends read as a tier
 * rather than as ten more heroes tied with seventy others at the cap.
 */
export const MAX_ORDINARY_LEVEL = MAX_BOT_LEVEL - 10;

/** Initial honor by rank (balancing §10): rank 1 sits near 9,800 and it falls off linearly. */
export const HONOR_AT_RANK_ONE = 9_800;
export const HONOR_PER_RANK = 6.1;

export function seededHonorForRank(rank: number): number {
  return Math.max(50, Math.round(HONOR_AT_RANK_ONE - HONOR_PER_RANK * Math.max(0, rank - 1)));
}

/**
 * A bot's mutable state — everything the simulation can change about them.
 *
 * Budget is ~200 bytes hot (spec §7); this is seven numbers. Identity is *not* here on purpose:
 * storing 1,500 names would cost more than the rest of the save put together, and would let a
 * stored name drift from the seed that is supposed to imply it.
 */
export interface BotRecord {
  readonly id: number;
  readonly level: number;
  /** Progress into the current level, on the shared XP curve. */
  readonly xp: number;
  readonly honor: number;
  /** Guild index, or -1 for the unguilded. */
  readonly guildId: number;
  /**
   * Gear score as a multiple of the level baseline, ~0.8–1.15. Hoarders run ahead, the careless
   * lag behind, and it is what makes two level-40 bots feel like different opponents.
   */
  readonly gearScore: number;
  /** Timestamp they come back, or 0 when they are around. Quit/return arcs (spec §3). */
  readonly dormantUntil: number;
}

export interface GuildRecord {
  readonly id: number;
  readonly memberIds: readonly number[];
  /** Donated gold, which drives the two buff tracks (balancing §11). */
  readonly treasury: number;
  /** False once a guild folds; the record stays so the Crier can refer to it. */
  readonly active: boolean;
}

export interface WorldState {
  readonly seed: number;
  readonly createdAt: number;
  /** Last timestamp the simulation has been advanced to. */
  readonly lastSimAt: number;
  readonly bots: readonly BotRecord[];
  readonly guilds: readonly GuildRecord[];
  /** Bot ids in ladder order, best first. The player is not in here (see `ladder.ts`). */
  readonly ladder: readonly number[];
}

/**
 * Box–Muller, from two uniforms. Deterministic given the stream, which `Math.random`-based
 * implementations of the same idea are not.
 */
function standardNormal(u1: number, u2: number): number {
  const safe = Math.max(1e-9, u1);
  return Math.sqrt(-2 * Math.log(safe)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Inverse normal CDF (Acklam's rational approximation, |error| < 1.2e-9).
 *
 * Needed to turn a bot's dedication *percentile* into a z-score, so level and dedication can be
 * correlated without moving the level distribution off its target shape.
 */
export function probit(p: number): number {
  const clamped = Math.min(1 - 1e-12, Math.max(1e-12, p));

  const a = [
    -39.696830286653757, 220.9460984245205, -275.92851044696869, 138.357751867269,
    -30.66479806614716, 2.5066282774592392,
  ];
  const b = [
    -54.476098798224058, 161.58583685804089, -155.69897985988661, 66.80131188771972,
    -13.280681552885721,
  ];
  const c = [
    -0.0077848940024302926, -0.32239645804113648, -2.4007582771618381, -2.5497325393437338,
    4.3746641414649678, 2.9381639826987831,
  ];
  const d = [0.0077846957090414622, 0.32246712907003983, 2.445134137142996, 3.7544086619074162];

  const low = 0.02425;
  if (clamped < low) {
    const q = Math.sqrt(-2 * Math.log(clamped));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (clamped > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - clamped));
    return (
      -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }

  const q = clamped - 0.5;
  const r = q * q;
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  );
}

/**
 * Bend the top of the curve toward a ceiling instead of clamping onto it.
 *
 * Everything below the knee passes through untouched, so the median and p95 the spec asks for
 * are unaffected; above it the excess is compressed exponentially and converges on `ceiling`
 * without ever reaching it. The difference is visible on a ladder: clamping gave seventy-five
 * heroes tied at level 92, this gives a thinning tail.
 */
export function softCap(raw: number, knee: number, ceiling: number): number {
  if (raw <= knee) return raw;
  const range = ceiling - knee;
  return knee + range * (1 - Math.exp(-(raw - knee) / range));
}

/**
 * A believable level for a ninety-day-old server (balancing §12).
 *
 * Dedication and level are correlated through a Gaussian copula rather than a multiplier: the
 * bot's dedication percentile becomes one z-score, noise becomes another, and the two are mixed
 * with weights that sum in quadrature to 1. That keeps the *marginal* distribution exactly the
 * log-normal the spec asks for while still putting the diligent above the idle. A multiplier
 * cannot do both — the first version of this used one and pulled the median from 28 down to 24.
 */
export function rollBotLevel(u1: number, u2: number, percentile: number): number {
  const zDedication = probit(percentile);
  const zNoise = standardNormal(u1, u2);
  const mixed =
    DEDICATION_CORRELATION * zDedication + Math.sqrt(1 - DEDICATION_CORRELATION ** 2) * zNoise;

  const raw = LEVEL_MEDIAN * Math.exp(LEVEL_SIGMA * mixed);
  const shaped = softCap(raw, SOFT_CAP_KNEE, MAX_ORDINARY_LEVEL);
  return Math.min(MAX_ORDINARY_LEVEL, Math.max(MIN_BOT_LEVEL, Math.round(shaped)));
}

/**
 * Build a world.
 *
 * Deterministic in `(seed)` alone — `createdAt` is stamped in but never sampled from, so two
 * worlds made from the same seed a month apart are identical populations.
 */
export function generateWorld(seed: number, createdAt: number): WorldState {
  const rng = createRng(deriveSeed(seed, 'worldgen'), 'worldgen');

  // ── Levels and gear, one independent fork per bot so order cannot matter. ──
  const drafts = Array.from({ length: BOT_COUNT }, (_, id) => {
    const identity = botIdentity(seed, id);
    const botRng = createRng(deriveSeed(seed, 'worldgen', id), `worldgen:${id}`);

    const level = rollBotLevel(
      botRng.next(),
      botRng.next(),
      dedicationPercentile(identity.personality.dedication),
    );
    // Hoarders run up to 15% ahead of the level baseline, the careless up to 20% behind.
    const gearScore = 0.8 + identity.personality.hoarding * 0.35;

    return { id, level, gearScore, dedication: identity.personality.dedication };
  });

  // ── The legends take the top ten places, by authored rank. ──
  // Their *levels* still come off the same curve above; what is authored is where they sit.
  const legends = drafts.slice(0, LEGEND_COUNT);
  const rest = drafts.slice(LEGEND_COUNT);

  // Everyone else is ranked by level with a little noise, so the ladder is not a strict
  // level sort — real ladders have a level-40 above a level-42 who never fights.
  const ranked = [...rest].sort((a, b) => {
    const noiseA = createRng(deriveSeed(seed, 'ladder', a.id), 'ladder').next();
    const noiseB = createRng(deriveSeed(seed, 'ladder', b.id), 'ladder').next();
    return b.level + noiseB * 6 - (a.level + noiseA * 6);
  });

  // The legends occupy the ten levels reserved above the field, descending by authored rank, so
  // rank 1 is genuinely the highest hero in the world and the top ten read as a tier. Their
  // *stats* still come off the same curves as everyone else (spec §1) — only where they sit is
  // authored.
  const highestOther = ranked[0]?.level ?? MIN_BOT_LEVEL;
  const liftedLegends = legends.map((legend, index) => ({
    ...legend,
    level: Math.max(highestOther + 1, MAX_BOT_LEVEL - index),
  }));

  const ordered = [...liftedLegends, ...ranked];

  // ── Guild membership: ~55% of the population, spread across the sixty halls. ──
  const memberIds: number[][] = Array.from({ length: GUILD_COUNT }, () => []);
  const guildOf = new Map<number, number>();

  for (const draft of ordered) {
    if (!rng.bool(GUILDED_SHARE)) continue;
    // Weighted toward the earlier guilds so a few halls are large and most are modest, which is
    // what a real server looks like — a flat spread gives sixty identical guilds.
    //
    // Capped, and it has to be: before Phase 10 nothing enforced `GUILD_CAPACITY` here, and the
    // Guild Hall's browse list duly opened on five halls advertising "78/25 members". A full
    // hall simply turns the applicant away and they try the next one, which is also what a real
    // server looks like.
    let pick = Math.min(GUILD_COUNT - 1, Math.floor(Math.abs(rng.float(0, 1) ** 1.6) * GUILD_COUNT));
    for (let tries = 0; tries < 6 && memberIds[pick]!.length >= GUILD_CAPACITY; tries += 1) {
      pick = Math.min(GUILD_COUNT - 1, Math.floor(Math.abs(rng.float(0, 1) ** 1.6) * GUILD_COUNT));
    }
    if (memberIds[pick]!.length >= GUILD_CAPACITY) continue;

    memberIds[pick]!.push(draft.id);
    guildOf.set(draft.id, pick);
  }

  const bots: BotRecord[] = ordered.map((draft, index) => ({
    id: draft.id,
    level: draft.level,
    xp: 0,
    honor: seededHonorForRank(index + 1),
    guildId: guildOf.get(draft.id) ?? -1,
    gearScore: Math.round(draft.gearScore * 1000) / 1000,
    dormantUntil: 0,
  }));

  // Stored by id so lookups are an index, not a search. The ladder holds the order.
  const byId = [...bots].sort((a, b) => a.id - b.id);

  const guilds: GuildRecord[] = memberIds.map((members, id) => ({
    id,
    memberIds: members,
    // Seeded treasury: a ninety-day-old guild has been donating the whole time.
    //
    // `[TUNE]` balancing §11. Priced against the *buff curve* rather than guessed, which is what
    // the Phase 8 figure (900 a member) was — it predated `stepCost`, and read back through it a
    // full hall came to +1.25%, against the spec's "~+15% by month 2". Steps cost `500·s^1.7`,
    // so step 60 is about twelve million gold; a hall's pot has to be in the millions for the
    // browse list to show a difference between one hall and another at all.
    treasury: Math.round(members.length * TREASURY_PER_MEMBER * (0.35 + rng.float(0, 1.3))),
    active: true,
  }));

  return {
    seed,
    createdAt,
    lastSimAt: createdAt,
    bots: byId,
    guilds,
    ladder: ordered.map((draft) => draft.id),
  };
}

/** A bot's current rank, 1-based. Linear, but the ladder is 1,500 entries — this is fine. */
export function rankOf(world: WorldState, botId: number): number {
  const index = world.ladder.indexOf(botId);
  return index === -1 ? world.ladder.length : index + 1;
}

export function botById(world: WorldState, botId: number): BotRecord | null {
  return world.bots[botId] ?? null;
}

/** Bots holding ranks in `[from, to]`, 1-based and inclusive. */
export function botsInRankRange(world: WorldState, from: number, to: number): number[] {
  const start = Math.max(0, from - 1);
  return world.ladder.slice(start, Math.max(start, to));
}
