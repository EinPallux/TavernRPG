import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 acceptance: the app shell.
 *
 * These check the things the style guide makes binding — the frame persists across
 * navigation, gates are visible rather than hidden, preferences survive a reload, motion
 * respects the OS setting, and the layout still works at the minimum supported size.
 */

async function gotoTavern(page: Page) {
  await page.goto('/tavern');
  await expect(page.getByTestId('place-tavern')).toBeVisible();
}

test.describe('navigation', () => {
  test('the root sends you to the tavern', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/tavern$/);
    await expect(page.getByRole('heading', { name: 'The Gilded Tankard' })).toBeVisible();
  });

  test('the rail and HUD persist while the stage swaps', async ({ page }) => {
    await gotoTavern(page);

    const hudGold = page.getByTestId('hud-gold');
    await expect(hudGold).toBeVisible();

    await page.getByTestId('nav-character').click();
    await expect(page).toHaveURL(/\/character$/);
    await expect(page.getByTestId('place-character')).toBeVisible();

    // Same HUD element instance stays mounted — the frame did not reload.
    await expect(hudGold).toBeVisible();
    await expect(page.getByTestId('nav-tavern')).toBeVisible();
  });

  test('every unlocked place opens and marks itself current', async ({ page }) => {
    await gotoTavern(page);

    for (const id of ['character', 'armory', 'facet', 'stables', 'settings']) {
      await page.getByTestId(`nav-${id}`).click();
      await expect(page.getByTestId(`place-${id}`)).toBeVisible();
      await expect(page.getByTestId(`nav-${id}`)).toHaveAttribute('aria-current', 'page');
    }
  });

  test('keepers explain why their rooms are unfinished', async ({ page }) => {
    await page.goto('/armory');
    await expect(page.getByTestId('bark-armory')).toContainText('Shelves are bare');
    await expect(page.getByTestId('place-armory')).toContainText('Phase 7');
  });
});

/** Drives the shell to a given hero level via the dev kit (Phase 2 replaces this with a real hero). */
async function setPreviewLevel(page: Page, level: number) {
  await page.goto('/dev/kit');
  await page.getByTestId('kit-level').fill(String(level));
}

test.describe('feature gates', () => {
  test('a level-1 hero sees later places locked, with their level shown', async ({ page }) => {
    await setPreviewLevel(page, 1);
    await gotoTavern(page);

    const guild = page.getByTestId('nav-guild');
    await expect(guild).toHaveAttribute('data-locked', 'true');
    await expect(guild).toContainText('Lv 10');
    // Rendered as a div, not a link — there is nothing to navigate to.
    expect(await guild.evaluate((node) => node.tagName)).toBe('DIV');

    // The starting places are open from the first minute.
    await expect(page.getByTestId('nav-tavern')).toHaveAttribute('data-locked', 'false');
    await expect(page.getByTestId('nav-character')).toHaveAttribute('data-locked', 'false');
  });

  test('raising the level unlocks places in the rail', async ({ page }) => {
    await setPreviewLevel(page, 1);
    await gotoTavern(page);
    await expect(page.getByTestId('nav-guild')).toHaveAttribute('data-locked', 'true');

    await setPreviewLevel(page, 10);
    await gotoTavern(page);

    const guild = page.getByTestId('nav-guild');
    await expect(guild).toHaveAttribute('data-locked', 'false');
    await guild.click();
    await expect(page.getByTestId('place-guild')).toBeVisible();
  });

  test('the rail teases what opens next', async ({ page }) => {
    await setPreviewLevel(page, 1);
    await gotoTavern(page);
    await expect(page.locator('nav')).toContainText('opens at level');
  });
});

test.describe('preferences persist', () => {
  test('a collapsed rail survives a reload', async ({ page }) => {
    await gotoTavern(page);

    const rail = page.locator('nav[aria-label="Emberhollow"]');
    const widthBefore = (await rail.boundingBox())?.width ?? 0;
    expect(widthBefore).toBeGreaterThan(200);

    await page.getByTestId('nav-toggle').click();
    await expect.poll(async () => (await rail.boundingBox())?.width ?? 0).toBeLessThan(100);

    await page.reload();
    await expect(page.getByTestId('place-tavern')).toBeVisible();
    await expect.poll(async () => (await rail.boundingBox())?.width ?? 0).toBeLessThan(100);
  });
});

test.describe('style rules', () => {
  test('nothing uses a border radius above 4px', async ({ page }) => {
    await gotoTavern(page);

    const offenders = await page.evaluate(() => {
      const bad: string[] = [];
      for (const element of Array.from(document.querySelectorAll('*'))) {
        const style = getComputedStyle(element);
        for (const corner of [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomLeftRadius,
          style.borderBottomRightRadius,
        ]) {
          const px = Number.parseFloat(corner);
          if (Number.isFinite(px) && px > 4) {
            bad.push(`${element.tagName}.${element.className} → ${corner}`);
          }
        }
      }
      return bad.slice(0, 10);
    });

    expect(offenders).toEqual([]);
  });

  test('no serif fonts are used anywhere on the page', async ({ page }) => {
    await gotoTavern(page);

    const serifUsers = await page.evaluate(() => {
      const bad: string[] = [];
      for (const element of Array.from(document.querySelectorAll('*'))) {
        const family = getComputedStyle(element).fontFamily.toLowerCase();
        // Matches "serif" but not "sans-serif".
        if (/(^|[\s,])serif\b/.test(family)) bad.push(`${element.tagName}: ${family}`);
      }
      return bad.slice(0, 5);
    });

    expect(serifUsers).toEqual([]);
  });
});

test.describe('accessibility and resilience', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('reduced motion still delivers the information', async ({ page }) => {
    await gotoTavern(page);

    // Ambient loops are suppressed, but the place and its content are all present.
    await expect(page.getByTestId('place-tavern')).toBeVisible();
    await page.getByTestId('nav-character').click();
    await expect(page.getByTestId('place-character')).toBeVisible();
  });
});

test.describe('minimum supported viewport', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('the shell degrades without horizontal scroll at 1366x768', async ({ page }) => {
    await gotoTavern(page);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);

    await expect(page.getByTestId('hud-vigor')).toBeVisible();
    await expect(page.getByTestId('nav-tavern')).toBeVisible();
  });
});
