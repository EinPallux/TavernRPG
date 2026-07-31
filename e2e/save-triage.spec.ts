import { expect, test, type Page } from '@playwright/test';

/**
 * The corrupted-save recovery, end to end (ROADMAP Phase 18).
 *
 * Unit tests prove `readSave` detects damage and `archiveSave` preserves it. This proves the part
 * only a browser can: that a player who opens the game to a broken save *sees* something, and that
 * what they see leads somewhere.
 *
 * The damage is planted directly in IndexedDB rather than through the game, because that is how it
 * actually arrives — a half-finished write, a quota eviction, a browser upgrade. Anything the game
 * itself can produce is by definition a save the game can read.
 */

const SETUP_TIMEOUT = 20_000;

/** Write raw bytes into a slot, bypassing every guard the app has. */
async function plant(page: Page, value: unknown, key = 'slot-1') {
  await page.evaluate(
    async ({ value: bytes, key: at }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('tavernrpg', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('saves');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('saves', 'readwrite');
          tx.objectStore('saves').put(bytes, at);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { value, key },
  );
}

async function keysInStore(page: Page): Promise<string[]> {
  return page.evaluate(
    async () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('tavernrpg', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('saves', 'readonly').objectStore('saves').getAllKeys();
          request.onsuccess = () => {
            resolve(request.result.map(String));
            db.close();
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
}

/** A save the migration chain will refuse: a real version, a shape that is not one. */
const DAMAGED = { schemaVersion: 5, hero: 'not an object', worldSeed: 'also wrong' };

test.describe('a save that will not open', () => {
  test('says so, instead of an empty room', async ({ page }) => {
    // Load once so the database exists, then damage it and come back — the order a player hits.
    await page.goto('/tavern');
    await expect(
      page.getByTestId('hero-creation').or(page.getByTestId('place-tavern')),
    ).toBeVisible({ timeout: SETUP_TIMEOUT });

    await plant(page, DAMAGED);
    await plant(page, DAMAGED, 'slot-1:backup');
    await page.reload();

    await expect(page.getByTestId('save-triage')).toBeVisible({ timeout: SETUP_TIMEOUT });
    // The reason is the migration's own sentence, not a generic apology.
    await expect(page.getByTestId('triage-why')).not.toBeEmpty();
    // And the town is not drawn behind it — every room would be empty.
    await expect(page.locator('nav[aria-label="Emberhollow"]')).toHaveCount(0);
  });

  test('offers the bytes before it offers anything else', async ({ page }) => {
    await page.goto('/tavern');
    await expect(
      page.getByTestId('hero-creation').or(page.getByTestId('place-tavern')),
    ).toBeVisible({ timeout: SETUP_TIMEOUT });
    await plant(page, DAMAGED);
    await plant(page, DAMAGED, 'slot-1:backup');
    await page.reload();
    await expect(page.getByTestId('save-triage')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const download = page.waitForEvent('download');
    await page.getByTestId('triage-export').click();
    const file = await download;

    expect(file.suggestedFilename()).toContain('damaged');
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      main: { schemaVersion: number; hero: string };
    };

    // Exactly what was on disk — unrepaired, so a later version can still try.
    expect(payload.main.schemaVersion).toBe(5);
    expect(payload.main.hero).toBe('not an object');
  });

  test('starting again keeps the damaged save rather than deleting it', async ({ page }) => {
    await page.goto('/tavern');
    await expect(
      page.getByTestId('hero-creation').or(page.getByTestId('place-tavern')),
    ).toBeVisible({ timeout: SETUP_TIMEOUT });
    await plant(page, DAMAGED);
    await plant(page, DAMAGED, 'slot-1:backup');
    await page.reload();
    await expect(page.getByTestId('save-triage')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('triage-restart').click();

    // The game comes back at its own front door.
    await expect(page.getByTestId('hero-creation')).toBeVisible({ timeout: SETUP_TIMEOUT });

    /*
     * And the old bytes are still there. This is the assertion the whole screen exists for: the
     * only way out of triage must not be the thing that makes the loss permanent.
     */
    const keys = await keysInStore(page);
    expect(keys.filter((key) => key.includes('archived'))).not.toHaveLength(0);
  });

  test('a save from a newer version is a different sentence', async ({ page }) => {
    // Not corruption — a player who opened the game on a machine that had already updated. The
    // worst possible response is to offer to wipe it.
    await page.goto('/tavern');
    await expect(
      page.getByTestId('hero-creation').or(page.getByTestId('place-tavern')),
    ).toBeVisible({ timeout: SETUP_TIMEOUT });
    await plant(page, { schemaVersion: 99, hero: null });
    await plant(page, { schemaVersion: 99, hero: null }, 'slot-1:backup');
    await page.reload();

    await expect(page.getByTestId('save-triage')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('triage-why')).toContainText(/newer version/i);
  });

  test('a healthy save never sees this screen', async ({ page }) => {
    await page.goto('/character');
    const creation = page.getByTestId('hero-creation');
    await expect(creation.or(page.getByTestId('paperdoll'))).toBeVisible({
      timeout: SETUP_TIMEOUT,
    });
    if (await creation.isVisible()) {
      await page.getByTestId('class-warrior').click();
      await page.getByTestId('hero-name').fill('Kargath');
      await page.getByTestId('confirm-hero').click();
      await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    }
    await page.evaluate(async () => {
      await (
        window as unknown as { __tavernStore: { getState: () => { flush: () => Promise<void> } } }
      ).__tavernStore
        .getState()
        .flush();
    });

    await page.reload();
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('save-triage')).toHaveCount(0);
  });
});
