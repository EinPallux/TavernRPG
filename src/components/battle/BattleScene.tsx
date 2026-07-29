'use client';

/**
 * The battle scene (combat spec §4) — the game's showpiece.
 *
 * It owns no rules and no state of its own beyond playback position. The engine already
 * decided the fight; `useBattlePlayback` decides *when* each moment happens; this component
 * does nothing but draw the current moment. That split is why a balance change can never
 * break an animation, and why the whole fight can be scrubbed, skipped or replayed for free.
 *
 * Layer order, back to front: backdrop → vignette → fighters → particles → damage numbers →
 * chrome (round chip, controls) → result.
 */

import { useCallback, useMemo, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { BattleEvent, CombatantCard, Side } from '@/engine/combat/types';
import { dramatic, snappy } from '@/styles/motion';
import { BattleFighter } from './BattleFighter';
import { DamageNumbers } from './DamageNumbers';
import { ParticleLayer } from './ParticleLayer';
import { SPEED_OPTIONS, type PlaybackSpeed } from './battleChoreo';
import { useBattlePlayback } from './useBattlePlayback';

export interface BattleSceneProps {
  readonly log: readonly BattleEvent[];
  /** Path under /assets/backgrounds — the zone, arena or dungeon floor this fight happens in. */
  readonly backdrop?: string;
  readonly initialSpeed?: PlaybackSpeed;
  /** Remember the speed the player settled on (settings.battleSpeed). */
  readonly onSpeedChange?: (speed: PlaybackSpeed) => void;
  /** Open at the end — "skip by default" and arena log replays. */
  readonly startFinished?: boolean;
  readonly onFinished?: () => void;
  /** Result screen, revealed once the last beat has played. */
  readonly result?: ReactNode;
  readonly className?: string;
}

/** The opening card is the only place the two fighters are named side by side. */
function VersusFlash({ a, b }: { a: CombatantCard; b: CombatantCard }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.15 }}
      transition={dramatic}
      className="pointer-events-none absolute inset-0 grid place-items-center"
      data-testid="versus-flash"
    >
      <div className="flex items-center gap-5">
        <span className="font-display text-parchment-300 text-right text-2xl font-bold">
          {a.name}
        </span>
        <span className="font-display chamfer-sm border border-amber-500/60 bg-amber-500/15 px-3 py-1 text-xl font-extrabold text-amber-400">
          VS
        </span>
        <span className="font-display text-parchment-300 text-2xl font-bold">{b.name}</span>
      </div>
    </motion.div>
  );
}

