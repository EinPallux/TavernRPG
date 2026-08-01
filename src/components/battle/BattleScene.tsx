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

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { BattleEvent, CombatantCard, Side } from '@/engine/combat/types';
import { PROC_PALETTE, schoolFor } from '@/data/combatVfx';
import { useTooltip } from '@/components/ui/Tooltip';
import { dramatic, snappy } from '@/styles/motion';
import { BattleCallouts, CALLOUT_DURATION } from './BattleCallouts';
import { BattleFighter } from './BattleFighter';
import { DamageNumbers } from './DamageNumbers';
import { ParticleLayer, type StageAnchor } from './ParticleLayer';
import { SPEED_OPTIONS, type PlaybackSpeed } from './battleChoreo';
import type { BattleFrame } from './timeline';
import { useBattlePlayback } from './useBattlePlayback';
import { useBattleSfx } from './useBattleSfx';

/**
 * Where the fighters stand, before anybody has measured them.
 *
 * These were the *only* values the particle layer ever had, and they are right at roughly one
 * window width. They survive as the pre-measurement fallback and as the value used in tests,
 * where there is no layout to read.
 */
const FALLBACK_ANCHORS: Record<Side, StageAnchor> = {
  a: { x: 0.3, y: 0.52 },
  b: { x: 0.7, y: 0.52 },
};

/**
 * Measure both portraits against the stage, as fractions.
 *
 * On mount and on resize only — never per frame. The refs are on static wrappers so what comes
 * back is where the fighter *stands*, not where they happen to be mid-lunge.
 */
function useStageAnchors(
  stage: React.RefObject<HTMLElement | null>,
  spots: Record<Side, React.RefObject<HTMLDivElement | null>>,
): Record<Side, StageAnchor> {
  const [anchors, setAnchors] = useState(FALLBACK_ANCHORS);

  useLayoutEffect(() => {
    const host = stage.current;
    if (!host) return;

    const measure = () => {
      const frame = host.getBoundingClientRect();
      if (frame.width === 0 || frame.height === 0) return;

      const read = (side: Side): StageAnchor => {
        const node = spots[side].current;
        if (!node) return FALLBACK_ANCHORS[side];
        const box = node.getBoundingClientRect();
        return {
          x: (box.left + box.width / 2 - frame.left) / frame.width,
          y: (box.top + box.height / 2 - frame.top) / frame.height,
        };
      };

      const next = { a: read('a'), b: read('b') };
      setAnchors((current) =>
        current.a.x === next.a.x &&
        current.a.y === next.a.y &&
        current.b.x === next.b.x &&
        current.b.y === next.b.y
          ? current
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [stage, spots]);

  return anchors;
}

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
  /** Override the eight-second pacing target. The Undertavern's long fights need it. */
  readonly targetDuration?: number;
  /**
   * The first fight of a save: three explanatory notes, pinned to ×1 (tutorial spec §2 beat 3).
   *
   * The pin is the point. A player who left the speed on ×4 from a previous character would
   * watch the whole lesson go past in two seconds, and the notes are the one thing here that has
   * to be readable. Skip still works — pinning the speed is not trapping anybody.
   */
  readonly callouts?: boolean;
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

/**
 * A boss naming its signature, before the first blow (dungeons spec §2).
 *
 * The one piece of *text* the battle scene asks the player to read, which is why it takes the
 * whole stage and holds. Floors 5 and 10 are walls by design; a wall that kills you without
 * saying why is a bug report, and a wall that tells you it heals when you miss is a puzzle.
 */
function BossTrait({
  label,
  explainer,
  reduced,
}: {
  label: string;
  explainer: string;
  reduced: boolean;
}) {
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.3, y: -14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={dramatic}
      className="pointer-events-none absolute inset-x-0 top-1/3 z-10 grid place-items-center px-8"
      data-testid="boss-trait"
    >
      <div className="chamfer-md border-ember-600/60 bg-wood-900/92 max-w-lg border-2 px-6 py-4 text-center shadow-[0_0_44px_rgb(217_108_47/0.35)]">
        <p className="font-display text-ember-400 text-xl font-extrabold tracking-[0.14em] uppercase">
          {label}
        </p>
        <p className="text-parchment-300/85 mt-1.5 text-sm leading-relaxed">{explainer}</p>
      </div>
    </motion.div>
  );
}

/** The swarm's telegraph — a beat of warning before an unavoidable hit. */
function SwarmCry({ label, side }: { label: string; side: Side }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.4 }}
      transition={snappy}
      className="pointer-events-none absolute inset-x-0 top-[38%] grid place-items-center"
      data-testid="swarm-cry"
    >
      <span
        className="chamfer-sm border-ember-600/50 bg-wood-900/85 text-ember-400 font-display border px-3 py-1 text-sm font-bold tracking-[0.2em] uppercase"
        style={{ transform: `translateX(${side === 'a' ? '-18%' : '18%'})` }}
      >
        {label}
      </span>
    </motion.div>
  );
}

