import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * The two failures a player can cause without doing anything wrong (ROADMAP Phase 18).
 *
 * **Two tabs.** The autosave was made serial in Phase 8, after a 145 KB save started landing
 * writes out of order and ate a level — but serial *within a tab*. Two tabs each hold a store,
 * each believe they are authoritative, and the second to flush overwrites the first. This has to
 * be tested with two real pages sharing a browser context, because a `BroadcastChannel` between
 * two contexts does not exist and a mock would only prove the mock works.
 *
 * **A room that throws.** Before Phase 18 that unmounted the document: white page, no rail, no way
 * back to a room that renders. `/dev/boom` exists so the boundary has something real to catch.
 */

const SETUP_TIMEOUT = 20_000;

async function makeHero(page: Page) {
  await page.goto('/character');
  const creation = page.getByTestId('hero-creation');
  await expect(creation.or(page.getByTestId('paperdoll'))).toBeVisible({ timeout: SETUP_TIMEOUT });
  if (await creation.isVisible()) {
    await page.getByTestId('class-warrior').click();
    await page.getByTestId('hero-name').fill('Kargath');
    await page.getByTestId('confirm-hero').click();
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
  }
  await page.evaluate(async () => {
    const store = (
      window as unknown as { __tavernStore?: { getState: () => { flush: () => Promise<void> } } }
    ).__tavernStore;
    await store?.getState().flush();
  });
}

