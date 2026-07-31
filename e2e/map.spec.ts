import { expect, test, type Page } from '@playwright/test';

/**
 * The town map (`data/townMap.ts`, `components/map/TownMapScreen.tsx`).
 *
 * `townMap.test.ts` already proves the arithmetic — every room has a rectangle, none overlap, all
 * of them are inside the painting. What a unit test cannot prove is that those rectangles land on
 * *pixels the player can reach*: the frame is sized by container-query units against a stage whose
 * height varies with the window, and a fit that is one CSS declaration wrong puts the doors in the
 * wrong place while every number involved stays correct. So these tests measure the real boxes at
 * three window sizes and click the real buildings.
 */

const SETUP_TIMEOUT = 20_000;

async function flush(page: Page) {
  await page.evaluate(async () => {
    const store = (
      window as unknown as { __tavernStore?: { getState: () => { flush: () => Promise<void> } } }
    ).__tavernStore;
    await store?.getState().flush();
  });
}

async function makeHero(page: Page, name = 'Mapwalker') {
  await page.goto('/map');

  /*
   * Wait for the shell to *decide* before asking what it decided.
   *
   * Nothing paints until the tab lock is settled and the save has loaded, so a visibility check
   * fired the instant `goto` returns reads "not creating" every time and skips straight past the
   * creation screen — which is then still on top of the map for the rest of the test.
   */
  const creation = page.getByTestId('hero-creation');
  const map = page.getByTestId('place-map');
  await expect(creation.or(map)).toBeVisible({ timeout: SETUP_TIMEOUT });

  if (await creation.isVisible()) {
    await page.getByTestId('class-warrior').click();
    await page.getByTestId('hero-name').fill(name);
    await page.getByTestId('confirm-hero').click();
  }
  await expect(map).toBeVisible({ timeout: SETUP_TIMEOUT });
  await flush(page);
}

/** Level the hero the real way, so the gates lift the way they would in play. */
async function levelToTen(page: Page) {
  await page.goto('/character');
  await page.getByTestId('dev-drawer-toggle').click();
  await page.getByTestId('dev-level-10').click();
  await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });
  await flush(page);
}

/** Every building on the map, and where it opens. */
const BUILDINGS = [
  ['tavern', 'place-tavern'],
  ['character', 'paperdoll'],
  ['board', 'place-board'],
  ['patrol', 'place-patrol'],
  ['armory', 'place-armory'],
  ['facet', 'place-facet'],
  ['forge', 'place-forge'],
  ['stables', 'place-stables'],
  ['menagerie', 'place-menagerie'],
  ['arena', 'place-arena'],
  ['hall', 'place-hall'],
  ['guild', 'place-guild'],
  ['undertavern', 'place-undertavern'],
  ['fortune', 'place-fortune'],
] as const;

