/**
 * Reading a battle back (combat spec §6).
 *
 * The result screen owes the player two things a raw log cannot give them: the "closest
 * moment" line, and — after a loss — an honest reason they lost that points at something they
 * can actually change. Both are arithmetic over the log, so both live here rather than in a
 * component.
 *
 * Hints come out as typed codes carrying their numbers; the wording is the UI's business.
 * That keeps a copy edit from touching the engine, and lets the same analysis feed a future
 * arena log viewer or guild report.
 *
 * Pure module.
 */

import type { BattleEvent, Side } from './types';

export type LossHint =
  /** Their armour ate a large share of everything you swung. */
  | { readonly kind: 'armour'; readonly mitigatedShare: number }
  /** They blocked, dodged or made you miss too often. */
  | { readonly kind: 'evaded'; readonly evaded: number; readonly swings: number }
  /** They simply hit harder per round than you did. */
  | { readonly kind: 'outpaced'; readonly theirPerRound: number; readonly yourPerRound: number }
  /** You were out of health long before they were. */
  | { readonly kind: 'fragile'; readonly roundsSurvived: number }
  /** A knockout you nearly landed first. */
  | { readonly kind: 'so-close'; readonly theirRemaining: number; readonly theirMaxHealth: number }
  /** Nobody could finish it; the health fractions decided it. */
  | { readonly kind: 'round-limit' };

export interface SideStats {
  readonly swings: number;
  readonly hits: number;
  readonly crits: number;
  readonly followUps: number;
  /** Swings that produced nothing: blocked, dodged or missed. */
  readonly evaded: number;
  readonly rawDamage: number;
  readonly damageDealt: number;
  readonly biggestHit: number;
}

export interface BattleAnalysis {
  readonly winner: Side;
  readonly rounds: number;
  readonly reason: 'knockout' | 'round_limit';
  readonly stats: Readonly<Record<Side, SideStats>>;
  readonly finalHealth: Readonly<Record<Side, number>>;
  readonly maxHealth: Readonly<Record<Side, number>>;
  /** Lowest health each side ever reached — the "closest moment" line. */
  readonly lowestHealth: Readonly<Record<Side, number>>;
  /**
   * Share of the viewer's raw damage that armour and damage reduction absorbed, 0–1.
   * Undefined when they never landed a swing worth measuring.
   */
  readonly mitigatedShare: number;
  /** Ordered most-actionable first. Empty when the viewer won. */
  readonly hints: readonly LossHint[];
}

function emptyStats(): {
  swings: number;
  hits: number;
  crits: number;
  followUps: number;
  evaded: number;
  rawDamage: number;
  damageDealt: number;
  biggestHit: number;
} {
  return {
    swings: 0,
    hits: 0,
    crits: 0,
    followUps: 0,
    evaded: 0,
    rawDamage: 0,
    damageDealt: 0,
    biggestHit: 0,
  };
}

const otherSide = (side: Side): Side => (side === 'a' ? 'b' : 'a');

/**
 * Walk the log once and produce everything a result screen needs.
 * `viewer` is the side whose screen this is — the hints are written from their seat.
 */
