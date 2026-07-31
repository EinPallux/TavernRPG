import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Three characters in one browser (architecture.md §3, USER_QUESTIONS Q2).
 *
 * The engine tests already prove the slots keep their heroes apart and that a switch flushes.
 * These are the claims only a browser can settle: that a player can *find* the second slot, that
 * closing the tab on it brings them back to it rather than to the first hero, and that the town
 * around them changes when they switch — the rail, the HUD and the room all belong to whoever is
 * being played, and a stale one of those is how you spend gold from the wrong purse.
 *
 * Serial, one context: three characters made in sequence is the scenario, and it cannot be split
 * across fresh browsers without testing something else.
 */

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

const SETUP_TIMEOUT = 20_000;

interface StoreHandle {
  getState: () => { slot: number; save: { hero: { name: string } | null } | null };
}

async function flush(page: Page) {
  await page.evaluate(async () => {
    const store = (
      window as unknown as { __tavernStore?: { getState: () => { flush: () => Promise<void> } } }
    ).__tavernStore;
    await store?.getState().flush();
  });
}

/**
 * Make a hero in whatever slot is open.
 *
 * Creation takes the whole screen wherever the player happens to be, so the proof that it worked
 * is that it *goes away* and hands the room back — which is the Settings screen when the slot was
 * chosen from the shelf, and the character screen when the game was opened cold.
 */
async function createHero(page: Page, name: string, klass = 'warrior') {
  await expect(page.getByTestId('hero-creation')).toBeVisible({ timeout: SETUP_TIMEOUT });
  await page.getByTestId(`class-${klass}`).click();
  await page.getByTestId('hero-name').fill(name);
  await page.getByTestId('confirm-hero').click();
  await expect(page.getByTestId('hero-creation')).toHaveCount(0, { timeout: SETUP_TIMEOUT });
  await flush(page);
}

async function openSettings(page: Page) {
  // Flush first: `goto` is a hard navigation and the suite mutates in microseconds where a player
  // takes seconds. `dev-level-10` alone fires nine `grantXp` calls whose writes coalesce over the
  // next few milliseconds, and a page load through the middle of that reads a level from before.
  await flush(page);
  await page.goto('/settings');
  await expect(page.getByTestId('characters-panel')).toBeVisible({ timeout: SETUP_TIMEOUT });
}

const whoAmI = (page: Page) =>
  page.evaluate(() => {
    const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore;
    const state = store?.getState();
    return { slot: state?.slot ?? 0, hero: state?.save?.hero?.name ?? null };
  });

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  page = await context.newPage();
});

test.afterAll(async () => context.close());

