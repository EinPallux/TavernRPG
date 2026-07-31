import sharp from 'sharp';
import type { Page } from '@playwright/test';

/**
 * Contrast, measured from the pixels that were actually painted.
 *
 * **Why this exists next to axe.** Axe computes a background by walking up the DOM for the first
 * opaque `background-color`, and gives up — honestly, reporting *incomplete* — when it meets a
 * `background-image`. Every room in Emberhollow is a painted backdrop under a scrim under a
 * chamfered panel, so on the tavern axe could resolve exactly **one** element and returned 103 as
 * undetermined. Zero violations out of one checked node is not a passing contrast audit; it is an
 * audit that did not happen. (Planting a grey-on-grey paragraph did produce a violation, so the
 * rule works — it is the game's own layering that defeats it.)
 *
 * So this asks the renderer instead. Make every glyph transparent, photograph the page, and read
 * the background out of the image behind each text run. That composites backdrops, gradients,
 * scrims, blurs and opacity for free, because the compositor already did it.
 *
 * Two deliberate choices:
 *
 * - **Worst-case sampling.** A text run over a gradient has no single background. Rather than a
 *   mean — which would let a light-to-dark wash average into a comfortable middle — this takes the
 *   20th and 80th luminance percentiles of the run's own box and reports the *worse* of the two
 *   ratios. Percentiles rather than min/max so a one-pixel chamfer edge or a panel border does not
 *   decide the verdict.
 * - **AA thresholds by rendered size**, not by tag: 3.0 for large text (≥24px, or ≥18.66px bold),
 *   4.5 for everything else, per WCAG 1.4.3.
 */

/** WCAG 1.4.3. */
const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
/**
 * Percentiles used for the worst-case read.
 *
 * Widened from 0.2/0.8 after the level badge — genuine amber-on-ink at 7.9:1 — was reported at
 * 1.5:1. Nothing in Emberhollow is a rectangle: `chamfer-sm` clips every corner, so even an
 * inset band catches a few pixels of whatever is *behind* the chip, and on an 18×14 badge a few
 * pixels is more than a fifth of the sample. 0.35/0.65 still spans a gradient across a panel and
 * no longer lets an anti-aliased corner decide the verdict.
 */
const LOW = 0.35;
const HIGH = 0.65;
/** Text runs smaller than this in either direction are decoration or measurement noise. */
const MIN_BOX = 4;

export interface TextRun {
  readonly label: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: readonly [number, number, number, number];
  readonly large: boolean;
}

export interface ContrastFailure {
  readonly label: string;
  readonly text: string;
  readonly ratio: number;
  readonly required: number;
  readonly colour: string;
  readonly background: string;
}

