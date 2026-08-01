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
import {
  acceptApplicant as acceptApplicantOn,
  applyTo as applyToOn,
  checkApplication,
  declineApplicant as declineApplicantOn,
  donate as donateOn,
  editMotto as editMottoOn,
  foundGuild as foundGuildOn,
  kickMember as kickMemberOn,
  leaveGuild as leaveGuildOn,
  postMessage as postMessageOn,
  promoteMember as promoteMemberOn,
  type DonateOptions,
  type FoundOptions,
  type GuildRefusal,
} from './guildActions';
import { descend as descendOn, type DelveResult } from './dungeonActions';
import { fightStage as fightStageOn, type FightStageResult } from './campaignActions';
import {
  craft as craftOn,
  craftFromRecipe as craftFromRecipeOn,
  scrap as scrapOn,
  type CraftResultState,
  type ScrapResult,
} from './forgeActions';
import { roll as rollOn, type RollResultState } from './gachaActions';
import {
  feedPet as feedPetOn,
  markPetsSeen as markPetsSeenOn,
  setActivePet as setActivePetOn,
  upgradePet as upgradePetOn,
  type PetResult,
} from './petActions';
import { credit } from './progressActions';
import {
  claimDailyChest as claimDailyChestOn,
  claimWeeklyChest as claimWeeklyChestOn,
  type DailyClaimResult,
  type WeeklyClaimResult,
} from './boardActions';
import {
  acknowledgeBeat as acknowledgeBeatOn,
  dismissHint as dismissHintOn,
  markExplainerSeen as markExplainerSeenOn,
  setOptedOut as setOptedOutOn,
} from './tutorialActions';
import type { BannerId } from '@/data/banners';
import type { BeatId, ExplainerId } from '@/data/tutorial';
import type { PetId } from '@/data/pets';
import type { ForgeTier } from '@/engine/forge/forgeConfig';
import type { VerseId } from '@/engine/combat/types';
import type { DungeonId } from '@/data/dungeons';
import type { BountyChest } from '@/engine/guilds/bounty';
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
import {
  archiveSave,
  deleteSave,
  exportRaw,
  exportSave,
  importSave,
  listSlots,
  readSave,
  writeActiveSlot,
  writeSave,
} from './persistence';

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
  /**
   * Leave this character and open another slot (architecture.md §3).
   *
   * Flushes first — the save being left is mid-session by definition, and the whole point of a
   * slot is that going back to it finds everything where you put it. Then the choice is
   * remembered, so a reload comes back to the hero you were actually playing.
   */
  switchSlot: (slot: SaveSlot) => Promise<void>;
  /** Delete a character for good. Switches away first if it is the one being played. */
  deleteSlot: (slot: SaveSlot) => Promise<void>;
  /** Triage: hand back whatever is on disk, valid or not, so the player can keep a copy. */
  exportRawSave: () => Promise<string | null>;
  /** Triage: set the unreadable save aside — never delete it — and begin again. */
  archiveAndStartOver: () => Promise<void>;
  /** The current save, as text a player can keep. Null if the slot will not open. */
  exportCurrentSave: () => Promise<string | null>;
  /** Replace this slot from exported text, then reload the game around it. */
  importIntoSlot: (text: string) => Promise<{ ok: boolean; message: string }>;
  startOver: () => Promise<void>;

  /** Creation. Writes through immediately — nobody should lose a new hero to a debounce. */
  createHero: (
    name: string,
    classId: ClassId,
    /** `skipTutorial` is the creation screen's "I have played before" tick (tutorial spec §1). */
    options?: { readonly skipTutorial?: boolean },
  ) => Promise<void>;
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

  // ── The Guild Hall (Phase 10) ────────────────────────────────────────────────────
  /** Bring the day up to date and see whether a hall has answered. Idempotent. */
  openGuildHall: () => void;
  /** The answer to a pending application, once, so the screen can show it and move on. */
  guildDecision: { readonly accepted: boolean; readonly reason: string } | null;
  dismissGuildDecision: () => void;
  /** The bounty chest, if a Sunday passed while they were away. */
  guildChest: BountyChest | null;
  dismissGuildChest: () => void;
  applyToGuild: (guildId: number) => GuildRefusal | null;
  foundGuild: (options: FoundOptions) => GuildRefusal | null;
  leaveGuild: () => GuildRefusal | null;
  donateToGuild: (options: DonateOptions) => GuildRefusal | null;
  acceptGuildApplicant: (botId: number) => GuildRefusal | null;
  declineGuildApplicant: (botId: number) => GuildRefusal | null;
  promoteGuildMember: (botId: number) => GuildRefusal | null;
  kickGuildMember: (botId: number) => GuildRefusal | null;
  setGuildMotto: (motto: string) => GuildRefusal | null;
  postGuildMessage: (text: string) => GuildRefusal | null;

  // ── The Undertavern (Phase 11) ───────────────────────────────────────────────────
  /**
   * Fight the floor in front of you in one of the three.
   *
   * Returns the whole transition — battle log, spoils and progress — so the room can play the
   * fight it already knows the outcome of, exactly as the arena does. There is no separate
   * "claim": a delve has no timer to wait on and nothing to collect later.
   */
  descendInto: (id: DungeonId) => DelveResult;
  /**
   * Fight one stage of the Long Road (campaign spec §3).
   *
   * Takes `now` from the caller rather than reading the clock here, because the screen chains
   * these — a run of twenty stages is twenty calls in a few seconds, and they should all agree
   * about which day it is even if one lands across midnight. The Vigor, the payout, the wall and
   * the progress metric all move inside `campaignActions`; this only persists the result.
   */
  fightCampaignStage: (stage: number, now: number) => FightStageResult;

  // ── The Emberforge (Phase 12) ────────────────────────────────────────────────────
  /** Into the crucible. Returns what it paid, or why it would not take the piece. */
  scrapItem: (uid: string) => ScrapResult;
  /** Strike the anvil at a chosen tier and slot. */
  craftItem: (tier: ForgeTier, slot: SlotId) => CraftResultState;
  /** Spend a recipe: a guaranteed piece of that set. */
  craftSetPiece: (setId: string) => CraftResultState;
  /** The Verse a Maestro five-piece opens on. */
  setOpeningVerse: (verse: VerseId) => void;

  // ── Fortune's Table (Phase 13) ───────────────────────────────────────────────────
  /** One card, or ten on the Grand Reading. The free daily card costs nothing. */
  rollBanner: (bannerId: BannerId, ten?: boolean) => RollResultState;

  // ── The Menagerie (Phase 14) ─────────────────────────────────────────────────────
  /** A scrap and some gold for a level. Three a day, per pet. */
  feedPet: (id: PetId) => PetResult;
  /** Materials for a frame, a trail and half a percent. */
  upgradePet: (id: PetId) => PetResult;
  /** Put one at your side, or none. Free and instant. */
  setActivePet: (id: PetId | null) => void;
  /** Stop the rail saying something new is in the Menagerie. */
  markPetsSeen: () => void;
  /** The Notice Board's two chests (daily-loop spec §1). */
  claimDailyChest: () => DailyClaimResult;
  claimWeeklyChest: () => WeeklyClaimResult;

  /**
   * Onboarding (tutorial spec §1, §4).
   *
   * Four writes and no cursor. The tutorial's *position* is derived from the save
   * (`engine/tutorial/beats.ts`), so nothing here advances it — these only record the handful of
   * facts a predicate cannot infer.
   */
  setTutorialOptedOut: (optedOut: boolean) => void;
  acknowledgeBeat: (id: BeatId) => void;
  markExplainerSeen: (id: ExplainerId) => void;
  dismissHint: (id: string) => void;
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

  /**
   * Run a guild transition and persist it, or hand the refusal back for the screen to phrase.
   *
   * The guild actions all share one result shape, which they got by being written after the
   * shop and arena ones had already made the case for it — so unlike those, they need exactly
   * one adapter rather than a dozen near-identical bodies.
   */
  const runGuild = (
    transition: (
      save: SaveFile,
    ) => { ok: true; save: SaveFile } | { ok: false; refusal: GuildRefusal },
  ): GuildRefusal | null => {
    const { save } = get();
    if (!save) return { kind: 'no-hero' };

    const result = transition(save);
    if (!result.ok) return result.refusal;
    if (result.save === save) return null;

    set({ save: result.save });
    void persistNow();
    return null;
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

    async createHero(name, classId, options = {}) {
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

      // "I have been here before", ticked at creation. One flag, applied before anything else
      // reads it, so the first render of the tavern is already tour-free (tutorial spec §1).
      const started = setOptedOutOn({ ...save, hero }, options.skipTutorial === true);

      // Draw the opening board straight away: creation ends at the tavern, and an empty
      // quest table would be the first thing a new player saw.
      const seeded = refreshDay(started, currentDayKey(), dayKeysBetween).save;
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
      const { save } = get();
      if (!save?.hero) return;

      const hero = equipOnHero(save.hero, item);
      if (hero === save.hero) return; // the transform refused; nothing to persist

      // Counted at the one place the action happens, like every other metric. The tutorial's
      // "put it on" beat reads it, and it is monotone — which is what stops the tour walking
      // backwards the next time the bags have something in them.
      set({ save: credit({ ...save, hero }, 'itemsEquipped', 1) });
      void persistNow();
    },

    unequipItem(slot) {
      updateHero((hero) => unequipFromHero(hero, slot));
    },

    trainAttribute(attribute, count) {
      const { save } = get();
      if (!save?.hero) return;

      const result = trainOnHero(save.hero, attribute, count);
      if (result.pointsBought === 0) return;

      // Gold into the trainer is the game's primary sink, so the board is allowed to notice.
      set({ save: credit({ ...save, hero: result.hero }, 'goldTrained', result.goldSpent) });
      void persistNow();
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

    async switchSlot(slot) {
      if (slot === get().slot) return;

      /*
       * Flush before leaving, and do it even though every mutation already writes through.
       *
       * The one write that might still be in the air is the one the player just made — the whole
       * grievance a slot system has to avoid is "I swapped characters and lost my last fight".
       * `persistNow` resolves once the disk reflects everything known now, which is exactly the
       * guarantee this needs and the reason it is awaited rather than fired.
       */
      await persistNow();
      await writeActiveSlot(slot);
      await get().hydrate(slot);
    },

    async deleteSlot(slot) {
      const wasActive = slot === get().slot;
      if (wasActive) await persistNow();

      await deleteSave(slot);

      if (!wasActive) return;

      /*
       * Deleting the character you are playing has to land somewhere.
       *
       * Prefer another slot that already has a hero — being dropped into a stranger's session is
       * odd, but being dropped into *nothing* after deleting your only save is worse, and the
       * empty-slot path lands on hero creation, which is the honest answer for a player who has
       * just cleared the shelf.
       */
      const remaining = (await listSlots()).find((entry) => entry.slot !== slot && entry.hero);
      const next = remaining?.slot ?? 1;
      await writeActiveSlot(next);
      await get().hydrate(next);
    },

    async exportRawSave() {
      return exportRaw(get().slot, gameNow());
    },

    async archiveAndStartOver() {
      const { slot } = get();
      /*
       * Archive, then create — in that order, and never `deleteSave`.
       *
       * A player reaching this button has a save the game cannot read, which is not the same as a
       * save that is worthless: a bad byte in one slice leaves the other seventeen intact, and a
       * later version may well open what this one cannot. The stamp comes from the game clock
       * because `Date.now` is lint-banned outside it, and it makes the archived keys sort.
       */
      await archiveSave(slot, String(gameNow()));

      const fresh = createNewSave({ slot, worldSeed: newWorldSeed(), now: gameNow() });
      restoreClock(fresh.clock);
      set({
        status: 'ready',
        save: fresh,
        error: null,
        notice: 'Your old save was kept, set aside under a dated key. This one starts clean.',
        isSaving: true,
      });
      await writeSave(fresh);
      set({ lastSavedAt: fresh.savedAt, isSaving: false, saveError: null });
    },

    async exportCurrentSave() {
      // Flush first. Exporting a save that is three actions behind the screen is the kind of
      // bug a player only discovers on the day they need the file.
      await persistNow();
      return exportSave(get().slot);
    },

    async importIntoSlot(text) {
      const { slot } = get();
      const result = await importSave(text, slot);
      if (!result.ok) return { ok: false, message: result.message };

      /*
       * Re-hydrate rather than dropping the save straight into state.
       *
       * An import is a *load*, and the load path does things this action must not skip: it
       * restores the clock from the file (so a save from a rewound device cannot rewind
       * progress), it runs the day boundary, and it raises the world. Setting `save` directly
       * would produce a session that looks right and drifts within a minute.
       */
      await get().hydrate(slot);
      return { ok: true, message: 'Save loaded.' };
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

    // ── The Guild Hall (Phase 10) ──────────────────────────────────────────────────

    guildDecision: null,
    guildChest: null,

    dismissGuildDecision() {
      set({ guildDecision: null });
    },

    dismissGuildChest() {
      set({ guildChest: null });
    },

    openGuildHall() {
      const { save } = get();
      if (!save) return;

      // The day first, so a bounty that closed overnight is settled before the screen reads it.
      const day = refreshDay(save, currentDayKey(), dayKeysBetween);
      const answered = checkApplication(day.save, gameNow());
      if (answered.save === save && !answered.decision && !day.chest) return;

      set({
        save: answered.save,
        ...(answered.decision ? { guildDecision: answered.decision } : {}),
        ...(day.chest && day.chest.gold > 0 ? { guildChest: day.chest } : {}),
      });
      void persistNow();
    },

    applyToGuild(guildId) {
      return runGuild((save) => applyToOn(save, guildId, gameNow()));
    },

    foundGuild(options) {
      return runGuild((save) => foundGuildOn(save, options, gameNow()));
    },

    leaveGuild() {
      return runGuild((save) => leaveGuildOn(save, gameNow()));
    },

    donateToGuild(options) {
      /*
       * The one metric credited from two places, and deliberately so: `donate` already threads
       * the bounty through a larger transaction (the hall's pot, the treasury track, the world
       * record), so routing it back through `credit` would be circular. What the board needs is
       * the tally, and that is added here — the value is whatever the donation was worth, which
       * `donate` has already priced.
       */
      const before = get().save?.hero;
      const refusal = runGuild((save) => donateOn(save, options, gameNow()));
      if (refusal) return refusal;

      const after = get().save;
      const value = (before?.gold ?? 0) - (after?.hero?.gold ?? 0);
      if (after && value > 0) {
        set({ save: credit(after, 'goldDonated', value) });
        void persistNow();
      }
      return null;
    },

    acceptGuildApplicant(botId) {
      return runGuild((save) => acceptApplicantOn(save, botId, gameNow()));
    },

    declineGuildApplicant(botId) {
      return runGuild((save) => declineApplicantOn(save, botId));
    },

    promoteGuildMember(botId) {
      return runGuild((save) => promoteMemberOn(save, botId, gameNow()));
    },

    kickGuildMember(botId) {
      return runGuild((save) => kickMemberOn(save, botId, gameNow()));
    },

    setGuildMotto(motto) {
      return runGuild((save) => editMottoOn(save, motto));
    },

    postGuildMessage(text) {
      return runGuild((save) => postMessageOn(save, text, gameNow()));
    },

    descendInto(id) {
      const { save } = get();
      if (!save) return { ok: false, refusal: { kind: 'no-hero' } };

      const result = descendOn(save, id, gameNow());
      if (!result.ok) return result;

      set({
        save: credit(result.save, 'dungeonFloors', result.outcome.cleared ? 1 : 0),
      });
      void persistNow();
      return result;
    },

    fightCampaignStage(stage, now) {
      const { save } = get();
      if (!save) return { ok: false, refusal: { kind: 'no-hero' } };

      const result = fightStageOn(save, stage, now);
      if (!result.ok) return result;

      set({ save: result.save });
      void persistNow();
      return result;
    },

    scrapItem(uid) {
      const { save } = get();
      if (!save) return { ok: false, refusal: { kind: 'no-hero' } };

      const result = scrapOn(save, uid);
      if (!result.ok) return result;

      set({ save: result.save });
      void persistNow();
      return result;
    },

    craftItem(tier, slot) {
      const { save } = get();
      if (!save) return { ok: false, refusal: { kind: 'no-hero' } };

      const result = craftOn(save, tier, slot);
      if (!result.ok) return result;

      set({ save: result.save });
      void persistNow();
      return result;
    },

    craftSetPiece(setId) {
      const { save } = get();
      if (!save) return { ok: false, refusal: { kind: 'no-hero' } };

      const result = craftFromRecipeOn(save, setId);
      if (!result.ok) return result;

      set({ save: result.save });
      void persistNow();
      return result;
    },

    rollBanner(bannerId, ten = false) {
      const { save } = get();
      if (!save) return { ok: false, refusal: { kind: 'no-hero' } };

      const result = rollOn(save, {
        bannerId,
        today: currentDayKey(),
        now: gameNow(),
        ...(ten ? { ten: true } : {}),
      });
      if (!result.ok) return result;

      // Every card counts, the free one included — the task says "draw a card", not "spend a die".
      const drawn = result.save.gacha.rolls - save.gacha.rolls;
      set({ save: credit(result.save, 'gachaRolls', drawn) });
      void persistNow();
      return result;
    },

    feedPet(id) {
      const { save } = get();
      if (!save) return { ok: false, refusal: { kind: 'no-hero' } };

      const result = feedPetOn(save, id);
      if (!result.ok) return result;

      set({ save: credit(result.save, 'petsFed', 1) });
      void persistNow();
      return result;
    },

    upgradePet(id) {
      const { save } = get();
      if (!save) return { ok: false, refusal: { kind: 'no-hero' } };

      const result = upgradePetOn(save, id);
      if (!result.ok) return result;

      set({ save: result.save });
      void persistNow();
      return result;
    },

    setActivePet(id) {
      const { save } = get();
      if (!save) return;

      const next = setActivePetOn(save, id);
      if (next === save) return;

      set({ save: next });
      void persistNow();
    },

    markPetsSeen() {
      const { save } = get();
      if (!save) return;

      const next = markPetsSeenOn(save);
      if (next === save) return;

      set({ save: next });
      void persistNow();
    },

    claimDailyChest() {
      const { save } = get();
      if (!save) return { ok: false, refusal: { kind: 'no-hero' } };

      const result = claimDailyChestOn(save, currentDayKey());
      if (!result.ok) return result;

      set({ save: result.save });
      void persistNow();
      return result;
    },

    claimWeeklyChest() {
      const { save } = get();
      if (!save) return { ok: false, refusal: { kind: 'no-hero' } };

      const result = claimWeeklyChestOn(save, currentDayKey());
      if (!result.ok) return result;

      // The chest's item goes into the bags like any other drop, through the one path that
      // knows what to do when they are full.
      set({ save: { ...result.save, hero: addItemToHero(result.save.hero!, result.item).hero } });
      void persistNow();
      return result;
    },

    setOpeningVerse(verse) {
      const { save } = get();
      if (!save?.hero) return;

      set({ save: { ...save, hero: { ...save.hero, openingVerse: verse } } });
      void persistNow();
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

    /* ── Onboarding (tutorial spec §1, §4) ──────────────────────────────────────── */

    setTutorialOptedOut(optedOut) {
      const { save } = get();
      if (!save) return;

      const next = setOptedOutOn(save, optedOut);
      if (next === save) return;

      set({ save: next });
      void persistNow();
    },

    acknowledgeBeat(id) {
      const { save } = get();
      if (!save) return;

      const next = acknowledgeBeatOn(save, id);
      if (next === save) return;

      set({ save: next });
      void persistNow();
    },

    markExplainerSeen(id) {
      const { save } = get();
      if (!save) return;

      const next = markExplainerSeenOn(save, id);
      if (next === save) return;

      set({ save: next });
      void persistNow();
    },

    dismissHint(id) {
      const { save } = get();
      if (!save) return;

      const next = dismissHintOn(save, id);
      if (next === save) return;

      set({ save: next });
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
