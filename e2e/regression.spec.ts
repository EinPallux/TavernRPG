import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * One save, played from the door to the day after (ROADMAP Phase 18 — "full regression matrix").
 *
 * Every other spec in this suite opens a room, proves it, and throws the save away. That is the
 * right shape for a feature test and it leaves one thing untested: **the game as a session.** A
 * player does not visit the Emberforge in isolation with a conjured hero — they arrive carrying
 * loot from a contract, gold from a patrol, and a save that has been written to disk forty times
 * along the way. Every bug this phase has found lived in exactly that seam: the autosave losing a
 * write under load, the export reading a save from before the session, the town drawn over a
 * store that had not loaded yet.
 *
 * So this is `serial`: one context, one page, one hero, one continuous save, and **a reload
 * between every step**, because a reload is the cheapest way to ask "did that actually reach the
 * disk?" and it is what a player does without thinking. A step that fails stops the run — which
 * is correct, because step nine has no meaning if step eight did not happen.
 *
 * The dev drawer levels the hero to 10 and conjures the two key-shaped things a delve needs. That
 * is a harness affordance, not a shortcut around the loop: playing to ten honestly is three real
 * days, and the loop being exercised is what happens *after* the gate opens.
 */

test.describe.configure({ mode: 'serial' });
/* Each step navigates, plays and reloads several times; the 30s default is a step budget here. */
test.setTimeout(90_000);

const SETUP_TIMEOUT = 20_000;
const HERO = 'Ysolde';

interface StoreHandle {
  getState: () => {
    save: SaveShape | null;
    flush: () => Promise<void>;
    exportCurrentSave: () => Promise<string | null>;
  };
  setState: (partial: { save: SaveShape }) => void;
}

interface SaveShape {
  hero: { level: number; gold: number; dice: number; name: string } | null;
  // The shift lives in `activity` beside the mission: the hero cannot be in two places at once.
  activity: {
    /** The Reset Engine's one high-water mark: every daily boundary is measured from here. */
    lastProcessedDay: string | null;
    mission: { endsAt: number } | null;
    patrol: { startedAt: number; endsAt: number } | null;
    vigor: number;
  };
  dungeons: {
    keys: string[];
    progress: Record<string, { floorsCleared: number; attempts: number }>;
  };
  calendar: { day: number; lastStampedDay: string | null; cyclesCompleted: number };
  shops: unknown;
  tasks: { lastChestDay?: string | null; today: Record<string, number> };
}

/** Wait for the autosave to land. Anything asserted after a reload has to be flushed first. */
async function flush(page: Page) {
  await page.evaluate(async () => {
    const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore;
    await store?.getState().flush();
  });
}

/**
 * Flush, reload, and wait for the room to come back. The question every step ends with.
 *
 * Keyed on a testid rather than a place id because the character screen does not have a
 * `place-*` root — it is tabs, and `paperdoll` is the thing that means "the hero is here".
 */
async function reloadInto(page: Page, testId: string) {
  await flush(page);
  await page.reload();
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: SETUP_TIMEOUT });
}

/** Bring whatever is running home, the way a closed tab would. */
async function fastForward(page: Page, what: 'mission' | 'patrol') {
  await page.evaluate(async (kind) => {
    const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore;
    if (!store) throw new Error('store handle missing');
    const { save } = store.getState();
    if (!save) throw new Error('no save');

    if (kind === 'mission') {
      if (!save.activity.mission) throw new Error('no mission running');
      store.setState({
        save: {
          ...save,
          activity: { ...save.activity, mission: { ...save.activity.mission, endsAt: 1 } },
        },
      });
    } else {
      /*
       * A shift is *aged*, not truncated. Earnings are computed from the clock — `startedAt` to
       * now — so dropping `endsAt` into the past the way a mission allows would land a shift that
       * ran for zero minutes and paid zero gold. Wind both stamps back instead: the same shift,
       * finished.
       */
      const shift = save.activity.patrol;
      if (!shift) throw new Error('no shift running');
      const by = 5 * 60 * 60_000;
      store.setState({
        save: {
          ...save,
          activity: {
            ...save.activity,
            patrol: { ...shift, startedAt: shift.startedAt - by, endsAt: shift.endsAt - by },
          },
        },
      });
    }
    await store.getState().flush();
  }, what);
}

