import { expect, test } from '@playwright/test';

/**
 * Phase 4 acceptance: the battle scene.
 *
 * These are the claims that only a real browser can settle — that the fight actually plays
 * forward on its own, that the controls do what they say, and that a player who has asked
 * their OS for less motion still gets a fight they can follow.
 *
 * `/dev/battle` is the host until missions land in Phase 5; the scene it mounts is the same
 * component the mission screen will use.
 */

test.describe('battle playback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/battle');
    await expect(page.getByTestId('battle-scene')).toBeVisible();
  });

  test('both fighters take the stage with health bars', async ({ page }) => {
    await expect(page.getByTestId('fighter-a')).toBeVisible();
    await expect(page.getByTestId('fighter-b')).toBeVisible();

    const health = page.getByTestId('health-a');
    await expect(health).toHaveAttribute('aria-valuemax', /\d+/);
    // Nobody has been hit yet, so the bar opens full.
    const max = await health.getAttribute('aria-valuemax');
    await expect(health).toHaveAttribute('aria-valuenow', String(max));
  });

  test('the fight plays forward without being touched', async ({ page }) => {
    const progress = page.getByTestId('battle-progress');
    const widthNow = () => progress.evaluate((node) => node.getBoundingClientRect().width);

    const started = await widthNow();
    await expect.poll(widthNow, { timeout: 4_000 }).toBeGreaterThan(started + 20);

    // …and it reaches the end on its own.
    await expect(page.getByTestId('battle-scene')).toHaveAttribute('data-finished', 'true', {
      timeout: 15_000,
    });
  });

  test('the hero loses health as the fight goes on', async ({ page }) => {
    const readHealth = async (side: 'a' | 'b') =>
      Number(await page.getByTestId(`health-${side}`).getAttribute('aria-valuenow'));

    const openingA = await readHealth('a');
    const openingB = await readHealth('b');

    await expect(page.getByTestId('battle-scene')).toHaveAttribute('data-finished', 'true', {
      timeout: 15_000,
    });

    // Somebody has to have been hurt; the loser is at zero.
    const endA = await readHealth('a');
    const endB = await readHealth('b');
    expect(endA + endB).toBeLessThan(openingA + openingB);
    expect(Math.min(endA, endB)).toBe(0);
  });

  test('skip jumps straight to the result', async ({ page }) => {
    await page.getByTestId('battle-skip').click();

    await expect(page.getByTestId('battle-result')).toBeVisible();
    await expect(page.getByTestId('battle-scene')).toHaveAttribute('data-finished', 'true');
    // Skip becomes Replay, because there is nothing left to skip.
    await expect(page.getByTestId('battle-replay')).toBeVisible();
    await expect(page.getByTestId('battle-skip')).toHaveCount(0);
  });

  test('replay starts the fight over', async ({ page }) => {
    await page.getByTestId('battle-skip').click();
    await expect(page.getByTestId('battle-replay')).toBeVisible();

    await page.getByTestId('battle-replay').click();

    await expect(page.getByTestId('battle-skip')).toBeVisible();
    await expect(page.getByTestId('battle-scene')).toHaveAttribute('data-finished', 'false');
  });

  test('×4 finishes the same fight faster than ×1', async ({ page }) => {
    const runToEnd = async () => {
      const started = Date.now();
      await expect(page.getByTestId('battle-scene')).toHaveAttribute('data-finished', 'true', {
        timeout: 20_000,
      });
      return Date.now() - started;
    };

    const atOne = await runToEnd();

    await page.getByTestId('battle-replay').click();
    await page.getByTestId('battle-speed-4').click();
    await expect(page.getByTestId('battle-speed-4')).toHaveAttribute('aria-pressed', 'true');
    const atFour = await runToEnd();

    // Four times faster in principle; allow generous slack for scheduling and the fixed
    // ceremony beats, which do not scale with the exchange.
    expect(atFour).toBeLessThan(atOne * 0.7);
  });

  test('the result screen accounts for the fight', async ({ page }) => {
    await page.getByTestId('battle-skip').click();

    const result = page.getByTestId('battle-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText(/Victory|Defeat/);
    // The closest-moment line is the one stat every result carries.
    await expect(page.getByTestId('closest-moment')).toBeVisible();

    const outcome = await result.getAttribute('data-outcome');
    if (outcome === 'victory') {
      await expect(page.getByTestId('reward-gold')).toBeVisible();
      await expect(page.getByTestId('reward-xp')).toBeVisible();
      await expect(page.getByTestId('reward-item')).toBeVisible();
    } else {
      // A loss must always say why (combat spec §6).
      await expect(page.getByTestId('loss-hints')).toBeVisible();
    }
  });

  test('a mission-length fight is over inside the target at ×1', async ({ page }) => {
    // The page reports the timeline length the scene will actually play.
    const runtime = await page.getByTestId('scene-runtime').textContent();
    expect(Number.parseFloat(runtime ?? '99')).toBeLessThanOrEqual(8.1);
  });
});

