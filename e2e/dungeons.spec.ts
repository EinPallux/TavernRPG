import { expect, test, type Page } from '@playwright/test';
import { DUNGEONS } from '../src/data/dungeons';

/**
 * Phase 11 acceptance: the Undertavern, from the player's side.
 *
 * The engine tests prove the walls are tuned, the keys drop at rate and the boss procs fire.
 * These prove the parts only a browser can: a **locked door explains itself** rather than simply
 * refusing, a delve is **one continuous action** from the stair down to the result, **progress
 * and the cooldown survive a reload**, and a boss **says what it does before it does it**.
 *
 * As everywhere else in this suite, anything that mutates then navigates flushes first: the
 * store's autosave is asynchronous and a reload without a flush is racing its own write.
 */

const SETUP_TIMEOUT = 20_000;

interface StoreHandle {
  getState: () => { save: Save | null; flush: () => Promise<void> };
  setState: (partial: { save: Save }) => void;
}
interface DungeonProgress {
  floorsCleared: number;
  cooldownUntil: number;
  bestAttempts: number[];
  attempts: number;
  clearedAt: number | null;
}
interface Save {
  hero: { level: number; gold: number; dice: number; name: string; classId: string } | null;
  dungeons: {
    keys: string[];
    trophies: string[];
    progress: Record<string, DungeonProgress>;
  };
}

const read = (page: Page) =>
  page.evaluate(() => {
    const handle = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
    const { save } = handle.getState();
    const rat = save?.dungeons.progress['rat-cellars'];
    return {
      keys: save?.dungeons.keys ?? [],
      trophies: save?.dungeons.trophies ?? [],
      cleared: rat?.floorsCleared ?? 0,
      cooldownUntil: rat?.cooldownUntil ?? 0,
      attempts: rat?.attempts ?? 0,
      best: rat?.bestAttempts ?? [],
      gold: save?.hero?.gold ?? 0,
      level: save?.hero?.level ?? 0,
    };
  });

const flush = (page: Page) =>
  page.evaluate(async () => {
    await (window as unknown as { __tavernStore: StoreHandle }).__tavernStore.getState().flush();
  });

/**
 * A hero past the level-10 gate.
 *
 * Waits for creation-or-paperdoll rather than paperdoll alone, for the reason `arena.spec.ts`
 * spells out: `/character` renders the class picker when there is no hero, so a slow load lands
 * on the picker and a bare paperdoll wait spends its whole timeout looking at the wrong screen.
 */
async function readyHero(page: Page, level = 34) {
  await page.goto('/character');

  const creation = page.getByTestId('hero-creation');
  const paperdoll = page.getByTestId('paperdoll');
  await expect(creation.or(paperdoll).first()).toBeVisible({ timeout: SETUP_TIMEOUT });
  if (await creation.isVisible()) {
    await page.getByTestId('class-warrior').click();
    await page.getByTestId('hero-name').fill('Kargath');
    await expect(page.getByTestId('confirm-hero')).toBeEnabled({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('confirm-hero').click();
  }
  await expect(paperdoll).toBeVisible({ timeout: SETUP_TIMEOUT });

  await page.getByTestId('dev-drawer-toggle').click();
  await page.getByTestId('dev-level-10').click();
  await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });

  await page.evaluate(async (target) => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const { save } = handle.getState();
    if (!save?.hero) throw new Error('no hero');
    handle.setState({ save: { ...save, hero: { ...save.hero, level: target, gold: 200_000 } } });
    await handle.getState().flush();
  }, level);
}

/**
 * Gear them properly, then hand over the Rusty Key.
 *
 * "On curve" means gear *and* training (CLAUDE.md): a level-34 hero still swinging their starter
 * blade loses to a level-14 rat, which is correct behaviour and useless for testing the win
 * path. The dev drawer conjures the gear; equipping it in one pass is quicker than ten clicks.
 */
