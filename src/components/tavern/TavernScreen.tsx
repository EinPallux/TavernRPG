'use client';

/**
 * The Gilded Tankard — the core loop's home (tavern spec §1–4).
 *
 * The screen is a small state machine with four faces: the board (pick a job), the road (wait),
 * the door (a fight is waiting to be watched), and the fight itself. Which one shows is derived
 * from the save rather than held in component state, so closing the tab mid-anything and coming
 * back lands you exactly where you left.
 *
 * The battle mounts here the same way `/dev/battle` mounts it: hand `BattleScene` a log, a
 * backdrop and a result. That was the point of building it that way.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { analyseBattle } from '@/engine/combat/analysis';
import { resolveMission, type MissionOutcome } from '@/engine/missions/lifecycle';
import type { ActiveMission } from '@/engine/missions/types';
import { rerollCost } from '@/engine/missions/board';
import { ALE_DICE_COST, type MissionDuration } from '@/engine/progression/rewards';
import { activeMount } from '@/engine/stables/mounts';
import type { StoredActiveMission } from '@/engine/save/schema';
import { bark, type BarkMoment } from '@/data/barks';
import { monster as monsterById } from '@/data/monsters';
import { ZONES_BY_ID, backdropFor, type ZoneId } from '@/data/zones';
import { BattleScene } from '@/components/battle/BattleScene';
import { BattleResult, type BattleRewards } from '@/components/battle/BattleResult';
import { ActionButton } from '@/components/ui/ActionButton';
import { KeeperBark } from '@/components/ui/KeeperBark';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { useGameStore } from '@/state/gameStore';
import { currentDayKey, gameNow } from '@/state/clock';
import type { ClaimResult } from '@/state/missionActions';
import { TownCrier } from '@/components/world/TownCrier';
import { AbsenceCard } from '@/components/world/AbsenceCard';
import { WindDown } from '@/components/board/WindDown';
import { MissionCard } from './MissionCard';
import { MissionProgress } from './MissionProgress';
import { dramatic, standard } from '@/styles/motion';

/** The fight being shown. Resolved for display; the payout lands when it finishes. */
interface StagedFight {
  readonly mission: StoredActiveMission;
  readonly outcome: MissionOutcome;
}

