/**
 * What the keepers say (shops spec §3, stables §4).
 *
 * Bram is gruff and fair, Sela is precise and kindly sharp, Odo is sleepy and fond of the
 * animals. Same rule as Marla's barks in `barks.ts`: lines are chosen **by index**, never
 * rolled. A keeper who says something different on every re-render is a keeper the player
 * stops reading.
 *
 * Pure data module.
 */

export type ShopMoment =
  | 'browse'
  /** Fresh shelf this morning. */
  | 'restocked'
  /** Everything sold. */
  | 'cleaned-out'
  | 'bought'
  | 'sold'
  /** Cannot afford the thing they clicked. */
  | 'broke'
  /** Tried to sell a Set piece. */
  | 'heirloom'
  | 'rerolled';

export type StableMoment =
  | 'browse'
  | 'mounted'
  /** A day or less left on the rental. */
  | 'expiring'
  /** About to swap and lose the remainder. */
  | 'switching'
  | 'broke'
  /** The stall is already booked two terms deep. */
  | 'full';

type Lines = Readonly<Record<string, readonly string[]>>;

/** Bram, at the Armory. Blunt, honest about what is junk. */
export const BRAM_LINES: Lines = {
  browse: [
    'Look all you like. Steel does not mind being looked at.',
    'Everything here will hold. That is the whole promise.',
    'Cheap or good. Today I have got some of both.',
  ],
  restocked: [
    'New in overnight. Get it before somebody with taste does.',
    'Fresh off the cart. Still smells of the road.',
  ],
  'cleaned-out': [
    'You have had the lot. Come back at first light.',
    'Shelf is bare and my back is sore. Tomorrow.',
  ],
  bought: ['Wear it, do not hoard it.', 'Good. That one was getting dusty.', 'Sound choice.'],
  sold: ['I will find someone for it.', 'Fair price. No haggling in my shop.'],
  broke: ['Come back with coin.', 'I like you. Not that much.'],
  heirloom: [
    'Not that one. That is somebody’s life’s work, and it is yours now.',
    'I will not put an heirloom on a shelf. Keep it.',
  ],
  rerolled: ['Let me see what is in the back.', 'Hold on. There is another crate.'],
};

/** Sela, at the Gilded Facet. Exact, a little amused by you. */
export const SELA_LINES: Lines = {
  browse: [
    'Small things, carefully made. Mind the glass.',
    'Every stone in here has been looked at twice. Once by me.',
    'A ring is not armour. It is an argument.',
  ],
  restocked: [
    'Set out this morning. The light is best on them now.',
    'New cuts. I was up rather late.',
  ],
  'cleaned-out': [
    'You have cleared me out. Flattering, and inconvenient.',
    'Nothing left but the velvet.',
  ],
  bought: ['It suits you. I would have said so either way.', 'Wear it where it can be seen.'],
  sold: ['I will re-cut it. There is something in there.', 'Yes. I can use that.'],
  broke: ['Not today, then.', 'Gold first. Then compliments.'],
  heirloom: [
    'That belongs to a set, and a set belongs together. No.',
    'I do not break up families.',
  ],
  rerolled: ['Let me open the other case.', 'One moment. There is a tray under the counter.'],
};

/** Odo, at the Stables. Half asleep, entirely serious about the animals. */
export const ODO_LINES: Lines = {
  browse: [
    'They are all good. Some are just faster about it.',
    'Mind the griffin. He knows what he is worth.',
    'Whichever you take, bring her back watered.',
  ],
  mounted: ['Seven days. Be kind to her.', 'She likes you. Do not make me regret this.'],
  expiring: [
    'Her week is nearly up. Renew or I will have to let her go out again.',
    'One more day and she is back in the rotation.',
  ],
  switching: [
    'You have got days left on the other one. Those do not come back.',
    'Your coin. Your call.',
  ],
  broke: ['Feed costs what feed costs.', 'Come back when the purse is heavier.'],
  full: [
    'I cannot book her out further than a fortnight. Come back when some of it is walked.',
    'Two terms is my limit. She is a horse, not a subscription.',
  ],
};

/** Pick a line by index — deterministic, never rolled. */
function lineFrom(lines: Lines, moment: string, index: number): string {
  const pool = lines[moment] ?? lines['browse']!;
  return pool[Math.abs(index) % pool.length]!;
}

export function bramSays(moment: ShopMoment, index = 0): string {
  return lineFrom(BRAM_LINES, moment, index);
}

export function selaSays(moment: ShopMoment, index = 0): string {
  return lineFrom(SELA_LINES, moment, index);
}

export function odoSays(moment: StableMoment, index = 0): string {
  return lineFrom(ODO_LINES, moment, index);
}
