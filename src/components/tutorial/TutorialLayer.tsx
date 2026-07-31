'use client';

/**
 * The tutorial, mounted (tutorial spec §1, §2).
 *
 * This is the whole of the wiring: ask the save which beat is live, work out whether its target
 * is on the screen the player is currently looking at, and render one of three things.
 *
 * - **The spotlight**, when the beat's room is open and its target is mounted.
 * - **Directions**, when the beat happens somewhere else. This is the case that would otherwise
 *   fail silently: beat 7 lives in the Armory, and a player standing in the tavern would get a
 *   tutorial that had simply stopped. Instead the card says who wants them and offers the walk.
 * - **A folded tab**, once the player has pushed the card aside. Tucked bottom-left, one click
 *   from coming back, and it re-opens on its own when the beat changes — pushing beat four aside
 *   should not silence beat five.
 *
 * Nothing here advances anything. The beat is derived from the save on every render, so the
 * moment the player does the thing, the predicate flips and the next beat is simply what
 * `activeBeat` now returns — including across a reload, a second tab, or a mid-beat migration.
 */

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { BEATS } from '@/data/tutorial';
import { PLACES_BY_ID, placeByRoute } from '@/data/places';
import { activeBeat } from '@/engine/tutorial/beats';
import { isUnlocked } from '@/engine/progression/gates';
import { useGameStore } from '@/state/gameStore';
import { useShellStore } from '@/state/shellStore';
import { Icon } from '@/components/icons';
import { Spotlight, type SpotlightAction } from './Spotlight';
import { useSpotlightRect } from './useSpotlightRect';
import { standard } from '@/styles/motion';

export function TutorialLayer() {
  const save = useGameStore((state) => state.save);
  const acknowledgeBeat = useGameStore((state) => state.acknowledgeBeat);
  const setTutorialOptedOut = useGameStore((state) => state.setTutorialOptedOut);
  const hidden = useShellStore((state) => state.spotlightHidden);
  const hideSpotlight = useShellStore((state) => state.hideSpotlight);
  const showSpotlight = useShellStore((state) => state.showSpotlight);

  const pathname = usePathname();
  const router = useRouter();

  const beat = save ? activeBeat(save) : null;
  const here = placeByRoute(pathname)?.id ?? null;
  const onSite = beat !== null && beat.place === here;

  /*
   * Only measure when the beat's room is the one on screen.
   *
   * Two screens can carry the same testid — `duel-board` is the Proving Grounds', but a future
   * room could reuse a name — and a spotlight that latches onto the wrong element is worse than
   * one that waits. Passing null also stops the measuring loop dead while the player is
   * elsewhere, which is most of the time.
   */
  const rect = useSpotlightRect(onSite ? beat.spotlight : null);

  // Escape folds it away. Bound at the window because the layer never takes focus — it is not a
  // modal, and giving it focus would steal the caret from whatever the player was doing.
  useEffect(() => {
    if (!beat || hidden === beat.id) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideSpotlight(beat.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [beat, hidden, hideSpotlight]);

  // A stale fold: the player pushed beat four aside, then finished it. Beat five is new advice.
  useEffect(() => {
    if (hidden !== null && hidden !== beat?.id) showSpotlight();
  }, [hidden, beat, showSpotlight]);

  if (!save?.hero || !beat) return null;

  const folded = hidden === beat.id;
  const step = BEATS.findIndex((entry) => entry.id === beat.id) + 1;
  const destination = PLACES_BY_ID[beat.place];
  const reachable = isUnlocked(beat.place, save.hero.level);

  /*
   * The beat's button, if it has one.
   *
   * A `'read'` beat gets "Got it" — the only honest completion for something there is nothing to
   * *do* about. A beat in another room gets the walk there instead, so the directions card is a
   * door rather than an instruction.
   */
  const action: SpotlightAction | undefined = !onSite
    ? reachable
      ? { label: 'Take me there', onClick: () => router.push(destination.route) }
      : undefined
    : beat.kind === 'read'
      ? { label: 'Got it', onClick: () => acknowledgeBeat(beat.id) }
      : undefined;

  /*
   * Directions get their own line rather than the beat's.
   *
   * Prefixing "Marla is waiting at the Gilded Tankard" onto the beat's own two sentences means
   * the player reads the lesson here and then again when they arrive, which makes the second
   * showing feel like the tutorial repeating itself. The line the beat was written for is saved
   * for the room it was written about.
   */
  const copy = onSite
    ? beat.copy
    : reachable
      ? `${beat.speaker} has something to show you at ${destination.name}.`
      : `${beat.speaker} will want a word at ${destination.name}, which opens at level ${destination.gateLevel}.`;

  return (
    <>
      {/*
        Bottom-centre, not bottom-left: the rail's Settings row lives in that corner and the tab
        sat straight on top of it. Positioning goes on the wrapper so Motion's hover transform
        does not fight the centring translate.
      */}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-30 -translate-x-1/2">
        <AnimatePresence>
          {folded && (
            <motion.button
              key="folded"
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={standard}
              whileHover={{ y: -1 }}
              whileTap={{ y: 1, scale: 0.985 }}
              onClick={showSpotlight}
              className="chamfer-sm bg-wood-800/95 text-parchment-300 pointer-events-auto flex items-center gap-2 border border-amber-500/45 px-3 py-2 text-xs hover:border-amber-400"
              data-testid="tutorial-folded"
            >
              <motion.span
                className="text-amber-400"
                animate={{ opacity: [1, 0.45] }}
                transition={{ duration: 1.6, repeat: Infinity, repeatType: 'reverse' }}
              >
                <Icon name="spark" size={14} />
              </motion.span>
              {beat.speaker} has a word
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {!folded && (
        <Spotlight
          rect={onSite ? rect : null}
          speaker={beat.speaker}
          copy={copy}
          step={step}
          total={BEATS.length}
          {...(action ? { action } : {})}
          onHide={() => hideSpotlight(beat.id)}
          onSkip={() => setTutorialOptedOut(true)}
        />
      )}
    </>
  );
}