test.describe('two tabs on one save', () => {
  let context: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    // One context, two pages — same origin, same IndexedDB, same BroadcastChannel. A player with
    // the game open twice, exactly.
    context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  });

  test.afterEach(async () => context.close());

  test('the second tab steps aside instead of racing the first', async () => {
    const first = await context.newPage();
    await makeHero(first);
    await first.goto('/tavern');
    await expect(first.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const second = await context.newPage();
    await second.goto('/tavern');

    await expect(second.getByTestId('tab-conflict')).toBeVisible({ timeout: SETUP_TIMEOUT });
    // It is watching, not playing: no rail, no room, nothing that could write.
    await expect(second.locator('nav[aria-label="Emberhollow"]')).toHaveCount(0);
    await expect(second.getByTestId('place-tavern')).toHaveCount(0);

    // And the first tab carries on, undisturbed.
    await expect(first.getByTestId('place-tavern')).toBeVisible();
  });

  test('the player can move the save to whichever tab they are looking at', async () => {
    const first = await context.newPage();
    await makeHero(first);
    await first.goto('/tavern');
    await expect(first.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const second = await context.newPage();
    await second.goto('/tavern');
    await expect(second.getByTestId('tab-conflict')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await second.getByTestId('tab-take-over').click();

    // The second tab is the game now...
    await expect(second.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
    // ...and the first steps aside without being closed. Nobody has to hunt for a window.
    await expect(first.getByTestId('tab-conflict')).toBeVisible({ timeout: SETUP_TIMEOUT });
  });

  test('closing the holder hands the save back rather than stranding the other tab', async () => {
    const first = await context.newPage();
    await makeHero(first);
    await first.goto('/tavern');
    await expect(first.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const second = await context.newPage();
    await second.goto('/tavern');
    await expect(second.getByTestId('tab-conflict')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await first.close();

    // A clean close broadcasts a release, so this should be near-immediate rather than waiting
    // out the stale heartbeat.
    await expect(second.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
  });

  test('one tab alone never sees the guard', async () => {
    // The regression that would matter most: a guard that fires on a single tab makes the game
    // unplayable, and it would only show up for players whose browser restores sessions oddly.
    const only = await context.newPage();
    await makeHero(only);
    await only.goto('/tavern');

    await expect(only.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await only.waitForTimeout(1500);
    await expect(only.getByTestId('tab-conflict')).toHaveCount(0);
  });

  test('a reload is not a second tab', async () => {
    // `pagehide` releases on the way out, so the reloaded page must be able to reclaim the save
    // immediately. Getting this wrong makes every refresh look like a conflict.
    const page = await context.newPage();
    await makeHero(page);
    await page.goto('/tavern');
    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.reload();
    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('tab-conflict')).toHaveCount(0);
  });

  test('and the town is never drawn over an unloaded save', async () => {
    /*
     * The cost of the election, and the bug it caused.
     *
     * `claimTabLock` waits 350ms before a tab may claim the save, and the shell used to render
     * the town straight through that window — a room with no hero in it, every screen reading
     * defaults. Settings offered "Export this save" against `save === null`, and a click landing
     * in the gap produced a file named `tavernrpg-hero-slot1.json` holding the save from before
     * the session. Three tests found it by being faster than a person.
     *
     * So: while the tab is electing or the save is still loading, the shell paints nothing. The
     * claim is an *invariant*, not an ordering — "the room exists and the store is not ready" is
     * a state that must never be observable, so sample every frame and count the frames that
     * contradict it. Polling for which of two things happened first cannot answer this when both
     * flip inside one tick; asking "was this ever true?" can.
     */
    const page = await context.newPage();
    await makeHero(page);

    await page.addInitScript(() => {
      const box = globalThis as { __gap?: number; __frames?: number };
      box.__gap = 0;
      box.__frames = 0;
      const sample = () => {
        box.__frames = (box.__frames ?? 0) + 1;
        const store = (globalThis as { __tavernStore?: { getState: () => { status: string } } })
          .__tavernStore;
        const room = document.querySelector('[data-testid^="place-"]');
        if (room && store?.getState().status !== 'ready') box.__gap = (box.__gap ?? 0) + 1;
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await page.goto('/settings');
    await expect(page.getByTestId('place-settings')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const seen = await page.evaluate(() => ({
      gap: (globalThis as { __gap?: number }).__gap ?? -1,
      frames: (globalThis as { __frames?: number }).__frames ?? 0,
    }));
    // A sampler that never ran would report a clean zero, which is the shape of a false pass.
    expect(seen.frames).toBeGreaterThan(5);
    expect(seen.gap, 'the town was drawn over an unloaded save').toBe(0);

    // And the thing the gap actually broke: the export knows whose save it is.
    const download = page.waitForEvent('download');
    await page.getByTestId('export-save').click();
    expect((await download).suggestedFilename()).toContain('kargath');
  });
});

test.describe('a room that throws', () => {
  test('fails inside its own frame, with the town still standing', async ({ page }) => {
    await makeHero(page);
    await page.goto('/dev/boom');
    await expect(page.getByTestId('place-boom')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('dev-boom').click();

    await expect(page.getByTestId('room-error')).toBeVisible();
    // The message is the real one, not a generic apology — whoever is helping needs it.
    await expect(page.getByTestId('room-error-detail')).toContainText('floorboards');

    // The rail and the HUD survived, so this reads as one broken room rather than a broken game.
    await expect(page.locator('nav[aria-label="Emberhollow"]')).toBeVisible();
    await expect(page.getByTestId('hud-vigor')).toBeVisible();
  });

  test('offers a way out that works', async ({ page }) => {
    await makeHero(page);
    await page.goto('/dev/boom');
    await page.getByTestId('dev-boom').click();
    await expect(page.getByTestId('room-error')).toBeVisible();

    await page.getByTestId('room-error-leave').click();
    await expect(page.getByTestId('place-map')).toBeVisible({ timeout: SETUP_TIMEOUT });
  });

  test('does not follow the player to the next room', async ({ page }) => {
    /*
     * A latching boundary is the reason people learn to reload. Re-keying on the pathname means
     * leaving the room clears the error by construction, so there is no reset handler that
     * somebody can forget to call.
     */
    await makeHero(page);
    await page.goto('/dev/boom');
    await page.getByTestId('dev-boom').click();
    await expect(page.getByTestId('room-error')).toBeVisible();

    await page.getByTestId('nav-character').click();
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('room-error')).toHaveCount(0);

    // And going back is a clean room, not the error again.
    await page.goto('/dev/boom');
    await expect(page.getByTestId('place-boom')).toBeVisible();
  });

  test('leaves the save alone', async ({ page }) => {
    await makeHero(page);
    await page.goto('/character');
    await page.getByTestId('dev-drawer-toggle').click();
    await page.getByTestId('dev-level-10').click();
    await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });
    await page.evaluate(async () => {
      await (
        window as unknown as { __tavernStore: { getState: () => { flush: () => Promise<void> } } }
      ).__tavernStore
        .getState()
        .flush();
    });

    await page.goto('/dev/boom');
    await page.getByTestId('dev-boom').click();
    await expect(page.getByTestId('room-error')).toBeVisible();

    await page.reload();
    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('hud-level')).toHaveText('10');
  });
});
