'use client';

/**
 * The Undertavern (dungeons spec §4).
 *
 * Three doors under the Gilded Tankard, and one fight at a time behind whichever the player
 * opens. The screen has three states and moves between them without a route change: the hub, the
 * descent, and the fight — because a delve is one continuous action and a page transition in the
 * middle of it would break the only bit of momentum the room has.
 *
 * The descent is not decoration. A dungeon floor is a *benchmark* and the player is about to find
 * out whether they have got past it; a beat of torchlight going down is what turns a button press
 * into going somewhere.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PLACES_BY_ID } from '@/data/places';
import { FLOORS_PER_DUNGEON, dungeon, type DungeonId } from '@/data/dungeons';
import { doorViews, type DelveTransition, type DelveRefusal } from '@/state/dungeonActions';
import { useGameStore } from '@/state/gameStore';
import { gameNow } from '@/state/clock';
import { analyseBattle } from '@/engine/combat/analysis';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { BattleScene } from '@/components/battle/BattleScene';
import { BattleResult, type BattleRewards } from '@/components/battle/BattleResult';
import { Explainer } from '@/components/tutorial/Explainer';
import {
  BOSS_FIGHT_DURATION,
  DUNGEON_FIGHT_DURATION,
  type PlaybackSpeed,
} from '@/components/battle/battleChoreo';
import { DiceIcon, KeyIcon, StairsDownIcon, TrophyIcon } from '@/components/icons';
import { dramatic, standard } from '@/styles/motion';
import { DungeonDoor } from './DungeonDoor';

const PLACE = PLACES_BY_ID.undertavern;

/** The torch-lit descent between pressing the door and the first blow (spec §4). */
function Descent({ name, floor, onDone }: { name: string; floor: number; onDone: () => void }) {
  const reduced = useReducedMotion();

  /*
   * The hand-off runs once, on mount, through a ref.
   *
   * The obvious version — `useEffect(..., [onDone, reduced])` with an inline callback from the
   * parent — restarts its own timer on every parent render and on the render where
   * `useReducedMotion` resolves from null to a boolean, so the descent can sit there forever
   * having cleared the timeout that was about to fire. Measured: it did.
   */
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const timer = setTimeout(() => done.current(), 1_100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={standard}
      className="bg-wood-900 absolute inset-0 z-40 grid place-items-center overflow-hidden"
      data-testid="descent"
    >
      {/* Torchlight sliding up past the stair — the camera is going down, so the light goes up. */}
      {!reduced &&
        [0, 1, 2, 3].map((index) => (
          <motion.span
            key={index}
            aria-hidden
            className="bg-ember-600/25 absolute h-40 w-40 blur-3xl"
            initial={{ y: 420, x: index % 2 === 0 ? -260 : 260, opacity: 0 }}
            animate={{ y: -420, opacity: [0, 0.9, 0] }}
            transition={{ duration: 1.1, delay: index * 0.16, ease: 'easeIn' }}
          />
        ))}

      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: -30, scale: 1.15 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={dramatic}
        className="text-center"
      >
        <StairsDownIcon size={38} className="text-ember-400 mx-auto" />
        <p className="font-display text-parchment-300 mt-3 text-2xl font-extrabold tracking-[0.1em]">
          {name}
        </p>
        <p className="text-parchment-500/72 mt-1 text-sm tracking-[0.3em] uppercase">
          Floor {floor}
        </p>
      </motion.div>
    </motion.div>
  );
}

/** Refusals become sentences here, so a copy edit never touches a transition. */
function phrase(refusal: DelveRefusal): string {
  switch (refusal.kind) {
    case 'below-gate':
      return `The stair does not go down for anyone under level ${refusal.gateLevel}.`;
    case 'no-key':
      return `That door wants the ${refusal.keyName}.`;
    case 'cooling-down':
      return 'They are still regrouping down there.';
    case 'already-cleared':
      return 'You have already taken that one apart.';
    case 'no-hero':
      return 'Nothing to do there.';
  }
}

type Stage =
  | { readonly kind: 'hub' }
  | { readonly kind: 'descending'; readonly id: DungeonId; readonly result: DelveTransition }
  | { readonly kind: 'fighting'; readonly id: DungeonId; readonly result: DelveTransition };

