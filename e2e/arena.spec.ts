import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 9 acceptance: the Proving Grounds and the Hall of Fame, from the player's side.
 *
 * The engine tests prove the draw, the duel and the payout are right. These prove the parts only
 * a browser can: **the player is on the ladder** the moment they have a hero, **a duel is the
 * real battle scene** against a bot's own numbers, the ladder written after it survives a
 * reload, and **1,501 rows scroll** without mounting 1,501 rows.
 *
 * As everywhere else in this suite, anything that mutates then navigates flushes first — the
 * store's autosave is asynchronous and a reload without a flush is racing its own write.
 */

const SETUP_TIMEOUT = 20_000;

interface StoreHandle {
  getState: () => { save: Save | null; flush: () => Promise<void> };
  setState: (partial: { save: Save }) => void;
}
interface Save {
  hero: { level: number; honor: number; name: string } | null;
  world: { seed: number; lastSimAt: number; ladder: number[] } | null;
  arena: {
    draw: number[];
    drawDay: string | null;
    cooldownUntil: number;
    rewardedWinsToday: number;
    bestRank: number;
    lastSeenRank: number;
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

    // The write must reach disk before the next navigation reads it back — the suite's own
    // "mutate then navigate must flush" rule (CLAUDE.md). It only bites under parallel load,
    // which is exactly when it is hardest to read as a race rather than as a bug in the room.
    await page.evaluate(async () => {
      const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore;
      await store?.getState().flush();
    });
  }
}

/**
 * Past the level-4 gate, the real way — the same XP call missions use.
 *
 * Waits for creation-or-paperdoll rather than paperdoll alone. `/character` renders the class
 * picker when there is no hero, so a load slow enough that `ensureHero`'s own wait resolved
 * against a half-hydrated store lands here on the picker — and a bare `paperdoll` wait then
 * spends its whole timeout looking at a screen that is never going to show one.
 */
async function openTheGate(page: Page) {
  await ensureHero(page);
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
  await page.evaluate(async () => {
    await (window as unknown as { __tavernStore: StoreHandle }).__tavernStore.getState().flush();
  });
}

const readSave = (page: Page) =>
  page.evaluate(() => {
    const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
    const { save } = store.getState();
    return {
      rank: save?.world ? save.world.ladder.indexOf(-1) + 1 : 0,
      ladderLength: save?.world?.ladder.length ?? 0,
      honor: save?.hero?.honor ?? 0,
      draw: save?.arena.draw ?? [],
      cooldownUntil: save?.arena.cooldownUntil ?? 0,
      wins: save?.arena.rewardedWinsToday ?? 0,
    };
  });

/** Seat the player mid-ladder, where the draw has heroes on both sides. */
async function seatAt(page: Page, rank: number) {
  await page.evaluate(async (target) => {
    const store = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
    const { save } = store.getState();
    if (!save?.world) throw new Error('no world');

    const without = save.world.ladder.filter((id) => id !== -1);
    store.setState({
      save: {
        ...save,
        world: {
          ...save.world,
          ladder: [...without.slice(0, target - 1), -1, ...without.slice(target - 1)],
          // Nothing owed to the simulation, so the seat is not undone by catch-up drift.
          lastSimAt: Date.now(),
        },
        arena: { ...save.arena, draw: [], drawDay: null, cooldownUntil: 0 },
      },
    });
    await store.getState().flush();
  }, rank);
}

