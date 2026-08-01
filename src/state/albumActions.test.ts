/**
 * The album, from the player's side — and the audit that keeps it one path (album spec §3).
 *
 * The behaviour tests below are ordinary. The last describe is the important one: it reads the
 * source and fails if anything but `recordVictory` writes `album.foes`.
 *
 * That is not paranoia, it is the Phase 15 lesson written down as a test. When the daily loop
 * unified the progress vocabulary it discovered that two of six bounty metrics had *never* been
 * credited from the player's side — not because anybody removed the call, but because the call
 * was never added and nothing could tell. Three call sites that each have to remember is three
 * chances at a page that can never be finished, and the failure is silent in every one of them.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ALBUM_PAGES } from '@/data/album';
import { createHero } from '@/engine/hero/actions';
import { createRng } from '@/engine/rng';
import { createNewSave } from '@/engine/save/schema';
import type { SaveFile } from '@/engine/save/schema';
import { recordVictory } from './albumActions';
import { payoutBonus } from './petActions';

const page = ALBUM_PAGES[0]!;
const foe = page.entries[0]!;

const NOW = 1_785_000_000_000;

const blank = (): SaveFile => createNewSave({ slot: 1, worldSeed: 12_345, now: NOW });

/** The same save with somebody in it — `payoutBonus` has nothing to fold without a hero. */
const withHero = (): SaveFile => {
  const base = blank();
  return {
    ...base,
    hero: createHero({
      name: 'Ysolde Marrow',
      classId: 'warrior',
      now: NOW,
      startingGold: 500,
      rng: createRng(12_345, 'fixture'),
    }),
  };
};

describe('recording a victory', () => {
  it('puts a beaten foe in the book and hands back the whole save', () => {
    const save = blank();
    const { save: next, record } = recordVictory(save, foe.id);

    expect(next.album.foes).toEqual([foe.id]);
    expect(record.added?.name).toBe(foe.name);
    // The rest of the save came through untouched — it is a spread, not a rebuild.
    expect(next.worldSeed).toBe(save.worldSeed);
    expect(next.hero).toBe(save.hero);
  });

  it('returns the identical save when there is nothing to write', () => {
    /*
     * Referential identity, not just equality. The store persists on every transition, and a new
     * object for the hundredth Sootback Boar is a 170 KB write nobody asked for.
     */
    const first = recordVictory(blank(), foe.id).save;
    const again = recordVictory(first, foe.id);

    expect(again.save).toBe(first);
    expect(again.record.added).toBeNull();

    const stranger = recordVictory(first, 'a-rival-hero');
    expect(stranger.save).toBe(first);
  });

  it('reports the page completing so the result screen can make something of it', () => {
    let save = blank();
    const seen: string[] = [];

    for (const entry of page.entries) {
      const outcome = recordVictory(save, entry.id);
      save = outcome.save;
      if (outcome.record.pageCompleted) seen.push(outcome.record.pageCompleted.id);
    }

    expect(seen).toEqual([page.id]);
    expect(save.album.foes).toHaveLength(page.entries.length);
  });
});

describe('the book in the payout fold', () => {
  it('multiplies gold and experience once a page is finished', () => {
    /*
     * `payoutBonus` is the single fold every payout reads, so this is the assertion that the
     * album reaches contracts, the Long Road and the Undertavern at all. Measured as a ratio
     * against the same save with an empty book, so the greenhorn's due and the pet — both of
     * which are also in the fold — cancel instead of having to be reproduced here.
     */
    const empty = withHero();
    const before = payoutBonus(empty);

    const filled: SaveFile = { ...empty, album: { foes: page.entries.map((entry) => entry.id) } };
    const after = payoutBonus(filled);

    expect(after.gold / before.gold).toBeCloseTo(1.01, 10);
    expect(after.xp / before.xp).toBeCloseTo(1.01, 10);
  });
});

/* ── The audit ───────────────────────────────────────────────────────────────────── */

const STATE_DIR = join(process.cwd(), 'src/state');

function sourceFiles(dir: string): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push({ name: entry.name, text: readFileSync(path, 'utf8') });
    }
  }
  return out;
}

const stateFiles = sourceFiles(STATE_DIR);

describe('one path writes the book', () => {
  it('lets only albumActions.ts assign album.foes', () => {
    // Any `album: {` or `foes:` on the write side of a save. `albumActions.ts` is the one owner;
    // everything else must go through it.
    const writers = stateFiles.filter(
      (file) => file.name !== 'albumActions.ts' && /album:\s*\{/.test(file.text),
    );
    expect(writers.map((file) => file.name)).toEqual([]);
  });

  it('records from all three places a monster can be beaten', () => {
    /*
     * The other half of the audit, and the half that catches the *omission*. A missing call is
     * invisible in play: the fight is right, the payout is right, and one page simply never
     * finishes. Missions, delves and the Long Road each call the one path.
     */
    const callers = stateFiles
      .filter((file) => file.text.includes('recordVictory('))
      .map((file) => file.name)
      .sort();

    expect(callers).toEqual([
      'albumActions.ts',
      'campaignActions.ts',
      'dungeonActions.ts',
      'missionActions.ts',
    ]);
  });

  it('hands the record on to the screen rather than swallowing it', () => {
    // A recorded foe nobody is told about is a feature with no feedback. Each of the three
    // transitions returns `album` on its result so the battle screen can say so.
    for (const name of ['campaignActions.ts', 'dungeonActions.ts', 'missionActions.ts']) {
      const file = stateFiles.find((entry) => entry.name === name)!;
      expect(file.text, name).toMatch(/readonly album: AlbumRecord \| null;/);
    }
  });
});