export function TavernScreen() {
  const save = useGameStore((state) => state.save);
  const refreshDay = useGameStore((state) => state.refreshDay);
  const acceptMission = useGameStore((state) => state.acceptMission);
  const rerollBoard = useGameStore((state) => state.rerollBoard);
  const skipMissionTimer = useGameStore((state) => state.skipMissionTimer);
  const landMission = useGameStore((state) => state.landMission);
  const buyAle = useGameStore((state) => state.buyAle);
  const drinkAle = useGameStore((state) => state.drinkAle);
  const absenceSummary = useGameStore((state) => state.absenceSummary);
  const dismissAbsenceSummary = useGameStore((state) => state.dismissAbsenceSummary);

  const [staged, setStaged] = useState<StagedFight | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** Rotates the barks without reaching for randomness. */
  const [barkTick, setBarkTick] = useState(0);

  // Bring the day up to date on arrival. Every daily rule funnels through the store's
  // refreshDay, so the screen never asks the calendar anything itself.
  useEffect(() => {
    refreshDay();
  }, [refreshDay]);

  const hero = save?.hero ?? null;
  const activity = save?.activity ?? null;

  const phase: 'board' | 'road' | 'door' = activity?.pendingMission
    ? 'door'
    : activity?.mission
      ? 'road'
      : 'board';

  const moment: BarkMoment = staged
    ? staged.outcome.spoils.victory
      ? 'victory'
      : 'defeat'
    : phase === 'door'
      ? 'mission-returned'
      : phase === 'road'
        ? 'mission-running'
        : (activity?.vigor ?? 0) < 5
          ? 'out-of-vigor'
          : 'tavern-idle';

  const line = useMemo(() => bark(moment, barkTick), [moment, barkTick]);

  const handleAccept = useCallback(
    (offerId: string, duration: MissionDuration) => {
      const refusal = acceptMission(offerId, duration);
      if (!refusal) {
        setBarkTick((tick) => tick + 1);
        setMessage(null);
        return;
      }
      setMessage(
        refusal.kind === 'insufficient-vigor'
          ? `Not enough Vigor — that job wants ${refusal.needed}, and you have ${refusal.available}.`
          : 'Your hero is already out on a job.',
      );
    },
    [acceptMission],
  );

  const handleReroll = useCallback(() => {
    const refusal = rerollBoard();
    setBarkTick((tick) => tick + 1);
    setMessage(
      refusal?.kind === 'insufficient-dice'
        ? 'Rerolling again today costs a Golden Die, and you have none.'
        : null,
    );
  }, [rerollBoard]);

  const handleSkip = useCallback(() => {
    const refusal = skipMissionTimer();
    setMessage(
      refusal?.kind === 'insufficient-dice'
        ? 'Calling them back early costs a Golden Die, and you have none.'
        : null,
    );
  }, [skipMissionTimer]);

  /**
   * Watch the fight.
   *
   * Only *stages* it — nothing is banked yet. Claiming on the way in would light up the HUD
   * with the gold before the first sword is drawn, which spoils the fight the scene exists to
   * tell. Nothing is lost by waiting: the mission stays pending until it is claimed, so a
   * player who closes the tab mid-battle finds it waiting for them again.
   */
  const handleFight = useCallback(() => {
    const pending = activity?.pendingMission;
    if (!pending || !hero) return;
    setStaged({ mission: pending, outcome: resolveMission(pending as ActiveMission, hero) });
  }, [activity?.pendingMission, hero]);

  const handleAle = useCallback(
    (action: 'buy' | 'drink') => {
      const refusal = action === 'buy' ? buyAle() : drinkAle();
      if (!refusal) {
        setBarkTick((tick) => tick + 1);
        setMessage(null);
        return;
      }
      setMessage(
        refusal.kind === 'ale-cap-reached'
          ? 'Three Ales is the day’s limit. Marla is firm about it.'
          : refusal.kind === 'no-ale-held'
            ? 'You have no Ale to drink.'
            : `An Ale costs ${ALE_DICE_COST} Golden Die.`,
      );
    },
    [buyAle, drinkAle],
  );

  if (!save || !hero || !activity) return null;

  return (
    <div className="relative h-full w-full" data-testid="place-tavern">
      <AmbientStage
        backdrop="/assets/backgrounds/tavern_background.webp"
        tint="from-wood-900 via-wood-900/80 to-wood-900/55"
        effects={['hearth', 'motes']}
      >
        <div className="relative h-full overflow-y-auto px-8 py-6">
          <header className="mb-5 flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
                Emberhollow
              </p>
              <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
                The Gilded Tankard
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <ActionButton
                size="sm"
                variant="secondary"
                onClick={() => handleAle('buy')}
                cost={{ dice: ALE_DICE_COST }}
                data-testid="buy-ale"
              >
                Buy Ale
              </ActionButton>
              {activity.alesHeld > 0 && (
                <ActionButton size="sm" onClick={() => handleAle('drink')} data-testid="drink-ale">
                  Drink Ale ({activity.alesHeld})
                </ActionButton>
              )}
            </div>
          </header>

          <div className="mb-5">
            <KeeperBark keeper="Marla" line={line} data-testid="bark-tavern" />
          </div>

          <AnimatePresence>
            {message && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={standard}
                className="chamfer-sm border-blood-600/40 bg-blood-600/12 text-parchment-300 mb-4 border px-3 py-2 text-sm"
                data-testid="tavern-message"
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          {phase === 'board' && (
            <TavernPanel
              title="The quest table"
              headerSlot={
                <ActionButton
                  size="sm"
                  variant="ghost"
                  onClick={handleReroll}
                  {...(rerollCost(activity.boardRerollsToday) > 0
                    ? { cost: { dice: rerollCost(activity.boardRerollsToday) } }
                    : {})}
                  data-testid="reroll-board"
                >
                  {rerollCost(activity.boardRerollsToday) === 0
                    ? 'New postings (free)'
                    : 'New postings'}
                </ActionButton>
              }
              animate={false}
              bodyClassName="!p-0"
            >
              <div className="grid gap-4 xl:grid-cols-3" data-testid="mission-board">
                {activity.board.map((offer, index) => (
                  <MissionCard
                    key={offer.id}
                    offer={offer}
                    heroLevel={hero.level}
                    vigor={activity.vigor}
                    index={index}
                    onAccept={(duration) => handleAccept(offer.id, duration)}
                  />
                ))}
              </div>
              {activity.board.length === 0 && (
                <p className="text-parchment-500/72 py-8 text-center text-sm">
                  The table is bare. Marla will pin up fresh postings shortly.
                </p>
              )}
            </TavernPanel>
          )}

          {phase === 'road' && activity.mission && (
            <MissionProgress
              mission={activity.mission as ActiveMission}
              dice={hero.dice}
              onSkip={handleSkip}
              onArrived={landMission}
              mount={activeMount(activity.mount, gameNow())}
            />
          )}

          {phase === 'door' && activity.pendingMission && (
            <ReturnedCard mission={activity.pendingMission} onFight={handleFight} />
          )}

          {/* Out of Vigor is the end of the day's contracts, not the end of the game. Rather
              than leave the board empty and say nothing, point at tonight and at tomorrow
              (daily-loop spec §5). */}
          {phase === 'board' && activity.vigor < 5 && (
            <div className="mt-5 max-w-md">
              <WindDown save={save} today={currentDayKey()} now={gameNow()} />
            </div>
          )}

          {/* The Crier board. The Tavern is the game's home screen, so this is where the
              simulation becomes visible (world-simulation spec §6). */}
          {save.world && save.world.feed.length > 0 && (
            <div className="mt-5 max-w-3xl">
              <TownCrier entries={save.world.feed} now={gameNow()} />
            </div>
          )}
        </div>
      </AmbientStage>

      {/* What the world did while the tab was shut. Shown once, then gone. */}
      <AnimatePresence>
        {absenceSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={dramatic}
            className="bg-wood-900/85 absolute inset-0 z-50 grid place-items-center p-8 backdrop-blur-sm"
            data-testid="absence-overlay"
          >
            <AbsenceCard summary={absenceSummary} onDismiss={dismissAbsenceSummary} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The fight takes the whole stage. */}
      <AnimatePresence>
        {staged && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={dramatic}
            className="bg-wood-900 absolute inset-0 z-40"
            data-testid="tavern-battle"
          >
            <StagedBattle
              staged={staged}
              heroName={hero.name}
              onDone={() => {
                setStaged(null);
                setBarkTick((tick) => tick + 1);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The hero is at the door and the fight has not been watched yet. */
function ReturnedCard({ mission, onFight }: { mission: StoredActiveMission; onFight: () => void }) {
  const zone = ZONES_BY_ID[mission.offer.zoneId as ZoneId];
  const monster = monsterById(mission.offer.monsterId);

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={dramatic}
      className="chamfer-md edge-etched-strong bg-wood-800/95 relative overflow-hidden border-2 border-amber-500/50"
      data-testid="mission-returned"
    >
      <div className="relative h-48">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: zone
              ? `url('${backdropFor(zone, mission.offer.backdropIndex)}')`
              : undefined,
          }}
        />
        <div
          aria-hidden
          className="from-wood-900 absolute inset-0 bg-gradient-to-t to-transparent"
        />
        <div className="absolute inset-0 grid place-items-center">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...dramatic, delay: 0.1 }}
            className="font-display text-3xl font-extrabold text-amber-400 drop-shadow-[0_2px_8px_rgb(0_0_0/0.9)]"
          >
            They found it.
          </motion.p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-6 px-6 py-5">
        <div>
          <p className="text-parchment-300 text-sm">
            {monster?.name ?? 'Something'} is waiting in {zone?.name ?? 'the wilds'}.
          </p>
          <p className="text-parchment-500/72 mt-1 text-xs italic">{monster?.flavor}</p>
        </div>
        <ActionButton size="lg" onClick={onFight} data-testid="watch-fight">
          Hear how it went
        </ActionButton>
      </div>
    </motion.section>
  );
}

/** Plays the fight, then the result. */
function StagedBattle({
  staged,
  heroName,
  onDone,
}: {
  staged: StagedFight;
  heroName: string;
  onDone: () => void;
}) {
  const save = useGameStore((state) => state.save);
  const setBattleSpeed = useGameStore((state) => state.setBattleSpeed);
  const claimMission = useGameStore((state) => state.claimMission);

  const { mission, outcome } = staged;
  const zone = ZONES_BY_ID[mission.offer.zoneId as ZoneId];
  const monster = monsterById(mission.offer.monsterId);

  /**
   * The payout, banked the moment the fight ends — however it ended, including Skip.
   * `claimMission` refuses anything that is not the pending mission, so a second call (a
   * replay, a re-render) cannot pay twice.
   */
  const [claim, setClaim] = useState<ClaimResult | null>(null);
  const settle = useCallback(() => {
    setClaim((current) => current ?? claimMission(mission));
  }, [claimMission, mission]);

  const analysis = useMemo(() => analyseBattle(outcome.battle.log, 'a'), [outcome.battle.log]);

  /*
   * The first fight of a save gets the three callouts (tutorial spec §2 beat 3).
   *
   * Answered **once, when the scene mounts**, and then frozen. The question is derived from the
   * save — no flag to store — but `settle` banks the victory on the closing beat, which flips
   * the answer while the same scene is still on screen. Left live, that would hand a mounted
   * `useBattlePlayback` a new speed and a new pacing target at the moment the result slides up.
   */
  const [firstFight] = useState(
    () => save !== null && !save.tutorial.optedOut && save.activity.missionsCompleted === 0,
  );

  const spoils = claim?.spoils ?? outcome.spoils;
  const rewards: BattleRewards | undefined = spoils.victory
    ? {
        gold: spoils.gold,
        xp: spoils.xp,
        ...(spoils.dice > 0 ? { dice: spoils.dice } : {}),
        ...(claim?.item ? { item: claim.item } : {}),
        ...(claim?.leveledTo
          ? { bonuses: [{ label: 'Level up', amount: `→ ${claim.leveledTo}` }] }
          : {}),
      }
    : undefined;

  return (
    <BattleScene
      log={outcome.battle.log}
      onFinished={settle}
      backdrop={zone ? backdropFor(zone, mission.offer.backdropIndex) : undefined}
      initialSpeed={save?.settings.battleSpeed ?? 1}
      onSpeedChange={setBattleSpeed}
      startFinished={save?.settings.battleSkipDefault ?? false}
      callouts={firstFight}
      result={
        <BattleResult
          victory={spoils.victory}
          analysis={analysis}
          heroName={heroName}
          opponentName={monster?.name ?? 'the foe'}
          {...(rewards ? { rewards } : {})}
          onContinue={onDone}
          continueLabel="Back to the tavern"
        />
      }
    />
  );
}
