'use client';

/**
 * Export and import, which Settings has been promising since Phase 1 (USER_QUESTIONS Q1).
 *
 * There are no accounts and no cloud, by design — a save lives in this browser's IndexedDB and
 * nowhere else. That makes a file the *only* way to move a hero to another machine, and the only
 * insurance against a cleared browser. It is not a power-user feature; it is the backup story.
 *
 * **Import reads the file before it offers to use it.** The confirm names the hero, their level
 * and when the file was written, next to the same three facts about the save being replaced,
 * because "are you sure?" is not a question anybody can answer. A file that is not a TavernRPG
 * save is refused with the migration chain's own sentence — the same one the triage screen shows —
 * rather than a throw or a shrug.
 */

import { useRef, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { useGameStore } from '@/state/gameStore';
import { migrateSave } from '@/engine/save/migrations';
import type { SaveFile } from '@/engine/save/schema';
import { play } from '@/state/sfx';

/** A save, described in the three facts that tell a player which one it is. */
function describe(save: SaveFile | null): string {
  if (!save) return 'an empty slot';
  const who = save.hero ? `${save.hero.name}, level ${save.hero.level}` : 'no hero yet';
  const when = new Date(save.savedAt).toLocaleString();
  return `${who} · saved ${when}`;
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

interface Pending {
  readonly text: string;
  readonly incoming: SaveFile;
}

export function SavePanel() {
  const save = useGameStore((state) => state.save);
  const slot = useGameStore((state) => state.slot);
  const exportCurrentSave = useGameStore((state) => state.exportCurrentSave);
  const importIntoSlot = useGameStore((state) => state.importIntoSlot);

  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readFile = async (file: File) => {
    setMessage(null);
    const text = await file.text();

    /*
     * Validate here, in the browser, before anything is written.
     *
     * `importSave` would refuse a bad file too, but it writes on success — so asking it first
     * would mean the only way to preview an import is to perform it. `migrateSave` is pure and
     * says the same thing without touching the disk.
     */
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setMessage('That file is not readable as a save.');
      play('refuse');
      return;
    }

    const result = migrateSave(parsed);
    if (!result.ok) {
      setMessage(
        result.failure.kind === 'from_future'
          ? 'That save was written by a newer version of the game than this one.'
          : 'That file is not a TavernRPG save, or it is damaged.',
      );
      play('refuse');
      return;
    }

    play('panel');
    setPending({ text, incoming: result.save });
  };

  return (
    <>
      <div
        className="border-parchment-500/10 flex items-start justify-between gap-6 border-b py-3.5"
        data-testid="row-export"
      >
        <div className="min-w-0">
          <p className="text-parchment-300 text-sm">Export this save</p>
          <p className="text-parchment-500/72 mt-0.5 text-xs leading-snug">
            A file you can keep or carry to another browser. There is no cloud — this is the only
            copy that survives clearing your browsing data.
          </p>
        </div>
        <ActionButton
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void exportCurrentSave()
              .then((text) => {
                if (!text) {
                  setMessage('Nothing to export from this slot yet.');
                  return;
                }
                const who = save?.hero?.name.toLowerCase().replace(/\W+/g, '-') ?? 'hero';
                download(`tavernrpg-${who}-slot${slot}.json`, text);
                play('coin');
              })
              .finally(() => setBusy(false));
          }}
          data-testid="export-save"
        >
          Export
        </ActionButton>
      </div>

      <div
        className="border-parchment-500/10 flex items-start justify-between gap-6 border-b py-3.5 last:border-b-0"
        data-testid="row-import"
      >
        <div className="min-w-0">
          <p className="text-parchment-300 text-sm">Import a save</p>
          <p className="text-parchment-500/72 mt-0.5 text-xs leading-snug">
            Replaces what is in this slot. You will be shown both saves before anything changes.
          </p>
        </div>
        <ActionButton
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          data-testid="import-save"
        >
          Choose a file
        </ActionButton>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear the input so choosing the same file twice still fires a change.
            event.target.value = '';
            if (file) void readFile(file);
          }}
          data-testid="import-file"
        />
      </div>

      {message && (
        <p className="text-blood-400 pt-3 text-xs leading-relaxed" data-testid="save-message">
          {message}
        </p>
      )}

      {pending && (
        <div
          className="chamfer-sm border-parchment-500/25 bg-wood-900/70 mt-4 border px-4 py-3"
          data-testid="import-confirm"
        >
          <p className="font-display text-parchment-300 text-xs tracking-[0.18em] uppercase">
            Replace this slot?
          </p>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex gap-2">
              <dt className="text-parchment-500/72 w-20 shrink-0">Replacing</dt>
              <dd className="text-parchment-300" data-testid="import-outgoing">
                {describe(save)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-parchment-500/72 w-20 shrink-0">With</dt>
              <dd className="text-parchment-300" data-testid="import-incoming">
                {describe(pending.incoming)}
              </dd>
            </div>
          </dl>

          <p className="text-parchment-500/72 mt-2 text-xs leading-snug">
            Export the current save first if you want to keep it — this cannot be undone from here.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <ActionButton
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void importIntoSlot(pending.text)
                  .then((result) => {
                    setPending(null);
                    setMessage(result.message);
                    play(result.ok ? 'unlock' : 'refuse');
                  })
                  .finally(() => setBusy(false));
              }}
              data-testid="import-confirm-yes"
            >
              Replace it
            </ActionButton>
            <ActionButton
              size="sm"
              variant="secondary"
              onClick={() => setPending(null)}
              data-testid="import-confirm-no"
            >
              Keep what I have
            </ActionButton>
          </div>
        </div>
      )}
    </>
  );
}
