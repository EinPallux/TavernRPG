'use client';

/**
 * One fighter on the stage: portrait, nameplate, health bar and every reaction they can have.
 *
 * The health bar carries two values — the real one, and a trailing "ghost" that drains behind
 * it. That ghost is what makes a big hit *feel* big: you see the chunk leave before the bar
 * settles (combat spec §4 step 3).
 */

import Image from 'next/image';
import { motion } from 'motion/react';
import type { CombatantCard, Side } from '@/engine/combat/types';
import { VERSES } from '@/engine/combat/verses';
import { LOW_HEALTH_THRESHOLD } from './battleChoreo';
import { snappy } from '@/styles/motion';

export interface BattleFighterProps {
  card: CombatantCard;
  side: Side;
  health: number;
  ghostHealth: number;
  /** Which verse this fighter is currently playing, if any. */
  verse: string | null;
  lunging: { progress: number; crit: boolean; followUp: boolean } | null;
  reaction: 'blocked' | 'dodged' | 'missed' | null;
  knockedOut: boolean;
  entering: boolean;
}

const REACTION_LABEL = {
  blocked: 'BLOCKED',
  dodged: 'DODGED',
  missed: 'MISSED',
} as const;

export function BattleFighter({
  card,
  side,
  health,
  ghostHealth,
  verse,
  lunging,
  reaction,
  knockedOut,
  entering,
}: BattleFighterProps) {
  const ratio = Math.max(0, Math.min(1, health / Math.max(1, card.maxHealth)));
  const ghostRatio = Math.max(ratio, Math.min(1, ghostHealth / Math.max(1, card.maxHealth)));
  const isLeft = side === 'a';
  const lowHealth = ratio > 0 && ratio <= LOW_HEALTH_THRESHOLD;

  /** Lunge: out fast, back slower — the shape of a swing. */
  const lungeOffset = lunging
    ? Math.sin(lunging.progress * Math.PI) * (lunging.followUp ? 26 : 42) * (isLeft ? 1 : -1)
    : 0;

  return (
    <div
      className={`flex w-full max-w-sm flex-col gap-3 ${isLeft ? 'items-start' : 'items-end'}`}
      data-testid={`fighter-${side}`}
    >
      {/* Nameplate */}
      <motion.div
        initial={entering ? { opacity: 0, x: isLeft ? -40 : 40 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={snappy}
        className={`w-full ${isLeft ? 'text-left' : 'text-right'}`}
      >
        <p className="font-display text-parchment-300 text-lg leading-tight font-bold">
          {card.name}
        </p>
        <p className="text-parchment-500/50 text-[11px] tracking-[0.2em] uppercase">
          Level {card.level} · {card.kind}
        </p>
      </motion.div>

      {/* Health */}
      <div className="w-full">
        <div
          className={`chamfer-sm bg-wood-900/90 relative h-4 w-full overflow-hidden border ${
            lowHealth ? 'border-blood-600/70' : 'border-parchment-500/20'
          }`}
          role="progressbar"
          aria-valuenow={Math.round(health)}
          aria-valuemin={0}
          aria-valuemax={card.maxHealth}
          aria-label={`${card.name} health`}
          data-testid={`health-${side}`}
        >
          {/* Ghost trail: the damage that just landed, still draining away. */}
          <div
            className="bg-blood-600/45 absolute inset-y-0 left-0 transition-none"
            style={{ width: `${ghostRatio * 100}%` }}
          />
          <motion.div
            className={`absolute inset-y-0 left-0 ${lowHealth ? 'bg-blood-600' : 'bg-moss-600'}`}
            style={{ width: `${ratio * 100}%` }}
            animate={lowHealth ? { opacity: [1, 0.65, 1] } : { opacity: 1 }}
            transition={lowHealth ? { duration: 1.1, repeat: Infinity } : { duration: 0.1 }}
          />
        </div>
        <p
          className={`text-parchment-500/60 mt-1 text-[11px] ${isLeft ? 'text-left' : 'text-right'}`}
        >
          {Math.max(0, Math.round(health)).toLocaleString()} / {card.maxHealth.toLocaleString()}
        </p>
      </div>

      {/* Portrait, and everything that happens to it */}
      <motion.div
        className="relative"
        initial={entering ? { opacity: 0, x: isLeft ? -80 : 80, scale: 0.9 } : false}
        animate={{
          opacity: knockedOut ? 0.35 : 1,
          x: lungeOffset,
          scale: 1,
          rotate: knockedOut ? (isLeft ? -12 : 12) : 0,
          y: knockedOut ? 14 : 0,
          filter: knockedOut ? 'grayscale(1) brightness(0.6)' : 'grayscale(0) brightness(1)',
        }}
        transition={lunging ? { duration: 0 } : snappy}
      >
        <div
          className={`chamfer-md bg-wood-900 h-44 w-36 overflow-hidden border-2 ${
            lunging?.crit
              ? 'border-amber-400 shadow-[0_0_36px_-6px_rgb(240_184_98/0.95)]'
              : 'border-amber-500/35'
          }`}
        >
          {card.portrait ? (
            <Image
              src={card.portrait}
              alt=""
              width={144}
              height={176}
              className="h-full w-full object-cover"
            />
          ) : (
            /**
             * No art yet, so the archetype carries the identity (asset-pipeline §3: "silhouette
             * card + zone tint"). Deliberately lit rather than a dark hole — the thing you are
             * fighting has to be as legible on the stage as the thing you are fighting *with*.
             */
            <div className="from-wood-600 via-wood-700 to-wood-900 grid h-full w-full place-content-center gap-1 bg-gradient-to-b text-center">
              <span className="font-display text-parchment-300/70 text-5xl leading-none font-black">
                {card.name.charAt(0)}
              </span>
              <span className="text-parchment-500/55 text-[9px] tracking-[0.18em] uppercase">
                {card.kind}
              </span>
            </div>
          )}
        </div>

        {/* Block / dodge / miss plate */}
        {reaction && (
          <motion.div
            key={`${reaction}-${health}`}
            initial={{ opacity: 0, scale: 0.6, y: 0 }}
            animate={{ opacity: 1, scale: 1, y: -8 }}
            exit={{ opacity: 0 }}
            transition={snappy}
            className="pointer-events-none absolute inset-0 grid place-items-center"
            data-testid={`reaction-${side}`}
          >
            <span
              className={`chamfer-sm font-display border px-2.5 py-1 text-xs tracking-[0.2em] ${
                reaction === 'blocked'
                  ? 'bg-wood-900/90 border-amber-500/70 text-amber-500'
                  : 'border-arcane-500/70 bg-wood-900/90 text-arcane-500'
              }`}
            >
              {REACTION_LABEL[reaction]}
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* Verse ribbon */}
      {verse && verse in VERSES && (
        <motion.div
          key={verse}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={snappy}
          className="chamfer-sm border-arcane-500/40 bg-arcane-500/12 border px-2.5 py-1"
          data-testid={`verse-${side}`}
        >
          <span className="text-arcane-500 text-[11px] tracking-wider">
            ♪ {VERSES[verse as keyof typeof VERSES].name}
          </span>
        </motion.div>
      )}
    </div>
  );
}