test.describe('the town map', () => {
  test.beforeEach(async ({ page }) => makeHero(page));

  test('every building on the map opens its room', async ({ page }) => {
    await levelToTen(page);

    for (const [place, arrived] of BUILDINGS) {
      await page.goto('/map');
      await expect(page.getByTestId('place-map')).toBeVisible({ timeout: SETUP_TIMEOUT });

      const building = page.getByTestId(`map-${place}`);
      await expect(building, `${place} has no building on the map`).toBeVisible();
      await expect(building).toHaveAttribute('data-locked', 'false');

      await building.click();
      await expect(page).toHaveURL(new RegExp(`/${place}$`));
      await expect(page.getByTestId(arrived), `${place} did not open`).toBeVisible({
        timeout: SETUP_TIMEOUT,
      });
    }
  });

  test('hovering a building says what it is and who keeps it', async ({ page }) => {
    await page.getByTestId('map-tavern').hover();

    const plaque = page.getByTestId('map-plaque');
    await expect(plaque).toBeVisible();
    await expect(plaque).toContainText('The Gilded Tankard');
    await expect(plaque).toContainText('Marla keeps it');

    /*
     * Nothing between the plaque and the frame may clip.
     *
     * The plaque started life inside its hotspot button, which carries `chamfer-sm` — a
     * `clip-path` — so every plaque was cut off at the edge of the building it belonged to and
     * never appeared at all. This test passed the whole time: `toBeVisible` knows about
     * `display`, `visibility` and `opacity`, and nothing whatsoever about clipping. So the
     * invariant is asserted directly rather than inferred from visibility.
     */
    const clipper = await plaque.evaluate((element) => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        if (node.classList.contains('town-map-frame')) return null;
        if (getComputedStyle(node).clipPath !== 'none') return node.className || node.tagName;
      }
      return null;
    });
    expect(clipper, 'an ancestor clips the plaque away').toBeNull();

    // One plaque, and it moves — a plaque that latches turns the map into fourteen labels.
    await page.getByTestId('map-board').hover();
    await expect(plaque).toContainText('Notice Board');
    await expect(plaque).toHaveCount(1);
  });

  test('a locked building says its level and refuses the click', async ({ page }) => {
    // Level 1: the Undertavern is nine levels away.
    const shut = page.getByTestId('map-undertavern');
    await expect(shut).toHaveAttribute('data-locked', 'true');

    // The level is on the building itself, not only in the plaque: at level 1 twelve of the
    // fourteen are shut, and "which of these is next" should not need fourteen hovers.
    await expect(shut).toContainText('Lv 10');

    await shut.hover();
    await expect(page.getByTestId('map-plaque')).toContainText('Opens at level 10');

    /*
     * Two refusals, and both are wanted.
     *
     * The building says `aria-disabled`, which Playwright honours by refusing to click it at all —
     * that is the assistive-technology contract working. `force` goes around it to test the second
     * one: the handler itself, because a gate that only lives in an attribute is a gate that a
     * stray `router.push` walks straight through.
     */
    await expect(shut).toHaveAttribute('aria-disabled', 'true');
    await shut.click({ force: true });

    // Still outside. A gate the rail enforces and the map does not is a gate with a hole in it.
    await expect(page).toHaveURL(/\/map$/);
    await expect(page.getByTestId('place-map')).toBeVisible();
  });

  test('and opens once the hero is big enough', async ({ page }) => {
    await levelToTen(page);
    await page.goto('/map');

    const open = page.getByTestId('map-undertavern');
    await expect(open).toHaveAttribute('data-locked', 'false', { timeout: SETUP_TIMEOUT });
    await open.click();
    await expect(page.getByTestId('place-undertavern')).toBeVisible({ timeout: SETUP_TIMEOUT });
  });

  test('the buildings sit inside the painting at every window size', async ({ page }) => {
    /*
     * The test the whole feature rests on.
     *
     * The hotspots are percentages of the *art*, so they are only correct if the element holding
     * them is exactly the element holding the image — which is a CSS fit, not a number, and it is
     * the thing that breaks silently. A frame that letterboxes inside a larger box, or one that
     * stretches to the stage, still renders fourteen buttons; they are just on the grass.
     *
     * Three windows, including the smallest the game claims to support and one with the rail
     * collapsed out of the way, and the assertion is geometric: every building is inside the
     * frame, the frame is inside the stage, and the frame kept the painting's 16:9.
     */
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 2560, height: 1080 }, // ultrawide: height is the binding constraint
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/map');
      await expect(page.getByTestId('place-map')).toBeVisible({ timeout: SETUP_TIMEOUT });

      const stage = (await page.getByTestId('place-map').boundingBox())!;
      const frame = (await page.locator('.town-map-frame').boundingBox())!;

      const label = `${viewport.width}×${viewport.height}`;
      expect(
        frame.width / frame.height,
        `${label}: the frame lost the painting's ratio`,
      ).toBeCloseTo(16 / 9, 1);
      expect(frame.width, `${label}: the frame is wider than the stage`).toBeLessThanOrEqual(
        stage.width + 1,
      );
      expect(frame.height, `${label}: the frame is taller than the stage`).toBeLessThanOrEqual(
        stage.height + 1,
      );
      expect(frame.width, `${label}: the frame collapsed`).toBeGreaterThan(400);

      for (const [place] of BUILDINGS) {
        const box = (await page.getByTestId(`map-${place}`).boundingBox())!;
        expect(box.x, `${label}: ${place} starts left of the map`).toBeGreaterThanOrEqual(
          frame.x - 2,
        );
        expect(box.y, `${label}: ${place} starts above the map`).toBeGreaterThanOrEqual(
          frame.y - 2,
        );
        expect(box.x + box.width, `${label}: ${place} runs off the right`).toBeLessThanOrEqual(
          frame.x + frame.width + 2,
        );
        expect(box.y + box.height, `${label}: ${place} runs off the bottom`).toBeLessThanOrEqual(
          frame.y + frame.height + 2,
        );
        // Big enough to hit with a mouse, at the smallest window we claim to support.
        expect(box.width, `${label}: ${place} is ${Math.round(box.width)}px wide`).toBeGreaterThan(
          40,
        );
        expect(
          box.height,
          `${label}: ${place} is ${Math.round(box.height)}px tall`,
        ).toBeGreaterThan(40);
      }
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test('the rail and the map agree about what is waiting', async ({ page }) => {
    /*
     * Two ways of getting around means two places a badge can fail to appear, and the one that
     * fails is always the one the author does not use. `state/townSignals.ts` is the single
     * answer both read; this is the test that would notice a second copy appearing.
     */
    await levelToTen(page);
    await page.goto('/map');
    await expect(page.getByTestId('place-map')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // A level-10 hero has cleared nothing, so no companion has arrived — but the Notice Board's
    // first daily chest is claimable the moment the tasks are drawn.
    await page.goto('/board');
    await expect(page.getByTestId('place-board')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await page.goto('/map');
    await expect(page.getByTestId('place-map')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const onMap = await page.getByTestId('map-dot-board').count();
    const onRail = await page.getByTestId('nav-dot-board').count();
    expect(onMap, 'the map and the rail disagree about the Notice Board').toBe(onRail);
  });

  test('the tour marks the building it wants you in', async ({ page }) => {
    // A brand-new hero's first beat is at the tavern, and the map is the screen they land on —
    // so the map has to be able to point, or the tour opens with "go somewhere" and no somewhere.
    await expect(page.getByTestId('map-beckons-tavern')).toBeVisible();
    await expect(page.getByTestId('map-beckons-armory')).toHaveCount(0);
  });

  test('the rail can get back outside', async ({ page }) => {
    await page.goto('/character');
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('nav-map').click();
    await expect(page).toHaveURL(/\/map$/);
    await expect(page.getByTestId('place-map')).toBeVisible();
  });
});
