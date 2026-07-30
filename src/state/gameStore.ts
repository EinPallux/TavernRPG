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
  type StoredActiveMission,
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
import type { MissionDuration } from '@/engine/progression/rewards';
import { createRng, deriveSeed } from '@/engine/rng';
import {
  beginPatrol,
  collectPatrol,
  type PatrolCollection,
  type PatrolRefusalReason,
} from './patrolActions';
import {
  buyItem as buyFromShop,
  refreshShop,
  rerollShop,
  sellItem as sellToShop,
  type PurchaseResult,
  type SaleResult,
  type ShopRefusal,
} from './shopActions';
import { takeMount, type RentalResult, type StableRefusal } from './stableActions';
import type { ShopId } from '@/engine/shops/stock';
import type { MountId } from '@/data/mounts';
import {
  accept as acceptOffer,
  buyAle as buyAleOn,
  claimMission as claimOn,
  drinkAle as drinkAleOn,
  landMission as landOn,
  refreshDay,
  rerollBoard as rerollOn,
  skipTimer as skipOn,
  type ClaimResult,
  type MissionRefusal,
} from './missionActions';
import { catchUpWorld, ensureWorld } from './worldActions';
import {
  duel as duelWith,
  rankOfPlayer,
  refreshDraw,
  rerollDraw,
  skipCooldown,
  type ArenaRefusal,
  type DuelTransition,
} from './arenaActions';
import type { RaidResult } from '@/engine/arena/raids';
import type { WeeklyPayout } from '@/engine/arena/payout';
import type { AbsenceSummary } from '@/engine/world/crier';
import {
  clockSnapshot,
  currentDayKey,
  dayKeysBetween,
  gameNow,
  resetClockForTests,
  restoreClock,
} from './clock';
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

  // ── The core loop (Phase 5) ──────────────────────────────────────────────────────
  /**
   * Bring the save up to date with the clock and make sure today's board exists.
   * Every daily rule funnels through here; no screen checks the date itself.
   */
  refreshDay: () => void;
  acceptMission: (offerId: string, duration: MissionDuration) => MissionRefusal | null;
  rerollBoard: () => MissionRefusal | null;
  skipMissionTimer: () => MissionRefusal | null;
  /** Move a finished mission into "waiting to be watched". Idempotent. */
  landMission: () => void;
  /** Bank a watched mission and return what it paid, for the result screen. */
  claimMission: (mission: StoredActiveMission) => ClaimResult | null;
  buyAle: () => MissionRefusal | null;
  drinkAle: () => MissionRefusal | null;

  // ── City Watch (Phase 6) ─────────────────────────────────────────────────────────
  /** Clock on for a 1–12 hour shift. Returns the refusal, or null on success. */
  startPatrol: (hours: number) => PatrolRefusalReason | null;
  /** Clock off. Serves both "collect" and "cancel early"; the clock decides which. */
  collectPatrol: () => PatrolCollection | null;

  // ── Shops & Stables (Phase 7) ────────────────────────────────────────────────────
  /** Make sure the shop's shelf exists for today. Idempotent; draws lazily on first visit. */
  openShop: (shopId: ShopId) => void;
  buyStockItem: (shopId: ShopId, index: number, price: number) => PurchaseResult | ShopRefusal;
  /** Sell out of the bags. Both shops share the one `disposeItem` backend. */
  sellItem: (uid: string) => SaleResult | ShopRefusal;
  /** A fresh shelf for a Golden Die. No free one — unlike the mission board. */
  rerollShopStock: (shopId: ShopId) => ShopRefusal | null;
  /** Take a stall at the Stables. Returns the quote so the UI can report what it displaced. */
  rentMount: (mountId: MountId) => RentalResult | StableRefusal;

  // ── The simulated world (Phase 8) ────────────────────────────────────────────────
  /**
   * What the player missed, set once on load. Null for a short absence — a card saying
   * "while you were away (4 minutes)" is noise.
   */
  absenceSummary: AbsenceSummary | null;
  dismissAbsenceSummary: () => void;
  /** Advance the simulation to now. The online tick; also safe to call idly. */
  tickWorld: () => void;
  /** The attacks the player slept through, set alongside the absence card. */
  overnightRaids: RaidResult | null;

  // ── The Proving Grounds (Phase 9) ────────────────────────────────────────────────
  /** Make sure today's three opponents exist. Idempotent; draws lazily on first visit. */
  openArena: () => void;
  /** Fight one of them, or a revenge target. Returns the log for the scene to play. */
  fightOpponent: (opponentId: number) => DuelTransition | ArenaRefusal;
  /** A fresh three. Free once the cooldown has run out, a die before that. */
  rerollArenaDraw: () => ArenaRefusal | null;
  /** Buy past the cooldown: one die, three times a day. */
  skipArenaCooldown: () => ArenaRefusal | null;
  /** Dice paid out for weeks that closed while the player was away, for the Sunday card. */
  pendingPayouts: readonly WeeklyPayout[];
  dismissPayouts: () => void;
  /** Remember the rank the Hall of Fame was last opened at, for the "▲ 12" chip. */
  markLadderSeen: () => void;
}

