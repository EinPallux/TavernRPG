'use client';

/**
 * Shell UI state — the frame around the game, not the game itself.
 *
 * Deliberately separate from `gameStore`: nothing here belongs in a save file except the
 * settings, which are mirrored into the save through `applySettings`. Toasts, the current
 * bark and the preview values are ephemeral by design.
 */

import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Settings } from '@/engine/save/schema';

export type ToastTone = 'info' | 'reward' | 'premium' | 'warning' | 'danger';

export interface Toast {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly tone: ToastTone;
}

export interface ToastInput {
  title: string;
  detail?: string;
  tone?: ToastTone;
  /** Auto-dismiss delay in ms; 0 keeps it until dismissed. */
  ttl?: number;
}

/**
 * Placeholder HUD values until the hero exists (Phase 2) and the economy runs (Phase 5–6).
 * Kept in one clearly-named object so it is obvious what is not yet real, and so the dev kit
 * can drive the shell through states the game cannot produce yet.
 */
export interface PreviewState {
  level: number;
  xp: number;
  xpForNext: number;
  gold: number;
  dice: number;
  vigor: number;
  vigorMax: number;
  /** Timestamp of an in-flight activity, or null. */
  activityEndsAt: number | null;
  activityLabel: string;
  mountExpiresAt: number | null;
}

/**
 * Level 10 opens every room in town. Until Phase 2 gives the shell a real hero to read, this
 * lets the whole town be walked and reviewed; drag the level down in `/dev/kit` to watch the
 * gates close again. Phase 2 replaces this whole object with the hero slice.
 */
export const DEFAULT_PREVIEW: PreviewState = {
  level: 10,
  xp: 0,
  xpForNext: 300,
  gold: 0,
  dice: 0,
  vigor: 100,
  vigorMax: 100,
  activityEndsAt: null,
  activityLabel: 'Mission',
  mountExpiresAt: null,
};

const PREVIEW_LEVEL_KEY = 'tavernrpg:dev:previewLevel';

/** Dev affordance: keep a hand-set level across navigations while driving the shell. */
function readStoredLevel(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(PREVIEW_LEVEL_KEY);
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function storeLevel(level: number): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PREVIEW_LEVEL_KEY, String(level));
}

let toastCounter = 0;

export interface ShellState {
  settings: Settings;
  toasts: Toast[];
  preview: PreviewState;
  /**
   * The beat whose spotlight the player has pushed aside, if any (tutorial spec §1).
   *
   * Ephemeral on purpose, and it stores the *beat id* rather than a boolean: pushing beat four
   * aside should not silence beat five. The tutorial's position is derived, so when the save
   * moves on this id stops matching and the overlay simply comes back.
   */
  spotlightHidden: string | null;

  setSettings: (patch: Partial<Settings>) => void;
  toggleNav: () => void;
  pushToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  setPreview: (patch: Partial<PreviewState>) => void;
  hideSpotlight: (beatId: string) => void;
  showSpotlight: () => void;
}

export const useShellStore = create<ShellState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  toasts: [],
  preview: { ...DEFAULT_PREVIEW, level: readStoredLevel() ?? DEFAULT_PREVIEW.level },
  spotlightHidden: null,

  setSettings(patch) {
    set({ settings: { ...get().settings, ...patch } });
  },

  toggleNav() {
    const { settings } = get();
    set({ settings: { ...settings, navCollapsed: !settings.navCollapsed } });
  },

  pushToast({ title, detail, tone = 'info', ttl = 5000 }) {
    toastCounter += 1;
    const id = `toast-${toastCounter}`;
    // Newest first: the stack renders top-down and shows the three most recent.
    set({ toasts: [{ id, title, ...(detail ? { detail } : {}), tone }, ...get().toasts] });

    if (ttl > 0 && typeof window !== 'undefined') {
      setTimeout(() => get().dismissToast(id), ttl);
    }
    return id;
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
  },

  clearToasts() {
    set({ toasts: [] });
  },

  setPreview(patch) {
    if (patch.level !== undefined) storeLevel(patch.level);
    set({ preview: { ...get().preview, ...patch } });
  },

  hideSpotlight(beatId) {
    set({ spotlightHidden: beatId });
  },

  showSpotlight() {
    set({ spotlightHidden: null });
  },
}));

/** Test seam. */
export function resetShellStoreForTests(): void {
  toastCounter = 0;
  useShellStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    toasts: [],
    preview: { ...DEFAULT_PREVIEW },
    spotlightHidden: null,
  });
}
