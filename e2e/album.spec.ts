import { expect, test, type Page } from '@playwright/test';

/**
 * The Collector's Album, from the player's side.
 *
 * The engine tests prove the set arithmetic and the state tests prove the one credit path. These
 * prove the parts only a browser can, and each one is a thing that would still "work" with every
 * unit test green:
 *
 * - the tab **opens where the work is**, not on page one — the derived-default rule the road's
 *   chapter board got wrong;
 * - a fight **writes the entry and says so**, which is the whole feedback loop;
 * - the entry **survives a reload**, because a record a player lost is worse than none;
 * - finishing a page **pays a bonus the album and the Tankard agree on** — the two-surfaces rule,
 *   asserted as agreement rather than twice against a remembered number.
 *
 * As everywhere in this suite, anything that mutates then navigates flushes first: the autosave is
 * asynchronous and a reload without a flush is racing its own write.
 */

const SETUP_TIMEOUT = 20_000;
const FIGHT_TIMEOUT = 25_000;

interface Save {
  hero: { level: number; name: string } | null;
  activity: { vigor: number };
  campaign: { stagesCleared: number };
  album: { foes: string[] };
  settings: { battleSpeed: number };
}
interface StoreHandle {
  getState: () => { save: Save | null; flush: () => Promise<void> };
  setState: (partial: { save: Save }) => void;
}

const flush = (page: Page) =>
  page.evaluate(async () => {
    await (window as unknown as { __tavernStore: StoreHandle }).__tavernStore.getState().flush();
  });

const recorded = (page: Page) =>
  page.evaluate(() => {
    const handle = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
    return handle.getState().save?.album.foes ?? [];
  });

/** Put a set of ids in the book directly, for the states that would take an hour to play to. */
async function setBook(page: Page, foes: readonly string[]) {
  await page.evaluate(async (ids) => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const { save } = handle.getState();
    if (!save) throw new Error('no save');
    handle.setState({ save: { ...save, album: { foes: [...ids] } } });
    await handle.getState().flush();
  }, foes);
}

/** A hero who can win the first chapter, at ×4 playback so a fight is a second. */
async function readyHero(page: Page) {
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
  await page.getByTestId('dev-rarity-rare').click();
  await page.getByTestId('dev-conjure-all').click();

  for (let pass = 0; pass < 14; pass += 1) {
    const bagged = page.locator('[data-testid^="bag-item-"]').first();
    if (!(await bagged.isVisible().catch(() => false))) break;
    await bagged.click();
    const equip = page.getByTestId('equip-selected');
    if (!(await equip.isVisible().catch(() => false))) break;
    await equip.click();
  }

  await page.evaluate(async () => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const { save } = handle.getState();
    if (!save) throw new Error('no save');
    handle.setState({ save: { ...save, settings: { ...save.settings, battleSpeed: 4 } } });
    await handle.getState().flush();
  });
  await flush(page);
}

async function openAlbum(page: Page) {
  await page.goto('/character');
  await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
  await page.getByTestId('character-tab-album').click();
  await expect(page.getByTestId('album')).toBeVisible({ timeout: SETUP_TIMEOUT });
}

