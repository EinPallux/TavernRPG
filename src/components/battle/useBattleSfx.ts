'use client';

/**
 * The fight, heard (asset-pipeline.md §6).
 *
 * The scene already computes a frame per animation tick — impacts, reactions, a knockout, the
 * closing beat. This turns that frame into cues without the scene learning anything about audio:
 * hand it the frame, it works out what is *new* since the last one and plays that.
 *
 * **Every cue is edge-triggered.** A frame is a picture of the current moment, not an event, and
 * the same impact is present in a dozen consecutive frames — playing on presence would fire the
 * hit cue sixty times a second. Impacts carry ids, so "new" is exact; the reaction and the
 * knockout are compared against the last frame's.
 *
 * Silence is the default everywhere: `play()` no-ops with SFX off, and the hook does nothing at
 * all while playback has not started.
 */

import { useEffect, useRef } from 'react';
import type { Side } from '@/engine/combat/types';
import type { BattleFrame } from './timeline';
import type { SfxId } from '@/data/sfx';
import { play } from '@/state/sfx';

type ReactionKind = NonNullable<BattleFrame['reaction']>['kind'];

/**
 * The timeline says `blocked`; the mixer says `block`. Two vocabularies, one checked bridge.
 *
 * This shipped for an afternoon as `play(frame.reaction.kind)`, which type-checked against the
 * old `play(id: string)` and then no-opped forever — a fight that is quiet in exactly one way
 * nobody would think to listen for. `satisfies Record<ReactionKind, SfxId>` makes both halves of
 * that mistake a compile error: a new reaction kind has no entry, a renamed cue has no target.
 */
const REACTION_CUES = {
  blocked: 'block',
  dodged: 'dodge',
  missed: 'miss',
} as const satisfies Record<ReactionKind, SfxId>;

export function useBattleSfx(
  frame: BattleFrame,
  finished: boolean,
  /**
   * Which sides throw rather than swing.
   *
   * The hook needs this and nothing else about the schools: `cast` is a magical swell and playing
   * it on a Warrior's shoulder-charge would be the "two vocabularies" bug again, from the audio
   * side. Defaults to nobody, so a caller that has not thought about it stays quiet rather than
   * wrong.
   */
  ranged: Readonly<Record<Side, boolean>> = { a: false, b: false },
): void {
  const heardImpacts = useRef(new Set<string>());
  const heardProcs = useRef(new Set<string>());
  const lastCast = useRef<string | null>(null);
  const lastReaction = useRef<string | null>(null);
  const lastKo = useRef<string | null>(null);
  const announced = useRef(false);

  useEffect(() => {
    /*
     * A skipped fight is a *silent* fight.
     *
     * Skip jumps the timeline to the end, which means every impact in the log becomes "new" in
     * one frame. Firing forty cues into the same millisecond is not a fight, it is a noise, and
     * the throttle would only turn it into an arbitrary two of them.
     */
    if (finished) {
      if (!announced.current) {
        announced.current = true;
        // `knockedOut` is the loser, so side 'b' going down is the player's win.
        play(lastKo.current === 'b' ? 'victory' : 'defeat');
      }
      return;
    }

    /*
     * Only `hit` bursts are a hit.
     *
     * The VFX pass gave blocks, dodges, mends and set procs their own bursts on the same list,
     * and firing the impact cue for all of them would have played a sword-on-flesh thud for a
     * shield turning a blow aside — while the *reaction* cue below played the correct one, half a
     * frame apart. A single `kind` check keeps one occasion to one sound.
     */
    for (const impact of frame.impacts) {
      if (impact.kind !== 'hit') continue;
      if (heardImpacts.current.has(impact.id)) continue;
      heardImpacts.current.add(impact.id);
      play(impact.crit ? 'crit' : 'hit');
    }

    // Gear doing something on its own — distinct from your weapon connecting.
    for (const proc of frame.procs) {
      if (heardProcs.current.has(proc.id)) continue;
      heardProcs.current.add(proc.id);
      play('proc');
    }

    /*
     * A spell leaving the hand, once per swing.
     *
     * Keyed on the *beat* rather than on the side, because two consecutive casts by the same
     * fighter are two casts — and `lunging` is present on every frame of a swing, so anything
     * less exact fires sixty times. `beatIndex` changes when the swing does.
     */
    const casting = frame.lunging && ranged[frame.lunging.side] ? frame.lunging : null;
    const cast = casting ? `${frame.beatIndex}:${casting.side}` : null;
    if (cast !== lastCast.current) {
      lastCast.current = cast;
      if (casting) play('cast');
    }

    const reaction = frame.reaction ? `${frame.reaction.side}:${frame.reaction.kind}` : null;
    if (reaction !== lastReaction.current) {
      lastReaction.current = reaction;
      if (frame.reaction) play(REACTION_CUES[frame.reaction.kind]);
    }

    if (frame.knockedOut !== lastKo.current) {
      lastKo.current = frame.knockedOut;
      if (frame.knockedOut) play('ko');
    }
  }, [frame, finished, ranged]);
}
