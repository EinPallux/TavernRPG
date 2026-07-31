'use client';

/**
 * Background music, if the player brought some (Q13, asset-pipeline.md §6).
 *
 * The whole feature is one file. Drop `bgm.mp3` into `public/assets/audio/` and the game loops
 * it, with its own row in Settings; take it out and the game is silent, the row disappears, and
 * nothing logs an error. No manifest entry, no code change, no build step — *swapping the file is
 * the workflow*, which is the requirement.
 *
 * That means the absence of the file has to be an ordinary answer rather than a failure. The
 * probe is a `HEAD` request whose rejection is expected: a 404 here is the documented default
 * state of the game, not a problem, so it resolves `false` and never reaches the console.
 *
 * Two behaviours that are easy to skip and are the difference between "has music" and "has music
 * that is pleasant": it **fades** rather than cutting, and it **ducks on blur** — a tab left open
 * in the background playing a lute loop is the reason people mute games permanently.
 */

const BGM_URL = '/assets/audio/bgm.mp3';

/** `[TUNE]` Fade lengths, in ms. Long enough to be a fade, short enough not to feel broken. */
const FADE_IN_MS = 1600;
const FADE_OUT_MS = 600;
/** How often the fade steps. 50ms is inaudibly smooth and costs nothing. */
const FADE_STEP_MS = 50;

let element: HTMLAudioElement | null = null;
let fade: ReturnType<typeof setInterval> | null = null;
let target = 0;
let enabled = false;
let volume = 0.4;
let probed: Promise<boolean> | null = null;

/**
 * Is there a file? Asked once, remembered.
 *
 * Cached as the *promise* rather than the answer so the Settings screen and the shell asking at
 * the same moment make one request between them.
 */
export function bgmAvailable(): Promise<boolean> {
  if (probed) return probed;
  if (typeof window === 'undefined') return Promise.resolve(false);

  probed = fetch(BGM_URL, { method: 'HEAD' })
    .then((response) => response.ok)
    // A missing file is the default state of the game, not an error worth a console line.
    .catch(() => false);

  return probed;
}

function stepFade(): void {
  if (fade !== null) {
    clearInterval(fade);
    fade = null;
  }
  if (!element) return;

  const audio = element;
  const distance = target - audio.volume;
  const span = distance > 0 ? FADE_IN_MS : FADE_OUT_MS;
  const step = (distance / span) * FADE_STEP_MS;

  fade = setInterval(() => {
    if (!element) return;
    const next = element.volume + step;
    const done = step >= 0 ? next >= target : next <= target;

    element.volume = Math.min(1, Math.max(0, done ? target : next));
    if (!done) return;

    if (fade !== null) clearInterval(fade);
    fade = null;
    // Faded all the way out: stop the element rather than leaving it running silently.
    if (target === 0) element.pause();
  }, FADE_STEP_MS);
}

async function start(): Promise<void> {
  if (!(await bgmAvailable())) return;

  if (!element) {
    element = new Audio(BGM_URL);
    element.loop = true;
    element.volume = 0;
    element.preload = 'auto';
  }
  target = volume;
  // Autoplay can still be refused; that is the browser's call and not an error state for us.
  await element.play().catch(() => undefined);
  stepFade();
}

function stop(): void {
  if (!element) return;
  target = 0;
  stepFade();
}

/**
 * Mirror the player's settings.
 *
 * The one place that decides whether music is playing, so a toggle and a volume drag go through
 * the same door and cannot disagree.
 */
export function configureBgm(next: { enabled: boolean; volume: number }): void {
  enabled = next.enabled;
  volume = Math.min(1, Math.max(0, next.volume));

  if (!enabled) {
    stop();
    return;
  }
  if (element && !element.paused) {
    target = volume;
    stepFade();
    return;
  }
  void start();
}

/** Duck while the tab is in the background; come back when it returns. */
export function watchVisibility(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  const onChange = () => {
    if (!enabled) return;
    if (document.hidden) stop();
    else void start();
  };

  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/** Test seam. */
export function resetBgmForTests(): void {
  if (fade !== null) clearInterval(fade);
  fade = null;
  element = null;
  probed = null;
  enabled = false;
  volume = 0.4;
  target = 0;
}