test.describe('the Collector’s Album', () => {
  test.beforeEach(async ({ page }) => {
    await readyHero(page);
  });

  test('opens on the first unfinished page rather than page one', async ({ page }) => {
    /*
     * The road's chapter board shipped this bug: state seeded at 1 and corrected only when the
     * data *changed*, so a returning player was shown a page they had finished. The shown page is
     * derived here, and this is the assertion that keeps it derived.
     */
    const woods = page.getByTestId('album-page-zone:whispering-woods');

    await openAlbum(page);
    await expect(page.getByTestId('album-open-page')).toHaveAttribute(
      'data-page',
      'zone:whispering-woods',
    );

    // Finish the Woods behind the screen's back; it must move on by itself.
    const entries = await page.evaluate(() => {
      const cells = document.querySelectorAll('[data-testid^="album-entry-"]');
      return [...cells].map((cell) =>
        cell.getAttribute('data-testid')!.replace('album-entry-', ''),
      );
    });
    expect(entries.length).toBeGreaterThan(0);
    await setBook(page, entries);

    await openAlbum(page);
    await expect(woods).toHaveAttribute('data-complete', 'true');
    await expect(page.getByTestId('album-open-page')).not.toHaveAttribute(
      'data-page',
      'zone:whispering-woods',
    );
  });

  test('records a foe when it is beaten, and says so on the result', async ({ page }) => {
    await page.goto('/campaign');
    await expect(page.getByTestId('place-campaign')).toBeVisible({ timeout: SETUP_TIMEOUT });
    expect(await recorded(page)).toEqual([]);

    await page.getByTestId('road-push').click();

    // The band on the result screen is the feedback; the store is the fact.
    await expect(page.getByTestId('album-record')).toBeVisible({ timeout: FIGHT_TIMEOUT });
    await expect
      .poll(async () => (await recorded(page)).length, { timeout: FIGHT_TIMEOUT })
      .toBeGreaterThan(0);

    const foes = await recorded(page);
    await flush(page);
    await openAlbum(page);

    // The cell for the foe that was just beaten is lit, and the rest of the page is not.
    const first = page.getByTestId(`album-entry-${foes[0]}`);
    await expect(first).toHaveAttribute('data-recorded', 'true');
    await expect(page.getByTestId('album-total')).toContainText(`${foes.length}/`);
  });

  test('keeps the book across a reload', async ({ page }) => {
    await openAlbum(page);
    await setBook(page, ['sootback-boar', 'thicket-bandit']);

    await page.reload();
    await openAlbum(page);

    await expect(page.getByTestId('album-entry-sootback-boar')).toHaveAttribute(
      'data-recorded',
      'true',
    );
    await expect(page.getByTestId('album-entry-thicket-bandit')).toHaveAttribute(
      'data-recorded',
      'true',
    );
    await expect(page.getByTestId('album-entry-moss-lurker')).toHaveAttribute(
      'data-recorded',
      'false',
    );
  });

  test('pays a finished page, and the Tankard quotes the same book', async ({ page }) => {
    /*
     * Two surfaces, one number (CLAUDE.md). The album states the bonus; the mission board quotes
     * a payout that has been through the same `payoutBonus` fold. Asserted as a *rise* on the
     * board rather than against a computed figure, because the point is that the two agree, not
     * that either matches something this test worked out for itself.
     */
    await page.goto('/tavern');
    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
    const quote = page.locator('[data-testid^="payout-gold-"]').first();
    await expect(quote).toBeVisible({ timeout: SETUP_TIMEOUT });
    const before = Number((await quote.innerText()).replace(/[^\d]/g, ''));
    expect(before).toBeGreaterThan(0);

    await openAlbum(page);
    await expect(page.getByTestId('album-bonus')).toHaveAttribute('data-factor', '1');

    const entries = await page.evaluate(() => {
      const cells = document.querySelectorAll('[data-testid^="album-entry-"]');
      return [...cells].map((cell) =>
        cell.getAttribute('data-testid')!.replace('album-entry-', ''),
      );
    });
    await setBook(page, entries);

    await openAlbum(page);
    await expect(page.getByTestId('album-bonus')).toHaveAttribute('data-factor', '1.01');
    await expect(page.getByTestId('album-payout')).toContainText('+1%');

    await page.goto('/tavern');
    await expect(quote).toBeVisible({ timeout: SETUP_TIMEOUT });
    const after = Number((await quote.innerText()).replace(/[^\d]/g, ''));
    expect(after).toBeGreaterThan(before);
  });

  test('makes a completed page a moment, not a line', async ({ page }) => {
    /*
     * The page-completion flourish. Set the book one short of the foe the first stage stands on,
     * fight it, and the result screen must say the *page* finished rather than "recorded".
     */
    // Everything in the Woods except the Sootback Boar, who stands on stage one of the road.
    await openAlbum(page);
    const entries = await page.evaluate(() => {
      const cells = document.querySelectorAll('[data-testid^="album-entry-"]');
      return [...cells].map((cell) =>
        cell.getAttribute('data-testid')!.replace('album-entry-', ''),
      );
    });
    await setBook(
      page,
      entries.filter((id) => id !== 'sootback-boar'),
    );

    await page.goto('/campaign');
    await expect(page.getByTestId('place-campaign')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('road-push').click();

    const band = page.getByTestId('album-record');
    await expect(band).toBeVisible({ timeout: FIGHT_TIMEOUT });
    await expect(band).toHaveAttribute('data-page-completed', 'zone:whispering-woods');
    await expect(band).toContainText('Page complete');
  });
});
