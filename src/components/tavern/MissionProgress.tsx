'use client';

/**
 * The waiting state (tavern spec §4).
 *
 * The mission card becomes a little scene: the zone you were sent to, a hero walking a road
 * across it, and the time left. The walk is the whole trick — a bare countdown is a progress
 * bar, but a figure crossing a landscape is a journey, and it costs one transform.
 */

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { missionProgress, msRemaining, type ActiveMission } from '@/engine/missions/types';
import { SKIP_DICE_COST } from '@/engine/missions/board';
import { isQuickened } from '@/engine/tutorial/firstMission';
import { formatRemaining } from '@/components/ui/TimerChip';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTooltip } from '@/components/ui/Tooltip';
import { HeroIcon, Icon } from '@/components/icons';
import type { MountDef } from '@/data/mounts';
import { blurb as blurbById, renderBlurb } from '@/data/missionBlurbs';
import { monster as monsterById } from '@/data/monsters';
import { ZONES_BY_ID, backdropFor, type ZoneId } from '@/data/zones';
import { gameNow } from '@/state/clock';
import { dramatic, standard } from '@/styles/motion';

export interface MissionProgressProps {
  readonly mission: ActiveMission;
  readonly dice: number;
  readonly onSkip: () => void;
  /** Fires the moment the hero gets home, so the screen can offer the fight. */
  readonly onArrived: () => void;
  /** The mount that shortened this road, if one did (shops spec §4). */
  readonly mount?: MountDef | null;
}

export function MissionProgress({
  mission,
  dice,
  onSkip,
  onArrived,
  mount = null,
}: MissionProgressProps) {
  const reduceMotion = useReducedMotion();
  const [now, setNow] = useState(() => gameNow());
  const mountTip = useTooltip(
    mount && {
      title: mount.name,
      detail: `The road is ${Math.round(mount.speedBonus * 100)}% shorter while it is stabled.`,
    },
  );

  // One timer for the whole scene. Ticking per second is plenty — nothing here is frame-rate
  // sensitive, and a rAF loop for a twenty-minute countdown would be silly.
  useEffect(() => {
    const id = setInterval(() => setNow(gameNow()), 500);
    return () => clearInterval(id);
  }, []);

  const remaining = msRemaining(mission, now);
  const progress = missionProgress(mission, now);
  const arrived = remaining <= 0;

  useEffect(() => {
    if (arrived) onArrived();
  }, [arrived, onArrived]);

  const zone = ZONES_BY_ID[mission.offer.zoneId as ZoneId];
  const monster = monsterById(mission.offer.monsterId);
  const template = blurbById(mission.offer.blurbId);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={dramatic}
      className="chamfer-md edge-etched-strong bg-wood-800/94 relative overflow-hidden border border-amber-500/30"
      data-testid="mission-progress"
      data-arrived={arrived ? 'true' : 'false'}
    >
      <div className="relative h-52">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: zone
              ? `url('${backdropFor(zone, mission.offer.backdropIndex)}')`
              : undefined,
          }}
        />
        <div aria-hidden className={`absolute inset-0 bg-gradient-to-t ${zone?.tint ?? ''}`} />

        {/* The road, and the hero on it. */}
        <div className="absolute right-8 bottom-10 left-8">
          <div className="bg-wood-900/70 relative h-[2px] w-full">
            <div
              className="h-full bg-amber-500/70"
              style={{ width: `${progress * 100}%` }}
              data-testid="mission-road"
            />
            <motion.div
              className="absolute -top-[15px] text-amber-400"
              style={{ left: `${progress * 100}%` }}
              animate={reduceMotion ? {} : { y: [0, -3, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
            >
              <span className="-ml-2 block drop-shadow-[0_2px_4px_rgb(0_0_0/0.8)]">
                <HeroIcon size={18} />
              </span>
            </motion.div>
          </div>
        </div>

        <div className="absolute top-4 right-4 left-4">
          <p className="font-display text-parchment-300 text-xl font-bold">
            {zone?.name ?? mission.offer.zoneId}
          </p>
          <p className="text-parchment-500/72 mt-0.5 max-w-lg text-xs leading-snug">
            {template
              ? renderBlurb(template.text, {
                  monster: monster?.name ?? 'something',
                  zone: zone?.name ?? 'the wilds',
                })
              : null}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div>
          <p className="text-parchment-500/72 text-[10px] tracking-[0.25em] uppercase">
            {arrived ? 'Home' : 'On the road'}
          </p>
          <p
            className="font-display text-parchment-300 text-2xl font-bold tabular-nums"
            data-testid="mission-remaining"
          >
            {arrived ? 'Back at the door' : formatRemaining(remaining)}
          </p>
          <p className="text-parchment-500/72 mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
            <span>
              {mission.duration}-minute contract · {monster?.name ?? 'unknown foe'} awaits
            </span>
            {mount && (
              <span
                className="flex items-center gap-1 text-amber-500"
                {...mountTip}
                data-testid="mission-mount"
              >
                <Icon name={mount.iconId} size={12} />
                {mount.name}
              </span>
            )}
            {/* An unexplained twenty seconds against a printed ten minutes reads as a bug the
                second time round, when the timer means it (tutorial spec §2). */}
            {isQuickened(mission) && (
              <span className="flex items-center gap-1 text-amber-500" data-testid="mission-quick">
                <Icon name="spark" size={12} />
                Marla knows a shortcut, this once
              </span>
            )}
          </p>
        </div>

        {!arrived && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={standard}>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={onSkip}
              cost={{ dice: SKIP_DICE_COST }}
              {...(dice < SKIP_DICE_COST
                ? { disabledReason: 'You have no Golden Dice to spend.' }
                : {})}
              data-testid="mission-skip"
            >
              Call them back
            </ActionButton>
          </motion.div>
        )}
      </div>
    </motion.section>
  );
}
