/**
 * Torvald, at the Emberforge (crafting spec, keeper note).
 *
 * Booming and sentimental about metal — he mourns the pieces that go in the crucible and takes
 * personal credit for the ones that come out. Same discipline as every other keeper in the game:
 * lines are chosen **by index**, never rolled, so a re-render never changes what he just said.
 *
 * Pure data module.
 */

export type ForgeMoment =
  /** Standing at the bench, nothing happening. */
  | 'browse'
  /** Something went in the crucible. */
  | 'smelted'
  /** The daily ten are gone. */
  | 'capped'
  /** A plain forge came out Common or Uncommon. */
  | 'dud'
  /** Rare or better off the anvil. */
  | 'good'
  /** An Epic, which is what he is here for. */
  | 'epic'
  /** The ember meter paid out. */
  | 'pity'
  /** A set piece off a recipe. */
  | 'set'
  /** Cannot pay for the tier they clicked. */
  | 'broke'
  /** Bags are full and nothing can be handed over. */
  | 'full';

type Lines = Readonly<Record<string, readonly string[]>>;

export const TORVALD_LINES: Lines = {
  browse: [
    'Bring me something with a story in it. I will make it a shorter story.',
    'Sell what is cheap. Scrap what is interesting. That is the whole trade.',
    'The odds are on the tiles. I do not hide them and I do not bend them.',
    'Every bar on that bench was somebody’s sword once. Think about that or do not.',
  ],
  smelted: [
    'Down it goes. It was good work — it will be good work again.',
    'Ahh. Listen to that.',
    'Clean melt. Nothing wasted.',
  ],
  capped: [
    'Crucible is spent. She needs the night off and so do I.',
    'Ten in a day is what the fire will take. Tomorrow.',
  ],
  dud: [
    'Metal decides. Metal has decided poorly.',
    'It will hold. That is all I will say for it.',
    'Not every strike sings.',
  ],
  good: [
    'Now that is worth carrying.',
    'Hah! Feel the weight of it.',
    'The fire was in a generous mood.',
  ],
  epic: [
    'THERE. That is what the starmetal was for.',
    'Twenty years and it still gets me. Look at it.',
    'You will not do better on this bench. Nobody will.',
  ],
  pity: ['The embers owed you one. Paid, in full.', 'I have been keeping count. So has the fire.'],
  set: [
    'One more piece of the old pattern. Somebody would weep to see this.',
    'That is not gear, that is a *set*. Wear the rest of it and you will know why.',
  ],
  broke: [
    'Not with what you are carrying, no.',
    'Come back with more in the bucket.',
    'Fire runs on stock, not on optimism.',
  ],
  full: ['Your bags are full. I am not putting a fresh blade on the floor.'],
};

/** Pick a line by index — deterministic, never rolled. */
export function torvaldSays(moment: ForgeMoment, index = 0): string {
  const pool = TORVALD_LINES[moment] ?? TORVALD_LINES['browse']!;
  return pool[Math.abs(index) % pool.length]!;
}
