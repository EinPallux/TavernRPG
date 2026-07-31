import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 acceptance: the app shell.
 *
 * These check the things the style guide makes binding — the frame persists across
 * navigation, gates are visible rather than hidden, preferences survive a reload, motion
 * respects the OS setting, and the layout still works at the minimum supported size.
 */

/**
 * The town is only reachable once a hero exists — creation is the game's front door as of
 * Phase 2 — so shell tests make one first.
 */
async function ensureHero(page: Page) {
  await page.goto('/character');

  // Wait for the save to load and the app to decide which screen it is on — checking
  // visibility before hydration would always read "not creating" and silently skip.
  const creation = page.getByTestId('hero-creation');
  await expect(creation.or(page.getByTestId('paperdoll'))).toBeVisible();

  if (await creation.isVisible()) {
    await page.getByTestId('class-warrior').click();
    await page.getByTestId('hero-name').fill('Kargath');
    await page.getByTestId('confirm-hero').click();
    await expect(page.getByTestId('paperdoll')).toBeVisible();
    await flush(page);
  }
}

/**
 * Wait for the autosave to reach disk.
 *
 * Every helper here mutates and then navigates, and a navigation reads the save back off disk —
 * so without this the test is racing its own write (CLAUDE.md). It only bites under parallel
 * load, which is exactly when it is hardest to read as a race rather than as a broken room.
 */
async function flush(page: Page) {
  await page.evaluate(async () => {
    const store = (
      window as unknown as { __tavernStore?: { getState: () => { flush: () => Promise<void> } } }
    ).__tavernStore;
    await store?.getState().flush();
  });
}

async function gotoTavern(page: Page) {
  await ensureHero(page);
  await page.goto('/tavern');
  await expect(page.getByTestId('place-tavern')).toBeVisible();
}

/** Levels the hero the real way — awarding XP through the same call missions will use. */
async function levelHeroToTen(page: Page) {
  await page.goto('/character');
  await page.getByTestId('dev-drawer-toggle').click();
  await page.getByTestId('dev-level-10').click();
  await expect(page.getByTestId('hud-level')).toHaveText('10');
  await flush(page);
}

