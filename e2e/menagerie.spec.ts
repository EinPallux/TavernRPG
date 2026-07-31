import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 14 acceptance: the Menagerie, from the player's side.
 *
 * The engine tests already prove ownership is derived from the right facts, that the curve caps
 * under one gear upgrade, and that the egg lands at 0.5%. These prove the parts only a browser
 * can: a companion **earned three phases ago is simply there** when the room opens, an empty
 * stall **says where its pet comes from** rather than showing a question mark, a feed **charges
 * and answers**, the fourth feed **explains itself instead of just refusing**, the boost the
 * stall quotes is the **same number the character screen shows**, and the rail's arrivals cue
 * **clears itself by being visited**.
 *
 * As everywhere else in this suite, anything that mutates then navigates flushes first: the
 * store's autosave is asynchronous and a reload without a flush is racing its own write.
 */

const SETUP_TIMEOUT = 20_000;

interface StoreHandle {
  getState: () => { save: Save | null; flush: () => Promise<void> };
  setState: (partial: { save: Save }) => void;
}
interface PetProgress {
  level: number;
  rarity: string;
  fedToday: number;
}
interface Save {
  hero: {
    level: number;
    gold: number;
    materials: { scrap: number; essence: number; starmetal: number };
  } | null;
  dungeons: { keys: string[]; trophies: string[]; progress: Record<string, unknown> };
  activity: { missionsCompleted: number; zoneMissions: Record<string, number> };
  arena: { bestRank: number };
  pets: {
    progress: Record<string, PetProgress>;
    activeId: string | null;
    scraps: number;
    eggs: string[];
    seenCount: number;
  };
}

const read = (page: Page) =>
  page.evaluate(() => {
    const handle = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
    const { save } = handle.getState();
    return {
      gold: save?.hero?.gold ?? 0,
      scraps: save?.pets.scraps ?? 0,
      activeId: save?.pets.activeId ?? null,
      seenCount: save?.pets.seenCount ?? 0,
      progress: save?.pets.progress ?? {},
      essence: save?.hero?.materials.essence ?? 0,
    };
  });

const flush = (page: Page) =>
  page.evaluate(async () => {
    await (window as unknown as { __tavernStore: StoreHandle }).__tavernStore.getState().flush();
  });

/** Ten cleared floors' worth of dungeon progress, in the shape the schema wants. */
function delve(floorsCleared: number) {
  return {
    floorsCleared,
    cooldownUntil: 0,
    bestAttempts: Array.from({ length: 10 }, () => 0),
    attempts: floorsCleared,
    clearedAt: null,
  };
}

/**
 * A hero past the level-8 gate whose *history* has earned three companions — one from each
 * source kind that exists today. Nothing here grants a pet; it makes the facts true and lets
 * `ownedPets()` draw its own conclusion, which is the whole claim the phase makes.
 *
 * Waits for creation-or-paperdoll rather than paperdoll alone, for the reason `arena.spec.ts`
 * spells out: `/character` renders the class picker when there is no hero.
 */
async function readyHero(page: Page, options: { scraps?: number; gold?: number } = {}) {
  await page.goto('/character');

  const creation = page.getByTestId('hero-creation');
  const paperdoll = page.getByTestId('paperdoll');
  await expect(creation.or(paperdoll).first()).toBeVisible({ timeout: SETUP_TIMEOUT });
  if (await creation.isVisible()) {
    await page.getByTestId('class-hunter').click();
    await page.getByTestId('hero-name').fill('Ysolde');
    await expect(page.getByTestId('confirm-hero')).toBeEnabled({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('confirm-hero').click();
  }
  await expect(paperdoll).toBeVisible({ timeout: SETUP_TIMEOUT });

  await page.getByTestId('dev-drawer-toggle').click();
  await page.getByTestId('dev-level-10').click();
  await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });

  await page.evaluate(
    async (seed) => {
      const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
      const { save } = handle.getState();
      if (!save?.hero) throw new Error('no hero');

      handle.setState({
        save: {
          ...save,
          hero: {
            ...save.hero,
            gold: seed.gold,
            materials: { scrap: 60, essence: 200, starmetal: 8 },
          },
          // Barrowdeep floor 5 → the Gloom Cat. A hundred contracts → the Tankard Imp.
          // Top 500 → the Sooty Raven. All three were true before this room existed.
          dungeons: {
            ...save.dungeons,
            progress: { ...save.dungeons.progress, barrowdeep: seed.delve },
          },
          activity: { ...save.activity, missionsCompleted: 140 },
          arena: { ...save.arena, bestRank: 402 },
          pets: { ...save.pets, scraps: seed.scraps, seenCount: 0 },
        },
      });
      await handle.getState().flush();
    },
    { scraps: options.scraps ?? 20, gold: options.gold ?? 200_000, delve: delve(5) },
  );
}

