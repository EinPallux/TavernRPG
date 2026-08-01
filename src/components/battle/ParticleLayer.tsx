'use client';

/**
 * The VFX layer (combat spec §4 step 2; asset-pipeline §1 — the Kenney pack, CC0).
 *
 * A single canvas over the whole stage with a fixed-size pool. DOM elements would cost a layout
 * pass per spark and a fight throws a lot of sparks; the pool is capped at the architecture's
 * 200-sprite budget and recycles round-robin when it is full, so a flurry never looks thinner
 * than a single hit.
 *
 * ## What changed in the VFX pass
 *
 * It used to know two things — "a hit" and "a crit" — each with one hard-coded sprite list. Now it
 * knows nothing at all and is handed everything: the attacker's **school** (`data/combatVfx.ts`)
 * decides the sprites, the colour, the spread and the speed, and this file only integrates
 * velocities. Same trade `data/gearSets.ts` made with the resolver — a sixth class is a data
 * change, and only a genuinely new *behaviour* costs work here.
 *
 * Three behaviours exist:
 *
 * - **Bursts** — a puff at a point, optionally fanned along the direction of the blow rather than
 *   bloomed evenly. Direction is most of what makes a hit look like somebody caused it.
 * - **Flight** — a projectile crossing the gap for the schools that do not close it, shedding a
 *   trail. Its position is a pure function of the timeline's `progress`, never integrated, so it
 *   cannot drift out of step at ×4 or when playback is scrubbed.
 * - **Tinting** — Kenney's sprites are white. Each (sprite, colour) pair is pre-multiplied into a
 *   small offscreen canvas *once* and cached; tinting at draw time would be a composite operation
 *   per spark per frame, which is the whole budget this layer has.
 *
 * ## Two structural notes
 *
 * **Everything mutable lives in one ref-held engine.** The draw loop must start once and never
 * restart — a `useEffect` that depended on the flight would tear down and rebuild the rAF loop
 * sixty times a second, which is the Phase 17 `BattleFighter` mistake one layer over. Holding the
 * pool, the caches and the methods in a single object means the effects depend on nothing that
 * changes per frame, with no lint escape hatches to justify.
 *
 * **Anchors are measured, not assumed.** They used to be the constants 0.3 and 0.7, true at
 * exactly one window width: the fighter row is `max-w-5xl` centred in a full-bleed stage, so at
 * 1440px the portraits sit near 0.26/0.74 and at 2560px near 0.36/0.64. Every burst on a wide
 * monitor bloomed in open air beside the fighter it belonged to.
 */

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import type { Side } from '@/engine/combat/types';
import {
  BLOCK_BURST,
  DODGE_BURST,
  HEAL_BURST,
  PROC_BURST,
  PROC_PALETTE,
  SHARED_PALETTE,
  VFX_SPRITE_ROOT,
  allVfxSprites,
  type CombatSchool,
  type VfxBurst,
} from '@/data/combatVfx';
import type { BattleFrame } from './timeline';

/** `architecture.md` §5: the scene's sprite budget. */
const MAX_PARTICLES = 200;

/** Sizes and speeds are authored against this stage width and scale from it. */
const REFERENCE_WIDTH = 1280;

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rotation: number;
  spin: number;
  gravity: number;
  sprite: CanvasImageSource | undefined;
  /** Fallback colour for the frames before a sprite has decoded. */
  colour: string;
}

/** Where a fighter stands, as a fraction of the canvas. */
export interface StageAnchor {
  readonly x: number;
  readonly y: number;
}

export interface ParticleLayerProps {
  /** Bursts visible this frame; each id is spawned once. */
  readonly impacts: BattleFrame['impacts'];
  /** The school each fighter fights in, resolved from their nameplate. */
  readonly schools: Readonly<Record<Side, CombatSchool>>;
  /** Measured portrait centres. */
  readonly anchors: Readonly<Record<Side, StageAnchor>>;
  /** A swing in progress, so a ranged school can put something in the air. */
  readonly flight: BattleFrame['lunging'];
  /** Share of a ranged swing spent gathering before the bolt leaves (`choreo.castLead`). */
  readonly castLead: number;
  readonly className?: string;
}

