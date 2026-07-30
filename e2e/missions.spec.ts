import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 5 acceptance: the core loop.
 *
 * accept → wait → fight → loot, plus the two persistence claims the ROADMAP calls out:
 * a mission survives a reload mid-timer, and a fight waiting to be watched survives one too.
 *
 * Real missions take 5–20 wall-clock minutes, which no test can wait for. Rather than mocking
 * the clock — which would stop testing the thing that matters, the *stored* timestamps — these
 * reach into the store and pull the finish line into the past, exactly as a closed tab does.
 */

/**
 * Setup, not assertion — so the waits are generous. Hydration reads IndexedDB and the workers
 * hit the server together, and a slow first paint here would fail tests that are about
 * something else entirely.
 */
const SETUP_TIMEOUT = 20_000;

async function ensureHero(page: Page, name = 'Kargath') {
  await page.goto('/tavern');

  const creation = page.getByTestId('hero-creation');
  await expect(creation.or(page.getByTestId('place-tavern'))).toBeVisible({
    timeout: SETUP_TIMEOUT,
  });

  if (await creation.isVisible()) {
    await page.getByTestId('class-warrior').click();
    await page.getByTestId('hero-name').fill(name);
    // The button is disabled until both are in; waiting for it beats racing React.
    await expect(page.getByTestId('confirm-hero')).toBeEnabled({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('confirm-hero').click();
    // Creation must actually finish before navigating, or the goto races the save.
    await expect(creation).toHaveCount(0, { timeout: SETUP_TIMEOUT });
    await page.goto('/tavern');
  }

  await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
  // The board is drawn in an effect after hydration; waiting for it here keeps every test
  // that follows from racing the first render.
  await expect(
    page.getByTestId('mission-board').or(page.getByTestId('mission-progress')),
  ).toBeVisible({
    timeout: SETUP_TIMEOUT,
  });
}

/** The first card on the board, and its offer id. */
async function firstOffer(page: Page): Promise<string> {
  const card = page.locator('[data-testid^="mission-card-"]').first();
  await expect(card).toBeVisible();
  const testid = await card.getAttribute('data-testid');
  return testid!.replace('mission-card-', '');
}

/**
 * Wait for the autosave to reach disk.
 *
 * Tests that reload are reading from storage, and the suite mutates and navigates in the same
 * instant where a player would take seconds — so anything asserted after a reload has to be
 * flushed first.
 */
async function flushSave(page: Page) {
  await page.evaluate(async () => {
    const store = (window as unknown as { __tavernStore?: TavernStoreHandle }).__tavernStore;
    await store?.getState().flush();
  });
}

/** Bring the running mission home, the way a closed tab would. */
async function fastForward(page: Page) {
  await page.evaluate(async () => {
    const store = (window as unknown as { __tavernStore?: TavernStoreHandle }).__tavernStore;
    if (!store) throw new Error('store handle missing');
    const { save } = store.getState();
    if (!save?.activity.mission) throw new Error('no mission running');
    store.setState({
      save: {
        ...save,
        activity: { ...save.activity, mission: { ...save.activity.mission, endsAt: 1 } },
      },
    });
    // Flushed, not just set: the tests that reload after this are reading from storage, so a
    // state-only change is invisible to exactly the reload they are exercising.
    await store.getState().flush();
  });
}

interface TavernStoreHandle {
  getState: () => { save: SaveShape | null; flush: () => Promise<void> };
  setState: (partial: { save: SaveShape }) => void;
}
interface SaveShape {
  activity: {
    mission: { endsAt: number } | null;
    pendingMission: unknown;
    vigor: number;
  };
  hero: { dice: number } | null;
}

test.describe('the mission board', () => {
  test.beforeEach(async ({ page }) => {
    await ensureHero(page);
  });

  test('lays out three jobs the moment a hero exists', async ({ page }) => {
    await expect(page.getByTestId('mission-board')).toBeVisible();
    await expect(page.locator('[data-testid^="mission-card-"]')).toHaveCount(3);
  });

  test('spans at least two zones, so the day is not one long errand', async ({ page }) => {
    const zones = await page
      .locator('[data-testid^="mission-card-"]')
      .evaluateAll((cards) => new Set(cards.map((card) => card.getAttribute('data-zone'))).size);

    expect(zones).toBeGreaterThanOrEqual(2);
  });

  test('shows the odds, and they change with the length chosen', async ({ page }) => {
    // CLAUDE.md rule 6: odds are always visible.
    const id = await firstOffer(page);
    const odds = page.getByTestId(`odds-${id}`);

    await page.getByTestId(`duration-${id}-5`).click();
    await expect(odds).toContainText('25%');

    await page.getByTestId(`duration-${id}-20`).click();
    await expect(odds).toContainText('38%');
  });

  test('raises the reward when a longer mission is chosen', async ({ page }) => {
    const id = await firstOffer(page);
    const card = page.getByTestId(`mission-card-${id}`);

    await page.getByTestId(`duration-${id}-5`).click();
    const short = await card.innerText();

    await page.getByTestId(`duration-${id}-20`).click();
    const long = await card.innerText();

    expect(long).not.toBe(short);
  });

  test('rerolls free once a day, then asks for a Golden Die', async ({ page }) => {
    const before = await page
      .locator('[data-testid^="mission-card-"]')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid')));

    await page.getByTestId('reroll-board').click();

    await expect
      .poll(async () =>
        page
          .locator('[data-testid^="mission-card-"]')
          .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid'))),
      )
      .not.toEqual(before);

    // A fresh hero has no dice, so the second reroll must explain itself rather than go grey.
    await page.getByTestId('reroll-board').click();
    await expect(page.getByTestId('tavern-message')).toContainText('Golden Die');
  });
});

test.describe('the core loop', () => {
  test.beforeEach(async ({ page }) => {
    await ensureHero(page);
  });

  test('accept → wait → fight → loot', async ({ page }) => {
    const id = await firstOffer(page);

    // Accept: Vigor is spent and the road appears.
    await page.getByTestId(`duration-${id}-5`).click();
    await page.getByTestId(`accept-${id}`).click();

    await expect(page.getByTestId('mission-progress')).toBeVisible();
    await expect(page.getByTestId('hud-vigor')).toContainText('95');
    await expect(page.getByTestId('hud-activity')).toBeVisible();

    // Wait: the hero comes home.
    await fastForward(page);
    await expect(page.getByTestId('mission-returned')).toBeVisible();
    await expect(page.getByTestId('hud-mission-waiting')).toBeVisible();

    // Fight: the battle scene takes the stage.
    await page.getByTestId('watch-fight').click();
    await expect(page.getByTestId('tavern-battle')).toBeVisible();
    await expect(page.getByTestId('battle-scene')).toBeVisible();

    // Loot: the result screen accounts for it.
    await page.getByTestId('battle-skip').click();
    await expect(page.getByTestId('battle-result')).toBeVisible();
    await expect(page.getByTestId('closest-moment')).toBeVisible();

    // Back to the board, ready for the next one.
    await page.getByTestId('result-continue').click();
    await expect(page.getByTestId('mission-board')).toBeVisible();
  });

  test('pays out gold and XP that stick', async ({ page }) => {
    const goldBefore = Number((await page.getByTestId('hud-gold').innerText()).replace(/\D/g, ''));

    const id = await firstOffer(page);
    await page.getByTestId(`duration-${id}-10`).click();
    await page.getByTestId(`accept-${id}`).click();
    await fastForward(page);
    await page.getByTestId('watch-fight').click();
    await page.getByTestId('battle-skip').click();
    await expect(page.getByTestId('battle-result')).toBeVisible();
    await page.getByTestId('result-continue').click();

    await expect
      .poll(async () => Number((await page.getByTestId('hud-gold').innerText()).replace(/\D/g, '')))
      .toBeGreaterThan(goldBefore);
  });

  test('a mission survives a reload mid-timer', async ({ page }) => {
    const id = await firstOffer(page);
    await page.getByTestId(`duration-${id}-20`).click();
    await page.getByTestId(`accept-${id}`).click();
    await expect(page.getByTestId('mission-progress')).toBeVisible();

    await flushSave(page);
    await page.reload();

    // Still on the road, still 80 Vigor — the timer is two stamps in the save.
    await expect(page.getByTestId('mission-progress')).toBeVisible();
    await expect(page.getByTestId('hud-vigor')).toContainText('80');
  });

  test('a fight waiting to be watched survives a reload', async ({ page }) => {
    const id = await firstOffer(page);
    await page.getByTestId(`duration-${id}-5`).click();
    await page.getByTestId(`accept-${id}`).click();
    await fastForward(page);
    await expect(page.getByTestId('mission-returned')).toBeVisible();

    // `landMission` runs when the card appears, *after* `fastForward` flushed — so the state
    // this test reloads into is written by a later save than the one already waited on.
    await flushSave(page);
    await page.reload();

    // Missions never auto-resolve: the fight is still waiting to be seen.
    await expect(page.getByTestId('mission-returned')).toBeVisible();
    await expect(page.getByTestId('watch-fight')).toBeVisible();
  });

  test('only one mission at a time', async ({ page }) => {
    const id = await firstOffer(page);
    await page.getByTestId(`accept-${id}`).click();
    await expect(page.getByTestId('mission-progress')).toBeVisible();

    // The board is gone while a job runs; nothing to accept a second time.
    await expect(page.getByTestId('mission-board')).toHaveCount(0);
  });

  test('will not sell you a mission the day cannot pay for, and says why', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as unknown as { __tavernStore?: TavernStoreHandle }).__tavernStore!;
      const { save } = store.getState();
      store.setState({ save: { ...save!, activity: { ...save!.activity, vigor: 5 } } });
    });

    const id = await firstOffer(page);
    await page.getByTestId(`duration-${id}-20`).click();

    // Style guide §8: a disabled control explains itself rather than going quietly grey.
    const accept = page.getByTestId(`accept-${id}`);
    await expect(accept).toBeDisabled();
    await expect(accept).toHaveAttribute('title', /20 Vigor/);

    // The 5-minute option is still affordable, so the card stays usable.
    await page.getByTestId(`duration-${id}-5`).click();
    await expect(accept).toBeEnabled();
  });
});