test.describe('the collection', () => {
  test('hands over companions the history already earned, and names the rest', async ({ page }) => {
    await readyHero(page);
    await page.goto('/menagerie');
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // Three owned, nine to chase — none of it stored, all of it derived from Phases 9–11.
    await expect(page.getByTestId('collection-count')).toContainText('3/12');
    await expect(page.locator('[data-testid^="pet-"][data-owned="true"]')).toHaveCount(3);
    await expect(page.getByTestId('pet-gloom-cat')).toHaveAttribute('data-owned', 'true');
    await expect(page.getByTestId('pet-tankard-imp')).toHaveAttribute('data-owned', 'true');
    await expect(page.getByTestId('pet-sooty-raven')).toHaveAttribute('data-owned', 'true');

    // An empty stall is a direction, not a question mark.
    await expect(page.getByTestId('pet-ember-pup')).toHaveAttribute('data-owned', 'false');
    await expect(page.getByTestId('hint-ember-pup')).toContainText('Rat Cellars');
    await expect(page.getByTestId('hint-frost-fox')).toContainText('egg');
    for (const id of ['ember-pup', 'moss-tortoise', 'coin-toad', 'frost-fox', 'gilded-snail']) {
      await expect(page.getByTestId(`hint-${id}`)).toBeVisible();
    }
  });

  test('quotes every owned pet its exact boost, and no unowned one', async ({ page }) => {
    await readyHero(page);
    await page.goto('/menagerie');
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // A fresh pet is 1% — the published floor of the curve, on the tile, before any feeding.
    await expect(page.getByTestId('boost-gloom-cat')).toContainText('Dexterity');
    await expect(page.getByTestId('boost-gloom-cat')).toContainText('+1.0%');
    // Half-rate boosts say so by saying half.
    await expect(page.getByTestId('boost-tankard-imp')).toContainText('Gold found');
    await expect(page.getByTestId('boost-tankard-imp')).toContainText('+0.5%');

    await expect(page.getByTestId('boost-ember-pup')).toHaveCount(0);
  });
});

test.describe('feeding', () => {
  test('charges a Scrap and gold, levels the pet, and stops at three', async ({ page }) => {
    await readyHero(page, { scraps: 12 });
    await page.goto('/menagerie');
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const before = await read(page);
    await expect(page.getByTestId('scraps-purse')).toContainText('12 Tavern Scraps');

    await page.getByTestId('feed-gloom-cat').click();
    await expect(page.getByTestId('boost-gloom-cat')).toContainText('+1.1%');
    await expect(page.getByTestId('scraps-purse')).toContainText('11 Tavern Scraps');

    const afterOne = await read(page);
    expect(afterOne.progress['gloom-cat']?.level).toBe(2);
    expect(afterOne.gold).toBeLessThan(before.gold);

    await page.getByTestId('feed-gloom-cat').click();
    await page.getByTestId('feed-gloom-cat').click();
    await expect(page.getByTestId('boost-gloom-cat')).toContainText('+1.2%');

    // The fourth is refused with a sentence, not a dead button.
    const feed = page.getByTestId('feed-gloom-cat');
    await expect(feed).toBeDisabled();
    await expect(feed).toHaveAttribute('title', /Three a day/);

    // ...and the cap is per pet, so the rest of the stable is still worth visiting.
    await expect(page.getByTestId('feed-tankard-imp')).toBeEnabled();
  });

  test('refuses when the bag is empty, and says why', async ({ page }) => {
    await readyHero(page, { scraps: 0 });
    await page.goto('/menagerie');
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const feed = page.getByTestId('feed-gloom-cat');
    await expect(feed).toBeDisabled();
    await expect(feed).toHaveAttribute('title', /Tavern Scraps/);
  });

  test('survives a reload with the level and the day intact', async ({ page }) => {
    await readyHero(page, { scraps: 12 });
    await page.goto('/menagerie');
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('feed-gloom-cat').click();
    await page.getByTestId('feed-gloom-cat').click();
    await expect(page.getByTestId('boost-gloom-cat')).toContainText('+1.2%');

    await flush(page);
    await page.reload();
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await expect(page.getByTestId('boost-gloom-cat')).toContainText('+1.2%');
    // One feed left today: a day-keyed counter that reset on reload would be the bug.
    await expect(page.getByTestId('feed-gloom-cat')).toBeEnabled();
    await page.getByTestId('feed-gloom-cat').click();
    await expect(page.getByTestId('feed-gloom-cat')).toBeDisabled();
  });
});