/**
 * Deterministic jitter.
 *
 * `Math.random` is lint-banned outside `rng.ts`, and the deeper reason applies here too: a fight
 * is *replayable*, and a replay whose sparks land differently each time is a replay of a
 * different fight. Hashing the particle's index gives spread that looks random and reproduces.
 */
function jitter(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function makeParticle(): Particle {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 10,
    rotation: 0,
    spin: 0,
    gravity: 420,
    sprite: undefined,
    colour: '#e8a33d',
  };
}

/**
 * Everything the canvas owns, in one place.
 *
 * Plain class rather than a pile of refs so the draw loop can be started from an effect with no
 * dependencies at all: React writes `props` on it each render, and the loop reads them.
 */
class VfxEngine {
  readonly pool: Particle[] = [];
  private readonly sprites = new Map<string, HTMLImageElement>();
  private readonly tints = new Map<string, HTMLCanvasElement>();
  readonly spawned = new Set<string>();
  private nextSlot = 0;
  /** How far along its flight the last trail mote was shed; -1 between flights. */
  private trailAt = -1;

  /** Written every render; read by the loop. */
  schools: Readonly<Record<Side, CombatSchool>>;
  anchors: Readonly<Record<Side, StageAnchor>>;
  flight: BattleFrame['lunging'] = null;
  castLead = 0.42;

  constructor(
    schools: Readonly<Record<Side, CombatSchool>>,
    anchors: Readonly<Record<Side, StageAnchor>>,
  ) {
    this.schools = schools;
    this.anchors = anchors;
  }

  preload(): void {
    for (const name of allVfxSprites()) {
      if (this.sprites.has(name)) continue;
      const image = new window.Image();
      image.src = `${VFX_SPRITE_ROOT}/${name}`;
      this.sprites.set(name, image);
    }
  }

  /** A sprite in a colour, built once and kept. Undefined until the source has decoded. */
  private tinted(name: string, colour: string): CanvasImageSource | undefined {
    const key = `${name}|${colour}`;
    const cached = this.tints.get(key);
    if (cached) return cached;

    const source = this.sprites.get(name);
    if (!source?.complete || source.naturalWidth === 0) return undefined;

    const off = document.createElement('canvas');
    off.width = source.naturalWidth;
    off.height = source.naturalHeight;
    const ctx = off.getContext('2d');
    if (!ctx) return source;

    ctx.drawImage(source, 0, 0);
    // `source-in` keeps the sprite's alpha and replaces its colour — the cheap way to make one
    // white star serve ten schools without shipping ten copies of it.
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, off.width, off.height);