export function BattleScene({
  log,
  backdrop = '/assets/backgrounds/mission_background_3.png',
  initialSpeed = 1,
  onSpeedChange,
  startFinished = false,
  onFinished,
  result,
  className = '',
}: BattleSceneProps) {
  const reducedMotion = useReducedMotion();
  const playback = useBattlePlayback({ log, initialSpeed, startFinished, onFinished });
  const { frame, isFinished, progress } = playback;

  // `battle_start` carries both nameplates; without it there is nothing to draw.
  const opening = useMemo(() => log.find((event) => event.t === 'battle_start'), [log]);

  // Speed changes are announced on the click, not from an effect — the preference should be
  // written when the player chooses it, never re-written just because the scene remounted.
  const selectSpeed = useCallback(
    (next: PlaybackSpeed) => {
      playback.setSpeed(next);
      onSpeedChange?.(next);
    },
    [playback, onSpeedChange],
  );

  if (!opening || opening.t !== 'battle_start') return null;

  const cards: Record<Side, CombatantCard> = { a: opening.a, b: opening.b };
  const showVersus = frame.beatIndex <= 0 && !isFinished;
  const shake = reducedMotion ? 0 : frame.shake;

  return (
    <section
      className={`relative h-full w-full overflow-hidden ${className}`}
      data-testid="battle-scene"
      data-finished={isFinished ? 'true' : 'false'}
      aria-label="Battle"
    >
      {/* Backdrop. The push-in is the "camera" settling onto the fight (spec §4 step 1). */}
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${backdrop}')` }}
        initial={reducedMotion || startFinished ? false : { scale: 1.12, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: reducedMotion ? 0.2 : 1.2, ease: 'easeOut' }}
      />
      <div
        aria-hidden
        className="from-wood-900 via-wood-900/70 to-wood-900/35 absolute inset-0 bg-gradient-to-t"
      />
      <div
        aria-hidden
        className="absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_38%,rgb(24_18_14/0.72)_100%)]"
      />

      {/* Everything that shakes, shakes together — the fighters and the sparks, not the chrome. */}
      <motion.div
        className="absolute inset-0"
        style={{ x: shake, y: shake * 0.45 }}
        data-testid="battle-shake-layer"
      >
        {/* Capped width, centred: on a wide stage the fighters would otherwise stand at
            opposite ends of the landscape and the duel would read as two separate portraits. */}
        <div className="absolute inset-0 mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 pb-16">
          <BattleFighter
            card={cards.a}
            side="a"
            health={frame.health.a}
            ghostHealth={frame.ghostHealth.a}
            verse={frame.verse.a}
            lunging={frame.lunging?.side === 'a' ? frame.lunging : null}
            reaction={frame.reaction?.side === 'a' ? frame.reaction.kind : null}
            knockedOut={frame.knockedOut === 'a'}
            entering={!startFinished}
          />
          <BattleFighter
            card={cards.b}
            side="b"
            health={frame.health.b}
            ghostHealth={frame.ghostHealth.b}
            verse={frame.verse.b}
            lunging={frame.lunging?.side === 'b' ? frame.lunging : null}
            reaction={frame.reaction?.side === 'b' ? frame.reaction.kind : null}
            knockedOut={frame.knockedOut === 'b'}
            entering={!startFinished}
          />
        </div>

        <ParticleLayer impacts={frame.impacts} />
        <DamageNumbers numbers={frame.floatingDamage} />
      </motion.div>

      <AnimatePresence>{showVersus && <VersusFlash a={cards.a} b={cards.b} />}</AnimatePresence>

      {/* Round counter */}
      <AnimatePresence>
        {frame.round > 0 && !isFinished && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={snappy}
            className="absolute top-5 left-1/2 -translate-x-1/2"
          >
            <span
              className="chamfer-sm bg-wood-900/85 font-display border border-amber-500/35 px-3.5 py-1 text-xs tracking-[0.3em] text-amber-500 uppercase"
              data-testid="battle-round"
            >
              Round {frame.round}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <PlaybackControls playback={playback} progress={progress} onSelectSpeed={selectSpeed} />

      {/* Result slides up over the stage once the closing beat has landed. */}
      <AnimatePresence>
        {frame.finished && result && (
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={dramatic}
            className="absolute inset-0 z-10 grid place-items-center bg-gradient-to-t from-[rgb(24_18_14/0.94)] via-[rgb(24_18_14/0.78)] to-transparent p-6"
            data-testid="battle-result-layer"
          >
            {result}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * Speed, skip and replay. Sits above the shake layer on purpose — controls that jitter when a
 * hit lands are controls you cannot click.
 */
function PlaybackControls({
  playback,
  progress,
  onSelectSpeed,
}: {
  playback: ReturnType<typeof useBattlePlayback>;
  progress: number;
  onSelectSpeed: (speed: PlaybackSpeed) => void;
}) {
  const { speed, skip, replay, isFinished } = playback;

  return (
    <div className="absolute right-0 bottom-0 left-0 z-20">
      {/* Progress rail: how much fight is left, at a glance. */}
      <div className="bg-wood-900/70 h-[3px] w-full">
        <div
          className="h-full bg-amber-500/80"
          style={{ width: `${progress * 100}%` }}
          data-testid="battle-progress"
        />
      </div>

      <div className="bg-wood-900/85 flex items-center justify-between gap-4 px-5 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-1.5" role="group" aria-label="Playback speed">
          <span className="text-parchment-500/50 mr-1 text-[10px] tracking-[0.25em] uppercase">
            Speed
          </span>
          {SPEED_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSelectSpeed(option)}
              aria-pressed={speed === option}
              className={`chamfer-sm font-display border px-2.5 py-1 text-xs font-bold transition-colors ${
                speed === option
                  ? 'text-ink-900 border-amber-400 bg-amber-500'
                  : 'border-parchment-500/25 text-parchment-500/70 hover:border-amber-500/60 hover:text-amber-500'
              }`}
              data-testid={`battle-speed-${option}`}
            >
              ×{option}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={isFinished ? replay : skip}
          className="chamfer-sm border-parchment-500/25 text-parchment-500/75 border px-3 py-1 text-xs tracking-widest uppercase hover:border-amber-500/60 hover:text-amber-500"
          data-testid={isFinished ? 'battle-replay' : 'battle-skip'}
        >
          {isFinished ? 'Replay' : 'Skip ▸'}
        </button>
      </div>
    </div>
  );
}
