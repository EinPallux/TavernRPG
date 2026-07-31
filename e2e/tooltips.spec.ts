import { expect, test, type Page } from '@playwright/test';

/**
 * The game's tooltips, in a real browser (style guide §8.1).
 *
 * Two things only a browser settles. **One:** that the thing actually appears where a player put
 * their cursor, out from under every `clip-path` and `overflow` in the chain — which is the bug
 * that ate the town map's plaques and which no unit test can see. **Two:** that no native `title`
 * survives anywhere a player will hover, since a browser tooltip renders identically whether it
 * was deliberate or forgotten.
 *
 * `tooltips.test.ts` already reads the source for `title=`; this checks the *rendered* DOM, which
 * catches a `title` arriving from somewhere the source scan cannot see — a library, a spread prop,
 * an SVG attribute.
 */

const SETUP_TIMEOUT = 20_000;

async function flush(page: Page) {
  await page.evaluate(async () => {
    const store = (
      window as unknown as { __tavernStore?: { getState: () => { flush: () => Promise<void> } } }
    ).__tavernStore;
    await store?.getState().flush();
  });
}

async function makeHero(page: Page) {
  await page.goto('/character');
  const creation = page.getByTestId('hero-creation');
  await expect(creation.or(page.getByTestId('paperdoll'))).toBeVisible({ timeout: SETUP_TIMEOUT });
  if (await creation.isVisible()) {
    await page.getByTestId('class-warrior').click();
    await page.getByTestId('hero-name').fill('Tipwalker');
    await page.getByTestId('confirm-hero').click();
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await flush(page);
  }
}

/** Open the whole town, so the "no native tooltips" sweep visits rooms rather than locked doors. */
async function levelToTen(page: Page) {
  await page.goto('/character');
  await page.getByTestId('dev-drawer-toggle').click();
  await page.getByTestId('dev-level-10').click();
  await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });
  await flush(page);
}

test.describe('tooltips', () => {
  test.beforeEach(async ({ page }) => makeHero(page));

  test('a HUD chip explains itself on hover, and stops when you leave', async ({ page }) => {
    const tip = page.getByTestId('tooltip');
    await expect(tip).toHaveCount(0);

    await page.getByTestId('hud-gold').hover();
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Gold');

    await page.getByTestId('place-tavern').or(page.getByTestId('paperdoll')).first().hover();
    await expect(tip).toHaveCount(0);
  });

  test('it is drawn where the cursor is, and inside the window', async ({ page }) => {
    /*
     * The assertion the whole component exists for.
     *
     * A tooltip is only useful if it appears *next to the thing* — and the two ways that silently
     * fails are a clipping ancestor (nothing renders at all) and a position measured against the
     * wrong box (it renders in the corner). Both look like "no tooltip" to a test that only asks
     * whether it is visible, so this measures the two rectangles against each other.
     */
    const trigger = page.getByTestId('hud-vigor');
    await trigger.hover();

    const tip = page.getByTestId('tooltip');
    await expect(tip).toBeVisible();

    const anchor = (await trigger.boundingBox())!;
    const box = (await tip.boundingBox())!;
    const viewport = page.viewportSize()!;

    expect(box.width, 'the tooltip has no size').toBeGreaterThan(40);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    // Below its trigger, and horizontally overlapping it — i.e. attached, not parked.
    expect(box.y).toBeGreaterThanOrEqual(anchor.y + anchor.height - 1);
    expect(box.x).toBeLessThan(anchor.x + anchor.width);
    expect(box.x + box.width).toBeGreaterThan(anchor.x);
  });

  test('the keyboard gets them too, immediately', async ({ page }) => {
    // The whole reason `title` had to go: it is hover-only, so a keyboard player never sees a
    // single explanation in the game.
    await page.getByTestId('nav-tavern').focus();
    await expect(page.getByTestId('tooltip')).toBeVisible();
    await expect(page.getByTestId('tooltip')).toContainText('Gilded Tankard');

    /*
     * Escape shuts it — and shuts the *next* one too.
     *
     * This assertion found a real bug rather than confirming one: creating a hero leaves the
     * cursor sitting wherever the confirm button was, the character screen renders a stat row
     * under it, and that row's 340 ms hover timer was still counting. Escape emptied the store and
     * then the timer fired, so dismissing one tooltip produced another. A dismissal now cancels
     * what is on its way, not only what is open.
     */
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tooltip')).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('tooltip'), 'a pending hover survived Escape').toHaveCount(0);
  });

  test('a locked room says what it costs, from the rail', async ({ page }) => {
    await page.getByTestId('nav-undertavern').hover();
    const tip = page.getByTestId('tooltip');
    await expect(tip).toContainText('Undertavern');
    await expect(tip).toContainText('level 10');
  });

  test('a disabled button explains itself — the tooltip the browser refuses to give you', async ({
    page,
  }) => {
    /*
     * A `disabled` button never fires `click`, but Chromium still fires `pointerenter` on it, so
     * the one control the player cannot use is still able to say why. The other ten tests read the
     * reason off `data-reason` because hovering ten times is slower and racier; this is the one
     * that proves the attribute and the rendered tooltip are the same sentence.
     */
    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // A level-1 hero with starter gold cannot train forever; find a button that has given up.
    const stopped = page.locator('[data-reason]:not([data-reason=""])').first();
    await expect(stopped).toBeVisible({ timeout: SETUP_TIMEOUT });
    const reason = await stopped.getAttribute('data-reason');

    await stopped.hover();
    const tip = page.getByTestId('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(reason!.split(' — ')[0]!);
  });

  test('no native browser tooltip survives anywhere a player will hover', async ({ page }) => {
    await levelToTen(page);
    const rooms = ['/map', '/tavern', '/character', '/board', '/patrol', '/settings'] as const;

    for (const room of rooms) {
      await page.goto(room);
      await expect(
        page.getByTestId(`place-${room.slice(1)}`).or(page.getByTestId('paperdoll')),
      ).toBeVisible({ timeout: SETUP_TIMEOUT });

      const titled = await page.evaluate(() =>
        [...document.querySelectorAll('[title]')].map(
          (node) => `<${node.tagName.toLowerCase()} title="${node.getAttribute('title')}">`,
        ),
      );
      expect(titled, `${room} still renders a native browser tooltip`).toEqual([]);
    }
  });
});
