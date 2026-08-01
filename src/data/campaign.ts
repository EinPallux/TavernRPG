/**
 * The Long Road — ten chapters out of Emberhollow, a hundred and twenty stages (campaign spec §1).
 *
 * The campaign is one ladder of single fights that you push as far as your hero can go. Each stage
 * costs **1 Vigor**, pays **once**, and stays cleared forever; the thing that stops you is not a
 * timer or a key but the monster in front of you being stronger than you are. Then you go back to
 * town, train, buy, forge, and come back to the same stage.
 *
 * ## Why it is built out of the zones
 *
 * The ten chapters are the ten zones of Aldenvale, in order, and every stage's monster comes from
 * that chapter's zone. The road *is* the mission board's geography walked end to end, which means
 * the campaign needed no new bestiary — 96 monsters already exist, each with a home and a voice —
 * and a player who has run contracts in Fogmoor recognises what is waiting in chapter four.
 *
 * ## The two curves, and why there are two
 *
 * **Level climbs across the whole road, not within a chapter.** Zone bands overlap (Whispering
 * Woods ends at 8, Miller's Fields starts at 5), so interpolating inside each band would make the
 * road get *easier* at three chapter boundaries. `CHAPTER_LEVELS` states each chapter's first and
 * last level explicitly, every one starting above the last chapter's end, and the test asserts the
 * whole hundred and twenty climb without a single dip. This is the dungeon's lesson — a ramp that
 * sags in the middle is invisible in the data and obvious in play.
 *
 * **Budget climbs within a chapter.** Early chapters cover six levels across twelve stages, so
 * neighbouring stages often share a level; without a second axis, half a chapter would be the same
 * fight twelve times. Each stage's stat budget rises a little across its chapter, which keeps every
 * step forward a real step even when the level does not move.
 *
 * ## Bosses
 *
 * The twelfth stage of every chapter is a named boss carrying a **signature** — the same three
 * ability shapes the Undertavern uses, because a player who walled on Riddletail's swarm should
 * recognise it on the road rather than meet a fourth vocabulary. They are the chapter's wall and
 * they pay double.
 *
 * **Every boss is a heavy, and that was measured rather than chosen.** At the ×1.5 boss budget the
 * archetype is worth up to fifteen levels and the signature is worth two or three — so archetype
 * is the difficulty dial and the signature is the *shape* of the fight, not its size. Only `tank`
 * and `bruiser` produce a wall at all: against a level-100 boss an on-curve hero needs +15 levels
 * if it is a tank, +9 as a bruiser, and beats a skirmisher two levels *under* it. The pairs below
 * were solved for a rising wall, in extra hero levels needed for an even fight:
 *
 * | ch |  lv | archetype | signature       | wall |
 * |----|-----|-----------|-----------------|------|
 * |  1 |   8 | tank      | swarm     0.40  |  +0  |
 * |  2 |  14 | tank      | hardening 0.09  |  +0  |
 * |  3 |  20 | tank      | siphon    0.05  |  +0  |
 * |  4 |  28 | tank      | swarm     0.62  |  +2  |
 * |  5 |  36 | tank      | hardening 0.14  |  +3  |
 * |  6 |  46 | tank      | siphon    0.07  |  +3  |
 * |  7 |  58 | bruiser   | swarm     0.80  |  +4  |
 * |  8 |  72 | bruiser   | hardening 0.17  |  +4  |
 * |  9 |  88 | bruiser   | swarm     0.45  |  +5  |
 * | 10 | 100 | bruiser   | swarm     0.55  |  +6  |
 *
 * The share numbers are therefore *not* monotone down the road, and expecting them to be is the
 * trap: `damageShare` is a share of the boss's own attack, and a level-100 boss's attack dwarfs a
 * level-58 one's. Absolute threat escalates whatever the share says. What must rise is the wall,
 * and `campaign.test.ts` measures that against real fights rather than reading it off the data.
 *
 * Pure data module.
 */

import type { CombatProc } from '@/engine/combat/types';
import type { ArchetypeId } from './monsterArchetypes';
import { monstersInZone, type MonsterDef } from './monsters';
import { ZONES, type ZoneId } from './zones';

