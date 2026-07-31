// @vitest-environment jsdom

/**
 * The music, with and without a file.
 *
 * The whole feature hinges on absence being *ordinary* — the shipped game has no `bgm.mp3`, so
 * the 404 path is what almost every player gets and it has to be indistinguishable from a game
 * that was never going to play music. That is easy to write and easy to regress into a console
 * error, a hidden `<audio>` element that never plays, or a settings row offering a switch for
 * nothing. All three are asserted here.
 *
 * The other half is politeness: it fades rather than cutting, and it stops when the tab is not
 * being looked at.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bgmAvailable, configureBgm, resetBgmForTests, watchVisibility } from './bgm';

class FakeAudio {
  static made: FakeAudio[] = [];
  loop = false;
  volume = 1;
  preload = '';
  paused = true;
  plays = 0;
  readonly src: string;

  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
  play(): Promise<void> {
    this.plays += 1;
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

/** Answer the probe. `ok: false` is a 404, which is the default state of the game. */
function servesMusic(ok: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok }) as unknown as Promise<Response>),
  );
}

/** A network that is not there at all — a rejection rather than a 404. */
function servesNothing(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
  );
}

const only = () => FakeAudio.made[0]!;

beforeEach(() => {
  vi.useFakeTimers();
  FakeAudio.made = [];
  vi.stubGlobal('Audio', FakeAudio);
  resetBgmForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetBgmForTests();
});

describe('with no bgm.mp3 — the default game', () => {
  it('answers false without complaining', async () => {
    servesMusic(false);
    await expect(bgmAvailable()).resolves.toBe(false);
  });

  it('treats an outright network failure the same way', async () => {
    // A rejected fetch is the one that reaches the console if it is not caught.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    servesNothing();

    await expect(bgmAvailable()).resolves.toBe(false);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('builds no element when music is switched on', async () => {
    servesMusic(false);
    configureBgm({ enabled: true, volume: 0.4 });
    await vi.advanceTimersByTimeAsync(50);

    expect(FakeAudio.made).toHaveLength(0);
  });

  it('asks once however many callers ask', async () => {
    servesMusic(false);
    const probe = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    // The Settings screen and the shell mount in the same tick.
    await Promise.all([bgmAvailable(), bgmAvailable(), bgmAvailable()]);
    expect(probe).toHaveBeenCalledTimes(1);
  });
});

describe('with a bgm.mp3', () => {
  beforeEach(() => servesMusic(true));

  it('loops it, and fades in rather than starting at full volume', async () => {
    configureBgm({ enabled: true, volume: 0.4 });
    await vi.advanceTimersByTimeAsync(0);

    expect(FakeAudio.made).toHaveLength(1);
    expect(only().loop).toBe(true);
    expect(only().plays).toBe(1);
    // A loop that arrives at full loudness on the first sample is a jump scare.
    expect(only().volume).toBe(0);

    await vi.advanceTimersByTimeAsync(200);
    expect(only().volume).toBeGreaterThan(0);
    expect(only().volume).toBeLessThan(0.4);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(only().volume).toBeCloseTo(0.4, 5);
  });

  it('fades out and then actually stops', async () => {
    configureBgm({ enabled: true, volume: 0.4 });
    await vi.advanceTimersByTimeAsync(2_000);

    configureBgm({ enabled: false, volume: 0.4 });
    await vi.advanceTimersByTimeAsync(100);
    expect(only().paused).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(only().volume).toBe(0);
    // Left running at zero it would keep the tab's audio indicator lit forever.
    expect(only().paused).toBe(true);
  });

  it('reuses the element across a stop and a restart', async () => {
    configureBgm({ enabled: true, volume: 0.4 });
    await vi.advanceTimersByTimeAsync(2_000);
    configureBgm({ enabled: false, volume: 0.4 });
    await vi.advanceTimersByTimeAsync(1_000);
    configureBgm({ enabled: true, volume: 0.4 });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(FakeAudio.made).toHaveLength(1);
    expect(only().volume).toBeCloseTo(0.4, 5);
  });

  it('follows a volume change without restarting', async () => {
    configureBgm({ enabled: true, volume: 0.4 });
    await vi.advanceTimersByTimeAsync(2_000);

    configureBgm({ enabled: true, volume: 0.1 });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(only().plays).toBe(1);
    expect(only().volume).toBeCloseTo(0.1, 5);
  });
});

describe('the tab nobody is looking at', () => {
  beforeEach(() => servesMusic(true));

  function setHidden(hidden: boolean): void {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('ducks on blur and comes back on focus', async () => {
    const stop = watchVisibility();
    configureBgm({ enabled: true, volume: 0.4 });
    await vi.advanceTimersByTimeAsync(2_000);

    setHidden(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(only().paused).toBe(true);

    setHidden(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(only().paused).toBe(false);
    expect(only().volume).toBeCloseTo(0.4, 5);

    stop();
  });

  it('stays quiet on focus when the player wanted silence', async () => {
    const stop = watchVisibility();
    configureBgm({ enabled: false, volume: 0.4 });
    await vi.advanceTimersByTimeAsync(0);

    setHidden(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeAudio.made).toHaveLength(0);

    stop();
  });

  it('stops listening once torn down', async () => {
    const stop = watchVisibility();
    configureBgm({ enabled: true, volume: 0.4 });
    await vi.advanceTimersByTimeAsync(2_000);
    stop();

    setHidden(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(only().paused).toBe(false);
  });
});
