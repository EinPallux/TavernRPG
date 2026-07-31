'use client';

/**
 * One stall (pets spec §3).
 *
 * Two states, and the *unowned* one carries most of the design weight: a silhouette that says
 * exactly where the pet comes from. A collection page whose empty slots are question marks is a
 * page that makes the player feel behind; one whose empty slots are directions is a page that
 * makes them feel like they have somewhere to go. Every hint is authored beside the source check
 * in `data/pets.ts`, so what the stall promises and what the engine looks for cannot disagree.
 *
 * Owned pets idle — a slow breath, a blink, a shuffle — because a room of twelve motionless
 * outlines is a spreadsheet with a backdrop.
 */

import { motion, useReducedMotion } from 'motion/react';
import {
  BOOST_LABELS,
  FEEDS_PER_DAY,
  PET_MAX_LEVEL,
  PET_RARITY_LABELS,
  type PetDef,
} from '@/data/pets';
import { boostShare, nextUpgrade, type PetProgress } from '@/engine/pets/feeding';
import { ActionButton } from '@/components/ui/ActionButton';
import { Icon, LockIcon, SparkIcon } from '@/components/icons';
import { MaterialCost } from '@/components/forge/MaterialWallet';
import { listItemIn, snappy } from '@/styles/motion';

/** Frames climb with rarity — the whole visible payoff of an upgrade (spec §2). */
const RARITY_FRAME: Readonly<Record<string, string>> = {
  common: 'border-parchment-500/25',
  uncommon: 'border-rarity-uncommon/55 shadow-[0_0_16px_-8px_rgb(111_168_78/0.9)]',
  rare: 'border-rarity-rare/60 shadow-[0_0_20px_-8px_rgb(74_143_212/0.95)]',
  epic: 'border-rarity-epic/65 shadow-[0_0_26px_-8px_rgb(155_95_208/1)]',
};

const RARITY_TEXT: Readonly<Record<string, string>> = {
  common: 'text-parchment-500/72',
  uncommon: 'text-rarity-uncommon',
  rare: 'text-rarity-rare',
  epic: 'text-rarity-epic',
};

/** Each pet idles a little differently, keyed off its own id so the row is never in lockstep. */
function idleFor(index: number) {
  const cycle = 2.4 + (index % 5) * 0.35;
  return {
    animate: { y: [0, -3, 0], rotate: [0, index % 2 ? 1.5 : -1.5, 0] },
    transition: {
      duration: cycle,
      repeat: Infinity,
      ease: 'easeInOut' as const,
      delay: index * 0.2,
    },
  };
}

export interface PetStallProps {
  readonly definition: PetDef;
  readonly owned: boolean;
  readonly progress: PetProgress;
  readonly active: boolean;
  readonly index: number;
  /** Null when the pet cannot be fed right now, with the reason on the button instead. */
  readonly feedReason: string | null;
  readonly upgradeReason: string | null;
  /** True for one beat after this stall eats — the chomp and the boost flash. */
  readonly justFed: boolean;
  /** Bumped per feed, so a second click restarts the chomp instead of joining it. */
  readonly chompNonce: number;
  readonly onFeed: () => void;
  readonly onUpgrade: () => void;
  readonly onActivate: () => void;
  readonly onChompDone: () => void;
}