/** `[TUNE]` Twelve is long enough to feel like a road and short enough to see the end of. */
export const STAGES_PER_CHAPTER = 12;

/** One chapter per zone, in the order the road leaves town. */
export const CHAPTER_COUNT = ZONES.length;

export const TOTAL_STAGES = CHAPTER_COUNT * STAGES_PER_CHAPTER;

/** `[TUNE]` What a chapter's first and last stage are levelled at (balancing §17). */
const CHAPTER_LEVELS: readonly (readonly [first: number, last: number])[] = [
  [1, 8], // I    Whispering Woods — the first eight levels, one stage each, gently
  [9, 14], // II   Miller's Fields
  [15, 20], // III  Old King's Road
  [21, 28], // IV   Fogmoor Marsh
  [29, 36], // V    Thornhill Ruins
  [37, 46], // VI   Silverpine Pass
  [47, 58], // VII  Ember Caves
  [59, 72], // VIII Gloomhollow
  [73, 88], // IX   Sunken Chapel
  [89, 100], // X    Frostfell Ridge — the end of the road
];

/**
 * `[TUNE]` A stage monster's stat budget, from a chapter's first step to its last.
 *
 * Below 1.0 at the start on purpose: the opening stage of a chapter should read as a breather
 * after the boss you just beat, and the chapter's own ramp is what takes it back over par.
 */
const STAGE_BUDGET_FIRST = 0.92;
const STAGE_BUDGET_LAST = 1.12;

/** `[TUNE]` The chapter boss, at the Undertavern's mid-boss weight — a wall, not a brick. */
export const BOSS_BUDGET = 1.5;

export interface CampaignBossDef {
  readonly id: string;
  readonly name: string;
  readonly archetypeId: ArchetypeId;
  readonly flavor: string;
  readonly signature: {
    readonly label: string;
    readonly explainer: string;
    readonly proc: CombatProc;
  };
}

export interface CampaignChapterDef {
  readonly chapter: number;
  /** Roman, because the map on the wall has them in Roman. */
  readonly numeral: string;
  readonly name: string;
  /** One line of place, under the chapter's name. */
  readonly tagline: string;
  readonly zoneId: ZoneId;
  readonly boss: CampaignBossDef;
}

/**
 * The ten chapters.
 *
 * Bosses cycle the three signature shapes — swarm, siphon, hardening — twice each across the first
 * six chapters and then in rising strength, so the mechanic that ends chapter nine is one the
 * player met and survived in chapter three.
 */