async function armAndUnlock(page: Page, progress?: Partial<DungeonProgress>) {
  await page.getByTestId('dev-rarity-epic').click();
  await page.getByTestId('dev-conjure-all').click();
  await page.waitForTimeout(300);

  await page.evaluate(async (seed) => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const { save } = handle.getState();
    if (!save?.hero) throw new Error('no hero');

    const hero = save.hero as unknown as {
      equipment: Record<string, { slot: string }>;
      backpack: ({ slot: string } | null)[];
    };
    const equipment = { ...hero.equipment };
    const backpack = [...hero.backpack];
    backpack.forEach((item, index) => {
      if (item) {
        equipment[item.slot] = item;
        backpack[index] = null;
      }
    });

    handle.setState({
      save: {
        ...save,
        hero: { ...save.hero, ...{ equipment, backpack } },
        dungeons: {
          ...save.dungeons,
          keys: ['rusty-key'],
          ...(seed
            ? {
                progress: {
                  'rat-cellars': {
                    floorsCleared: 0,
                    cooldownUntil: 0,
                    bestAttempts: Array.from({ length: 10 }, () => 0),
                    attempts: 0,
                    clearedAt: null,
                    ...seed,
                  },
                },
              }
            : {}),
        },
      },
    });
    await handle.getState().flush();
  }, progress ?? null);
}

/** Press the door and ride the descent into the fight. */
async function goDown(page: Page) {
  await page.getByTestId('descend-rat-cellars').click();
  // The descent is a beat of its own, not a spinner — it should actually be on screen.
  await expect(page.getByTestId('descent')).toBeVisible({ timeout: SETUP_TIMEOUT });
  await expect(page.getByTestId('delve-battle')).toBeVisible({ timeout: SETUP_TIMEOUT });
  await page.getByTestId('battle-skip').click();
}

