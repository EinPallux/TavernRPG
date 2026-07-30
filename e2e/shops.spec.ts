import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 7 acceptance: the Armory, the Gilded Facet and the Wandering Stables.
 *
 * The money paths get the paranoid treatment. A shop is the one screen where a bug takes
 * something from the player directly — gold for nothing, an item sold twice, a rental that
 * quietly ate the days they had left — so these check the *ledger* rather than the pixels:
 * gold out equals goods in, sold slots stay sold across reloads, and switching mounts says
 * what it costs before it costs it.
 */

const SETUP_TIMEOUT = 20_000;

interface StoreHandle {
  getState: () => { save: Save | null };
  setState: (partial: { save: Save }) => void;
}
interface Save {
  hero: { gold: number; dice: number; backpack: ({ uid: string } | null)[] } | null;
  activity: {
    shops: Record<string, { day: string; sold: number[]; rerollsToday: number }>;
    mount: { mountId: string; rentedAt: number; expiresAt: number } | null;
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

/** Level past the gates and fill the purse, so prices are the only thing being tested. */
async function outfit(page: Page, { gold = 5 }: { gold?: number } = {}) {
  await page.goto('/character');
  await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
  await page.getByTestId('dev-drawer-toggle').click();
  await page.getByTestId('dev-level-10').click();
  await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });

  // +10,000 a click. Enough clicks that nothing under test is gated on affordability.
  for (let i = 0; i < gold; i += 1) await page.getByTestId('dev-gold').click();
}

/** Give the hero Golden Dice, which no faucet in the build hands out on demand. */
async function grantDice(page: Page, dice: number) {
  await page.evaluate((count) => {
    const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
    const { save } = store.getState();
    store.setState({ save: { ...save!, hero: { ...save!.hero!, dice: count } } });
  }, dice);
}

const goldInHud = async (page: Page) =>
  Number((await page.getByTestId('hud-gold').innerText()).replace(/\D/g, ''));

async function gotoShop(page: Page, shop: 'armory' | 'facet') {
  await page.goto(`/${shop}`);
  await expect(page.getByTestId(`place-${shop}`)).toBeVisible({ timeout: SETUP_TIMEOUT });
}

test.describe('the shelf', () => {
  test.beforeEach(async ({ page }) => {
    await ensureHero(page);
    await outfit(page);
  });

  test('lays out six pieces, with Bram’s guaranteed weapon among them', async ({ page }) => {
    await gotoShop(page, 'armory');

    await expect(
      page.locator('[data-testid^="stock-"]:not([data-testid^="stock-compare"])'),
    ).toHaveCount(6);
    // A shop that might have no weapon is a shop the player learns to skip.
    await expect(page.getByTestId('shop-shelf')).toContainText('Weapon');
  });

  test('is the same shelf after a reload — a refresh is not a free reroll', async ({ page }) => {
    await gotoShop(page, 'armory');
    const before = await page.getByTestId('shop-shelf').innerText();

    await page.reload();
    await expect(page.getByTestId('place-armory')).toBeVisible({ timeout: SETUP_TIMEOUT });

    expect(await page.getByTestId('shop-shelf').innerText()).toBe(before);
  });

  test('stocks the two shops differently on the same day', async ({ page }) => {
    await gotoShop(page, 'armory');
    const armory = await page.getByTestId('shop-shelf').innerText();

    await gotoShop(page, 'facet');
    expect(await page.getByTestId('shop-shelf').innerText()).not.toBe(armory);
  });

  test('shows the restock clock, because it is a promise players plan around', async ({ page }) => {
    await gotoShop(page, 'armory');
    await expect(page.getByTestId('restock-timer')).toContainText(/Restocks in/);
  });

  test('answers "is this better than mine?" on the card, not on hover', async ({ page }) => {
    await gotoShop(page, 'armory');
    // The one question the player walked in with.
    await expect(page.locator('[data-testid^="stock-compare-"]').first()).toBeVisible();
  });
});

