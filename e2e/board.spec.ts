import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 15 acceptance: the Notice Board, the ledger and the bookends, from the player's side.
 *
 * The engine tests already prove the draw is feature-aware, that the ledger pauses rather than
 * resets, and that the dice paycheck is one a day. These prove the parts only a browser can: the
 * board **tracks by itself** with no per-task claim button, the chest is **one click and a
 * burst**, a task **links to the room it names**, the ledger **has already stamped itself** by
 * the time you look at it, and an out-of-Vigor tavern **points at tomorrow** instead of going
 * quiet.
 *
 * As everywhere else in this suite, anything that mutates then navigates flushes first: the
 * store's autosave is asynchronous and a reload without a flush is racing its own write.
 */

const SETUP_TIMEOUT = 20_000;

interface StoreHandle {
  getState: () => { save: Save | null; flush: () => Promise<void> };
  setState: (partial: { save: Save }) => void;
}
interface Save {
  hero: { level: number; gold: number; dice: number } | null;
  activity: { vigor: number };
  calendar: { day: number; lastStampedDay: string | null; cyclesCompleted: number };
  tasks: {
    taskIds: string[];
    drawnFor: string | null;
    today: Record<string, number>;
    lifetime: Record<string, number>;
    lastChestDay: string | null;
    lastWeeklyChestWeek: string | null;
    claimsThisWeek: number;
    claimsWeek: string | null;
    totalChests: number;
  };
}

const read = (page: Page) =>
  page.evaluate(() => {
    const handle = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
    const { save } = handle.getState();
    return {
      gold: save?.hero?.gold ?? 0,
      dice: save?.hero?.dice ?? 0,
      taskIds: save?.tasks.taskIds ?? [],
      totalChests: save?.tasks.totalChests ?? 0,
      claimsThisWeek: save?.tasks.claimsThisWeek ?? 0,
      calendarDay: save?.calendar.day ?? 0,
      stampedOn: save?.calendar.lastStampedDay ?? null,
    };
  });

const flush = (page: Page) =>
  page.evaluate(async () => {
    await (window as unknown as { __tavernStore: StoreHandle }).__tavernStore.getState().flush();
  });

/** Credit every metric to a number no task target reaches, so the board reads as cleared. */
const clearTheBoard = (page: Page) =>
  page.evaluate(async () => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const { save } = handle.getState();
    const generous = Object.fromEntries(
      [
        'missions',
        'arenaWins',
        'patrolHours',
        'itemsScrapped',
        'itemsSold',
        'levelsGained',
        'goldDonated',
        'goldTrained',
        'petsFed',
        'dungeonFloors',
        'gachaRolls',
        'itemsForged',
      ].map((metric) => [metric, 99_999]),
    );
    handle.setState({ save: { ...save!, tasks: { ...save!.tasks, today: generous } } });
    await handle.getState().flush();
  });

async function readyHero(page: Page, options: { level?: number; calendarDay?: number } = {}) {
  await page.goto('/character');

  const creation = page.getByTestId('hero-creation');
  const paperdoll = page.getByTestId('paperdoll');
  await expect(creation.or(paperdoll).first()).toBeVisible({ timeout: SETUP_TIMEOUT });
  if (await creation.isVisible()) {
    await page.getByTestId('class-warrior').click();
    await page.getByTestId('hero-name').fill('Ysolde');
    await expect(page.getByTestId('confirm-hero')).toBeEnabled({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('confirm-hero').click();
  }
  await expect(paperdoll).toBeVisible({ timeout: SETUP_TIMEOUT });

  await page.getByTestId('dev-drawer-toggle').click();
  await page.getByTestId('dev-level-10').click();
  await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });

  await page.evaluate(
    async (seed) => {
      const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
      const { save } = handle.getState();
      if (!save?.hero) throw new Error('no hero');

      handle.setState({
        save: {
          ...save,
          hero: { ...save.hero, level: seed.level, gold: 250_000 },
          // A ledger part-way through, stamped on a day long past, so today's visit marks it.
          calendar: {
            day: seed.calendarDay,
            lastStampedDay: seed.calendarDay > 0 ? '2020-01-01' : null,
            cyclesCompleted: 0,
          },
        },
      });
      await handle.getState().flush();
    },
    { level: options.level ?? 14, calendarDay: options.calendarDay ?? 0 },
  );
}

