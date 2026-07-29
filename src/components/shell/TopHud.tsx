'use client';

/**
 * The top HUD (style guide §2).
 *
 * Everything the player needs at a glance without leaving the screen they're on: who they
 * are, how close the next level is, what they can spend, how much of the day is left, and
 * whether anything is running.
 *
 * The hero drives everything it can as of Phase 2. Vigor and activity timers still read from
 * `PreviewState` because those systems arrive with missions and patrol (Phases 5–6).
 */

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import { CoinIcon, DiceIcon, GearIcon, VigorTankard } from '@/components/icons';
import { Meter } from '@/components/ui/Meter';
import { TimerChip } from '@/components/ui/TimerChip';
import { useShellStore } from '@/state/shellStore';
import { useGameStore } from '@/state/gameStore';
import { classDef } from '@/data/classes';
import { xpNeeded } from '@/engine/progression/xp';
import { vigorCeiling } from '@/engine/reset/resetEngine';
import { snappy } from '@/styles/motion';

function CurrencyChip({
  icon,
  value,
  label,
  tone,
  testId,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: 'gold' | 'dice';
  testId: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      transition={snappy}
      title={label}
      data-testid={testId}
      className={`chamfer-sm bg-wood-900/70 flex items-center gap-2 border px-3 py-1.5 ${
        tone === 'gold' ? 'border-amber-500/25' : 'border-amber-400/35'
      }`}
    >
      <span className={tone === 'gold' ? 'text-amber-500' : 'text-amber-400'}>{icon}</span>
      <span className="text-parchment-300 text-sm">{value.toLocaleString()}</span>
    </motion.div>
  );
}

export function TopHud() {
  const preview = useShellStore((state) => state.preview);
  const hero = useGameStore((state) => state.save?.hero ?? null);
  const activity = useGameStore((state) => state.save?.activity ?? null);

  /**
   * The hero and their day are authoritative wherever they exist. Only the mount timer is
   * still a preview value; its system arrives with the Stables in Phase 9.
   */
  const level = hero?.level ?? preview.level;
  const xp = hero?.xp ?? preview.xp;
  const xpForNext = hero ? xpNeeded(hero.level) : preview.xpForNext;
  const gold = hero ? Math.floor(hero.gold) : preview.gold;
  const dice = hero?.dice ?? preview.dice;
  const portrait = hero ? classDef(hero.classId).portrait : '/assets/classes/Warrior.png';
  const heroLabel = hero
    ? `${hero.name} — level ${hero.level} ${classDef(hero.classId).name}`
    : 'Your hero';

  // Vigor and the mission timer are real as of Phase 5.
  const vigor = activity ? Math.floor(activity.vigor) : preview.vigor;
  const vigorMax = activity ? vigorCeiling(activity.alesToday) : preview.vigorMax;
  const vigorRatio = vigorMax > 0 ? Math.min(1, vigor / vigorMax) : 0;

  // A landed mission has no countdown left to show — it shows a "go and see" chip instead.
  const missionEndsAt = activity?.mission?.endsAt ?? null;
  const missionWaiting = Boolean(activity?.pendingMission);

  return (
    <header className="surface-timber bg-wood-800/95 relative z-30 flex h-[72px] items-center gap-6 border-b border-amber-500/20 px-5">
      {/* Hero: portrait, level ring, XP sliver. */}
      <div className="flex items-center gap-3">
        <Link
          href="/character"
          className="relative block shrink-0"
          title={heroLabel}
          data-testid="hud-portrait"
        >
          <span
            className="chamfer-sm bg-wood-900 block h-12 w-12 overflow-hidden border border-amber-500/40"
            aria-hidden
          >
            <Image
              src={portrait}
              alt=""
              width={48}
              height={48}
              className="h-full w-full object-cover opacity-90"
            />
          </span>
          <span
            className="chamfer-sm font-display text-ink-900 absolute -right-1.5 -bottom-1.5 bg-amber-500 px-1.5 text-[11px] font-bold"
            data-testid="hud-level"
          >
            {level}
          </span>
        </Link>

        <div className="w-44">
          <Meter
            value={xp}
            max={xpForNext}
            tone="xp"
            label="Experience"
            height={6}
            data-testid="hud-xp"
          />
        </div>
      </div>

      <div aria-hidden className="bg-parchment-500/12 h-8 w-px" />

      {/* Wallet. */}
      <div className="flex items-center gap-2">
        <CurrencyChip
          icon={<CoinIcon size={15} />}
          value={gold}
          label="Gold"
          tone="gold"
          testId="hud-gold"
        />
        <CurrencyChip
          icon={<DiceIcon size={15} />}
          value={dice}
          label="Golden Dice — earned only, never sold"
          tone="dice"
          testId="hud-dice"
        />
      </div>

      {/* Vigor: the tankard *is* the meter. */}
      <div
        className="flex items-center gap-2"
        title={`Vigor ${vigor}/${vigorMax} — refills at midnight`}
        data-testid="hud-vigor"
      >
        <span className="text-ember-600">
          <VigorTankard size={26} ratio={vigorRatio} />
        </span>
        <span className="text-parchment-300 text-sm">
          {vigor}
          <span className="text-parchment-500/45">/{vigorMax}</span>
        </span>
      </div>

      {/* Whatever is currently running. */}
      <div className="flex flex-1 items-center gap-2">
        {missionWaiting ? (
          <Link
            href="/tavern"
            className="chamfer-sm font-display animate-pulse border border-amber-500/60 bg-amber-500/15 px-3 py-1.5 text-xs tracking-widest text-amber-400 uppercase"
            data-testid="hud-mission-waiting"
          >
            Your hero is back
          </Link>
        ) : missionEndsAt !== null ? (
          <TimerChip endsAt={missionEndsAt} label="Mission" data-testid="hud-activity" />
        ) : (
          preview.activityEndsAt !== null && (
            <TimerChip
              endsAt={preview.activityEndsAt}
              label={preview.activityLabel}
              data-testid="hud-activity"
            />
          )
        )}
        {preview.mountExpiresAt !== null && (
          <TimerChip endsAt={preview.mountExpiresAt} label="Mount" data-testid="hud-mount" />
        )}
      </div>

      <Link
        href="/settings"
        aria-label="Settings"
        data-testid="hud-settings"
        className="text-parchment-500/50 transition-colors hover:text-amber-500"
      >
        <GearIcon size={19} />
      </Link>
    </header>
  );
}