/** Relative luminance, WCAG 1.4.3 step 1. */
function luminance([r, g, b]: readonly [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/** Text with alpha is painted *onto* its background, so composite before comparing. */
function composite(
  colour: readonly [number, number, number, number],
  over: readonly [number, number, number],
): [number, number, number] {
  const alpha = colour[3];
  return [
    colour[0] * alpha + over[0] * (1 - alpha),
    colour[1] * alpha + over[1] * (1 - alpha),
    colour[2] * alpha + over[2] * (1 - alpha),
  ];
}

const hex = (c: readonly number[]) =>
  `#${c
    .slice(0, 3)
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('')}`;

/**
 * Every element that paints its own text, with where and in what colour.
 *
 * *Direct* text nodes only — a `<div>` wrapping three paragraphs has no glyphs of its own, and
 * measuring its box would sample the gaps between them.
 */
async function textRuns(page: Page): Promise<TextRun[]> {
  return page.evaluate(
    ({ minBox }) => {
      /*
       * Resolve a computed colour by *painting* it, not by parsing it.
       *
       * Tailwind v4 emits `oklch()`, and Chromium hands `getComputedStyle().color` back in the
       * same space — so a regex for numbers reads a lightness, a chroma and a hue angle as if
       * they were red, green and blue. The first version of this did exactly that and reported
       * every colour in the game as `#010000`, which failed 500 elements against backgrounds it
       * had measured correctly. A 1×1 canvas converts anything the parser accepts, including
       * `color-mix()` and whatever the next colour syntax turns out to be.
       */
      const swatch = document.createElement('canvas');
      swatch.width = 1;
      swatch.height = 1;
      const brush = swatch.getContext('2d', { willReadFrequently: true })!;
      const parse = (value: string): [number, number, number, number] => {
        brush.clearRect(0, 0, 1, 1);
        brush.fillStyle = value;
        brush.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = brush.getImageData(0, 0, 1, 1).data;
        return [r ?? 0, g ?? 0, b ?? 0, (a ?? 255) / 255];
      };

      const runs: TextRun[] = [];
      for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        const own = Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join('')
          .trim();
        if (own.length === 0) continue;

        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        if (Number.parseFloat(style.opacity) === 0) continue;

        /*
         * WCAG 1.4.3 exempts "inactive user interface components" by name, and the exemption is
         * the point of the greying rather than a loophole around it: a Buy button the player
         * cannot afford is *supposed* to recede. Read from the DOM rather than from a class, so
         * a component that dims itself without saying `disabled` is still audited.
         */
        const control = element.closest('button, [role="button"], input, select, textarea');
        if (control?.matches(':disabled, [aria-disabled="true"]')) continue;

        const box = element.getBoundingClientRect();
        if (box.width < minBox || box.height < minBox) continue;
        if (box.bottom <= 0 || box.right <= 0) continue;
        if (box.top >= window.innerHeight || box.left >= window.innerWidth) continue;

        const size = Number.parseFloat(style.fontSize);
        const weight = Number.parseInt(style.fontWeight, 10) || 400;

        runs.push({
          label: `${element.tagName.toLowerCase()}${
            element.getAttribute('data-testid') ? `[${element.getAttribute('data-testid')}]` : ''
          }.${(element.className || '').toString().split(' ').slice(0, 2).join('.')}`,
          text: own.slice(0, 48),
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          color: parse(style.color),
          large: size >= 24 || (size >= 18.66 && weight >= 700),
        });
      }
      return runs;
    },
    { minBox: MIN_BOX },
  );
}

/**
 * Audit one screen. Returns only the runs that fail — an empty array is the passing case.
 *
 * The page is mutated (glyphs hidden) and put back before returning, so a caller can keep using
 * it. `!important` on both `color` and `text-shadow`: a shadow left behind would be sampled as
 * background and quietly flatter every result.
 */
/**
 * Wait until nothing on the page is still animating.
 *
 * `document.getAnimations()` knows what is running, including the CSS transitions and Web
 * Animations that Motion drives. Infinite loops — the ambient flicker in every room, a low-health
 * pulse — never finish, so they are filtered out rather than waited on, and the whole thing is
 * bounded: a page that never settles should still be audited rather than hang the suite.
 */
async function settle(page: Page, budgetMs = 3_000): Promise<void> {
  await page.evaluate(async (budget) => {
    const finite = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => undefined));

    await Promise.race([Promise.all(finite), new Promise((done) => setTimeout(done, budget))]);
  }, budgetMs);
}

