/**
 * Fortune's Table transition tests.
 *
 * The engine tests prove the table is honest; these prove the *bank* is. Every roll moves
 * currency, and a gacha that miscounts is worse than one that is merely unlucky — so the
 * paranoid cases get their own tests: the free card is genuinely free and genuinely daily, a
 * ten-roll costs ten dice and is ten separate rolls, the track pays each rung once even when a
 * spin steps clean over one, and a duplicate leaves something behind.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { createHero, addItem } from '@/engine/hero/actions';
import { generateSetPiece } from '@/engine/items/generate';
import { createNewSave, type SaveFile } from '@/engine/save/schema';
import { setsForClass } from '@/data/gearSets';
import { MONTHLY_TRACK_STEP, ROLL_DICE_COST, TEN_ROLL_SIZE } from '@/data/banners';
import { activeBanner } from '@/engine/gacha/schedule';
import { bannerToday, freeRollAvailable, pityFor, refreshGachaDay, roll } from './gachaActions';

const NOW = new Date('2026-08-05T10:00:00').getTime();
const TODAY = '2026-08-05';
const SEED = 4242;

function save(
  over: { dice?: number; level?: number; classId?: 'bard' | 'warrior' } = {},
): SaveFile {
  const base = createNewSave({ slot: 1, worldSeed: SEED, now: NOW });
  const hero = createHero({
    name: 'Ysolde',
    classId: over.classId ?? 'bard',
    now: NOW,
    startingGold: 5_000,
    rng: createRng(9, 'starter'),
  });
  return { ...base, hero: { ...hero, level: over.level ?? 30, dice: over.dice ?? 40 } };
}

/** The set the weekly banner is showing this Wednesday. */
function featuredSet() {
  return activeBanner('weekly', TODAY, SEED, 'bard').set!;
}

/** Hand the hero every piece of a set, so the next featured hit has to be a dupe. */
function withCompleteSet(file: SaveFile, setId: string): SaveFile {
  const definition = setsForClass('bard').find((entry) => entry.id === setId)!;
  let hero = file.hero!;
  definition.pieces.forEach((piece, index) => {
    const item = generateSetPiece({
      setId,
      slot: piece.slot,
      level: hero.level,
      rng: createRng(SEED + index, `seed/${piece.slot}`),
    })!;
    hero = addItem(hero, item).hero;
  });
  return { ...file, hero };
}

describe('the free card', () => {
  it('costs nothing, once a day, on the Daily Draw only', () => {
    const start = save({ dice: 3 });
    expect(freeRollAvailable(start)).toBe(true);

    const first = roll(start, { bannerId: 'daily', today: TODAY, now: NOW });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(first.spent).toBe(0);
    expect(first.save.hero!.dice).toBe(3);
    expect(first.save.gacha.freeRollsToday).toBe(1);
    expect(freeRollAvailable(first.save)).toBe(false);

    // The second one that day is a die like any other.
    const second = roll(first.save, { bannerId: 'daily', today: TODAY, now: NOW });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.spent).toBe(ROLL_DICE_COST);
    expect(second.save.hero!.dice).toBe(2);
  });

  it('comes back at midnight, and only through the Reset Engine', () => {
    const start = save();
    const spun = roll(start, { bannerId: 'daily', today: TODAY, now: NOW });
    expect(spun.ok).toBe(true);
    if (!spun.ok) return;

    expect(freeRollAvailable(spun.save)).toBe(false);
    // Nothing in the room reads a date; the boundary owner hands it back.
    expect(freeRollAvailable(refreshGachaDay(spun.save))).toBe(true);
    // And it is a no-op when there is nothing to give back.
    const untouched = refreshGachaDay(start);
    expect(untouched).toBe(start);
  });

  it('refuses a spin the purse cannot pay for, without taking anything', () => {
    const broke = save({ dice: 0 });
    // The free card is still there.
    const free = roll(broke, { bannerId: 'daily', today: TODAY, now: NOW });
    expect(free.ok).toBe(true);
    if (!free.ok) return;

    const paid = roll(free.save, { bannerId: 'weekly', today: TODAY, now: NOW });
    expect(paid.ok).toBe(false);
    if (paid.ok) return;
    expect(paid.refusal).toEqual({ kind: 'insufficient-dice', needed: 1, held: 0 });
  });
});