export function UndertavernScreen() {
  const save = useGameStore((state) => state.save);
  const descendInto = useGameStore((state) => state.descendInto);
  const setBattleSpeed = useGameStore((state) => state.setBattleSpeed);

  const [stage, setStage] = useState<Stage>({ kind: 'hub' });
  const [message, setMessage] = useState<string | null>(null);

  /**
   * A once-a-second tick, only while something is cooling down.
   *
   * The cooldown is a timestamp in the save, not a running timer — but a countdown nobody
   * re-renders is a countdown that reads the same for half an hour.
   */
  const [now, setNow] = useState(() => gameNow());
  const doors = useMemo(() => (save ? doorViews(save, now) : []), [save, now]);
  const cooling = doors.some((door) => door.refusal?.kind === 'cooling-down');

  useEffect(() => {
    if (!cooling) return;
    const timer = setInterval(() => setNow(gameNow()), 1_000);
    return () => clearInterval(timer);
  }, [cooling]);

  const descend = useCallback(
    (id: DungeonId) => {
      const result = descendInto(id);
      if (!result.ok) {
        setMessage(phrase(result.refusal));
        setNow(gameNow());
        return;
      }
      setStage({ kind: 'descending', id, result });
    },
    [descendInto],
  );

  const backToHub = useCallback(() => {
    setStage({ kind: 'hub' });
    setNow(gameNow());
  }, []);

  if (!save?.hero) return null;

  const hero = save.hero;
  const trophies = save.dungeons.trophies.length;

  return (
    <div className="relative h-full w-full" data-testid="place-undertavern">
      <AmbientStage
        backdrop={PLACE.backdrop}
        {...(PLACE.tint ? { tint: PLACE.tint } : {})}
        {...(PLACE.effects ? { effects: PLACE.effects } : {})}
      >
        <div className="relative flex h-full flex-col px-8 py-6">
          <header className="mb-5 flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
                Below the Gilded Tankard
              </p>
              <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
                {PLACE.name}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="chamfer-sm border-parchment-500/15 bg-wood-900/70 text-parchment-500/72 flex items-center gap-2 border px-3 py-1.5 text-xs"
                data-testid="key-count"
              >
                <KeyIcon size={13} />
                {save.dungeons.keys.length}/3 keys
              </span>
              <span
                className="chamfer-sm border-parchment-500/15 bg-wood-900/70 flex items-center gap-2 border px-3 py-1.5 text-xs text-amber-500"
                data-testid="trophy-count"
              >
                <TrophyIcon size={13} />
                {trophies}/3 sealed
              </span>
            </div>
          </header>

          <AnimatePresence>
            {message && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={standard}
                className="chamfer-sm border-blood-600/40 bg-blood-600/12 text-parchment-300 mb-4 border px-3 py-2 text-sm"
                data-testid="dungeon-message"
                onAnimationComplete={() => setTimeout(() => setMessage(null), 4_000)}
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto xl:grid-cols-3">
            {doors.map((door) => (
              <DungeonDoor
                key={door.definition.id}
                view={door}
                onDescend={() => descend(door.definition.id)}
              />
            ))}
          </div>

          {save.dungeons.keys.length === 0 && (
            <p className="text-parchment-500/72 mt-4 shrink-0 text-center text-xs leading-relaxed">
              Keys turn up on the roads — about one contract in sixteen, once you are old enough for
              the door they open.
            </p>
          )}
        </div>
      </AmbientStage>

      {/* The descent, then the fight. Both take the whole room; a delve is one action. */}
      <AnimatePresence>
        {stage.kind === 'descending' && (
          <Descent
            key="descent"
            name={dungeon(stage.id).name}
            floor={stage.result.outcome.floor}
            onDone={() => setStage({ kind: 'fighting', id: stage.id, result: stage.result })}
          />
        )}
      </AnimatePresence>

      {stage.kind === 'fighting' && (
        <div className="absolute inset-0 z-30" data-testid="delve-battle">
          <FloorFight
            result={stage.result}
            heroName={hero.name}
            speed={save.settings.battleSpeed as PlaybackSpeed}
            skipByDefault={save.settings.battleSkipDefault}
            onSpeedChange={setBattleSpeed}
            onDone={backToHub}
          />
        </div>
      )}
    </div>
  );
}

/** The fight itself, and the result written for a floor rather than for a contract. */
function FloorFight({
  result,
  heroName,
  speed,
  skipByDefault,
  onSpeedChange,
  onDone,
}: {
  result: DelveTransition;
  heroName: string;
  speed: PlaybackSpeed;
  skipByDefault: boolean;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  onDone: () => void;
}) {
  const { outcome, items, leveledTo, album } = result;
  const analysis = useMemo(() => analyseBattle(outcome.battle.log, 'a'), [outcome.battle.log]);

  const opponent = outcome.battle.log.find((event) => event.t === 'battle_start');
  const opponentName = opponent?.t === 'battle_start' ? opponent.b.name : 'Something below';

  const rewards: BattleRewards | undefined = outcome.won
    ? {
        gold: outcome.spoils.gold,
        xp: outcome.spoils.xp,
        ...(outcome.spoils.dice > 0 ? { dice: outcome.spoils.dice } : {}),
        ...(items[0] ? { item: items[0] } : {}),
        bonuses: [
          { label: 'Floor cleared', amount: `${outcome.floor}/${FLOORS_PER_DUNGEON}` },
          ...(items.length > 1 ? [{ label: 'And a second piece', amount: items[1]!.name }] : []),
          ...(leveledTo ? [{ label: 'Level up', amount: `→ ${leveledTo}` }] : []),
        ],
      }
    : undefined;

  return (
    <BattleScene
      log={outcome.battle.log}
      backdrop={PLACE.backdrop}
      initialSpeed={speed}
      onSpeedChange={onSpeedChange}
      startFinished={skipByDefault}
      targetDuration={outcome.isBoss ? BOSS_FIGHT_DURATION : DUNGEON_FIGHT_DURATION}
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
            continueLabel={outcome.won ? 'Back to the stair' : 'Back up'}
          />

          {outcome.cleared && <ClearCeremony trophyId={outcome.spoils.trophyId} />}
          {!outcome.won && <BestAttempt share={outcome.share} newBest={outcome.newBest} />}

          {/* Floors are fixed and do not scale to you, which reads as a balance bug the first
              time one stops you dead. Somebody has to say it out loud (tutorial spec §4). */}
          <Explainer id="first-dungeon-wall" when={!outcome.won} />
        </div>
      }
    />
  );
}

