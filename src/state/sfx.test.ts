// @vitest-environment jsdom

/**
 * The mixer, against a fake speaker.
 *
 * jsdom has no `AudioContext`, which is convenient: standing a small fake one up is the only way
 * to assert the three behaviours that are invisible from outside — that a muted game never opens
 * an audio device at all, that the throttle drops repeats *per family* rather than globally, and
 * that the node graph built for a cue is released afterwards. All three are the kind of thing
 * that works in the browser right up until the fortieth hit of a ×4 fight.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THROTTLE_MS } from '@/data/sfx';
import { audioAvailable, configureSfx, play, resetSfxForTests } from './sfx';

class FakeParam {
  value = 0;
  setValueAtTime(next: number): this {
    this.value = next;
    return this;
  }
  exponentialRampToValueAtTime(next: number): this {
    this.value = next;
    return this;
  }
}

class FakeNode {
  connected = 0;
  disconnected = 0;
  connect(): void {
    this.connected += 1;
  }
  disconnect(): void {
    this.disconnected += 1;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeSource extends FakeNode {
  started: number | null = null;
  stopped: number | null = null;
  start(at: number): void {
    this.started = at;
  }
  stop(at: number): void {
    this.stopped = at;
  }
}

class FakeOscillator extends FakeSource {
  type = 'sine';
  readonly frequency = new FakeParam();
}

class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
}

class FakeContext {
  static built = 0;
  /** The context `play()` opened, whichever one that was. */
  static latest: FakeContext | null = null;
  currentTime = 0;
  readonly sampleRate = 48_000;
  state: 'running' | 'suspended' = 'running';
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly oscillators: FakeOscillator[] = [];
  readonly buffers: FakeBufferSource[] = [];
  resumed = 0;
  createdBuffers = 0;

  constructor() {
    FakeContext.built += 1;
    FakeContext.latest = this;
  }

  resume(): Promise<void> {
    this.resumed += 1;
    this.state = 'running';
    return Promise.resolve();
  }
  createGain(): FakeGain {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }
  createBiquadFilter(): FakeNode & { type: string; frequency: FakeParam } {
    return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam() });
  }
  createBuffer(_channels: number, frames: number): { getChannelData: () => Float32Array } {
    this.createdBuffers += 1;
    const data = new Float32Array(frames);
    return { getChannelData: () => data };
  }
  createBufferSource(): FakeBufferSource {
    const node = new FakeBufferSource();
    this.buffers.push(node);
    return node;
  }
  createOscillator(): FakeOscillator {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }
}

/** The context `play()` opened, whichever one that was. */
const live = (): FakeContext => {
  const ctx = FakeContext.latest;
  if (!ctx) throw new Error('nothing opened an AudioContext');
  return ctx;
};

function install(): void {
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeContext.built = 0;
  FakeContext.latest = null;
  install();
  resetSfxForTests();
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  resetSfxForTests();
});

describe('opening the device', () => {
  it('does not open one until something plays', () => {
    expect(audioAvailable()).toBe(true);
    expect(FakeContext.built).toBe(0);

    play('coin');
    expect(FakeContext.built).toBe(1);
  });

  it('never opens one for a muted player', () => {
    configureSfx({ enabled: false, volume: 0.8 });
    play('coin');
    play('level-up');
    // Not "opened and silent" — a browser that has been handed an AudioContext shows the tab as
    // playing audio, which is a lie told to somebody who turned the sound off.
    expect(FakeContext.built).toBe(0);
  });

  it('reuses the one it has, and resumes it if the browser suspended it', () => {
    play('coin');
    const first = live();

    first.state = 'suspended';
    first.currentTime = 10;
    play('coin');

    expect(FakeContext.built).toBe(1);
    expect(first.resumed).toBe(1);
  });

  it('stays silent, and quiet about it, where there is no audio at all', () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    resetSfxForTests();

    expect(audioAvailable()).toBe(false);
    expect(() => play('coin')).not.toThrow();
  });
});

describe('building a cue', () => {
  it('schedules one source per layer', () => {
    // `coin` is two oscillators over a noise burst — the shape most cues use.
    play('coin');
    expect(live().oscillators).toHaveLength(2);
    expect(live().buffers).toHaveLength(1);
    for (const source of [...live().oscillators, ...live().buffers]) {
      expect(source.started).not.toBeNull();
      expect(source.stopped).not.toBeNull();
      expect(source.stopped!).toBeGreaterThan(source.started!);
    }
  });

  it('honours a layer delay rather than stacking everything on beat one', () => {
    play('dice');
    const starts = live().oscillators.map((osc) => osc.started);
    expect(new Set(starts).size).toBe(3);
    expect(Math.max(...(starts as number[]))).toBeGreaterThan(0);
  });

  it('makes the noise buffer once, however many cues want it', () => {
    play('hit');
    live().currentTime = 5;
    play('crit');
    live().currentTime = 10;
    play('ko');
    expect(live().createdBuffers).toBe(1);
  });

  it('releases the graph once the cue has finished', () => {
    play('coin');
    const cueGain = live().gains.at(1);
    expect(cueGain!.disconnected).toBe(0);

    vi.advanceTimersByTime(2_000);
    expect(cueGain!.disconnected).toBe(1);
  });
});

describe('throttling', () => {
  it('drops a repeat inside the family gap', () => {
    play('coin');
    const first = live().oscillators.length;

    play('coin');
    expect(live().oscillators).toHaveLength(first);
  });

  it('lets it through once the gap has passed', () => {
    play('coin');
    const first = live().oscillators.length;

    live().currentTime = THROTTLE_MS.reward / 1000 + 0.001;
    play('coin');
    expect(live().oscillators.length).toBeGreaterThan(first);
  });

  it('is per family, so a crit is never eaten by a click', () => {
    /*
     * The whole reason the throttle is keyed on the category. A busy scene is UI ticks *and*
     * combat hits at once; one shared gate would mean whichever fired first silenced the other,
     * and the one the player is actually watching would lose about half the time.
     */
    play('select');
    play('hit');
    play('coin');
    play('anvil');

    expect(live().oscillators.length + live().buffers.length).toBeGreaterThanOrEqual(4);
  });
});

describe('the volume', () => {
  it('reaches the master gain, live', () => {
    configureSfx({ enabled: true, volume: 0.5 });
    play('coin');
    const master = live().gains.at(0);
    expect(master!.gain.value).toBe(0.5);

    configureSfx({ enabled: true, volume: 0.2 });
    expect(master!.gain.value).toBe(0.2);
  });

  it('clamps rather than trusting the caller', () => {
    configureSfx({ enabled: true, volume: 4 });
    play('coin');
    expect(live().gains.at(0)!.gain.value).toBe(1);

    configureSfx({ enabled: true, volume: -1 });
    expect(live().gains.at(0)!.gain.value).toBe(0);
  });
});