describe('a ten-roll is ten rolls', () => {
  it('costs ten dice, deals ten cards, and only on the Grand Reading', () => {
    const start = save({ dice: 20 });

    const refused = roll(start, { bannerId: 'weekly', today: TODAY, now: NOW, ten: true });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.refusal.kind).toBe('no-ten-roll');

    const spread = roll(start, { bannerId: 'monthly', today: TODAY, now: NOW, ten: true });
    expect(spread.ok).toBe(true);
    if (!spread.ok) return;

    expect(spread.results).toHaveLength(TEN_ROLL_SIZE);
    expect(spread.spent).toBe(TEN_ROLL_SIZE * ROLL_DICE_COST);
    expect(spread.save.hero!.dice).toBe(10);
    expect(spread.save.gacha.rolls).toBe(TEN_ROLL_SIZE);
    expect(spread.save.gacha.monthlyRolls).toBe(TEN_ROLL_SIZE);
    // Ten cards, ten history lines, newest first.
    expect(spread.save.gacha.history).toHaveLength(TEN_ROLL_SIZE);
  });

  it('refuses when there is nowhere to put ten items, before taking the dice', () => {
    const start = save({ dice: 20 });
    const hero = start.hero!;
    // Fill the backpack and the satchel to the brim.
    const filler = generateSetPiece({
      setId: featuredSet().id,
      slot: 'belt',
      level: hero.level,
      rng: createRng(1, 'filler'),
    })!;
    const full: SaveFile = {
      ...start,
      hero: {
        ...hero,
        backpack: hero.backpack.map(() => ({ ...filler })),
        satchel: Array.from({ length: 5 }, () => ({ ...filler })),
      },
    };

    const spread = roll(full, { bannerId: 'monthly', today: TODAY, now: NOW, ten: true });
    expect(spread.ok).toBe(false);
    if (spread.ok) return;
    expect(spread.refusal.kind).toBe('bags-full');
    expect(full.hero!.dice).toBe(20);
  });
});

describe('the counter and the track', () => {
  it('follows the set rather than the week', () => {
    const start = save({ dice: 60 });
    const set = featuredSet();

    let current = start;
    for (let i = 0; i < 5; i += 1) {
      const spun = roll(current, { bannerId: 'weekly', today: TODAY, now: NOW });
      if (!spun.ok) break;
      current = spun.save;
    }

    expect(current.gacha.weeklyPitySet).toBe(set.id);
    const active = activeBanner('weekly', TODAY, SEED, 'bard');
    const shown = pityFor(current, active);
    expect(shown).not.toBeNull();
    expect(shown!.count).toBe(current.gacha.weeklyPity);
    expect(shown!.of).toBe(20);

    /*
     * A week featuring the *other* set shows zero rather than the banked count. The rolls are
     * not lost — the counter still names the set it belongs to — but claiming "12/20" under a
     * card that will not pay it would be a lie the meter tells for six days.
     */
    const other = setsForClass('bard').find((entry) => entry.id !== set.id)!;
    const elsewhere = { ...active, set: other };
    expect(pityFor(current, elsewhere)!.count).toBe(0);
  });

  it('pays a track rung once, even when a spread steps over it', () => {
    const start = save({ dice: 200 });
    // One roll short of the first rung, with nothing claimed yet.
    const primed: SaveFile = {
      ...start,
      gacha: { ...start.gacha, monthlyRolls: MONTHLY_TRACK_STEP - 5, monthlyPaidThrough: 0 },
    };

    const spread = roll(primed, { bannerId: 'monthly', today: TODAY, now: NOW, ten: true });
    expect(spread.ok).toBe(true);
    if (!spread.ok) return;

    expect(spread.extras.rungs).toHaveLength(1);
    expect(spread.save.gacha.monthlyPaidThrough).toBe(MONTHLY_TRACK_STEP + 5);
    // A recipe rung actually hands over a pattern the forge did not have.
    expect(spread.extras.rungs[0]!.kind).toBe('recipe');
    expect(spread.save.forge.recipes).toHaveLength(1);

    // Rolling again inside the same rung pays nothing more.
    const again = roll(spread.save, { bannerId: 'monthly', today: TODAY, now: NOW });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.extras.rungs).toHaveLength(0);
    expect(again.save.forge.recipes).toHaveLength(1);
  });

  it('hands over the Owl on the second rung, and never twice', () => {
    const start = save({ dice: 400 });
    const primed: SaveFile = {
      ...start,
      gacha: {
        ...start.gacha,
        monthlyRolls: MONTHLY_TRACK_STEP * 2 - 1,
        // Already paid through the first rung: the mark counts *rolls*, not rungs.
        monthlyPaidThrough: MONTHLY_TRACK_STEP,
      },
    };

    const spun = roll(primed, { bannerId: 'monthly', today: TODAY, now: NOW });
    expect(spun.ok).toBe(true);
    if (!spun.ok) return;

    expect(spun.extras.rungs.map((rung) => rung.kind)).toEqual(['pet']);
    expect(spun.save.gacha.pets).toEqual(['owl-of-vesna']);

    // Replaying the same transition from the *already-claimed* state adds nothing — the track
    // is arithmetic on totals, not an increment on a boundary.
    const replay = roll(spun.save, { bannerId: 'monthly', today: TODAY, now: NOW });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.save.gacha.pets).toEqual(['owl-of-vesna']);
  });

  it('pays Starmetal when a recipe rung has nothing left to give', () => {
    const start = save({ dice: 200 });
    const both = setsForClass('bard').map((entry) => entry.id);
    const primed: SaveFile = {
      ...start,
      forge: { ...start.forge, recipes: both },
      gacha: { ...start.gacha, monthlyRolls: MONTHLY_TRACK_STEP - 1, monthlyPaidThrough: 0 },
    };

    const spun = roll(primed, { bannerId: 'monthly', today: TODAY, now: NOW });
    expect(spun.ok).toBe(true);
    if (!spun.ok) return;

    expect(spun.extras.rungs).toHaveLength(1);
    expect(spun.extras.rungs[0]!.granted).toBeNull();
    expect(spun.save.forge.recipes).toEqual(both);
    expect(spun.save.hero!.materials.starmetal).toBeGreaterThan(primed.hero!.materials.starmetal);
  });
});