    this.tints.set(key, off);
    return off;
  }

  /** Claim a slot, growing the pool to the cap and then recycling the oldest. */
  private claim(): Particle {
    if (this.pool.length < MAX_PARTICLES) {
      const fresh = makeParticle();
      this.pool.push(fresh);
      return fresh;
    }
    const slot = this.nextSlot;
    this.nextSlot = (this.nextSlot + 1) % MAX_PARTICLES;
    return this.pool[slot]!;
  }

  emit(
    burst: VfxBurst,
    colour: string,
    originX: number,
    originY: number,
    /** Radians. Which way the blow travelled; ignored when the burst is a full bloom. */
    aim: number,
    scale: number,
  ): void {
    for (let i = 0; i < burst.count; i += 1) {
      const angle =
        burst.cone > 0
          ? aim + (jitter(i, 1) - 0.5) * burst.cone
          : (Math.PI * 2 * i) / burst.count + jitter(i, 2) * 0.4;
      const speed = burst.speed * (0.6 + jitter(i, 3) * 0.7) * scale;
      const name = burst.sprites[i % burst.sprites.length]!;

      const particle = this.claim();
      particle.active = true;
      particle.x = originX;
      particle.y = originY;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed - 30;
      particle.maxLife = burst.life;
      particle.life = burst.life;
      particle.size = burst.size * (0.65 + jitter(i, 4) * 0.7) * scale;
      particle.rotation = angle + jitter(i, 5) * Math.PI;
      particle.spin = (jitter(i, 6) - 0.5) * 7;
      particle.gravity = burst.gravity;
      particle.sprite = this.tinted(name, colour);
      particle.colour = colour;
    }
  }

  /** One burst for one occasion in the frame. */
  spawn(impact: BattleFrame['impacts'][number], canvas: HTMLCanvasElement, scale: number): void {
    const at = this.anchors[impact.side];
    const x = canvas.width * at.x;
    const y = canvas.height * at.y;
    // Away from whoever swung. Side 'a' stands on the left, so their blows travel right and the
    // sparks they raise fly left, off the fighter they hit.
    const aim = impact.side === 'a' ? Math.PI : 0;

    if (impact.kind === 'hit') {
      const from = impact.source ?? (impact.side === 'a' ? 'b' : 'a');
      const school = this.schools[from];
      const burst = impact.crit ? school.crit : school.impact;
      this.emit(burst, school.palette[burst.tint], x, y, aim, scale);
      return;
    }

    if (impact.kind === 'proc') {
      const palette = impact.effect ? PROC_PALETTE[impact.effect] : SHARED_PALETTE.heal;
      this.emit(PROC_BURST, palette[PROC_BURST.tint], x, y, aim, scale);
      return;
    }

    const burst =
      impact.kind === 'block' ? BLOCK_BURST : impact.kind === 'dodge' ? DODGE_BURST : HEAL_BURST;
    const palette =
      impact.kind === 'block'
        ? SHARED_PALETTE.block
        : impact.kind === 'dodge'
          ? SHARED_PALETTE.dodge
          : SHARED_PALETTE.heal;
    this.emit(burst, palette[burst.tint], x, y, aim, scale);
  }

  /**
   * The bolt in the air.
   *
   * Position is read off `progress` rather than integrated, so skipping, scrubbing or switching
   * to ×4 mid-flight puts it exactly where that moment says it should be. Only the trail is
   * stateful, and only in the sense of "have I shed a mote past this point yet".
   */
  drawFlight(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, now: number): void {
    const flight = this.flight;
    if (!flight) {
      this.trailAt = -1;
      return;
    }

    const school = this.schools[flight.side];
    const travel = school.travel;
    if (!travel) return;

    // The cast gathers first; the bolt only leaves once it is charged, and lands exactly as the
    // beat ends — which is the frame the `damage` event fires on.
    if (flight.progress < this.castLead) {
      this.trailAt = -1;
      return;
    }
    const flown = (flight.progress - this.castLead) / Math.max(0.01, 1 - this.castLead);

    const from = this.anchors[flight.side];
    const to = this.anchors[flight.side === 'a' ? 'b' : 'a'];
    const x = (from.x + (to.x - from.x) * flown) * canvas.width;
    const flat = (from.y + (to.y - from.y) * flown) * canvas.height;
    // A parabola peaking at the midpoint. Zero `arc` leaves it dead flat, which is what an arrow
    // wants and a lobbed hex does not.
    const y = flat - Math.sin(flown * Math.PI) * travel.arc * canvas.height;

    const scale = stageScale(canvas);
    const size = travel.size * scale * (flight.crit ? 1.35 : 1);

    // Trail motes spaced by distance flown rather than by time, so the trail is the same length
    // whether the fight is running at ×1 or ×4.
    if (travel.trail && flown > this.trailAt + travel.trail.every) {
      this.trailAt = flown;
      const step = Math.floor(flown * 100);
      const name = travel.trail.sprites[step % travel.trail.sprites.length]!;
      const mote = this.claim();
      mote.active = true;
      mote.x = x;
      mote.y = y;
      mote.vx = (jitter(step, 7) - 0.5) * 40;
      mote.vy = (jitter(step, 8) - 0.5) * 40;
      mote.maxLife = travel.trail.life;
      mote.life = travel.trail.life;
      mote.size = travel.trail.size * scale;
      mote.rotation = 0;
      mote.spin = 2;
      mote.gravity = 20;
      mote.sprite = this.tinted(name, school.palette.core);
      mote.colour = school.palette.core;
    }

    const sprite = this.tinted(travel.sprites[0]!, school.palette.core);
    ctx.save();
    ctx.translate(x, y);
    // A spinning bolt reads as magic; an arrow must point where it is going instead.
    ctx.rotate(travel.spin === 0 ? (to.x < from.x ? Math.PI : 0) : now * 0.001 * travel.spin);
    if (sprite) {
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = school.palette.core;
      ctx.fillRect(-size / 4, -size / 8, size / 2, size / 4);
    }
    ctx.restore();
  }

  step(ctx: CanvasRenderingContext2D, delta: number): void {
    const seconds = delta / 1000;
    for (const particle of this.pool) {
      if (!particle.active) continue;

      particle.life -= delta;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }

      particle.x += particle.vx * seconds;
      particle.y += particle.vy * seconds;
      particle.vy += particle.gravity * seconds;
      particle.vx *= 0.985;
      particle.rotation += particle.spin * seconds;

      const alpha = Math.max(0, particle.life / particle.maxLife);
      const size = particle.size * (0.7 + alpha * 0.6);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      if (particle.sprite) {
        ctx.drawImage(particle.sprite, -size / 2, -size / 2, size, size);
      } else {
        // Still decoding: a mote in the school's colour keeps the beat from feeling empty and
        // looks like a small version of what is about to arrive.
        ctx.fillStyle = particle.colour;
        ctx.fillRect(-2, -2, 4, 4);
      }
      ctx.restore();
    }
  }
}