export function analyseBattle(log: readonly BattleEvent[], viewer: Side = 'a'): BattleAnalysis {
  const stats: Record<Side, ReturnType<typeof emptyStats>> = { a: emptyStats(), b: emptyStats() };
  const maxHealth: Record<Side, number> = { a: 1, b: 1 };
  const finalHealth: Record<Side, number> = { a: 1, b: 1 };
  const lowestHealth: Record<Side, number> = { a: 1, b: 1 };

  let rounds = 0;
  let winner: Side = viewer;
  let reason: 'knockout' | 'round_limit' = 'knockout';
  /** The attack whose damage event we are about to read. */
  let pendingSource: Side | null = null;

  for (const event of log) {
    switch (event.t) {
      case 'battle_start':
        maxHealth.a = event.a.maxHealth;
        maxHealth.b = event.b.maxHealth;
        finalHealth.a = event.a.maxHealth;
        finalHealth.b = event.b.maxHealth;
        lowestHealth.a = event.a.maxHealth;
        lowestHealth.b = event.b.maxHealth;
        break;

      case 'round_start':
        rounds = event.n;
        break;

      case 'attack': {
        const side = stats[event.source];
        side.swings += 1;
        side.hits += 1;
        side.rawDamage += event.raw;
        if (event.crit) side.crits += 1;
        if (event.followUp) side.followUps += 1;
        pendingSource = event.source;
        break;
      }

      case 'blocked':
      case 'dodged': {
        // These are logged against the *target*; the swing belonged to the other side.
        const side = stats[otherSide(event.target)];
        side.swings += 1;
        side.evaded += 1;
        break;
      }

      case 'missed': {
        const side = stats[event.source];
        side.swings += 1;
        side.evaded += 1;
        break;
      }

      case 'damage': {
        finalHealth[event.target] = event.hpAfter;
        lowestHealth[event.target] = Math.min(lowestHealth[event.target], event.hpAfter);
        if (pendingSource) {
          const side = stats[pendingSource];
          // Overkill is damage that never landed on anything — don't count it as output.
          side.damageDealt += event.amount - (event.overkill ?? 0);
          side.biggestHit = Math.max(side.biggestHit, event.amount);
          pendingSource = null;
        }
        break;
      }

      case 'ko':
        finalHealth[event.target] = 0;
        lowestHealth[event.target] = 0;
        break;

      case 'battle_end':
        winner = event.winner;
        rounds = event.rounds;
        reason = event.reason;
        break;

      case 'verse_change':
        break;
    }
  }

  const mine = stats[viewer];
  const theirs = stats[otherSide(viewer)];
  const mitigatedShare =
    mine.rawDamage > 0 ? Math.max(0, 1 - mine.damageDealt / mine.rawDamage) : 0;

  return {
    winner,
    rounds,
    reason,
    stats,
    finalHealth,
    maxHealth,
    lowestHealth,
    mitigatedShare,
    hints:
      winner === viewer
        ? []
        : buildHints({
            viewer,
            rounds,
            reason,
            mine,
            theirs,
            mitigatedShare,
            theirRemaining: finalHealth[otherSide(viewer)],
            theirMaxHealth: maxHealth[otherSide(viewer)],
          }),
  };
}

/** Thresholds for "this is the thing worth telling them about". */
const HINT = {
  /** Armour eating this much of your damage is the problem, not your damage. */
  heavyMitigation: 0.3,
  /** Losing this share of your swings to block/dodge/miss is the problem. */
  heavyEvasion: 0.3,
  /** Their damage per round exceeding yours by this factor. */
  outpacedFactor: 1.25,
  /** Within this share of their max health when you went down. */
  soClose: 0.15,
  /** Fewer rounds than this and you were simply too soft to trade. */
  shortFight: 5,
} as const;

function buildHints({
  rounds,
  reason,
  mine,
  theirs,
  mitigatedShare,
  theirRemaining,
  theirMaxHealth,
}: {
  viewer: Side;
  rounds: number;
  reason: 'knockout' | 'round_limit';
  mine: SideStats;
  theirs: SideStats;
  mitigatedShare: number;
  theirRemaining: number;
  theirMaxHealth: number;
}): readonly LossHint[] {
  const hints: LossHint[] = [];

  if (reason === 'round_limit') hints.push({ kind: 'round-limit' });

  if (mitigatedShare >= HINT.heavyMitigation) {
    hints.push({ kind: 'armour', mitigatedShare });
  }

  if (mine.swings > 0 && mine.evaded / mine.swings >= HINT.heavyEvasion) {
    hints.push({ kind: 'evaded', evaded: mine.evaded, swings: mine.swings });
  }

  const yourPerRound = mine.damageDealt / Math.max(1, rounds);
  const theirPerRound = theirs.damageDealt / Math.max(1, rounds);
  if (theirPerRound >= yourPerRound * HINT.outpacedFactor) {
    hints.push({ kind: 'outpaced', theirPerRound, yourPerRound });
  }

  if (reason === 'knockout' && rounds > 0 && rounds < HINT.shortFight) {
    hints.push({ kind: 'fragile', roundsSurvived: rounds });
  }

  if (
    reason === 'knockout' &&
    theirMaxHealth > 0 &&
    theirRemaining / theirMaxHealth <= HINT.soClose
  ) {
    // The most encouraging line there is, so it leads.
    hints.unshift({ kind: 'so-close', theirRemaining, theirMaxHealth });
  }

  return hints;
}