test.describe('every shut door', () => {
  test('each one says exactly why it will not open', async ({ page }) => {
    await readyHero(page, 12);
    await page.goto('/undertavern');
    await expect(page.getByTestId('place-undertavern')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // All of them are there, with their progress plaques, from the first visit.
    for (const id of DUNGEONS.map((den) => den.id)) {
      await expect(page.getByTestId(`door-${id}`)).toBeVisible();
      await expect(page.getByTestId(`rungs-${id}`)).toBeVisible();
    }

    /*
     * A level-12 hero with no keys: the first wants a key, the rest want levels. Different
     * sentences, because "the door will not open" is not an answer.
     *
     * Counted against `DUNGEONS` rather than pinned at three — the far country added two doors
     * and this failed for being right, which is what a pinned count does.
     */
    const locked = page.getByTestId('dungeon-locked');
    await expect(locked).toHaveCount(DUNGEONS.length);
    await expect(page.getByTestId('door-rat-cellars')).toContainText('Rusty Key');
    await expect(page.getByTestId('door-barrowdeep')).toContainText('level 25');
    await expect(page.getByTestId('door-emberdeep')).toContainText('level 55');

    // Nothing to descend into yet.
    await expect(page.locator('[data-testid^="descend-"]')).toHaveCount(0);
    expect((await read(page)).keys).toEqual([]);
  });

  test('the key opens one door and only one', async ({ page }) => {
    await readyHero(page, 34);
    await armAndUnlock(page);
    await page.goto('/undertavern');
    await expect(page.getByTestId('place-undertavern')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await expect(page.getByTestId('descend-rat-cellars')).toBeVisible();
    await expect(page.locator('[data-testid^="descend-"]')).toHaveCount(1);
    await expect(page.getByTestId('key-count')).toContainText(`1/${DUNGEONS.length}`);
  });
});

test.describe('the delve', () => {
  test('goes down, fights, and banks the floor — ROADMAP acceptance', async ({ page }) => {
    await readyHero(page, 34);
    await armAndUnlock(page);
    await page.goto('/undertavern');
    await expect(page.getByTestId('descend-rat-cellars')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const before = await read(page);
    await goDown(page);

    await expect(page.getByTestId('battle-result-layer')).toBeVisible({ timeout: SETUP_TIMEOUT });
    const after = await read(page);

    // Whatever the outcome, the attempt happened and left something behind.
    expect(after.attempts).toBe(before.attempts + 1);
    expect(after.cleared).toBe(1);
    expect(after.gold).toBeGreaterThan(before.gold);
    expect(after.best[0]).toBe(1);

    // And it survives the walk back up.
    await page.getByRole('button', { name: /Back to the stair/i }).click();
    await expect(page.getByTestId('door-rat-cellars')).toContainText('1/10');
    await flush(page);
    await page.reload();
    await expect(page.getByTestId('door-rat-cellars')).toContainText('1/10', {
      timeout: SETUP_TIMEOUT,
    });
  });

  test('chains straight into the next floor, with no cooldown between', async ({ page }) => {
    await readyHero(page, 34);
    await armAndUnlock(page);
    await page.goto('/undertavern');
    await expect(page.getByTestId('descend-rat-cellars')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await goDown(page);
    await page.getByRole('button', { name: /Back to the stair/i }).click();
    // A win clears the door outright — the chain is the reward for a gear spike (spec §2).
    await expect(page.getByTestId('descend-rat-cellars')).toBeEnabled({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('dungeon-cooldown')).toHaveCount(0);

    await goDown(page);
    await expect(page.getByTestId('battle-result-layer')).toBeVisible({ timeout: SETUP_TIMEOUT });
    expect((await read(page)).cleared).toBe(2);
  });

  test('a boss names its trick before the first blow — ROADMAP acceptance', async ({ page }) => {
    await readyHero(page, 34);
    // Straight to floor 5, the Whiskerbone Priest.
    await armAndUnlock(page, { floorsCleared: 4, attempts: 8 });
    await page.goto('/undertavern');
    await expect(page.getByTestId('descend-rat-cellars')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // The door says what is down there, and that it is a boss.
    await expect(page.getByTestId('door-rat-cellars')).toContainText('BOSS');
    await expect(page.getByTestId('door-rat-cellars')).toContainText('Whiskerbone Priest');

    await page.getByTestId('descend-rat-cellars').click();
    await expect(page.getByTestId('delve-battle')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // The explainer holds the stage before the exchange starts — a wall that kills you without
    // saying why is a bug report; one that tells you how it works is a puzzle.
    const trait = page.getByTestId('boss-trait');
    await expect(trait).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(trait).toContainText('Congregation');
    await expect(trait).toContainText('every third round', { ignoreCase: true });
  });

  test('a loss shuts the door for half an hour and leaves the bar behind', async ({ page }) => {
    // Level 11 with starter gear: floor 1 of the Rat Cellars will see them off.
    await readyHero(page, 11);
    await page.evaluate(async () => {
      const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
      const { save } = handle.getState();
      handle.setState({ save: { ...save!, dungeons: { ...save!.dungeons, keys: ['rusty-key'] } } });
      await handle.getState().flush();
    });

    await page.goto('/undertavern');
    await expect(page.getByTestId('descend-rat-cellars')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await goDown(page);

    await expect(page.getByTestId('best-attempt')).toBeVisible({ timeout: SETUP_TIMEOUT });
    const after = await read(page);
    expect(after.cleared).toBe(0);
    expect(after.cooldownUntil).toBeGreaterThan(Date.now());
    // The only progress a loss leaves: how far this attempt got.
    expect(after.best[0]).toBeGreaterThan(0);
    expect(after.best[0]).toBeLessThan(1);

    await page.getByRole('button', { name: /Back up/i }).click();
    await expect(page.getByTestId('dungeon-cooldown')).toBeVisible();
    await expect(page.getByTestId('door-rat-cellars')).toContainText('Best attempt');

    // The wait is in the save, not in a timer, so it survives the tab closing.
    await flush(page);
    await page.reload();
    await expect(page.getByTestId('dungeon-cooldown')).toBeVisible({ timeout: SETUP_TIMEOUT });
    expect((await read(page)).cooldownUntil).toBe(after.cooldownUntil);
  });
});

test.describe('the gate', () => {
  test('refuses a level-1 hero, even by URL', async ({ page }) => {
    await page.goto('/character');
    const creation = page.getByTestId('hero-creation');
    await expect(creation.or(page.getByTestId('paperdoll')).first()).toBeVisible({
      timeout: SETUP_TIMEOUT,
    });
    if (await creation.isVisible()) {
      await page.getByTestId('class-mage').click();
      await page.getByTestId('hero-name').fill('Ilsa');
      await page.getByTestId('confirm-hero').click();
    }

    await page.goto('/undertavern');
    await expect(page.getByTestId('place-undertavern')).toHaveCount(0, { timeout: SETUP_TIMEOUT });
  });
});

test.describe('house style', () => {
  test('the Undertavern keeps to chamfers — no rounded corners', async ({ page }) => {
    await readyHero(page, 34);
    await armAndUnlock(page);
    await page.goto('/undertavern');
    await expect(page.getByTestId('place-undertavern')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // CLAUDE.md hard rule 2: border-radius over 4px is banned.
    const offenders = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-testid="place-undertavern"] *')].filter((node) => {
          const radius = getComputedStyle(node).borderRadius;
          return radius
            .split(' ')
            .some((part) => part.endsWith('px') && Number.parseFloat(part) > 4);
        }).length,
    );
    expect(offenders).toBe(0);
  });
});
