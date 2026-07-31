'use client';

/**
 * The tutorial, mounted (tutorial spec §1, §2).
 *
 * The wiring is one rule: **the tour only draws over the page when it has something to draw
 * around.** Ask the save which beat is live, measure the element it points at, and if that
 * element is on this screen, cut a hole and put the keeper's card beside it. If it is not — the
 * player is in another room, or the target has not mounted yet, or they pushed the card aside —
 * this renders nothing at all and `TutorialChip` says it from the HUD instead.
 *
 * That rule is not tidiness. The first version floated a card bottom-centre whenever there was no
 * hole, which sat on top of Vesna's roll buttons and made three Fortune's Table tests fail with
 * "subtree intercepts pointer events" — a tutorial blocking a button in a room it was not even
 * talking about. Anchoring the only page-level element to a real target makes that unrepresentable
 * rather than merely unlikely.
 *
 * Nothing here advances anything. The beat is derived from the save on every render, so the
 * moment the player does the thing, the predicate flips and the next beat is simply what
 * `activeBeat` now returns — including across a reload, a second tab, or a mid-beat migration.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { BEATS } from '@/data/tutorial';
import { placeByRoute } from '@/data/places';
import { activeBeat } from '@/engine/tutorial/beats';
import { useGameStore } from '@/state/gameStore';
import { useShellStore } from '@/state/shellStore';
import { Spotlight, type SpotlightAction } from './Spotlight';
import { useSpotlightRect } from './useSpotlightRect';

export function TutorialLayer() {
  const save = useGameStore((state) => state.save);
  const acknowledgeBeat = useGameStore((state) => state.acknowledgeBeat);
  const setTutorialOptedOut = useGameStore((state) => state.setTutorialOptedOut);
  const hidden = useShellStore((state) => state.spotlightHidden);
  const hideSpotlight = useShellStore((state) => state.hideSpotlight);
  const showSpotlight = useShellStore((state) => state.showSpotlight);

  const pathname = usePathname();

  const beat = save ? activeBeat(save) : null;
  const here = placeByRoute(pathname)?.id ?? null;
  const onSite = beat !== null && beat.place === here;

  /*
   * Only measure when the beat's room is the one on screen.
   *
   * Two screens can carry the same testid — `duel-board` is the Proving Grounds', but a future
   * room could reuse the name — and a spotlight that latches onto the wrong element is worse than
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
  if (hidden === beat.id || !onSite || rect === null) return null;

  const step = BEATS.findIndex((entry) => entry.id === beat.id) + 1;

  /*
   * The beat's button, if it has one.
   *
   * Only `'read'` beats get one — the two with nothing to *do*, where the only honest completion
   * is the player saying they have seen it. A `'do'` beat has no button on purpose: the thing
   * that finishes it is the thing the hole is drawn around.
   */
  const action: SpotlightAction | undefined =
    beat.kind === 'read' ? { label: 'Got it', onClick: () => acknowledgeBeat(beat.id) } : undefined;

  return (
    <Spotlight
      rect={rect}
      speaker={beat.speaker}
      copy={beat.copy}
      step={step}
      total={BEATS.length}
      {...(action ? { action } : {})}
      onHide={() => hideSpotlight(beat.id)}
      onSkip={() => setTutorialOptedOut(true)}
    />
  );
}
