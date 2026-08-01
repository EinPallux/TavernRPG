'use client';

/**
 * The Notice Board (daily-loop spec §1–§2).
 *
 * The room the whole daily loop hangs off: three notices, a chest at a hundred points, a
 * seven-rung weekly ladder, and Marla's ledger beside them. Two faces rather than two rooms,
 * because they are the same question asked twice — *what is there to do today, and what does
 * turning up get me* — and splitting them across the rail would make the second one invisible.
 *
 * The screen owns no rules. The draw is `engine/board/tasks.ts`, the chests are quoted by the
 * same functions that pay them, and the ledger has already stamped itself inside the reset walk
 * before this component ever renders. It renders and it animates.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PLACES_BY_ID } from '@/data/places';
import { boardView } from '@/state/boardActions';
import { ledger } from '@/state/calendarActions';
import { currentDayKey } from '@/state/clock';
import { useGameStore } from '@/state/gameStore';
import { play } from '@/state/sfx';
import type { DailyChest, WeeklyChest } from '@/engine/board/chest';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { listItemIn, snappy, staggerChildren, standard } from '@/styles/motion';
import { ChestPanel } from './ChestPanel';
import { DayWorkTrack } from '@/components/ui/DayWorkTrack';
import { Ledger } from './Ledger';
import { TaskRow } from './TaskRow';

const PLACE = PLACES_BY_ID.board;

type Face = 'notices' | 'ledger';

const FACES: readonly { readonly id: Face; readonly label: string }[] = [
  { id: 'notices', label: 'Today’s notices' },
  { id: 'ledger', label: 'Marla’s ledger' },
];

export function BoardScreen() {
  const save = useGameStore((state) => state.save);
  const refreshDay = useGameStore((state) => state.refreshDay);
  const claimDailyChest = useGameStore((state) => state.claimDailyChest);
  const claimWeeklyChest = useGameStore((state) => state.claimWeeklyChest);

  const [face, setFace] = useState<Face>('notices');
  const [opened, setOpened] = useState<{ kind: 'daily'; chest: DailyChest } | null>(null);
  const [openedWeekly, setOpenedWeekly] = useState<{ kind: 'weekly'; chest: WeeklyChest } | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);

  // The board and the ledger are both day-shaped, so the day has to be current before either is
  // read — and `refreshDay` is what stamps the ledger, so this is also the arrival stamp.
  useEffect(() => {
    refreshDay();
  }, [refreshDay]);

  const today = currentDayKey();
  const view = useMemo(() => (save ? boardView(save, today) : null), [save, today]);
  const squares = useMemo(() => (save ? ledger(save, today) : []), [save, today]);

  const handleDaily = useCallback(() => {
    const result = claimDailyChest();
    if (!result.ok) {
      setMessage('Not yet — all three notices first.');
      play('refuse');
      return;
    }
    setMessage(null);
    setOpened({ kind: 'daily', chest: result.chest });
    play('coin');
  }, [claimDailyChest]);

  const handleWeekly = useCallback(() => {
    const result = claimWeeklyChest();
    if (!result.ok) {
      setMessage('The ladder wants all seven rungs.');
      play('refuse');
      return;
    }
    setMessage(null);
    setOpenedWeekly({ kind: 'weekly', chest: result.chest });
    // The week's chest pays Golden Dice, and the premium currency has its own three notes.
    play('dice');
  }, [claimWeeklyChest]);

  const clearBurst = useCallback(() => {
    setOpened(null);
    setOpenedWeekly(null);
  }, []);

  if (!save?.hero || !view) return null;

  return (
    <div className="relative h-full w-full" data-testid="place-board">
      <AmbientStage
        backdrop={PLACE.backdrop}
        {...(PLACE.tint ? { tint: PLACE.tint } : {})}
        {...(PLACE.effects ? { effects: PLACE.effects } : {})}
      >
        <div className="relative flex h-full flex-col overflow-hidden px-8 py-6">
          <header className="mb-4 flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
                Emberhollow
              </p>
              <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
                {PLACE.name}
              </h1>
            </div>

            {/* Two faces, one strip. Plain props rather than variants — an `exit` with no exit
                variant deadlocks `mode="wait"`, which cost an afternoon in Phase 12. */}
            <div className="flex gap-1" role="tablist" aria-label="Notice Board">
              {FACES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={face === entry.id}
                  onClick={() => setFace(entry.id)}
                  data-testid={`board-tab-${entry.id}`}
                  className={`font-display relative px-4 py-2 text-[13px] tracking-[0.12em] transition-colors ${
                    face === entry.id
                      ? 'text-amber-500'
                      : 'text-parchment-500/72 hover:text-parchment-300'
                  }`}
                >
                  {entry.label}
                  {face === entry.id && (
                    <motion.span
                      layoutId="board-face"
                      transition={snappy}
                      className="absolute inset-x-2 -bottom-0.5 h-[2px] bg-amber-500"
                    />
                  )}
                </button>
              ))}
            </div>
          </header>

          <AnimatePresence>
            {message && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={standard}
                className="chamfer-sm border-blood-600/40 bg-blood-600/12 text-parchment-300 mb-4 border px-3 py-2 text-sm"
                data-testid="board-message"
                onAnimationComplete={() => setTimeout(() => setMessage(null), 4_000)}
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <AnimatePresence mode="wait">
              {face === 'notices' ? (
                <motion.div
                  key="notices"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={standard}
                  className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
                >
                  {/* `exit="hidden"` is load-bearing. A variant tree inside an
                      `AnimatePresence mode="wait"` child has to have somewhere to exit *to*; with
                      no exit variant the children never finish leaving, the wait never resolves,
                      and the next face never mounts — a blank panel under a moved underline.
                      Phase 12 hit this from the other direction and it cost an afternoon. */}
                  <motion.ul
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    transition={staggerChildren(0.06)}
                    className="space-y-3"
                    data-testid="task-list"
                  >
                    {view.tasks.map((entry) => (
                      <TaskRow key={entry.task.definition.id} entry={entry} />
                    ))}
                    {view.tasks.length === 0 && (
                      <motion.li
                        variants={listItemIn}
                        className="chamfer-md border-parchment-500/10 bg-wood-900/45 text-parchment-500/72 border p-6 text-sm"
                      >
                        The board is bare. Marla will have something pinned up shortly.
                      </motion.li>
                    )}
                  </motion.ul>

                  <div className="space-y-5">
                    <ChestPanel
                      view={view}
                      opened={opened}
                      openedWeekly={openedWeekly}
                      onClaimDaily={handleDaily}
                      onClaimWeekly={handleWeekly}
                      onBurstDone={clearBurst}
                    />

                    {/* The board is the daily-loop screen, so the other daily dice belong on it —
                        the chest pays for finishing the notices, the track pays for the Vigor the
                        finishing took (balancing §18). */}
                    <TavernPanel title="The day’s work" data-testid="board-day-work">
                      <DayWorkTrack spent={save.activity.vigorSpentToday} />
                      <p className="text-parchment-500/72 mt-3 text-[11px] leading-relaxed">
                        Contracts and the Long Road both spend Vigor, and both fill this. Three dice
                        is the whole of it — the day cannot hold more, however long you play.
                      </p>
                    </TavernPanel>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="ledger"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={standard}
                  className="grid gap-5 xl:grid-cols-[minmax(0,40rem)_minmax(0,24rem)]"
                >
                  <Ledger
                    squares={squares}
                    cyclesCompleted={save.calendar.cyclesCompleted}
                    justStamped={null}
                  />

                  <TavernPanel title="How the ledger works">
                    <ul className="text-parchment-500/72 space-y-2 text-[11px] leading-relaxed">
                      <li>
                        <span className="text-parchment-300">It marks itself.</span> The first time
                        you open the game each day, Marla makes the mark. There is nothing to click
                        and nothing to miss by forgetting.
                      </li>
                      <li>
                        <span className="text-parchment-300">Absence pauses it.</span> Not a streak
                        — a count of days attended. A fortnight away costs you a fortnight of
                        squares, and nothing else.
                      </li>
                      <li>
                        <span className="text-parchment-300">Dice on 7, 14 and 21</span>, and the
                        twenty-eighth closes the ledger with an Epic and the Moss Tortoise. Then it
                        starts again.
                      </li>
                      <li className="text-parchment-500/72">
                        Gold on the ledger scales with your level, so a square is worth the same
                        share of a day’s work at forty as it was at four.
                      </li>
                    </ul>
                  </TavernPanel>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </AmbientStage>
    </div>
  );
}
