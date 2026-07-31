import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 12 acceptance: the Emberforge and the Set Collections tab, from the player's side.
 *
 * The engine tests already prove the odds match the config over 100k rolls, that pity fires at
 * five, and that every five-piece bonus changes a fight. These prove the parts only a browser
 * can: the **published odds are on the tile** rather than in a doc, a Set piece **asks twice**
 * before it melts, the daily cap **explains itself instead of just refusing**, the ceremony
 * **resolves to a real item in the bags**, and the collections page **separates worn from owned**.
 *
 * As everywhere else in this suite, anything that mutates then navigates flushes first: the
 * store's autosave is asynchronous and a reload without a flush is racing its own write.
 */

const SETUP_TIMEOUT = 20_000;

interface StoreHandle {
  getState: () => { save: Save | null; flush: () => Promise<void> };
  setState: (partial: { save: Save }) => void;
}
interface Materials {
  scrap: number;
  essence: number;
  starmetal: number;
}
interface Save {
  hero: {
    level: number;
    gold: number;
    classId: string;
    materials: Materials;
    openingVerse: string | null;
    equipment: Record<string, unknown>;
    backpack: unknown[];
    satchel: unknown[];
  } | null;
  forge: {
    scrapsUsedToday: number;
    emberMeter: number;
    recipes: string[];
    crafted: number;
  };
}

const read = (page: Page) =>
  page.evaluate(() => {
    const handle = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
    const { save } = handle.getState();
    const bags = [...(save?.hero?.backpack ?? []), ...(save?.hero?.satchel ?? [])].filter(Boolean);
    return {
      materials: save?.hero?.materials ?? { scrap: 0, essence: 0, starmetal: 0 },
      scrapsUsedToday: save?.forge.scrapsUsedToday ?? 0,
      emberMeter: save?.forge.emberMeter ?? 0,
      crafted: save?.forge.crafted ?? 0,
      recipes: save?.forge.recipes ?? [],
      openingVerse: save?.hero?.openingVerse ?? null,
      bagCount: bags.length,
      setPiecesInBags: (bags as { setId?: string }[]).filter((item) => item.setId).length,
    };
  });

const flush = (page: Page) =>
  page.evaluate(async () => {
    await (window as unknown as { __tavernStore: StoreHandle }).__tavernStore.getState().flush();
  });

/**
 * A hero past the level-6 gate, with the bags full of meltable gear.
 *
 * Waits for creation-or-paperdoll rather than paperdoll alone, for the reason `arena.spec.ts`
 * spells out: `/character` renders the class picker when there is no hero, so a slow load lands
 * on the picker and a bare paperdoll wait spends its whole timeout looking at the wrong screen.
 */
async function readyHero(
  page: Page,
  options: {
    classId?: string;
    name?: string;
    materials?: Partial<Materials>;
    forge?: Partial<Save['forge']>;
  } = {},
) {
  await page.goto('/character');

  const creation = page.getByTestId('hero-creation');
  const paperdoll = page.getByTestId('paperdoll');
  await expect(creation.or(paperdoll).first()).toBeVisible({ timeout: SETUP_TIMEOUT });
  if (await creation.isVisible()) {
    await page.getByTestId(`class-${options.classId ?? 'bard'}`).click();
    await page.getByTestId('hero-name').fill(options.name ?? 'Ysolde');
    await expect(page.getByTestId('confirm-hero')).toBeEnabled({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('confirm-hero').click();
  }
  await expect(paperdoll).toBeVisible({ timeout: SETUP_TIMEOUT });

  await page.getByTestId('dev-drawer-toggle').click();
  await page.getByTestId('dev-level-10').click();
  await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });

  // Ten pieces in the bags to melt, and a purse of materials to gamble with.
  await page.getByTestId('dev-rarity-rare').click();
  await page.getByTestId('dev-conjure-all').click();
  await expect(page.locator('[data-testid^="bag-item-"]')).toHaveCount(10, {
    timeout: SETUP_TIMEOUT,
  });

  await page.evaluate(async (seed) => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const { save } = handle.getState();
    if (!save?.hero) throw new Error('no hero');

    handle.setState({
      save: {
        ...save,
        hero: {
          ...save.hero,
          gold: 200_000,
          materials: { scrap: 180, essence: 90, starmetal: 6, ...seed.materials },
        },
        forge: { ...save.forge, ...seed.forge },
      },
    });
    await handle.getState().flush();
  }, options);
}

/** The uid of the first row in the crucible list, whatever the day's gear turned out to be. */
async function firstMeltable(page: Page): Promise<string> {
  const row = page.locator('[data-testid^="scrap-row-"]').first();
  await expect(row).toBeVisible({ timeout: SETUP_TIMEOUT });
  const testid = await row.getAttribute('data-testid');
  return testid!.replace('scrap-row-', '');
}

