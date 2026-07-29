/**
 * Mission blurbs (content-plan §4).
 *
 * The job posting, not the fight. A mission card that reads "Kill 1 Sootback Boar" is a chore;
 * "The Alderman's prize sow has not come home, and the woods have gone quiet" is an errand in a
 * place where people live. Same fight either way — the blurb is the entire difference between a
 * to-do list and a world.
 *
 * Blurbs are generic by design (they take the monster and zone as parameters), so 24 of them
 * cover every pairing rather than needing one per monster. The content pass raises the count to
 * plan volume; the *shape* is what is being fixed here.
 *
 * Pure data module.
 */

export interface BlurbDef {
  readonly id: string;
  /** `{monster}` and `{zone}` are substituted; nothing else is. */
  readonly text: string;
  /** Blurbs that only make sense for a long trek. */
  readonly minMinutes?: number;
}

const BLURB_LIST = [
  {
    id: 'quiet-woods',
    text: 'Nobody has come back from {zone} this week. Marla says that is your problem now, and puts a {monster} at the top of the list.',
  },
  {
    id: 'prize-sow',
    text: "The Alderman's prize sow is missing. Tracks lead into {zone}, and they are not sow tracks.",
  },
  {
    id: 'overdue-cart',
    text: 'A supply cart is four days overdue out of {zone}. The driver was reliable. The road is not.',
  },
  {
    id: 'bounty-posted',
    text: 'There is a bounty on a {monster} nailed to the tavern door. Someone has already crossed out two names.',
  },
  {
    id: 'quiet-neighbours',
    text: 'The farms at the edge of {zone} have stopped sending anyone to market. They have not stopped sending smoke.',
  },
  {
    id: 'surveyors-fee',
    text: 'A surveyor wants {zone} walked and mapped. She will pay well and asks no questions about what you clear on the way.',
  },
  {
    id: 'old-debt',
    text: 'Bram is owed money by a man who fled into {zone}. Bram would like the money. He is flexible about the man.',
  },
  {
    id: 'church-request',
    text: 'A quiet request, quietly funded: something in {zone} is to stop, and a {monster} is the reason it started.',
  },
  {
    id: 'missing-child',
    text: "A child from the outskirts is missing a full day. The search party will not enter {zone} after dark. You're not a search party.",
  },
  {
    id: 'wrong-noises',
    text: 'Travellers report the wrong noises coming out of {zone}. Not louder. Wrong.',
  },
  {
    id: 'harvest-guard',
    text: 'The harvest goes out through {zone} tomorrow. Tonight, somebody clears the road.',
  },
  {
    id: 'scholars-errand',
    text: 'A scholar needs a {monster} observed at close range. She has been unclear about how close, and very clear about the fee.',
  },
  {
    id: 'no-questions',
    text: 'The job is written on the back of a receipt: {zone}, before the week is out, no questions. The coin is already counted.',
  },
  {
    id: 'watch-shorthanded',
    text: 'The watch is short three swords and {zone} is on the patrol route. Hildy is asking nicely, which is unlike her.',
  },
  {
    id: 'inheritance',
    text: 'A widow inherited land in {zone} she cannot set foot on. Make it hers.',
  },
  {
    id: 'trapline',
    text: 'Someone has been robbing the traplines out past {zone}. The trapper suspects a neighbour. The tracks suggest a {monster}.',
  },
  {
    id: 'long-haul',
    text: 'Deep into {zone}, past where the paths give up. Long day. Better pay.',
    minMinutes: 15,
  },
  {
    id: 'overnight',
    text: 'Far side of {zone} and back. You will not be home before dark, and everyone involved knows it.',
    minMinutes: 15,
  },
  {
    id: 'expedition',
    text: 'A proper expedition: {zone} end to end, a {monster} confirmed dead, and a witness who will say so in town.',
    minMinutes: 20,
  },
  {
    id: 'caravan-escort',
    text: 'Escort work through {zone}. Slow, dull, and paid by the hour — right up until it is not dull.',
    minMinutes: 20,
  },
  {
    id: 'rumour',
    text: 'A rumour worth chasing: something in {zone} has been leaving offerings. Somebody is answering them.',
  },
  {
    id: 'clean-sweep',
    text: 'Torvald wants the ore road through {zone} clear by market day. He did not say clear of what.',
  },
  {
    id: 'unfinished',
    text: 'Another sellsword took this contract last month and did not file a report. The contract is still open.',
  },
  {
    id: 'personal',
    text: 'Not a posting — Marla leans over and asks. There is a {monster} in {zone}, and she would take it as a favour.',
  },
] as const satisfies readonly BlurbDef[];

/** Widened for consumers; the literal above is what gets typo-checked. */
export const MISSION_BLURBS: readonly BlurbDef[] = BLURB_LIST;

export const BLURBS_BY_ID: Readonly<Record<string, BlurbDef>> = Object.fromEntries(
  MISSION_BLURBS.map((blurb) => [blurb.id, blurb]),
);

export function blurb(id: string): BlurbDef | undefined {
  return BLURBS_BY_ID[id];
}

/** Blurbs that suit a mission of this length. Never empty. */
export function blurbsForDuration(minutes: number): readonly BlurbDef[] {
  const eligible = MISSION_BLURBS.filter((blurb) => minutes >= (blurb.minMinutes ?? 0));
  return eligible.length > 0 ? eligible : MISSION_BLURBS;
}

/** Fill in the placeholders. Unknown placeholders are left alone rather than blanked. */
export function renderBlurb(template: string, values: { monster: string; zone: string }): string {
  return template.replace(/\{(monster|zone)\}/g, (_match, key: 'monster' | 'zone') => values[key]);
}
