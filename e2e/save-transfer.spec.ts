import { expect, test, type Page } from '@playwright/test';

/**
 * Export and import, round trip (ROADMAP Phase 18, USER_QUESTIONS Q1).
 *
 * There is no cloud and there are no accounts, so a file is the only way a hero leaves this
 * browser — the only insurance against clearing browsing data, and the only way to play on a
 * second machine. That makes this the backup story rather than a power-user feature, and it has
 * to work on a real file through a real file picker, which is the part no unit test reaches.
 *
 * The property under test is *the hero survives the trip*, not "a function returned ok".
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

async function makeHero(page: Page, name: string) {
  await page.goto('/character');
  const creation = page.getByTestId('hero-creation');
  await expect(creation.or(page.getByTestId('paperdoll'))).toBeVisible({ timeout: SETUP_TIMEOUT });
  if (await creation.isVisible()) {
    await page.getByTestId('class-warrior').click();
    await page.getByTestId('hero-name').fill(name);
    await page.getByTestId('confirm-hero').click();
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
  }
  await flush(page);
}

async function exported(page: Page): Promise<string> {
  /*
   * Walk to Settings through the rail, not `page.goto`.
   *
   * A player changes rooms with a client-side route change and the store goes with them. A hard
   * navigation throws the store away and restarts it from disk — which is a different scenario,
   * and specifically the *wrong* one for "the export flushes what is on screen": there is no
   * screen left to flush. `dev-level-10` fires nine `grantXp` calls whose writes coalesce over
   * the next few milliseconds, so a `goto` here races them and reads the save from before.
   */
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('place-settings')).toBeVisible({ timeout: SETUP_TIMEOUT });

  const download = page.waitForEvent('download');
  await page.getByTestId('export-save').click();
  const file = await download;

  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Feed the hidden file input directly — the picker itself is the browser's, not ours. */
async function choose(page: Page, name: string, contents: string) {
  await page.getByTestId('import-file').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(contents, 'utf8'),
  });
}

test.describe('export', () => {
  test('names the file after the hero, and holds the real save', async ({ page }) => {
    await makeHero(page, 'Sigrun Emberhand');
    await page.goto('/settings');
    await expect(page.getByTestId('place-settings')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const download = page.waitForEvent('download');
    await page.getByTestId('export-save').click();
    const file = await download;

    // A folder of `save.json` files is a folder nobody can use.
    expect(file.suggestedFilename()).toContain('sigrun-emberhand');

    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const save = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      schemaVersion: number;
      hero: { name: string };
    };

    expect(save.schemaVersion).toBeGreaterThan(0);
    expect(save.hero.name).toBe('Sigrun Emberhand');
  });

  test('exports what is on screen, not what was last autosaved', async ({ page }) => {
    /*
     * The bug this guards is the one a player only finds on the day they need the file: the
     * autosave is debounced, so an export taken straight after an action would be a save from
     * three actions ago. `exportCurrentSave` flushes first.
     */
    await makeHero(page, 'Kargath');
    await page.goto('/character');
    await page.getByTestId('dev-drawer-toggle').click();
    await page.getByTestId('dev-level-10').click();
    await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });

    // Deliberately no flush — the export has to do it.
    const text = await exported(page);
    expect((JSON.parse(text) as { hero: { level: number } }).hero.level).toBe(10);
  });
});

test.describe('import', () => {
  test('carries a hero from one browser profile to another', async ({ browser }) => {
    // Two contexts is two browsers as far as IndexedDB is concerned — the real scenario.
    const first = await browser.newContext();
    const source = await first.newPage();
    await makeHero(source, 'Vexith');
    await source.goto('/character');
    await source.getByTestId('dev-drawer-toggle').click();
    await source.getByTestId('dev-level-10').click();
    await expect(source.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });
    const file = await exported(source);
    await first.close();

    const second = await browser.newContext();
    const target = await second.newPage();
    await makeHero(target, 'Someone Else');

    await target.goto('/settings');
    await expect(target.getByTestId('place-settings')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await choose(target, 'vexith.json', file);

    // The confirm names both saves — "are you sure?" is not a question anybody can answer.
    await expect(target.getByTestId('import-confirm')).toBeVisible();
    await expect(target.getByTestId('import-outgoing')).toContainText('Someone Else');
    await expect(target.getByTestId('import-incoming')).toContainText('Vexith');

    await target.getByTestId('import-confirm-yes').click();
    await expect(target.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });

    // And it survives the reload, which is the only proof it reached the disk.
    await flush(target);
    await target.reload();
    await target.goto('/character');
    await expect(target.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(target.getByTestId('hud-level')).toHaveText('10');
    await second.close();
  });

  test('changes nothing until the confirm is taken', async ({ page }) => {
    await makeHero(page, 'Brenna');
    const mine = await exported(page);
    const theirs = mine.replace('"Brenna"', '"Not Brenna"');

    await choose(page, 'theirs.json', theirs);
    await expect(page.getByTestId('import-confirm')).toBeVisible();
    await page.getByTestId('import-confirm-no').click();

    await expect(page.getByTestId('import-confirm')).toHaveCount(0);
    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.locator('body')).toContainText('Brenna');
  });

  test('refuses a file that is not a save, with a reason', async ({ page }) => {
    await makeHero(page, 'Kargath');
    await page.goto('/settings');
    await expect(page.getByTestId('place-settings')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await choose(page, 'holiday.jpg.json', 'this is not JSON at all');
    await expect(page.getByTestId('save-message')).toContainText(/not readable/i);
    await expect(page.getByTestId('import-confirm')).toHaveCount(0);

    await choose(page, 'other-game.json', JSON.stringify({ player: { hp: 3 } }));
    await expect(page.getByTestId('save-message')).toContainText(/not a TavernRPG save/i);
    await expect(page.getByTestId('import-confirm')).toHaveCount(0);
  });

  test('says so plainly when the file is from a newer version', async ({ page }) => {
    await makeHero(page, 'Kargath');
    const mine = JSON.parse(await exported(page)) as Record<string, unknown>;

    await choose(page, 'future.json', JSON.stringify({ ...mine, schemaVersion: 99 }));
    await expect(page.getByTestId('save-message')).toContainText(/newer version/i);
    await expect(page.getByTestId('import-confirm')).toHaveCount(0);
  });

  test('accepts an old save and upgrades it on the way in', async ({ page }) => {
    /*
     * The case the whole migration chain exists for, arriving through the front door rather than
     * off the disk: a file exported by a build from months ago.
     */
    await makeHero(page, 'Kargath');
    const current = JSON.parse(await exported(page)) as { worldSeed: number };

    // A genuine v1 save — the oldest format that ever shipped.
    const ancient = {
      schemaVersion: 1,
      savedAt: 1_700_000_000_000,
      slot: 1,
      worldSeed: current.worldSeed,
      clock: { lastSeen: 1_700_000_000_000, clampCount: 0 },
    };

    await choose(page, 'beta.json', JSON.stringify(ancient));
    await expect(page.getByTestId('import-confirm')).toBeVisible();
    await expect(page.getByTestId('import-incoming')).toContainText('no hero yet');

    await page.getByTestId('import-confirm-yes').click();
    // A v1 save had no hero, so the game lands at its front door rather than in the town.
    await expect(page.getByTestId('hero-creation')).toBeVisible({ timeout: SETUP_TIMEOUT });
  });
});