export async function contrastFailures(page: Page): Promise<ContrastFailure[]> {
  await settle(page);

  /*
   * Pin every element at full opacity, for the measurement *and* the screenshot.
   *
   * This was the last artifact and it took three attempts to find. Skipping elements whose
   * computed opacity was below 1 caught most of it; `animations: 'disabled'` on the screenshot
   * caught the CSS half. Neither touched Motion, which drives opacity from JS — so the level
   * badge (genuine amber-on-ink at 7.9:1) reported **1.52:1 on every run, identically**, because
   * deterministic page-load timing put it at the same point in its fade every time. A stable
   * wrong number reads exactly like a real defect, which is what made it expensive to find.
   *
   * Forcing `opacity: 1` sidesteps the race rather than trying to win it, and it is the more
   * correct reading anyway: the resting state *is* full opacity, and "what does the player sit
   * and read" is the question. Background alphas are untouched — `bg-wood-900/70` is a colour,
   * not the opacity property — so panels keep their real translucency over the art.
   */
  const opaque = await page.addStyleTag({
    content: '*, *::before, *::after { opacity: 1 !important }',
  });

  const runs = await textRuns(page);
  if (runs.length === 0) throw new Error('no text found on the page — the audit did not run');

  const hide = await page.addStyleTag({
    content:
      '*, *::before, *::after { color: transparent !important; text-shadow: none !important }',
  });
  /*
   * `animations: 'disabled'` finishes every CSS animation and transition and holds them at their
   * end state for the shot. Without it a keeper's bark reported 1.3:1 *after* the page had been
   * waited out — because barks rotate on a timer, so a new one starts fading in between measuring
   * the text runs and taking the picture. Settling once cannot fix a thing that starts again.
   */
  // Settle a second time. The first wait happens before the style tags go in, and injecting a
  // stylesheet can itself start a transition — plus anything on a timer (a rotating bark, a
  // toggle whose state just changed) may have begun in between.
  await settle(page, 1_500);
  const shot = await page.screenshot({ type: 'png', animations: 'disabled' });
  await hide.evaluate((node: HTMLElement) => node.remove());
  await opaque.evaluate((node: HTMLElement) => node.remove());

  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const failures: ContrastFailure[] = [];
  for (const run of runs) {
    const x0 = Math.max(0, Math.floor(run.x));
    const y0 = Math.max(0, Math.floor(run.y));
    const x1 = Math.min(width, Math.ceil(run.x + run.width));
    const y1 = Math.min(height, Math.ceil(run.y + run.height));
    if (x1 <= x0 || y1 <= y0) continue;

    /*
     * Sample the band the glyphs live in, not the whole bounding box.
     *
     * Every panel and chip in the game is chamfered by `clip-path`, so the *corners* of a
     * bounding box are transparent and show whatever is behind the element. Reading the 20th
     * percentile of the full box therefore measured the portrait *under* the level chip rather
     * than the chip, and reported a 7.9:1 amber badge as 1.42:1. Insetting to the middle rows and
     * the inner 90% of columns keeps gradients in scope and puts borders, chamfers and the
     * element's own padding out of it.
     */
    /*
     * The inset scales with how much of the box a chamfer can eat.
     *
     * `chamfer-sm` clips a fixed number of pixels off every corner, so on a wide panel that is
     * noise and on an 18×14 level badge it is most of the sample. A flat 25%/10% inset let the
     * portrait *behind* the badge decide its verdict — genuine amber-on-ink at 7.9:1, reported at
     * 1.5:1. Anything narrow in a dimension is read from its middle instead.
     */
    const boxW = x1 - x0;
    const boxH = y1 - y0;
    const fraction = (size: number, wide: number) => (size < 40 ? 0.32 : wide);
    const insetY = Math.min(
      Math.floor(boxH * fraction(boxH, 0.25)),
      Math.max(0, Math.floor((boxH - 2) / 2)),
    );
    const insetX = Math.min(
      Math.floor(boxW * fraction(boxW, 0.1)),
      Math.max(0, Math.floor((boxW - 2) / 2)),
    );

    const pixels: { lum: number; rgb: [number, number, number] }[] = [];
    for (let y = y0 + insetY; y < y1 - insetY; y += 1) {
      for (let x = x0 + insetX; x < x1 - insetX; x += 1) {
        const offset = (y * width + x) * channels;
        const rgb: [number, number, number] = [
          data[offset] ?? 0,
          data[offset + 1] ?? 0,
          data[offset + 2] ?? 0,
        ];
        pixels.push({ lum: luminance(rgb), rgb });
      }
    }
    if (pixels.length === 0) continue;

    pixels.sort((a, b) => a.lum - b.lum);
    const low = pixels[Math.floor(pixels.length * LOW)]!.rgb;
    const high = pixels[Math.min(pixels.length - 1, Math.floor(pixels.length * HIGH))]!.rgb;

    const required = run.large ? AA_LARGE : AA_NORMAL;
    const worst = Math.min(
      ratio(composite(run.color, low), low),
      ratio(composite(run.color, high), high),
    );

    if (worst < required) {
      const against =
        ratio(composite(run.color, low), low) < ratio(composite(run.color, high), high)
          ? low
          : high;
      failures.push({
        label: run.label,
        text: run.text,
        ratio: Number(worst.toFixed(2)),
        required,
        colour: hex(run.color),
        background: hex(against),
      });
    }
  }

  return failures.sort((a, b) => a.ratio - b.ratio);
}

/** How many text runs an audit looked at — proof it looked at something. */
export async function textRunCount(page: Page): Promise<number> {
  return (await textRuns(page)).length;
}

export function report(failures: readonly ContrastFailure[]): string {
  return failures
    .map(
      (failure) =>
        `${failure.ratio}:1 (needs ${failure.required}) ${failure.colour} on ${failure.background} — ${failure.label} "${failure.text}"`,
    )
    .join('\n');
}
