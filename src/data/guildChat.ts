/**
 * Guild chat templates (guilds spec §3, content plan §5).
 *
 * Chat is the illusion engine. A guild whose members say generic things is a menu with names on
 * it; a guild whose members say "Karg hit 60, grats" the morning after Karg actually hit 60 is a
 * place with people in it. So this file inherits the Town Crier's hard rule: **a template must
 * be fillable only from something the simulation actually did.** Every line declares the slots it
 * needs, and the generator filters before it picks.
 *
 * `idle` is the one exception, tagged as such so the audit test can tell colour from claims —
 * the same carve-out `flavour` gets in `crierTemplates.ts`. It is about guild life in general and
 * never names a hero, a number or an event.
 *
 * Lines are chosen **by index**, never rolled.
 *
 * Pure data module.
 */

export const CHAT_CATEGORIES = [
  /** Hello, morning, back again. */
  'greeting',
  /** Somebody's real level-up, rank or drop. */
  'brag',
  /** Somebody's real loss or rank slip. */
  'grumble',
  /** Mission and zone talk, off a real completion. */
  'mission',
  /** The arena, off a real duel or raid. */
  'arena',
  /** Donations to the two tracks. */
  'donation',
  /** A member joined. */
  'welcome',
  /** A member left, was kicked, or went quiet. */
  'farewell',
  /** Weekly bounty progress. */
  'bounty',
  /** A reply to something the player said. */
  'reply',
  /** Guild life in general. The only category with nothing behind it. */
  'idle',
] as const;
export type ChatCategory = (typeof CHAT_CATEGORIES)[number];

/**
 * Slots a line may reference.
 *
 * Deliberately short and boring, exactly as the Crier's is. An expressive template language
 * would let a message claim something no tick ever produced, and the whole value of the corpus
 * is that it cannot.
 */
export interface ChatSlots {
  /** Whoever is being talked about. */
  readonly hero?: string;
  /** A second name, for lines that need two. */
  readonly other?: string;
  readonly guild?: string;
  readonly level?: number;
  readonly rank?: number;
  readonly count?: number;
  readonly gold?: number;
  readonly item?: string;
  readonly zone?: string;
  /** The week's bounty, phrased as its own short label. */
  readonly bounty?: string;
  /** Percent complete, for bounty talk. */
  readonly percent?: number;
}

export type ChatSlot = keyof ChatSlots;

export interface ChatTemplate {
  readonly id: string;
  readonly category: ChatCategory;
  /** `{hero}`, `{other}`, `{guild}`, `{level}`, `{rank}`, `{count}`, `{gold}`, `{item}`, `{zone}`, `{bounty}`, `{percent}`. */
  readonly text: string;
  /** Slots this line will not render without. Checked before it can be picked. */
  readonly needs: readonly ChatSlot[];
  /**
   * Which personalities say it. A line tagged `sociable` is only ever put in the mouth of a bot
   * with the sociability to have said it — which is what stops the quiet ones sounding chatty.
   */
  readonly voice?: 'sociable' | 'gruff' | 'keen';
}

