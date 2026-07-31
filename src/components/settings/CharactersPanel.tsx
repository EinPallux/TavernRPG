'use client';

/**
 * Three characters, and a door out of the one you are in (architecture.md §3, USER_QUESTIONS Q2).
 *
 * The save layer has had three slots since Phase 0 — `SAVE_SLOTS`, `readSave(slot)`,
 * `deleteSave(slot)`, even a `listSlots` slot-picker helper — and the shell hydrated slot 1 on
 * every load, so two thirds of it was unreachable. Nothing here is new plumbing; this is the room
 * the plumbing was always for.
 *
 * **A slot is a character, not a file.** Opening an empty slot writes an envelope before anybody
 * has been made, so "there are bytes here" and "there is a hero here" are different questions and
 * the player only cares about the second. An occupied-but-heroless slot reads as empty and offers
 * to make somebody, which is what it is.
 *
 * **Leaving flushes.** Switching is the one moment where losing the last thing you did would be
 * unforgivable and invisible, so the store awaits a real write before it opens another slot.
 *
 * **Deleting says the name.** "Are you sure?" is not a question anybody can answer; "Delete
 * Ysolde, level 12?" is. There is no undo and the panel says so, next to the export button that
 * is the actual undo.
 */

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Icon } from '@/components/icons';
import { classDef } from '@/data/classes';
import { SAVE_SLOTS, type SaveSlot } from '@/engine/save/schema';
import { useGameStore } from '@/state/gameStore';
import { listSlots, type SlotSummary } from '@/state/persistence';
import { play } from '@/state/sfx';
import { listItemIn, standard } from '@/styles/motion';

