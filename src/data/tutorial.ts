/**
 * The first twenty minutes (tutorial spec §2).
 *
 * Twelve beats, and the shape of the file is the design: each one is a **place, a thing to point
 * at, two sentences, and a predicate over the save.** No beat has a "next" button and none of
 * them stores progress. The active beat is simply the first whose predicate is false
 * (`engine/tutorial/beats.ts`), which buys three properties outright:
 *
 * 1. **Resumable for free.** A reload mid-beat lands on the same beat, because the beat was never
 *    a stored cursor — it is a question asked of the save, and the save has not changed.
 * 2. **Nothing to desync.** A tutorial that tracks its own position can disagree with what the
 *    player has actually done: they accept a mission in another tab, or a beat's action happens
 *    twice, and the cursor is now pointing at something already finished.
 * 3. **Opt-out is one flag.** "I have been here before" does not need to fast-forward anything;
 *    it just stops the overlay rendering, and the gates carry on exactly as before.
 *
 * The price is that every beat needs a fact in the save that means "this happened", which is a
 * useful constraint: a beat with no observable consequence is a beat that teaches nothing.
 *
 * **Copy rule (spec §1): two sentences, maximum.** A tutorial that has to be read is a tutorial
 * that gets skipped, and the whole point is to spotlight a thing and let the player press it.
 *
 * Pure data module.
 */

import type { PlaceId } from './places';

export const BEAT_IDS = [
  'welcome-in',
  'first-mission',
  'first-fight',
  'first-loot',
  'get-stronger',
  'real-mission',
  'the-armory',
  'notice-board',
  'patrol',
  'overnight',
  'proving-grounds',
  'ladder-alive',
] as const;

export type BeatId = (typeof BEAT_IDS)[number];

/** Mutable-tuple alias for `z.enum`, which will not take a `readonly` array. */
export const BEAT_ID_LIST = [...BEAT_IDS] as [BeatId, ...BeatId[]];

export interface BeatDef {
  readonly id: BeatId;
  /** Where the beat happens. The overlay only shows while the player is in this room. */
  readonly place: PlaceId;
  /**
   * `data-testid` of the element to spotlight, or null for a beat that talks without pointing.
   *
   * A testid rather than a class or a DOM path: those two change every time a screen is
   * restyled, and a spotlight pointing at nothing is worse than no spotlight. The e2e suite
   * already depends on these, so a rename that breaks the tutorial breaks a test first.
   */
  readonly spotlight: string | null;
  /**
   * How the beat ends.
   *
   * `'do'` — a fact appears in the save and the beat is over. No button, no acknowledgement, and
   * nothing to click past: the player did the thing, so the thing is taught.
   *
   * `'read'` — there is nothing to *do*, only something to notice (the Notice Board's chest, the
   * Crier's feed), so the only honest completion is the player saying they have seen it. These
   * are the two beats that store an acknowledgement, and they are deliberately the minority: a
   * tutorial made of "Got it" buttons is a tutorial made of reading.
   */
  readonly kind: 'do' | 'read';
  /** Who is speaking. Keepers introduce their own buildings (spec §1). */
  readonly speaker: string;
  /** Two sentences. The lint of this file is a test that counts them. */
  readonly copy: string;
  /**
   * The level below which this beat is not shown at all.
   *
   * Beats past the first few sit behind gates, and a player who opted out and came back at
   * level 9 should not be walked through the Armory. Mirrors `gateLevel`, but stated here so a
   * beat can be *later* than its room opens when the curriculum wants it to be.
   */
  readonly fromLevel: number;
}

/**
 * The twelve.
 *
 * Ordered as the curriculum, not as the rail. Each teaches exactly one thing and each one's
 * predicate (in `engine/tutorial/beats.ts`) is the fact that proves it was taught.
 *
 * **`fromLevel` must never go backwards down this list.** `activeBeat` *stops* at a beat gated
 * above the hero — deliberately, so the curriculum cannot jump ahead — which means a level-4 beat
 * placed in front of two level-3 ones silences the whole tour until the player levels. The arena
 * used to sit here, ahead of Patrol and the Crier, and a level-3 player got no guidance at all
 * between finishing the Notice Board and reaching four, with two rooms open and unmentioned.
 * `release/onboarding.test.ts` asserts the ordering now. The teaching order is better for it
 * anyway: work the streets, sleep, read what happened, *then* go and take somebody's rank.
 */
