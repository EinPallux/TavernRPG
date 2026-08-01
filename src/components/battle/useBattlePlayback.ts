'use client';

/**
 * Playback — walks the timeline in real time and hands the scene one frame at a time.
 *
 * Built on elapsed time rather than a queue of timers: the frame is *derived* from the clock,
 * so changing speed mid-fight, skipping to the end, or replaying costs nothing and can never
 * leave the scene in a half-updated state.
 *
 * Position is anchored to a timestamp rather than accumulated per frame, so a dropped frame
 * (or a backgrounded tab) doesn't leave the fight running slow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import type { BattleEvent } from '@/engine/combat/types';
import { choreoFor, type BattleChoreo, type PlaybackSpeed } from './battleChoreo';
import {
  buildTimeline,
  frameAt,
  type BattleFrame,
  type RangedSides,
  type Timeline,
} from './timeline';

export interface BattlePlayback {
  readonly frame: BattleFrame;
  readonly timeline: Timeline;
  /**
   * The timings this playback is running on — already resolved against reduced motion.
   *
   * Exposed so the scene and the particle layer read `castLead` from the same place the timeline
   * did. A cast whose gather ended at one number while its bolt left on another would show the
   * fighter snapping forward before the projectile existed, and nothing but an eye would catch it.
   */
  readonly choreo: BattleChoreo;
  readonly speed: PlaybackSpeed;
  readonly isPlaying: boolean;
  readonly isFinished: boolean;
  /** 0–1 through the fight, for a progress rail. */
  readonly progress: number;
  setSpeed: (speed: PlaybackSpeed) => void;
  /** Jump straight to the end — the "I have seen enough" button. */
  skip: () => void;
  replay: () => void;
}

export interface UseBattlePlaybackOptions {
  readonly log: readonly BattleEvent[];
  readonly initialSpeed?: PlaybackSpeed;
  /** Start at the end (arena replays and "skip by default" flows). */
  readonly startFinished?: boolean;
  /** Fires once the last beat has played, however playback got there — including Skip. */
  readonly onFinished?: () => void;
  /**
   * How long the whole fight should take at ×1, overriding the eight-second default.
   *
   * The Undertavern is the only caller: its floors carry a ×1.35 stat budget and its bosses
   * ×1.6, which produces genuinely longer fights (see `DUNGEON_FIGHT_DURATION`). Squeezing
   * eighteen rounds into eight seconds does not make a fast fight, it makes an unreadable one.
   */
  readonly targetDuration?: number;
  /**
   * Which sides throw rather than swing.
   *
   * Reaches the timeline so a cast gets `castWindUp` instead of `attackWindUp` — the bolt has to
   * be in the air long enough to be a bolt. Resolved by the scene from each fighter's school.
   */
  readonly ranged?: RangedSides;
}

interface PlaybackState {
  /** Which fight this position belongs to. A different timeline resets everything. */
  readonly timeline: Timeline;
  readonly elapsed: number;
  readonly isPlaying: boolean;
  readonly speed: PlaybackSpeed;
}

function freshState(
  timeline: Timeline,
  startFinished: boolean,
  speed: PlaybackSpeed,
): PlaybackState {
  return {
    timeline,
    elapsed: startFinished ? timeline.duration : 0,
    isPlaying: !startFinished,
    speed,
  };
}

export function useBattlePlayback({
  log,
  initialSpeed = 1,
  startFinished = false,
  onFinished,
  targetDuration,
  ranged,
}: UseBattlePlaybackOptions): BattlePlayback {
  const reducedMotion = useReducedMotion();
  const choreo = useMemo(() => choreoFor(Boolean(reducedMotion)), [reducedMotion]);
  const timeline = useMemo(
    () =>
      buildTimeline(log, choreo, {
        ...(targetDuration === undefined ? {} : { targetDuration }),
        ...(ranged === undefined ? {} : { ranged }),
      }),
    [log, choreo, targetDuration, ranged],
  );

  const [state, setState] = useState<PlaybackState>(() =>
    freshState(timeline, startFinished, initialSpeed),
  );

  /**
   * A new fight (or a re-choreographed one) resets position without an effect: the stale state
   * is simply ignored until something writes over it. Rendering stays a pure function of props.
   */
  const active =
    state.timeline === timeline ? state : freshState(timeline, startFinished, state.speed);
  const { elapsed, isPlaying, speed } = active;

  // Latest-value mirrors, so the animation loop can restart mid-fight without re-subscribing
  // every frame. Both are written from effects, never during render.
  const elapsedRef = useRef(elapsed);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    elapsedRef.current = elapsed;
    onFinishedRef.current = onFinished;
  });

  useEffect(() => {
    if (!isPlaying) return;

    const total = timeline.duration;
    const from = elapsedRef.current;
    let anchor: number | null = null;
    let raf = 0;

    const tick = (now: number) => {
      anchor ??= now;
      const next = from + (now - anchor) * speed;

      if (next >= total) {
        elapsedRef.current = total;
        setState({ timeline, elapsed: total, isPlaying: false, speed });
        onFinishedRef.current?.();
        return;
      }

      elapsedRef.current = next;
      setState({ timeline, elapsed: next, isPlaying: true, speed });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, speed, timeline]);

  const isFinished = elapsed >= timeline.duration;
  const frame = useMemo(() => frameAt(timeline, elapsed, choreo), [timeline, elapsed, choreo]);

  const setSpeed = useCallback(
    (next: PlaybackSpeed) => {
      setState({ timeline, elapsed: elapsedRef.current, isPlaying, speed: next });
    },
    [timeline, isPlaying],
  );

  const skip = useCallback(() => {
    if (elapsedRef.current >= timeline.duration) return;
    elapsedRef.current = timeline.duration;
    setState({ timeline, elapsed: timeline.duration, isPlaying: false, speed });
    onFinishedRef.current?.();
  }, [timeline, speed]);

  const replay = useCallback(() => {
    elapsedRef.current = 0;
    setState({ timeline, elapsed: 0, isPlaying: true, speed });
  }, [timeline, speed]);

  return {
    frame,
    timeline,
    choreo,
    speed,
    isPlaying,
    isFinished,
    progress: timeline.duration > 0 ? Math.min(1, elapsed / timeline.duration) : 1,
    setSpeed,
    skip,
    replay,
  };
}