const TEMPLATE_LIST = [
  /* ── greeting ──────────────────────────────────────────────────────────────── */
  { id: 'g-morning', category: 'greeting', text: 'Morning all.', needs: [] },
  { id: 'g-morning-2', category: 'greeting', text: 'Right. Coffee, then monsters.', needs: [] },
  { id: 'g-evening', category: 'greeting', text: 'Evening. Anyone still up?', needs: [] },
  {
    id: 'g-back',
    category: 'greeting',
    text: 'Back. Missed anything?',
    needs: [],
  },
  {
    id: 'g-named',
    category: 'greeting',
    text: '{hero} is about. The day improves.',
    needs: ['hero'],
    voice: 'sociable',
  },
  {
    id: 'g-hello-hero',
    category: 'greeting',
    text: 'Morning {hero}.',
    needs: ['hero'],
  },
  { id: 'g-quiet', category: 'greeting', text: 'Quiet in here today.', needs: [] },
  {
    id: 'g-late',
    category: 'greeting',
    text: 'Some of us have roads to walk in the morning, you know.',
    needs: [],
    voice: 'gruff',
  },
  {
    id: 'g-lurk',
    category: 'greeting',
    text: 'I have been reading. I just do not type much.',
    needs: [],
    voice: 'gruff',
  },
  {
    id: 'g-rally',
    category: 'greeting',
    text: 'Who is out today? {guild} does not run itself.',
    needs: ['guild'],
    voice: 'keen',
  },

  /* ── brag ──────────────────────────────────────────────────────────────────── */
  {
    id: 'b-level',
    category: 'brag',
    text: '{hero} hit {level}. Grats.',
    needs: ['hero', 'level'],
  },
  {
    id: 'b-level-2',
    category: 'brag',
    text: 'Level {level} for {hero}. About time.',
    needs: ['hero', 'level'],
    voice: 'gruff',
  },
  {
    id: 'b-level-3',
    category: 'brag',
    text: '{level}!! nice one {hero}',
    needs: ['hero', 'level'],
    voice: 'sociable',
  },
  {
    id: 'b-level-mine',
    category: 'brag',
    text: 'Finally {level}. Took me long enough.',
    needs: ['level'],
  },
  {
    id: 'b-rank',
    category: 'brag',
    text: '{hero} is rank {rank} now. Look at that.',
    needs: ['hero', 'rank'],
  },
  {
    id: 'b-rank-2',
    category: 'brag',
    text: 'Rank {rank}. I am not going to pretend I am not pleased.',
    needs: ['rank'],
  },
  {
    id: 'b-rank-3',
    category: 'brag',
    text: 'Somebody tell {hero} that rank {rank} does not make them interesting.',
    needs: ['hero', 'rank'],
    voice: 'gruff',
  },
  {
    id: 'b-item',
    category: 'brag',
    text: 'Pulled a {item}. I am never taking it off.',
    needs: ['item'],
  },
  {
    id: 'b-item-2',
    category: 'brag',
    text: '{hero} found a {item}. Some people have all the luck.',
    needs: ['hero', 'item'],
  },
  {
    id: 'b-gold',
    category: 'brag',
    text: '{gold} gold in one afternoon. The roads have been kind.',
    needs: ['gold'],
  },
  {
    id: 'b-streak',
    category: 'brag',
    text: '{count} in a row without going down once.',
    needs: ['count'],
    voice: 'keen',
  },
  {
    id: 'b-top',
    category: 'brag',
    text: 'Top {rank} in Aldenvale. {guild} colours on the board.',
    needs: ['rank', 'guild'],
    voice: 'keen',
  },

  /* ── grumble ───────────────────────────────────────────────────────────────── */
  {
    id: 'r-slip',
    category: 'grumble',
    text: 'Slipped {count} rungs overnight. Wonderful.',
    needs: ['count'],
  },
  {
    id: 'r-slip-2',
    category: 'grumble',
    text: '{hero} lost {count} places while they slept. We have all been there.',
    needs: ['hero', 'count'],
  },
  {
    id: 'r-loss',
    category: 'grumble',
    text: 'Lost to {other}. I would like a word with whoever balanced that.',
    needs: ['other'],
  },
  {
    id: 'r-loss-2',
    category: 'grumble',
    text: '{hero} went down to {other}. Bad luck.',
    needs: ['hero', 'other'],
  },
  {
    id: 'r-gear',
    category: 'grumble',
    text: '{count} missions, not one thing worth wearing.',
    needs: ['count'],
    voice: 'gruff',
  },
  {
    id: 'r-gear-2',
    category: 'grumble',
    text: 'The Armory had nothing again. Bram is coasting.',
    needs: [],
  },
  {
    id: 'r-rank',
    category: 'grumble',
    text: 'Rank {rank} and falling. I need better boots.',
    needs: ['rank'],
  },
  {
    id: 'r-zone',
    category: 'grumble',
    text: '{zone} is not worth the walk at the moment.',
    needs: ['zone'],
    voice: 'gruff',
  },
  {
    id: 'r-vigor',
    category: 'grumble',
    text: 'Out of Vigor before lunch. Again.',
    needs: [],
  },
  {
    id: 'r-quiet',
    category: 'grumble',
    text: 'Is anyone actually running anything this week?',
    needs: [],
    voice: 'gruff',
  },

  /* ── mission ───────────────────────────────────────────────────────────────── */
  {
    id: 'm-done',
    category: 'mission',
    text: 'Cleared {zone}. Nothing dramatic.',
    needs: ['zone'],
  },
  {
    id: 'm-done-2',
    category: 'mission',
    text: '{hero} has been all over {zone} today.',
    needs: ['hero', 'zone'],
  },
  {
    id: 'm-count',
    category: 'mission',
    text: '{count} contracts today. My feet are done.',
    needs: ['count'],
  },
  {
    id: 'm-count-2',
    category: 'mission',
    text: '{hero} put away {count} jobs. Show-off.',
    needs: ['hero', 'count'],
    voice: 'sociable',
  },
  {
    id: 'm-advice',
    category: 'mission',
    text: 'Take the long contracts. The odds are better and the coin is the same per hour.',
    needs: [],
    voice: 'gruff',
  },
  {
    id: 'm-zone-tip',
    category: 'mission',
    text: 'Anything past {zone} is going to want a real weapon.',
    needs: ['zone'],
  },
  {
    id: 'm-ale',
    category: 'mission',
    text: 'Marla is pouring. Anyone want in on an Ale before the reset?',
    needs: [],
    voice: 'sociable',
  },
  {
    id: 'm-patrol',
    category: 'mission',
    text: '{count} hours on the Watch and my back knows it.',
    needs: ['count'],
  },

  /* ── arena ─────────────────────────────────────────────────────────────────── */
  {
    id: 'a-win',
    category: 'arena',
    text: 'Took {other}’s rung. They did not enjoy it.',
    needs: ['other'],
  },
  {
    id: 'a-win-2',
    category: 'arena',
    text: '{hero} beat {other} in the sand. Good fight, apparently.',
    needs: ['hero', 'other'],
  },
  {
    id: 'a-loss',
    category: 'arena',
    text: '{other} put me down in {count} rounds. {count}.',
    needs: ['other', 'count'],
  },
  {
    id: 'a-raid',
    category: 'arena',
    text: '{other} came for {hero} overnight. Someone should have a word.',
    needs: ['hero', 'other'],
  },
  {
    id: 'a-revenge',
    category: 'arena',
    text: 'Settled with {other}. That is that.',
    needs: ['other'],
  },
  {
    id: 'a-cap',
    category: 'arena',
    text: '{count} paid wins already and it is not noon.',
    needs: ['count'],
    voice: 'keen',
  },
  {
    id: 'a-hildy',
    category: 'arena',
    text: 'Hildy has raked the sand. No excuses today.',
    needs: [],
  },
  {
    id: 'a-milestone',
    category: 'arena',
    text: '{hero} is in the top {rank}. {guild} has a name in the Hall now.',
    needs: ['hero', 'rank', 'guild'],
    voice: 'keen',
  },

  /* ── donation ──────────────────────────────────────────────────────────────── */
  {
    id: 'd-in',
    category: 'donation',
    text: 'Dropped {gold} in the Treasury.',
    needs: ['gold'],
  },
  {
    id: 'd-in-2',
    category: 'donation',
    text: '{hero} put {gold} in the pot. That is the way.',
    needs: ['hero', 'gold'],
    voice: 'sociable',
  },
  {
    id: 'd-step',
    category: 'donation',
    text: 'Treasury is at step {count}. Everything pays a little better now.',
    needs: ['count'],
  },
  {
    id: 'd-step-2',
    category: 'donation',
    text: 'Drillmaster {count}. Feel that? That is experience.',
    needs: ['count'],
    voice: 'keen',
  },
  {
    id: 'd-nudge',
    category: 'donation',
    text: 'The pot does not fill itself. Looking at some of you.',
    needs: [],
    voice: 'gruff',
  },
  {
    id: 'd-nudge-2',
    category: 'donation',
    text: '{hero} has not donated in a good while and we have all noticed.',
    needs: ['hero'],
    voice: 'gruff',
  },
  {
    id: 'd-thanks',
    category: 'donation',
    text: 'Whoever put in the big one this morning — thank you.',
    needs: [],
    voice: 'sociable',
  },
  {
    id: 'd-broke',
    category: 'donation',
    text: 'I would donate but Odo has my gold and I have a horse.',
    needs: [],
  },

  /* ── welcome ───────────────────────────────────────────────────────────────── */
  {
    id: 'w-join',
    category: 'welcome',
    text: 'Welcome, {hero}.',
    needs: ['hero'],
  },
  {
    id: 'w-join-2',
    category: 'welcome',
    text: '{hero} is in. Someone show them where the pot is.',
    needs: ['hero'],
    voice: 'sociable',
  },
  {
    id: 'w-join-3',
    category: 'welcome',
    text: 'Welcome to {guild}, {hero}. Do not touch the banner.',
    needs: ['hero', 'guild'],
    voice: 'sociable',
  },
  {
    id: 'w-join-4',
    category: 'welcome',
    text: 'Another one. Hello {hero}.',
    needs: ['hero'],
    voice: 'gruff',
  },
  {
    id: 'w-join-level',
    category: 'welcome',
    text: '{hero}, level {level}. That will do nicely.',
    needs: ['hero', 'level'],
  },
  {
    id: 'w-promote',
    category: 'welcome',
    text: '{hero} is an officer now. Behave accordingly.',
    needs: ['hero'],
  },

  /* ── farewell ──────────────────────────────────────────────────────────────── */
  {
    id: 'f-left',
    category: 'farewell',
    text: '{hero} has gone. Fair enough.',
    needs: ['hero'],
  },
  {
    id: 'f-left-2',
    category: 'farewell',
    text: 'And {hero} walks. Door is over there.',
    needs: ['hero'],
    voice: 'gruff',
  },
  {
    id: 'f-kick',
    category: 'farewell',
    text: '{hero} is out. That was overdue.',
    needs: ['hero'],
    voice: 'gruff',
  },
  {
    id: 'f-kick-2',
    category: 'farewell',
    text: 'Bit harsh on {hero}, that.',
    needs: ['hero'],
    voice: 'sociable',
  },
  {
    id: 'f-quiet',
    category: 'farewell',
    text: 'Nobody has seen {hero} in a while.',
    needs: ['hero'],
  },
  {
    id: 'f-return',
    category: 'farewell',
    text: '{hero} is back. We had almost given up.',
    needs: ['hero'],
    voice: 'sociable',
  },

  /* ── bounty ────────────────────────────────────────────────────────────────── */
  {
    id: 'y-posted',
    category: 'bounty',
    text: 'This week: {bounty}. Get on it.',
    needs: ['bounty'],
  },
  {
    id: 'y-posted-2',
    category: 'bounty',
    text: 'Bounty is up — {bounty}. Should be doable.',
    needs: ['bounty'],
    voice: 'keen',
  },
  {
    id: 'y-progress',
    category: 'bounty',
    text: '{percent}% on the bounty. Keep going.',
    needs: ['percent'],
  },
  {
    id: 'y-progress-2',
    category: 'bounty',
    text: 'We are at {percent}% and it is already Thursday.',
    needs: ['percent'],
    voice: 'gruff',
  },
  {
    id: 'y-carry',
    category: 'bounty',
    text: '{hero} is carrying this bounty single-handed.',
    needs: ['hero'],
  },
  {
    id: 'y-done',
    category: 'bounty',
    text: 'Bounty cleared. Chests all round.',
    needs: [],
    voice: 'keen',
  },
  {
    id: 'y-missed',
    category: 'bounty',
    text: 'Missed it by a hair. {percent}%. Next week.',
    needs: ['percent'],
  },
  {
    id: 'y-blame',
    category: 'bounty',
    text: 'Who keeps losing us the bounty? Rhetorical. I know who.',
    needs: [],
    voice: 'gruff',
  },

  /* ── reply (to the player) ─────────────────────────────────────────────────── */
  {
    id: 'p-hi',
    category: 'reply',
    text: 'Hello {hero}.',
    needs: ['hero'],
  },
  {
    id: 'p-hi-2',
    category: 'reply',
    text: 'Hey.',
    needs: [],
  },
  {
    id: 'p-hi-3',
    category: 'reply',
    text: 'Alright {hero}?',
    needs: ['hero'],
    voice: 'sociable',
  },
  {
    id: 'p-grats',
    category: 'reply',
    text: 'Grats!',
    needs: [],
    voice: 'sociable',
  },
  {
    id: 'p-grats-2',
    category: 'reply',
    text: 'Nice.',
    needs: [],
  },
  {
    id: 'p-grats-3',
    category: 'reply',
    text: 'Good work, {hero}.',
    needs: ['hero'],
  },
  {
    id: 'p-tease',
    category: 'reply',
    text: 'Yes yes, we all saw.',
    needs: [],
    voice: 'gruff',
  },
  {
    id: 'p-tease-2',
    category: 'reply',
    text: 'And there it is. {hero} telling us again.',
    needs: ['hero'],
    voice: 'gruff',
  },
  {
    id: 'p-sympathy',
    category: 'reply',
    text: 'Rough. It happens.',
    needs: [],
  },
  {
    id: 'p-sympathy-2',
    category: 'reply',
    text: 'You will get them next time.',
    needs: [],
    voice: 'sociable',
  },
  {
    id: 'p-agree',
    category: 'reply',
    text: 'Agreed.',
    needs: [],
  },
  {
    id: 'p-agree-2',
    category: 'reply',
    text: 'That is about the size of it.',
    needs: [],
  },
  {
    id: 'p-question',
    category: 'reply',
    text: 'Depends who you ask.',
    needs: [],
  },
  {
    id: 'p-question-2',
    category: 'reply',
    text: 'Ask {other}, they would know.',
    needs: ['other'],
  },
  {
    id: 'p-shrug',
    category: 'reply',
    text: 'No idea, sorry.',
    needs: [],
  },
  {
    id: 'p-thanks',
    category: 'reply',
    text: 'Cheers {hero}.',
    needs: ['hero'],
    voice: 'sociable',
  },

  /* ── idle (colour only — no delta behind it) ───────────────────────────────── */
  { id: 'i-weather', category: 'idle', text: 'Rain again. Emberhollow in spring.', needs: [] },
  {
    id: 'i-tankard',
    category: 'idle',
    text: 'Somebody has taken my usual seat at the Tankard and I am being very calm about it.',
    needs: [],
  },
  {
    id: 'i-forge',
    category: 'idle',
    text: 'Torvald has been hammering away at something all week.',
    needs: [],
  },
  {
    id: 'i-vesna',
    category: 'idle',
    text: 'Madame Vesna told me my fortune. It was mostly about money I do not have.',
    needs: [],
  },
  {
    id: 'i-stables',
    category: 'idle',
    text: 'Odo has a griffin in the end stall. Nobody talk to me about the price.',
    needs: [],
  },
  {
    id: 'i-banner',
    category: 'idle',
    text: 'The banner needs washing.',
    needs: [],
    voice: 'gruff',
  },
  {
    id: 'i-sela',
    category: 'idle',
    text: 'Sela quoted me for a ring and I laughed. She did not.',
    needs: [],
  },
  {
    id: 'i-hall',
    category: 'idle',
    text: 'Spent half the morning reading the Hall of Fame. No regrets.',
    needs: [],
    voice: 'sociable',
  },
  {
    id: 'i-undertavern',
    category: 'idle',
    text: 'There is a door under the Tankard and I do not like it.',
    needs: [],
  },
  {
    id: 'i-crier',
    category: 'idle',
    text: 'The Crier has been shouting since dawn. Some of us were asleep.',
    needs: [],
    voice: 'gruff',
  },
  {
    id: 'i-quiet',
    category: 'idle',
    text: 'Nice and quiet. I like it like this.',
    needs: [],
    voice: 'gruff',
  },
  {
    id: 'i-guild',
    category: 'idle',
    text: 'Say what you like, this is a good hall.',
    needs: [],
    voice: 'sociable',
  },

  /* ── second pass: volume, so the same joke does not come round twice a day ──── */
  {
    id: 'g-dawn',
    category: 'greeting',
    text: 'Up before the Crier. Small victories.',
    needs: [],
    voice: 'keen',
  },
  { id: 'g-tired', category: 'greeting', text: 'Here. Barely.', needs: [] },
  {
    id: 'g-roll',
    category: 'greeting',
    text: 'Right, who is doing what today?',
    needs: [],
    voice: 'keen',
  },
  { id: 'g-nod', category: 'greeting', text: 'Hall.', needs: [], voice: 'gruff' },
  {
    id: 'b-level-4',
    category: 'brag',
    text: 'Ding. {level}.',
    needs: ['level'],
    voice: 'sociable',
  },
  {
    id: 'b-level-5',
    category: 'brag',
    text: 'That is {hero} past {level} before most of us were up.',
    needs: ['hero', 'level'],
  },
  { id: 'b-rank-4', category: 'brag', text: 'Up {count} rungs this morning.', needs: ['count'] },
  {
    id: 'b-item-3',
    category: 'brag',
    text: 'A {item} out of {zone} of all places.',
    needs: ['item', 'zone'],
  },
  {
    id: 'b-gold-2',
    category: 'brag',
    text: '{hero} came back with {gold} gold. From one afternoon.',
    needs: ['hero', 'gold'],
  },
  {
    id: 'b-quiet',
    category: 'brag',
    text: 'Not saying anything. Just check the board.',
    needs: [],
    voice: 'gruff',
  },
  {
    id: 'r-slip-3',
    category: 'grumble',
    text: 'Rank {rank}. It was better before I went to bed.',
    needs: ['rank'],
  },
  {
    id: 'r-drop',
    category: 'grumble',
    text: '{count} contracts and not one drop worth the bag space.',
    needs: ['count'],
  },
  {
    id: 'r-loss-3',
    category: 'grumble',
    text: '{other} again. That is becoming a pattern.',
    needs: ['other'],
    voice: 'gruff',
  },
  {
    id: 'r-zone-2',
    category: 'grumble',
    text: 'Whatever is loose in {zone} hits far harder than it looks.',
    needs: ['zone'],
  },
  {
    id: 'r-purse',
    category: 'grumble',
    text: 'Bram wanted {gold} for a helmet. A helmet.',
    needs: ['gold'],
  },
  { id: 'r-tired', category: 'grumble', text: 'Long week. That is all.', needs: [] },
  {
    id: 'm-zone-3',
    category: 'mission',
    text: 'Anyone else been out to {zone} today?',
    needs: ['zone'],
    voice: 'sociable',
  },
  {
    id: 'm-tip-2',
    category: 'mission',
    text: 'Do not go past {zone} without a mount. Learn from me.',
    needs: ['zone'],
  },
  {
    id: 'm-count-3',
    category: 'mission',
    text: 'That is {count} for the bounty from me.',
    needs: ['count'],
    voice: 'keen',
  },
  { id: 'm-board', category: 'mission', text: 'The board is thin today. Rerolling.', needs: [] },
  {
    id: 'm-level',
    category: 'mission',
    text: 'Nearly {level}. One more good run.',
    needs: ['level'],
  },
  {
    id: 'm-back',
    category: 'mission',
    text: 'Home, filthy, paid. A good day.',
    needs: [],
    voice: 'sociable',
  },
  {
    id: 'a-win-3',
    category: 'arena',
    text: 'Rank {rank} and climbing. The sand has been good to me.',
    needs: ['rank'],
    voice: 'keen',
  },
  {
    id: 'a-loss-2',
    category: 'arena',
    text: '{hero} went down to {other}. It happens to all of us.',
    needs: ['hero', 'other'],
    voice: 'sociable',
  },
  {
    id: 'a-raid-2',
    category: 'arena',
    text: 'Woke up {count} rungs lower. Somebody has been busy.',
    needs: ['count'],
  },
  {
    id: 'a-watch',
    category: 'arena',
    text: 'Watching {hero} fight is worth the walk over.',
    needs: ['hero'],
    voice: 'sociable',
  },
  {
    id: 'a-advice',
    category: 'arena',
    text: 'Read them before you swing. The board tells you plenty.',
    needs: [],
    voice: 'gruff',
  },
  { id: 'a-bell', category: 'arena', text: 'Waiting on the bell. Again.', needs: [] },
  {
    id: 'd-in-3',
    category: 'donation',
    text: '{gold} to the Drillmaster. Spend it well.',
    needs: ['gold'],
  },
  {
    id: 'd-step-3',
    category: 'donation',
    text: 'That is {count} steps on the Treasury now. Adds up.',
    needs: ['count'],
  },
  {
    id: 'd-ask',
    category: 'donation',
    text: 'How far off the next step are we?',
    needs: [],
    voice: 'sociable',
  },
  {
    id: 'd-proud',
    category: 'donation',
    text: 'Best-funded hall on the board and I will hear no argument.',
    needs: [],
    voice: 'keen',
  },
  {
    id: 'd-dice',
    category: 'donation',
    text: 'Threw a die in the pot. Felt strange. Did it anyway.',
    needs: [],
  },
  {
    id: 'w-join-5',
    category: 'welcome',
    text: 'Good to have you, {hero}.',
    needs: ['hero'],
    voice: 'sociable',
  },
  {
    id: 'w-join-6',
    category: 'welcome',
    text: '{hero} joins us at rank {rank}. Not bad.',
    needs: ['hero', 'rank'],
  },
  {
    id: 'w-join-7',
    category: 'welcome',
    text: 'Make room, {hero} is in.',
    needs: ['hero'],
    voice: 'keen',
  },
  {
    id: 'w-founder',
    category: 'welcome',
    text: '{guild} has a hall of its own now. Somebody put the kettle on.',
    needs: ['guild'],
    voice: 'sociable',
  },
  {
    id: 'f-left-3',
    category: 'farewell',
    text: '{hero} has moved on. No hard feelings.',
    needs: ['hero'],
  },
  {
    id: 'f-left-4',
    category: 'farewell',
    text: 'Down to {count} of us.',
    needs: ['count'],
    voice: 'gruff',
  },
  {
    id: 'f-kick-3',
    category: 'farewell',
    text: '{hero} is gone and the pot is no emptier for it.',
    needs: ['hero'],
    voice: 'gruff',
  },
  {
    id: 'f-quiet-2',
    category: 'farewell',
    text: 'Has anyone heard from {hero}?',
    needs: ['hero'],
    voice: 'sociable',
  },
  {
    id: 'y-progress-3',
    category: 'bounty',
    text: '{percent}% and climbing. {bounty} is going down.',
    needs: ['percent', 'bounty'],
    voice: 'keen',
  },
  {
    id: 'y-carry-2',
    category: 'bounty',
    text: '{hero} has done more for this bounty than the rest of us together.',
    needs: ['hero'],
  },
  {
    id: 'y-push',
    category: 'bounty',
    text: 'One good evening and {bounty} is finished.',
    needs: ['bounty'],
    voice: 'keen',
  },
  {
    id: 'y-half',
    category: 'bounty',
    text: 'Half a chest is still a chest. {percent}%.',
    needs: ['percent'],
  },
  { id: 'p-hi-4', category: 'reply', text: 'There they are.', needs: [], voice: 'sociable' },
  {
    id: 'p-grats-4',
    category: 'reply',
    text: 'Grats {hero}, that is a good one.',
    needs: ['hero'],
    voice: 'sociable',
  },
  { id: 'p-tease-3', category: 'reply', text: 'Modest as ever.', needs: [], voice: 'gruff' },
  {
    id: 'p-sympathy-3',
    category: 'reply',
    text: 'Happens to everyone. Even {other}.',
    needs: ['other'],
  },
  { id: 'p-agree-3', category: 'reply', text: 'Same here.', needs: [] },
  {
    id: 'p-question-3',
    category: 'reply',
    text: 'Try the long contracts. That is what I would do.',
    needs: [],
  },
  {
    id: 'p-welcome-back',
    category: 'reply',
    text: 'Welcome back {hero}.',
    needs: ['hero'],
    voice: 'sociable',
  },
  {
    id: 'i-market',
    category: 'idle',
    text: 'Market day. Emberhollow smells of onions.',
    needs: [],
  },
  {
    id: 'i-marla',
    category: 'idle',
    text: 'Marla has changed the ale and is pretending she has not.',
    needs: [],
  },
  {
    id: 'i-menagerie',
    category: 'idle',
    text: 'Something in the Menagerie has learned to open its latch.',
    needs: [],
  },
  {
    id: 'i-roof',
    category: 'idle',
    text: 'The hall roof leaks over exactly one chair and we all know which.',
    needs: [],
  },
  {
    id: 'i-bram',
    category: 'idle',
    text: 'Bram called my weapon "serviceable". I am still thinking about it.',
    needs: [],
  },
  {
    id: 'i-night',
    category: 'idle',
    text: 'Nobody awake but me and the lanterns.',
    needs: [],
    voice: 'gruff',
  },
] as const satisfies readonly ChatTemplate[];

