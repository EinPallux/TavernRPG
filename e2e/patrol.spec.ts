import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 6 acceptance: the City Watch.
 *
 * Patrol collects correctly across reloads and offline time, and mission↔patrol exclusivity
 * holds in both directions. Shifts are 1–12 real hours, so — as with missions — these wind the
 * stored timestamps back rather than mocking the clock, which is exactly what a closed tab
 * does to a save.
 */

const SETUP_TIMEOUT = 20_000;

interface StoreHandle {
  getState: () => { save: Save | null };
  setState: (partial: { save: Save }) => void;
}
interface Save {
  activity: {
    patrol: { startedAt: number; endsAt: number; hours: number } | null;
    mission: { endsAt: number } | null;
    vigor: number;
  };
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

/** The watch gates at level 3, so every test that uses it needs a hero past that. */
async function levelPastTheGate(page: Page) {
  await page.goto('/character');
  // The dev drawer only mounts once the character screen has its hero; clicking before the
  // save has hydrated is the same race `ensureHero` had.
  await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
  await page.getByTestId('dev-drawer-toggle').click();
  await page.getByTestId('dev-level-10').click();
  await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });
}

async function gotoWatch(page: Page) {
  await ensureHero(page);
  await levelPastTheGate(page);
  await page.goto('/patrol');
  await expect(page.getByTestId('place-patrol')).toBeVisible({ timeout: SETUP_TIMEOUT });
}

/** Wind a running shift back so `minutes` of it have already happened. */
async function ageShift(page: Page, minutes: number) {
  await page.evaluate((mins) => {
    const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore;
    if (!store) throw new Error('store handle missing');
    const { save } = store.getState();
    if (!save?.activity.patrol) throw new Error('not on duty');

    const by = mins * 60_000;
    const patrol = save.activity.patrol;
    store.setState({
      save: {
        ...save,
        activity: {
          ...save.activity,
          patrol: { ...patrol, startedAt: patrol.startedAt - by, endsAt: patrol.endsAt - by },
        },
      },
    });
  }, minutes);
}

/** Sign up for a shift, clicking through Hildy's "are you sure" if it appears. */
async function takeShift(page: Page, hours: number) {
  await page.getByTestId('shift-slider').fill(String(hours));
  await expect(page.getByTestId('shift-hours')).toHaveText(`${hours}h`);
  await page.getByTestId('start-shift').click();

  const confirm = page.getByTestId('confirm-shift');
  if (await confirm.isVisible()) await confirm.click();

  await expect(page.getByTestId('patrol-on-duty')).toBeVisible();
}

test.describe('the gate', () => {
  test('a level-1 hero finds the door shut, even by URL', async ({ page }) => {
    // The nav rail refusing to link here is not the same as the room refusing to open, and
    // the watch pays real gold.
    await ensureHero(page);
    await page.goto('/patrol');

    await expect(page.getByTestId('locked-patrol')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('locked-patrol')).toContainText('level 3');
    await expect(page.getByTestId('place-patrol')).toHaveCount(0);
  });

  test('opens once the hero is past it', async ({ page }) => {
    await ensureHero(page);
    await levelPastTheGate(page);
    await page.goto('/patrol');

    await expect(page.getByTestId('place-patrol')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('locked-patrol')).toHaveCount(0);
  });
});

test.describe('signing on', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWatch(page);
  });

  test('previews what the shift will pay, and the preview moves with the slider', async ({
    page,
  }) => {
    const preview = page.getByTestId('shift-preview');
    await expect(preview).toBeVisible();

    await page.getByTestId('shift-slider').fill('1');
    const short = await preview.innerText();

    await page.getByTestId('shift-slider').fill('12');
    await expect(page.getByTestId('shift-hours')).toHaveText('12h');
    expect(await preview.innerText()).not.toBe(short);
  });

  test('asks once before sending a hero with a full day of Vigor to the watch house', async ({
    page,
  }) => {
    // Soft anti-footgun (spec §5): clocking off with 100 Vigor unspent is usually a misclick.
    await page.getByTestId('start-shift').click();
    await expect(page.getByTestId('off-duty-confirm')).toBeVisible();

    await page.getByTestId('confirm-shift').click();
    await expect(page.getByTestId('patrol-on-duty')).toBeVisible();
  });

  test('does not nag when there is no Vigor left to spend', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
      const { save } = store.getState();
      store.setState({ save: { ...save!, activity: { ...save!.activity, vigor: 0 } } });
    });

    await page.getByTestId('start-shift').click();
    // Straight onto the beat — nothing to warn about.
    await expect(page.getByTestId('patrol-on-duty')).toBeVisible();
  });
});

