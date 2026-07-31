'use client';

/**
 * The City Watch (tavern-and-patrol spec §5).
 *
 * The "I'm done for today" screen. Two faces: the sign-up board, and the beat. Which one shows
 * comes from the save, so a shift survives everything a tab can do to it.
 *
 * The screen's honesty rule: the slider's promise must be the payout. Both come from
 * `previewEarnings` and `patrolEarnings`, which a unit test pins to each other — a preview that
 * over-promises is worse than no preview.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  MAX_SHIFT_HOURS,
  MIN_SHIFT_HOURS,
  OFF_DUTY_WARN_VIGOR,
  patrolEarnings,
  previewEarnings,
  shiftProgress,
  msRemaining,
  type PatrolShift,
} from '@/engine/patrol/patrol';
import { xpNeeded } from '@/engine/progression/xp';
import { formatRemaining } from '@/components/ui/TimerChip';
import { ActionButton } from '@/components/ui/ActionButton';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { KeeperBark } from '@/components/ui/KeeperBark';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { CoinIcon, PatrolIcon, SparkIcon } from '@/components/icons';
import { useGameStore } from '@/state/gameStore';
import { gameNow } from '@/state/clock';
import type { PatrolCollection } from '@/state/patrolActions';
import { dramatic, snappy, standard } from '@/styles/motion';
import { ShiftReport } from './ShiftReport';

const HILDY_LINES = {
  idle: 'Watch needs bodies. Pay is honest, hours are yours.',
  onDuty: 'You are on the book. Go on, then.',
  warned: 'You have got fight left in you. Sure you want the quiet shift?',
  missionOut: 'Your hero is out on a job. Come back when they are home.',
  done: 'Signed off. Do not spend it all at Marla’s.',
} as const;

export function PatrolScreen() {
  const save = useGameStore((state) => state.save);
  const startPatrol = useGameStore((state) => state.startPatrol);
  const collectPatrol = useGameStore((state) => state.collectPatrol);
  const refreshDay = useGameStore((state) => state.refreshDay);

  const [hours, setHours] = useState(8);
  const [report, setReport] = useState<PatrolCollection | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingOffDuty, setConfirmingOffDuty] = useState(false);
  const [now, setNow] = useState(() => gameNow());

  useEffect(() => {
    refreshDay();
  }, [refreshDay]);

  // One timer for the screen. Per-second is ample for a twelve-hour countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(gameNow()), 500);
    return () => clearInterval(id);
  }, []);

  const hero = save?.hero ?? null;
  const activity = save?.activity ?? null;
  const shift = activity?.patrol ?? null;
  const missionOut = Boolean(activity?.mission ?? activity?.pendingMission);

  const handleStart = useCallback(
    (confirmed = false) => {
      if (!hero || !activity) return;

      // Soft anti-footgun (spec §5, Q7): clocking off with a day's Vigor unspent is usually a
      // misclick, so Hildy asks once. Asking twice would be nagging.
      if (!confirmed && activity.vigor > OFF_DUTY_WARN_VIGOR && !missionOut) {
        setConfirmingOffDuty(true);
        return;
      }

      setConfirmingOffDuty(false);
      const refusal = startPatrol(hours);
      setMessage(
        refusal === null
          ? null
          : refusal.kind === 'mission-running'
            ? 'Your hero is already out on a job.'
            : refusal.kind === 'already-on-duty'
              ? 'They are on the book already.'
              : 'Hildy signs shifts between one and twelve hours.',
      );
    },
    [activity, hero, hours, missionOut, startPatrol],
  );

  const handleCollect = useCallback(() => {
    const collected = collectPatrol();
    if (collected) setReport(collected);
  }, [collectPatrol]);

  if (!save || !hero || !activity) return null;

  const bark = shift
    ? HILDY_LINES.onDuty
    : missionOut
      ? HILDY_LINES.missionOut
      : confirmingOffDuty
        ? HILDY_LINES.warned
        : HILDY_LINES.idle;

  return (
    <div className="relative h-full w-full" data-testid="place-patrol">
      <AmbientStage
        backdrop="/assets/backgrounds/patrol_background.webp"
        tint="from-wood-900 via-wood-900/78 to-wood-900/50"
        effects={['lantern', 'motes']}
      >
        {/* Both these rooms are lit blue — a guard post at dusk and an arena under open sky —
            where every other place in Emberhollow is dark timber. The eyebrow label measured
            3.4–3.7:1 against the water and the sky. Same scrim the Hall of Fame got (§10.3). */}
        <div
          aria-hidden
          className="from-wood-900/92 via-wood-900/70 pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent"
        />
        <div className="relative h-full overflow-y-auto px-8 py-6">
          <header className="mb-5">
            <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
              Emberhollow
            </p>
            <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
              The City Watch
            </h1>
          </header>

          <div className="mb-5">
            <KeeperBark keeper="Hildy" line={bark} data-testid="bark-patrol" />
          </div>

          <AnimatePresence>
            {message && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={standard}
                className="chamfer-sm border-blood-600/40 bg-blood-600/12 text-parchment-300 mb-4 border px-3 py-2 text-sm"
                data-testid="patrol-message"
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          {shift ? (
            <OnDuty shift={shift} now={now} onCollect={handleCollect} />
          ) : (
            <SignUp
              hours={hours}
              onHours={setHours}
              heroLevel={hero.level}
              vigor={activity.vigor}
              missionOut={missionOut}
              confirming={confirmingOffDuty}
              onStart={handleStart}
              onCancelConfirm={() => setConfirmingOffDuty(false)}
              patrolsCompleted={activity.patrolsCompleted}
            />
          )}
        </div>
      </AmbientStage>

      <AnimatePresence>
        {report && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={dramatic}
            className="absolute inset-0 z-30 grid place-items-center bg-[rgb(24_18_14/0.88)] p-6"
          >
            <ShiftReport
              hours={report.shift.hours}
              minutes={report.minutes}
              gold={report.gold}
              xp={report.xp}
              early={report.early}
              leveledTo={report.leveledTo}
              seed={report.shift.startedAt}
              onDismiss={() => setReport(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The sign-up board: pick a length, see what it pays, take the shift. */
function SignUp({
  hours,
  onHours,
  heroLevel,
  vigor,
  missionOut,
  confirming,
  onStart,
  onCancelConfirm,
  patrolsCompleted,
}: {
  hours: number;
  onHours: (hours: number) => void;
  heroLevel: number;
  vigor: number;
  missionOut: boolean;
  confirming: boolean;
  onStart: (confirmed?: boolean) => void;
  onCancelConfirm: () => void;
  patrolsCompleted: number;
}) {
  const preview = useMemo(
    () => previewEarnings(hours, heroLevel, xpNeeded(heroLevel)),
    [hours, heroLevel],
  );

  return (
    <TavernPanel
      title="Sign the watch book"
      headerSlot={
        patrolsCompleted > 0 ? (
          <span className="text-parchment-500/72 text-xs">
            {patrolsCompleted} shift{patrolsCompleted === 1 ? '' : 's'} served
          </span>
        ) : null
      }
      animate={false}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div>
          <label className="block">
            <span className="text-parchment-500/72 mb-2 block text-xs tracking-[0.2em] uppercase">
              Shift length
            </span>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={MIN_SHIFT_HOURS}
                max={MAX_SHIFT_HOURS}
                step={1}
                value={hours}
                onChange={(event) => onHours(Number(event.target.value))}
                className="w-full accent-amber-500"
                disabled={missionOut}
                data-testid="shift-slider"
                aria-label="Shift length in hours"
              />
              <motion.span
                key={hours}
                initial={{ scale: 0.9, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={snappy}
                className="font-display w-16 shrink-0 text-right text-2xl font-bold text-amber-400 tabular-nums"
                data-testid="shift-hours"
              >
                {hours}h
              </motion.span>
            </div>
          </label>

          <p className="text-parchment-500/72 mt-4 text-sm leading-relaxed">
            The watch pays by the hour and asks nothing of your Vigor. It is the worse rate — about
            half what the same time on the road would earn — but it runs while the tab is shut, and
            you can walk off it whenever you like. You are paid for the minutes you actually served.
          </p>
        </div>

        {/* The promise. Comes from the same function the payout does. */}
        <div
          className="chamfer-sm border-parchment-500/15 bg-wood-900/60 border p-4"
          data-testid="shift-preview"
        >
          <p className="text-parchment-500/72 mb-3 text-[10px] tracking-[0.25em] uppercase">
            On completion
          </p>
          <dl className="space-y-2">
            <div className="flex items-center justify-between">
              <dt className="text-parchment-500/72 flex items-center gap-2 text-sm">
                <CoinIcon size={14} />
                Gold
              </dt>
              <dd className="font-display text-parchment-300 text-lg font-bold tabular-nums">
                {preview.gold.toLocaleString()}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-parchment-500/72 flex items-center gap-2 text-sm">
                <SparkIcon size={14} />
                Experience
              </dt>
              <dd className="font-display text-parchment-300 text-lg font-bold tabular-nums">
                {preview.xp.toLocaleString()}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            {confirming ? (
              <div className="space-y-2" data-testid="off-duty-confirm">
                <p className="text-parchment-300/80 text-xs leading-snug">
                  You still have {Math.floor(vigor)} Vigor. Missions pay far better.
                </p>
                <div className="flex gap-2">
                  <ActionButton size="sm" onClick={() => onStart(true)} data-testid="confirm-shift">
                    Take the shift anyway
                  </ActionButton>
                  <ActionButton size="sm" variant="ghost" onClick={onCancelConfirm}>
                    Never mind
                  </ActionButton>
                </div>
              </div>
            ) : (
              <ActionButton
                fullWidth
                onClick={() => onStart()}
                {...(missionOut
                  ? { disabledReason: 'Your hero is out on a job. Only one at a time.' }
                  : {})}
                data-testid="start-shift"
              >
                Report for duty
              </ActionButton>
            )}
          </div>
        </div>
      </div>
    </TavernPanel>
  );
}

/** On the beat: a countdown, a lantern doing the rounds, and a way off. */
function OnDuty({
  shift,
  now,
  onCollect,
}: {
  shift: PatrolShift;
  now: number;
  onCollect: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const progress = shiftProgress(shift, now);
  const remaining = msRemaining(shift, now);
  const done = remaining <= 0;
  const earned = patrolEarnings(shift, now, xpNeeded(shift.heroLevel));

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={dramatic}
      className="chamfer-md edge-etched-strong bg-wood-800/94 overflow-hidden border border-amber-500/30"
      data-testid="patrol-on-duty"
      data-complete={done ? 'true' : 'false'}
    >
      <div className="relative h-40">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/assets/backgrounds/patrol_background.webp')" }}
        />
        <div
          aria-hidden
          className="from-wood-900 via-wood-900/40 absolute inset-0 bg-gradient-to-t to-transparent"
        />

        {/* The lantern walking the wall. */}
        <div className="absolute right-8 bottom-8 left-8">
          <div className="bg-wood-900/70 relative h-[2px] w-full">
            <div
              className="h-full bg-amber-500/70"
              style={{ width: `${progress * 100}%` }}
              data-testid="patrol-route"
            />
            <motion.span
              className="absolute -top-[13px] block text-amber-400 drop-shadow-[0_2px_6px_rgb(0_0_0/0.9)]"
              style={{ left: `${progress * 100}%` }}
              animate={reduceMotion ? {} : { opacity: [1, 0.55, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <span className="-ml-2 block">
                <PatrolIcon size={18} />
              </span>
            </motion.span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-6 px-6 py-5">
        <div>
          <p className="text-parchment-500/72 text-[10px] tracking-[0.25em] uppercase">
            {done ? 'Shift complete' : 'On the beat'}
          </p>
          <p
            className="font-display text-parchment-300 text-3xl font-bold tabular-nums"
            data-testid="patrol-remaining"
          >
            {done ? 'Ready to sign off' : formatRemaining(remaining)}
          </p>
          <p className="text-parchment-500/72 mt-1 text-xs">
            {shift.hours}-hour shift · earned so far {earned.gold.toLocaleString()} gold,{' '}
            {earned.xp.toLocaleString()} XP
          </p>
        </div>

        <ActionButton
          size={done ? 'lg' : 'md'}
          variant={done ? 'primary' : 'secondary'}
          onClick={onCollect}
          data-testid="collect-shift"
        >
          {done ? 'Collect pay' : 'Clock off early'}
        </ActionButton>
      </div>
    </motion.section>
  );
}