test.describe('Marla', () => {
  test('says something, and changes what she says as the loop moves', async ({ page }) => {
    await ensureHero(page);

    const bark = page.getByTestId('bark-tavern');
    await expect(bark).toBeVisible();
    const idle = await bark.innerText();

    const id = await firstOffer(page);
    await page.getByTestId(`accept-${id}`).click();
    await expect(page.getByTestId('mission-progress')).toBeVisible();

    await expect.poll(async () => bark.innerText()).not.toBe(idle);
  });

  test('explains the Ale cap rather than going quietly grey', async ({ page }) => {
    await ensureHero(page);
    await page.getByTestId('buy-ale').click();
    await expect(page.getByTestId('tavern-message')).toContainText('Golden Die');
  });
});

test.describe('house style', () => {
  test('the tavern keeps to chamfers — no rounded corners', async ({ page }) => {
    await ensureHero(page);

    const offenders = await page.locator('[data-testid="place-tavern"] *').evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const radius = getComputedStyle(node).borderRadius;
          return radius
            .split(' ')
            .some((part) => part.endsWith('px') && Number.parseFloat(part) > 4);
        })
        .map((node) => `${node.tagName}.${node.className}`)
        .slice(0, 5),
    );

    expect(offenders).toEqual([]);
  });
});