export function PetStall({
  definition,
  owned,
  progress,
  active,
  index,
  feedReason,
  upgradeReason,
  justFed,
  chompNonce,
  onFeed,
  onUpgrade,
  onActivate,
  onChompDone,
}: PetStallProps) {
  const reduced = useReducedMotion();
  const idle = idleFor(index);
  const upgrade = nextUpgrade(progress);
  const share = boostShare(definition, progress);

  return (
    <motion.div
      // The grid sorts yours to the front, so a pet arriving *slides* past the locked stalls
      // rather than teleporting — which is the only animation the acquisition gets in this room.
      layout
      variants={listItemIn}
      className={`chamfer-md flex flex-col border p-3.5 transition-colors ${
        !owned
          ? 'border-parchment-500/10 bg-wood-900/35'
          : active
            ? 'border-amber-500/60 bg-amber-500/8 shadow-[0_0_30px_-16px_rgb(232_163_61/0.95)]'
            : 'border-parchment-500/12 bg-wood-900/60 hover:border-amber-500/35'
      }`}
      data-testid={`pet-${definition.id}`}
      data-owned={owned}
      data-active={active}
    >
      <div className="flex items-start gap-3">
        {/* The chomp outranks the idle: a fed pet lurches, then settles back into breathing. */}
        <motion.span
          key={justFed ? `chomp-${chompNonce}` : 'idle'}
          {...(justFed
            ? {
                animate: { scale: [1, 1.28, 0.92, 1], rotate: [0, -8, 6, 0] },
                transition: { duration: 0.5, ease: 'easeOut' as const },
                onAnimationComplete: onChompDone,
              }
            : owned && !reduced
              ? idle
              : {})}
          className={`chamfer-sm bg-wood-800 grid h-14 w-14 shrink-0 place-items-center border ${
            owned
              ? `${RARITY_FRAME[progress.rarity]} ${RARITY_TEXT[progress.rarity]}`
              : 'border-parchment-500/10 text-parchment-500/72'
          }`}
          data-testid={owned ? undefined : `silhouette-${definition.id}`}
        >
          <Icon name={definition.iconId} size={30} />
        </motion.span>

        <div className="min-w-0 flex-1">
          <p
            className={`font-display text-sm leading-tight font-bold ${
              owned ? 'text-parchment-300' : 'text-parchment-500/72'
            }`}
          >
            {definition.name}
          </p>
          {owned ? (
            <p className="text-parchment-500/72 mt-0.5 text-[11px] leading-snug italic">
              {definition.flavour}
            </p>
          ) : (
            <p className="text-parchment-500/72 mt-0.5 flex items-start gap-1.5 text-[11px] leading-snug">
              <LockIcon size={11} className="mt-0.5 shrink-0" />
              <span data-testid={`hint-${definition.id}`}>{definition.hint}</span>
            </p>
          )}
        </div>

        {owned && (
          <span
            className="text-parchment-500/72 shrink-0 text-[10px] tracking-wider uppercase"
            data-testid={`rarity-${definition.id}`}
          >
            {PET_RARITY_LABELS[progress.rarity]}
          </span>
        )}
      </div>

      {owned && (
        <>
          {/* What it is worth, in the exact number the fight will use (spec §3). A feed moves
              this number, so a feed has to make it flash — otherwise three clicks a day is
              three clicks with no reply. */}
          <motion.p
            animate={
              justFed
                ? {
                    borderColor: [
                      'rgb(232 163 61 / 0.1)',
                      'rgb(232 163 61 / 0.75)',
                      'rgb(232 163 61 / 0.1)',
                    ],
                  }
                : {}
            }
            transition={{ duration: 0.7, times: [0, 0.2, 1], ease: 'easeOut' }}
            className="chamfer-sm border-parchment-500/10 bg-wood-900/60 mt-3 border px-2.5 py-1.5 text-[11px]"
            data-testid={`boost-${definition.id}`}
          >
            <span className="text-parchment-500/72">{BOOST_LABELS[definition.boost]}</span>{' '}
            <span className="font-semibold text-amber-400">+{(share * 100).toFixed(1)}%</span>
          </motion.p>

          <div className="mt-2.5">
            <div className="mb-1 flex items-baseline justify-between text-[10px]">
              <span className="text-parchment-500/72">
                Level {progress.level}
                {progress.level >= PET_MAX_LEVEL ? ' — grown' : ''}
              </span>
              <span className="text-parchment-500/72 tabular-nums">
                {FEEDS_PER_DAY - progress.fedToday}/{FEEDS_PER_DAY} feeds left
              </span>
            </div>
            <div className="chamfer-sm border-parchment-500/10 bg-wood-900 h-1.5 w-full overflow-hidden border">
              <motion.div
                initial={false}
                animate={{ width: `${(progress.level / PET_MAX_LEVEL) * 100}%` }}
                transition={snappy}
                className="bg-moss-600 h-full"
              />
            </div>
          </div>

          <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
            <ActionButton
              size="sm"
              variant="secondary"
              onClick={onFeed}
              {...(feedReason ? { disabledReason: feedReason } : {})}
              data-testid={`feed-${definition.id}`}
            >
              Feed
            </ActionButton>

            <ActionButton
              size="sm"
              variant={active ? 'primary' : 'ghost'}
              onClick={onActivate}
              data-testid={`activate-${definition.id}`}
            >
              {active ? 'At your side' : 'Take along'}
            </ActionButton>
          </div>

          {/* The upgrade gets its own full-width row and says the frame it buys. Squeezed in
              beside the other two it was a spark and two numbers, which reads as a price with
              nothing attached to it. */}
          {upgrade && (
            <div className="mt-1.5">
              <ActionButton
                size="sm"
                variant="secondary"
                fullWidth
                icon={<SparkIcon size={12} />}
                onClick={onUpgrade}
                {...(upgradeReason ? { disabledReason: upgradeReason } : {})}
                data-testid={`upgrade-${definition.id}`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span>{PET_RARITY_LABELS[upgrade.rarity]} frame</span>
                  <MaterialCost
                    bundle={{ scrap: 0, essence: upgrade.essence, starmetal: upgrade.starmetal }}
                    size={11}
                    className="text-[11px]"
                  />
                </span>
              </ActionButton>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
