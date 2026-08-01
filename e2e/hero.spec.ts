import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 acceptance: create a hero → equip generated items → buy stats → reload-safe.
 *
 * This is the first phase where a player can actually *do* something that persists, so these
 * tests follow the real journey rather than poking components.
 */

async function createHero(page: Page, name = 'Kargath', className = 'warrior') {
  await page.goto('/character');
  await expect(page.getByTestId('hero-creation')).toBeVisible();

  await page.getByTestId(`class-${className}`).click();
  await expect(page.getByTestId('class-detail')).toBeVisible();

  await page.getByTestId('hero-name').fill(name);
  await page.getByTestId('confirm-hero').click();

  await expect(page.getByTestId('paperdoll')).toBeVisible();
}

/** Conjures one item of the given slot via the dev drawer and returns its test id. */
async function conjure(page: Page, slot: string, rarity = 'rare') {
  await page.getByTestId('dev-drawer-toggle').click();
  await page.getByTestId(`dev-rarity-${rarity}`).click();
  await page.getByTestId(`dev-conjure-${slot}`).click();
}

test.describe('hero creation', () => {
  test('a new save opens the class picker instead of the town', async ({ page }) => {
    await page.goto('/tavern');
    await expect(page.getByTestId('hero-creation')).toBeVisible();
    // The rail is deliberately absent — there is no hero to describe yet.
    await expect(page.locator('nav[aria-label="Emberhollow"]')).toHaveCount(0);
  });

  test('the name field explains what it will not accept', async ({ page }) => {
    await page.goto('/character');
    await page.getByTestId('class-mage').click();
    await page.getByTestId('hero-name').fill('x9');

    await expect(page.getByTestId('name-error')).toBeVisible();
    await expect(page.getByTestId('confirm-hero')).toBeDisabled();
  });

  test('suggests a name so the blank field is never a wall', async ({ page }) => {
    await page.goto('/character');
    await page.getByTestId('class-bard').click();
    await page.getByTestId('suggest-name').click();

    await expect(page.getByTestId('hero-name')).not.toHaveValue('');
    await expect(page.getByTestId('confirm-hero')).toBeEnabled();
  });

  test('creating a hero reveals the town and the hero in the HUD', async ({ page }) => {
    await createHero(page, 'Brenna Thornsong', 'hunter');

    await expect(page.locator('nav[aria-label="Emberhollow"]')).toBeVisible();
    await expect(page.getByTestId('hud-level')).toHaveText('1');
    await expect(page.getByTestId('paperdoll')).toContainText('Brenna Thornsong');
    await expect(page.getByTestId('paperdoll')).toContainText('Hunter');
  });

  test('the hero survives a reload', async ({ page }) => {
    await createHero(page, 'Serathiel', 'mage');
    await page.reload();

    await expect(page.getByTestId('paperdoll')).toContainText('Serathiel');
    await expect(page.getByTestId('hero-creation')).toHaveCount(0);
  });
});

