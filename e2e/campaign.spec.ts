import { expect, test, type Page } from '@playwright/test';
import { TOTAL_STAGES } from '../src/data/campaign';

/**
 * The Long Road, from the player's side.
 *
 * The engine tests prove the wall curve, the first-clear payout and the seeding; the state tests
 * prove the bank. These prove the parts only a browser can, and each one is a thing that would
 * still "work" with every unit test green:
 *
 * - a **push chains** — one press walks stage after stage without another click;
 * - the run is **interruptible while a fight is on screen**, which is the difference between an
 *   auto-runner and a cutscene, and which the road panel's own Stop button cannot deliver
 *   because the battle scene is mounted on top of it;
 * - a **cleared stage is practice** and says so before and after it is fought;
 * - **an unreached stage refuses**, from the DOM contract *and* from the handler;
 * - the road **survives a reload**, because progress it forgets is progress a player lost.
 *
 * As everywhere in this suite, anything that mutates then navigates flushes first: the autosave is
 * asynchronous and a reload without a flush is racing its own write.
 */

const SETUP_TIMEOUT = 20_000;
/** A stage fight is four seconds at ×1; ×4 and a generous ceiling keeps the suite honest and quick. */
const FIGHT_TIMEOUT = 25_000;

interface Campaign {
  stagesCleared: number;
  bestAttempt: number;
  attempts: number;
  finishedAt: number | null;
}
interface Save {
  hero: { level: number; gold: number; xp: number; name: string } | null;
  activity: { vigor: number };
  campaign: Campaign;
  settings: { battleSpeed: number };
  tasks: { lifetime: Record<string, number> };
}
interface StoreHandle {
  getState: () => { save: Save | null; flush: () => Promise<void> };
  setState: (partial: { save: Save }) => void;
}

const read = (page: Page) =>
  page.evaluate(() => {
    const handle = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
    const { save } = handle.getState();
    return {
      cleared: save?.campaign.stagesCleared ?? 0,
      attempts: save?.campaign.attempts ?? 0,
      best: save?.campaign.bestAttempt ?? 0,
      vigor: save?.activity.vigor ?? 0,
      gold: save?.hero?.gold ?? 0,
      level: save?.hero?.level ?? 0,
      credited: save?.tasks.lifetime['campaignStages'] ?? 0,
    };
  });

const flush = (page: Page) =>
  page.evaluate(async () => {
    await (window as unknown as { __tavernStore: StoreHandle }).__tavernStore.getState().flush();
  });

/** Put the road wherever the test needs it, without walking there. */
async function setRoad(page: Page, patch: Partial<Campaign> & { vigor?: number }) {
  await page.evaluate(async (values) => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const { save } = handle.getState();
    if (!save) throw new Error('no save');
    const { vigor, ...road } = values;
    handle.setState({
      save: {
        ...save,
        campaign: { ...save.campaign, ...road },
        activity: { ...save.activity, vigor: vigor ?? save.activity.vigor },
      },
    });
    await handle.getState().flush();
  }, patch);
}

/**
 * A hero past the level-2 gate, geared and levelled enough to walk the first chapter.
 *
 * Waits for creation-or-paperdoll rather than paperdoll alone, for the reason `arena.spec.ts`
 * spells out: `/character` renders the class picker when there is no hero, so a slow load lands on
 * the picker and a bare paperdoll wait spends its whole timeout looking at the wrong screen.
 */
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

  // Wear what was conjured: pick a bag slot, equip what it selected.
  for (let pass = 0; pass < 14; pass += 1) {
    const bagged = page.locator('[data-testid^="bag-item-"]').first();
    if (!(await bagged.isVisible().catch(() => false))) break;
    await bagged.click();
    const equip = page.getByTestId('equip-selected');
    if (!(await equip.isVisible().catch(() => false))) break;
    await equip.click();
  }

  // ×4 playback: a chain of four-second fights at ×1 would make this file the slow one.
  await page.evaluate(async () => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const { save } = handle.getState();
    if (!save) throw new Error('no save');
    handle.setState({ save: { ...save, settings: { ...save.settings, battleSpeed: 4 } } });
    await handle.getState().flush();
  });
  await flush(page);
}

async function openRoad(page: Page) {
  await page.goto('/campaign');
  await expect(page.getByTestId('place-campaign')).toBeVisible({ timeout: SETUP_TIMEOUT });
}

