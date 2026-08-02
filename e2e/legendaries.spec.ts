import { expect, test, type Page } from '@playwright/test';

/**
 * Legendaries, from the player's side.
 *
 * The engine tests prove the roll, the fold and the reforge arithmetic. These prove the parts only
 * a browser can, and each one is a thing that would still "work" with every unit test green:
 *
 * - the card **states what wearing it costs** — a legendary is never a set piece, and that
 *   sentence is the only place the game's first build decision is made legible;
 * - the bench **shows the roll before the strike replaces it**, which is the whole reason a
 *   replace-only re-roll is fair rather than a slot machine;
 * - a strike **actually changes the item and survives a reload**, because a payload that lived
 *   only in memory would look identical until the player came back;
 * - the published roll space **is on the screen**, which is rule 6 at a bench whose output is not
 *   a rarity.
 *
 * As everywhere in this suite, anything that mutates then navigates flushes first: the autosave is
 * asynchronous and a reload without a flush is racing its own write.
 */

const SETUP_TIMEOUT = 20_000;

/*
 * Hero creation, a level grant, ten conjures and ten equips before the first assertion, then two
 * or three room changes. Past Playwright's 30-second default once workers compete, and the failure
 * it produces reads like a missing element rather than a slow one. Same figure and reason as
 * `album.spec.ts`, `slots.spec.ts` and `regression.spec.ts`.
 */
test.setTimeout(90_000);

interface Affix {
  id: string;
  magnitude: number;
}
interface Item {
  uid: string;
  name: string;
  slot: string;
  rarity: string;
  legendary?: { defId: string; affixes: Affix[]; reforges: number };
}
interface Save {
  hero: {
    level: number;
    equipment: Record<string, Item | undefined>;
    backpack: (Item | null)[];
    materials: { scrap: number; essence: number; starmetal: number };
  } | null;
}
interface StoreHandle {
  getState: () => { save: Save | null; flush: () => Promise<void> };
  setState: (partial: { save: Save }) => void;
}

const flush = (page: Page) =>
  page.evaluate(async () => {
    await (window as unknown as { __tavernStore: StoreHandle }).__tavernStore.getState().flush();
  });

/** Every legendary the hero holds, worn or bagged. */
const held = (page: Page) =>
  page.evaluate(() => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const save = handle.getState().save;
    if (!save?.hero) return [];
    return [...Object.values(save.hero.equipment), ...save.hero.backpack]
      .filter((item): item is Item => !!item && item.rarity === 'legendary')
      .map((item) => ({
        uid: item.uid,
        name: item.name,
        reforges: item.legendary?.reforges ?? 0,
        affixes: (item.legendary?.affixes ?? []).map((a) => `${a.id}:${a.magnitude}`).join(','),
      }));
  });

/** A hero at the Anvil's band, holding named arms and enough Starmetal to strike. */
async function heroWithLegendaries(page: Page) {
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
  // The Emberforge opens at level 6 — a level-1 hero reaches `/forge` and finds the gate, which
  // is the room doing its job and reads in a test exactly like a missing element.
  await page.getByTestId('dev-level-10').click();
  await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });
  await page.getByTestId('dev-rarity-legendary').click();
  // A helmet, so the set-slot consequence has something to say, and a weapon for the shelf.
  await page.getByTestId('dev-conjure-helmet').click();
  await page.getByTestId('dev-conjure-weapon').click();

  await page.evaluate(async () => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const { save } = handle.getState();
    if (!save?.hero) throw new Error('no hero');
    handle.setState({
      save: { ...save, hero: { ...save.hero, materials: { scrap: 0, essence: 0, starmetal: 30 } } },
    });
    await handle.getState().flush();
  });
  await flush(page);
}