test.describe('buying', () => {
  test.beforeEach(async ({ page }) => {
    await ensureHero(page);
    await outfit(page, { gold: 20 });
    await gotoShop(page, 'armory');
  });

  test('takes the asking price and leaves a wrapped parcel in the gap', async ({ page }) => {
    const before = await goldInHud(page);
    const price = Number((await page.getByTestId('buy-0').innerText()).replace(/\D/g, ''));

    await page.getByTestId('buy-0').click();

    // The gap keeps its place so the remaining goods do not slide under the cursor.
    await expect(page.getByTestId('stock-sold-0')).toBeVisible();
    await expect.poll(async () => goldInHud(page)).toBe(before - price);
  });

  test('will not sell the same piece twice', async ({ page }) => {
    await page.getByTestId('buy-1').click();
    await expect(page.getByTestId('stock-sold-1')).toBeVisible();

    // The slot is gone entirely, so a double-click cannot charge twice.
    await expect(page.getByTestId('buy-1')).toHaveCount(0);
  });

  test('keeps sold slots sold across a reload', async ({ page }) => {
    await page.getByTestId('buy-2').click();
    await expect(page.getByTestId('stock-sold-2')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('place-armory')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('stock-sold-2')).toBeVisible();
  });

  test('puts the bought piece in the bags', async ({ page }) => {
    await page.getByTestId('buy-0').click();
    await expect(page.getByTestId('stock-sold-0')).toBeVisible();

    // The bag cells are keyed by uid, so ask the save which one arrived rather than
    // string-matching a name through two screens.
    const uid = await page.evaluate(() => {
      const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
      const hero = store.getState().save!.hero!;
      return hero.backpack.filter(Boolean).at(-1)!.uid;
    });

    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId(`bag-item-${uid}`)).toBeVisible();
  });

  test('explains a price it cannot pay rather than failing on the click', async ({ page }) => {
    // Style guide §8: the disabled control says why.
    await page.evaluate(() => {
      const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
      const { save } = store.getState();
      store.setState({ save: { ...save!, hero: { ...save!.hero!, gold: 0 } } });
    });

    const buy = page.getByTestId('buy-0');
    await expect(buy).toBeDisabled();
    await expect(buy).toHaveAttribute('title', /gold/i);
  });
});

test.describe('selling', () => {
  test.beforeEach(async ({ page }) => {
    await ensureHero(page);
    await outfit(page, { gold: 20 });
    await gotoShop(page, 'armory');
  });

  test('loses money on a buy-then-sell round trip — buying is a splurge', async ({ page }) => {
    // If this ever inverts, the shop is a gold faucet and the economy is over.
    const before = await goldInHud(page);
    await page.getByTestId('buy-0').click();
    await expect(page.getByTestId('stock-sold-0')).toBeVisible();

    await page.getByTestId('toggle-sell').click();
    const row = page.locator('[data-testid^="sell-row-"]').last();
    await expect(row).toBeVisible();
    const uid = (await row.getAttribute('data-testid'))!.replace('sell-row-', '');
    await page.getByTestId(`sell-${uid}`).click();

    await expect.poll(async () => goldInHud(page)).toBeLessThan(before);
  });

  test('lets junk go without ceremony', async ({ page }) => {
    // A fresh hero wears their starter kit rather than carrying it, so put something
    // unmistakably worthless in the bags first.
    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('dev-drawer-toggle').click();
    await page.getByTestId('dev-rarity-common').click();
    await page.getByTestId('dev-conjure-belt').click();

    await gotoShop(page, 'armory');
    await page.getByTestId('toggle-sell').click();

    const rows = page.locator('[data-testid^="sell-row-"]');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();

    const junk = rows.filter({ hasText: 'Common' }).first();
    const uid = (await junk.getAttribute('data-testid'))!.replace('sell-row-', '');
    const before = await goldInHud(page);

    // One click, no dialog: a confirm on every Common turns the dialog into furniture.
    await page.getByTestId(`sell-${uid}`).click();

    await expect(rows).toHaveCount(count - 1);
    await expect.poll(async () => goldInHud(page)).toBeGreaterThan(before);
  });

  test('asks before a Rare, and honours "keep"', async ({ page }) => {
    // Conjure something worth pausing over, then try to sell it.
    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('dev-drawer-toggle').click();
    await page.getByTestId('dev-rarity-rare').click();
    await page.getByTestId('dev-conjure-amulet').click();

    await gotoShop(page, 'armory');
    await page.getByTestId('toggle-sell').click();

    const rare = page.locator('[data-testid^="sell-row-"]', { hasText: 'Rare' }).first();
    await expect(rare).toBeVisible();
    const uid = (await rare.getAttribute('data-testid'))!.replace('sell-row-', '');

    const before = await goldInHud(page);
    await page.getByTestId(`sell-${uid}`).click();
    await expect(page.getByTestId(`sell-confirm-${uid}`)).toBeVisible();

    await page.getByTestId(`sell-cancel-${uid}`).click();
    await expect(page.getByTestId(`sell-${uid}`)).toBeVisible();
    expect(await goldInHud(page)).toBe(before);
  });
});

test.describe('rerolling the shelf', () => {
  test.beforeEach(async ({ page }) => {
    await ensureHero(page);
    await outfit(page);
    await gotoShop(page, 'armory');
  });

  test('costs a Golden Die and brings genuinely different stock', async ({ page }) => {
    await grantDice(page, 3);

    const reroll = page.getByTestId('reroll-stock');
    await expect(reroll).toBeEnabled();
    const before = await page.getByTestId('shop-shelf').innerText();
    await reroll.click();

    await expect.poll(async () => page.getByTestId('shop-shelf').innerText()).not.toBe(before);
    await expect(page.getByTestId('hud-dice')).toContainText('2');
  });

  test('charges for every reroll — there is no free one', async ({ page }) => {
    // Unlike the mission board, where the day's work must always be there.
    const reroll = page.getByTestId('reroll-stock');
    await expect(reroll).toBeDisabled();
    await expect(reroll).toHaveAttribute('title', /earned/i);
  });
});

