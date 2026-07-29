/**
 * The game store — Zustand slice holding the loaded save plus the autosave lifecycle.
 *
 * Deliberately thin: every rule about what a hero may do lives in `@/engine/hero/actions` as
 * pure functions, and this store only applies them and schedules the write. Activity and world
 * slices join the same lifecycle in later phases (docs/tech/architecture.md §3).
 */

'use client';

import { create } from 'zustand';
import {
  createNewSave,
  type Hero,
  type SaveFile,
  type SaveSlot,
  type Settings,
} from '@/engine/save/schema';
import {
  addItem as addItemToHero,
  createHero,
  discardItem as discardFromHero,
  equipItem as equipOnHero,
  toggleLock as toggleLockOnHero,
  trainAttribute as trainOnHero,
  unequipItem as unequipFromHero,
} from '@/engine/hero/actions';
import { applyXp } from '@/engine/progression/xp';
import type { AttributeId } from '@/engine/progression/stats';
import type { ClassId, Item, SlotId } from '@/engine/items/types';
import { clockSnapshot, gameNow, resetClockForTests, restoreClock } from './clock';
import { readSave, writeSave } from './persistence';

/**
 * A fresh world seed. Not gameplay randomness (which must be seeded and replayable) but
 * the one-time roll that *creates* the seed, so the platform CSPRNG is the right source.
 */
function newWorldSeed(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0]! >>> 0;
}

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
  startOver: () => Promise<void>;

  /** Creation. Writes through immediately — nobody should lose a new hero to a debounce. */
  createHero: (name: string, classId: ClassId) => Promise<void>;
  equipItem: (item: Item) => void;
  unequipItem: (slot: SlotId) => void;
  trainAttribute: (attribute: AttributeId, count: number) => void;
  toggleItemLock: (uid: string) => void;
  discardItem: (uid: string) => void;
  /** Grants an item into the bags (dev tools now; loot sources from Phase 5). */
  grantItem: (item: Item) => void;
  /** Award experience, levelling as far as it carries. Missions call this from Phase 5. */
  grantXp: (amount: number) => void;
  /** Award gold. Same story: dev tools now, real faucets later. */
  grantGold: (amount: number) => void;
  flush: () => Promise<void>;
  dismissNotice: () => void;
  /** Persist changed player preferences. No-op when nothing actually changed. */
  applySettings: (settings: Settings) => void;
  /**
   * Remember the battle playback speed the player settled on (combat spec §4 step 5). Its own
   * action rather than a full `applySettings` because the battle scene fires it mid-fight and
   * should never race a settings screen writing the other keys.
   */
  setBattleSpeed: (speed: Settings['battleSpeed']) => void;
}

export const useGameStore = create<GameStoreState>((set, get) => {
  /**
   * Write-ordering guard. Writes are fired off without awaiting, so two can overlap — the
   * classic hazard is an older write finishing last and writing its stale snapshot back into
   * the store, resurrecting state the player already moved past. Only the newest write is
   * allowed to touch state when it lands, and it merges *metadata* onto whatever the current
   * save is rather than replacing it with its own snapshot.
   */
  let writeSequence = 0;

  const persistNow = async (): Promise<void> => {
    const { save } = get();
    if (!save) return;

    const stamped: SaveFile = {
      ...save,
      savedAt: gameNow(),
      clock: clockSnapshot(),
    };

    const sequence = (writeSequence += 1);
    set({ isSaving: true });

    try {
      await writeSave(stamped);
      if (sequence !== writeSequence) return; // superseded; the newer write owns the state

      const current = get().save;
      set({
        ...(current
          ? { save: { ...current, savedAt: stamped.savedAt, clock: stamped.clock } }
          : {}),
        lastSavedAt: stamped.savedAt,
        isSaving: false,
        saveError: null,
      });
    } catch (cause) {
      if (sequence !== writeSequence) return;
      set({
        isSaving: false,
        saveError: 'Your progress could not be saved to this browser’s storage.',
      });
      console.error('[TavernRPG] save failed', cause);
    }
  };

  /**
   * Apply a pure hero transform and persist. No-op before a hero exists.
   *
   * Writes go straight through rather than through a debounce: every hero mutation is a
   * discrete, deliberate player action (equip this, buy that), and losing one to a reload a
   * second later reads as the game forgetting. Saves are small and clicks are human-paced, so
   * there is nothing to coalesce. A debounce returns when something writes on a timer.
   */
  const updateHero = (transform: (hero: Hero) => Hero): void => {
    const { save } = get();
    if (!save?.hero) return;

    const hero = transform(save.hero);
    if (hero === save.hero) return; // the transform refused; nothing to persist

    set({ save: { ...save, hero } });
    void persistNow();
  };

  /** One last write when the tab goes away, in case anything is still in flight. */
  const attachLifecycleListeners = (): void => {
    if (typeof window === 'undefined' || hidingListenerAttached) return;
    hidingListenerAttached = true;
    window.addEventListener('pagehide', () => void persistNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void persistNow();
    });
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
      attachLifecycleListeners();

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

    async createHero(name, classId) {
      const { save } = get();
      if (!save) return;

      const hero = createHero({ name, classId, now: gameNow() });
      set({ save: { ...save, hero } });
      await persistNow();
    },

    equipItem(item) {
      updateHero((hero) => equipOnHero(hero, item));
    },

    unequipItem(slot) {
      updateHero((hero) => unequipFromHero(hero, slot));
    },

    trainAttribute(attribute, count) {
      updateHero((hero) => trainOnHero(hero, attribute, count).hero);
    },

    toggleItemLock(uid) {
      updateHero((hero) => toggleLockOnHero(hero, uid));
    },

    discardItem(uid) {
      updateHero((hero) => discardFromHero(hero, uid));
    },

    grantItem(item) {
      updateHero((hero) => addItemToHero(hero, item).hero);
    },

    grantXp(amount) {
      updateHero((hero) => {
        const result = applyXp(hero.level, hero.xp, amount);
        return { ...hero, level: result.level, xp: result.xp };
      });
    },

    grantGold(amount) {
      updateHero((hero) => ({ ...hero, gold: Math.max(0, hero.gold + amount) }));
    },

    async startOver() {
      const { slot } = get();
      const fresh = createNewSave({ slot, worldSeed: newWorldSeed(), now: gameNow() });
      restoreClock(fresh.clock);
      set({ status: 'ready', save: fresh, notice: null, error: null, isSaving: true });
      await writeSave(fresh);
      set({ lastSavedAt: fresh.savedAt, isSaving: false, saveError: null });
    },

    async flush() {
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
      void persistNow();
    },

    setBattleSpeed(battleSpeed) {
      const { save } = get();
      if (!save || save.settings.battleSpeed === battleSpeed) return;

      set({ save: { ...save, settings: { ...save.settings, battleSpeed } } });
      void persistNow();
    },
  };
});

/** Test seam: drops module-scoped clock/timer state between cases. */
export function resetGameStoreForTests(): void {
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
