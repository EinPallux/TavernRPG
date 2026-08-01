'use client';

/**
 * One fighter on the stage: portrait, nameplate, health bar and every reaction they can have.
 *
 * The health bar carries two values — the real one, and a trailing "ghost" that drains behind
 * it. That ghost is what makes a big hit *feel* big: you see the chunk leave before the bar
 * settles (combat spec §4 step 3).
 *
 * ## The VFX pass added four reactions, and one stance
 *
 * - **Flash and recoil.** A struck fighter goes white for a sixth of a second and is shoved away
 *   from the blow, hard in proportion to how much it took off them. Before this the only thing
 *   that moved on a hit was a number: the two fighters stood perfectly still through twenty
 *   rounds while their bars emptied.
 * - **The dodge sidestep.** Spec §4 has asked for a "ghost-trail sidestep" since Phase 4 and what
 *   shipped was the word DODGED on a plate. The fighter now slips aside and leaves an afterimage
 *   where they were standing.
 * - **The block flash.** Likewise "shield flash + CLANG plate" — the plate was there, the flash
 *   was not.
 * - **Hardening.** `harden` has been in the log since Phase 11 and in the *frame* since Phase 11;
 *   nothing ever drew it, so Vulkarr cooling into his own armour was invisible and the fight got
 *   quietly harder for no reason the player could see. It is plating on the portrait now, and it
 *   thickens.
 *
 * And the stance: a fighter whose school does not close the distance **braces and casts** instead
 * of lunging. That single branch is the difference between a duel and a duel with a wizard in it.
 *
 * ## Everything positional is `style`, never `animate`
 *
 * The lesson the Phase 17 pass paid 40fps for, and the VFX pass respects it everywhere: the
 * timeline has already computed where this fighter is at this exact millisecond, so handing that
 * to Motion's `animate` asks it to start a tween toward a target that changes on the next frame,
 * sixty times a second, for two fighters. `animate` keeps only genuine state changes — the
 * entrance and the knockout.
 */

import Image from 'next/image';
import { motion } from 'motion/react';
import type { RefObject } from 'react';
import type { CombatantCard, Side } from '@/engine/combat/types';
import { VERSES } from '@/engine/combat/verses';
import type { CombatSchool } from '@/data/combatVfx';
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
  reaction: { kind: 'blocked' | 'dodged' | 'missed'; progress: number } | null;
  knockedOut: boolean;
  entering: boolean;
  /** How this fighter's blows look, and whether they close the distance (`data/combatVfx.ts`). */
  school: CombatSchool;
  /** Share of a ranged swing spent gathering before the bolt leaves (`choreo.castLead`). */
  castLead: number;
  /** 0–1 white flash from a blow that just landed. */
  flash: number;
  /** Signed knockback in px, already scaled by how big the hit was. */
  recoil: number;
  /** 0–1 armour that has thickened this fight (dungeons spec §2, Vulkarr). */
  hardened: number;
  /**
   * So the scene can measure where the sparks should bloom.
   *
   * Attached to a *static* wrapper rather than to the portrait itself, and that is the whole
   * trick: the portrait is mid-lunge, mid-recoil or mid-sidestep whenever anybody asks, so
   * measuring it would anchor the particles to wherever the fighter happened to be standing on
   * the frame the window was last resized.
   */
  portraitRef?: RefObject<HTMLDivElement | null>;
}

const REACTION_LABEL = {
  blocked: 'BLOCKED',
  dodged: 'DODGED',
  missed: 'MISSED',
} as const;