export const useGameStore = create<GameStoreState>((set, get) => {
  /**
   * The autosave queue — **serialised and coalescing**.
   *
   * Writes used to be fired off in parallel with a sequence guard that stopped a stale one
   * writing its snapshot back into the store. That guarded the store but not the *disk*: an
   * older `put` could still land last, and once Phase 8's world took the save to ~145 KB it
   * regularly did. Nine `grantXp` calls in a loop produced nine overlapping writes and the
   * level that survived a reload was whichever one happened to finish last — measured at 5
   * instead of 10.
   *
   * So only one write runs at a time, and callers arriving mid-write set a dirty flag instead
   * of starting another. The drain loop re-reads `get().save` each pass, which means a burst of
   * twenty mutations costs two writes and the second one is always the newest state.
   */
  let writing = false;
  let dirty = false;
  let drain: Promise<void> = Promise.resolve();

  const writeOnce = async (): Promise<void> => {
    const { save } = get();
    if (!save) return;

    const stamped: SaveFile = { ...save, savedAt: gameNow(), clock: clockSnapshot() };

    try {
      await writeSave(stamped);

      const current = get().save;
      set({
        ...(current
          ? { save: { ...current, savedAt: stamped.savedAt, clock: stamped.clock } }
          : {}),
        lastSavedAt: stamped.savedAt,
        saveError: null,
      });
    } catch (cause) {
      set({ saveError: 'Your progress could not be saved to this browser’s storage.' });
      console.error('[TavernRPG] save failed', cause);
    }
  };

  /** Resolves once the save on disk reflects everything known at the time of the call. */
  const persistNow = (): Promise<void> => {
    if (writing) {
      dirty = true;
      return drain;
    }

    writing = true;
    set({ isSaving: true });

    drain = (async () => {
      try {
        do {
          dirty = false;
          await writeOnce();
        } while (dirty);
      } finally {
        writing = false;
        set({ isSaving: false });
      }
    })();

    return drain;
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

        // ── The world catches up *after* first paint. ──
        //
        // Raising 1,500 heroes and replaying a fortnight is ~300ms of synchronous work. Doing
        // it before `status: 'ready'` put that straight into every page load, delaying the
        // hero, the HUD and the quest table for something none of them need. The player's own
        // save is on screen immediately; the Crier board fills a beat later, which is exactly
        // the right priority.
        //
        // Nothing here is persisted either. The world is deterministic and ~145 KB: writing it
        // on every load buys nothing the next load could not recompute, and the ordinary
        // autosave — first mutation, or `pagehide` — carries it anyway.
        setTimeout(() => {
          const current = get().save;
          if (!current?.hero) return;

          const caught = catchUpWorld(ensureWorld(current, gameNow()), gameNow());
          if (caught.save === current) return;

          set({
            save: caught.save,
            absenceSummary: caught.summary,
            // Only worth reporting if someone actually came for them.
            overnightRaids: caught.raids && caught.raids.grudges.length > 0 ? caught.raids : null,
          });
        }, 0);
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

      // Kit is seeded from the world, so re-rolling a character in the same world is
      // reproducible and two players with the same seed start identically.
      const hero = createHero({
        name,
        classId,
        now: gameNow(),
        rng: createRng(deriveSeed(save.worldSeed, 'starter-kit', classId), 'starter-kit'),
      });

      // Draw the opening board straight away: creation ends at the tavern, and an empty
      // quest table would be the first thing a new player saw.
      const seeded = refreshDay({ ...save, hero }, currentDayKey(), dayKeysBetween).save;
      // Raise the 1,500. The world is generated at creation rather than lazily, so the ladder
      // the player is joining already has ninety days of history behind it — and the warm-up
      // day is simulated straight away so the Crier board has news on arrival rather than
      // being blank until the second session.
      const withWorld = ensureWorld(seeded, gameNow());
      const warmed = catchUpWorld(withWorld, gameNow());
      set({ save: warmed.save });
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

    refreshDay() {
      const { save } = get();
      if (!save) return;

      const result = refreshDay(save, currentDayKey(), dayKeysBetween);
      if (result.save === save) return;

      set({
        save: result.save,
        ...(result.didReset
          ? {
              notice:
                result.vigorForfeited > 0
                  ? `A new day at the Gilded Tankard. ${result.vigorForfeited} Vigor went unspent.`
                  : 'A new day at the Gilded Tankard. Your Vigor is full again.',
            }
          : {}),
        // Queued rather than announced: the Sunday purse deserves its own card, not a toast that
        // races the new-day one.
        ...(result.payouts.length > 0
          ? { pendingPayouts: [...get().pendingPayouts, ...result.payouts] }
          : {}),
      });
      void persistNow();
    },

    acceptMission(offerId, duration) {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };
      // The other half of exclusivity: a hero on the beat cannot take a contract.
      if (save.activity.patrol) return { kind: 'mission-running' };

      const result = acceptOffer(save, offerId, duration, gameNow());
      if (!result.ok) return result.refusal;

      set({ save: result.save });
      void persistNow();
      return null;
    },

    rerollBoard() {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };

      const result = rerollOn(save, currentDayKey());
      if (!result.ok) return result.refusal;

      set({ save: result.save });
      void persistNow();
      return null;
    },

    skipMissionTimer() {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };

      const result = skipOn(save, gameNow());
      if (!result.ok) return result.refusal;

      set({ save: result.save });
      void persistNow();
      return null;
    },

    landMission() {
      const { save } = get();
      if (!save) return;

      const next = landOn(save, gameNow());
      if (next === save) return;

      set({ save: next });
      void persistNow();
    },

    claimMission(mission) {
      const { save } = get();
      if (!save) return null;

      const result = claimOn(save, mission);
      if (!result) return null;

      set({ save: result.save });
      void persistNow();
      return result;
    },

    buyAle() {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };

      const result = buyAleOn(save);
      if (!result.ok) return result.refusal;

      set({ save: result.save });
      void persistNow();
      return null;
    },

    drinkAle() {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };

      const result = drinkAleOn(save);
      if (!result.ok) return result.refusal;

      set({ save: result.save });
      void persistNow();
      return null;
    },

    startPatrol(hours) {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };

      const result = beginPatrol(save, hours, gameNow());
      if (!result.ok) return result.refusal;

      set({ save: result.save });
      void persistNow();
      return null;
    },

    collectPatrol() {
      const { save } = get();
      if (!save) return null;

      const result = collectPatrol(save, gameNow());
      if (!result) return null;

      set({ save: result.save });
      void persistNow();
      return result;
    },

    openShop(shopId) {
      const { save } = get();
      if (!save) return;

      const next = refreshShop(save, shopId, currentDayKey());
      if (next === save) return;

      set({ save: next });
      void persistNow();
    },

    buyStockItem(shopId, index, price) {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };

      const result = buyFromShop(save, shopId, index, price);
      if (!result.ok) return result.refusal;

      set({ save: result.save });
      void persistNow();
      return result;
    },

    sellItem(uid) {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };

      const result = sellToShop(save, uid);
      if (!result.ok) return result.refusal;

      set({ save: result.save });
      void persistNow();
      return result;
    },

    rerollShopStock(shopId) {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };

      const result = rerollShop(save, shopId, currentDayKey());
      if (!result.ok) return result.refusal;

      set({ save: result.save });
      void persistNow();
      return null;
    },

    rentMount(mountId) {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };

      const result = takeMount(save, mountId, gameNow());
      if (!result.ok) return result.refusal;

      set({ save: result.save });
      void persistNow();
      return result;
    },

    absenceSummary: null,
    overnightRaids: null,

    dismissAbsenceSummary() {
      set({ absenceSummary: null, overnightRaids: null });
    },

    tickWorld() {
      const { save } = get();
      if (!save?.world) return;

      const caught = catchUpWorld(save, gameNow());
      if (caught.save === save) return;

      set({ save: caught.save });
      void persistNow();
    },

    // ── The Proving Grounds (Phase 9) ──────────────────────────────────────────────

    pendingPayouts: [],

    dismissPayouts() {
      set({ pendingPayouts: [] });
    },

    openArena() {
      const { save } = get();
      if (!save) return;

      const next = refreshDraw(save, currentDayKey(), gameNow());
      if (next === save) return;

      set({ save: next });
      void persistNow();
    },

    fightOpponent(opponentId) {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };

      const outcome = duelWith(save, opponentId, gameNow());
      if (!outcome.ok) return outcome.refusal;

      set({ save: outcome.transition.save });
      void persistNow();
      return outcome.transition;
    },

    rerollArenaDraw() {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };

      const result = rerollDraw(save, currentDayKey(), gameNow());
      if (!result.ok) return result.refusal;

      set({ save: result.save });
      void persistNow();
      return null;
    },

    skipArenaCooldown() {
      const { save } = get();
      if (!save) return { kind: 'no-hero' };

      const result = skipCooldown(save, gameNow());
      if (!result.ok) return result.refusal;

      set({ save: result.save });
      void persistNow();
      return null;
    },

    markLadderSeen() {
      const { save } = get();
      if (!save) return;

      const rank = rankOfPlayer(save);
      if (rank === 0 || save.arena.lastSeenRank === rank) return;

      set({ save: { ...save, arena: { ...save.arena, lastSeenRank: rank } } });
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

/**
 * End-to-end test seam.
 *
 * Real missions run for 5–20 wall-clock minutes, which no browser test can sit through. The
 * alternative — mocking the clock — would stop exercising the thing that actually matters, the
 * *stored* timestamps. So the suite reaches in here and pulls a finish line into the past,
 * which is precisely what a closed tab does anyway.
 *
 * Not gated behind an env flag on purpose: this exposes the same store the page already holds,
 * on a single-player local-first game whose save the player owns outright (Q15 — no anti-cheat).
 * Pretending otherwise would be security theatre.
 */
if (typeof window !== 'undefined') {
  (window as unknown as { __tavernStore: typeof useGameStore }).__tavernStore = useGameStore;
}

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
