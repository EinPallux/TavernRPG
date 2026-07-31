/**
 * The Phase 17 performance pass (ROADMAP acceptance: Lighthouse perf ≥ 90 on stage screens).
 *
 * Three measurements, because "it feels fine" is not one:
 *
 * 1. **Lighthouse**, on the rooms the acceptance names. Run against the production server with
 *    the bundled Chromium, mobile emulation off — this is a desktop-first game (style guide §2)
 *    and scoring it on a throttled phone would be measuring a product we did not build.
 * 2. **The bundle**, per route, read off `.next` rather than guessed. A budget catches the import
 *    that quietly pulls a chart library into the tavern.
 * 3. **Frame rate under the heaviest thing the game does** — a battle at ×4 — sampled with rAF.
 *    Lighthouse never sees this: it loads a page and leaves before any fight starts.
 *
 *   npm run perf            # everything
 *   npm run perf -- --quick # bundle + frames only, no Lighthouse
 *
 * Expects a server already running on :3100 (`npx next start --port 3100`).
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3100';
const CHROME = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const QUICK = process.argv.includes('--quick');

/** The rooms the acceptance calls "stage screens": the ones a player actually stands in. */
const STAGE = ['/tavern', '/character', '/arena', '/hall'];

/** `[TUNE]` Budgets. First-load JS for one room, and the shared chunk every room pays for. */
const ROUTE_JS_BUDGET_KB = 600;
const SHARED_JS_BUDGET_KB = 400;
/**
 * `[TUNE]` Main-thread budget for one frame of a choreographed fight.
 *
 * Half of a 60fps frame, leaving the other half for the compositor. Not an fps target — see
 * `frames()` for why fps is the wrong gate in a container with no GPU.
 */
const MAIN_THREAD_BUDGET_MS = 8;
const LIGHTHOUSE_FLOOR = 90;

const problems = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

/* ── 1. The bundle ───────────────────────────────────────────────────────────── */

function bundle() {
  console.log('\n═══ bundle ═══');
  const root = join(process.cwd(), '.next', 'static');
  let total = 0;
  const chunks = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const info = statSync(path);
      if (info.isDirectory()) walk(path);
      else if (entry.endsWith('.js')) {
        total += info.size;
        chunks.push({ name: entry, kb: info.size / 1024 });
      }
    }
  };
  walk(root);

  chunks.sort((a, b) => b.kb - a.kb);
  console.log(
    `  ${chunks.length} JS chunks, ${(total / 1024).toFixed(0)} KB on disk (uncompressed)`,
  );
  for (const chunk of chunks.slice(0, 6)) {
    console.log(`    ${chunk.kb.toFixed(0).padStart(5)} KB  ${chunk.name}`);
  }

  const biggest = chunks[0]?.kb ?? 0;
  check(
    `no single chunk over ${SHARED_JS_BUDGET_KB} KB`,
    biggest <= SHARED_JS_BUDGET_KB,
    `largest is ${biggest.toFixed(0)} KB`,
  );
  return chunks;
}

/* ── 2. What a room actually downloads ───────────────────────────────────────── */

async function transferred(page, route) {
  let bytes = 0;
  const onResponse = async (response) => {
    if (!response.url().includes('/_next/static/') || !response.url().endsWith('.js')) return;
    try {
      bytes += (await response.body()).length;
    } catch {
      /* redirects and aborted requests have no body; they also have no cost. */
    }
  };
  page.on('response', onResponse);
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  page.off('response', onResponse);
  return bytes / 1024;
}

/* ── 3. Frames, under the worst case ─────────────────────────────────────────── */