test.describe('the beat', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWatch(page);
  });

  test('counts down, and shows what has been earned so far', async ({ page }) => {
    await takeShift(page, 4);

    await expect(page.getByTestId('patrol-remaining')).toContainText(/h|m/);
    await expect(page.getByTestId('patrol-on-duty')).toHaveAttribute('data-complete', 'false');

    await ageShift(page, 120);
    await expect(page.getByTestId('patrol-on-duty')).toContainText('earned so far');
  });

  test('survives a reload mid-shift', async ({ page }) => {
    await takeShift(page, 8);
    await ageShift(page, 180);
    await page.reload();

    await expect(page.getByTestId('patrol-on-duty')).toBeVisible({ timeout: SETUP_TIMEOUT });
    // Three hours already served, five to go — the shift is timestamps in the save.
    await expect(page.getByTestId('patrol-on-duty')).toHaveAttribute('data-complete', 'false');
  });

  test('completes while the tab is away and waits to be signed off', async ({ page }) => {
    await takeShift(page, 2);
    await ageShift(page, 120);

    await expect(page.getByTestId('patrol-on-duty')).toHaveAttribute('data-complete', 'true');
    await expect(page.getByTestId('patrol-remaining')).toContainText('Ready to sign off');
  });

  test('pays out on collection, with a report from the beat', async ({ page }) => {
    const goldBefore = Number((await page.getByTestId('hud-gold').innerText()).replace(/\D/g, ''));

    await takeShift(page, 6);
    await ageShift(page, 360);
    await page.getByTestId('collect-shift').click();

    const report = page.getByTestId('shift-report');
    await expect(report).toBeVisible();
    await expect(report).toHaveAttribute('data-early', 'false');
    await expect(page.getByTestId('shift-gold')).toBeVisible();
    await expect(page.getByTestId('shift-log')).toBeVisible();

    await page.getByTestId('shift-dismiss').click();
    await expect(page.getByTestId('start-shift')).toBeVisible();

    await expect
      .poll(async () => Number((await page.getByTestId('hud-gold').innerText()).replace(/\D/g, '')))
      .toBeGreaterThan(goldBefore);
  });

  test('pro-rates a shift walked off early, and says so', async ({ page }) => {
    await takeShift(page, 12);
    await ageShift(page, 90);
    await page.getByTestId('collect-shift').click();

    const report = page.getByTestId('shift-report');
    await expect(report).toBeVisible();
    await expect(report).toHaveAttribute('data-early', 'true');
    await expect(report).toContainText('Paid for what you walked');
  });
});

test.describe('one place at a time', () => {
  test('a shift blocks the mission board', async ({ page }) => {
    await gotoWatch(page);
    await takeShift(page, 4);

    await page.goto('/tavern');
    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const card = page.locator('[data-testid^="mission-card-"]').first();
    await expect(card).toBeVisible();
    const id = (await card.getAttribute('data-testid'))!.replace('mission-card-', '');
    await page.getByTestId(`accept-${id}`).click();

    await expect(page.getByTestId('tavern-message')).toContainText('already out on a job');
  });

  test('a mission blocks the watch book', async ({ page }) => {
    await ensureHero(page);
    await levelPastTheGate(page);
    await page.goto('/tavern');
    await expect(page.getByTestId('mission-board')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const card = page.locator('[data-testid^="mission-card-"]').first();
    const id = (await card.getAttribute('data-testid'))!.replace('mission-card-', '');
    await page.getByTestId(`accept-${id}`).click();
    await expect(page.getByTestId('mission-progress')).toBeVisible();

    await page.goto('/patrol');
    await expect(page.getByTestId('place-patrol')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // Style guide §8: the disabled control explains itself.
    const start = page.getByTestId('start-shift');
    await expect(start).toBeDisabled();
    await expect(start).toHaveAttribute('title', /one at a time/i);
  });

  test('frees the hero again once the shift is collected', async ({ page }) => {
    await gotoWatch(page);
    await takeShift(page, 1);
    await ageShift(page, 60);
    await page.getByTestId('collect-shift').click();
    await page.getByTestId('shift-dismiss').click();

    await page.goto('/tavern');
    const card = page.locator('[data-testid^="mission-card-"]').first();
    await expect(card).toBeVisible({ timeout: SETUP_TIMEOUT });
    const id = (await card.getAttribute('data-testid'))!.replace('mission-card-', '');
    await page.getByTestId(`accept-${id}`).click();

    await expect(page.getByTestId('mission-progress')).toBeVisible();
  });
});

test.describe('the HUD', () => {
  test('mirrors the mission chip while on the beat', async ({ page }) => {
    await gotoWatch(page);
    await takeShift(page, 5);

    await expect(page.getByTestId('hud-patrol')).toBeVisible();

    await ageShift(page, 300);
    await expect(page.getByTestId('hud-patrol-done')).toBeVisible();
  });
});

test.describe('house style', () => {
  test('the watch house keeps to chamfers — no rounded corners', async ({ page }) => {
    await gotoWatch(page);

    const offenders = await page.locator('[data-testid="place-patrol"] *').evaluateAll((nodes) =>
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
