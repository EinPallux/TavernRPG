'use client';

/**
 * The Long Road (campaign spec §4).
 *
 * A row of twelve stones per chapter, one battle mounted at the wall, and a button that keeps
 * going until something stops it. The player asked for Raid's campaign, and the thing that makes
 * that loop work is not the ladder — it is that pressing **once** buys you as far as your hero can
 * get, and the run ends by *telling you why*.
 *
 * ## The three states, and the one that matters
 *
 * `road` is the map: chapters, cleared stones, the wall picked out in amber. `fighting` mounts the
 * real `BattleScene` over the road — the same choreographed fight the tavern and the Undertavern
 * use, because a stage is a fight and there is only one of those in this game. `finished` is the
 * end of a push: how far you got, what it paid, and what stopped you.
 *
 * **AUTO is the feature.** Left alone it fights the wall, waits for the scene to end, banks the
 * result and starts the next one — chaining until a loss, an empty Vigor tankard, the end of the
 * road, or the player pressing stop. That last one is not a detail: an auto-runner you cannot
 * interrupt is a cutscene.
 *
 * ## Two things that would go wrong if written the obvious way
 *
 * **The chain lives in a ref, not in the render.** A `setTimeout` closure that captured `save`
 * would bank the *previous* stage's Vigor on every second hop, because the store has moved on by
 * the time it fires. Every step reads `useGameStore.getState()` — the same rule the tutorial chip
 * learned (style guide §7.1): read the store in the handler, never the closure.
 *
 * **A stage resolves once.** `fightStage` is deterministic in `(worldSeed, stage, attempt)`, so
 * the store's resolution and the scene's playback are the same fight — but only because the store
 * is asked *first* and the scene is handed the log it produced. Resolving twice would show one
 * fight and bank another.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { Meter } from '@/components/ui/Meter';
import { BattleScene } from '@/components/battle/BattleScene';
import { BattleResult, type BattleRewards } from '@/components/battle/BattleResult';
import { Icon, LockIcon } from '@/components/icons';
import { useTooltip } from '@/components/ui/Tooltip';
import { analyseBattle } from '@/engine/combat/analysis';
import type { AlbumRecord } from '@/engine/album/album';
import { CHAPTERS, TOTAL_STAGES } from '@/data/campaign';
import { PLACES_BY_ID } from '@/data/places';
import { useGameStore } from '@/state/gameStore';
import { gameNow } from '@/state/clock';
import { play } from '@/state/sfx';
import {
  chapterView,
  openChapters,
  roadOf,
  wallView,
  STAGE_VIGOR_COST,
  type PushOutcome,
  type StageView,
} from '@/state/campaignActions';
import { dramatic, snappy, standard } from '@/styles/motion';

const PLACE = PLACES_BY_ID.campaign;

/** `[TUNE]` A stage fight is a beat, not an epic — four seconds, against the tavern's eight. */
const STAGE_FIGHT_DURATION = 4_000;
/** `[TUNE]` A chapter boss gets the full length. It is the thing you came for. */
const BOSS_FIGHT_DURATION = 7_500;
/** `[TUNE]` Breath between two auto-chained stages, so a run reads as steps rather than a blur. */
const CHAIN_PAUSE_MS = 420;

interface Push {
  readonly outcome: PushOutcome;
  readonly leveledTo: number | null;
  /** What the album took from the stage, if anything (album spec §4). */
  readonly album: AlbumRecord | null;
}

/** Why a run of the road came to an end — the only thing a summary really has to say. */
type StopReason = 'lost' | 'vigor' | 'stopped' | 'finished';

const STOP_COPY: Readonly<Record<StopReason, string>> = {
  lost: 'The road stopped you. Go and get stronger — it will be here.',
  vigor: 'Out of Vigor. The tankard fills again at midnight.',
  stopped: 'You stepped off the road.',
  finished: 'There is no more road. You walked all of it.',
};