test.describe('three save slots', () => {
  test('the first hero lands in slot one, and the shelf says so', async () => {
    await page.goto('/character');
    await createHero(page, 'Ysolde');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await openSettings(page);
    await expect(page.getByTestId('slot-1')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('slot-1')).toContainText('Ysolde');
    await expect(page.getByTestId('slot-1-here')).toBeVisible();

    // The other two are open invitations, not locked doors.
    await expect(page.getByTestId('slot-2')).toHaveAttribute('data-occupied', 'false');
    await expect(page.getByTestId('slot-2-enter')).toHaveText('Create');
    await expect(page.getByTestId('slot-3-enter')).toHaveText('Create');
  });

  test('leaving for an empty slot opens hero creation, not somebody else’s hero', async () => {
    await page.getByTestId('slot-2-enter').click();

    // The shell notices there is nobody here and hands over the creation screen by itself.
    await expect(page.getByTestId('hero-creation')).toBeVisible({ timeout: SETUP_TIMEOUT });
    expect((await whoAmI(page)).slot).toBe(2);

    await createHero(page, 'Kargath', 'mage');
    expect(await whoAmI(page)).toEqual({ slot: 2, hero: 'Kargath' });
  });

  test('the town belongs to whoever is being played', async () => {
    // The HUD is the tell: it is drawn from the live save, so a stale one here would mean the
    // player is looking at one hero and spending another's gold.
    await page.goto('/tavern');
    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('hud-portrait')).toHaveAttribute('aria-label', /Kargath/);

    await openSettings(page);
    await page.getByTestId('slot-1-enter').click();
    await expect(page.getByTestId('slot-1-here')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.goto('/tavern');
    await expect(page.getByTestId('hud-portrait')).toHaveAttribute('aria-label', /Ysolde/);
  });

  test('a third hero fills the shelf', async () => {
    await openSettings(page);
    await page.getByTestId('slot-3-enter').click();
    await createHero(page, 'Brenna', 'bard');

    await openSettings(page);
    for (const [slot, name] of [
      [1, 'Ysolde'],
      [2, 'Kargath'],
      [3, 'Brenna'],
    ] as const) {
      await expect(page.getByTestId(`slot-${slot}`)).toContainText(name);
      await expect(page.getByTestId(`slot-${slot}`)).toHaveAttribute('data-occupied', 'true');
    }
  });

  test('closing the tab comes back to the hero you were playing', async () => {
    /*
     * The bug this exists for: three characters are no use if every reload hands you the first
     * one. The remembered slot lives beside the saves rather than inside one, and this is the
     * only test that can prove it survives a real page load.
     */
    expect((await whoAmI(page)).slot).toBe(3);
    await flush(page);
    await page.reload();
    await expect(page.getByTestId('characters-panel')).toBeVisible({ timeout: SETUP_TIMEOUT });

    expect(await whoAmI(page)).toEqual({ slot: 3, hero: 'Brenna' });
  });

  test('each hero keeps their own progress', async () => {
    // Level one of them and confirm the other two are untouched — separate saves, separate worlds.
    await page.goto('/character');
    await page.getByTestId('dev-drawer-toggle').click();
    await page.getByTestId('dev-level-10').click();
    await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });

    await openSettings(page);
    await expect(page.getByTestId('slot-3')).toContainText('Level 10');
    await expect(page.getByTestId('slot-1')).toContainText('Level 1');
    await expect(page.getByTestId('slot-2')).toContainText('Level 1');
  });

  test('deleting names the hero it is about to destroy', async () => {
    await page.getByTestId('slot-2-delete').click();

    const confirm = page.getByTestId('delete-confirm');
    await expect(confirm).toBeVisible();
    await expect(confirm, 'a confirm that will not say who is not a confirm').toContainText(
      'Kargath',
    );

    // Backing out leaves everything exactly as it was.
    await page.getByTestId('delete-confirm-no').click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId('slot-2')).toContainText('Kargath');
  });

  test('and taking the delete empties the slot without disturbing the others', async () => {
    await page.getByTestId('slot-2-delete').click();
    await page.getByTestId('delete-confirm-yes').click();

    await expect(page.getByTestId('slot-2')).toHaveAttribute('data-occupied', 'false', {
      timeout: SETUP_TIMEOUT,
    });
    await expect(page.getByTestId('slot-2')).toContainText('Empty');

    // Still playing Brenna, and Ysolde is still in slot one.
    expect(await whoAmI(page)).toEqual({ slot: 3, hero: 'Brenna' });
    await expect(page.getByTestId('slot-1')).toContainText('Ysolde');
    await expect(page.getByTestId('slot-3-here')).toBeVisible();
  });

  test('deleting the hero you are playing puts you with another, not nowhere', async () => {
    await page.getByTestId('slot-3-delete').click();
    await page.getByTestId('delete-confirm-yes').click();

    // Ysolde is the last one standing, so that is where the player lands.
    await expect(page.getByTestId('slot-1-here')).toBeVisible({ timeout: SETUP_TIMEOUT });
    expect(await whoAmI(page)).toEqual({ slot: 1, hero: 'Ysolde' });
  });
});