/** How far a dodging fighter slips out of the way, px. */
const DODGE_SLIP = 26;

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
  school,
  castLead,
  flash,
  recoil,
  hardened,
  portraitRef,
}: BattleFighterProps) {
  const ratio = Math.max(0, Math.min(1, health / Math.max(1, card.maxHealth)));
  const ghostRatio = Math.max(ratio, Math.min(1, ghostHealth / Math.max(1, card.maxHealth)));
  const isLeft = side === 'a';
  const facing = isLeft ? 1 : -1;
  const lowHealth = ratio > 0 && ratio <= LOW_HEALTH_THRESHOLD;

  /*
   * The swing, in whichever grammar this fighter fights in.
   *
   * Melee is the shape of a lunge: out fast on a sine, back slower, over the whole beat. Ranged
   * is the shape of a cast: lean *away* while the power gathers, then snap forward as it leaves,
   * with the turn happening exactly at `castLead` — the same instant the particle layer lets the
   * bolt go, because both read the one number.
   */
  let swing = 0;
  if (lunging) {
    const p = lunging.progress;
    if (school.melee) {
      swing = Math.sin(p * Math.PI) * (lunging.followUp ? school.lunge * 0.6 : school.lunge);
    } else {
      const shape =
        p < castLead
          ? -(p / Math.max(0.01, castLead)) * 0.55
          : Math.sin(((p - castLead) / Math.max(0.01, 1 - castLead)) * Math.PI);
      swing = shape * school.lunge;
    }
  }

  /** Gathering: a ranged fighter lit by their own spell before it leaves. */
  const charging = lunging !== null && !school.melee && lunging.progress < castLead;

  /** Slipping the blow — sideways and back, the shape of a sidestep. */
  const dodging = reaction?.kind === 'dodged' ? reaction : null;
  const slip = dodging ? Math.sin(dodging.progress * Math.PI) * DODGE_SLIP * -facing : 0;

  const offset = swing * facing + recoil + slip;

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
        <p className="text-parchment-500/72 text-[11px] tracking-[0.2em] uppercase">
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
          className={`text-parchment-500/72 mt-1 text-[11px] ${isLeft ? 'text-left' : 'text-right'}`}
        >
          {Math.max(0, Math.round(health)).toLocaleString()} / {card.maxHealth.toLocaleString()}
        </p>
      </div>

      {/* Portrait, and everything that happens to it. The outer div never moves — see the note
          on `portraitRef`; it is what the particle anchors are measured from. */}
      <div ref={portraitRef} className="relative">
        <motion.div
          className="relative"
          style={{ x: offset }}
          initial={entering ? { opacity: 0, x: isLeft ? -80 : 80, scale: 0.9 } : false}
          animate={{
            opacity: knockedOut ? 0.35 : 1,
            scale: 1,
            rotate: knockedOut ? (isLeft ? -12 : 12) : 0,
            y: knockedOut ? 14 : 0,
          }}
          transition={snappy}
        >
          {/*
          The afterimage a dodge leaves behind.

          Drawn as the empty portrait frame rather than a second copy of the picture: a duplicated
          `next/image` is a second decode for two hundred milliseconds of ghost, and at this
          opacity the silhouette is all anybody reads anyway.
        */}
          {dodging && (
            <div
              aria-hidden
              data-testid={`ghost-${side}`}
              className="chamfer-md border-parchment-500/40 bg-wood-900/40 pointer-events-none absolute inset-0 border-2"
              style={{
                transform: `translateX(${-slip}px)`,
                opacity: (1 - dodging.progress) * 0.5,
              }}
            />
          )}

          <div
            // Desaturation on a knockout: a CSS transition rather than a Motion `filter` tween.
            // Filters are the most expensive thing Motion can animate and this one is binary.
            style={{
              filter: knockedOut ? 'grayscale(1) brightness(0.6)' : undefined,
              transition: 'filter 320ms ease-out',
              // The school's own light, while it is gathering. Set rather than animated: the value
              // is already a function of the current millisecond.
              boxShadow: charging ? `0 0 30px -4px ${school.palette.core}` : undefined,
            }}
            className={`chamfer-md bg-wood-900 relative h-44 w-36 overflow-hidden border-2 ${
              lunging?.crit
                ? 'border-amber-400 shadow-[0_0_36px_-6px_rgb(240_184_98/0.95)]'
                : reaction?.kind === 'blocked'
                  ? 'border-amber-300'
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
                <span className="text-parchment-500/72 text-[9px] tracking-[0.18em] uppercase">
                  {card.kind}
                </span>
              </div>
            )}

            {/*
            Armour that has thickened over the fight (dungeons spec §2).

            An inset ring rather than a badge, because the fantasy is the boss getting *harder to
            hurt* rather than gaining a status. It grows all fight and never resets, which is
            exactly what the number behind it does.
          */}
            {hardened > 0 && (
              <div
                aria-hidden
                data-testid={`hardened-${side}`}
                className="pointer-events-none absolute inset-0"
                style={{
                  boxShadow: `inset 0 0 0 ${1 + hardened * 10}px rgb(217 108 47 / ${0.18 + hardened * 0.5})`,
                }}
              />
            )}

            {/* The blow landing. White, brief, and gone before the recoil has finished. */}
            {flash > 0 && (
              <div
                aria-hidden
                data-testid={`flash-${side}`}
                // 0.35, not 0.55. At the higher value the portrait washed to a flat grey card and
                // the fighter vanished for a sixth of a second — which reads as a rendering
                // glitch rather than as a blow. A flash lights somebody up; it does not delete
                // them. Found by screenshotting a hit, which no test could have told me.
                className="pointer-events-none absolute inset-0 bg-white"
                style={{ opacity: flash * 0.35 }}
              />
            )}
          </div>

          {/* Block / dodge / miss plate */}
          {reaction && (
            <motion.div
              key={`${reaction.kind}-${health}`}
              initial={{ opacity: 0, scale: 0.6, y: 0 }}
              animate={{ opacity: 1, scale: 1, y: -8 }}
              exit={{ opacity: 0 }}
              transition={snappy}
              className="pointer-events-none absolute inset-0 grid place-items-center"
              data-testid={`reaction-${side}`}
            >
              <span
                className={`chamfer-sm font-display border px-2.5 py-1 text-xs tracking-[0.2em] ${
                  reaction.kind === 'blocked'
                    ? 'bg-wood-900/90 border-amber-500/70 text-amber-500'
                    : 'border-arcane-500/70 bg-wood-900/90 text-arcane-500'
                }`}
              >
                {REACTION_LABEL[reaction.kind]}
              </span>
            </motion.div>
          )}
        </motion.div>
      </div>

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
