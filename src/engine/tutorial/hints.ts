/**
 * The Next Step hint (tutorial spec §4).
 *
 * **One hint, ever.** Not one per system, not a list, not a badge on every room — a single chip,
 * picked by priority, dismissible. The rule is the whole feature: a game that surfaces five
 * suggestions has told the player nothing, because ranking five suggestions is the work they
 * wanted help with.
 *
 * The order below *is* the ranking, and it is ordered by how time-sensitive each one is rather
 * than by how valuable. A banner that ends tonight beats unspent stat points that will still be
 * unspent tomorrow, even though the stat points are worth more — the chip's job is to catch the
 * thing you would regret missing.
 *
 * Everything here reads the save and nothing writes. Pure module.
 */

import { CHEST_AT } from '@/data/dailyTasks';
import { keyInPlay } from '@/engine/dungeons/keys';
import { isUnlocked } from '@/engine/progression/gates';
import { maxAffordable } from '@/engine/progression/stats';
import { pointsEarned } from '@/engine/board/tasks';
import { tasksFromIds } from '@/engine/board/tasks';
import { classDef } from '@/data/classes';
import type { PlaceId } from '@/data/places';
import type { SaveFile } from '@/engine/save/schema';

export const HINT_IDS = [
  'dungeon-key',
  'chest-ready',
  'free-card',
  'vigor-burning',
  'unspent-gold',
  'bags-full',
  'pet-unfed',
] as const;
export type HintId = (typeof HINT_IDS)[number];

export interface Hint {
  readonly id: HintId;
  readonly text: string;
  /** Where the chip takes you. Always somewhere — a hint with no destination is a notification. */
  readonly place: PlaceId;
}

interface HintRule {
  readonly id: HintId;
  readonly place: PlaceId;
  /** Null when there is nothing to say. */
  readonly check: (save: SaveFile) => string | null;
}

/**
 * `[TUNE]` How much idle gold counts as "unspent".
 *
 * Expressed in *points affordable* rather than in coin, because 5,000 gold is a fortune at level
 * three and a rounding error at forty. Three points is roughly a day's training.
 */
const IDLE_POINTS = 3;

/** Ordered by urgency, most urgent first. The first rule that speaks wins. */
const RULES: readonly HintRule[] = [
  {
    // A key you have not used is the most perishable thing in the list: it is a door standing
    // open that the player does not know about.
    id: 'dungeon-key',
    place: 'undertavern',
    check: (save) => {
      if (!save.hero || !isUnlocked('undertavern', save.hero.level)) return null;
      const waiting = keyInPlay(save.hero.level, save.dungeons.keys);
      return waiting ? `A key you have not turned — ${waiting.name} is open.` : null;
    },
  },
  {
    id: 'chest-ready',
    place: 'board',
    check: (save) => {
      if (!save.hero || !isUnlocked('board', save.hero.level)) return null;
      const points = pointsEarned(tasksFromIds(save.tasks.taskIds), save.tasks.today);
      const unclaimed = points >= CHEST_AT && save.tasks.lastChestDay !== save.tasks.drawnFor;
      return unclaimed ? 'Your notices are struck through. The chest is waiting.' : null;
    },
  },
  {
    id: 'free-card',
    place: 'fortune',
    check: (save) => {
      if (!save.hero || !isUnlocked('fortune', save.hero.level)) return null;
      return save.gacha.freeRollsToday < 1 ? 'Vesna has a card for you, on the house.' : null;
    },
  },
  {
    // Vigor left on the table at the end of the day is the one loss the game cannot undo.
    id: 'vigor-burning',
    place: 'tavern',
    check: (save) =>
      save.activity.vigor >= 60 && !save.activity.mission && !save.activity.pendingMission
        ? 'A day of Vigor and nothing signed for. Midnight takes what is left.'
        : null,
  },
  {
    id: 'unspent-gold',
    place: 'character',
    check: (save) => {
      const hero = save.hero;
      if (!hero) return null;
      const main = classDef(hero.classId).mainStat;
      const affordable = maxAffordable(hero.trained[main], hero.gold).points;
      return affordable >= IDLE_POINTS
        ? `${affordable} points of training you have already paid for.`
        : null;
    },
  },
  {
    id: 'bags-full',
    place: 'armory',
    check: (save) => {
      const hero = save.hero;
      if (!hero || !isUnlocked('armory', hero.level)) return null;
      // The satchel only fills once the backpack has overflowed, so it is the honest signal.
      return hero.satchel.length > 0
        ? `${hero.satchel.length} pieces in the overflow satchel. Bram is buying.`
        : null;
    },
  },
  {
    id: 'pet-unfed',
    place: 'menagerie',
    check: (save) => {
      const hero = save.hero;
      if (!hero || !isUnlocked('menagerie', hero.level)) return null;
      const active = save.pets.activeId;
      if (!active) return null;
      const progress = save.pets.progress[active];
      return save.pets.scraps > 0 && (progress?.fedToday ?? 0) === 0
        ? 'Something in the Menagerie has not eaten today.'
        : null;
    },
  },
];

/**
 * The one hint worth showing, or null.
 *
 * Dismissed hints stay dismissed for the rest of the day — the chip is a nudge, and a nudge you
 * have already declined is a nag. The reset walk clears the list with everything else.
 */
export function nextHint(save: SaveFile): Hint | null {
  if (!save.hero) return null;

  for (const rule of RULES) {
    if (save.tutorial.dismissedHints.includes(rule.id)) continue;
    const text = rule.check(save);
    if (text) return { id: rule.id, text, place: rule.place };
  }
  return null;
}