export const CHAPTERS: readonly CampaignChapterDef[] = [
  {
    chapter: 1,
    numeral: 'I',
    name: 'The Whispering Woods',
    tagline: 'The first mile out of the gate, and already nobody walks it after dark.',
    zoneId: 'whispering-woods',
    boss: {
      id: 'the-hollow-stag',
      name: 'The Hollow Stag',
      archetypeId: 'tank',
      flavor: 'Twelve points of antler and nothing at all behind the eyes.',
      signature: {
        label: 'The Rut',
        explainer:
          'Every third round it lowers its head and comes at you straight. Armour is not the answer; ending it is.',
        proc: { kind: 'swarm-call', everyRounds: 3, damageShare: 0.4 },
      },
    },
  },
  {
    chapter: 2,
    numeral: 'II',
    name: "Miller's Fields",
    tagline: 'Good soil, bad harvest. Something has been at the scarecrows.',
    zoneId: 'millers-fields',
    boss: {
      id: 'old-thresher',
      name: 'Old Thresher',
      archetypeId: 'tank',
      flavor: 'It was a mill wheel once. It still turns, and it still takes fingers.',
      signature: {
        label: 'Winnowing',
        explainer:
          'It grinds a little harder every round and never tires. Long fights belong to Thresher — make it short.',
        proc: { kind: 'hardening', perRound: 0.014, cap: 0.09 },
      },
    },
  },
  {
    chapter: 3,
    numeral: 'III',
    name: "Old King's Road",
    tagline: 'Paved by a king nobody can name, and taxed by everyone since.',
    zoneId: 'old-kings-road',
    boss: {
      id: 'the-toll-warden',
      name: 'The Toll-Warden',
      archetypeId: 'tank',
      flavor: 'Has collected on this road for ninety years. Was not appointed.',
      signature: {
        label: "The Warden's Due",
        explainer:
          'Every blow it lands, it keeps a little of. Out-damage the tithe or the fight never ends.',
        proc: { kind: 'siphon', healShare: 0.05 },
      },
    },
  },
  {
    chapter: 4,
    numeral: 'IV',
    name: 'Fogmoor Marsh',
    tagline: 'The road gives up here. What is left is planks and faith.',
    zoneId: 'fogmoor-marsh',
    boss: {
      id: 'mother-bogwillow',
      name: 'Mother Bogwillow',
      archetypeId: 'tank',
      flavor: 'Roots in four counties. Opinions about all of them.',
      signature: {
        label: 'The Fen Answers',
        explainer:
          'Every third round the marsh itself takes a swing. There is nothing to block — there is only being quicker.',
        proc: { kind: 'swarm-call', everyRounds: 3, damageShare: 0.62 },
      },
    },
  },
  {
    chapter: 5,
    numeral: 'V',
    name: 'Thornhill Ruins',
    tagline: 'A town that burned so thoroughly the briars came back first.',
    zoneId: 'thornhill-ruins',
    boss: {
      id: 'the-last-magistrate',
      name: 'The Last Magistrate',
      archetypeId: 'tank',
      flavor: 'Still holding court. Still finding everyone guilty.',
      signature: {
        label: 'Sentencing',
        explainer:
          'It settles into the fight and gets harder to hurt with every round it survives. Do not let it settle.',
        proc: { kind: 'hardening', perRound: 0.018, cap: 0.14 },
      },
    },
  },
  {
    chapter: 6,
    numeral: 'VI',
    name: 'Silverpine Pass',
    tagline: 'Thin air, thin trees, and a long way down on the left.',
    zoneId: 'silverpine-pass',
    boss: {
      id: 'the-pale-outrider',
      name: 'The Pale Outrider',
      archetypeId: 'tank',
      flavor: 'Armoured against a winter that ended nine hundred years ago. Still riding.',
      signature: {
        label: 'Cold Draught',
        explainer:
          'Every wound it opens warms it, and the pass is long. A slow fight here is a fight you are losing.',
        proc: { kind: 'siphon', healShare: 0.07 },
      },
    },
  },
  {
    chapter: 7,
    numeral: 'VII',
    name: 'The Ember Caves',
    tagline: 'Warm all winter. That is the whole of the good news.',
    zoneId: 'ember-caves',
    boss: {
      id: 'cinderjaw',
      name: 'Cinderjaw',
      archetypeId: 'bruiser',
      flavor: 'Sleeps in the vent and wakes up hungry, which is most of the time.',
      signature: {
        label: 'Backdraught',
        explainer:
          'Every third round the cave breathes out with it. Standing still is the only way to be caught by it.',
        proc: { kind: 'swarm-call', everyRounds: 3, damageShare: 0.8 },
      },
    },
  },
  {
    chapter: 8,
    numeral: 'VIII',
    name: 'Gloomhollow',
    tagline: 'A valley the sun agreed to skip. Nobody remembers agreeing.',
    zoneId: 'gloomhollow',
    boss: {
      id: 'the-quiet-shepherd',
      name: 'The Quiet Shepherd',
      archetypeId: 'bruiser',
      flavor: 'Counts a flock that has not existed for a hundred years. Counts you too.',
      signature: {
        label: 'The Long Count',
        explainer:
          'It hardens as it counts, and it is patient. Every round you spend is a round it spends better.',
        proc: { kind: 'hardening', perRound: 0.02, cap: 0.17 },
      },
    },
  },
  {
    chapter: 9,
    numeral: 'IX',
    name: 'The Sunken Chapel',
    tagline: 'Consecrated ground, six feet under standing water.',
    zoneId: 'sunken-chapel',
    boss: {
      id: 'the-drowned-choir',
      name: 'The Drowned Choir',
      archetypeId: 'bruiser',
      flavor: 'Nine voices. One of them is still trying to warn you.',
      signature: {
        label: 'The Ninth Voice',
        explainer:
          'Every third round all nine sing at once, and the water carries it. There is nothing to parry in a chord.',
        proc: { kind: 'swarm-call', everyRounds: 3, damageShare: 0.45 },
      },
    },
  },
  {
    chapter: 10,
    numeral: 'X',
    name: 'Frostfell Ridge',
    tagline: 'The end of the road, and the road knew it before you did.',
    zoneId: 'frostfell-ridge',
    boss: {
      id: 'the-white-between',
      name: 'The White Between',
      archetypeId: 'bruiser',
      flavor: 'Not a beast. A weather front with intentions.',
      signature: {
        label: 'Whiteout',
        explainer:
          'Every third round the ridge itself comes down on you, and it is not aiming. Finish it before the third.',
        proc: { kind: 'swarm-call', everyRounds: 3, damageShare: 0.55 },
      },
    },
  },
];

