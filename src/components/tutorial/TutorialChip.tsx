'use client';

/**
 * The tour, when it has nothing to point at (tutorial spec §1).
 *
 * A beat is anchored to an element. When that element is not on screen — the player is in
 * another room, or the beat's target has not mounted yet — there is nothing to cut a hole around,
 * and the tour has to say so *somewhere that costs nothing*.
 *
 * It rides in the HUD, beside the Next Step chip, and the reason is a bug this replaced. The
 * first version floated a full card bottom-centre whenever there was no hole, which looked fine
 * on the two screens it was tested on and sat directly on top of Vesna's roll buttons at
 * Fortune's Table. The e2e suite caught it: three tests failed with "subtree intercepts pointer
 * events". A tutorial that blocks a button in a room it is not even talking about is the exact
 * failure the whole layer is built to avoid.
 *
 * So the rule is now structural rather than careful: **the tutorial only draws over the page when
 * it has a hole**, and every other state is a chip in the one strip that is already the game's
 * chrome. `HintChip` stands down while a beat is live, so the two never compete for the space.
 */

import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { PLACES_BY_ID, placeByRoute } from '@/data/places';
import { activeBeat } from '@/engine/tutorial/beats';
import { isUnlocked } from '@/engine/progression/gates';
import { useGameStore } from '@/state/gameStore';
import { useShellStore } from '@/state/shellStore';
import { Icon } from '@/components/icons';
import { useTooltip } from '@/components/ui/Tooltip';
import { standard } from '@/styles/motion';

export function TutorialChip() {
  const save = useGameStore((state) => state.save);
  const hidden = useShellStore((state) => state.spotlightHidden);
  const showSpotlight = useShellStore((state) => state.showSpotlight);
  const pathname = usePathname();
  const router = useRouter();

  const beat = save?.hero ? activeBeat(save) : null;
  const here = placeByRoute(pathname)?.id ?? null;
  const folded = beat !== null && hidden === beat.id;
  const onSite = beat !== null && beat.place === here;

  /*
   * Shown whenever the overlay is not.
   *
   * On-site and unfolded, the spotlight is doing the talking — even in the moment before its
   * target mounts, because the card is a beat behind for a frame and two voices in that gap read
   * as a flicker rather than as help.
   */
  const showing = beat !== null && (folded || !onSite);
  const destination = beat ? PLACES_BY_ID[beat.place] : null;
  const reachable = beat && save?.hero ? isUnlocked(beat.place, save.hero.level) : false;

  const tip = useTooltip(
    beat && destination
      ? {
          title: folded ? 'Show me again' : `Go to ${destination.name}`,
          detail: folded ? undefined : beat.copy,
        }
      : null,
  );

  const label = !beat
    ? ''
    : folded
      ? `${beat.speaker} has a word`
      : reachable
        ? `${beat.speaker} is waiting at ${destination!.railName ?? destination!.name}`
        : `${beat.speaker} will want you at ${destination!.name}, level ${destination!.gateLevel}`;

  return (
    <AnimatePresence mode="wait">
      {showing && beat && destination && (
        <motion.button
          /*
           * Keyed on the beat alone — **not** on folded-vs-away.
           *
           * Keying on the state too made every label change an exit and a re-entrance, and with
           * `mode="wait"` the outgoing chip stays mounted, and clickable, until its exit finishes.
           * Walking to the beat's room unmounts the "go here" chip; folding the card a moment
           * later asks for the "show me again" one; and in the couple of hundred milliseconds
           * between, a click landed on the old element and ran the old element's handler, which
           * had nothing to do. The chip looked live and did nothing — measured at settle=0 and
           * gone at settle=600ms, which is the signature of an animation deciding behaviour.
           */
          key={beat.id}
          type="button"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={standard}
          whileHover={{ y: -1 }}
          whileTap={{ y: 1 }}
          onClick={() => {
            // Read the fold now rather than trusting the render that drew this button: a chip on
            // its way out still receives clicks, and it would answer for the state it was born in.
            if (useShellStore.getState().spotlightHidden === beat.id) showSpotlight();
            if (!onSite && reachable) router.push(destination.route);
          }}
          {...tip}
          className="chamfer-sm text-parchment-300/85 hover:text-parchment-300 flex max-w-[22rem] min-w-0 items-center gap-2 border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs transition-colors hover:border-amber-400/70"
          data-testid="tutorial-chip"
          data-beat={beat.id}
        >
          <motion.span
            aria-hidden
            className="shrink-0 text-amber-400"
            animate={{ opacity: [1, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity, repeatType: 'reverse' }}
          >
            <Icon name="spark" size={13} />
          </motion.span>
          <span className="min-w-0 truncate">{label}</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