export function CampaignScreen() {
  const save = useGameStore((state) => state.save);
  const fightStage = useGameStore((state) => state.fightCampaignStage);
  const battleSpeed = useGameStore((state) => state.save?.settings.battleSpeed ?? 1);
  const setBattleSpeed = useGameStore((state) => state.setBattleSpeed);

  const [push, setPush] = useState<Push | null>(null);
  /** `null` means "wherever the player is standing" — see the note below the derivations. */
  const [pinned, setPinned] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [run, setRun] = useState<{ cleared: number; gold: number; xp: number } | null>(null);
  const [stopped, setStopped] = useState<StopReason | null>(null);

  /*
   * The chain's own copy of "are we still going".
   *
   * React state is a frame behind by design, and this is read from inside a timeout that has to
   * know *now* whether the player has pressed stop. Two sources of truth for one flag would be a
   * bug; this one is the authority and `auto` is its rendering.
   */
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reached = save ? openChapters(save) : 1;
  const wall = save ? wallView(save) : null;
  const vigor = save?.activity.vigor ?? 0;
  const road = save ? roadOf(save) : null;

  /*
   * Which chapter the board is showing — **derived by default, pinned only on request.**
   *
   * The first version of this held the chapter in state seeded at 1 and corrected it during
   * render when `reached` *changed*. That is the right pattern for following a boss's fall and
   * completely wrong for arriving: on the first render nothing has changed, so a player who
   * reloaded twenty stages in was shown chapter I with no stone on it to press. The e2e reload
   * test found it, which is the only place it could have been found — every unit test asks
   * `chapterView` for a chapter by number and gets the right answer.
   *
   * So the default is not a number, it is *absence*: show where they are standing. Clicking a
   * numeral pins one, and clearing the pin is what "follow them" means when a chapter completes.
   */
  const chapter = pinned ?? reached;
  const view = save ? chapterView(save, chapter) : null;

  /*
   * Adjusted during render rather than in an effect, which is React's documented pattern for
   * "state that depends on a prop changing" and the one `PlaceStage` already uses. An effect would
   * work and would also drag a player back out of chapter II every time they went to look at it,
   * because it cannot tell "the reached chapter moved" from "something else re-rendered".
   */
  const [followed, setFollowed] = useState(reached);
  if (followed !== reached) {
    setFollowed(reached);
    setPinned(null);
  }

  const halt = useCallback((reason: StopReason) => {
    running.current = false;
    setAuto(false);
    setStopped(reason);
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      running.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  /**
   * Fight one stage, whatever the reason for fighting it.
   *
   * Reads the store rather than the render's `save`, because in a chain this is called from a
   * timeout whose closure was made two stages ago.
   */
  const fightOne = useCallback(
    (stage: number): boolean => {
      const result = fightStage(stage, gameNow());
      if (!result.ok) {
        halt(result.refusal.kind === 'out-of-vigor' ? 'vigor' : 'stopped');
        return false;
      }

      setPush({ outcome: result.outcome, leveledTo: result.leveledTo, album: result.album });
      setRun((previous) => ({
        cleared:
          (previous?.cleared ?? 0) + (result.outcome.won && !result.outcome.practice ? 1 : 0),
        gold: (previous?.gold ?? 0) + result.outcome.spoils.gold,
        xp: (previous?.xp ?? 0) + result.outcome.spoils.xp,
      }));
      play(result.outcome.won ? 'victory' : 'defeat');
      return true;
    },
    [fightStage, halt],
  );

  /** The scene has finished playing. Bank it, then decide whether the run goes on. */
  const onSceneDone = useCallback(() => {
    const current = push;
    setPush(null);
    if (!current) return;

    if (!running.current) return;

    if (!current.outcome.won) {
      halt('lost');
      return;
    }

    const state = useGameStore.getState().save;
    if (!state) return halt('stopped');

    const next = roadOf(state).stagesCleared + 1;
    if (next > TOTAL_STAGES) return halt('finished');
    if (state.activity.vigor < STAGE_VIGOR_COST) return halt('vigor');

    timer.current = setTimeout(() => {
      if (running.current) fightOne(next);
    }, CHAIN_PAUSE_MS);
  }, [push, halt, fightOne]);

  const startAuto = () => {
    if (!wall) return;
    running.current = true;
    setAuto(true);
    setStopped(null);
    setRun({ cleared: 0, gold: 0, xp: 0 });
    fightOne(wall.stage);
  };

  const fightOnce = (stage: number) => {
    running.current = false;
    setAuto(false);
    setStopped(null);
    setRun(null);
    fightOne(stage);
  };

  if (!save?.hero || !road) return null;

  return (
    <AmbientStage
      backdrop={PLACE.backdrop}
      {...(PLACE.tint ? { tint: PLACE.tint } : {})}
      {...(PLACE.effects ? { effects: PLACE.effects } : {})}
    >
      <div className="h-full overflow-y-auto px-6 py-5" data-testid="place-campaign">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
          <Header cleared={road.stagesCleared} vigor={vigor} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
            <ChapterBoard
              chapter={chapter}
              reached={reached}
              view={view}
              onChapter={setPinned}
              onFight={fightOnce}
              busy={auto}
            />

            <WallPanel
              wall={wall}
              vigor={vigor}
              auto={auto}
              run={run}
              stopped={stopped}
              onStart={startAuto}
              onStop={() => halt('stopped')}
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {push && (
          <motion.div
            key="stage-fight"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={standard}
            className="absolute inset-0 z-30"
            data-testid="campaign-fight"
          >
            <StageFight
              push={push}
              heroName={save.hero.name}
              speed={battleSpeed}
              auto={auto}
              onSpeedChange={setBattleSpeed}
              onDone={onSceneDone}
            />

            {/*
             * The stop button, over the fight.
             *
             * It was on the road panel first, which the battle scene covers completely — so
             * during a chain there was no frame in which it could be pressed, and an auto-runner
             * you cannot interrupt is a cutscene. It rides above the scene now, and doubles as
             * the run's readout: which stage, how many cleared, how much Vigor is left.
             */}
            {auto && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={snappy}
                className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center"
              >
                <div className="chamfer-sm surface-timber bg-wood-900/92 pointer-events-auto flex items-center gap-3 border border-amber-500/45 py-1.5 pr-1.5 pl-3">
                  <motion.span
                    aria-hidden
                    animate={{ opacity: [1, 0.35, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="h-1.5 w-1.5 rounded-full bg-amber-500"
                  />
                  <span className="font-display text-[11px] tracking-[0.2em] text-amber-500 uppercase">
                    Pushing on
                  </span>
                  <span className="text-parchment-500/72 text-[11px] tabular-nums">
                    stage {push.outcome.stage} · {run?.cleared ?? 0} cleared · {vigor} vigor
                  </span>
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    onClick={() => halt('stopped')}
                    data-testid="road-stop-overlay"
                  >
                    Stop
                  </ActionButton>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </AmbientStage>
  );
}

/* ── The road's header ────────────────────────────────────────────────────────────── */

function Header({ cleared, vigor }: { cleared: number; vigor: number }) {
  const tip = useTooltip({
    title: `${cleared} of ${TOTAL_STAGES} stages`,
    detail: 'Cleared for good. A stage you have beaten stays beaten.',
  });

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-display text-[11px] tracking-[0.32em] text-amber-500 uppercase">
          Out of the gate
        </p>
        <h1 className="font-display text-parchment-300 text-3xl font-extrabold">The Long Road</h1>
        <p className="text-parchment-500/72 mt-1 max-w-xl text-sm leading-relaxed">
          A hundred and twenty stages between here and Frostfell Ridge. One Vigor a stage, and
          nothing between you and the end of it but whatever is standing in the way.
        </p>
      </div>

      <div className="flex items-end gap-3" {...tip} tabIndex={0} data-testid="road-progress">
        <div className="w-64">
          <div className="text-parchment-500/72 mb-1 flex items-baseline justify-between text-[11px] tracking-[0.18em] uppercase">
            <span>Road walked</span>
            <span className="font-display text-parchment-300 text-sm tracking-normal tabular-nums">
              {cleared}
              <span className="text-parchment-500/72">/{TOTAL_STAGES}</span>
            </span>
          </div>
          {/* `showNumbers` is on by default and the row above already carries the count. */}
          <Meter value={cleared} max={TOTAL_STAGES} tone="xp" height={7} showNumbers={false} />
        </div>
        <span
          className="chamfer-sm bg-wood-900/70 text-ember-400 border-ember-600/30 flex items-center gap-1.5 border px-2.5 py-1 text-sm tabular-nums"
          data-testid="road-vigor"
        >
          <Icon name="hourglass" size={13} />
          {vigor}
        </span>
      </div>
    </div>
  );
}

/* ── The chapter, as a row of stones ──────────────────────────────────────────────── */

function ChapterBoard({
  chapter,
  reached,
  view,
  onChapter,
  onFight,
  busy,
}: {
  chapter: number;
  reached: number;
  view: ReturnType<typeof chapterView>;
  onChapter: (chapter: number) => void;
  onFight: (stage: number) => void;
  busy: boolean;
}) {
  if (!view) return null;

  return (
    <TavernPanel
      title={`${view.definition.numeral} · ${view.definition.name}`}
      data-testid="chapter-board"
    >
      <p className="text-parchment-500/72 -mt-1 text-xs italic">{view.definition.tagline}</p>

      {/* The ten chapters, as a row of numerals you can walk back through. */}
      <div className="mt-3 flex flex-wrap gap-1.5" data-testid="chapter-picker">
        {CHAPTERS.map((entry) => {
          const open = entry.chapter <= reached;
          return (
            <button
              key={entry.chapter}
              type="button"
              disabled={!open}
              onClick={() => onChapter(entry.chapter)}
              aria-current={entry.chapter === chapter ? 'true' : undefined}
              aria-label={`Chapter ${entry.numeral}${open ? '' : ' — not reached'}`}
              data-testid={`chapter-${entry.chapter}`}
              className={`chamfer-sm font-display min-w-9 border px-2 py-1 text-[11px] tracking-widest transition-colors ${
                entry.chapter === chapter
                  ? 'text-ink-900 border-amber-400 bg-amber-500'
                  : open
                    ? 'border-parchment-500/25 text-parchment-300/85 hover:border-amber-500/60 hover:text-amber-500'
                    : 'border-parchment-500/10 text-parchment-500/72 cursor-not-allowed'
              }`}
            >
              {entry.numeral}
            </button>
          );
        })}
      </div>

      <motion.ol
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.025 } } }}
        className="mt-4 grid grid-cols-6 gap-2 xl:grid-cols-12"
        data-testid="stage-row"
      >
        {view.stages.map((stage) => (
          <Stone key={stage.stage} stage={stage} onFight={onFight} busy={busy} />
        ))}
      </motion.ol>

      <p className="text-parchment-500/72 mt-3 text-[11px] leading-relaxed">
        {view.complete
          ? 'Every stone in this chapter is behind you. Walking one again costs a Vigor and pays nothing — it is practice.'
          : 'A stage pays gold and experience the first time you clear it, and nothing after that.'}
      </p>
    </TavernPanel>
  );
}

function Stone({
  stage,
  onFight,
  busy,
}: {
  stage: StageView;
  onFight: (stage: number) => void;
  busy: boolean;
}) {
  const tip = useTooltip({
    title: `${stage.stage} · ${stage.name}`,
    detail: stage.reachable
      ? `Level ${stage.level}${stage.isBoss ? ' · chapter boss' : ''} — ${
          stage.cleared ? 'cleared, so this is practice' : 'not yet cleared'
        }.`
      : 'Clear the stages before it first.',
  });

  const tone = stage.cleared
    ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
    : stage.isWall
      ? 'border-amber-400 bg-amber-500/10 text-amber-300'
      : 'border-parchment-500/12 bg-wood-900/55 text-parchment-500/72';

  return (
    <motion.li
      variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
      transition={snappy}
    >
      <motion.button
        type="button"
        disabled={!stage.reachable || busy}
        onClick={() => onFight(stage.stage)}
        whileHover={stage.reachable && !busy ? { y: -2 } : undefined}
        whileTap={stage.reachable && !busy ? { y: 1, scale: 0.97 } : undefined}
        transition={snappy}
        {...tip}
        aria-label={`Stage ${stage.stage}, ${stage.name}, level ${stage.level}`}
        data-testid={`stage-${stage.stage}`}
        data-cleared={stage.cleared ? 'true' : 'false'}
        data-wall={stage.isWall ? 'true' : 'false'}
        className={`chamfer-sm relative grid h-14 w-full place-items-center border transition-colors ${tone} ${
          stage.reachable && !busy ? 'cursor-pointer' : 'cursor-not-allowed'
        } ${stage.isBoss ? 'ring-blood-400/40 ring-1' : ''}`}
      >
        <span className="font-display text-sm font-bold tabular-nums">{stage.step}</span>
        <span className="text-[9px] tracking-wider opacity-80">lv {stage.level}</span>

        {stage.cleared && (
          <span aria-hidden className="absolute top-1 right-1 text-[10px] text-amber-400">
            ✦
          </span>
        )}
        {!stage.reachable && (
          <span aria-hidden className="text-parchment-500/72 absolute top-1 right-1">
            <LockIcon size={10} />
          </span>
        )}
        {/* The wall breathes. It is the only stone asking to be pressed. */}
        {stage.isWall && (
          <motion.span
            aria-hidden
            animate={{ opacity: [0.8, 0.25, 0.8] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="chamfer-sm pointer-events-none absolute -inset-px border-2 border-amber-400"
          />
        )}
      </motion.button>
    </motion.li>
  );
}

/* ── What is in front of you, and the button that keeps going ─────────────────────── */

function WallPanel({
  wall,
  vigor,
  auto,
  run,
  stopped,
  onStart,
  onStop,
}: {
  wall: ReturnType<typeof wallView>;
  vigor: number;
  auto: boolean;
  run: { cleared: number; gold: number; xp: number } | null;
  stopped: StopReason | null;
  onStart: () => void;
  onStop: () => void;
}) {
  if (!wall) {
    return (
      <TavernPanel title="The end of the road" data-testid="road-finished">
        <p className="text-parchment-300/90 text-sm leading-relaxed">
          A hundred and twenty stages, and the last of them behind you. Frostfell Ridge does not
          have anything else to throw.
        </p>
      </TavernPanel>
    );
  }

  const short = vigor < STAGE_VIGOR_COST;

  return (
    <TavernPanel title="In your way" elevation="floating" data-testid="wall-panel">
      <p className="font-display text-parchment-300 text-lg" data-testid="wall-name">
        {wall.name}
      </p>
      <p className="text-parchment-500/72 text-xs italic">{wall.flavor}</p>

      <dl className="text-parchment-500/72 mt-3 grid grid-cols-2 gap-y-1 text-xs">
        <dt>Stage</dt>
        <dd className="text-parchment-300 text-right tabular-nums" data-testid="wall-stage">
          {wall.stage} of {TOTAL_STAGES}
        </dd>
        <dt>Level</dt>
        <dd className="text-parchment-300 text-right tabular-nums">{wall.level}</dd>
        <dt>First clear pays</dt>
        <dd className="text-parchment-300 text-right tabular-nums">
          {wall.reward.gold.toLocaleString()}g · {wall.reward.xp.toLocaleString()}xp
        </dd>
      </dl>

      {wall.signature && (
        <div className="chamfer-sm border-blood-400/35 bg-blood-600/10 mt-3 border px-3 py-2">
          <p className="font-display text-blood-400 text-[11px] tracking-[0.2em] uppercase">
            {wall.signature.label}
          </p>
          <p className="text-parchment-300/85 mt-1 text-[11px] leading-snug">
            {wall.signature.explainer}
          </p>
        </div>
      )}

      {/* The only thing a loss leaves behind, and the reason to come back. */}
      {wall.bestAttempt > 0 && (
        <div className="mt-3" data-testid="best-attempt">
          <div className="text-parchment-500/72 flex items-center justify-between text-[11px]">
            <span>Best attempt</span>
            <span className="tabular-nums">
              {Math.round(wall.bestAttempt * 100)}% off its health
            </span>
          </div>
          {/*
           * Bar only. `Meter` labels and counts by default, which on a 0–1 share reads "1 / 1" —
           * both ends round to one — under a line that has just said 62%. A fractional meter
           * wants the words above it, not inside it.
           */}
          <Meter
            value={wall.bestAttempt}
            max={1}
            tone="health"
            height={5}
            showNumbers={false}
            className="mt-1"
          />
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        {auto ? (
          <ActionButton variant="danger" fullWidth onClick={onStop} data-testid="road-stop">
            Stop
          </ActionButton>
        ) : (
          <ActionButton
            fullWidth
            onClick={onStart}
            {...(short ? { disabledReason: 'Out of Vigor — the tankard fills at midnight.' } : {})}
            data-testid="road-push"
          >
            Push on
          </ActionButton>
        )}
      </div>
      <p className="text-parchment-500/72 mt-2 text-[11px] leading-snug">
        One Vigor a stage, win or lose. Keeps going until something stops you.
      </p>

      <AnimatePresence>
        {run && (stopped || auto) && (
          <motion.div
            key="run-summary"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={standard}
            className="overflow-hidden"
          >
            <div
              className="chamfer-sm border-parchment-500/15 bg-wood-900/60 mt-3 border px-3 py-2"
              data-testid="run-summary"
            >
              <p className="font-display text-[11px] tracking-[0.2em] text-amber-500 uppercase">
                This push
              </p>
              <p className="text-parchment-300 mt-1 text-sm tabular-nums">
                {run.cleared} new {run.cleared === 1 ? 'stage' : 'stages'} ·{' '}
                {run.gold.toLocaleString()}g · {run.xp.toLocaleString()}xp
              </p>
              {stopped && (
                <p className="text-parchment-500/72 mt-1 text-[11px] leading-snug">
                  {STOP_COPY[stopped]}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </TavernPanel>
  );
}

/* ── The fight itself ─────────────────────────────────────────────────────────────── */

function StageFight({
  push,
  heroName,
  speed,
  auto,
  onSpeedChange,
  onDone,
}: {
  push: Push;
  heroName: string;
  speed: number;
  auto: boolean;
  onSpeedChange: (speed: 1 | 2 | 4) => void;
  onDone: () => void;
}) {
  const { outcome, leveledTo, album } = push;
  const analysis = useMemo(() => analyseBattle(outcome.battle.log, 'a'), [outcome.battle.log]);

  const opening = outcome.battle.log.find((event) => event.t === 'battle_start');
  const opponentName = opening?.t === 'battle_start' ? opening.b.name : 'Something on the road';

  const rewards: BattleRewards | undefined =
    outcome.won && !outcome.practice
      ? {
          gold: outcome.spoils.gold,
          xp: outcome.spoils.xp,
          ...(outcome.spoils.dice > 0 ? { dice: outcome.spoils.dice } : {}),
          bonuses: [
            { label: 'Stage cleared', amount: `${outcome.stage}/${TOTAL_STAGES}` },
            ...(outcome.chapterCleared
              ? [{ label: 'Chapter cleared', amount: `${outcome.chapter} of ${CHAPTERS.length}` }]
              : []),
            ...(leveledTo ? [{ label: 'Level up', amount: `→ ${leveledTo}` }] : []),
          ],
        }
      : undefined;

  return (
    <BattleScene
      log={outcome.battle.log}
      backdrop={PLACE.backdrop}
      initialSpeed={speed as 1 | 2 | 4}
      onSpeedChange={onSpeedChange}
      targetDuration={outcome.isBoss ? BOSS_FIGHT_DURATION : STAGE_FIGHT_DURATION}
      /*
       * On AUTO the scene reports itself finished and the chain takes over; pressed by hand it
       * waits on the result screen. Same component either way — the difference is who presses
       * continue.
       */
      {...(auto ? { onFinished: onDone } : {})}
      result={
        <div className="flex w-full max-w-5xl flex-col items-center gap-4">
          <BattleResult
            victory={outcome.won}
            analysis={analysis}
            heroName={heroName}
            opponentName={opponentName}
            {...(rewards ? { rewards } : {})}
            album={album}
            onContinue={onDone}
            continueLabel={outcome.won ? 'Back to the road' : 'Back to town'}
          />

          {outcome.practice && outcome.won && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={dramatic}
              className="text-parchment-500/72 text-xs"
              data-testid="practice-note"
            >
              Practice. This stage was already cleared, so it paid nothing.
            </motion.p>
          )}
        </div>
      }
    />
  );
}