export const CHAPTERS_BY_NUMBER: Readonly<Record<number, CampaignChapterDef>> = Object.fromEntries(
  CHAPTERS.map((entry) => [entry.chapter, entry]),
);

/* ── Reading a stage number ───────────────────────────────────────────────────────── */

/** Stages are numbered 1…120 across the whole road; the chapter is derived, never stored. */
export function chapterOf(stage: number): number {
  return Math.floor((stage - 1) / STAGES_PER_CHAPTER) + 1;
}

/** Which of the twelve this is, 1…12. */
export function stepOf(stage: number): number {
  return ((stage - 1) % STAGES_PER_CHAPTER) + 1;
}

export function isBossStage(stage: number): boolean {
  return stepOf(stage) === STAGES_PER_CHAPTER;
}

export function isValidStage(stage: number): boolean {
  return Number.isInteger(stage) && stage >= 1 && stage <= TOTAL_STAGES;
}

/** The first stage of a chapter, for the row the screen draws. */
export function firstStageOf(chapter: number): number {
  return (chapter - 1) * STAGES_PER_CHAPTER + 1;
}

/**
 * The level of the monster on a stage.
 *
 * Linear inside the chapter between its declared first and last level, with the boss always at the
 * last. Rounded, so several early stages share a level — which is what `stageBudget` is for.
 */
export function stageLevel(stage: number): number {
  const chapter = chapterOf(stage);
  const band = CHAPTER_LEVELS[chapter - 1];
  if (!band) return 1;

  const [first, last] = band;
  const step = stepOf(stage);
  const share = (step - 1) / (STAGES_PER_CHAPTER - 1);
  return Math.round(first + (last - first) * share);
}

/** A stage's stat budget: rising across its chapter, and a boss on top of that. */
export function stageBudget(stage: number): number {
  if (isBossStage(stage)) return BOSS_BUDGET;

  const share = (stepOf(stage) - 1) / (STAGES_PER_CHAPTER - 1);
  return STAGE_BUDGET_FIRST + (STAGE_BUDGET_LAST - STAGE_BUDGET_FIRST) * share;
}

/**
 * The monster standing on a stage.
 *
 * Drawn from the chapter's zone by walking its roster in order, so the road has the rhythm of a
 * real journey — the same handful of things live here, and you meet them again — rather than 120
 * unrelated names. Bosses are their own definitions and are not in the roster.
 */
export function stageMonster(stage: number): MonsterDef | CampaignBossDef | null {
  if (!isValidStage(stage)) return null;

  const chapter = CHAPTERS_BY_NUMBER[chapterOf(stage)];
  if (!chapter) return null;
  if (isBossStage(stage)) return chapter.boss;

  const roster = monstersInZone(chapter.zoneId);
  if (roster.length === 0) return null;
  return roster[(stepOf(stage) - 1) % roster.length] ?? null;
}

/** Whether the thing on this stage is one of the ten named bosses. */
export function isBoss(entry: MonsterDef | CampaignBossDef): entry is CampaignBossDef {
  return 'signature' in entry;
}