/** Widened so consumers get a plain array rather than the frozen literal's exact tuple type. */
export const CHAT_TEMPLATES: readonly ChatTemplate[] = TEMPLATE_LIST;

/* ── Vibe tags ─────────────────────────────────────────────────────────────────── */

/**
 * A guild's character, read off the personality mix of its members (spec §1).
 *
 * Shown on the browse card so the sixty halls are a choice rather than sixty rows. Derived
 * rather than authored: a guild that recruits hoarders *becomes* "collectors" without anybody
 * having decided it should be.
 */
export const VIBE_TAGS = [
  'hardcore',
  'cozy',
  'night owls',
  'early risers',
  'scrappers',
  'collectors',
  'quiet',
  'loud',
] as const;
export type VibeTag = (typeof VIBE_TAGS)[number];

/* ── Rendering ─────────────────────────────────────────────────────────────────── */

/** Fill a line's slots. Unknown slots are left alone; `usableChatLines` prevents that. */
export function renderChatLine(template: ChatTemplate, slots: ChatSlots): string {
  return template.text.replace(/\{([a-z]+)\}/g, (whole, key: string) => {
    const value = slots[key as ChatSlot];
    return value === undefined ? whole : String(value);
  });
}

/**
 * The lines that can be said right now.
 *
 * Filtering *before* picking rather than rejecting after is what makes the corpus honest: a line
 * that wants `{other}` simply cannot be chosen when there is no other hero to name, so no message
 * ever ships with a hole in it or invents a name to fill one.
 */
export function usableChatLines(
  category: ChatCategory,
  slots: ChatSlots,
  voice?: ChatTemplate['voice'],
): ChatTemplate[] {
  return CHAT_TEMPLATES.filter(
    (template) =>
      template.category === category &&
      // An untagged line suits any mouth; a tagged one only its own.
      (template.voice === undefined || voice === undefined || template.voice === voice) &&
      template.needs.every((slot) => slots[slot] !== undefined),
  );
}

/** Pick by index, never rolled. */
export function chatLineAt(lines: readonly ChatTemplate[], index: number): ChatTemplate | null {
  if (lines.length === 0) return null;
  return lines[Math.abs(index) % lines.length]!;
}
