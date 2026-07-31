import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 13 acceptance: Fortune's Table, from the player's side.
 *
 * The engine tests prove the rates match the config over 100k rolls and that the rotation is a
 * pure function of the calendar. These prove the parts only a browser can, and every one of them
 * is an *honesty* property rather than a mechanical one:
 *
 * - the **odds are on screen at the same time as the button**, never behind a disclosure;
 * - the **pity meter counts in public** and says out loud when the next card is owed;
 * - the **free card is free**, once, and comes back;
 * - the **ceremony is skippable** and the result was already banked before it played;
 * - the **history log is a receipt** — free marked free, pitied marked owed.
 */

const SETUP_TIMEOUT = 20_000;

interface StoreHandle {
  getState: () => { save: Save | null; flush: () => Promise<void> };
  setState: (partial: { save: Save }) => void;
}
interface Gacha {
  weeklyPity: number;
  weeklyPitySet: string | null;
  monthlyRolls: number;
  monthlyPaidThrough: number;
  shards: number;
  freeRollsToday: number;
  rolls: number;
  pets: string[];
  history: { bannerId: string; outcome: string; label: string; pitied: boolean; free: boolean }[];
}
interface Save {
  worldSeed: number;
  hero: {
    level: number;
    dice: number;
    classId: string;
    backpack: unknown[];
    satchel: unknown[];
  } | null;
  gacha: Gacha;
  forge: { recipes: string[] };
}

const read = (page: Page) =>
  page.evaluate(() => {
    const handle = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
    const { save } = handle.getState();
    return {
      dice: save?.hero?.dice ?? 0,
      gacha: save?.gacha as Gacha,
      recipes: save?.forge.recipes ?? [],
      bagged: [...(save?.hero?.backpack ?? []), ...(save?.hero?.satchel ?? [])].filter(Boolean)
        .length,
    };
  });

const flush = (page: Page) =>
  page.evaluate(async () => {
    await (window as unknown as { __tavernStore: StoreHandle }).__tavernStore.getState().flush();
  });

/** Push the save straight to a state, then reload so the room reads it fresh. */
async function seed(page: Page, patch: Partial<Gacha> & { dice?: number }) {
  await page.evaluate(async (over) => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const { save } = handle.getState();
    if (!save?.hero) throw new Error('no hero');
    const { dice, ...gacha } = over;
    handle.setState({
      save: {
        ...save,
        hero: { ...save.hero, ...(dice === undefined ? {} : { dice }) },
        gacha: { ...save.gacha, ...gacha },
      },
    });
    await handle.getState().flush();
  }, patch);
}

/**
 * A hero past the level-8 curtain, with dice to spend.
 *
 * Waits for creation-or-paperdoll rather than paperdoll alone, for the reason `arena.spec.ts`
 * spells out: `/character` renders the class picker when there is no hero, so a slow load lands
 * on the picker and a bare paperdoll wait spends its whole timeout on the wrong screen.
 */
async function readyHero(page: Page, dice = 40) {
  await page.goto('/character');

  const creation = page.getByTestId('hero-creation');
  const paperdoll = page.getByTestId('paperdoll');
  await expect(creation.or(paperdoll).first()).toBeVisible({ timeout: SETUP_TIMEOUT });
  if (await creation.isVisible()) {
    await page.getByTestId('class-bard').click();
    await page.getByTestId('hero-name').fill('Ysolde');
    await expect(page.getByTestId('confirm-hero')).toBeEnabled({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('confirm-hero').click();
  }
  await expect(paperdoll).toBeVisible({ timeout: SETUP_TIMEOUT });

  await page.getByTestId('dev-drawer-toggle').click();
  await page.getByTestId('dev-level-10').click();
  await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });
  await seed(page, { dice });
}

async function openTable(page: Page) {
  await flush(page);
  await page.goto('/fortune');
  await expect(page.getByTestId('place-fortune')).toBeVisible({ timeout: SETUP_TIMEOUT });
}

/** Spin, ride the ceremony to the end, and dismiss it. */
async function spin(page: Page, testid: string) {
  await page.getByTestId(testid).click();
  await expect(page.getByTestId('roll-ceremony')).toBeVisible({ timeout: SETUP_TIMEOUT });
  // Skippable from the first frame — the spec's rule, and the way this suite stays quick.
  await page.getByTestId('roll-skip').click();
  await expect(page.getByTestId('roll-continue')).toBeVisible({ timeout: SETUP_TIMEOUT });
  await page.getByTestId('roll-continue').click();
  await expect(page.getByTestId('roll-ceremony')).toBeHidden({ timeout: SETUP_TIMEOUT });
}

