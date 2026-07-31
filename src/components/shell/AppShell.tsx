'use client';

/**
 * The persistent frame: rail on the left, HUD on top, the current place filling the rest.
 *
 * Also the one place that reconciles settings with the save — the shell reads preferences
 * from the loaded save on hydrate and writes changes back, so a collapsed rail survives a
 * reload without every component knowing about persistence.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { MotionConfig } from 'motion/react';
import { NavRail } from './NavRail';
import { ResetMoment } from './ResetMoment';
import { TopHud } from './TopHud';
import { PlaceStage } from './PlaceStage';
import { ToastStack } from '@/components/ui/Toast';
import { HeroCreation } from '@/components/hero/HeroCreation';
import { TutorialLayer } from '@/components/tutorial/TutorialLayer';
import { UnlockWatcher } from './UnlockWatcher';
import { SaveTriage } from './SaveTriage';
import { TabConflict } from './TabConflict';
import { RoomBoundary } from './RoomBoundary';
import { claimTabLock, type TabLock, type TabRole } from '@/state/tabLock';
import { useGameStore } from '@/state/gameStore';
import { useShellStore } from '@/state/shellStore';
import { configureSfx } from '@/state/sfx';
import { configureBgm, watchVisibility } from '@/state/bgm';

/**
 * `[TUNE]` Music sits under the cues at this share of the master volume.
 *
 * One slider, two jobs: the spec gives music its own toggle but not its own level, and a loop at
 * the same loudness as a crit would bury the crit. Music is a floor, not an event.
 */
const BGM_SHARE = 0.45;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const hydrate = useGameStore((state) => state.hydrate);
  const status = useGameStore((state) => state.status);
  const save = useGameStore((state) => state.save);
  const applySettings = useGameStore((state) => state.applySettings);
  const settings = useShellStore((state) => state.settings);
  const setSettings = useShellStore((state) => state.setSettings);

  /*
   * Claim the save before loading it.
   *
   * Two tabs each hold their own store and each flush to the same slot, so the second to write
   * silently overwrites the first — a player who opens the game twice loses whichever session
   * they were not watching. `electing` lasts a few hundred milliseconds and renders nothing,
   * because a flash of "another tab has this" on every single load would be worse than the bug.
   */
  const [tabRole, setTabRole] = useState<TabRole>('electing');
  const lock = useRef<TabLock | null>(null);
  useEffect(() => {
    lock.current = claimTabLock(setTabRole);
    return () => {
      lock.current?.release();
      lock.current = null;
    };
  }, []);

  const takeOver = useCallback(() => {
    lock.current?.takeOver();
    // The save may have moved on in the other tab; re-read rather than trusting what is in hand.
    void hydrate(1);
  }, [hydrate]);

  useEffect(() => {
    if (tabRole !== 'leader') return;
    void hydrate(1);
  }, [hydrate, tabRole]);

  // Save -> shell, once the save lands.
  useEffect(() => {
    if (save) setSettings(save.settings);
  }, [save, setSettings]);

  // Shell -> save, whenever the player changes a preference.
  useEffect(() => {
    applySettings(settings);
  }, [settings, applySettings]);

  /*
   * Shell -> speakers.
   *
   * Both audio modules are module-level singletons rather than React state, because the things
   * that make noise are a battle timeline and a click handler — neither of which should have to
   * hold a context or thread a volume down. This effect is the only place the player's
   * preference reaches them, so a toggle and a volume drag cannot disagree.
   */
  useEffect(() => {
    configureSfx({ enabled: settings.sfxEnabled, volume: settings.volume });
  }, [settings.sfxEnabled, settings.volume]);

  useEffect(() => {
    configureBgm({ enabled: settings.musicEnabled, volume: settings.volume * BGM_SHARE });
  }, [settings.musicEnabled, settings.volume]);

  // A loop still playing in a tab nobody is looking at is why people mute games for good.
  useEffect(() => watchVisibility(), []);

  /**
   * `reducedMotion` respects the OS by default, and the explicit setting overrides it in
   * either direction — some players want the ceremonies regardless of a system-wide flag.
   */
  const reducedMotion =
    settings.motion === 'system' ? 'user' : settings.motion === 'reduced' ? 'always' : 'never';

  /**
   * No hero yet ⇒ creation takes the whole screen. The rail and HUD would be meaningless
   * (and misleading) before there is anyone to describe, so they are simply not shown.
   */
  const needsHero = status === 'ready' && save?.hero == null;

  /**
   * A save that would not open takes the whole screen, like creation does.
   *
   * The rail and the HUD describe a hero this player does not currently have, and every room
   * behind them would render empty. Until Phase 18 that is exactly what happened — `status:
   * 'failed'` reached the store and nothing read it.
   */
  const brokenSave = status === 'failed';
  const shadowed = tabRole === 'follower';

  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <div className="bg-wood-900 flex h-screen w-screen overflow-hidden">
        {shadowed ? (
          <main className="relative min-h-0 flex-1">
            <TabConflict onTakeOver={takeOver} />
          </main>
        ) : brokenSave ? (
          <main className="relative min-h-0 flex-1">
            <SaveTriage />
          </main>
        ) : needsHero ? (
          <main className="relative min-h-0 flex-1" data-testid="hero-creation">
            <HeroCreation />
          </main>
        ) : (
          <>
            <NavRail />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopHud />
              <main className="relative min-h-0 flex-1">
                <RoomBoundary onLeave={() => router.push('/tavern')}>
                  <PlaceStage>{children}</PlaceStage>
                </RoomBoundary>
              </main>
            </div>
          </>
        )}
        {/* Marla's tour rides above the town and below the ceremonies: the spotlight sits at
            z-30, so a battle scene or a chest opening covers it rather than competing with it
            (tutorial spec §1). */}
        {!needsHero && !brokenSave && !shadowed && <TutorialLayer />}

        {/* Announces a room the moment a level opens it — the rail's lock coming off is easy
            to miss when you were not looking at that row (tutorial spec §3). */}
        {!needsHero && !brokenSave && !shadowed && <UnlockWatcher />}

        {/* The clock strikes over everything, but never over a fight — the battle scene raises
            its own layer and the moment queues behind it (daily-loop spec §4). */}
        {!needsHero && !brokenSave && !shadowed && <ResetMoment />}
        <ToastStack />
      </div>
    </MotionConfig>
  );
}