test.describe('the crucible', () => {
  test('melts a piece, pays materials, and counts the day down', async ({ page }) => {
    await readyHero(page);
    await page.goto('/forge');
    await expect(page.getByTestId('place-forge')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const before = await read(page);
    expect(before.scrapsUsedToday).toBe(0);
    await expect(page.getByTestId('scrap-cap')).toContainText('10/10 melts left today');

    // A Rare asks once. The confirm expands the row rather than covering the thing it is
    // asking about, so the item and the question are on screen together.
    const uid = await firstMeltable(page);
    await page.getByTestId(`scrap-${uid}`).click();
    await expect(page.getByTestId(`scrap-confirm-${uid}`)).toBeVisible();
    await page.getByTestId(`scrap-confirm-${uid}`).click();

    await expect(page.getByTestId('smelt-yield')).toBeVisible();
    await expect(page.getByTestId('scrap-cap')).toContainText('9/10 melts left today');

    const after = await read(page);
    expect(after.scrapsUsedToday).toBe(1);
    expect(after.bagCount).toBe(before.bagCount - 1);
    // Rares pay Essence (crafting spec §1) — the wallet, not the purse.
    expect(after.materials.essence).toBeGreaterThan(before.materials.essence);
    expect(after.materials.scrap).toBe(before.materials.scrap);
  });

  test('the daily cap says what it is and survives a reload', async ({ page }) => {
    await readyHero(page, { forge: { scrapsUsedToday: 10 } });
    await page.goto('/forge');
    await expect(page.getByTestId('place-forge')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // A refusal, phrased. Not a greyed row with no explanation.
    await expect(page.getByTestId('scrap-cap')).toContainText('Crucible cools in');
    await expect(page.getByTestId('bark-forge')).toContainText(/crucible|fire will take/i);

    // Every row is out of action, and each says why in its own right.
    const rows = page.locator('[data-testid^="scrap-row-"]');
    await expect(rows.first()).toContainText('cap reached');
    await expect(page.locator('[data-testid^="scrap-"][data-testid$="-confirm"]')).toHaveCount(0);

    await flush(page);
    await page.reload();
    await expect(page.getByTestId('scrap-cap')).toContainText('Crucible cools in', {
      timeout: SETUP_TIMEOUT,
    });
    expect((await read(page)).scrapsUsedToday).toBe(10);
  });
});

test.describe('the anvil', () => {
  test('publishes its odds and they are the engine numbers — ROADMAP acceptance', async ({
    page,
  }) => {
    await readyHero(page);
    await page.goto('/forge');
    await page.getByTestId('bench-bench').click();

    // Every tier prints its whole distribution before a single material is spent (rule 6).
    for (const tier of ['rough', 'fine', 'master']) {
      await expect(page.getByTestId(`forge-tier-${tier}`)).toBeVisible();
      await expect(page.getByTestId(`odds-${tier}`)).toBeVisible();
    }
    await expect(page.getByTestId('odds-rough')).toContainText('45%');
    await expect(page.getByTestId('odds-rough')).toContainText('1%');
    await expect(page.getByTestId('odds-master')).toContainText('23%');
    await expect(page.getByTestId('odds-master')).toContainText('0%');

    // And the pity track is published too — a floor nobody can see is just luck.
    await expect(page.getByTestId('ember-meter')).toContainText('0/5');
  });

  test('a strike is a ceremony that ends with the item in your bags', async ({ page }) => {
    await readyHero(page);
    await page.goto('/forge');
    await page.getByTestId('bench-bench').click();

    const before = await read(page);

    // The whole point of the room: *you* pick the slot.
    await page.getByTestId('forge-slot-boots').click();
    await page.getByTestId('craft-fine').click();

    await expect(page.getByTestId('anvil-strike')).toBeVisible();
    await expect(page.getByTestId('craft-reveal')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('craft-item')).toContainText('Boots');
    await page.getByTestId('craft-continue').click();
    await expect(page.getByTestId('anvil-strike')).toBeHidden();

    const after = await read(page);
    expect(after.crafted).toBe(before.crafted + 1);
    expect(after.bagCount).toBe(before.bagCount + 1);
    // A Fine forge costs 30 Scrap and 6 Essence, and does not feed the ember meter.
    expect(after.materials.scrap).toBe(before.materials.scrap - 30);
    expect(after.materials.essence).toBe(before.materials.essence - 6);
    expect(after.emberMeter).toBe(0);
  });

  test('the ember meter pays out, says so, and resets', async ({ page }) => {
    await readyHero(page, { forge: { emberMeter: 5 } });
    await page.goto('/forge');
    await page.getByTestId('bench-bench').click();

    // At five the tile stops being a gamble and says so on its face.
    await expect(page.getByTestId('ember-meter')).toContainText('5/5');
    await expect(page.getByTestId('ember-meter')).toContainText('Guaranteed');
    await expect(page.getByTestId('craft-master')).toContainText('Strike (Epic)');

    await page.getByTestId('craft-master').click();
    await expect(page.getByTestId('craft-reveal')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('craft-rarity')).toHaveText('Epic');
    await expect(page.getByTestId('pity-payout')).toBeVisible();
    await page.getByTestId('craft-continue').click();

    expect((await read(page)).emberMeter).toBe(0);
    await expect(page.getByTestId('ember-meter')).toContainText('0/5');
  });

  test('an unaffordable tier explains itself instead of going quiet', async ({ page }) => {
    await readyHero(page, { materials: { scrap: 0, essence: 0, starmetal: 0 } });
    await page.goto('/forge');
    await page.getByTestId('bench-bench').click();

    const strike = page.getByTestId('craft-master');
    await expect(strike).toBeDisabled();
    await expect(strike).toHaveAttribute('data-reason', /bucket/i);
    expect((await read(page)).crafted).toBe(0);
  });
});

test.describe('set recipes', () => {
  test('a recipe you do not hold still tells you where it lives', async ({ page }) => {
    await readyHero(page);
    await page.goto('/forge');
    await page.getByTestId('bench-recipes').click();

    // Both of the Bard's sets are on the shelf, locked, with their source lines.
    await expect(page.getByTestId('recipe-maestros-ensemble')).toContainText('Recipe not found');
    await expect(page.getByTestId('recipe-dawnchorus-attire')).toContainText('Rat Cellars');
    await expect(page.locator('[data-testid^="craft-recipe-"]')).toHaveCount(0);
  });

  test('spending one always hands over a piece of that set', async ({ page }) => {
    await readyHero(page, { forge: { recipes: ['maestros-ensemble'] } });
    await page.goto('/forge');
    await page.getByTestId('bench-recipes').click();

    const before = await read(page);
    expect(before.setPiecesInBags).toBe(0);

    await page.getByTestId('craft-recipe-maestros-ensemble').click();
    await expect(page.getByTestId('craft-reveal')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('craft-rarity')).toHaveText('Set');
    await page.getByTestId('craft-continue').click();

    const after = await read(page);
    expect(after.setPiecesInBags).toBe(1);
    expect(after.materials.essence).toBe(before.materials.essence - 20);
    expect(after.materials.starmetal).toBe(before.materials.starmetal - 2);
  });

  test('a set piece asks twice before it melts, and names what it costs', async ({ page }) => {
    await readyHero(page, { forge: { recipes: ['maestros-ensemble'] } });
    await page.goto('/forge');
    await page.getByTestId('bench-recipes').click();
    await page.getByTestId('craft-recipe-maestros-ensemble').click();
    await expect(page.getByTestId('craft-reveal')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('craft-continue').click();

    await page.getByTestId('bench-crucible').click();
    const setRow = page.locator('[data-testid^="scrap-row-"]').filter({ hasText: "Maestro's" });
    await expect(setRow).toHaveCount(1);

    const uid = (await setRow.getAttribute('data-testid'))!.replace('scrap-row-', '');
    await page.getByTestId(`scrap-${uid}`).click();

    // The `double` confirm level, and it has to actually say what it is about to undo.
    const confirm = page.getByTestId(`scrap-confirm-${uid}`);
    await expect(confirm).toHaveText('Melt it anyway');
    await expect(setRow).toContainText("Maestro's Ensemble");
    await expect(setRow).toContainText('gone for good');

    // Backing out is free — the piece is still there.
    await page.getByTestId(`scrap-${uid}`).click();
    await expect(confirm).toBeHidden();
    expect((await read(page)).setPiecesInBags).toBe(1);
  });
});

test.describe('set collections', () => {
  test('separates what you own from what you wear', async ({ page }) => {
    await readyHero(page, { forge: { recipes: ['maestros-ensemble'] } });

    // Two pieces from the recipe: owned, not worn.
    await page.goto('/forge');
    await page.getByTestId('bench-recipes').click();
    for (let i = 0; i < 2; i += 1) {
      await page.getByTestId('craft-recipe-maestros-ensemble').click();
      await expect(page.getByTestId('craft-reveal')).toBeVisible({ timeout: SETUP_TIMEOUT });
      await page.getByTestId('craft-continue').click();
      await expect(page.getByTestId('anvil-strike')).toBeHidden();
    }

    await flush(page);
    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('character-tab-sets').click();

    const card = page.getByTestId('set-card-maestros-ensemble');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('set-count-maestros-ensemble')).toHaveText('2/5');
    await expect(page.getByTestId('set-total')).toHaveText('2/10 pieces');

    // All five silhouettes are always drawn — a checklist that hides what you have not got is
    // not a checklist.
    await expect(card.locator('[data-testid^="set-piece-"]')).toHaveCount(5);

    // Two owned, none worn — so the 2-piece bonus is *listed and dark*, which is the whole
    // distinction the page exists to draw.
    await expect(card.getByTestId('set-bonus-2')).toHaveAttribute('data-active', 'false');
    await expect(card.getByTestId('set-bonus-2')).toContainText('Verses last a round longer');
    expect(await card.locator('[data-state="owned"]').count()).toBe(2);
    expect(await card.locator('[data-state="equipped"]').count()).toBe(0);

    // The set the player has nothing of still advertises where to look.
    await expect(page.getByTestId('set-card-dawnchorus-attire')).toContainText('Last seen:');
  });

  test('wearing the set lights the bonus, the paperdoll and the Verse picker', async ({ page }) => {
    /*
     * The longest test in the suite: five recipe crafts, each with its own anvil ceremony, then
     * five equips and three screens of assertions. It lands around 27s alone and tipped over the
     * 30s default the first time the run was busy enough to slow it — a flake with a real cause,
     * not a mystery. Budgeted rather than trimmed, because every one of those crafts is load
     * this test exists to carry.
     */
    test.setTimeout(90_000);

    // Five recipe crafts is 100 Essence and 10 Starmetal — a fortnight of real play, handed
    // over here so the assertion is about the *set*, not about the grind that pays for it.
    await readyHero(page, {
      materials: { essence: 140, starmetal: 12 },
      forge: { recipes: ['maestros-ensemble'] },
    });

    // Five recipe crafts complete the set — the engine draws only missing pieces, so five is
    // always exactly enough (crafting spec §3).
    await page.goto('/forge');
    await page.getByTestId('bench-recipes').click();
    for (let i = 0; i < 5; i += 1) {
      await page.getByTestId('craft-recipe-maestros-ensemble').click();
      await expect(page.getByTestId('craft-reveal')).toBeVisible({ timeout: SETUP_TIMEOUT });
      await page.getByTestId('craft-continue').click();
      await expect(page.getByTestId('anvil-strike')).toBeHidden();
    }
    expect((await read(page)).setPiecesInBags).toBe(5);

    // Wear them. Targeted by name rather than by position, because the bags also hold the ten
    // Rares the setup conjured and "the first cell" is one of those.
    await flush(page);
    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const pieces = page.locator('[data-testid^="bag-item-"][aria-label^="Maestro\'s"]');
    for (let i = 0; i < 5; i += 1) {
      await expect(pieces).toHaveCount(5 - i);
      await pieces.first().click();
      await page.getByTestId('equip-selected').click();
    }

    // The paperdoll says so without being asked.
    await expect(page.getByTestId('set-glow').first()).toBeVisible();

    await page.getByTestId('character-tab-sets').click();
    const card = page.getByTestId('set-card-maestros-ensemble');
    await expect(page.getByTestId('set-count-maestros-ensemble')).toHaveText('5/5');
    for (const threshold of [2, 4, 5]) {
      await expect(card.getByTestId(`set-bonus-${threshold}`)).toHaveAttribute(
        'data-active',
        'true',
      );
    }

    // The one five-piece in the game that is a decision rather than a number.
    await expect(page.getByTestId('verse-picker')).toBeVisible();
    expect((await read(page)).openingVerse).toBeNull();

    await page.getByTestId('verse-ironsong').click();
    await expect(page.getByTestId('verse-picker')).toContainText('Every fight starts on Ironsong');
    expect((await read(page)).openingVerse).toBe('ironsong');

    // And it is a save, not a screen state.
    await flush(page);
    await page.reload();
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('character-tab-sets').click();
    await expect(page.getByTestId('verse-ironsong')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a Warrior never sees the Bard shelves', async ({ page }) => {
    await readyHero(page, { classId: 'warrior', name: 'Kargath' });
    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('character-tab-sets').click();

    await expect(page.getByTestId('set-card-oathsworn-bulwark')).toBeVisible();
    await expect(page.getByTestId('set-card-wolfblood-warplate')).toBeVisible();
    await expect(page.getByTestId('set-card-maestros-ensemble')).toHaveCount(0);
    await expect(page.locator('[data-testid^="set-card-"]')).toHaveCount(2);
    await expect(page.getByTestId('verse-picker')).toHaveCount(0);
  });
});
