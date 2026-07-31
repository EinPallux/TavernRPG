/**
 * Madame Vesna, at Fortune's Table (gacha spec §1).
 *
 * She reads fortunes for a living and has stopped pretending to be certain about any of them.
 * Warm, theatrical, and entirely honest about the odds — which is the room's whole character:
 * a gacha that tells you the truth is a different thing from one that does not, and Vesna is
 * where that shows.
 *
 * Same discipline as every other keeper: lines are chosen **by index**, never rolled.
 *
 * Pure data module.
 */

import type { RollOutcome } from './banners';

export type VesnaMoment =
  /** At the table, nothing spinning. */
  | 'browse'
  /** A free daily roll is waiting. */
  | 'free'
  /** Out of dice. */
  | 'broke'
  /** The pity meter is one roll from paying. */
  | 'nearly'
  /** The pity meter paid. */
  | 'pity'
  /** A duplicate came up and converted. */
  | 'dupe'
  /** The monthly track advanced a rung. */
  | 'track'
  /** The Gilded Snail. */
  | 'snail'
  /** Bags full — nowhere to put a card that turns into gear. */
  | 'full'
  | RollOutcome;

type Lines = Readonly<Record<string, readonly string[]>>;

export const VESNA_LINES: Lines = {
  browse: [
    'The cards say… laundry. No — glory. Could be either.',
    'Sit. The table does not mind waiting; I do.',
    'Every rate is written on that panel. I have never seen the point of hiding them.',
    'Fortune is not kind and it is not cruel. It is only frequent.',
  ],
  free: [
    'One on the house. It is the same deck as the paid one, before you ask.',
    'Your free card is still on the table, dear.',
  ],
  broke: [
    'No dice, no reading. I would do it for love, but the wheel would not.',
    'Come back with something to spend. The cards keep.',
  ],
  nearly: [
    'One more. The deck owes you and the deck knows it.',
    'I can feel it from here. Do not stop now.',
  ],
  pity: [
    'There. I said the deck owed you, and I keep my books.',
    'Guaranteed is a dull word for such a pretty card.',
  ],
  dupe: [
    'You have this one already — so we melt it. Nothing here is ever a wasted draw.',
    'A second of the same. Starmetal, then, and a shard toward the pattern.',
  ],
  track: [
    'The spread has been keeping count even when the cards were not.',
    'That is the track, not the luck. You earned that one by turning up.',
  ],
  snail: [
    'Oh! Oh, he never comes out for just anyone.',
    'The Gilded Snail. One in a hundred, and slower than all of them.',
  ],
  full: [
    'Your bags are full, dear. I am not putting a blade on my tablecloth.',
    'The cards will keep. Your carrying capacity, apparently, will not.',
  ],

  featured: [
    'THAT is the card. That is the one on the sign outside.',
    'The featured card, on a table that features it. Sometimes it works.',
  ],
  epic: ['Purple. Purple is a good colour on you.', 'Well now. The deck is showing off.'],
  rare: ['Blue. Solid. Unromantic. Useful.', 'A working card. Take the working card.'],
  materials: [
    'Not glamorous. Torvald will be delighted.',
    'Stock for the fire. The fire is always hungry.',
  ],
  gold: ['Coin. Coin never disappoints, it merely underwhelms.', 'A purse. Spend it on muscle.'],
  ale: ['Marla brews it, I merely deal it.', 'Something for the evening.'],
  uncommon: [
    'Green. The deck is being polite rather than generous.',
    'It is a card. I did promise a card.',
  ],
};

/** Pick a line by index — deterministic, never rolled. */
export function vesnaSays(moment: VesnaMoment, index = 0): string {
  const pool = VESNA_LINES[moment] ?? VESNA_LINES['browse']!;
  return pool[Math.abs(index) % pool.length]!;
}
