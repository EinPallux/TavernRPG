/**
 * Town Crier headlines and rival archetypes (world-simulation spec §5–§6, content plan §5).
 *
 * The feed is the **proof of life** for the whole simulation, which puts one hard constraint on
 * this file: every template must be fillable *only* from something that actually happened. There
 * is no "a hero somewhere did something" line, because the moment the Crier can speak without a
 * delta behind it, the feed stops being evidence and becomes wallpaper — and the audit test
 * (`feed entries reference real sim deltas`) is what keeps it honest.
 *
 * The one exception is `flavour`, which is explicitly about the world rather than its people and
 * is tagged as such so the audit can tell the two apart.
 *
 * Lines are chosen **by index**, never rolled — same rule as every other bark in the game.
 *
 * Pure data module.
 */

export const CRIER_CATEGORIES = [
  /** A known name gained a level. */
  'levelUp',
  /** Somebody moved past somebody on the ladder. */
  'ladder',
  /** A milestone rank was reached (top 100, top 10, rank 1). */
  'milestone',
  /** Guild recruited, lost members, merged or folded. */
  'guild',
  /** A rival, talking. */
  'taunt',
  /** Went quiet, or came back. */
  'lifecycle',
  /** About the world, not its people. The only category with no delta behind it. */
  'flavour',
] as const;
export type CrierCategory = (typeof CRIER_CATEGORIES)[number];

/**
 * Slots a template may reference. Everything here is read off a real sim delta, which is why
 * the list is short and boring — an expressive template language would let a headline claim
 * something the tick never produced.
 */
export interface CrierSlots {
  readonly hero?: string;
  readonly other?: string;
  readonly guild?: string;
  readonly otherGuild?: string;
  readonly level?: number;
  readonly rank?: number;
  readonly count?: number;
}

export interface CrierTemplate {
  readonly id: string;
  readonly category: CrierCategory;
  /** `{hero}`, `{other}`, `{guild}`, `{level}`, `{rank}`, `{count}`. */
  readonly text: string;
  /** Slots this line will not render without. The generator checks before it picks. */
  readonly needs: readonly (keyof CrierSlots)[];
}