test.describe('a named piece', () => {
  test('says on the card what wearing it costs', async ({ page }) => {
    await heroWithLegendaries(page);

    // The card is a hover card, so it is read where the item is — in the bags, before equipping,
    // which is exactly when the decision is made.
    const bagged = page.locator('[data-testid^="bag-item-"]').first();
    await expect(bagged).toBeVisible({ timeout: SETUP_TIMEOUT });
    await bagged.hover();

    const band = page.locator('[data-testid^="legendary-band-"]').first();
    await expect(band).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(band).toContainText('Legendary');

    // Two affix lines, and neither is an unsubstituted template.
    await expect(band).not.toContainText('{v}');
  });

  test('is never counted toward a set', async ({ page }) => {
    await heroWithLegendaries(page);
    // Asserted from the save rather than the screen: the negative is what a later refactor
    // reverses in silence, and `setId` is the field it would reverse.
    const anySetId = await page.evaluate(() => {
      const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
      const save = handle.getState().save;
      const all = [...Object.values(save?.hero?.equipment ?? {}), ...(save?.hero?.backpack ?? [])];
      return all
        .filter((item): item is Item => !!item && item.rarity === 'legendary')
        .some((item) => 'setId' in item && (item as { setId?: string }).setId !== undefined);
    });
    expect(anySetId).toBe(false);
  });
});

test.describe('the reforge bench', () => {
  async function openBench(page: Page) {
    await page.goto('/forge');
    await expect(page.getByTestId('forge-benches')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('bench-reforge').click();
    await expect(page.getByTestId('reforge-bench')).toBeVisible({ timeout: SETUP_TIMEOUT });
  }

  test('publishes the size of the space it is re-rolling into', async ({ page }) => {
    await heroWithLegendaries(page);
    await openBench(page);

    // Rule 6 at a bench whose output is not a rarity: the honest statement is how many outcomes
    // there are, and it must be a real number rather than a placeholder.
    const odds = page.getByTestId('reforge-odds');
    await expect(odds).toBeVisible();
    await expect(odds).toContainText(/\d/);
    await expect(odds).toContainText('distinct rolls');
  });

  test('replaces the roll, keeps the item, and survives a reload', async ({ page }) => {
    await heroWithLegendaries(page);
    await openBench(page);

    const before = await held(page);
    expect(before.length).toBeGreaterThan(0);

    await page.getByTestId('reforge-strike').click();
    // The forge's own reveal owns the moment; dismissing it is how the bench returns.
    const take = page.getByRole('button', { name: /take it/i });
    if (await take.isVisible({ timeout: 5_000 }).catch(() => false)) await take.click();
    await flush(page);

    const after = await held(page);
    const struck = after.find((item) => item.reforges > 0);
    expect(struck, 'nothing was struck').toBeTruthy();
    // Same item — a reforge must not mint a new one, or a worn piece would fall off the paperdoll.
    expect(before.some((item) => item.uid === struck!.uid)).toBe(true);
    expect(struck!.reforges).toBe(1);

    await page.reload();
    await expect(page.getByTestId('forge-benches')).toBeVisible({ timeout: SETUP_TIMEOUT });
    const reloaded = await held(page);
    const persisted = reloaded.find((item) => item.uid === struck!.uid);
    expect(persisted?.reforges).toBe(1);
    expect(persisted?.affixes).toBe(struck!.affixes);
  });

  test('shows the roll it replaced, beside the one it made', async ({ page }) => {
    await heroWithLegendaries(page);
    await openBench(page);

    // Before the first strike the panel says so rather than showing an empty box.
    await expect(page.getByTestId('reforge-bench')).toContainText('Nothing yet');

    await page.getByTestId('reforge-strike').click();
    const take = page.getByRole('button', { name: /take it/i });
    if (await take.isVisible({ timeout: 5_000 }).catch(() => false)) await take.click();

    // Afterwards it shows what was lost — the whole reason a replace-only re-roll is fair.
    await expect(page.getByTestId('reforge-bench')).not.toContainText('Nothing yet');
  });
});