/** Everything is authored against a 1280-wide stage; a smaller window gets smaller sparks. */
function stageScale(canvas: HTMLCanvasElement): number {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  return (canvas.width / ratio / REFERENCE_WIDTH) * ratio;
}

export function ParticleLayer({
  impacts,
  schools,
  anchors,
  flight,
  castLead,
  className = '',
}: ParticleLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VfxEngine | null>(null);
  const reducedMotion = useReducedMotion();

  /*
   * Build it, then mirror the current frame onto it — after every render, no dependency array.
   *
   * The same shape `useBattlePlayback` uses for its own latest-value mirrors, and for the same
   * reason: the draw loop must start once and run forever, so it cannot depend on anything that
   * changes sixty times a second. Mutating inside an effect rather than during render is what
   * `react-hooks/refs` asks for, and this effect is declared **first** on purpose — effects run
   * in source order, so the engine exists and carries this frame's anchors before anything below
   * spawns a burst at them.
   */
  useEffect(() => {
    const engine = (engineRef.current ??= new VfxEngine(schools, anchors));
    engine.schools = schools;
    engine.anchors = anchors;
    engine.flight = flight;
    engine.castLead = castLead;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') engineRef.current?.preload();
  }, []);

  // Spawn bursts for occasions not seen before.
  useEffect(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas || reducedMotion) return;

    const scale = stageScale(canvas);
    for (const impact of impacts) {
      if (engine.spawned.has(impact.id)) continue;
      engine.spawned.add(impact.id);
      engine.spawn(impact, canvas, scale);
    }
  }, [impacts, reducedMotion]);

  // Simulation + draw. Started once; everything it needs arrives on the engine.
  useEffect(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas || reducedMotion) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let raf = 0;
    let last = 0;

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (now: number) => {
      const delta = last === 0 ? 16 : Math.min(48, now - last);
      last = now;

      context.clearRect(0, 0, canvas.width, canvas.height);
      // Additive: sparks over a dark tavern should look like light, not like stickers.
      context.globalCompositeOperation = 'lighter';
      engine.drawFlight(context, canvas, now);
      engine.step(context, delta);
      context.globalCompositeOperation = 'source-over';

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reducedMotion]);

  if (reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="particle-layer"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
