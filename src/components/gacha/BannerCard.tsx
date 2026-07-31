'use client';

/**
 * One banner on the table (gacha spec §2, §7).
 *
 * The card has to answer four questions before a die is spent: **what is featured**, **what it
 * costs**, **how close the floor is**, and **what replaces it and when**. The last two are the
 * ones a dishonest gacha leaves out, so they are on the face of the card rather than behind a
 * tooltip — pity as a filling meter, the next rotation as a named silhouette with a countdown.
 */

import { motion } from 'motion/react';
import type { ActiveBanner } from '@/engine/gacha/schedule';
import { MONTHLY_TRACK, ROLL_DICE_COST, TEN_ROLL_SIZE } from '@/data/banners';
import { rungsEarned, rollsToNextRung, TRACK_RUNGS } from '@/engine/gacha/track';
import { ActionButton } from '@/components/ui/ActionButton';
import { formatRemaining } from '@/components/ui/TimerChip';
import { Term } from '@/components/ui/Term';
import { Icon, HourglassIcon, SparkIcon } from '@/components/icons';
import { listItemIn, snappy } from '@/styles/motion';

export interface BannerCardProps {
  readonly active: ActiveBanner;
  /** Pity progress toward *this* banner's featured card, or null when it has none. */
  readonly pity: { count: number; of: number } | null;
  /** Lifetime rolls on the Grand Reading, for its track. */
  readonly monthlyRolls: number;
  readonly dice: number;
  readonly freeAvailable: boolean;
  readonly bagsFull: boolean;
  readonly now: number;
  readonly onRoll: (ten: boolean) => void;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

/** The pity meter: a filling tarot-card bar, with the exact numbers beside it (spec §4). */
function PityMeter({ count, of }: { count: number; of: number }) {
  const ready = count >= of;
  return (
    <div className="mt-3" data-testid="pity-meter">
      <div className="mb-1 flex items-baseline justify-between text-[10px]">
        <span className="font-display tracking-[0.25em] text-amber-500 uppercase">
          <Term name="Pity">Guaranteed at {of}</Term>
        </span>
        <span className="text-parchment-500/72 tabular-nums" data-testid="pity-count">
          {count}/{of}
        </span>
      </div>
      <div className="chamfer-sm border-parchment-500/12 bg-wood-900 h-2 w-full overflow-hidden border">
        <motion.div
          initial={false}
          animate={{ width: `${Math.min(100, (count / of) * 100)}%` }}
          transition={snappy}
          className={`h-full ${ready ? 'bg-ember-600' : 'bg-rarity-set/75'}`}
        />
      </div>
      {ready && (
        <p className="text-ember-400 mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
          <SparkIcon size={11} />
          The next card is the featured one. Guaranteed.
        </p>
      )}
    </div>
  );
}

/** The Grand Reading's three rungs, and how far along they are. */
function TrackMeter({ rolls }: { rolls: number }) {
  const earned = rungsEarned(rolls);
  const toGo = rollsToNextRung(rolls);

  return (
    <div className="mt-3" data-testid="track-meter">
      <div className="mb-1.5 flex items-baseline justify-between text-[10px]">
        <span className="font-display tracking-[0.25em] text-amber-500 uppercase">The spread</span>
        <span className="text-parchment-500/72 tabular-nums" data-testid="track-count">
          {earned}/{TRACK_RUNGS}
        </span>
      </div>

      <ol className="space-y-1">
        {MONTHLY_TRACK.map((rung) => {
          const paid = earned >= rung.at;
          return (
            <li
              key={rung.at}
              className={`flex items-start gap-2 text-[11px] ${paid ? '' : 'opacity-45'}`}
              data-testid={`track-rung-${rung.at}`}
              data-paid={paid}
            >
              <span
                className={`chamfer-sm mt-0.5 grid h-4 w-4 shrink-0 place-items-center border text-[9px] font-bold ${
                  paid
                    ? 'border-rarity-set/60 bg-rarity-set/20 text-rarity-set'
                    : 'border-parchment-500/20 text-parchment-500/72'
                }`}
              >
                {rung.at}
              </span>
              <span className={paid ? 'text-parchment-300' : 'text-parchment-500/72'}>
                {rung.label}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-parchment-500/72 mt-1.5 text-[10px]">
        {toGo === null
          ? 'The spread is finished. The cards are still cards.'
          : `${toGo} more ${toGo === 1 ? 'card' : 'cards'} to the next.`}
      </p>
    </div>
  );
}

export function BannerCard({
  active,
  pity,
  monthlyRolls,
  dice,
  freeAvailable,
  bagsFull,
  now,
  onRoll,
  selected,
  onSelect,
}: BannerCardProps) {
  const { definition } = active;
  const free = definition.freeRollPerDay && freeAvailable;
  const canPay = dice >= ROLL_DICE_COST;
  const canPayTen = dice >= TEN_ROLL_SIZE * ROLL_DICE_COST;

  const disabledReason = bagsFull
    ? 'Your bags are full — Vesna will not deal onto a full table.'
    : undefined;

  return (
    <motion.div
      variants={listItemIn}
      onMouseEnter={onSelect}
      onFocus={onSelect}
      className={`chamfer-md flex flex-col border p-4 transition-colors ${
        selected
          ? 'border-arcane-500/55 bg-wood-900/80'
          : 'border-parchment-500/12 bg-wood-900/55 hover:border-arcane-500/35'
      }`}
      data-testid={`banner-${definition.id}`}
    >
      <header className="flex items-start gap-3">
        <span className="chamfer-sm bg-wood-800 border-arcane-500/40 text-arcane-500 grid h-11 w-11 shrink-0 place-items-center border">
          <Icon name={definition.sigil} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-parchment-300 text-sm leading-tight font-bold">
            {definition.name}
          </p>
          <p className="text-parchment-500/72 mt-0.5 text-[11px] leading-snug">
            {definition.blurb}
          </p>
        </div>
      </header>

      {/* What is on the table, and until when. */}
      <div className="chamfer-sm border-parchment-500/10 bg-wood-900/60 mt-3 border px-3 py-2">
        <p className="font-display text-[0.6rem] tracking-[0.28em] text-amber-500 uppercase">
          Featured
        </p>
        <p className="text-rarity-set mt-0.5 text-sm font-semibold" data-testid="featuring">
          {active.featuring}
        </p>
        {definition.id === 'daily' && (
          <p className="text-parchment-500/72 mt-0.5 text-[10px]">
            Three times as likely to land in that slot. The featured *rate* is unchanged.
          </p>
        )}
        <p
          className="text-parchment-500/72 mt-1.5 flex items-center gap-1.5 text-[11px]"
          data-testid="banner-countdown"
        >
          <HourglassIcon size={11} />
          Turns over in {formatRemaining(Math.max(0, active.endsAt - now))}
        </p>
      </div>

      {pity && <PityMeter count={pity.count} of={pity.of} />}
      {definition.id === 'monthly' && <TrackMeter rolls={monthlyRolls} />}

      {/* The tease: a name and a date, not a mystery box. */}
      <p
        className="text-parchment-500/72 mt-3 text-[10px] leading-relaxed"
        data-testid="next-tease"
      >
        Being shuffled: <span className="text-parchment-500/72">{active.next.featuring}</span>
      </p>

      <div className="mt-auto flex gap-2 pt-3">
        <ActionButton
          size="sm"
          fullWidth
          variant={free ? 'primary' : 'secondary'}
          {...(free ? {} : { cost: { dice: ROLL_DICE_COST } })}
          {...(disabledReason
            ? { disabledReason }
            : !free && !canPay
              ? { disabledReason: 'Golden Dice are earned, never bought — run a long mission.' }
              : {})}
          onClick={() => onRoll(false)}
          data-testid={`roll-${definition.id}`}
        >
          {free ? 'Free card' : 'Draw'}
        </ActionButton>

        {definition.allowsTenRoll && (
          <ActionButton
            size="sm"
            fullWidth
            variant="secondary"
            cost={{ dice: TEN_ROLL_SIZE * ROLL_DICE_COST }}
            {...(disabledReason
              ? { disabledReason }
              : !canPayTen
                ? {
                    disabledReason:
                      'Ten cards, ten dice. No discount — dice are too scarce to fake one.',
                  }
                : {})}
            onClick={() => onRoll(true)}
            data-testid={`roll-ten-${definition.id}`}
          >
            Ten
          </ActionButton>
        )}
      </div>
    </motion.div>
  );
}
