'use client';

/**
 * The persistent frame: rail on the left, HUD on top, the current place filling the rest.
 *
 * Also the one place that reconciles settings with the save — the shell reads preferences
 * from the loaded save on hydrate and writes changes back, so a collapsed rail survives a
 * reload without every component knowing about persistence.
 */

import { useEffect, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { NavRail } from './NavRail';
import { TopHud } from './TopHud';
import { PlaceStage } from './PlaceStage';
import { ToastStack } from '@/components/ui/Toast';
import { HeroCreation } from '@/components/hero/HeroCreation';
import { useGameStore } from '@/state/gameStore';
import { useShellStore } from '@/state/shellStore';

export function AppShell({ children }: { children: ReactNode }) {
  const hydrate = useGameStore((state) => state.hydrate);
  const status = useGameStore((state) => state.status);
  const save = useGameStore((state) => state.save);
  const applySettings = useGameStore((state) => state.applySettings);
  const settings = useShellStore((state) => state.settings);
  const setSettings = useShellStore((state) => state.setSettings);

  useEffect(() => {
    void hydrate(1);
  }, [hydrate]);

  // Save -> shell, once the save lands.
  useEffect(() => {
    if (save) setSettings(save.settings);
  }, [save, setSettings]);

  // Shell -> save, whenever the player changes a preference.
  useEffect(() => {
    applySettings(settings);
  }, [settings, applySettings]);

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

  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <div className="bg-wood-900 flex h-screen w-screen overflow-hidden">
        {needsHero ? (
          <main className="relative min-h-0 flex-1" data-testid="hero-creation">
            <HeroCreation />
          </main>
        ) : (
          <>
            <NavRail />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopHud />
              <main className="relative min-h-0 flex-1">
                <PlaceStage>{children}</PlaceStage>
              </main>
            </div>
          </>
        )}
        <ToastStack />
      </div>
    </MotionConfig>
  );
}
