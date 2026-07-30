/**
 * Hildy at the Proving Grounds (arena spec §1, §4).
 *
 * She already runs the City Watch, and she talks the same way here: dry, unimpressed by
 * anybody's rank, quietly on your side. The arena needs its own vocabulary though, because the
 * moments are different — she is not handing out a shift roster, she is watching you pick a
 * fight and telling you what she thinks of the choice.
 *
 * Same rule as every other keeper: lines are chosen **by index, never rolled**. A keeper who
 * says something different on every re-render is a keeper the player stops reading.
 *
 * Pure data module.
 */

export type ArenaMoment =
  /** Standing at the board, nothing decided. */
  | 'browse'
  /** Cooling down between fights. */
  | 'waiting'
  | 'won'
  | 'lost'
  /** Won, but past the ten rewarded wins — the ladder moved, the purse did not. */
  | 'past-cap'
  /** Crossed 500, 100, 10 or 1 for the first time. */
  | 'milestone'
  | 'rerolled'
  /** Cannot pay for the die they just tried to spend. */
  | 'broke'
  /** Somebody came for them overnight. */
  | 'raided'
  /** A revenge chip is waiting. */
  | 'revenge'
  /** Brand new, at the foot of the ladder. */
  | 'newcomer';

type Lines = Readonly<Record<string, readonly string[]>>;

export const HILDY_ARENA_LINES: Lines = {
  browse: [
    'Three of them signed up to meet you. Pick one and I will ring the bell.',
    'Sand is raked. Names are on the board. Your move.',
    'Read them properly first. Half the losses in here are people who did not.',
  ],
  waiting: [
    'Catch your breath. The board is not going anywhere.',
    'Ten minutes. Drink some water and stop bleeding on my sand.',
    'Rest. You fight worse tired and I have to watch it.',
  ],
  won: [
    'Clean enough. Next.',
    'You took their rung. They will want it back.',
    'Well fought. Do not let it go to your head.',
  ],
  lost: [
    'Happens. Come back with a better weapon.',
    'They were the better hand today. Only today.',
    'You kept your feet longer than most would have.',
  ],
  'past-cap': [
    'Ten paid fights is the day’s purse. The ladder still counts — the coin does not.',
    'No more silver today. Climb for the love of it, if you like.',
  ],
  milestone: [
    'The whole yard heard that one.',
    'Look at the board. Look at where your name is.',
    'That is a rank people remember. Enjoy it while you hold it.',
  ],
  rerolled: ['Different three. Same sand.', 'Fresh names. They will be no kinder.'],
  broke: [
    'Golden Dice are earned in here, not bought. Go and earn some.',
    'You are a die short. That is the whole of it.',
  ],
  raided: [
    'You had visitors. They did not wait for you to wake up.',
    'Somebody came through here looking for your rung while you slept.',
  ],
  revenge: [
    'They are still on the roster. Settle it.',
    'That name owes you a fight. I would take it.',
  ],
  newcomer: [
    'Bottom of the ladder is not an insult, it is a starting line.',
    'Everyone in here started where you are standing. Most of them stopped there too.',
  ],
};

/** Pick a line by index — deterministic, never rolled. */
export function hildySays(moment: ArenaMoment, index = 0): string {
  const pool = HILDY_ARENA_LINES[moment] ?? HILDY_ARENA_LINES['browse']!;
  return pool[Math.abs(index) % pool.length]!;
}
