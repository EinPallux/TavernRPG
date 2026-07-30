'use client';

/**
 * The two chests, and the one click that opens them (daily-loop spec §1).
 *
 * The daily chest is where the game's F2P promise actually lives: one Golden Die a day, for
 * turning up and clearing three notices. Dice are never purchasable (rule 6), so this panel is
 * the whole supply line — which is why the die is named on the button rather than discovered
 * inside it.
 *
 * The weekly ladder's seven rungs are drawn as rungs rather than as "4/7", because seven boxes
 * with three filled says *how far* at a glance and a fraction makes you do the arithmetic.
 */

import { AnimatePresence, motion } from 'motion/react';
import { CHEST_AT, WEEKLY_CHEST } from '@/data/dailyTasks';
import type { BoardView } from '@/state/boardActions';
import type { DailyChest, WeeklyChest } from '@/engine/board/chest';
import { ActionButton } from '@/components/ui/ActionButton';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { Meter } from '@/components/ui/Meter';
import { CoinIcon, DiceIcon, Icon, SparkIcon } from '@/components/icons';
import { snappy, standard } from '@/styles/motion';

export interface ChestPanelProps {
  readonly view: BoardView;
  /** Set for one beat after a claim — the burst plays over the panel. */
  readonly opened: { readonly kind: 'daily'; readonly chest: DailyChest } | null;
  readonly openedWeekly: { readonly kind: 'weekly'; readonly chest: WeeklyChest } | null;
  readonly onClaimDaily: () => void;
  readonly onClaimWeekly: () => void;
  readonly onBurstDone: () => void;
}

