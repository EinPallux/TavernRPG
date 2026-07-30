/**
 * The ten named legends (world-simulation spec §2).
 *
 * The top of the ladder needs *faces*. A rank-1 called "Brywald the Quick" — generated like the
 * other 1,489 — is a number with a name attached; Serathiel is someone you want to beat. These
 * ten are hand-authored identity only: **their stats stay on the same curves as everybody else**
 * (spec §1, "plausible at a glance, fair under inspection"). What is authored is who they are,
 * not how hard they hit.
 *
 * They occupy ladder ranks 1–10 at world generation and are the endgame rivals — the last names
 * standing between the player and the top.
 *
 * Pure data module.
 */

import type { ClassId } from '@/engine/items/types';

export interface LegendDef {
  /** Ladder rank at world generation, 1-based. Also their bot id, which is `rank - 1`. */
  readonly rank: number;
  readonly name: string;
  readonly classId: ClassId;
  /** One line of who they are, shown on their profile and in Town Crier headlines. */
  readonly story: string;
  /** How the Crier refers to them in passing — shorter than the full name. */
  readonly shortName: string;
  /** Dedication, 1.0–1.1 (balancing §12). Rank 1 is meant to be a real chase. */
  readonly dedication: number;
}

const LEGEND_LIST = [
  {
    rank: 1,
    name: 'Serathiel the Unbowed',
    shortName: 'Serathiel',
    classId: 'warrior',
    story:
      'Held the Winter Gate alone for a night and a day, and has never once said how. Rank one since the ladder had a name.',
    dedication: 1.1,
  },
  {
    rank: 2,
    name: 'Ossira Ninebell',
    shortName: 'Ossira',
    classId: 'mage',
    story:
      'Counts her spells like coins and has never overspent. Second by choice, some say; nobody says it to her.',
    dedication: 1.08,
  },
  {
    rank: 3,
    name: 'Kald Greycloak',
    shortName: 'Kald',
    classId: 'hunter',
    story: 'Walked from the northern ice with a bow and a grudge. Both are still in working order.',
    dedication: 1.06,
  },
  {
    rank: 4,
    name: 'Marlwillow the Merry',
    shortName: 'Marlwillow',
    classId: 'bard',
    story:
      'Has a song about every hero above her and is writing one about everyone below. Nobody wants their verse finished.',
    dedication: 1.05,
  },
  {
    rank: 5,
    name: 'Vex Halfhand',
    shortName: 'Vex',
    classId: 'swashbuckler',
    story:
      'Lost the hand to a wager and won the duel anyway. Still takes wagers, still wins more than is decent.',
    dedication: 1.04,
  },
  {
    rank: 6,
    name: 'Brand Coldiron',
    shortName: 'Brand',
    classId: 'warrior',
    story:
      'Smith first, hero second, and he will tell you the order matters. Every plate he wears he made twice.',
    dedication: 1.03,
  },
  {
    rank: 7,
    name: 'Idunvar of the Long Watch',
    shortName: 'Idunvar',
    classId: 'hunter',
    story:
      'Has stood the same stretch of wall for eleven years. The ladder found her; she did not go looking.',
    dedication: 1.02,
  },
  {
    rank: 8,
    name: 'Cendrael Ashwalker',
    shortName: 'Cendrael',
    classId: 'mage',
    story:
      'Came out of the burn fields with no eyebrows and a great many theories. Most of the theories were right.',
    dedication: 1.02,
  },
  {
    rank: 9,
    name: 'Pipwick Quickwit',
    shortName: 'Pipwick',
    classId: 'swashbuckler',
    story:
      'Talks faster than most people parry. Has talked their way out of nine duels and into eleven.',
    dedication: 1.01,
  },
  {
    rank: 10,
    name: 'Hraffnhild the Sung-About',
    shortName: 'Hraffnhild',
    classId: 'bard',
    story:
      'Subject of four ballads, author of none of them. Insists the third one is slander and hums it anyway.',
    dedication: 1.0,
  },
] as const satisfies readonly LegendDef[];

export const LEGENDS: readonly LegendDef[] = LEGEND_LIST;

/** How many ladder places the legends occupy at world generation. */
export const LEGEND_COUNT = LEGEND_LIST.length;

/** The legend at a bot id, or null for the other 1,490. */
export function legendForBot(botId: number): LegendDef | null {
  return botId >= 0 && botId < LEGEND_COUNT ? LEGENDS[botId]! : null;
}

export function isLegend(botId: number): boolean {
  return botId >= 0 && botId < LEGEND_COUNT;
}