export const BEATS: readonly BeatDef[] = [
  {
    id: 'welcome-in',
    kind: 'do',
    place: 'tavern',
    spotlight: 'mission-board',
    speaker: 'Marla',
    copy: 'You made it. There is work on the table — take whichever one looks least like trouble.',
    fromLevel: 1,
  },
  {
    id: 'first-mission',
    kind: 'do',
    place: 'tavern',
    spotlight: 'mission-progress',
    speaker: 'Marla',
    copy: 'Off you go. The well is right there, so you will not be long.',
    fromLevel: 1,
  },
  {
    id: 'first-fight',
    kind: 'do',
    place: 'tavern',
    spotlight: 'mission-returned',
    speaker: 'Marla',
    copy: 'Something followed you back. Watch how it goes — you do not swing, but you do decide who swings well.',
    fromLevel: 1,
  },
  {
    id: 'first-loot',
    kind: 'do',
    place: 'character',
    spotlight: 'paperdoll',
    speaker: 'Marla',
    copy: 'This is where everything you find ends up. Put your best on — the numbers underneath move when you do.',
    fromLevel: 1,
  },
  {
    id: 'get-stronger',
    kind: 'do',
    place: 'character',
    spotlight: 'attribute-panel',
    speaker: 'Marla',
    copy: 'Coin buys muscle here, and the price climbs. Spend some and watch the numbers underneath move.',
    fromLevel: 1,
  },
  {
    id: 'real-mission',
    kind: 'do',
    place: 'tavern',
    spotlight: 'hud-vigor',
    speaker: 'Marla',
    copy: 'Adventure runs on ale and daylight, and you have a day of both. Pick a longer job — the odds are better.',
    fromLevel: 1,
  },
  {
    id: 'the-armory',
    kind: 'do',
    place: 'armory',
    spotlight: 'shop-shelf',
    speaker: 'Bram',
    copy: 'Everything on that shelf is better than what you are wearing. Sell me what is not and we will talk.',
    fromLevel: 2,
  },
  {
    id: 'notice-board',
    kind: 'read',
    place: 'board',
    spotlight: 'task-list',
    speaker: 'Marla',
    copy: 'Three notices a day, and a chest when all three are struck through. There is a Golden Die in it.',
    fromLevel: 3,
  },
  {
    id: 'patrol',
    kind: 'do',
    place: 'patrol',
    spotlight: 'shift-hours',
    speaker: 'Hildy',
    copy: 'Out of daylight is not out of work. Walk the streets a while and I will see you paid.',
    fromLevel: 3,
  },
  {
    id: 'overnight',
    kind: 'read',
    place: 'tavern',
    spotlight: 'town-crier',
    speaker: 'Marla',
    copy: 'The town does not stop when you do. That board is what happened while you were away.',
    fromLevel: 3,
  },
  {
    id: 'proving-grounds',
    kind: 'do',
    place: 'arena',
    spotlight: 'duel-board',
    speaker: 'Hildy',
    copy: 'Fifteen hundred of them out there and every one has a rank. Take one off somebody.',
    fromLevel: 4,
  },
  {
    id: 'ladder-alive',
    kind: 'do',
    place: 'arena',
    spotlight: 'duel-board',
    speaker: 'Hildy',
    copy: 'Somebody has been climbing over you while you were busy. Go and take it back.',
    fromLevel: 4,
  },
];

const BY_ID: Readonly<Record<string, BeatDef>> = Object.fromEntries(
  BEATS.map((entry) => [entry.id, entry]),
);

export function beat(id: string): BeatDef | null {
  return BY_ID[id] ?? null;
}

/* ── The tutorial-shortened first mission (spec §2 beat 2) ───────────────────────── */

/**
 * `[TUNE]` How long the very first contract takes, in milliseconds.
 *
 * Twenty seconds rather than five minutes, because beat 2 has to *end* for beat 3 to begin and a
 * five-minute wall on the second thing a player ever does is where they close the tab. It applies
 * to exactly one mission — the first — and the card still prints its real duration, because the
 * player is going to run a five-minute job next and the timer should not appear to lie later.
 */
export const FIRST_MISSION_MS = 20_000;

/* ── First-encounter explainers (spec §4) ────────────────────────────────────────── */

export const EXPLAINER_IDS = [
  'first-epic',
  'first-set-piece',
  'first-revenge',
  'first-pity',
  'first-dungeon-wall',
  'first-loss',
] as const;
export type ExplainerId = (typeof EXPLAINER_IDS)[number];
export const EXPLAINER_ID_LIST = [...EXPLAINER_IDS] as [ExplainerId, ...ExplainerId[]];

export interface ExplainerDef {
  readonly id: ExplainerId;
  readonly title: string;
  /** One line. These fire in the middle of something else, so they cannot be paragraphs. */
  readonly body: string;
}

/**
 * One-time lines for the moments that need a sentence and never need it again.
 *
 * The dungeon wall is the important one: hitting a floor you cannot beat is the intended
 * experience and it reads as a bug unless somebody says so out loud.
 */
export const EXPLAINERS: readonly ExplainerDef[] = [
  {
    id: 'first-epic',
    title: 'That one is Epic',
    body: 'Purple. Three attribute lines instead of one, and worth keeping even out of your class’s favourite slot.',
  },
  {
    id: 'first-set-piece',
    title: 'A set piece',
    body: 'Gold-framed and never for sale. Five of a set is a real ability — check the Set Collections tab.',
  },
  {
    id: 'first-revenge',
    title: 'Somebody hit you',
    body: 'A bot came for your rank while you were away. Revenge bouts are free and do not count against the day.',
  },
  {
    id: 'first-pity',
    title: 'The floor caught you',
    body: 'Twenty cards without the featured set means the next one is guaranteed. The meter said so before you spent.',
  },
  {
    id: 'first-dungeon-wall',
    title: 'This is the wall',
    body: 'Floors do not scale to you — they are fixed, and this one is ahead of your gear. Come back, do not grind it.',
  },
  {
    id: 'first-loss',
    title: 'That happens',
    body: 'Losing costs the Vigor and nothing else. The result screen says which number was short.',
  },
];

const EXPLAINERS_BY_ID: Readonly<Record<string, ExplainerDef>> = Object.fromEntries(
  EXPLAINERS.map((entry) => [entry.id, entry]),
);

export function explainer(id: string): ExplainerDef | null {
  return EXPLAINERS_BY_ID[id] ?? null;
}