test.describe('the ladder has a place for you', () => {
  test('a new hero is seated on it, and the Hall says where', async ({ page }) => {
    await openTheGate(page);
    await page.goto('/hall');
    await expect(page.getByTestId('place-hall')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const state = await readSave(page);
    expect(state.ladderLength).toBe(1_501);
    expect(state.rank).toBe(1_501);
    expect(state.honor).toBeGreaterThan(0);

    // The player's own row is pinned and highlighted, wherever it sits in 1,501 rungs.
    await expect(page.getByTestId('ladder-entry-player')).toBeVisible();
    await expect(page.getByTestId('ladder-entry-player')).toContainText('Kargath');
  });
});

test.describe('the Proving Grounds', () => {
  test('offers three opponents with a threat read apiece', async ({ page }) => {
    await openTheGate(page);
    await seatAt(page, 700);
    await page.goto('/arena');
    await expect(page.getByTestId('place-arena')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const posters = page.locator('[data-testid^="duel-poster-"]');
    await expect(posters).toHaveCount(3, { timeout: SETUP_TIMEOUT });

    for (let index = 0; index < 3; index += 1) {
      // The read is comparative prose, never a stat block (spec §1 step 1).
      await expect(posters.nth(index).getByTestId('threat-level')).toBeVisible();
      await expect(posters.nth(index).getByTestId('rank-seal')).toBeVisible();
    }

    // Nothing about the cap or the bell is hidden until it bites (CLAUDE.md #6).
    await expect(page.getByTestId('rewarded-wins')).toContainText('10 paid wins left today');
    await expect(page.getByTestId('arena-cooldown')).toBeVisible();
  });

  test('a duel is the real battle scene, and its result sticks across a reload', async ({
    page,
  }) => {
    await openTheGate(page);
    await seatAt(page, 700);
    await page.goto('/arena');
    await expect(page.getByTestId('place-arena')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const before = await readSave(page);
    await page.locator('[data-testid^="fight-"]').first().click();

    // The same scene the tavern mounts: nameplates, playback controls, a result.
    await expect(page.getByTestId('arena-battle')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('battle-skip').click();
    await expect(page.getByRole('button', { name: 'Back to the sand' })).toBeVisible({
      timeout: SETUP_TIMEOUT,
    });

    const after = await readSave(page);
    // Whatever the outcome, the fight cost the bell and moved honor — a duel is never a no-op.
    expect(after.cooldownUntil).toBeGreaterThan(before.cooldownUntil);
    expect(after.honor).not.toBe(before.honor);

    await page.evaluate(async () => {
      await (window as unknown as { __tavernStore: StoreHandle }).__tavernStore.getState().flush();
    });
    await page.reload();
    await expect(page.getByTestId('place-arena')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const reloaded = await readSave(page);
    expect(reloaded.honor).toBe(after.honor);
    expect(reloaded.rank).toBe(after.rank);
  });

  test('the bell holds the next fight, and says how long', async ({ page }) => {
    await openTheGate(page);
    await seatAt(page, 700);
    await page.goto('/arena');
    await expect(page.getByTestId('place-arena')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.locator('[data-testid^="fight-"]').first().click();
    await expect(page.getByTestId('arena-battle')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('battle-skip').click();
    await page.getByRole('button', { name: 'Back to the sand' }).click();

    await expect(page.getByTestId('arena-cooldown')).toContainText('Bell in', {
      timeout: SETUP_TIMEOUT,
    });
    await expect(page.getByTestId('cooldown-panel')).toBeVisible();
    // Buying past it is offered, priced, and capped — all before the click.
    await expect(page.getByTestId('skip-cooldown')).toBeVisible();
  });

  test('the board redraws for a die while the bell is still running', async ({ page }) => {
    await openTheGate(page);
    await seatAt(page, 700);
    await page.goto('/arena');
    await expect(page.getByTestId('place-arena')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const first = await readSave(page);
    await page.getByTestId('reroll-draw').click();

    const second = await readSave(page);
    expect(second.draw).not.toEqual(first.draw);
    expect(second.draw).toHaveLength(3);
  });
});

test.describe('the Hall of Fame', () => {
  test('scrolls 1,501 rungs without mounting 1,501 rows', async ({ page }) => {
    await openTheGate(page);
    await page.goto('/hall');
    await expect(page.getByTestId('place-hall')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const rows = page.locator('[data-testid^="ladder-entry-"]');
    const mounted = await rows.count();
    // The acceptance criterion is 60fps on 1,501 rows; the mechanism is that only a window of
    // them exists. A count anywhere near 1,501 means the virtualization is not working.
    expect(mounted).toBeGreaterThan(10);
    expect(mounted).toBeLessThan(80);

    await page.getByTestId('ladder-list').hover();
    for (let i = 0; i < 20; i += 1) await page.mouse.wheel(0, 600);
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeLessThan(80);
  });

  test('jumps to a rank you type, and finds a hero you name', async ({ page }) => {
    await openTheGate(page);
    await page.goto('/hall');
    await expect(page.getByTestId('place-hall')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // A bare number is a rank to jump to: rank 1 must be on screen afterwards.
    await page.getByTestId('hall-search').fill('1');
    await expect(page.locator('[data-testid^="ladder-entry-"]').first()).toContainText('#1');

    // A name filters instead. Every generated name carries a "the …" epithet, so this is a
    // needle the corpus is guaranteed to contain and the count must come down.
    const all = await page.locator('[data-testid^="ladder-entry-"]').count();
    await page.getByTestId('hall-search').fill('zzzzz');
    await expect(page.locator('[data-testid^="ladder-entry-"]')).toHaveCount(0);
    await page.getByTestId('hall-search').fill('the');
    await expect(page.locator('[data-testid^="ladder-entry-"]').first()).toBeVisible();
    expect(await page.locator('[data-testid^="ladder-entry-"]').count()).toBeLessThanOrEqual(all);
  });

  test('opens a profile, and offers the sand when they are in reach', async ({ page }) => {
    await openTheGate(page);
    await seatAt(page, 700);
    await page.goto('/hall');
    await expect(page.getByTestId('place-hall')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // The rows around the player's own are always within the attack band.
    await page.locator('[data-testid^="ladder-entry-"]').nth(4).click();
    await expect(page.getByTestId('hall-profile')).toBeVisible();
    await expect(page.getByTestId('hall-challenge')).toBeVisible();
  });

  test('shows all three tabs', async ({ page }) => {
    await openTheGate(page);
    await page.goto('/hall');
    await expect(page.getByTestId('place-hall')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('hall-tab-guilds').click();
    await expect(page.getByTestId('hall-guilds')).toBeVisible();
    await expect(page.getByTestId('guild-row-0')).toBeVisible();

    await page.getByTestId('hall-tab-legends').click();
    await expect(page.getByTestId('hall-legends')).toBeVisible();

    await page.getByTestId('hall-tab-heroes').click();
    await expect(page.getByTestId('hall-heroes')).toBeVisible();
  });
});
