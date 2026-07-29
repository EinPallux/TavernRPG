import { expect, test } from '@playwright/test';

/**
 * Phase 0 acceptance: the foundation holds across a real browser reload.
 * These assertions are the contract every later phase inherits — state persists,
 * seeded randomness replays identically, and the art/fonts actually serve.
 */

/** Waits until no write is in flight, so a reload can't race an unfinished save. */
async function expectSaved(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved');
}

test.describe('the tavern door', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Each test starts from a clean world so knock counts are predictable.
    await expectSaved(page);
    await page.getByTestId('reset-button').click();
    await expect(page.getByTestId('knock-count')).toHaveText('0');
    await expectSaved(page);
  });

  test('knocks survive a reload (IndexedDB round trip)', async ({ page }) => {
    const count = page.getByTestId('knock-count');
    const knock = page.getByTestId('knock-button');

    await knock.click();
    await knock.click();
    await knock.click();
    await expect(count).toHaveText('3');

    // Force the write rather than waiting out the autosave debounce.
    await page.getByTestId('save-button').click();
    await expect(page.getByTestId('save-button')).toHaveText('Saved');

    await page.reload();
    await expect(count).toHaveText('3');
  });

  test('an unsaved knock is still flushed when the page is hidden', async ({ page }) => {
    await page.getByTestId('knock-button').click();
    await expect(page.getByTestId('knock-count')).toHaveText('1');

    // Simulate the tab being backgrounded/closed without touching "Save now".
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.reload();
    await expect(page.getByTestId('knock-count')).toHaveText('1');
  });

  test('the world seed and its dice replay identically after a reload', async ({ page }) => {
    const seed = await page.getByTestId('world-seed').textContent();
    const dice = await page.getByTestId('seeded-dice').textContent();

    expect(seed).toMatch(/^\d+$/);
    expect(dice).toMatch(/^[1-6] · [1-6] · [1-6]$/);

    await page.reload();

    await expect(page.getByTestId('world-seed')).toHaveText(seed!);
    await expect(page.getByTestId('seeded-dice')).toHaveText(dice!);
  });

  test('starting a new world rolls a different seed and clears progress', async ({ page }) => {
    const firstSeed = await page.getByTestId('world-seed').textContent();
    await page.getByTestId('knock-button').click();
    await expect(page.getByTestId('knock-count')).toHaveText('1');

    await page.getByTestId('reset-button').click();

    await expect(page.getByTestId('knock-count')).toHaveText('0');
    await expect(page.getByTestId('world-seed')).not.toHaveText(firstSeed!);
  });

  test('the stage art and display font are actually served', async ({ page }) => {
    const backdropResponse = await page.request.get('/assets/backgrounds/tavern_background.png');
    expect(backdropResponse.status()).toBe(200);

    const heading = page.getByRole('heading', { name: 'The Gilded Tankard' });
    await expect(heading).toBeVisible();

    // No serif fonts anywhere — a hard product rule (CLAUDE.md).
    const fontFamily = await heading.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toContain('alegreya sans');
    expect(fontFamily.toLowerCase()).not.toMatch(/(^|[^-])serif\b(?!-)/);
  });
});
