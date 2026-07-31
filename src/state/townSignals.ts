/**
 * What is waiting for you, per room — read by the nav rail and the town map.
 *
 * Both of those are now "the list of places you can go", drawn two different ways, and a signal
 * that appears on one and not the other is a player missing a companion for a fortnight because
 * they navigate by the map. So the badges live here, once, and the two surfaces render the same
 * answer. (The guild bounty and the forge tile each taught this lesson from the other direction:
 * never let a second screen hold its own copy of a number.)
 *
 * The two shapes are deliberately different. A **badge** is a count that means something —
 * "three companions turned up while you were out" is worth a numeral. A **dot** is a yes: the
 * Notice Board has one chest at a time, so printing "1" beside it is a number pretending to be
 * information.
 *
 * Lives in `state/` rather than `engine/` because it composes reads that already live here, and
 * because it is a presentation question: which of the facts the save already knows deserve a
 * mark on a menu.
 */

import type { PlaceId } from '@/data/places';
import type { DayKey } from '@/engine/clock';
import type { SaveFile } from '@/engine/save/schema';
import { newArrivals } from '@/engine/pets/ownership';
import { boardHasClaim } from './boardActions';

export interface PlaceSignal {
  /** Unattended arrivals waiting in this room. Zero means "draw nothing". */
  readonly badge: number;
  /** Something is claimable in here, and counting it would not tell you more than "yes". */
  readonly dot: boolean;
}

export type TownSignals = Readonly<Partial<Record<PlaceId, PlaceSignal>>>;

const NOTHING: TownSignals = {};

export function townSignals(save: SaveFile | null, today: DayKey): TownSignals {
  if (!save?.hero) return NOTHING;

  const signals: Partial<Record<PlaceId, PlaceSignal>> = {};

  /*
   * Companions arrive *while you are somewhere else* — a floor cleared, a rank held, a hundredth
   * contract run — so without a mark the room only gets visited by players who already suspect.
   */
  const arrivals = newArrivals(save);
  if (arrivals > 0) signals.menagerie = { badge: arrivals, dot: false };

  if (boardHasClaim(save, today)) signals.board = { badge: 0, dot: true };

  return signals;
}
