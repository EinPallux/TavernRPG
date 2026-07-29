'use client';

/**
 * Phase 0 walking skeleton — "the tavern door".
 *
 * This screen exists to prove the foundation end to end, not to look like the finished game:
 *   1. state mutates, autosaves to IndexedDB, and rehydrates identically after a reload
 *   2. the seeded RNG produces the same three dice for a given world seed, every time
 *   3. art, fonts, tokens and the chamfer system are wired and serving
 *
 * Phase 1 replaces it with the real app shell (nav rail, HUD, place routing).
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { createRng } from '@/engine/rng';
import { useGameStore } from '@/state/gameStore';

const EMBER_COUNT = 7;

function Ember({ index }: { index: number }) {
  const left = 8 + index * 13;
  return (
    <span
      aria-hidden
      className="animate-ember absolute bottom-24 block h-1.5 w-1.5 bg-amber-500/70"
      style={{
        left: `${left}%`,
        animationDelay: `${index * 0.7}s`,
        animationDuration: `${4.5 + (index % 3)}s`,
      }}
    />
  );
}

export function TavernDoor() {
  const {
    status,
    save,
    notice,
    error,
    isSaving,
    saveError,
    hydrate,
    knock,
    startOver,
    flush,
    dismissNotice,
  } = useGameStore();
  const [flushed, setFlushed] = useState(false);

  useEffect(() => {
    void hydrate(1);
  }, [hydrate]);

  const knocks = save?.skeleton.doorKnocks ?? 0;

  /**
   * Determinism, made visible: these three dice come from the save's world seed, so they
   * are identical on every reload — and different in a new world. The e2e test asserts it.
   */
  const dice = useMemo(() => {
    if (!save) return null;
    const rng = createRng(save.worldSeed, 'demo:door').fork('dice');
    return [rng.int(1, 6), rng.int(1, 6), rng.int(1, 6)];
  }, [save]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      {/* Stage backdrop: the Gilded Tankard itself. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/assets/backgrounds/tavern_background.png')" }}
      />
      <div
        aria-hidden
        className="animate-hearth from-wood-900 via-wood-900/70 to-wood-900/40 absolute inset-0 bg-gradient-to-t"
      />
      {Array.from({ length: EMBER_COUNT }, (_, index) => (
        <Ember key={index} index={index} />
      ))}

      <div className="relative flex min-h-screen items-center justify-center p-8">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="chamfer-lg bg-wood-800/95 w-full max-w-2xl border-2 border-amber-500/30 p-10 shadow-2xl"
        >
          <p className="font-display text-sm tracking-[0.35em] text-amber-500 uppercase">
            Aldenvale · Emberhollow
          </p>
          <h1 className="font-display text-parchment-300 mt-2 text-5xl font-extrabold">
            The Gilded Tankard
          </h1>
          <p className="text-parchment-500/80 mt-4 max-w-prose">
            The door is shut, the hearth is lit, and the tavern is not open for business yet — this
            is the Phase&nbsp;0 foundation. Knocking proves the game can remember you.
          </p>

          {status === 'loading' && (
            <p className="text-parchment-500/70 mt-8">Opening the ledger…</p>
          )}

          {status === 'failed' && (
            <p
              role="alert"
              className="chamfer-sm border-blood-600/60 bg-blood-600/15 text-parchment-300 mt-8 border p-4"
            >
              {error}
            </p>
          )}

          {status === 'ready' && save && (
            <>
              {notice && (
                <div className="chamfer-sm border-arcane-500/50 bg-arcane-500/10 mt-6 flex items-start justify-between gap-4 border p-3 text-sm">
                  <span>{notice}</span>
                  <button
                    type="button"
                    onClick={dismissNotice}
                    className="text-arcane-500 underline underline-offset-2"
                  >
                    dismiss
                  </button>
                </div>
              )}

              <div className="mt-8 flex items-end gap-8">
                <div>
                  <p className="font-display text-parchment-500/60 text-xs tracking-[0.25em] uppercase">
                    Knocks
                  </p>
                  <p
                    data-testid="knock-count"
                    className="font-display text-6xl leading-none font-bold text-amber-500"
                  >
                    {knocks}
                  </p>
                </div>

                <div>
                  <p className="font-display text-parchment-500/60 text-xs tracking-[0.25em] uppercase">
                    World seed
                  </p>
                  <p data-testid="world-seed" className="text-parchment-300 text-lg">
                    {save.worldSeed}
                  </p>
                </div>

                <div>
                  <p className="font-display text-parchment-500/60 text-xs tracking-[0.25em] uppercase">
                    Seeded dice
                  </p>
                  <p data-testid="seeded-dice" className="text-parchment-300 text-lg">
                    {dice?.join(' · ')}
                  </p>
                </div>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <motion.button
                  type="button"
                  data-testid="knock-button"
                  onClick={knock}
                  whileTap={{ scale: 0.97, y: 2 }}
                  className="chamfer-sm font-display text-ink-900 bg-amber-500 px-6 py-3 text-lg font-bold tracking-wide uppercase transition-colors hover:bg-amber-400"
                >
                  Knock on the door
                </motion.button>

                <button
                  type="button"
                  data-testid="save-button"
                  onClick={() => {
                    void flush().then(() => {
                      setFlushed(true);
                      setTimeout(() => setFlushed(false), 2000);
                    });
                  }}
                  className="chamfer-sm border-parchment-500/30 font-display text-parchment-300 border px-5 py-3 tracking-wide uppercase transition-colors hover:border-amber-500/60"
                >
                  {flushed ? 'Saved' : 'Save now'}
                </button>

                <button
                  type="button"
                  data-testid="reset-button"
                  onClick={() => void startOver()}
                  className="text-parchment-500/60 hover:text-blood-600 px-2 py-3 text-sm underline underline-offset-4 transition-colors"
                >
                  Start a new world
                </button>
              </div>

              <div className="border-parchment-500/15 mt-8 flex items-center justify-between gap-6 border-t pt-4 text-xs">
                <p className="text-parchment-500/50">
                  Knocks autosave after a few seconds, and immediately when you leave the page.
                  Reload — the count, the seed and the dice all come back exactly as they were.
                </p>
                <p
                  data-testid="save-status"
                  data-state={saveError ? 'error' : isSaving ? 'saving' : 'saved'}
                  className={
                    saveError
                      ? 'text-blood-600 shrink-0'
                      : isSaving
                        ? 'shrink-0 text-amber-500'
                        : 'text-moss-600 shrink-0'
                  }
                >
                  {saveError ? 'Not saved' : isSaving ? 'Saving…' : 'Saved'}
                </p>
              </div>

              {saveError && (
                <p role="alert" className="text-blood-600 mt-3 text-xs">
                  {saveError}
                </p>
              )}
            </>
          )}
        </motion.section>
      </div>
    </main>
  );
}