async function frames(page, cdp) {
  console.log('\n═══ the battle scene, under the worst case ═══');

  /*
   * **Frame rate is not the measurement here, and finding that out was the point.**
   *
   * This container renders through SwiftShader — no GPU, so every composited layer, blur, shadow
   * and canvas blit is done on the CPU. A static room holds a clean 60fps, and a ×4 fight drops
   * to 20; on a machine with a GPU those two numbers would be the same. Reporting 20fps as a
   * defect would be reporting the absence of a graphics card.
   *
   * So the gate is **main-thread cost**, which is GPU-independent: script, layout and recalc per
   * frame, read from CDP. If the scene's scripting fits inside a frame budget, the app is doing
   * its part and the compositor is the environment's problem. The raw fps is still printed,
   * because it is the number a human wants to see.
   */
  await page.goto(`${BASE}/dev/battle`);
  await page.getByTestId('scene-host').waitFor();
  await page
    .getByTestId('battle-speed-4')
    .click()
    .catch(() => {});

  const read = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const of = (name) => metrics.find((metric) => metric.name === name)?.value ?? 0;
    return {
      script: of('ScriptDuration'),
      layout: of('LayoutDuration'),
      recalc: of('RecalcStyleDuration'),
    };
  };

  const before = await read();
  await page.getByTestId('scene-restage').click();
  const sample = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const marks = [];
        let last = performance.now();
        const tick = (now) => {
          marks.push(now - last);
          last = now;
          marks.length < 240 ? requestAnimationFrame(tick) : resolve(marks);
        };
        requestAnimationFrame(tick);
      }),
  );
  const after = await read();

  const deltas = sample.slice(1).sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  const wall = deltas.reduce((sum, delta) => sum + delta, 0);
  const mainThread =
    (after.script - before.script + after.layout - before.layout + after.recalc - before.recalc) *
    1000;
  const perFrame = mainThread / deltas.length;

  console.log(
    `    ${deltas.length} frames over ${(wall / 1000).toFixed(1)}s · ${(1000 / median).toFixed(0)} fps (SwiftShader — no GPU here)`,
  );
  console.log(`    main thread: ${perFrame.toFixed(1)}ms/frame  (script + layout + style recalc)`);
  check(
    `scene costs under ${MAIN_THREAD_BUDGET_MS}ms of main thread per frame`,
    perFrame <= MAIN_THREAD_BUDGET_MS,
    `${perFrame.toFixed(1)}ms`,
  );
}

/* ── 4. Lighthouse ───────────────────────────────────────────────────────────── */

async function lighthouse(port) {
  const { default: run } = await import('lighthouse');
  console.log('\n═══ lighthouse — performance ═══');

  for (const route of STAGE) {
    const result = await run(`${BASE}${route}`, {
      port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance'],
      // Desktop-first game: 1080p, no CPU throttling beyond the light default, no mobile UA.
      formFactor: 'desktop',
      screenEmulation: {
        mobile: false,
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        disabled: false,
      },
      throttlingMethod: 'simulate',
      throttling: { rttMs: 40, throughputKbps: 10_240, cpuSlowdownMultiplier: 1 },
    });

    const { lhr } = result;
    const score = Math.round((lhr.categories.performance.score ?? 0) * 100);
    const metric = (id) => lhr.audits[id]?.displayValue ?? '—';
    console.log(
      `    ${route.padEnd(11)} ${String(score).padStart(3)}  ` +
        `FCP ${metric('first-contentful-paint')} · LCP ${metric('largest-contentful-paint')} · ` +
        `TBT ${metric('total-blocking-time')} · CLS ${metric('cumulative-layout-shift')}`,
    );
    check(`${route} scores ≥ ${LIGHTHOUSE_FLOOR}`, score >= LIGHTHOUSE_FLOOR, `${score}`);
  }
}

/* ── Run ─────────────────────────────────────────────────────────────────────── */

bundle();

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--remote-debugging-port=9222'],
});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');

// A hero, or every room is the class picker.
await page.goto(`${BASE}/character`);
const creation = page.getByTestId('hero-creation');
await creation.or(page.getByTestId('paperdoll')).waitFor();
if (await creation.isVisible()) {
  await page.getByTestId('class-warrior').click();
  await page.getByTestId('hero-name').fill('Kargath');
  await page.getByTestId('confirm-hero').click();
  await page.getByTestId('paperdoll').waitFor();
}
await page.getByTestId('dev-drawer-toggle').click();
await page.getByTestId('dev-level-10').click();
await page.evaluate(async () => {
  await window.__tavernStore?.getState().flush();
});

console.log('\n═══ first-load JS, per room ═══');
for (const route of STAGE) {
  const kb = await transferred(page, route);
  console.log(`    ${route.padEnd(11)} ${kb.toFixed(0).padStart(4)} KB`);
  check(
    `${route} under ${ROUTE_JS_BUDGET_KB} KB of JS`,
    kb <= ROUTE_JS_BUDGET_KB,
    `${kb.toFixed(0)} KB`,
  );
}

await frames(page, cdp);

if (!QUICK) {
  try {
    await lighthouse(9222);
  } catch (error) {
    check('lighthouse ran', false, String(error).split('\n')[0]);
  }
}

await browser.close();
console.log(
  problems.length === 0 ? '\nAll performance checks passed.' : `\nFAILED: ${problems.join(', ')}`,
);
process.exit(problems.length === 0 ? 0 : 1);