test.describe('reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('the fight is still followable, and still reaches a result', async ({ page }) => {
    await page.goto('/dev/battle');
    await expect(page.getByTestId('battle-scene')).toBeVisible();

    // Every fighter and every control is still there — reduced motion strips ceremony,
    // not information (style guide §7).
    await expect(page.getByTestId('fighter-a')).toBeVisible();
    await expect(page.getByTestId('fighter-b')).toBeVisible();
    await expect(page.getByTestId('battle-speed-1')).toBeVisible();

    await expect(page.getByTestId('battle-scene')).toHaveAttribute('data-finished', 'true', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('battle-result')).toBeVisible();
  });

  test('drops the particle canvas rather than animating it', async ({ page }) => {
    await page.goto('/dev/battle');
    await expect(page.getByTestId('battle-scene')).toBeVisible();

    // The layer renders nothing at all under reduced motion. Retrying rather than counting
    // once: the motion preference is only known after hydration, so the first client render
    // can briefly mount the canvas before the effect settles.
    await expect(page.locator('[data-testid="battle-scene"] canvas')).toHaveCount(0);
  });
});

test.describe('house style', () => {
  test('the scene keeps to chamfers — no rounded corners', async ({ page }) => {
    await page.goto('/dev/battle');
    await expect(page.getByTestId('battle-scene')).toBeVisible();

    // Style guide §3: border-radius over 4px is banned game-wide.
    const offenders = await page.locator('[data-testid="battle-scene"] *').evaluateAll((nodes) =>
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

    expect(offenders).toEqual([]);
  });
});

/**
 * The VFX pass: things a canvas draws, which no ordinary assertion can see.
 *
 * `toBeVisible` knows `display`, `visibility`, `opacity` and box size — the particle canvas is
 * always all four, whether it is painting a fireball or nothing at all. This codebase has already
 * shipped two bugs that hid behind exactly that gap (the town map's plaques, then the item hover
 * cards, both invisible for months under a passing test), so the invariant is asserted directly:
 * **read the pixels**.
 *
 * The measurement is a strip down the middle of the gap between the fighters. Nothing belongs
 * there but a projectile and its trail — bursts bloom on the portraits at the quarter marks — so
 * a lit strip is a bolt in flight and a dark one is not. The melee control is what makes that a
 * claim rather than a coincidence.
 */
test.describe('spell effects cross the stage', () => {
  /** Peak lit pixels in the middle of the gap over ~3s, and their average colour. */
  async function peakMidGap(page: import('@playwright/test').Page) {
    return page.evaluate(async () => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="particle-layer"]');
      if (!canvas) return { lit: -1, r: 0, g: 0, b: 0 };
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return { lit: -1, r: 0, g: 0, b: 0 };

      let best = { lit: 0, r: 0, g: 0, b: 0 };
      for (let i = 0; i < 90; i += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        await new Promise((resolve) => setTimeout(resolve, 25));

        const x0 = Math.floor(canvas.width * 0.42);
        const x1 = Math.floor(canvas.width * 0.58);
        const { data } = ctx.getImageData(x0, 0, x1 - x0, canvas.height);

        let lit = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let p = 0; p < data.length; p += 4) {
          if (data[p + 3]! > 26) {
            lit += 1;
            r += data[p]!;
            g += data[p + 1]!;
            b += data[p + 2]!;
          }
        }
        if (lit > best.lit) {
          best = { lit, r: Math.round(r / lit), g: Math.round(g / lit), b: Math.round(b / lit) };
        }
      }
      return best;
    });
  }

  async function stage(page: import('@playwright/test').Page, hero: string, foe: string) {
    await page.goto('/dev/battle');
    await expect(page.getByTestId('battle-scene')).toBeVisible();
    await page.getByText(hero, { exact: true }).click();
    await page.getByText(foe, { exact: true }).click();
    await page.waitForTimeout(400);
  }

  test('a Mage throws something, and it is teal', async ({ page }) => {
    await stage(page, 'Mage', 'Tank');
    const peak = await peakMidGap(page);

    expect(peak.lit, 'nothing crossed the gap').toBeGreaterThan(150);
    // The arcane school is `#3fa7a0`. Green dominant, blue close behind, red well back.
    expect(peak.g).toBeGreaterThan(peak.r + 40);
    expect(peak.b).toBeGreaterThan(peak.r + 40);
  });

  test('a Warrior does not — they close the distance instead', async ({ page }) => {
    /*
     * The control, and the whole reason the test above means anything. Two melee schools leave
     * the middle of the stage completely empty; if this ever lights up, the assertion opposite is
     * measuring a backdrop or a stray burst rather than a projectile.
     */
    await stage(page, 'Warrior', 'Tank');
    const peak = await peakMidGap(page);

    expect(peak.lit).toBeLessThan(40);
  });

  test('a Caster throws in red, so the player can tell whose spell it is', async ({ page }) => {
    /*
     * The deliberate asymmetry from `data/combatVfx.ts`: the player's magic is teal and the
     * monsters' is red. Two bolts of the same shape crossing the same gap, and at ×4 the colour
     * is the only thing saying which way the damage is going.
     */
    await stage(page, 'Warrior', 'Caster');
    const peak = await peakMidGap(page);

    expect(peak.lit, 'the caster never cast').toBeGreaterThan(150);
    expect(peak.r).toBeGreaterThan(peak.g + 60);
    expect(peak.r).toBeGreaterThan(peak.b + 60);
  });

  test('an arrow crosses too — thinner than a spell, but not invisible', async ({ page }) => {
    // Shipped at 53 peak pixels against the Mage's 436, which is "technically drawn". The arrow
    // is meant to be the *slimmest* thing that crosses the stage, not an absent one.
    await stage(page, 'Hunter', 'Tank');
    const peak = await peakMidGap(page);

    expect(peak.lit).toBeGreaterThan(80);
    expect(peak.g).toBeGreaterThan(peak.b);
  });
});