test.describe('the Long Road', () => {
  test.beforeEach(async ({ page }) => {
    await readyHero(page);
  });

  test('walks stage after stage from one press', async ({ page }) => {
    await openRoad(page);
    const before = await read(page);
    expect(before.cleared).toBe(0);

    await page.getByTestId('road-push').click();

    // The chain is the feature: no second click, and it gets past the first stage on its own.
    await expect
      .poll(async () => (await read(page)).cleared, { timeout: FIGHT_TIMEOUT })
      .toBeGreaterThan(1);

    const after = await read(page);
    // One Vigor a stage, win or lose, and a first clear pays.
    expect(after.vigor).toBe(before.vigor - after.attempts);
    expect(after.gold).toBeGreaterThan(before.gold);
    // Credited in new ground, through the one path.
    expect(after.credited).toBe(after.cleared);
  });

  test('can be stopped while a fight is on screen', async ({ page }) => {
    /*
     * The scene mounts at z-30 over the road panel, so the panel's own Stop button is behind it
     * for the whole run — an auto-runner you cannot interrupt is a cutscene. The overlay chip is
     * the answer, and this is the test that would have caught its absence.
     */
    await openRoad(page);
    await page.getByTestId('road-push').click();

    const overlay = page.getByTestId('road-stop-overlay');
    await expect(overlay).toBeVisible({ timeout: FIGHT_TIMEOUT });
    await expect(page.getByTestId('campaign-fight')).toBeVisible();
    await overlay.click();

    // Stopped means stopped: the road comes back and nothing further is fought.
    await expect(page.getByTestId('wall-panel')).toBeVisible({ timeout: FIGHT_TIMEOUT });
    const settled = await read(page);
    await page.waitForTimeout(2_500);
    expect((await read(page)).attempts).toBe(settled.attempts);
  });

  test('pays a stage once — a second visit is practice', async ({ page }) => {
    await setRoad(page, { stagesCleared: 3 });
    await openRoad(page);

    // The stone says so before it is pressed.
    const stone = page.getByTestId('stage-2');
    await expect(stone).toHaveAttribute('data-cleared', 'true');
    await expect(page.getByTestId('stage-4')).toHaveAttribute('data-wall', 'true');

    const before = await read(page);
    await stone.click();

    await expect(page.getByTestId('practice-note')).toBeVisible({ timeout: FIGHT_TIMEOUT });
    const after = await read(page);
    expect(after.gold).toBe(before.gold);
    expect(after.cleared).toBe(before.cleared);
    expect(after.vigor).toBe(before.vigor - 1);
  });

  test('refuses a stage the player has not reached, in the DOM and in the handler', async ({
    page,
  }) => {
    await setRoad(page, { stagesCleared: 2 });
    await openRoad(page);

    const unreached = page.getByTestId('stage-9');
    await expect(unreached).toBeDisabled();

    const before = await read(page);
    // Forced, because a disabled button is the AT contract working — this asserts the *handler*
    // refuses too, which is the half a screen reader cannot enforce.
    await unreached.click({ force: true });
    await page.waitForTimeout(600);

    expect(await read(page)).toEqual(before);
    await expect(page.getByTestId('campaign-fight')).toBeHidden();
  });

  test('refuses to set out with an empty tankard, and says why', async ({ page }) => {
    await setRoad(page, { vigor: 0 });
    await openRoad(page);

    const push = page.getByTestId('road-push');
    await expect(push).toHaveAttribute('aria-disabled', 'true');
    await expect(push).toHaveAttribute('data-reason', /Vigor/);

    const before = await read(page);
    await push.click({ force: true });
    await page.waitForTimeout(600);
    expect(await read(page)).toEqual(before);
  });

  test('keeps its ground across a reload', async ({ page }) => {
    await setRoad(page, { stagesCleared: 14, bestAttempt: 0.62, attempts: 20 });
    await openRoad(page);

    // Chapter II, because that is where the player is standing.
    await expect(page.getByTestId('stage-15')).toHaveAttribute('data-wall', 'true');
    await expect(page.getByTestId('wall-stage')).toContainText('15');

    await flush(page);
    await page.reload();
    await expect(page.getByTestId('place-campaign')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const after = await read(page);
    expect(after.cleared).toBe(14);
    expect(after.best).toBeCloseTo(0.62, 2);
    await expect(page.getByTestId('stage-15')).toHaveAttribute('data-wall', 'true');
    await expect(page.getByTestId('best-attempt')).toBeVisible();
  });

  test('closes the road when the last stage falls', async ({ page }) => {
    /*
     * `TOTAL_STAGES`, not 120. This test pinned the literal and broke the moment the far country
     * added four chapters — for being right, which is the failure mode a pinned count always has.
     * What it is actually about is the *end* of the road, wherever that is.
     */
    await setRoad(page, { stagesCleared: TOTAL_STAGES, finishedAt: 1_785_000_000_000 });
    await openRoad(page);

    await expect(page.getByTestId('road-finished')).toBeVisible();
    await expect(page.getByTestId('road-push')).toBeHidden();
    await expect(page.getByTestId('road-progress')).toContainText(String(TOTAL_STAGES));
  });

  test('opens chapters one at a time, and lets the player look back', async ({ page }) => {
    await setRoad(page, { stagesCleared: 13 });
    await openRoad(page);

    // Two chapters reached, the rest of the ten still shut.
    await expect(page.getByTestId('chapter-1')).toBeEnabled();
    await expect(page.getByTestId('chapter-2')).toBeEnabled();
    await expect(page.getByTestId('chapter-3')).toBeDisabled();

    // Looking back at chapter I must not drag them out of it again.
    await page.getByTestId('chapter-1').click();
    await expect(page.getByTestId('stage-1')).toHaveAttribute('data-cleared', 'true');
    await page.waitForTimeout(800);
    await expect(page.getByTestId('stage-1')).toBeVisible();
  });
});

test.describe('the road on the map and the rail', () => {
  test('is reachable from both, and they agree it is there', async ({ page }) => {
    await readyHero(page);

    await page.goto('/map');
    await expect(page.getByTestId('place-map')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('map-campaign').click();
    await expect(page.getByTestId('place-campaign')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('nav-campaign').click();
    await expect(page.getByTestId('place-campaign')).toBeVisible({ timeout: SETUP_TIMEOUT });
  });
});