const TEMPLATE_LIST = [
  // ── Level-ups: the commonest event, so it needs the most variations. ──
  {
    id: 'lvl-plain',
    category: 'levelUp',
    text: '{hero} reached level {level}.',
    needs: ['hero', 'level'],
  },
  {
    id: 'lvl-quiet',
    category: 'levelUp',
    text: '{hero} is level {level} now, and did not make a fuss about it.',
    needs: ['hero', 'level'],
  },
  {
    id: 'lvl-round',
    category: 'levelUp',
    text: 'Level {level} for {hero}. The Tankard heard about it twice.',
    needs: ['hero', 'level'],
  },
  {
    id: 'lvl-guild',
    category: 'levelUp',
    text: '{hero} of {guild} hit level {level}.',
    needs: ['hero', 'level', 'guild'],
  },
  {
    id: 'lvl-fast',
    category: 'levelUp',
    text: '{hero} has not stopped. Level {level}.',
    needs: ['hero', 'level'],
  },
  {
    id: 'lvl-late',
    category: 'levelUp',
    text: 'Word arrives late: {hero} made level {level} some days back.',
    needs: ['hero', 'level'],
  },

  // ── Ladder movement. ──
  {
    id: 'lad-pass',
    category: 'ladder',
    text: '{hero} went past {other} on the ladder.',
    needs: ['hero', 'other'],
  },
  {
    id: 'lad-close',
    category: 'ladder',
    text: '{hero} took rank {rank} off {other}. It was close.',
    needs: ['hero', 'other', 'rank'],
  },
  {
    id: 'lad-clean',
    category: 'ladder',
    text: 'Rank {rank} changed hands: {hero} over {other}.',
    needs: ['hero', 'other', 'rank'],
  },
  {
    id: 'lad-again',
    category: 'ladder',
    text: '{other} lost rank {rank} to {hero}. Again.',
    needs: ['hero', 'other', 'rank'],
  },
  {
    id: 'lad-climb',
    category: 'ladder',
    text: '{hero} is up to rank {rank} and still climbing.',
    needs: ['hero', 'rank'],
  },
  {
    id: 'lad-slip',
    category: 'ladder',
    text: '{hero} slipped to rank {rank}. It happens.',
    needs: ['hero', 'rank'],
  },

  // ── Milestones. ──
  {
    id: 'mil-hundred',
    category: 'milestone',
    text: '{hero} is in the top hundred.',
    needs: ['hero'],
  },
  {
    id: 'mil-ten',
    category: 'milestone',
    text: '{hero} has broken into the top ten. That is not nothing.',
    needs: ['hero'],
  },
  {
    id: 'mil-one',
    category: 'milestone',
    text: 'Rank one. {hero} stands at the top of the ladder.',
    needs: ['hero'],
  },
  {
    id: 'mil-dethrone',
    category: 'milestone',
    text: '{other} is no longer rank one. {hero} is.',
    needs: ['hero', 'other'],
  },
  {
    id: 'mil-fifty',
    category: 'milestone',
    text: '{hero} cracked the top fifty this week.',
    needs: ['hero'],
  },

  // ── Guild drama. ──
  {
    id: 'gld-recruit',
    category: 'guild',
    text: '{guild} took on {count} new hands.',
    needs: ['guild', 'count'],
  },
  {
    id: 'gld-join',
    category: 'guild',
    text: '{hero} signed with {guild}.',
    needs: ['hero', 'guild'],
  },
  {
    id: 'gld-leave',
    category: 'guild',
    text: '{hero} left {guild}. No reason given.',
    needs: ['hero', 'guild'],
  },
  {
    id: 'gld-exodus',
    category: 'guild',
    text: '{count} left {guild} in one night. The hall is quiet.',
    needs: ['guild', 'count'],
  },
  {
    id: 'gld-merge',
    category: 'guild',
    text: '{guild} and {otherGuild} have thrown in together.',
    needs: ['guild', 'otherGuild'],
  },
  {
    id: 'gld-fold',
    category: 'guild',
    text: '{guild} has folded. The banner came down at dawn.',
    needs: ['guild'],
  },
  {
    id: 'gld-rise',
    category: 'guild',
    text: '{guild} is the talk of the ladder this week.',
    needs: ['guild'],
  },
  {
    id: 'gld-poach',
    category: 'guild',
    text: '{hero} went from {guild} to {otherGuild}. There will be words.',
    needs: ['hero', 'guild', 'otherGuild'],
  },

  // ── Rival taunts. The Crier repeats them; it does not invent them. ──
  {
    id: 'tnt-arm',
    category: 'taunt',
    text: '{hero} says your shield arm looks tired.',
    needs: ['hero'],
  },
  {
    id: 'tnt-ladder',
    category: 'taunt',
    text: '{hero} has been asking where you are on the ladder. Loudly.',
    needs: ['hero'],
  },
  {
    id: 'tnt-guild',
    category: 'taunt',
    text: '{hero} on {guild}: "more like the snuffed candle."',
    needs: ['hero', 'guild'],
  },
  // One rank slot, used once: the Crier only knows the rival's own rank, and a line that
  // printed it twice read as a bug rather than a boast.
  {
    id: 'tnt-rank',
    category: 'taunt',
    text: '{hero} has taken rank {rank} and wants you to know about it.',
    needs: ['hero', 'rank'],
  },
  {
    id: 'tnt-wait',
    category: 'taunt',
    text: '{hero} is buying a round and saving you a seat. For later.',
    needs: ['hero'],
  },
  {
    id: 'tnt-name',
    category: 'taunt',
    text: '{hero} keeps mispronouncing your name. It is deliberate.',
    needs: ['hero'],
  },
  {
    id: 'tnt-quiet',
    category: 'taunt',
    text: '{hero} has stopped talking about you. That is worse.',
    needs: ['hero'],
  },

  // ── Quit and return arcs. ──
  {
    id: 'lif-quiet',
    category: 'lifecycle',
    text: 'Nobody has seen {hero} in a while.',
    needs: ['hero'],
  },
  {
    id: 'lif-back',
    category: 'lifecycle',
    text: '{hero} is back. Says it was exams.',
    needs: ['hero'],
  },
  {
    id: 'lif-back2',
    category: 'lifecycle',
    text: '{hero} walked into the Tankard like no time had passed.',
    needs: ['hero'],
  },
  {
    id: 'lif-gone',
    category: 'lifecycle',
    text: '{hero} has hung it up, apparently for good.',
    needs: ['hero'],
  },

  // ── World flavour. No delta behind these, and tagged so the audit knows. ──
  {
    id: 'flv-wyvern',
    category: 'flavour',
    text: 'A wyvern was seen over Frostfell Ridge. Probably nothing.',
    needs: [],
  },
  {
    id: 'flv-bridge',
    category: 'flavour',
    text: 'The Red Ford bridge is out again. Third time this season.',
    needs: [],
  },
  {
    id: 'flv-ale',
    category: 'flavour',
    text: 'Marla has raised the price of ale by a copper and dares you to mention it.',
    needs: [],
  },
  {
    id: 'flv-lights',
    category: 'flavour',
    text: 'Lights over the marsh two nights running. The Watch is not commenting.',
    needs: [],
  },
  {
    id: 'flv-caravan',
    category: 'flavour',
    text: 'The southern caravan came in a day early and nobody knows why.',
    needs: [],
  },
  {
    id: 'flv-goose',
    category: 'flavour',
    text: 'A goose has taken up residence in the Notice Board. It is winning.',
    needs: [],
  },
  {
    id: 'flv-forge',
    category: 'flavour',
    text: 'Torvald’s forge burned green for an hour. He says that is normal.',
    needs: [],
  },
  {
    id: 'flv-quiet',
    category: 'flavour',
    text: 'A quiet week in Emberhollow. Enjoy it.',
    needs: [],
  },
] as const satisfies readonly CrierTemplate[];