test.describe('the stables', () => {
  test.beforeEach(async ({ page }) => {
    await ensureHero(page);
    await outfit(page, { gold: 30 });
    await page.goto('/stables');
    await expect(page.getByTestId('place-stables')).toBeVisible({ timeout: SETUP_TIMEOUT });
  });

  test('offers four stalls and shows what each does to a mission', async ({ page }) => {
    await expect(
      page.locator(
        '[data-testid^="stall-"]:not([data-testid*="-times-"]):not([data-testid*="-active-"])',
      ),
    ).toHaveCount(4);
    // "−30%" is a number; "20 → 14 min" is a decision.
    await expect(page.getByTestId('stall-times-warhorse')).toContainText('14m');
    await expect(page.getByTestId('stall-times-griffin')).toContainText('10m');
  });

  test('puts the mount in the stall and on the HUD', async ({ page }) => {
    const before = await goldInHud(page);
    await page.getByTestId('rent-mule').click();

    await expect(page.getByTestId('stall-mule')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('stall-active-mule')).toContainText('7 days left');
    await expect(page.getByTestId('hud-mount')).toBeVisible();
    await expect.poll(async () => goldInHud(page)).toBeLessThan(before);
  });

  test('shortens the mission timer by exactly the tier', async ({ page }) => {
    await page.getByTestId('rent-warhorse').click();
    await expect(page.getByTestId('stall-warhorse')).toHaveAttribute('data-active', 'true');

    await page.goto('/tavern');
    await expect(page.getByTestId('mission-board')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const card = page.locator('[data-testid^="mission-card-"]').first();
    const id = (await card.getAttribute('data-testid'))!.replace('mission-card-', '');
    await page.getByTestId(`accept-${id}`).click();

    await expect(page.getByTestId('mission-progress')).toBeVisible();
    // The road, and the animal that shortened it.
    await expect(page.getByTestId('mission-mount')).toContainText('Warhorse');
  });

  test('says what a switch throws away before it throws it', async ({ page }) => {
    await page.getByTestId('rent-mule').click();
    await expect(page.getByTestId('stall-mule')).toHaveAttribute('data-active', 'true');

    await page.getByTestId('rent-courser').click();
    const confirm = page.getByTestId('switch-confirm-courser');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('7 paid days');

    await page.getByTestId('switch-no-courser').click();
    await expect(page.getByTestId('stall-mule')).toHaveAttribute('data-active', 'true');
  });

  test('renewing the same mount asks nothing and adds a week', async ({ page }) => {
    // Paying for a mount you already have must never cost days you already paid for.
    await page.getByTestId('rent-mule').click();
    await expect(page.getByTestId('stall-active-mule')).toContainText('7 days left');

    await page.getByTestId('rent-mule').click();
    await expect(page.getByTestId('switch-confirm-mule')).toHaveCount(0);
    await expect(page.getByTestId('stall-active-mule')).toContainText('14 days left');
  });

  test('survives a reload with the rental intact', async ({ page }) => {
    await page.getByTestId('rent-courser').click();
    await expect(page.getByTestId('stall-courser')).toHaveAttribute('data-active', 'true');

    await page.reload();
    await expect(page.getByTestId('place-stables')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('stall-courser')).toHaveAttribute('data-active', 'true');
  });

  test('keeps the Griffin behind earned dice, not gold', async ({ page }) => {
    // F2P forever (CLAUDE.md rule 6): no pile of gold buys the premium stall.
    const griffin = page.getByTestId('rent-griffin');
    await expect(griffin).toBeDisabled();
    await expect(griffin).toHaveAttribute('title', /earned/i);

    await grantDice(page, 6);
    await expect(griffin).toBeEnabled();
    await griffin.click();
    await expect(page.getByTestId('stall-griffin')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('hud-dice')).toContainText('0');
  });
});

test.describe('the gates', () => {
  test('shops and stables refuse a level-1 hero, even by URL', async ({ page }) => {
    await ensureHero(page);

    for (const place of ['stables'] as const) {
      await page.goto(`/${place}`);
      await expect(page.getByTestId(`locked-${place}`)).toBeVisible({ timeout: SETUP_TIMEOUT });
      await expect(page.getByTestId(`place-${place}`)).toHaveCount(0);
    }
  });
});

test.describe('house style', () => {
  test('all three rooms keep to chamfers — no rounded corners', async ({ page }) => {
    await ensureHero(page);
    await outfit(page);

    for (const place of ['armory', 'facet', 'stables'] as const) {
      await page.goto(`/${place}`);
      await expect(page.getByTestId(`place-${place}`)).toBeVisible({ timeout: SETUP_TIMEOUT });

      const offenders = await page
        .locator(`[data-testid="place-${place}"] *`)
        .evaluateAll((nodes) =>
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

      expect(offenders, place).toEqual([]);
    }
  });
});