/**
 * Gear sets, doing something (gear-sets spec §3).
 *
 * The spec's words are "a named flourish over the fighter it fired for", and until the VFX pass
 * there was no flourish and no name: `set_proc` had a beat on the timeline and no case in the
 * frame, so a five-piece capstone firing was two hundred milliseconds of nothing. Eight effects,
 * invisible since Phase 12.
 *
 * Positioned off the same measured anchors the particles use, so the label lands on the fighter
 * rather than near them, and driven off `progress` rather than a spring — at ×4 three of these
 * can be alive at once and a spring would still be easing the first.
 */
function SetProcFlourishes({
  procs,
  anchors,
}: {
  procs: BattleFrame['procs'];
  anchors: Record<Side, StageAnchor>;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" data-testid="set-procs">
      {procs.map((proc) => {
        const at = anchors[proc.side];
        /*
         * Outward, beside the fighter — not stacked above them.
         *
         * The column over a portrait is the busiest strip on the stage: damage numbers own
         * 62–136px of it and the nameplate and health bar own everything above that. Two
         * screenshots went into learning this — the first version wrote the label across the
         * fighter's face, the second wrote it across their name.
         *
         * The clear space is *outboard*: away from the middle of the stage, at eye level, where
         * there is nothing but backdrop. As a share of the stage rather than a pixel offset, so
         * it stays beside the fighter at every window width instead of drifting onto them.
         */
        const outward = (proc.side === 'a' ? -1 : 1) * 0.075;
        const rise = 8 + (1 - (1 - proc.progress) ** 2) * 30;
        const opacity = proc.progress > 0.65 ? (1 - proc.progress) / 0.35 : 1;
        const palette = PROC_PALETTE[proc.effect];

        return (
          <span
            key={proc.id}
            data-testid={`set-proc-${proc.effect}`}
            className="chamfer-sm font-display bg-wood-900/92 absolute block border px-2 py-1 text-[10px] font-bold tracking-[0.18em] whitespace-nowrap uppercase"
            style={{
              left: `${(at.x + outward) * 100}%`,
              top: `${at.y * 100}%`,
              transform: `translate(-50%, calc(-50% - ${rise}px)) scale(${0.85 + proc.progress * 0.15})`,
              opacity,
              color: palette.glow,
              borderColor: palette.core,
              boxShadow: `0 0 18px -4px ${palette.core}`,
            }}
          >
            {proc.label}
            {proc.amount > 0 && (
              <span className="ml-1.5 tabular-nums opacity-80">{proc.amount.toLocaleString()}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function BattleScene({
  log,
  backdrop = '/assets/backgrounds/mission_background_3.webp',
  initialSpeed = 1,
  onSpeedChange,
  startFinished = false,
  onFinished,
  result,
  targetDuration,
  callouts = false,
  className = '',
}: BattleSceneProps) {
  const reducedMotion = useReducedMotion();

  // `battle_start` carries both nameplates; without it there is nothing to draw.
  const opening = useMemo(() => log.find((event) => event.t === 'battle_start'), [log]);

  /**
   * Each fighter's school, from the only identity the scene has: the nameplate's `kind`.
   *
   * Resolved before playback because the timeline needs one bit of it — a fighter who throws gets
   * a longer wind-up, or the bolt is in the air for six frames.
   */
  const schools = useMemo(() => {
    if (!opening || opening.t !== 'battle_start') {
      return { a: schoolFor(''), b: schoolFor('') };
    }
    return { a: schoolFor(opening.a.kind), b: schoolFor(opening.b.kind) };
  }, [opening]);

  const ranged = useMemo(() => ({ a: !schools.a.melee, b: !schools.b.melee }), [schools]);

  // The tutorial fight ignores both the remembered speed and the remembered skip preference:
  // there is nothing to skip past yet, and the notes have to be legible (spec §2 beat 3).
  const pace = callouts ? CALLOUT_DURATION : targetDuration;
  const playback = useBattlePlayback({
    log,
    initialSpeed: callouts ? 1 : initialSpeed,
    startFinished: callouts ? false : startFinished,
    onFinished,
    ranged,
    ...(pace === undefined ? {} : { targetDuration: pace }),
  });
  const { frame, isFinished, progress, choreo } = playback;

  // The scene draws the frame; this hears it. Edge-triggered inside the hook, so the component
  // stays a renderer (combat spec §4).
  useBattleSfx(frame, isFinished, ranged);

  /*
   * Where the sparks go. Refs must be created unconditionally — the early return below is after
   * every hook, which is why this sits here rather than beside the JSX it serves.
   */
  const stageRef = useRef<HTMLElement>(null);
  const spotA = useRef<HTMLDivElement>(null);
  const spotB = useRef<HTMLDivElement>(null);
  const spots = useMemo(() => ({ a: spotA, b: spotB }), []);
  const anchors = useStageAnchors(stageRef, spots);

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
  /** Rises and falls with the crit's own swing — a bloom, not a flash. */
  const critGlow =
    reducedMotion || !frame.lunging?.crit ? 0 : Math.sin(frame.lunging.progress * Math.PI) * 0.9;

  return (
    <section
      ref={stageRef}
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
            reaction={frame.reaction?.side === 'a' ? frame.reaction : null}
            knockedOut={frame.knockedOut === 'a'}
            entering={!startFinished}
            school={schools.a}
            castLead={choreo.castLead}
            flash={frame.flash.a}
            recoil={frame.recoil.a}
            hardened={frame.hardened.a}
            portraitRef={spotA}
          />
          <BattleFighter
            card={cards.b}
            side="b"
            health={frame.health.b}
            ghostHealth={frame.ghostHealth.b}
            verse={frame.verse.b}
            lunging={frame.lunging?.side === 'b' ? frame.lunging : null}
            reaction={frame.reaction?.side === 'b' ? frame.reaction : null}
            knockedOut={frame.knockedOut === 'b'}
            entering={!startFinished}
            school={schools.b}
            castLead={choreo.castLead}
            flash={frame.flash.b}
            recoil={frame.recoil.b}
            hardened={frame.hardened.b}
            portraitRef={spotB}
          />
        </div>

        <ParticleLayer
          impacts={frame.impacts}
          schools={schools}
          anchors={anchors}
          flight={frame.lunging}
          castLead={choreo.castLead}
        />
        <DamageNumbers numbers={frame.floatingDamage} anchors={anchors} />
        <SetProcFlourishes procs={frame.procs} anchors={anchors} />
      </motion.div>

      {/*
        The crit's moment.

        `critHold` has extended the attack beat since Phase 4 — the fight genuinely pauses on a
        critical hit — but nothing on screen marked the pause, so the extra 140ms read as a
        dropped frame rather than as emphasis. A warm bloom from the edges, driven off the swing's
        own progress so it rises and falls with the blow rather than on a timer of its own.
      */}
      {critGlow > 0 && (
        <div
          aria-hidden
          data-testid="crit-bloom"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 32%, rgb(240 184 98 / 0.30) 100%)',
            opacity: critGlow,
          }}
        />
      )}

      <AnimatePresence>{showVersus && <VersusFlash a={cards.a} b={cards.b} />}</AnimatePresence>

      {/* The three explanatory notes, first fight only. */}
      {callouts && (
        <BattleCallouts progress={progress} hero={cards.a} foe={cards.b} finished={isFinished} />
      )}

      {/* The boss naming its trick, and the swarm announcing itself (dungeons spec §2). */}
      <AnimatePresence>
        {frame.trait && (
          <BossTrait
            key="trait"
            label={frame.trait.label}
            explainer={frame.trait.explainer}
            reduced={reducedMotion === true}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {frame.swarm && <SwarmCry key="swarm" label={frame.swarm.label} side={frame.swarm.side} />}
      </AnimatePresence>

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

      <PlaybackControls
        playback={playback}
        progress={progress}
        onSelectSpeed={selectSpeed}
        speedLocked={callouts}
      />

      {/* Result slides up over the stage once the closing beat has landed. */}
      <AnimatePresence>
        {frame.finished && result && (
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={dramatic}
            /* `pb-20` clears the playback bar, which stays mounted (for Replay) at a higher
               z-index. A short mission result floats well above it; a dungeon result carrying a
               best-attempt bar or a clear ceremony grows until "Continue" lands underneath the
               bar and stops taking clicks. */
            className="absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-gradient-to-t from-[rgb(24_18_14/0.94)] via-[rgb(24_18_14/0.78)] to-transparent p-6 pb-20"
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
  speedLocked = false,
}: {
  playback: ReturnType<typeof useBattlePlayback>;
  progress: number;
  onSelectSpeed: (speed: PlaybackSpeed) => void;
  /** The tutorial fight runs at ×1; the buttons say why rather than going quietly dead. */
  speedLocked?: boolean;
}) {
  const { speed, skip, replay, isFinished } = playback;
  const speedTip = useTooltip(
    speedLocked && {
      title: 'Locked at ×1',
      detail: 'The first fight plays at normal speed — there is a bit to read.',
    },
  );

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
          <span className="text-parchment-500/72 mr-1 text-[10px] tracking-[0.25em] uppercase">
            Speed
          </span>
          {SPEED_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSelectSpeed(option)}
              disabled={speedLocked}
              {...speedTip}
              aria-pressed={speed === option}
              className={`chamfer-sm font-display border px-2.5 py-1 text-xs font-bold transition-colors ${
                speed === option
                  ? 'text-ink-900 border-amber-400 bg-amber-500'
                  : 'border-parchment-500/25 text-parchment-500/72 hover:border-amber-500/60 hover:text-amber-500'
              } ${speedLocked && speed !== option ? 'cursor-not-allowed opacity-40' : ''}`}
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