/** When a character was last put down, in words rather than a timestamp. */
function lastPlayed(savedAt: number | null, now: number): string {
  if (savedAt === null) return '';
  const minutes = Math.max(0, Math.round((now - savedAt) / 60_000));
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function CharactersPanel() {
  const activeSlot = useGameStore((state) => state.slot);
  const save = useGameStore((state) => state.save);
  const status = useGameStore((state) => state.status);
  const switchSlot = useGameStore((state) => state.switchSlot);
  const deleteSlot = useGameStore((state) => state.deleteSlot);

  const [slots, setSlots] = useState<SlotSummary[] | null>(null);
  const [confirming, setConfirming] = useState<SaveSlot | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * Re-read on every change to the live save rather than once on mount.
   *
   * The panel is a view of the disk, and the disk moves underneath it — the active hero levels up
   * while this is on screen, a switch rewrites which slot is which. Keying the refresh on
   * `savedAt` means the shelf is never describing a session two actions old.
   */
  const refresh = useCallback(() => {
    void listSlots().then(setSlots);
  }, []);
  useEffect(refresh, [refresh, activeSlot, save?.savedAt, status]);

  const now = save?.savedAt ?? 0;

  const enter = async (slot: SaveSlot) => {
    setBusy(true);
    play('panel');
    try {
      await switchSlot(slot);
    } finally {
      setBusy(false);
    }
  };

  const destroy = async (slot: SaveSlot) => {
    setBusy(true);
    try {
      await deleteSlot(slot);
      setConfirming(null);
      /*
       * Re-read explicitly, because the effect above cannot see this.
       *
       * It watches the *active* save — the slot, its `savedAt`, the load status — and deleting a
       * character you are not playing moves none of them. The shelf went on showing a hero who
       * no longer existed until something else happened to nudge it. An effect keyed on one
       * record is blind to a change in a sibling; the code that performed the change has to say
       * so.
       */
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="characters-panel">
      <p className="text-parchment-500/72 text-xs leading-relaxed">
        Three heroes can live in this browser at once. Their days, their ladders and their worlds
        are entirely separate — switching puts one down where they stand and picks another up.
      </p>

      <motion.ul initial="hidden" animate="visible" className="mt-3 space-y-2">
        {SAVE_SLOTS.map((slot) => {
          const summary = slots?.find((entry) => entry.slot === slot);
          const isActive = slot === activeSlot;
          // The live store is ahead of the disk for the slot being played: a hero made a second
          // ago is in `save` before `listSlots` has been asked again.
          const hero = isActive ? (save?.hero ?? null) : (summary?.hero ?? null);
          const broken = summary?.broken ?? false;

          return (
            <motion.li
              key={slot}
              variants={listItemIn}
              transition={standard}
              className={`chamfer-sm flex items-center gap-3 border px-3 py-2.5 ${
                isActive
                  ? 'border-amber-400 bg-amber-500/10'
                  : 'border-parchment-500/15 bg-wood-900/50'
              }`}
              data-testid={`slot-${slot}`}
              data-active={isActive ? 'true' : 'false'}
              data-occupied={hero ? 'true' : 'false'}
            >
              <span
                className={`chamfer-sm grid h-9 w-9 shrink-0 place-items-center border text-xs font-bold ${
                  isActive
                    ? 'border-amber-400 text-amber-400'
                    : 'border-parchment-500/25 text-parchment-500/72'
                }`}
                aria-hidden
              >
                {slot}
              </span>

              <div className="min-w-0 flex-1">
                {broken ? (
                  <>
                    <p className="text-blood-400 text-sm font-semibold">Will not open</p>
                    <p className="text-parchment-500/72 text-[11px] leading-snug">
                      Enter the slot to export the raw data or set it aside — nothing is deleted for
                      you.
                    </p>
                  </>
                ) : hero ? (
                  <>
                    <p className="text-parchment-300 truncate text-sm font-semibold">{hero.name}</p>
                    <p className="text-parchment-500/72 text-[11px]">
                      Level {hero.level} {classDef(hero.classId).name}
                      {summary?.savedAt && !isActive
                        ? ` · last played ${lastPlayed(summary.savedAt, now)}`
                        : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-parchment-500/72 text-sm">Empty</p>
                    <p className="text-parchment-500/72 text-[11px]">
                      Room for another hero, from any class.
                    </p>
                  </>
                )}
              </div>

              {isActive ? (
                <span
                  className="chamfer-sm shrink-0 border border-amber-400/60 px-2 py-1 text-[10px] tracking-[0.18em] text-amber-400 uppercase"
                  data-testid={`slot-${slot}-here`}
                >
                  Playing
                </span>
              ) : (
                <ActionButton
                  size="sm"
                  variant={hero ? 'primary' : 'secondary'}
                  disabled={busy}
                  onClick={() => void enter(slot)}
                  data-testid={`slot-${slot}-enter`}
                >
                  {hero ? 'Play' : 'Create'}
                </ActionButton>
              )}

              {(hero || broken) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(confirming === slot ? null : slot)}
                  className="text-parchment-500/72 hover:text-blood-400 shrink-0 p-1 transition-colors disabled:opacity-40"
                  title={`Delete slot ${slot}`}
                  aria-label={`Delete slot ${slot}`}
                  data-testid={`slot-${slot}-delete`}
                >
                  <Icon name="scrap" size={15} />
                </button>
              )}
            </motion.li>
          );
        })}
      </motion.ul>

      {/* The confirm expands under the shelf rather than covering it: the thing being destroyed
          and the question about it belong on screen together. */}
      <AnimatePresence>
        {confirming !== null && (
          <motion.div
            /*
             * Keyed on the panel, not on the slot — style guide §7.1, learned the hard way one
             * commit earlier and re-learned here. `confirming` as the key makes moving the
             * question from one hero to another an exit plus an entrance, and `AnimatePresence`
             * keeps the outgoing one mounted: two "Delete for good" buttons on screen, the stale
             * one disabled and first in the DOM. There is only ever one confirm; it just changes
             * what it is asking about.
             */
            key="delete-confirm"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={standard}
            className="overflow-hidden"
          >
            <div
              className="chamfer-sm border-blood-400/40 bg-wood-900/70 mt-3 border px-4 py-3"
              data-testid="delete-confirm"
            >
              <p className="text-parchment-300 text-xs leading-snug">
                Delete{' '}
                <span className="font-semibold">
                  {(() => {
                    const summary = slots?.find((entry) => entry.slot === confirming);
                    const hero = confirming === activeSlot ? (save?.hero ?? null) : summary?.hero;
                    return hero
                      ? `${hero.name}, level ${hero.level}`
                      : `whatever is in slot ${confirming}`;
                  })()}
                </span>
                ? This cannot be undone, and there is no cloud copy — export the save first if you
                might want them back.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <ActionButton
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => void destroy(confirming)}
                  data-testid="delete-confirm-yes"
                >
                  Delete for good
                </ActionButton>
                <ActionButton
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setConfirming(null)}
                  data-testid="delete-confirm-no"
                >
                  Keep them
                </ActionButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