test.describe('rarity upgrades', () => {
  test('names the frame it buys and its price, then takes both', async ({ page }) => {
    await readyHero(page);
    await page.evaluate(async () => {
      const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
      const { save } = handle.getState();
      handle.setState({
        save: {
          ...save!,
          pets: {
            ...save!.pets,
            progress: { 'gloom-cat': { level: 16, rarity: 'common', fedToday: 0 } },
          },
        },
      });
      await handle.getState().flush();
    });

    await page.goto('/menagerie');
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await expect(page.getByTestId('rarity-gloom-cat')).toHaveText('Common');
    const upgrade = page.getByTestId('upgrade-gloom-cat');
    await expect(upgrade).toContainText('Uncommon frame');
    await expect(upgrade).toContainText('12');

    const before = await read(page);
    await upgrade.click();
    await expect(page.getByTestId('rarity-gloom-cat')).toHaveText('Uncommon');
    // The half-percent lands on the same tile that quoted it.
    await expect(page.getByTestId('boost-gloom-cat')).toContainText('+2.7%');
    expect((await read(page)).essence).toBe(before.essence - 12);
  });

  test('holds the upgrade back until the level, with the level named', async ({ page }) => {
    await readyHero(page);
    await page.goto('/menagerie');
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const upgrade = page.getByTestId('upgrade-gloom-cat');
    await expect(upgrade).toBeDisabled();
    await expect(upgrade).toHaveAttribute('title', /level 15/);
  });
});

test.describe('the companion at your side', () => {
  test('is free to take and free to leave, and only one at a time', async ({ page }) => {
    await readyHero(page);
    await page.goto('/menagerie');
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await expect(page.getByTestId('no-active-pet')).toBeVisible();

    const before = await read(page);
    await page.getByTestId('activate-gloom-cat').click();
    await expect(page.getByTestId('active-boost')).toContainText('Dexterity');
    await expect(page.getByTestId('pet-gloom-cat')).toHaveAttribute('data-active', 'true');
    // Free, forever — the switch must never touch the purse.
    expect((await read(page)).gold).toBe(before.gold);

    // Taking a second one along replaces the first rather than stacking.
    await page.getByTestId('activate-tankard-imp').click();
    await expect(page.getByTestId('pet-gloom-cat')).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('pet-tankard-imp')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('active-boost')).toContainText('Gold found');

    await page.getByTestId('dismiss-pet').click();
    await expect(page.getByTestId('no-active-pet')).toBeVisible();
    expect((await read(page)).activeId).toBeNull();
  });

  test('shows the character screen the same number the stall quoted', async ({ page }) => {
    await readyHero(page, { scraps: 12 });
    await page.goto('/menagerie');
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('feed-gloom-cat').click();
    await page.getByTestId('activate-gloom-cat').click();
    await expect(page.getByTestId('active-boost')).toContainText('+1.1%');

    await flush(page);
    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const chip = page.getByTestId('pet-chip');
    await expect(chip).toContainText('Gloom Cat');
    await expect(chip).toContainText('Dexterity +1.1%');
    await expect(chip).toContainText('level 2');
  });
});

test.describe('the arrivals cue', () => {
  test('flags the rail, then clears itself by being visited', async ({ page }) => {
    await readyHero(page);
    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // Three companions arrived while the player was elsewhere; the rail says so.
    await expect(page.getByTestId('nav-badge-menagerie')).toHaveText('3');

    await page.getByTestId('nav-menagerie').click();
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('nav-badge-menagerie')).toHaveCount(0);
    expect((await read(page)).seenCount).toBe(3);

    // And it stays cleared across a reload — the count is remembered, not the visit.
    await flush(page);
    await page.reload();
    await expect(page.getByTestId('place-menagerie')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('nav-badge-menagerie')).toHaveCount(0);
  });
});