test.describe('the table', () => {
  test('shows three banners, what each features, and when it turns over', async ({ page }) => {
    await readyHero(page);
    await openTable(page);

    for (const id of ['daily', 'weekly', 'monthly']) {
      const card = page.getByTestId(`banner-${id}`);
      await expect(card).toBeVisible();
      await expect(card.getByTestId('featuring')).not.toBeEmpty();
      await expect(card.getByTestId('banner-countdown')).toContainText('Turns over in');
      // The next rotation is named, not hidden behind a silhouette nobody can read.
      await expect(card.getByTestId('next-tease')).toContainText('Being shuffled');
    }
  });

  test('publishes every rate beside the button — ROADMAP acceptance', async ({ page }) => {
    await readyHero(page);
    await openTable(page);

    // No hover, no click, no menu: the panel is simply there.
    const panel = page.getByTestId('odds-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-banner', 'weekly');
    await expect(page.getByTestId('odds-featured')).toHaveText('5.0%');
    await expect(page.getByTestId('odds-epic')).toHaveText('3.0%');
    await expect(page.getByTestId('odds-gold')).toHaveText('22%');
    await expect(panel).toContainText('Golden Dice are earned and never sold');

    // And it follows the banner the player is looking at.
    await page.getByTestId('banner-daily').hover();
    await expect(panel).toHaveAttribute('data-banner', 'daily');
    await expect(page.getByTestId('odds-featured')).toHaveText('14%');
  });

  test('keeps the Grand Reading behind a spread the others do not get', async ({ page }) => {
    await readyHero(page);
    await openTable(page);

    await expect(page.getByTestId('roll-ten-monthly')).toBeVisible();
    await expect(page.locator('[data-testid^="roll-ten-"]')).toHaveCount(1);
    // Its track is drawn as three named rungs, paid or not.
    const track = page.getByTestId('banner-monthly').getByTestId('track-meter');
    await expect(track).toBeVisible();
    await expect(track.getByTestId('track-rung-1')).toHaveAttribute('data-paid', 'false');
    await expect(track).toContainText('The Owl of Vesna');
  });
});

test.describe('the free card', () => {
  test('costs nothing, deals a card, and is gone until tomorrow', async ({ page }) => {
    await readyHero(page, 5);
    await openTable(page);

    await expect(page.getByTestId('free-card-chip')).toBeVisible();
    await expect(page.getByTestId('roll-daily')).toHaveText('Free card');

    await spin(page, 'roll-daily');

    const after = await read(page);
    expect(after.dice).toBe(5);
    expect(after.gacha.freeRollsToday).toBe(1);
    expect(after.gacha.rolls).toBe(1);

    await expect(page.getByTestId('free-card-chip')).toHaveCount(0);
    await expect(page.getByTestId('roll-daily')).toContainText('Draw');
  });

  test('says what it cannot do rather than going quiet', async ({ page }) => {
    await readyHero(page, 0);
    await openTable(page);

    const weekly = page.getByTestId('roll-weekly');
    await expect(weekly).toBeDisabled();
    await expect(weekly).toHaveAttribute('data-reason', /earned/i);

    const ten = page.getByTestId('roll-ten-monthly');
    await expect(ten).toBeDisabled();
    await expect(ten).toHaveAttribute('data-reason', /no discount/i);
    expect((await read(page)).gacha.rolls).toBe(0);
  });
});