describe('a duplicate is still a payout', () => {
  it('melts to Starmetal and a shard, and five shards buy a pattern', () => {
    const set = featuredSet();
    const start = withCompleteSet(save({ dice: 200 }), set.id);
    const before = start.hero!.materials.starmetal;

    let current = start;
    let dupes = 0;
    for (let i = 0; i < 150 && dupes < 5; i += 1) {
      const spun = roll(current, { bannerId: 'weekly', today: TODAY, now: NOW });
      if (!spun.ok) break;
      current = spun.save;
      if (spun.results[0]!.reward.kind === 'dupe') dupes += 1;
      if (spun.extras.shardRecipes.length > 0) break;
    }

    expect(dupes).toBeGreaterThan(0);
    expect(current.hero!.materials.starmetal).toBeGreaterThan(before);
    // The shard counter never runs past a recipe's worth without spending it.
    expect(current.gacha.shards).toBeLessThan(5);
  });
});

describe('the ledger', () => {
  it('spends exactly one die a roll and banks exactly one history line', () => {
    let current = save({ dice: 12 });
    const startDice = current.hero!.dice;

    for (let i = 0; i < 10; i += 1) {
      const spun = roll(current, { bannerId: 'weekly', today: TODAY, now: NOW });
      expect(spun.ok).toBe(true);
      if (!spun.ok) return;
      current = spun.save;
    }

    expect(current.hero!.dice).toBe(startDice - 10);
    expect(current.gacha.rolls).toBe(10);
    expect(current.gacha.history).toHaveLength(10);
    expect(current.gacha.history.every((entry) => entry.bannerId === 'weekly')).toBe(true);
    expect(current.gacha.history.every((entry) => entry.free === false)).toBe(true);
  });

  it('caps the history at two hundred, newest first', () => {
    const start = save({ dice: 5 });
    const stuffed: SaveFile = {
      ...start,
      gacha: {
        ...start.gacha,
        history: Array.from({ length: 200 }, (_, index) => ({
          at: NOW - index,
          bannerId: 'weekly' as const,
          outcome: 'gold' as const,
          label: `old ${index}`,
          pitied: false,
          free: false,
        })),
      },
    };

    const spun = roll(stuffed, { bannerId: 'daily', today: TODAY, now: NOW });
    expect(spun.ok).toBe(true);
    if (!spun.ok) return;

    expect(spun.save.gacha.history).toHaveLength(200);
    expect(spun.save.gacha.history[0]!.bannerId).toBe('daily');
    expect(spun.save.gacha.history.at(-1)!.label).toBe('old 198');
  });

  it('always has a banner to show, whatever the date', () => {
    const file = save();
    for (const id of ['daily', 'weekly', 'monthly'] as const) {
      const active = bannerToday(file, id, TODAY);
      expect(active).not.toBeNull();
      expect(active!.featuring.length).toBeGreaterThan(0);
      expect(active!.endsAt).toBeGreaterThan(0);
    }
  });
});