/** Floor ten. The door seals behind you and the crest goes on your profile (spec §4). */
function ClearCeremony({ trophyId }: { trophyId: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ ...dramatic, delay: 0.4 }}
      className="chamfer-md w-full max-w-lg border-2 border-amber-500/60 bg-amber-500/12 px-5 py-4 text-center shadow-[0_0_50px_rgb(232_163_61/0.3)]"
      data-testid="clear-ceremony"
    >
      <motion.span
        initial={{ rotate: -14, scale: 1.5, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        transition={{ ...dramatic, delay: 0.55 }}
        className="inline-block text-amber-400"
      >
        <TrophyIcon size={34} />
      </motion.span>
      <p className="font-display mt-2 text-lg font-extrabold tracking-[0.12em] text-amber-400 uppercase">
        The door is sealed
      </p>
      <p className="text-parchment-300/85 mt-1 text-sm leading-relaxed">
        Ten floors, and nothing left standing on any of them.
        {trophyId ? ' The crest is yours.' : ''}
      </p>
      <p className="text-parchment-500/72 mt-2 flex items-center justify-center gap-1.5 text-xs">
        <DiceIcon size={12} />
        Three Golden Dice, earned.
      </p>
    </motion.div>
  );
}

/** What a loss leaves behind — the bar the hub will be showing when they get back up. */
function BestAttempt({ share, newBest }: { share: number; newBest: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...dramatic, delay: 0.3 }}
      className="chamfer-sm border-parchment-500/15 bg-wood-900/85 w-full max-w-lg border p-3"
      data-testid="best-attempt"
    >
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="font-display text-parchment-500/72 text-[0.6rem] tracking-[0.3em] uppercase">
          {newBest ? 'A new best' : 'This attempt'}
        </p>
        <span className="text-ember-400 text-sm font-bold tabular-nums">
          {Math.round(share * 100)}%
        </span>
      </div>
      <div className="chamfer-sm bg-wood-900 border-parchment-500/10 h-2.5 w-full overflow-hidden border">
        <motion.span
          className="bg-ember-600/70 block h-full"
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(share * 100)}%` }}
          transition={{ ...standard, delay: 0.5 }}
        />
      </div>
      <p className="text-parchment-500/72 mt-2 text-xs leading-relaxed">
        Thirty minutes and it will be back on its feet. Bring something heavier.
      </p>
    </motion.div>
  );
}