test.describe('the notices', () => {
  test('pins up three, tracks them itself, and links to the rooms they name', async ({ page }) => {
    await readyHero(page);
    await page.goto('/board');
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const tasks = page.locator('[data-testid^="task-"][data-complete]');
    await expect(tasks).toHaveCount(3);

    // 40/30/30 across the three slots, adding up to the chest exactly.
    const points = await page.locator('[data-testid^="task-points-"]').allTextContents();
    expect(points).toEqual(['40 pts', '30 pts', '30 pts']);
    await expect(page.getByTestId('board-points')).toContainText('0 of 100');

    // No per-task claim button anywhere: tasks auto-track, and the one claim is the chest.
    await expect(page.locator('[data-testid^="task-claim-"]')).toHaveCount(0);

    // Each unfinished notice is one click from the room it sends you to.
    const first = tasks.first();
    const id = (await first.getAttribute('data-testid'))!.replace('task-', '');
    await expect(page.getByTestId(`task-go-${id}`)).toBeVisible();
  });

  test('fills the meters and the chest as the work lands', async ({ page }) => {
    await readyHero(page);
    await page.goto('/board');
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await expect(page.getByTestId('claim-daily')).toBeDisabled();
    await clearTheBoard(page);
    await page.reload();
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await expect(page.getByTestId('board-points')).toContainText('100 of 100');
    await expect(page.locator('[data-testid^="task-"][data-complete="true"]')).toHaveCount(3);
    await expect(page.getByTestId('claim-daily')).toBeEnabled();
  });
});

