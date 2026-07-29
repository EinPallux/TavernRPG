'use client';

/**
 * Impact particles (asset-pipeline §1: the Kenney VFX pack, CC0).
 *
 * A single canvas over the whole stage with a fixed-size pool — DOM elements would cost a
 * layout pass per spark, and a fight throws a lot of sparks. The pool is capped at the
 * architecture's 200-sprite budget; when it is full the oldest particle is recycled rather
 * than the burst being dropped, so a flurry never looks thinner than a single hit.
 */

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import type { Side } from '@/engine/combat/types';

const SPRITE_ROOT = '/assets/vfx/kenney-particles/PNG (Transparent)';
const MAX_PARTICLES = 200;

/** Sprite sets per impact flavour, so a crit reads differently from a graze. */
const SPRITES = {
  hit: ['slash_01.png', 'slash_02.png', 'spark_01.png', 'star_07.png'],
  crit: ['flame_04.png', 'flare_01.png', 'star_08.png', 'light_02.png', 'magic_05.png'],
} as const;

const ALL_SPRITES = [...new Set([...SPRITES.hit, ...SPRITES.crit])];

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
  sprite: HTMLImageElement | undefined;
  tint: number;
}

export interface ImpactRequest {
  readonly id: string;
  readonly side: Side;
  readonly crit: boolean;
}

export interface ParticleLayerProps {
  /** Impacts visible this frame; each id is spawned once. */
  impacts: readonly ImpactRequest[];
  className?: string;
}

export function ParticleLayer({ impacts, className = '' }: ParticleLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poolRef = useRef<Particle[]>([]);
  const spritesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const spawnedRef = useRef<Set<string>>(new Set());
  const nextSlotRef = useRef(0);
  const reducedMotion = useReducedMotion();

  // Preload the sprite set once.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    for (const name of ALL_SPRITES) {
      if (spritesRef.current.has(name)) continue;
      const image = new window.Image();
      image.src = `${SPRITE_ROOT}/${name}`;
      spritesRef.current.set(name, image);
    }
  }, []);

  // Spawn bursts for impacts we have not seen before.
  useEffect(() => {
    if (reducedMotion) return;

    for (const impact of impacts) {
      if (spawnedRef.current.has(impact.id)) continue;
      spawnedRef.current.add(impact.id);

      const canvas = canvasRef.current;
      if (!canvas) continue;

      // Fighters stand at the quarter marks; the burst blooms where the blow lands.
      const originX = canvas.width * (impact.side === 'a' ? 0.3 : 0.7);
      const originY = canvas.height * 0.52;
      const set = impact.crit ? SPRITES.crit : SPRITES.hit;
      const count = impact.crit ? 22 : 12;

      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + (i % 3) * 0.21;
        const speed = (impact.crit ? 190 : 120) * (0.55 + ((i * 37) % 100) / 140);
        const spriteName = set[i % set.length]!;

        const pool = poolRef.current;
        if (pool.length < MAX_PARTICLES) {
          pool.push(makeParticle());
        }
        // Recycle round-robin so a big burst never gets silently truncated.
        const slot = pool.length < MAX_PARTICLES ? pool.length - 1 : nextSlotRef.current;
        nextSlotRef.current = (nextSlotRef.current + 1) % MAX_PARTICLES;

        const particle = pool[slot]!;
        particle.active = true;
        particle.x = originX;
        particle.y = originY;
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed - 40;
        particle.maxLife = impact.crit ? 700 : 460;
        particle.life = particle.maxLife;
        particle.size = (impact.crit ? 30 : 20) * (0.6 + ((i * 53) % 100) / 130);
        particle.rotation = angle;
        particle.spin = ((i % 5) - 2) * 3;
        particle.sprite = spritesRef.current.get(spriteName);
        particle.tint = impact.crit ? 1 : 0;
      }
    }
  }, [impacts, reducedMotion]);

  // Simulation + draw loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion) return;

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
      context.globalCompositeOperation = 'lighter';

      for (const particle of poolRef.current) {
        if (!particle.active) continue;

        particle.life -= delta;
        if (particle.life <= 0) {
          particle.active = false;
          continue;
        }

        const seconds = delta / 1000;
        particle.x += particle.vx * seconds;
        particle.y += particle.vy * seconds;
        particle.vy += 420 * seconds; // gravity, so sparks arc and fall
        particle.vx *= 0.985;
        particle.rotation += particle.spin * seconds;

        const alpha = Math.max(0, particle.life / particle.maxLife);
        const size = particle.size * (0.7 + alpha * 0.6);

        if (particle.sprite?.complete && particle.sprite.naturalWidth > 0) {
          context.save();
          context.globalAlpha = alpha;
          context.translate(particle.x, particle.y);
          context.rotate(particle.rotation);
          context.drawImage(particle.sprite, -size / 2, -size / 2, size, size);
          context.restore();
        } else {
          // Sprite still loading: a plain spark keeps the beat from feeling empty.
          context.save();
          context.globalAlpha = alpha * 0.9;
          context.fillStyle = particle.tint ? '#f0b862' : '#e8a33d';
          context.fillRect(particle.x, particle.y, 3, 3);
          context.restore();
        }
      }

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
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
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
    sprite: undefined,
    tint: 0,
  };
}
