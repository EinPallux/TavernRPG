'use client';

/**
 * One notice on the board (daily-loop spec §1).
 *
 * The design constraint that shapes it: tasks **auto-track**, so there is no "claim" button here
 * and there never will be. Three notices with three claim buttons and then a chest button is
 * four clicks for one reward, which is exactly the micro-click grind the spec rules out. The row
 * shows progress and gets out of the way; the single claim moment lives on the chest.
 *
 * What it does need is a way *out*: every task names the room it sends you to, so a player who
 * reads "Melt 3 pieces in the crucible" is one click from the crucible rather than one click
 * from remembering where the crucible is.
 */

import Link from 'next/link';
import { motion } from 'motion/react';
import { PLACES_BY_ID } from '@/data/places';
import { taskTitle } from '@/data/dailyTasks';
import type { TaskProgress } from '@/engine/board/tasks';
import { Icon, ChevronIcon } from '@/components/icons';
import { Meter } from '@/components/ui/Meter';
import { listItemIn, snappy } from '@/styles/motion';

export function TaskRow({ entry }: { entry: TaskProgress }) {
  const { definition, points } = entry.task;
  const place = PLACES_BY_ID[definition.place];

  return (
    <motion.li
      variants={listItemIn}
      className={`chamfer-md border p-4 transition-colors ${
        entry.complete
          ? 'border-moss-600/55 bg-moss-600/10'
          : 'border-parchment-500/12 bg-wood-900/55'
      }`}
      data-testid={`task-${definition.id}`}
      data-complete={entry.complete}
    >
      <div className="flex items-start gap-3">
        <motion.span
          /*
           * A finished notice gets ticked, and the tick lands rather than appearing.
           *
           * Duration-based, not a spring: springs take exactly two keyframes, and handing one
           * three drops the animation silently. Third time this has bitten — Phase 12's wallet
           * pulse and the forge's beam were the other two.
           */
          animate={entry.complete ? { scale: [1, 1.18, 1], rotate: [0, -6, 0] } : { scale: 1 }}
          transition={
            entry.complete ? { duration: 0.4, times: [0, 0.4, 1], ease: 'easeOut' } : snappy
          }
          className={`chamfer-sm grid h-11 w-11 shrink-0 place-items-center border ${
            entry.complete
              ? 'border-moss-600/60 bg-moss-600/20 text-moss-600'
              : 'border-parchment-500/15 bg-wood-800 text-parchment-500/65'
          }`}
        >
          <Icon name={definition.iconId} size={22} />
        </motion.span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-parchment-300 text-sm leading-tight font-bold">
              {taskTitle(definition)}
            </p>
            <span
              className={`shrink-0 text-xs font-bold tabular-nums ${
                entry.complete ? 'text-moss-600' : 'text-parchment-500/45'
              }`}
              data-testid={`task-points-${definition.id}`}
            >
              {points} pts
            </span>
          </div>
          <p className="text-parchment-500/50 mt-0.5 text-[11px] leading-snug italic">
            {definition.blurb}
          </p>

          <div className="mt-2.5">
            <Meter
              value={entry.done}
              max={entry.target}
              tone={entry.complete ? 'success' : 'xp'}
              showNumbers={false}
              height={5}
              data-testid={`task-meter-${definition.id}`}
            />
            <div className="mt-1 flex items-baseline justify-between gap-2 text-[10px]">
              <span className="text-parchment-500/45 tabular-nums">
                {entry.done.toLocaleString()} / {entry.target.toLocaleString()}
              </span>
              {entry.complete ? (
                <span className="text-moss-600 font-semibold tracking-wider uppercase">Done</span>
              ) : (
                <Link
                  href={place.route}
                  className="text-parchment-500/55 flex items-center gap-0.5 transition-colors hover:text-amber-500"
                  data-testid={`task-go-${definition.id}`}
                >
                  {place.railName ?? place.name}
                  <ChevronIcon size={11} className="-rotate-90" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.li>
  );
}