export const CRIER_TEMPLATES: readonly CrierTemplate[] = TEMPLATE_LIST;

// Grouped by hand rather than with `Object.fromEntries`, which returns an index-signature type
// TypeScript will not narrow back to a keyed Record.
function groupByCategory(): Record<CrierCategory, CrierTemplate[]> {
  const grouped = {} as Record<CrierCategory, CrierTemplate[]>;
  for (const category of CRIER_CATEGORIES) grouped[category] = [];
  for (const template of CRIER_TEMPLATES) grouped[template.category].push(template);
  return grouped;
}

export const TEMPLATES_BY_CATEGORY: Readonly<Record<CrierCategory, readonly CrierTemplate[]>> =
  groupByCategory();

/** Fill a template. Missing slots leave the placeholder, which the test refuses to allow. */
export function renderHeadline(template: CrierTemplate, slots: CrierSlots): string {
  return template.text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = slots[key as keyof CrierSlots];
    return value === undefined ? match : String(value);
  });
}

/**
 * The templates in a category that the available slots can actually fill.
 *
 * Called before picking rather than after, so the Crier never has to fall back on a half-filled
 * line — a headline with a literal `{other}` in it is worse than no headline.
 */
export function usableTemplates(
  category: CrierCategory,
  slots: CrierSlots,
): readonly CrierTemplate[] {
  return TEMPLATES_BY_CATEGORY[category].filter((template) =>
    template.needs.every((key) => slots[key] !== undefined),
  );
}

/* ── Rival archetypes (content plan §5, world-sim §5) ──────────────────────────── */

export const RIVAL_ARCHETYPES = [
  'overachiever',
  'trash-talker',
  'ghost',
  'copycat',
  'veteran',
  'newcomer',
] as const;
export type RivalArchetype = (typeof RIVAL_ARCHETYPES)[number];

export interface RivalArchetypeDef {
  readonly id: RivalArchetype;
  readonly name: string;
  /** What they are like, in one line — shown on the rival card. */
  readonly blurb: string;
  /** How often they taunt, relative to baseline. */
  readonly taunts: number;
  /** How often they attack the player's rank, relative to baseline. */
  readonly attacks: number;
  /** Which personality vector picks them out (see `world/personality.ts`). */
  readonly wants: {
    readonly dedication?: number;
    readonly aggression?: number;
    readonly sociability?: number;
    readonly volatility?: number;
  };
}

const ARCHETYPE_LIST = [
  {
    id: 'overachiever',
    name: 'The Overachiever',
    blurb: 'Levels faster than is reasonable and will not be drawn on how.',
    taunts: 0.6,
    attacks: 1.0,
    wants: { dedication: 1 },
  },
  {
    id: 'trash-talker',
    name: 'The Trash-Talker',
    blurb: 'Has an opinion about your build and shares it with the room.',
    taunts: 2.0,
    attacks: 1.2,
    wants: { sociability: 1, aggression: 0.8 },
  },
  {
    id: 'ghost',
    name: 'The Ghost',
    blurb: 'Vanishes for a week, comes back three ranks higher.',
    taunts: 0.2,
    attacks: 0.7,
    wants: { volatility: 1 },
  },
  {
    id: 'copycat',
    name: 'The Copycat',
    blurb: 'Same class, same build, one step behind. Deliberately.',
    taunts: 0.8,
    attacks: 1.4,
    wants: { aggression: 0.6, dedication: 0.6 },
  },
  {
    id: 'veteran',
    name: 'The Veteran',
    blurb: 'Was here first and intends to still be here after.',
    taunts: 0.5,
    attacks: 0.9,
    wants: { dedication: 0.7, volatility: -1 },
  },
  {
    id: 'newcomer',
    name: 'The Newcomer',
    blurb: 'Turned up last month and is somehow already breathing down your neck.',
    taunts: 1.1,
    attacks: 1.3,
    wants: { dedication: 0.9, aggression: 0.9 },
  },
] as const satisfies readonly RivalArchetypeDef[];

export const RIVAL_ARCHETYPE_DEFS: readonly RivalArchetypeDef[] = ARCHETYPE_LIST;

export const RIVAL_ARCHETYPES_BY_ID: Readonly<Record<RivalArchetype, RivalArchetypeDef>> =
  Object.fromEntries(RIVAL_ARCHETYPE_DEFS.map((a) => [a.id, a])) as Record<
    RivalArchetype,
    RivalArchetypeDef
  >;
