/**
 * The Bard's Verses (characters-and-classes.md §3).
 *
 * A Bard opens with a random Verse and swaps to another every fourth round. It is the one kit
 * whose strength is *variance*: some fights the music is exactly what you needed, some fights
 * it plays you a lullaby while you are being hit.
 *
 * Pure module.
 */

import type { VerseId } from './types';

export interface VerseEffect {
  /** Multiplier on damage this Bard deals. */
  readonly damageMultiplier: number;
  /** Share of incoming damage prevented. */
  readonly damageReduction: number;
  /** Chance the *opponent* misses entirely. */
  readonly enemyMissChance: number;
}

export const VERSES: Readonly<Record<VerseId, VerseEffect & { name: string; blurb: string }>> = {
  'battle-hymn': {
    name: 'Battle Hymn',
    blurb: 'Louder, faster, angrier.',
    damageMultiplier: 1.25,
    damageReduction: 0,
    enemyMissChance: 0,
  },
  ironsong: {
    name: 'Ironsong',
    blurb: 'A steady rhythm to brace against.',
    damageMultiplier: 1,
    damageReduction: 0.25,
    enemyMissChance: 0,
  },
  discord: {
    name: 'Discord',
    blurb: 'Nobody swings true through that racket.',
    damageMultiplier: 1,
    damageReduction: 0,
    enemyMissChance: 0.2,
  },
};

export const VERSE_IDS: readonly VerseId[] = ['battle-hymn', 'ironsong', 'discord'];

/** Verses change on rounds 1, 5, 9 … (every fourth round). */
export const VERSE_PERIOD = 4;

/**
 * Whether a Verse re-rolls this round.
 *
 * `extraRounds` is Maestro 2 stretching the period — a Verse that lasts a round longer changes
 * on 1, 6, 11 rather than 1, 5, 9. Passed in rather than read from anywhere, because the
 * resolver asks this *per side*: two Bards with different sets change on different rounds.
 */
export function isVerseChangeRound(round: number, extraRounds = 0): boolean {
  return (round - 1) % Math.max(1, VERSE_PERIOD + extraRounds) === 0;
}

export const NO_VERSE: VerseEffect = {
  damageMultiplier: 1,
  damageReduction: 0,
  enemyMissChance: 0,
};

export function verseEffect(verse: VerseId | null): VerseEffect {
  return verse ? VERSES[verse] : NO_VERSE;
}
