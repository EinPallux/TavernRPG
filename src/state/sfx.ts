'use client';

/**
 * The thing that actually makes noise (asset-pipeline.md §6).
 *
 * One `AudioContext` for the whole app, built **lazily on the first real interaction** — every
 * browser refuses to start one before a gesture, and asking early does not fail loudly, it fails
 * by leaving the context suspended and every later cue silent for reasons nobody can see. So
 * nothing is created until `play()` is first called from a click, and a suspended context is
 * resumed rather than replaced.
 *
 * Cues are built from `data/sfx.ts` recipes at play time: an oscillator (or a noise buffer) per
 * layer, a frequency ramp, an attack/decay envelope, and a shared master gain the settings
 * screen turns down. Nothing is preloaded because there is nothing to load.
 *
 * **Throttled per family, not globally.** A battle at ×4 asks for eight hits a second and a list
 * hover asks for thirty ticks; suppressing by family means the crit still lands while the ticks
 * are being dropped.
 *
 * Everything degrades to silence. No `AudioContext` (SSR, jsdom, an old browser, a locked-down
 * profile) means `play()` returns without throwing, which is what keeps this callable from
 * anywhere without a guard at every call site.
 */

import { THROTTLE_MS, cueLength, sfx, type SfxDef, type SfxId, type SfxLayer } from '@/data/sfx';

type Ctor = typeof AudioContext;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = true;
let volume = 0.7;

/**
 * When each family last played, on the **audio clock**.
 *
 * `ctx.currentTime` rather than a wall clock: it is the same time base the cues are scheduled
 * in, it is monotonic, and it does not care what the tab was doing. (It is also the only clock
 * available here — `Date.now` is lint-banned outside GameClock, and rightly: nothing about
 * gameplay should be able to read the wall time through the speaker.)
 */
const lastPlayed = new Map<string, number>();

function audioCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const scoped = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return scoped.AudioContext ?? scoped.webkitAudioContext ?? null;
}

/** True where the browser can make a sound at all. Used by the settings screen to hide the rows. */
export function audioAvailable(): boolean {
  return audioCtor() !== null;
}

/**
 * One second of white noise, made once.
 *
 * Every percussive cue in the game is a filtered slice of this — a hit, an anvil strike, the
 * hiss of a dodge. Generating it per cue would allocate a fresh buffer forty times a fight.
 */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise) return noise;

  const frames = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  /*
   * A hand-rolled LCG rather than `Math.random`.
   *
   * Not for determinism — nobody replays audio — but because `Math.random` is lint-banned
   * outside `rng.ts` and importing the seeded generator for *white noise* would imply the noise
   * is part of the simulation. It is not; it is a texture.
   */
  let seed = 0x2f6e2b1;
  for (let index = 0; index < frames; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[index] = (seed / 0xffffffff) * 2 - 1;
  }

  noise = buffer;
  return buffer;
}

/** Start (or resume) the context. Safe to call on every cue. */
function ensureContext(): AudioContext | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;

  if (!context) {
    context = new Ctor();
    master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
  }
  // A context started before a gesture, or after a tab sleep, comes back suspended.
  if (context.state === 'suspended') void context.resume();
  return context;
}

function playLayer(ctx: AudioContext, out: GainNode, layer: SfxLayer, at: number): void {
  const start = at + (layer.delay ?? 0);
  const gain = ctx.createGain();

  // Attack then decay to (near) zero. Exponential ramps cannot reach 0, hence the epsilon —
  // a linear tail on a short cue is audible as a click.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, layer.gain), start + layer.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + layer.duration);

  let tail: AudioNode = gain;
  if (layer.filter !== undefined) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = layer.filter;
    gain.connect(filter);
    tail = filter;
  }
  tail.connect(out);

  if (layer.wave === 'noise') {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    source.connect(gain);
    source.start(start);
    source.stop(start + layer.duration);
    return;
  }

  const osc = ctx.createOscillator();
  osc.type = layer.wave;
  osc.frequency.setValueAtTime(layer.from, start);
  if (layer.to !== layer.from) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, layer.to),
      start + Math.max(0.01, layer.duration),
    );
  }
  osc.connect(gain);
  osc.start(start);
  osc.stop(start + layer.duration);
}

/**
 * Play a cue.
 *
 * Never throws and never awaits. A caller that wants a sound on a click should be able to write
 * `play('coin')` beside the state change and not think about it again.
 *
 * The id is typed rather than a `string` — a misspelled cue is otherwise indistinguishable from a
 * muted game, and the battle hook already made that mistake once by passing the timeline's
 * vocabulary straight in. The runtime guard below stays anyway: it costs a lookup that has to
 * happen regardless.
 */
export function play(id: SfxId): void {
  if (!enabled) return;

  const definition: SfxDef | null = sfx(id);
  if (!definition) return;

  const ctx = ensureContext();
  if (!ctx || !master) return;

  const now = ctx.currentTime;
  const last = lastPlayed.get(definition.category) ?? -Infinity;
  if (now - last < THROTTLE_MS[definition.category] / 1000) return;
  lastPlayed.set(definition.category, now);

  const cue = ctx.createGain();
  cue.gain.value = definition.gain;
  cue.connect(master);

  const at = ctx.currentTime;
  for (const layer of definition.layers) playLayer(ctx, cue, layer, at);

  // Let the node graph go. Nothing holds a reference once the sources have stopped.
  window.setTimeout(() => cue.disconnect(), (cueLength(definition) + 0.2) * 1000);
}

/** Mirror the player's settings. Called by the shell whenever they change. */
export function configureSfx(next: { enabled: boolean; volume: number }): void {
  enabled = next.enabled;
  volume = Math.min(1, Math.max(0, next.volume));
  if (master) master.gain.value = volume;
}

/** Test seam: drops the context and the throttle history between cases. */
export function resetSfxForTests(): void {
  context = null;
  master = null;
  noise = null;
  enabled = true;
  volume = 0.7;
  lastPlayed.clear();
}
