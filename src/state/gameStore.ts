/**
 * The game store — Zustand slice holding the loaded save plus the autosave lifecycle.
 *
 * Phase 0 carries only the walking-skeleton payload; the hero / activity / world slices
 * arrive from Phase 2 onward (docs/tech/architecture.md §3). What is already real here is
 * the shape of the lifecycle every later slice will use: hydrate → mutate → debounced
 * autosave → flush on page hide.
 */

'use client';

import { create } from 'zustand';
import { createNewSave, type SaveFile, type SaveSlot, type Settings } from '@/engine/save/schema';
import { clockSnapshot, gameNow, resetClockForTests, restoreClock } from './clock';
import { readSave, writeSave } from './persistence';

/** Autosave debounce; also flushed immediately when the page is hidden. */
const AUTOSAVE_DELAY_MS = 5_000;

/**
 * A fresh world seed. Not gameplay randomness (which must be seeded and replayable) but
 * the one-time roll that *creates* the seed, so the platform CSPRNG is the right source.
 */
function newWorldSeed(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0]! >>> 0;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let hidingListenerAttached = false;

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface GameStoreState {
  status: StoreStatus;
  slot: SaveSlot;
  save: SaveFile | null;
  /** Non-fatal thing worth telling the player (recovered backup, upgraded format). */
  notice: string | null;
  /** Fatal load problem, already phrased for humans. */
  error: string | null;
  lastSavedAt: number | null;
  /**
   * True while a write is in flight. Local-first games owe the player a visible answer to
   * "is my progress stored?", and it gives tests a deterministic signal to wait on.
   */
  isSaving: boolean;
  /** Set when a save could not be written (quota, private mode, storage evicted). */
  saveError: string | null;

  hydrate: (slot?: SaveSlot) => Promise<void>;
  knock: () => void;
  startOver: () => Promise<void>;
  flush: () => Promise<void>;
  dismissNotice: () => void;
  /** Persist changed player preferences. No-op when nothing actually changed. */
  applySettings: (settings: Settings) => void;
}

export const useGameStore = create<GameStoreState>((set, get) => {
  const persistNow = async (): Promise<void> => {
    const { save } = get();
    if (!save) return;

    const stamped: SaveFile = {
      ...save,
      savedAt: gameNow(),
      clock: clockSnapshot(),
    };

    set({ isSaving: true });
    try {
      await writeSave(stamped);
      set({ save: stamped, lastSavedAt: stamped.savedAt, isSaving: false, saveError: null });
    } catch (cause) {
      set({
        isSaving: false,
        saveError: 'Your progress could not be saved to this browser’s storage.',
      });
      console.error('[TavernRPG] save failed', cause);
    }
  };

  const scheduleAutosave = (): void => {
    if (typeof window === 'undefined') return;

    if (autosaveTimer !== null) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      void persistNow();
    }, AUTOSAVE_DELAY_MS);

    if (!hidingListenerAttached) {
      hidingListenerAttached = true;
      // A closing tab gets one last write — never lose a session to a debounce window.
      window.addEventListener('pagehide', () => void persistNow());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void persistNow();
      });
    }
  };

  return {
    status: 'idle',
    slot: 1,
    save: null,
    notice: null,
    error: null,
    lastSavedAt: null,
    isSaving: false,
    saveError: null,

    async hydrate(slot = 1) {
      set({ status: 'loading', slot, error: null, notice: null });

      try {
        const result = await readSave(slot);

        if (result.status === 'failed') {
          set({ status: 'failed', error: result.message, save: null });
          return;
        }

        if (result.status === 'empty') {
          const fresh = createNewSave({ slot, worldSeed: newWorldSeed(), now: gameNow() });
          restoreClock(fresh.clock);
          set({ status: 'ready', save: fresh, isSaving: true });
          await writeSave(fresh);
          set({ lastSavedAt: fresh.savedAt, isSaving: false });
          return;
        }

        // Resume the clock from the save so a rewound device clock cannot rewind progress.
        restoreClock(result.save.clock);
        const notices: string[] = [];
        if (result.recoveredFromBackup) {
          notices.push('Your last save was damaged, so the previous one was restored.');
        }
        if (result.migratedFrom !== null) {
          notices.push(`Save upgraded from format ${result.migratedFrom}.`);
        }

        set({
          status: 'ready',
          save: result.save,
          lastSavedAt: result.save.savedAt,
          notice: notices.length > 0 ? notices.join(' ') : null,
        });
      } catch (cause) {
        set({
          status: 'failed',
          error: 'The game could not open its save storage in this browser.',
          save: null,
        });
        console.error('[TavernRPG] hydrate failed', cause);
      }
    },

    knock() {
      const { save } = get();
      if (!save) return;

      const now = gameNow();
      set({
        save: {
          ...save,
          skeleton: {
            ...save.skeleton,
            doorKnocks: save.skeleton.doorKnocks + 1,
            lastKnockAt: now,
          },
        },
      });
      scheduleAutosave();
    },

    async startOver() {
      const { slot } = get();
      if (autosaveTimer !== null) {
        // Drop any queued write for the world being discarded.
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }

      const fresh = createNewSave({ slot, worldSeed: newWorldSeed(), now: gameNow() });
      restoreClock(fresh.clock);
      set({ status: 'ready', save: fresh, notice: null, error: null, isSaving: true });
      await writeSave(fresh);
      set({ lastSavedAt: fresh.savedAt, isSaving: false, saveError: null });
    },

    async flush() {
      if (autosaveTimer !== null) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      await persistNow();
    },

    dismissNotice() {
      set({ notice: null });
    },

    applySettings(settings) {
      const { save } = get();
      if (!save) return;

      const unchanged = (Object.keys(settings) as (keyof Settings)[]).every(
        (key) => save.settings[key] === settings[key],
      );
      if (unchanged) return;

      set({ save: { ...save, settings } });
      // Preferences write straight through rather than waiting out the autosave debounce:
      // they are tiny, they change rarely, and losing one to a quick reload feels broken.
      void persistNow();
    },
  };
});

/** Test seam: drops module-scoped clock/timer state between cases. */
export function resetGameStoreForTests(): void {
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  resetClockForTests();
  useGameStore.setState({
    status: 'idle',
    slot: 1,
    save: null,
    notice: null,
    error: null,
    lastSavedAt: null,
    isSaving: false,
    saveError: null,
  });
}
