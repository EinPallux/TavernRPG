import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * What the deployment actually sends (ROADMAP Phase 18 — "Vercel production config").
 *
 * Every claim here is read off a live `next start` serving a real `next build`, never off
 * `next.config.ts`. A header you can only prove by reading the file that sets it is a tautology;
 * this suite is the same discipline as `e2e/contrast.ts` reading pixels rather than trusting axe,
 * and it exists because the config went through three rounds where the server disagreed with it.
 *
 * The CSP tests are the interesting half. A policy that is *present* proves nothing — a policy the
 * game violates on every load is worse than none, because the violations train you to ignore them.
 * So the last test plays through five rooms with a `securitypolicyviolation` listener attached and
 * fails on a single report.
 */

const STAGE_ROUTES = ['/', '/tavern', '/character', '/board', '/settings'] as const;

/** Sent on every response — documents, chunks and art alike. */
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string | RegExp]> = [
  ['x-content-type-options', 'nosniff'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
  ['x-frame-options', 'DENY'],
  ['cross-origin-opener-policy', 'same-origin'],
  ['cross-origin-resource-policy', 'same-origin'],
  ['permissions-policy', /camera=\(\)/],
  ['strict-transport-security', /max-age=\d{7,}/],
];

test.describe('the production response headers', () => {
  test('every document carries the security set', async ({ request }) => {
    for (const route of STAGE_ROUTES) {
      const response = await request.get(route);
      expect(response.status(), route).toBe(200);
      const headers = response.headers();
      for (const [key, expected] of SECURITY_HEADERS) {
        const actual = headers[key];
        expect(actual, `${route} is missing ${key}`).toBeDefined();
        if (typeof expected === 'string') expect(actual, `${route} ${key}`).toBe(expected);
        else expect(actual, `${route} ${key}`).toMatch(expected);
      }
      // Nothing needs to know what the server is.
      expect(headers['x-powered-by'], route).toBeUndefined();
    }
  });

  test('the CSP forbids eval and names no third-party origin', async ({ request }) => {
    const policy = (await request.get('/tavern')).headers()['content-security-policy'];
    expect(policy, 'no CSP on the document').toBeDefined();

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");

    /*
     * `'unsafe-eval'` is absent because `src/engine/save/schema.ts` declares Zod `jitless` — the
     * only thing in the bundle that reached for `Function()`. If that line is ever removed the
     * violation comes back silently (Zod catches its own throw), so this assertion is the tripwire.
     */
    expect(policy, 'something re-granted eval').not.toContain('unsafe-eval');

    /*
     * `'unsafe-inline'` on scripts and styles is a deliberate, measured concession: Next hydrates
     * from an inline script and React writes inline style attributes. It is asserted rather than
     * merely tolerated so that removing it is a visible decision — without it the page serves,
     * paints and never hydrates.
     */
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");

    // The directive that matters most for a game whose save lives in the player's own browser:
    // there is nowhere off-origin for anything to go.
    expect(policy).not.toMatch(/https?:\/\//);
  });

  test('immutable is only promised where the URL is content-addressed', async ({ request }) => {
    const html = await (await request.get('/tavern')).text();
    const chunk = /\/_next\/static\/[^"']+\.js/.exec(html)?.[0];
    expect(chunk, 'no hashed chunk in the document').toBeTruthy();

    /*
     * Next sets this itself and `next.config.ts` deliberately does not restate it. Asserting its
     * value here rather than mirroring it is the same rule the forge odds and the guild bounty
     * targets are under: one owner per number.
     */
    const chunkCache = (await request.get(chunk!)).headers()['cache-control'];
    expect(chunkCache).toBe('public, max-age=31536000, immutable');

    /*
     * The art is served at authored paths — `/assets/backgrounds/tavern_background.webp` is a
     * literal in `data/places.ts` — and `scripts/sync-assets.mjs` rewrites those same paths
     * whenever the paintings or `WEBP_QUALITY` change. `immutable` here would pin a superseded
     * backdrop in a returning player's browser for a year. It caches for a day and refreshes
     * behind the player for a week after that.
     */
    const artCache = (await request.get('/assets/backgrounds/tavern_background.webp')).headers()[
      'cache-control'
    ];
    expect(artCache, 'a mutable URL was marked immutable').not.toContain('immutable');
    expect(artCache).toContain('max-age=86400');
    expect(artCache).toContain('stale-while-revalidate=');

    // One owner per response, too: two rules matching the same path would emit two values.
    expect(artCache?.split(',').filter((part) => part.includes('max-age')).length).toBe(1);
  });

  test('a conditional request on the art is a 304, not a resend', async ({ request }) => {
    // What `max-age=86400` costs when it lapses: the revalidation has to be cheap or the policy
    // is just a slower version of no caching at all.
    const first = await request.get('/assets/classes/Warrior.webp');
    const etag = first.headers()['etag'];
    expect(etag).toBeTruthy();
    const second = await request.get('/assets/classes/Warrior.webp', {
      headers: { 'If-None-Match': etag! },
    });
    expect(second.status()).toBe(304);
  });

  test('the dev harnesses ship but ask not to be indexed', async ({ request }) => {
    expect((await request.get('/dev/kit')).headers()['x-robots-tag']).toBe('noindex');
    // …and the game itself does not carry the tag, which is the half that would be a real bug.
    expect((await request.get('/tavern')).headers()['x-robots-tag']).toBeUndefined();
  });

  test('the deploy is static: no route needs a server at request time', () => {
    /*
     * `next.config.ts` opens by calling the game "static output". Vercel will happily provision a
     * function for a single dynamic route and the deploy would still work — it would just quietly
     * stop being the thing the architecture doc describes. Read the build's own manifest.
     */
    const manifest = JSON.parse(readFileSync('.next/routes-manifest.json', 'utf8')) as {
      dynamicRoutes: unknown[];
      staticRoutes: unknown[];
    };
    expect(manifest.dynamicRoutes).toHaveLength(0);
    expect(manifest.staticRoutes.length).toBeGreaterThanOrEqual(20);

    const prerendered = Object.keys(
      (JSON.parse(readFileSync('.next/prerender-manifest.json', 'utf8')) as { routes: object })
        .routes,
    );
    for (const place of ['/tavern', '/character', '/board', '/arena', '/settings']) {
      expect(prerendered, `${place} is not prerendered`).toContain(place);
    }
  });
});

test.describe('the game under its own policy', () => {
  async function collectViolations(page: Page, routes: readonly string[]) {
    const reports: string[] = [];
    await page.addInitScript(() => {
      (globalThis as { __csp?: string[] }).__csp = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        (globalThis as { __csp?: string[] }).__csp?.push(
          `${event.violatedDirective} → ${event.blockedURI} (${event.sourceFile}:${event.lineNumber})`,
        );
      });
    });
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const seen = await page.evaluate(() => (globalThis as { __csp?: string[] }).__csp ?? []);
      reports.push(...seen.map((entry) => `${route}: ${entry}`));
    }
    return reports;
  }

  test('plays five rooms without a single policy violation', async ({ page }) => {
    const violations = await collectViolations(page, STAGE_ROUTES);
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('and hydrates — the check that catches a policy that is merely quiet', async ({ page }) => {
    /*
     * A CSP strict enough to block Next's inline bootstrap produces *one* violation and a page
     * that looks almost right: the server-rendered shell paints, nothing is interactive, and a
     * violation count of one reads as nearly clean. So don't look at the page — use it. Making a
     * hero is client state, a store write and an IndexedDB round trip; none of it survives a
     * document that never hydrated.
     */
    await page.goto('/character');
    await expect(page.getByTestId('hero-creation')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('class-warrior').click();
    await page.getByTestId('hero-name').fill('Kargath');
    await page.getByTestId('confirm-hero').click();
    await expect(page.getByTestId('paperdoll')).toBeVisible({ timeout: 20_000 });

    await page.goto('/tavern');
    await expect(page.getByTestId('place-tavern')).toBeVisible({ timeout: 20_000 });
  });

  test('the battle scene animates under the policy', async ({ page }) => {
    // Motion drives transforms through inline style attributes and the particle layer draws sprite
    // images into a canvas — the `style-src` and `img-src` cases a room-by-room sweep of static
    // screens would never exercise. The fight plays itself; watch it all the way to the end.
    const violations = await collectViolations(page, ['/dev/battle']);
    await expect(page.getByTestId('battle-scene')).toHaveAttribute('data-finished', 'true', {
      timeout: 20_000,
    });
    const during = await page.evaluate(() => (globalThis as { __csp?: string[] }).__csp ?? []);
    expect([...violations, ...during].join('\n')).toBe('');
  });
});