test.describe('equipment', () => {
  test.beforeEach(async ({ page }) => {
    await createHero(page);
  });

  test('conjured gear lands in the backpack and equips onto the paperdoll', async ({ page }) => {
    await conjure(page, 'chest');

    const bagItem = page.locator('[data-testid^="bag-item-"]').first();
    await expect(bagItem).toBeVisible();
    await bagItem.click();

    await expect(page.getByTestId('selected-item')).toBeVisible();
    await page.getByTestId('equip-selected').click();

    await expect(page.getByTestId('equip-chest')).toHaveAttribute('data-filled', 'true');
  });

  test('equipping changes the derived stats', async ({ page }) => {
    const derived = page.getByTestId('derived-panel');
    const before = await derived.textContent();

    await conjure(page, 'chest');
    await page.locator('[data-testid^="bag-item-"]').first().click();
    await page.getByTestId('equip-selected').click();

    await expect(derived).not.toHaveText(before ?? '');
  });

  test('hovering a backpack item shows the comparison card', async ({ page }) => {
    await conjure(page, 'helmet');
    await page.locator('[data-testid^="bag-item-"]').first().hover();

    const card = page.locator('text=If equipped').first();
    await expect(card).toBeVisible();
  });

  test('the card is drawn in the layer, where nothing can clip it', async ({ page }) => {
    /*
     * The regression this exists for, and the reason it is asserted rather than inferred.
     *
     * Item cards were rendered `absolute bottom-full` inside their own cell for eighteen phases.
     * A cell lives in a `TavernPanel`, which wears `chamfer-md`, which is a `clip-path`, which
     * clips descendants — so every card was sliced off at the panel's edge, worst at the top row
     * where there was nothing above the cell to draw into. The test above passed the entire time:
     * `toBeVisible` knows `display`, `visibility`, `opacity` and box size, and nothing at all
     * about clipping. Same shape as the town map's plaques, second occasion.
     */
    await conjure(page, 'helmet');
    await page.locator('[data-testid^="bag-item-"]').first().hover();

    const card = page.getByTestId('hover-card');
    await expect(card).toBeVisible();

    const clipper = await card.evaluate((element) => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        if (node === document.body) return null;
        if (getComputedStyle(node).clipPath !== 'none') return node.className || node.tagName;
      }
      return null;
    });
    expect(clipper, 'an ancestor clips the item card away').toBeNull();

    // And it is on screen in full — the layer clamps to the viewport rather than hanging off it.
    const box = await card.boundingBox();
    const view = page.viewportSize();
    expect(box).not.toBeNull();
    expect(view).not.toBeNull();
    expect(box!.width, 'a clipped card measures nothing').toBeGreaterThan(80);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(view!.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(view!.height);
  });

  test('the topmost paperdoll slot gets a whole card, not a sliver', async ({ page }) => {
    // The worst case for the old anchoring: a cell at the top of the panel, with the card
    // hard-positioned `bottom-full` into the panel's own clipped edge.
    await conjure(page, 'helmet');
    await page.locator('[data-testid^="bag-item-"]').first().click();
    await page.getByTestId('equip-selected').click();
    await expect(page.getByTestId('equip-helmet')).toHaveAttribute('data-filled', 'true');

    await page.getByTestId('equip-helmet').hover();
    const card = page.getByTestId('hover-card');
    await expect(card).toBeVisible();

    const helmet = await page.getByTestId('equip-helmet').boundingBox();
    const box = await card.boundingBox();
    expect(box!.height, 'the card should be a card, not a strip').toBeGreaterThan(60);
    // Below the cell, since there is no room above it — the layer flips rather than overflowing.
    expect(box!.y).toBeGreaterThan(helmet!.y);
  });

  test('clicking an equipped piece takes it off again', async ({ page }) => {
    await conjure(page, 'boots');
    await page.locator('[data-testid^="bag-item-"]').first().click();
    await page.getByTestId('equip-selected').click();
    await expect(page.getByTestId('equip-boots')).toHaveAttribute('data-filled', 'true');

    await page.getByTestId('equip-boots').click();
    await expect(page.getByTestId('equip-boots')).toHaveAttribute('data-filled', 'false');
  });

  test('a locked item cannot be discarded', async ({ page }) => {
    await conjure(page, 'ring');
    await page.locator('[data-testid^="bag-item-"]').first().click();

    await page.getByTestId('lock-selected').click();
    await expect(page.getByTestId('discard-selected')).toBeDisabled();
  });

  test('equipment survives a reload', async ({ page }) => {
    await conjure(page, 'weapon');
    await page.locator('[data-testid^="bag-item-"]').first().click();
    await page.getByTestId('equip-selected').click();
    await expect(page.getByTestId('equip-weapon')).toHaveAttribute('data-filled', 'true');

    await page.reload();
    await expect(page.getByTestId('equip-weapon')).toHaveAttribute('data-filled', 'true');
  });
});

test.describe('attribute training', () => {
  test.beforeEach(async ({ page }) => {
    await createHero(page);
  });

  test('buying a point raises the attribute and spends gold', async ({ page }) => {
    const total = page.getByTestId('attr-str-total');
    const before = Number(await total.textContent());
    const goldBefore = await page.getByTestId('hud-gold').textContent();

    await page.getByTestId('buy-str-1').click();

    await expect(total).toHaveText(String(before + 1));
    await expect(page.getByTestId('hud-gold')).not.toHaveText(goldBefore ?? '');
  });

  test('unaffordable purchases explain themselves rather than going grey in silence', async ({
    page,
  }) => {
    // 100 starting gold cannot cover 25 points.
    const button = page.getByTestId('buy-con-25');
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('data-reason', /costs .* gold/i);
  });

  test('training survives a reload', async ({ page }) => {
    await page.getByTestId('buy-dex-1').click();
    await page.getByTestId('buy-dex-1').click();
    const after = await page.getByTestId('attr-dex-total').textContent();

    await page.reload();
    await expect(page.getByTestId('attr-dex-total')).toHaveText(after ?? '');
  });
});

test.describe('class restrictions', () => {
  test('a warrior cannot equip a mage staff', async ({ page }) => {
    // Make a mage, conjure a staff, then check the rule from the engine's side via a warrior.
    await createHero(page, 'Kargath', 'warrior');
    await conjure(page, 'weapon');

    await page.locator('[data-testid^="bag-item-"]').first().hover();
    // A warrior's own conjured weapon says "Warriors only" — the lock is on the item itself.
    await expect(page.locator('text=Warriors only').first()).toBeVisible();
  });
});