export function ChestPanel({
  view,
  opened,
  openedWeekly,
  onClaimDaily,
  onClaimWeekly,
  onBurstDone,
}: ChestPanelProps) {
  return (
    <div className="space-y-4">
      <TavernPanel title="Today’s chest">
        <div className="relative">
          <Meter
            value={view.points}
            max={view.needed}
            tone={view.points >= CHEST_AT ? 'success' : 'xp'}
            label={`${view.points} of ${view.needed} points`}
            data-testid="board-points"
          />

          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <span className="text-parchment-500/60 flex items-center gap-1.5">
              <CoinIcon size={12} /> Gold, by your level
            </span>
            <span className="text-parchment-500/60 flex items-center gap-1.5">
              <DiceIcon size={12} /> 1 Golden Die
            </span>
            <span className="text-parchment-500/60 flex items-center gap-1.5">
              <Icon name="essence" size={12} /> 4 Essence
            </span>
            <span className="text-parchment-500/60 flex items-center gap-1.5">
              <Icon name="scrap" size={12} /> 6 Scrap
            </span>
          </div>

          <p className="text-parchment-500/40 mt-2.5 text-[10px] leading-relaxed">
            A die every day, for turning up. They are never for sale — this and the Table’s free
            card are the whole supply.
          </p>

          <div className="mt-3">
            <ActionButton
              fullWidth
              variant={view.chestReady ? 'primary' : 'secondary'}
              onClick={onClaimDaily}
              {...(view.chestClaimed
                ? { disabledReason: 'Claimed. Marla will pin up three more at midnight.' }
                : !view.chestReady
                  ? { disabledReason: `All three notices, or ${view.needed} points. Not before.` }
                  : {})}
              data-testid="claim-daily"
            >
              {view.chestClaimed ? 'Claimed today' : 'Open the chest'}
            </ActionButton>
          </div>

          <AnimatePresence>
            {opened && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.06 }}
                transition={snappy}
                onAnimationComplete={() => setTimeout(onBurstDone, 2_600)}
                className="chamfer-md bg-wood-900/95 absolute inset-0 grid place-items-center border border-amber-500/60 p-4 text-center"
                data-testid="daily-burst"
              >
                {/* The burst: a ring of sparks thrown out from the middle, once. */}
                <span aria-hidden className="pointer-events-none absolute inset-0">
                  {Array.from({ length: 10 }, (_, index) => (
                    <motion.span
                      key={index}
                      initial={{ opacity: 1, x: 0, y: 0, scale: 0.4 }}
                      animate={{
                        opacity: 0,
                        x: Math.round(Math.cos((index / 10) * Math.PI * 2) * 110),
                        y: Math.round(Math.sin((index / 10) * Math.PI * 2) * 70),
                        scale: 1,
                      }}
                      transition={{ duration: 0.75, ease: 'easeOut', delay: index * 0.015 }}
                      className="absolute top-1/2 left-1/2 block h-1.5 w-1.5 bg-amber-500"
                    />
                  ))}
                </span>

                <div className="relative">
                  <p className="font-display text-lg font-extrabold text-amber-400">
                    The chest is yours
                  </p>
                  <p className="text-parchment-300 mt-1.5 flex items-center justify-center gap-3 text-sm tabular-nums">
                    <span className="flex items-center gap-1">
                      <CoinIcon size={13} />
                      {opened.chest.gold.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-amber-400">
                      <DiceIcon size={13} />
                      {opened.chest.dice}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="essence" size={13} />
                      {opened.chest.essence}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="scrap" size={13} />
                      {opened.chest.scrap}
                    </span>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </TavernPanel>

      <TavernPanel title="This week’s ladder">
        {/* Seven rungs, not "4/7": the shape says how far without any arithmetic. */}
        <div className="flex gap-1.5" data-testid="weekly-rungs">
          {Array.from({ length: view.weeklyNeeded }, (_, index) => {
            const filled = index < view.claimsThisWeek;
            return (
              <motion.span
                key={index}
                initial={false}
                animate={{ opacity: filled ? 1 : 0.28 }}
                transition={standard}
                className={`chamfer-sm h-7 flex-1 border ${
                  filled
                    ? 'border-amber-500/60 bg-amber-500/30'
                    : 'border-parchment-500/20 bg-wood-800/70'
                }`}
                data-filled={filled}
              />
            );
          })}
        </div>

        <p className="text-parchment-500/55 mt-2.5 text-[11px] leading-relaxed">
          <span className="text-parchment-300 tabular-nums">
            {view.claimsThisWeek} of {view.weeklyNeeded}
          </span>{' '}
          daily chests this week. All seven, and the ladder pays {WEEKLY_CHEST.dice} dice,{' '}
          {WEEKLY_CHEST.ale} pints and a Rare — Epic one time in four.
        </p>
        <p className="text-parchment-500/35 mt-1 text-[10px] leading-relaxed">
          Perfect attendance, deliberately. The ledger is the system that forgives; this one is the
          one that notices.
        </p>

        <div className="mt-3">
          <ActionButton
            fullWidth
            variant={view.weeklyReady ? 'primary' : 'secondary'}
            icon={<SparkIcon size={13} />}
            onClick={onClaimWeekly}
            {...(view.weeklyClaimed
              ? { disabledReason: 'Claimed. The rungs reset on Monday.' }
              : !view.weeklyReady
                ? {
                    disabledReason: `${view.weeklyNeeded - view.claimsThisWeek} more daily chests this week.`,
                  }
                : {})}
            data-testid="claim-weekly"
          >
            {view.weeklyClaimed ? 'Claimed this week' : 'Take the ladder’s chest'}
          </ActionButton>
        </div>

        <AnimatePresence>
          {openedWeekly && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={snappy}
              onAnimationComplete={() => setTimeout(onBurstDone, 3_200)}
              className="chamfer-sm border-moss-600/45 bg-moss-600/12 text-parchment-300 mt-3 border px-3 py-2 text-xs"
              data-testid="weekly-burst"
            >
              {openedWeekly.chest.dice} dice, {openedWeekly.chest.ale} pints and{' '}
              <span
                className={
                  openedWeekly.chest.rarity === 'epic' ? 'text-rarity-epic' : 'text-rarity-rare'
                }
              >
                {openedWeekly.chest.rarity === 'epic' ? 'an Epic' : 'a Rare'}
              </span>{' '}
              — it is in your bags.
            </motion.p>
          )}
        </AnimatePresence>
      </TavernPanel>
    </div>
  );
}
