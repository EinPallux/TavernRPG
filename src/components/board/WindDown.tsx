'use client';

/**
 * The wind-down (daily-loop spec §5).
 *
 * "Always end sessions pointing at tomorrow." A player whose Vigor is spent has reached the end
 * of the day's *contracts*, not the end of the game, and a room that says nothing at that moment
 * is a dead end dressed as a tavern. This panel is what replaces the dead end: the one thing
 * still worth doing tonight, and three things waiting at dawn.
 *
 * It is deliberately not a nag. It appears when the Vigor is genuinely gone, it names the Watch
 * once, and the rest of it is a preview rather than a prompt — the point is to leave with
 * something to come back for, not to be talked into another twenty minutes.
 */

import Link from 'next/link';
import { motion } from 'motion/react';
import { PLACES_BY_ID } from '@/data/places';
import { CALENDAR_DAYS, calendarReward } from '@/data/calendar';
import { activeBanner } from '@/engine/gacha/schedule';
import { isUnlocked } from '@/engine/progression/gates';
import { msUntilNextReset } from '@/engine/reset/resetEngine';
import type { SaveFile } from '@/engine/save/schema';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { TimerChip } from '@/components/ui/TimerChip';
import { Icon } from '@/components/icons';
import { listItemIn, staggerChildren } from '@/styles/motion';

export interface WindDownProps {
  readonly save: SaveFile;
  readonly today: string;
  readonly now: number;
}

interface Line {
  readonly icon: Parameters<typeof Icon>[0]['name'];
  readonly text: string;
}

/**
 * Three lines about tomorrow, chosen from what this hero can actually reach.
 *
 * Gated the same way the reset ritual's lines are: a level-4 player being told which set Vesna
 * will feature is being told about a door that does not open for four more levels.
 */
function tomorrowLines(save: SaveFile, today: string): readonly Line[] {
  const level = save.hero?.level ?? 1;
  const lines: Line[] = [{ icon: 'tankard', text: 'A full tankard of Vigor, and a fresh board' }];

  if (isUnlocked('board', level)) {
    // The square *after* today's, since today's has already been stamped by the reset walk.
    const nextDay = save.calendar.day >= CALENDAR_DAYS ? 1 : save.calendar.day + 1;
    const square = calendarReward(nextDay);
    lines.push({ icon: square.iconId, text: `Ledger day ${nextDay}: ${square.label}` });
  }

  if (isUnlocked('fortune', level) && save.hero) {
    const daily = activeBanner('daily', today, save.worldSeed, save.hero.classId);
    lines.push({ icon: 'dice', text: `New card at dawn: ${daily.next.featuring}` });
  }

  return lines.slice(0, 3);
}

export function WindDown({ save, today, now }: WindDownProps) {
  const level = save.hero?.level ?? 1;
  const patrolOpen = isUnlocked('patrol', level);
  const patrolRunning = Boolean(save.activity.patrol);
  const lines = tomorrowLines(save, today);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="wind-down"
    >
      <TavernPanel title="That’s the day’s work">
        <p className="text-parchment-500/72 text-xs leading-relaxed">
          Your Vigor is spent. Nothing more to sign for tonight — but the Watch still pays, and the
          morning is already set.
        </p>

        {patrolOpen && (
          <Link
            href={PLACES_BY_ID.patrol.route}
            className="mt-3 block"
            data-testid="wind-down-patrol"
          >
            <ActionButton fullWidth variant={patrolRunning ? 'secondary' : 'primary'} tabIndex={-1}>
              {patrolRunning ? 'Your shift is running' : 'Take a shift with the Watch'}
            </ActionButton>
          </Link>
        )}

        <div className="facet-rule my-3" />

        <p className="font-display text-parchment-500/72 mb-2 text-[10px] tracking-[0.28em] uppercase">
          At dawn
        </p>
        <motion.ul
          initial="hidden"
          animate="visible"
          transition={staggerChildren(0.07)}
          className="space-y-1.5"
          data-testid="tomorrow-preview"
        >
          {lines.map((line) => (
            <motion.li
              key={line.text}
              variants={listItemIn}
              className="text-parchment-500/72 flex items-start gap-2 text-[11px] leading-snug"
            >
              <span className="mt-px shrink-0 text-amber-500/70">
                <Icon name={line.icon} size={13} />
              </span>
              {line.text}
            </motion.li>
          ))}
        </motion.ul>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-parchment-500/72 text-[10px]">The tavern clock turns in</span>
          <TimerChip
            endsAt={now + msUntilNextReset(now)}
            now={() => now}
            data-testid="wind-down-timer"
          />
        </div>

        {!patrolOpen && (
          <p className="text-parchment-500/72 mt-2 text-[10px] leading-relaxed">
            The City Watch opens at level {PLACES_BY_ID.patrol.gateLevel}. Until then, the night is
            yours.
          </p>
        )}
        <Link
          href={PLACES_BY_ID.board.route}
          className="text-parchment-500/72 mt-2 block text-[10px] transition-colors hover:text-amber-500"
        >
          Check the Notice Board before you go →
        </Link>
      </TavernPanel>
    </motion.div>
  );
}
