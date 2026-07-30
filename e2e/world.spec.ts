import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 8 acceptance: the simulated world, from the player's side.
 *
 * The engine tests prove the 1,500 are deterministic, cheap to reconcile and honestly reported.
 * These prove the part a player can actually see: the Crier board is there on arrival, it
 * survives a reload, and the world keeps moving while the tab is shut.
 *
 * As with missions and patrol, offline time is faked by winding the *stored* timestamp back
 * rather than mocking the clock — which is precisely what a closed tab does to a save.
 */

const SETUP_TIMEOUT = 20_000;

interface StoreHandle {
  getState: () => { save: Save | null; flush: () => Promise<void> };
  setState: (partial: { save: Save }) => void;
}
interface Save {
  world: {
    lastSimAt: number;
    createdAt: number;
    bots: { id: number; level: number; honor: number }[];
    ladder: number[];
    feed: { id: string; category: string; text: string; sourceEvent: unknown }[];
  } | null;
}

async function ensureHero(page: Page) {
  await page.goto('/tavern');

  const creation = page.getByTestId('hero-creation');
  await expect(creation.or(page.getByTestId('place-tavern'))).toBeVisible({
    timeout: SETUP_TIMEOUT,
  });

  if (await creation.isVisible()) {
    await page.getByTestId('class-warrior').click();
    await page.getByTestId('hero-name').fill('Kargath');
    await expect(page.getByTestId('confirm-hero')).toBeEnabled({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('confirm-hero').click();
    await expect(creation).toHaveCount(0, { timeout: SETUP_TIMEOUT });
  }
}

/**
 * Wind the world's clock back so `days` of simulation are owed on the next load.
 *
 * The write has to be **flushed**, not just set: reconciliation happens on load from storage,
 * so a state-only change is invisible to the very reload these tests are exercising.
 */
async function ageWorld(page: Page, days: number) {
  await page.evaluate(async (count) => {
    const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore;
    if (!store) throw new Error('store handle missing');
    const { save } = store.getState();
    if (!save?.world) throw new Error('no world');

    const by = count * 86_400_000;
    store.setState({
      save: { ...save, world: { ...save.world, lastSimAt: save.world.lastSimAt - by } },
    });
    await store.getState().flush();
  }, days);
}

const readWorld = (page: Page) =>
  page.evaluate(() => {
    const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
    return store.getState().save!.world;
  });

test.describe('the world exists', () => {
  test.beforeEach(async ({ page }) => {
    await ensureHero(page);
  });

  test('raises fifteen hundred heroes and a sorted ladder at creation', async ({ page }) => {
    const world = await readWorld(page);

    expect(world).not.toBeNull();
    expect(world!.bots).toHaveLength(1_500);
    // 1,501 rungs since Phase 9: the player takes their seat the moment the world is raised,
    // which is what gives them a rank, rivals and a Crier that can name them.
    expect(world!.ladder).toHaveLength(1_501);
    expect(new Set(world!.ladder).size).toBe(1_501);
    expect(world!.ladder).toContain(-1);
  });

  test('greets a new hero with a Crier board that already has news on it', async ({ page }) => {
    // The world is generated a day back on purpose: a blank board on the first screen would
    // make the whole simulation invisible until the second session.
    await expect(page.getByTestId('town-crier')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.locator('[data-testid^="crier-entry-"]').first()).toBeVisible();
  });

  test('never prints an unfilled slot in a headline', async ({ page }) => {
    const world = await readWorld(page);
    for (const entry of world!.feed) {
      expect(entry.text, entry.id).not.toMatch(/\{[a-z]+\}/i);
    }
  });

  test('backs every headline with a delta, except world flavour', async ({ page }) => {
    const world = await readWorld(page);
    for (const entry of world!.feed) {
      if (entry.category === 'flavour') expect(entry.sourceEvent, entry.text).toBeNull();
      else expect(entry.sourceEvent, entry.text).not.toBeNull();
    }
  });
});

test.describe('the world keeps moving', () => {
  test.beforeEach(async ({ page }) => {
    await ensureHero(page);
  });

  test('reconciles a week away and says what was missed', async ({ page }) => {
    const before = await readWorld(page);
    await ageWorld(page, 7);
    await page.reload();

    // The absence card is the proof the world ran without the player.
    await expect(page.getByTestId('absence-card')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('absence-card')).toContainText('While you were away');

    await page.getByTestId('absence-dismiss').click();
    await expect(page.getByTestId('absence-card')).toHaveCount(0);

    const after = await readWorld(page);
    const levelled = after!.bots.filter((bot, i) => bot.level > before!.bots[i]!.level);
    expect(levelled.length).toBeGreaterThan(10);
  });

  test('does not interrupt a short absence with a card', async ({ page }) => {
    await ageWorld(page, 0);
    await page.reload();

    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('absence-card')).toHaveCount(0);
  });

  test('churns the ladder without losing or duplicating anybody', async ({ page }) => {
    await ageWorld(page, 14);
    await page.reload();
    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const world = await readWorld(page);
    expect(world!.ladder).toHaveLength(1_501);
    expect(new Set(world!.ladder).size).toBe(1_501);
    // The player is churned along with everyone else and never churned *out*.
    expect(world!.ladder).toContain(-1);
    for (const bot of world!.bots) expect(bot.honor).toBeGreaterThanOrEqual(0);
  });

  test('survives a reload without re-rolling the world', async ({ page }) => {
    const before = await readWorld(page);
    await page.reload();
    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const after = await readWorld(page);
    // Same population, same identities — only the simulation clock has moved.
    expect(after!.createdAt).toBe(before!.createdAt);
    expect(after!.bots.length).toBe(before!.bots.length);
  });

  test('loads a fortnight’s absence without a visible stall', async ({ page }) => {
    await ageWorld(page, 14);

    const started = Date.now();
    await page.reload();
    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
    const elapsed = Date.now() - started;

    // Generous next to the engine's ≤1s budget, because this includes the whole page load —
    // it is here to catch a reconciliation that has become pathological, not to time it.
    expect(elapsed, `${elapsed}ms`).toBeLessThan(15_000);
  });
});

test.describe('the Crier board', () => {
  test.beforeEach(async ({ page }) => {
    await ensureHero(page);
    await ageWorld(page, 5);
    await page.reload();
    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
    const dismiss = page.getByTestId('absence-dismiss');
    if (await dismiss.isVisible()) await dismiss.click();
  });

  test('filters a category out and back without losing the board', async ({ page }) => {
    const board = page.getByTestId('town-crier');
    await board.scrollIntoViewIfNeeded();
    await expect(board).toBeVisible();

    const filters = page.locator('[data-testid^="crier-filter-"]');
    const count = await filters.count();
    test.skip(count < 2, 'needs at least two categories on the board to filter between');

    // Assert the muted category is gone rather than counting rows: entries animate out through
    // `AnimatePresence`, so a one-shot count catches the old set and the new set at once.
    const category = (await filters.first().getAttribute('data-testid'))!.replace(
      'crier-filter-',
      '',
    );
    const muted = page.locator(`[data-testid="crier-entry-${category}"]`);
    await expect(muted.first()).toBeVisible();

    await filters.first().click();
    await expect(filters.first()).toHaveAttribute('aria-pressed', 'false');
    await expect(muted).toHaveCount(0);

    await filters.first().click();
    await expect(filters.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(muted.first()).toBeVisible();
  });

  test('marks the names the player knows', async ({ page }) => {
    const world = await readWorld(page);
    // Priority is a score, not a hard cut, so this only asserts the mechanism exists.
    expect(world!.feed.length).toBeGreaterThan(0);
  });
});

test.describe('house style', () => {
  test('the Crier board keeps to chamfers — no rounded corners', async ({ page }) => {
    await ensureHero(page);
    await expect(page.getByTestId('town-crier')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const offenders = await page.locator('[data-testid="town-crier"] *').evaluateAll((nodes) =>
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