test.describe('the chest', () => {
  test('pays a die and a burst, once', async ({ page }) => {
    await readyHero(page);
    await page.goto('/board');
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await clearTheBoard(page);
    await page.reload();
    await expect(page.getByTestId('claim-daily')).toBeEnabled({ timeout: SETUP_TIMEOUT });

    const before = await read(page);
    await page.getByTestId('claim-daily').click();

    // The one claim moment in the room, and it is a burst rather than a toast.
    await expect(page.getByTestId('daily-burst')).toBeVisible();
    await expect(page.getByTestId('daily-burst')).toContainText('The chest is yours');

    const after = await read(page);
    expect(after.dice).toBe(before.dice + 1);
    expect(after.gold).toBeGreaterThan(before.gold);
    expect(after.totalChests).toBe(1);
    expect(after.claimsThisWeek).toBe(1);

    // A second claim is refused, and says why rather than going dead.
    await expect(page.getByTestId('claim-daily')).toBeDisabled();
    await expect(page.getByTestId('claim-daily')).toHaveAttribute('data-reason', /Claimed/);
  });

  test('survives a reload without paying twice', async ({ page }) => {
    await readyHero(page);
    await page.goto('/board');
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await clearTheBoard(page);
    await page.reload();
    await expect(page.getByTestId('claim-daily')).toBeEnabled({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('claim-daily').click();
    await expect(page.getByTestId('daily-burst')).toBeVisible();
    const after = await read(page);

    await flush(page);
    await page.reload();
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // The high-water mark is what makes this true. A reload is not a second chest.
    const reloaded = await read(page);
    expect(reloaded.dice).toBe(after.dice);
    expect(reloaded.totalChests).toBe(1);
    await expect(page.getByTestId('claim-daily')).toBeDisabled();
  });

  test('shows the weekly ladder as rungs, and holds it until all seven', async ({ page }) => {
    await readyHero(page);
    await page.goto('/board');
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const rungs = page.getByTestId('weekly-rungs').locator('> *');
    await expect(rungs).toHaveCount(7);
    await expect(rungs.filter({ has: page.locator('[data-filled="true"]') })).toHaveCount(0);

    await expect(page.getByTestId('claim-weekly')).toBeDisabled();
    await expect(page.getByTestId('claim-weekly')).toHaveAttribute(
      'data-reason',
      /7 more daily chests/,
    );
  });
});

test.describe('the ledger', () => {
  test('has already marked today by the time you look at it', async ({ page }) => {
    await readyHero(page, { calendarDay: 12 });
    await page.goto('/board');
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // The stamp landed inside the reset walk, not on a button — there is no button.
    const state = await read(page);
    expect(state.calendarDay).toBe(13);
    expect(state.stampedOn).not.toBe('2020-01-01');

    await page.getByTestId('board-tab-ledger').click();
    await expect(page.getByTestId('ledger-grid')).toBeVisible();
    await expect(page.locator('[data-testid^="ledger-day-"]')).toHaveCount(28);
    await expect(page.locator('[data-testid^="ledger-day-"][data-stamped="true"]')).toHaveCount(13);
    await expect(page.getByTestId('next-milestone')).toContainText('Day 14');
  });

  test('says out loud that missing a day pauses rather than resets', async ({ page }) => {
    await readyHero(page, { calendarDay: 19 });
    await page.goto('/board');
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('board-tab-ledger').click();

    await expect(page.getByTestId('ledger-grid')).toBeVisible();
    // The rule the player has to be able to read, not infer from a number that did not drop.
    await expect(page.getByTestId('place-board')).toContainText('pauses the ledger');
    await expect(page.getByTestId('place-board')).toContainText('never resets');
  });

  test('keeps the marks across a reload — the day is remembered, not the visit', async ({
    page,
  }) => {
    await readyHero(page, { calendarDay: 5 });
    await page.goto('/board');
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });
    expect((await read(page)).calendarDay).toBe(6);

    await flush(page);
    await page.reload();
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });
    // One stamp a day. A reload must not advance the ledger.
    expect((await read(page)).calendarDay).toBe(6);
  });
});

test.describe('the rail', () => {
  test('dots the Notice Board when a chest is waiting, and clears it once claimed', async ({
    page,
  }) => {
    await readyHero(page);
    await page.goto('/board');
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('nav-dot-board')).toHaveCount(0);

    await clearTheBoard(page);
    await page.reload();
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('nav-dot-board')).toBeVisible();

    await page.getByTestId('claim-daily').click();
    await expect(page.getByTestId('daily-burst')).toBeVisible();
    await expect(page.getByTestId('nav-dot-board')).toHaveCount(0);
  });
});

test.describe('the wind-down', () => {
  test('points at tonight and at tomorrow instead of going quiet', async ({ page }) => {
    await readyHero(page);
    await page.evaluate(async () => {
      const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
      const { save } = handle.getState();
      handle.setState({ save: { ...save!, activity: { ...save!.activity, vigor: 0 } } });
      await handle.getState().flush();
    });

    await page.goto('/tavern');
    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const panel = page.getByTestId('wind-down');
    await expect(panel).toBeVisible();
    // Something to do tonight...
    await expect(page.getByTestId('wind-down-patrol')).toBeVisible();
    // ...and three things waiting at dawn, plus the countdown to them.
    await expect(page.getByTestId('tomorrow-preview')).toContainText('Vigor');
    await expect(page.getByTestId('tomorrow-preview')).toContainText('Ledger day');
    await expect(page.getByTestId('wind-down-timer')).toBeVisible();
  });

  test('stays out of the way while there is still Vigor to spend', async ({ page }) => {
    await readyHero(page);
    await page.goto('/tavern');
    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('wind-down')).toHaveCount(0);
  });
});