test.describe('navigation', () => {
  test('the root sends you to the tavern', async ({ page }) => {
    await ensureHero(page);
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
    // Character is a built screen as of Phase 2, so the paperdoll is what proves arrival.
    await expect(page.getByTestId('paperdoll')).toBeVisible();

    // Same HUD element instance stays mounted — the frame did not reload.
    await expect(hudGold).toBeVisible();
    await expect(page.getByTestId('nav-tavern')).toBeVisible();
  });

  test('every place opens and marks itself current once unlocked', async ({ page }) => {
    await gotoTavern(page);
    // A fresh hero is level 1, so most of the town is still gated; open it all up first.
    await levelHeroToTen(page);

    // Built rooms and dressed placeholders alike answer to `place-<id>`, so one loop covers
    // the whole rail regardless of which phase each room belongs to.
    for (const id of [
      'tavern',
      'board',
      'fortune',
      'armory',
      'facet',
      'forge',
      'stables',
      'menagerie',
      'patrol',
      'arena',
      'hall',
      'guild',
      'undertavern',
      'settings',
    ]) {
      await page.getByTestId(`nav-${id}`).click();
      await expect(page.getByTestId(`place-${id}`)).toBeVisible();
      await expect(page.getByTestId(`nav-${id}`)).toHaveAttribute('aria-current', 'page');
    }

    // Character is built, so it shows the real thing instead.
    await page.getByTestId('nav-character').click();
    await expect(page.getByTestId('paperdoll')).toBeVisible();
    await expect(page.getByTestId('nav-character')).toHaveAttribute('aria-current', 'page');
  });

  test('an unfinished surface still says so, and says when', async ({ page }) => {
    /*
     * This test walked forward a room at a time as the phases landed — the Armory stood in for it
     * until Phase 7, the Emberforge until Phase 12, Fortune's Table until Phase 13, the Menagerie
     * until Phase 14, the Notice Board until Phase 15, Settings until Phase 17. There is no
     * placeholder *room* left in Emberhollow.
     *
     * What survives is the rule the placeholder system existed for: a surface that does not do
     * everything yet says which phase finishes it. Settings is a working panel with a line at the
     * foot naming what is still coming, and this guards that line until Phase 18 removes it.
     */
    await ensureHero(page);
    await levelHeroToTen(page);

    await page.goto('/settings');
    await expect(page.getByTestId('settings-later')).toContainText('Phase 18');
    await expect(page.getByTestId('settings-later')).toContainText('export and import');
    // No keeper, so no bubble — the room speaks for itself instead of inventing a proprietor.
    await expect(page.getByTestId('bark-settings')).toHaveCount(0);
  });

  test('Settings turns the things it offers', async ({ page }) => {
    await ensureHero(page);
    await page.goto('/settings');

    // The rows that became real in Phase 17. Music is absent unless somebody dropped a file in,
    // which is the documented default — so the panel explains itself rather than greying out.
    await expect(page.getByTestId('row-sfx')).toBeVisible();
    await expect(page.getByTestId('row-motion')).toBeVisible();
    await expect(page.getByTestId('row-speed')).toBeVisible();
    await expect(page.getByTestId('music-absent')).toBeVisible();

    const sfx = page.getByTestId('toggle-sfx');
    await expect(sfx).toHaveAttribute('aria-checked', 'true');
    await sfx.click();
    await expect(sfx).toHaveAttribute('aria-checked', 'false');

    // Settings live in the save, so the choice survives the trip.
    await page.getByTestId('choice-speed-4').click();
    await page.evaluate(async () => {
      await (
        window as unknown as { __tavernStore: { getState: () => { flush: () => Promise<void> } } }
      ).__tavernStore
        .getState()
        .flush();
    });
    await page.reload();
    await expect(page.getByTestId('choice-speed-4')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('toggle-sfx')).toHaveAttribute('aria-checked', 'false');
  });

  test('rooms that have been built show the real thing instead', async ({ page }) => {
    await ensureHero(page);
    await levelHeroToTen(page);

    await page.goto('/armory');
    await expect(page.getByTestId('place-armory')).toBeVisible();
    await expect(page.getByTestId('shop-shelf')).toBeVisible();
    await expect(page.getByTestId('place-armory')).not.toContainText('Phase 7');

    await page.goto('/forge');
    await expect(page.getByTestId('place-forge')).toBeVisible();
    await expect(page.getByTestId('forge-benches')).toBeVisible();
    await expect(page.getByTestId('place-forge')).not.toContainText('Phase 12');

    await page.goto('/menagerie');
    await expect(page.getByTestId('place-menagerie')).toBeVisible();
    await expect(page.getByTestId('pet-stalls')).toBeVisible();
    await expect(page.getByTestId('place-menagerie')).not.toContainText('Phase 14');

    await page.goto('/board');
    await expect(page.getByTestId('place-board')).toBeVisible();
    await expect(page.getByTestId('task-list')).toBeVisible();
    await expect(page.getByTestId('place-board')).not.toContainText('Phase 15');
  });
});

test.describe('feature gates', () => {
  test('a level-1 hero sees later places locked, with their level shown', async ({ page }) => {
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

  test('levelling the hero unlocks places in the rail', async ({ page }) => {
    await gotoTavern(page);
    await expect(page.getByTestId('nav-guild')).toHaveAttribute('data-locked', 'true');

    await levelHeroToTen(page);

    const guild = page.getByTestId('nav-guild');
    await expect(guild).toHaveAttribute('data-locked', 'false');
    await guild.click();
    await expect(page.getByTestId('place-guild')).toBeVisible();
  });

  test('the rail teases what opens next', async ({ page }) => {
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
    await expect(page.getByTestId('paperdoll')).toBeVisible();
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
