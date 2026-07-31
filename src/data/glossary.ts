/**
 * The glossary (tutorial spec §1, content plan §7).
 *
 * Forty terms the game uses as if everyone already knows them. They are **not** tutorial
 * content — a glossary that disappears once the beats are done is a glossary that vanishes
 * exactly when a returning player needs it, three weeks later, wondering what Starmetal was for.
 * These stay forever, attached to the word wherever it appears.
 *
 * Two rules the entries are written against:
 *
 * - **One sentence, and say the number.** "Vigor is your daily energy" explains nothing;
 *   "100 a day, spent by the minute on contracts, refilled at midnight" answers the question the
 *   player actually had.
 * - **Never define a term with two other undefined terms.** If an entry has to lean on another,
 *   that one is in here too, and `glossary.test.ts` checks the graph.
 *
 * Pure data module.
 */

export interface GlossaryEntry {
  readonly term: string;
  /** One sentence. The test enforces it. */
  readonly definition: string;
  /** Grouping, for the settings-screen index. */
  readonly topic: 'basics' | 'combat' | 'gear' | 'economy' | 'world' | 'rooms';
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  // ── Basics ──────────────────────────────────────────────────────────────────────
  {
    term: 'Vigor',
    definition:
      'Your day’s adventuring time: 100 of it, spent a minute per minute of contract, refilled at midnight and never stacked.',
    topic: 'basics',
  },
  {
    term: 'Contract',
    definition:
      'A job from the Gilded Tankard’s table — pick a length, wait it out, and fight whatever is at the other end.',
    topic: 'basics',
  },
  {
    term: 'Ale',
    definition: 'A pint buys back 20 Vigor, up to three a day, and Marla only pours so many.',
    topic: 'basics',
  },
  {
    term: 'Gold',
    definition:
      'The ordinary currency: contracts and patrols pay it, and attribute training is where most of it goes.',
    topic: 'basics',
  },
  {
    term: 'Golden Dice',
    definition:
      'The premium currency, and it is never for sale — you earn every one, mostly from the Notice Board’s daily chest.',
    topic: 'basics',
  },
  {
    term: 'Reset',
    definition:
      'Local midnight: Vigor, the board, the shops, the crucible, the free card and every feed cap turn over at once.',
    topic: 'basics',
  },
  {
    term: 'Day key',
    definition:
      'The game counts days by date rather than by elapsed hours, so a clock change never costs or gifts you one.',
    topic: 'basics',
  },

  // ── Combat ──────────────────────────────────────────────────────────────────────
  {
    term: 'Initiative',
    definition: 'Who swings first, decided by Dexterity and settled before the fight starts.',
    topic: 'combat',
  },
  {
    term: 'Proc',
    definition:
      'Your class’s signature move, rolled each round — the Warrior blocks, the Hunter slips, the Bard sings.',
    topic: 'combat',
  },
  {
    term: 'Crit',
    definition:
      'A critical hit, chanced off Luck, that lands for double — the scene slows down when one connects.',
    topic: 'combat',
  },
  {
    term: 'Armour',
    definition:
      'Flat damage reduction from what you are wearing, capped per class so nobody becomes unhittable.',
    topic: 'combat',
  },
  {
    term: 'Damage reduction cap',
    definition:
      'The most armour can ever take off a hit for your class — the Warrior’s is generous, the Mage’s is not.',
    topic: 'combat',
  },
  {
    term: 'Main stat',
    definition:
      'The attribute your damage scales from: Strength for Warriors, Dexterity for Hunters and Swashbucklers, Intelligence for Mages and Bards.',
    topic: 'combat',
  },
  {
    term: 'Verse',
    definition:
      'A Bard’s opening song, chosen on the character screen, which colours the whole fight rather than one round.',
    topic: 'combat',
  },
  {
    term: 'Battle log',
    definition:
      'Every roll the fight made, in order — the scene is a replay of it, not a separate simulation.',
    topic: 'combat',
  },

  // ── Gear ────────────────────────────────────────────────────────────────────────
  {
    term: 'Rarity',
    definition:
      'Common, Uncommon, Rare, Epic and Set — each step carries more attribute lines, not just bigger ones.',
    topic: 'gear',
  },
  {
    term: 'Set piece',
    definition:
      'Gold-framed gear that belongs to one of your class’s two sets, never sellable, and worth real abilities at two, four and five worn.',
    topic: 'gear',
  },
  {
    term: 'Set bonus',
    definition:
      'What wearing several pieces of one set does to the fight — read them on the Set Collections tab before you commit.',
    topic: 'gear',
  },
  {
    term: 'Class lock',
    definition:
      'Weapons and offhands are made for one class, so a Mage will never be handed a greataxe.',
    topic: 'gear',
  },
  {
    term: 'Item budget',
    definition:
      'The total attribute points a piece can carry, decided by its level, rarity and slot — a Rare belt cannot out-roll a Rare weapon.',
    topic: 'gear',
  },
  {
    term: 'Backpack',
    definition:
      'Fifteen slots for loot; when it fills, the overflow satchel catches the rest until you clear it.',
    topic: 'gear',
  },
  {
    term: 'Locked item',
    definition:
      'A padlock on a piece stops it being sold, scrapped or thrown away by anything, including you in a hurry.',
    topic: 'gear',
  },

