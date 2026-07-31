import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 16 acceptance: the first twenty minutes, from the player's side.
 *
 * The engine tests already prove the curriculum walks forwards and that every predicate is
 * monotone. These prove the parts only a browser can:
 *
 * - The spotlight **lands on the right element** and, crucially, **does not trap anybody** — the
 *   spotlit control and the nav rail are both still clickable through the dim.
 * - A **mid-beat reload resumes on the same beat**, which is the whole payoff of deriving the
 *   position instead of storing it. Nothing in the save changed, so nothing to resume.
 * - The first contract really does come home in twenty seconds, and says why.
 * - Opting out at creation leaves no tour at all, and skipping mid-tour survives a reload.
 * - Once the tour is done the **Next Step chip** takes over, one hint at a time.
 *
 * As everywhere in this suite: anything that mutates then navigates flushes first, because the
 * autosave is asynchronous and a reload without a flush is racing its own write.
 */

const SETUP_TIMEOUT = 20_000;

interface StoreHandle {
  getState: () => { save: Save | null; flush: () => Promise<void> };
  setState: (partial: { save: Save }) => void;
}
interface Save {
  hero: { level: number; gold: number } | null;
  tutorial: {
    optedOut: boolean;
    acknowledged: string[];
    seenExplainers: string[];
    dismissedHints: string[];
  };
}

const flush = (page: Page) =>
  page.evaluate(async () => {
    await (window as unknown as { __tavernStore: StoreHandle }).__tavernStore.getState().flush();
  });

/** Walk through creation. `skip` ticks "I have played before". */
async function createHero(page: Page, { skip = false }: { skip?: boolean } = {}) {
  await page.goto('/character');
  await expect(page.getByTestId('hero-creation')).toBeVisible({ timeout: SETUP_TIMEOUT });
  await page.getByTestId('class-warrior').click();
  await page.getByTestId('hero-name').fill('Ysolde');
  if (skip) await page.getByTestId('skip-tutorial').check();
  await expect(page.getByTestId('confirm-hero')).toBeEnabled({ timeout: SETUP_TIMEOUT });
  await page.getByTestId('confirm-hero').click();
  await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });
}