test.describe('pity in public', () => {
  test('counts up on screen and pays out on the twentieth card', async ({ page }) => {
    await readyHero(page, 40);
    await openTable(page);

    const meter = page.getByTestId('banner-weekly').getByTestId('pity-meter');
    await expect(meter).toBeVisible();
    await expect(page.getByTestId('banner-weekly').getByTestId('pity-count')).toHaveText('0/20');

    // One paid roll adopts this week's set as the counter's set.
    await spin(page, 'roll-weekly');
    const adopted = await read(page);
    expect(adopted.gacha.weeklyPitySet).not.toBeNull();

    // Wind it to the brink. The meter has to say so before the click, not after.
    await seed(page, { weeklyPity: 20 });
    await page.reload();
    await expect(page.getByTestId('place-fortune')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('banner-weekly').getByTestId('pity-count')).toHaveText('20/20');
    await expect(meter).toContainText('Guaranteed');

    await page.getByTestId('roll-weekly').click();
    await expect(page.getByTestId('roll-ceremony')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('roll-skip').click();
    // A Set-rarity card, and the reveal marks it as owed rather than passing it off as luck.
    await expect(page.getByTestId('card-0')).toHaveAttribute('data-tone', 'set');
    await page.getByTestId('roll-continue').click();

    const paid = await read(page);
    expect(paid.gacha.weeklyPity).toBe(0);
    expect(paid.gacha.history[0]!.pitied).toBe(true);
    await expect(page.getByTestId('banner-weekly').getByTestId('pity-count')).toHaveText('0/20');
  });
});

test.describe('the roll moment', () => {
  test('deals ten cards on one spread and banks them all', async ({ page }) => {
    await readyHero(page, 40);
    await openTable(page);

    const before = await read(page);
    await page.getByTestId('roll-ten-monthly').click();
    await expect(page.getByTestId('roll-ceremony')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('roll-skip').click();

    await expect(
      page.locator('[data-testid^="card-"]:not([data-testid="card-spread"])'),
    ).toHaveCount(10);
    // Every card is face-up once the spread has been turned over.
    await expect(page.locator('[data-revealed="true"]')).toHaveCount(10);
    await page.getByTestId('roll-continue').click();

    const after = await read(page);
    expect(after.dice).toBe(before.dice - 10);
    expect(after.gacha.rolls).toBe(10);
    expect(after.gacha.monthlyRolls).toBe(10);
    expect(after.gacha.history).toHaveLength(10);
  });

  test('banks the result before the ceremony, so a reload cannot lose it', async ({ page }) => {
    await readyHero(page, 40);
    await openTable(page);

    await page.getByTestId('roll-weekly').click();
    await expect(page.getByTestId('roll-ceremony')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // Walk out mid-animation. The card was written to the save before the first frame.
    await flush(page);
    await page.reload();
    await expect(page.getByTestId('place-fortune')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const after = await read(page);
    expect(after.gacha.rolls).toBe(1);
    expect(after.dice).toBe(39);
    await expect(page.getByTestId('roll-ceremony')).toHaveCount(0);
  });

  test('pays the monthly track out loud when a spread crosses a rung', async ({ page }) => {
    await readyHero(page, 40);
    await openTable(page);
    await seed(page, { monthlyRolls: 10, monthlyPaidThrough: 10 });
    await page.reload();
    await expect(page.getByTestId('place-fortune')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('roll-ten-monthly').click();
    await expect(page.getByTestId('roll-ceremony')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('roll-skip').click();

    await expect(page.getByTestId('track-rung')).toHaveCount(1);
    await expect(page.getByTestId('roll-extras')).toContainText('pattern');
    await page.getByTestId('roll-continue').click();

    // The pattern actually reached Torvald's bench, and the rung is now drawn as paid.
    const after = await read(page);
    expect(after.recipes).toHaveLength(1);
    expect(after.gacha.monthlyPaidThrough).toBe(20);
    await expect(page.getByTestId('banner-monthly').getByTestId('track-rung-1')).toHaveAttribute(
      'data-paid',
      'true',
    );
  });
});

test.describe('the receipt', () => {
  test('logs every card, marking the free ones free and the owed ones owed', async ({ page }) => {
    await readyHero(page, 40);
    await openTable(page);

    await expect(page.getByTestId('history-empty')).toBeVisible();

    await spin(page, 'roll-daily');
    await spin(page, 'roll-weekly');

    const rows = page.locator('[data-testid="history-row"]');
    await expect(rows).toHaveCount(2);
    // Newest first: the weekly roll is on top, the free daily beneath it.
    await expect(rows.nth(1)).toContainText('free');

    const after = await read(page);
    expect(after.gacha.history[0]!.bannerId).toBe('weekly');
    expect(after.gacha.history[1]!.free).toBe(true);

    // And it survives a reload, because it is a save and not a screen state.
    await flush(page);
    await page.reload();
    await expect(page.getByTestId('place-fortune')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.locator('[data-testid="history-row"]')).toHaveCount(2);
  });
});

test.describe('the gate', () => {
  test('keeps a level-1 hero out of the back room, even by URL', async ({ page }) => {
    await page.goto('/character');
    const creation = page.getByTestId('hero-creation');
    const paperdoll = page.getByTestId('paperdoll');
    await expect(creation.or(paperdoll).first()).toBeVisible({ timeout: SETUP_TIMEOUT });
    if (await creation.isVisible()) {
      await page.getByTestId('class-bard').click();
      await page.getByTestId('hero-name').fill('Ysolde');
      await expect(page.getByTestId('confirm-hero')).toBeEnabled({ timeout: SETUP_TIMEOUT });
      await page.getByTestId('confirm-hero').click();
      await expect(paperdoll).toBeVisible({ timeout: SETUP_TIMEOUT });
      await flush(page);
    }

    await page.goto('/fortune');
    await expect(page.getByTestId('locked-fortune')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('locked-fortune')).toContainText('level 8');
    await expect(page.getByTestId('place-fortune')).toHaveCount(0);
  });
});
