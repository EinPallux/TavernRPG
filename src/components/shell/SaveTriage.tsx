'use client';

/**
 * What a player sees when their save will not open (architecture.md §3, §7).
 *
 * The load path has been careful about this since Phase 0 — writes rotate the previous good save
 * into a backup key, a damaged main copy silently falls back to it, and `migrateSave` returns a
 * *typed* failure with a human sentence rather than throwing. Every one of those was correct and
 * none of it was ever rendered: `status: 'failed'` reached the store and the shell drew the rail,
 * the HUD and an empty room. The last mile of a recovery story is the only part the player sees.
 *
 * The order of the buttons is the whole design:
 *
 * 1. **Keep a copy** comes first, and is the only one that is not destructive. A save the game
 *    cannot read is not a save that is worthless — a bad byte in one slice leaves the other
 *    seventeen intact, and a later version may open what this one cannot. The bytes go out
 *    unparsed and unmigrated, so whatever went wrong reaches the copy intact.
 * 2. **Start again** archives rather than deletes. There is no button here that destroys
 *    anything, which is why neither of them needs a scary confirm.
 *
 * No keeper speaks on this screen. Marla is a character in a game the player cannot currently
 * reach, and putting a joke in front of somebody who may have just lost a level-fifty hero is the
 * wrong instinct.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { ActionButton } from '@/components/ui/ActionButton';
import { useGameStore } from '@/state/gameStore';
import { standard } from '@/styles/motion';

/** Hand the player a file. Nothing is uploaded; the bytes never leave the machine. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function SaveTriage() {
  const error = useGameStore((state) => state.error);
  const slot = useGameStore((state) => state.slot);
  const exportRawSave = useGameStore((state) => state.exportRawSave);
  const archiveAndStartOver = useGameStore((state) => state.archiveAndStartOver);

  const [kept, setKept] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={standard}
      className="bg-wood-900 grid h-full w-full place-items-center px-8"
      data-testid="save-triage"
    >
      <div className="chamfer-md surface-timber bg-wood-800/96 edge-etched max-w-xl border-l-2 border-l-amber-500 px-7 py-6">
        <p className="font-display text-xs tracking-[0.32em] text-amber-500 uppercase">
          Emberhollow
        </p>
        <h1 className="font-display text-parchment-300 mt-1 text-3xl font-extrabold">
          This save would not open
        </h1>

        <p className="text-parchment-500/72 mt-4 text-sm leading-relaxed" data-testid="triage-why">
          {error ?? 'Something in the file did not match the shape the game expects.'}
        </p>
        <p className="text-parchment-500/72 mt-2 text-sm leading-relaxed">
          The previous save was tried as well, and could not be read either — the game keeps one
          spare copy behind every write, and both are damaged. Nothing has been deleted.
        </p>

        <div className="facet-rule my-5" />

        <div className="space-y-4">
          <div>
            <ActionButton
              onClick={() => {
                setBusy(true);
                void exportRawSave()
                  .then((text) => {
                    if (text) download(`tavernrpg-slot${slot}-damaged.json`, text);
                    setKept(text !== null);
                  })
                  .finally(() => setBusy(false));
              }}
              data-testid="triage-export"
            >
              Keep a copy of the file
            </ActionButton>
            <p className="text-parchment-500/72 mt-1.5 text-xs leading-snug">
              {kept
                ? 'Saved. Hold on to it — a later version of the game may be able to read it.'
                : 'Downloads exactly what is on disk, unrepaired. Worth doing before anything else.'}
            </p>
          </div>

          <div>
            <ActionButton
              variant="danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void archiveAndStartOver().finally(() => setBusy(false));
              }}
              data-testid="triage-restart"
            >
              Start again in this slot
            </ActionButton>
            <p className="text-parchment-500/72 mt-1.5 text-xs leading-snug">
              The damaged save is moved aside under a dated key rather than removed, so it is still
              there if a fix arrives.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