test.describe('the tour', () => {
  test('offers a chip off-site and a spotlight on it', async ({ page }) => {
    await createHero(page);

    /*
     * Beat one happens at the tavern, and creation lands on the character screen. Off-site the
     * tour is a *chip in the HUD*, never a card over the page — a card floating wherever the
     * player happens to be is a card on top of somebody's button, which is how this arrived.
     */
    const chip = page.getByTestId('tutorial-chip');
    await expect(chip).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(chip).toHaveAttribute('data-beat', 'welcome-in');
    await expect(page.getByTestId('tutorial-spotlight')).toHaveCount(0);

    await chip.click();
    await expect(page.getByTestId('mission-board')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('tutorial-spotlight')).toHaveAttribute('data-spotlit', 'yes');
    await expect(page.getByTestId('tutorial-step')).toHaveText('Step 1 of 12');

    // The hole sits over the quest table, padded by a few pixels either side. Give the tracking
    // transition its 220ms first — the hole chases its target rather than teleporting.
    await page.waitForTimeout(600);
    const board = (await page.getByTestId('mission-board').boundingBox())!;
    const hole = (await page.getByTestId('tutorial-hole').boundingBox())!;
    expect(Math.abs(hole.x - (board.x - 8))).toBeLessThan(3);
    expect(Math.abs(hole.width - (board.width + 16))).toBeLessThan(3);
  });

  test('never traps the player', async ({ page }) => {
    await createHero(page);
    await page.getByTestId('tutorial-chip').click();
    await expect(page.getByTestId('mission-board')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // The dim is a *look*, not a modal: the spotlit thing and everything around it stay live.
    const reachable = await page.evaluate(() => {
      const hit = (selector: string) => {
        const target = document.querySelector(selector);
        if (!target) return false;
        const box = target.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + 8);
        return target.contains(top) || top === target;
      };
      return { board: hit('[data-testid="mission-board"]'), rail: hit('[data-testid="nav-hall"]') };
    });
    expect(reachable).toEqual({ board: true, rail: true });

    // Escape folds it away, and the tab brings it back — the fold is keyed on the beat, so it
    // silences this one and nothing after it.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tutorial-chip')).toBeVisible();
    await expect(page.getByTestId('tutorial-card')).toHaveCount(0);
    await page.getByTestId('tutorial-chip').click();
    await expect(page.getByTestId('tutorial-card')).toBeVisible();
  });

  test('resumes on the same beat after a reload', async ({ page }) => {
    await createHero(page);
    await page.getByTestId('tutorial-chip').click();
    await expect(page.getByTestId('tutorial-copy')).toContainText('You made it', {
      timeout: SETUP_TIMEOUT,
    });

    await flush(page);
    await page.reload();

    // The position was never written down, so there is nothing to have lost.
    await expect(page.getByTestId('tutorial-step')).toHaveText('Step 1 of 12', {
      timeout: SETUP_TIMEOUT,
    });
    await expect(page.getByTestId('tutorial-copy')).toContainText('You made it');
  });

  test('runs the first contract in twenty seconds and says why', async ({ page }) => {
    test.slow();
    await createHero(page);
    await page.getByTestId('tutorial-chip').click();
    await expect(page.getByTestId('mission-board')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page
      .getByRole('button', { name: /take the job/i })
      .first()
      .click();
    await expect(page.getByTestId('mission-progress')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // A short timer against a printed ten minutes reads as a bug unless the card owns it.
    await expect(page.getByTestId('mission-quick')).toBeVisible();
    await expect(page.getByTestId('mission-remaining')).toContainText('s');

    // Signing moved the tour on by itself: no button was pressed to advance it.
    await expect(page.getByTestId('tutorial-step')).toHaveText('Step 2 of 12');

    // Wait it out for real. Twenty seconds is the point.
    await expect(page.getByTestId('mission-returned')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('tutorial-step')).toHaveText('Step 3 of 12');
  });

  test('explains the first fight at a locked ×1', async ({ page }) => {
    test.slow();
    await createHero(page);
    await page.getByTestId('tutorial-chip').click();
    await page
      .getByRole('button', { name: /take the job/i })
      .first()
      .click();
    await expect(page.getByTestId('mission-returned')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('watch-fight').click();

    const scene = page.getByTestId('battle-scene');
    await expect(scene).toBeVisible({ timeout: SETUP_TIMEOUT });

    // Pinned, and the buttons say why rather than going quietly dead.
    await expect(page.getByTestId('battle-speed-1')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('battle-speed-4')).toBeDisabled();

    // All three notes, in order, over one stretched fight.
    const seen: string[] = [];
    for (let tick = 0; tick < 40; tick += 1) {
      const note = page.getByTestId('battle-callout');
      if ((await note.count()) === 1) {
        const id = (await note.getAttribute('data-callout'))!;
        if (!seen.includes(id)) seen.push(id);
      }
      if ((await scene.getAttribute('data-finished')) === 'true') break;
      await page.waitForTimeout(400);
    }
    expect(seen).toEqual(['initiative', 'procs', 'bars']);
  });
});

test.describe('opting out', () => {
  test('shows no tour at all when ticked at creation', async ({ page }) => {
    await createHero(page, { skip: true });
    await page.waitForTimeout(600);

    await expect(page.getByTestId('tutorial-card')).toHaveCount(0);
    await expect(page.getByTestId('tutorial-chip')).toHaveCount(0);
  });

  test('stays skipped across a reload once the tour is left', async ({ page }) => {
    await createHero(page);
    await page.getByTestId('tutorial-chip').click();
    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('tutorial-skip').click();
    await expect(page.getByTestId('tutorial-card')).toHaveCount(0);
    await expect(page.getByTestId('tutorial-chip')).toHaveCount(0);

    await flush(page);
    await page.reload();
    await expect(page.getByTestId('mission-board')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('tutorial-card')).toHaveCount(0);
    await expect(page.getByTestId('tutorial-chip')).toHaveCount(0);
  });
});

test.describe('after the tour', () => {
  test('hands over to one hint at a time', async ({ page }) => {
    await createHero(page, { skip: true });

    // A day of Vigor and nothing signed for outranks the gold in the purse, because midnight
    // takes the Vigor and the gold will still be there tomorrow.
    const chip = page.getByTestId('hint-chip');
    await expect(chip).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(chip).toHaveAttribute('data-hint', 'vigor-burning');

    await page.getByTestId('hint-dismiss').click();
    await expect(chip).toHaveAttribute('data-hint', 'unspent-gold');
  });

  test('announces a room the moment a level opens it', async ({ page }) => {
    await createHero(page, { skip: true });

    // Level 1 → 4 opens six rooms; every one of them gets a toast and a lit rail row.
    await page.evaluate(async () => {
      const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
      const { save } = handle.getState();
      handle.setState({ save: { ...save!, hero: { ...save!.hero!, level: 1 } } });
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
      const { save } = handle.getState();
      handle.setState({ save: { ...save!, hero: { ...save!.hero!, level: 4 } } });
    });

    // The stack shows the three most recent, so the *last* room the climb opened is the one on
    // screen — the Armory's toast is real but has already been pushed under three others.
    await expect(page.getByText('Now open: Hall of Fame')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.locator('[data-revealed="true"]')).toHaveCount(6);
  });
});

test.describe('the glossary', () => {
  test('explains a term where it stands, forever', async ({ page }) => {
    // Opted out on purpose: the glossary is not tutorial content and must not turn off with it.
    await createHero(page, { skip: true });

    const term = page.getByTestId('term-damage-reduction-cap');
    await term.scrollIntoViewIfNeeded();
    await term.hover();

    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('The most armour can ever take off a hit');
  });
});