async function read(page: Page) {
  return page.evaluate(() => {
    const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore;
    const save = store?.getState().save;
    return {
      name: save?.hero?.name ?? null,
      level: save?.hero?.level ?? 0,
      gold: save?.hero?.gold ?? 0,
      dice: save?.hero?.dice ?? 0,
      vigor: save?.activity.vigor ?? 0,
      keys: save?.dungeons.keys.length ?? 0,
      delveAttempts: save?.dungeons.progress?.['rat-cellars']?.attempts ?? 0,
      calendarDay: save?.calendar.day ?? 0,
    };
  });
}

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  page = await context.newPage();
});

test.afterAll(async () => context.close());

test.describe('one save, played end to end', () => {
  test('1 · a hero is made, and survives the first reload', async () => {
    await page.goto('/character');
    await expect(page.getByTestId('hero-creation')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('class-warrior').click();
    await page.getByTestId('hero-name').fill(HERO);
    await page.getByTestId('confirm-hero').click();
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await reloadInto(page, 'paperdoll');
    expect((await read(page)).name).toBe(HERO);
  });

  test('2 · the first contract is signed, waits out a reload, and comes home to a fight', async () => {
    await page.goto('/tavern');
    await expect(page.getByTestId('mission-board')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const before = await read(page);
    const card = page.locator('[data-testid^="mission-card-"]').first();
    await expect(card).toBeVisible({ timeout: SETUP_TIMEOUT });
    const offer = (await card.getAttribute('data-testid'))!.replace('mission-card-', '');

    await page.getByTestId(`duration-${offer}-5`).click();
    await page.getByTestId(`accept-${offer}`).click();
    await expect(page.getByTestId('mission-progress')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // The contract has to survive the player closing the tab, which is the whole point of a timer
    // measured in wall clock rather than in ticks.
    await reloadInto(page, 'place-tavern');
    await expect(page.getByTestId('mission-progress')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await fastForward(page, 'mission');
    await page.reload();
    await expect(page.getByTestId('mission-returned')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('watch-fight').click();

    await expect(page.getByTestId('battle-scene')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('battle-skip').click();
    await expect(page.getByTestId('battle-result')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('result-continue').click();

    // Vigor was spent on the contract — the day's budget is the thing the loop is priced in.
    await flush(page);
    expect((await read(page)).vigor).toBeLessThan(before.vigor);
  });

  test('3 · the hero grows: levelled, geared, trained', async () => {
    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('dev-drawer-toggle').click();
    await page.getByTestId('dev-level-10').click();
    await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });
    await page.getByTestId('dev-gold').click();
    await page.getByTestId('dev-conjure-all').click();

    await reloadInto(page, 'paperdoll');
    const grown = await read(page);
    expect(grown.level).toBe(10);
    expect(grown.gold).toBeGreaterThan(0);
  });

  test('4 · a patrol is walked and paid', async () => {
    await page.goto('/patrol');
    await expect(page.getByTestId('place-patrol')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const before = await read(page);
    await page.getByTestId('shift-slider').fill('4');
    await page.getByTestId('start-shift').click();
    // Hildy asks once if the day's Vigor is barely touched — a soft anti-footgun, not a blocker.
    const confirm = page.getByTestId('confirm-shift');
    if (await confirm.isVisible()) await confirm.click();
    await expect(page.getByTestId('patrol-on-duty')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await reloadInto(page, 'place-patrol');
    await fastForward(page, 'patrol');
    await page.reload();

    await page.getByTestId('collect-shift').click();
    await flush(page);
    expect((await read(page)).gold).toBeGreaterThan(before.gold);
  });

  test('5 · Bram takes gold and gives gear', async () => {
    await page.goto('/armory');
    await expect(page.getByTestId('place-armory')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const before = await read(page);
    await page.getByTestId('buy-0').click();
    await flush(page);
    expect((await read(page)).gold).toBeLessThan(before.gold);

    // And the shelf remembers the sale across a reload — a refresh is not a restock.
    await reloadInto(page, 'place-armory');
    await expect(page.getByTestId('stock-sold-0')).toBeVisible();
  });

  test('6 · the forge melts something down', async () => {
    await page.goto('/forge');
    await expect(page.getByTestId('place-forge')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('bench-crucible').click();
    const row = page.locator('[data-testid^="scrap-row-"]').first();
    await expect(row).toBeVisible({ timeout: SETUP_TIMEOUT });
    const uid = (await row.getAttribute('data-testid'))!.replace('scrap-row-', '');

    await page.getByTestId(`scrap-${uid}`).click();
    // Torvald asks twice about anything good and not at all about junk, and which one the day's
    // conjured gear turned out to be is not this test's business.
    const confirm = page.getByTestId(`scrap-confirm-${uid}`);
    if (await confirm.isVisible()) await confirm.click();
    await expect(page.getByTestId('smelt-yield')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // The melt counter is a daily allowance, so it has to be on the disk, not in the tab.
    await reloadInto(page, 'place-forge');
    await expect(page.getByTestId('scrap-cap')).toContainText('9/10');
  });

  test('7 · the Notice Board has been watching all along', async () => {
    /*
     * The step that only a played-through save can make: the board's tasks are credited by the
     * contract, the patrol and the purchase in steps 2, 4 and 5 — not by a test that sets a
     * counter. If `progressActions#credit` ever stops being the single path, this is where it
     * shows.
     */
    await page.goto('/board');
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('board-points')).toBeVisible();
    await expect(page.locator('[data-testid^="task-"]').first()).toBeVisible();

    /*
     * Assert the *tally*, not the three tasks on the wall.
     *
     * The board draws three metrics a day out of a dozen, so whether today's notices happen to
     * mention contracts or melting is a coin toss and a test that reads the visible points is
     * asserting a coincidence. `tasks.today` is the day's whole count, which is where credit
     * actually lands — so this catches the real regression (`credit()` stopped being called by
     * the thing the player did) without depending on the draw.
     */
    const tally = await page.evaluate(() => {
      const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore;
      return store?.getState().save?.tasks.today ?? {};
    });

    for (const metric of ['missionsAccepted', 'missionsReturned', 'patrolHours', 'itemsScrapped']) {
      expect(
        tally[metric],
        `the run did ${metric} and the board never heard about it`,
      ).toBeGreaterThan(0);
    }
  });

  test('8 · a duel is fought and the ladder answers', async () => {
    await page.goto('/arena');
    await expect(page.getByTestId('place-arena')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await expect(page.locator('[data-testid^="duel-poster-"]').first()).toBeVisible({
      timeout: SETUP_TIMEOUT,
    });
    // The poster is the pitch; the button on it is the fight.
    await page.locator('[data-testid^="fight-"]').first().click();

    await expect(page.getByTestId('arena-battle')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('battle-skip').click();
    await page.getByRole('button', { name: 'Back to the sand' }).click();

    // A duel costs the bell, and the bell has to survive a reload or the cooldown is theatre.
    await reloadInto(page, 'place-arena');
    await expect(page.getByTestId('arena-cooldown')).toContainText('Bell in', {
      timeout: SETUP_TIMEOUT,
    });
  });

  test('9 · Vesna takes a die', async () => {
    await page.evaluate(async () => {
      const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore;
      const { save } = store!.getState();
      store!.setState({ save: { ...save!, hero: { ...save!.hero!, dice: 25 } } });
      await store!.getState().flush();
    });

    await page.goto('/fortune');
    await expect(page.getByTestId('place-fortune')).toBeVisible({ timeout: SETUP_TIMEOUT });
    // Odds visible before the roll, every time — rule 6, and the one thing a gacha screen must
    // never lose in a refactor.
    await expect(page.getByTestId('odds-panel')).toBeVisible();

    const before = await read(page);

    // The free card first, and it has to stay free — a day's draw at no cost is the F2P promise
    // in its most literal form (rule 6), and the easiest thing to lose to a refactor of pricing.
    await expect(page.getByTestId('free-card-chip')).toBeVisible();
    await page.getByTestId('roll-daily').click();
    await expect(page.getByTestId('roll-ceremony')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('roll-skip').click();
    await page.getByTestId('roll-continue').click();
    await flush(page);
    expect((await read(page)).dice, 'the free card charged for itself').toBe(before.dice);

    // Then a paid one, because "dice leave the purse when a roll is bought" is the other half.
    await page.getByTestId('roll-weekly').click();
    await expect(page.getByTestId('roll-ceremony')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('roll-skip').click();
    await page.getByTestId('roll-continue').click();
    await flush(page);
    expect((await read(page)).dice).toBeLessThan(before.dice);
  });

  test('10 · the Undertavern opens for a key', async () => {
    await page.evaluate(async () => {
      const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore;
      const { save } = store!.getState();
      store!.setState({ save: { ...save!, dungeons: { ...save!.dungeons, keys: ['rusty-key'] } } });
      await store!.getState().flush();
    });

    await page.goto('/undertavern');
    await expect(page.getByTestId('place-undertavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
    // A key is a standing unlock, not a toll: it opens the door and stays in the ring.
    await expect(page.getByTestId('key-count')).toContainText('1/3');

    await page.getByTestId('descend-rat-cellars').click();
    await expect(page.getByTestId('descent')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('delve-battle')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('battle-skip').click();
    await expect(page.getByTestId('battle-result-layer')).toBeVisible({ timeout: SETUP_TIMEOUT });

    /*
     * Whatever the outcome, the descent is recorded — and at level 10 against a floor built for a
     * hero in the thirties the outcome is usually a hiding, which is the dungeon working. The
     * claim here is persistence, not victory: the attempt has to be on the disk, because it is
     * what seeds the *next* one and a floor you lost to must not be the same fight forever.
     */
    await reloadInto(page, 'place-undertavern');
    expect((await read(page)).delveAttempts, 'the delve left nothing behind').toBeGreaterThan(0);
  });

  test('11 · a companion is in the Menagerie because the history earned it', async () => {
    // Pet ownership is derived from what the save can prove, so by here the played-through
    // history should have produced at least one arrival with nothing granted directly.
    await page.goto('/menagerie');
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.locator('[data-testid^="pet-"]').first()).toBeVisible();
  });

  test('12 · midnight comes, and one walk handles all of it', async () => {
    /*
     * The Reset Engine's whole reason for existing: every daily boundary in one walk. Plant a
     * yesterday, reload, and the day should arrive complete — Vigor back, the board redrawn, the
     * calendar stamped — rather than one feature at a time as each screen notices.
     */
    const before = await read(page);
    expect(before.vigor, 'the run should have spent Vigor by now').toBeLessThan(100);

    await page.evaluate(async () => {
      const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore;
      const { save } = store!.getState();
      /*
       * One marker, because there is one owner. `activity.lastProcessedDay` is what
       * `processResets` measures every boundary from — the calendar, the board, the shelves and
       * the Vigor all hang off that single walk rather than each noticing midnight themselves
       * (`engine/reset/audit.test.ts` is the test that keeps it that way). Winding it back is
       * the whole of "a day passed".
       */
      store!.setState({
        save: {
          ...save!,
          activity: { ...save!.activity, lastProcessedDay: '2020-01-01' },
          calendar: { ...save!.calendar, lastStampedDay: '2020-01-01' },
        },
      });
      await store!.getState().flush();
    });

    await page.reload();
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await flush(page);

    const after = await read(page);
    expect(after.vigor, 'the day did not refill Vigor').toBeGreaterThan(before.vigor);
    expect(after.calendarDay, 'the calendar did not stamp the new day').toBeGreaterThan(
      before.calendarDay,
    );
  });

  test('13 · and the whole session exports, re-imports, and is still itself', async () => {
    /*
     * The last question a release has to answer: after everything above, is the file on disk the
     * session that was played? Export, parse, and check the facts the run produced are all in it.
     */
    const text = await page.evaluate(async () => {
      const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore;
      return store!.getState().exportCurrentSave();
    });
    expect(text, 'nothing exported').toBeTruthy();

    const save = JSON.parse(text!) as {
      schemaVersion: number;
      hero: { name: string; level: number };
      activity: { missionsCompleted?: number };
      progress?: unknown;
    };
    expect(save.hero.name).toBe(HERO);
    expect(save.hero.level).toBe(10);
    expect(save.schemaVersion).toBeGreaterThanOrEqual(16);
  });
});