  // ── Economy ─────────────────────────────────────────────────────────────────────
  {
    term: 'Training',
    definition:
      'Buying attribute points with gold at the character screen; each point of an attribute costs more than the last.',
    topic: 'economy',
  },
  {
    term: 'Scrapping',
    definition:
      'Melting gear at the Emberforge for materials instead of coin — ten pieces a day, and the crucible quotes before it burns.',
    topic: 'economy',
  },
  {
    term: 'Scrap',
    definition:
      'The commonest forge material, from melting Common and Uncommon gear, and the bulk of what an anvil strike costs.',
    topic: 'economy',
  },
  {
    term: 'Essence',
    definition:
      'The middle forge material, from Rares and Epics, spent on better anvil tiers and on pet rarity frames.',
    topic: 'economy',
  },
  {
    term: 'Starmetal',
    definition:
      'The rare forge material — Epics, duplicate set pieces and the ledger’s later squares are where it comes from.',
    topic: 'economy',
  },
  {
    term: 'Ember meter',
    definition:
      'The forge’s pity: five Master strikes without an Epic and the sixth is guaranteed to be one.',
    topic: 'economy',
  },
  {
    term: 'Recipe',
    definition:
      'A pattern for a specific set, found in dungeons and on Vesna’s track, that turns materials into a guaranteed set piece.',
    topic: 'economy',
  },
  {
    term: 'Mount',
    definition:
      'A seven-day rental from the Stables that shortens every contract without reducing what it pays.',
    topic: 'economy',
  },

  // ── World ───────────────────────────────────────────────────────────────────────
  {
    term: 'Honor',
    definition:
      'Your ladder currency: won and lost in the Proving Grounds, and the only thing rank is sorted by.',
    topic: 'world',
  },
  {
    term: 'Rank',
    definition:
      'Where you sit among the fifteen hundred — one is best, and everyone below you is somebody’s target.',
    topic: 'world',
  },
  {
    term: 'Revenge',
    definition:
      'A free rematch against a bot who attacked you while you were away; it does not count against the day’s bouts.',
    topic: 'world',
  },
  {
    term: 'Rival',
    definition:
      'Two or three heroes near your rank that the game keeps an eye on for you, so the ladder has faces.',
    topic: 'world',
  },
  {
    term: 'Town Crier',
    definition:
      'The feed of what the fifteen hundred actually did — every line is a real event from the simulation.',
    topic: 'world',
  },
  {
    term: 'Guild bounty',
    definition:
      'A weekly target your hall works on together; a good week from you is the difference between half a chest and all of it.',
    topic: 'world',
  },

  // ── Rooms ───────────────────────────────────────────────────────────────────────
  {
    term: 'Patrol',
    definition:
      'The City Watch pays by the hour for time you are not spending — the fallback for a day with no Vigor left.',
    topic: 'rooms',
  },
  {
    term: 'Pity',
    definition:
      'A published floor on bad luck: twenty cards at Fortune’s Table without the featured set makes the next one certain.',
    topic: 'rooms',
  },
  {
    term: 'Banner',
    definition:
      'What Fortune’s Table is featuring — one rotates daily, one weekly, one monthly, and the odds are on the screen.',
    topic: 'rooms',
  },
  {
    term: 'Tavern Scraps',
    definition:
      'Pet food, dropped by contracts, and the real limit on how fast a companion in the Menagerie grows.',
    topic: 'rooms',
  },
  {
    term: 'Dungeon key',
    definition:
      'A one-time unlock for one of the three Undertavern doors; once found, the door stays open forever.',
    topic: 'rooms',
  },
];

const BY_TERM: Readonly<Record<string, GlossaryEntry>> = Object.fromEntries(
  GLOSSARY.map((entry) => [entry.term.toLowerCase(), entry]),
);

/** Case-insensitive, because the term is written however the sentence around it needed it. */
export function glossary(term: string): GlossaryEntry | null {
  return BY_TERM[term.toLowerCase()] ?? null;
}

export const GLOSSARY_TOPICS = ['basics', 'combat', 'gear', 'economy', 'world', 'rooms'] as const;

export const TOPIC_LABELS: Readonly<Record<GlossaryEntry['topic'], string>> = {
  basics: 'The basics',
  combat: 'A fight',
  gear: 'Gear',
  economy: 'Coin and materials',
  world: 'The fifteen hundred',
  rooms: 'Around town',
};
