/**
 * Keeper barks (content-plan §5, style guide §9 rule 7).
 *
 * The rule that shapes all of these: **a bark teases the system, never the player.** "Back
 * already?" is warm; "That was quick" is a jab. Marla is pleased to see you, mildly amused by
 * the world, and entirely unbothered by your losing streak.
 *
 * Keyed by moment so a screen asks for "the line when a mission is accepted" rather than
 * hardcoding prose, which is also what makes them translatable and swappable later.
 *
 * Pure data module.
 */

export type BarkMoment =
  | 'tavern-idle'
  | 'mission-accepted'
  | 'mission-running'
  | 'mission-returned'
  | 'victory'
  | 'defeat'
  | 'out-of-vigor'
  | 'board-rerolled'
  | 'ale-poured'
  | 'new-day';

export const MARLA_BARKS: Readonly<Record<BarkMoment, readonly string[]>> = {
  'tavern-idle': [
    'Three jobs on the table. Two of them are even honest.',
    'Sit if you like. The work will still be there.',
    'The Alderman was in again. Wants things dealt with, as usual.',
    'Mind the third stool. It has views.',
    'Fresh postings. Someone always needs something killed on a Tuesday.',
  ],
  'mission-accepted': [
    'Stamped. Try to come back with most of yourself.',
    'Contracted. I will keep the fire going.',
    'Off you go, then. Do not dawdle at the crossroads.',
    'Signed. If you meet the Alderman out there, you never saw me.',
  ],
  'mission-running': [
    'They will be a while yet.',
    'Quiet in here without you.',
    'I will not touch your seat. Probably.',
  ],
  'mission-returned': [
    'There you are. Let us hear it, then.',
    'Back in one piece. Mostly.',
    'The whole tavern has been waiting. Well. I have.',
  ],
  victory: [
    'Knew you had it. Drink is on the house — the small one.',
    'Well handled. The Alderman will pretend it was his idea.',
    'That is one fewer problem in the world. Rare, that.',
  ],
  defeat: [
    'Sit down. Nobody wins them all, and the ones who claim otherwise are lying.',
    'Bram is up the road. Might be worth a look at what he has on the rack.',
    'It happens. The tale continues.',
  ],
  'out-of-vigor': [
    'You are dead on your feet. Come back tomorrow, or let Hildy find you a shift.',
    'No more today. Even heroes sleep.',
    'I have an Ale that would fix that, if you have the coin for it.',
  ],
  'board-rerolled': [
    'New postings. Same Alderman.',
    'There. Anything there take your fancy?',
    'Tore the old ones down. Nobody will miss them.',
  ],
  'ale-poured': [
    'That will put the legs back under you.',
    'One Ale. Do not make a habit of it before noon.',
    'Drink up. The road is not getting shorter.',
  ],
  'new-day': [
    'Morning. Fresh work on the table, and you look almost rested.',
    'New day, new postings. The Alderman never sleeps either.',
    'You are up early. Or late. I do not judge.',
  ],
};

/**
 * Pick a line for a moment.
 *
 * Takes an index rather than rolling, so a component can hold a stable line across re-renders
 * instead of getting a new one every frame — and so barks never reach for `Math.random`.
 */
export function bark(moment: BarkMoment, index: number): string {
  const lines = MARLA_BARKS[moment];
  return lines[Math.abs(Math.floor(index)) % lines.length]!;
}
