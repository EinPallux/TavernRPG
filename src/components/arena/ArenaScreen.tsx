'use client';

/**
 * The Proving Grounds (arena spec §1, §4).
 *
 * Three posters on a board, a ten-minute bell, and a ladder that moves when you win. The room
 * owns no rules: the draw comes from `drawOpponents`, the read from `threatRead`, the fight from
 * `resolveDuel` through the store. Everything here is presentation — which, for the phase whose
 * whole point is that the climb should be *felt*, is most of the work.
 *
 * Two presentation decisions carry the spec:
 *
 * - **The rank swap is shown, not numbered.** `LadderSwap` slides the rows past each other on the
 *   result screen. A player who only ever reads "rank 412 → 397" has been told they climbed; a
 *   player who watches two rows trade places has seen it.
 * - **Nothing is hidden.** Rewarded wins remaining, the cooldown, the reroll price and the skip
 *   allowance are all on screen before they matter (CLAUDE.md #6 — odds always visible).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  MAX_SKIPS_PER_DAY,
  REWARDED_WINS_PER_DAY,
  SKIP_DICE_COST,
  isReady,
  msUntilReady,
  rerollCost,
  threatRead,
} from '@/engine/arena/arena';
import { MILESTONE_DICE } from '@/engine/arena/duel';
import { analyseBattle } from '@/engine/combat/analysis';
import { buildHeroCombatant } from '@/engine/combat/combatant';
import { materializeBot, botProfile, type BotProfile } from '@/engine/world/materialize';
import { PLAYER_LADDER_ID } from '@/engine/world/ladder';
import { hildySays, type ArenaMoment } from '@/data/arenaBarks';
import { PLACES_BY_ID } from '@/data/places';
import { drawnOpponents, rankOfPlayer } from '@/state/arenaActions';
import { useGameStore } from '@/state/gameStore';
import type { DuelTransition } from '@/state/arenaActions';
import { gameNow } from '@/state/clock';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { KeeperBark } from '@/components/ui/KeeperBark';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { formatRemaining } from '@/components/ui/TimerChip';
import { BattleScene } from '@/components/battle/BattleScene';
import { BattleResult, type BattleRewards } from '@/components/battle/BattleResult';
import { Explainer } from '@/components/tutorial/Explainer';
import { ArenaIcon, HourglassIcon, LaurelIcon } from '@/components/icons';
import { dramatic, snappy, standard } from '@/styles/motion';
import { DuelPoster } from './DuelPoster';
import { LadderSwap, type LadderRow, type LadderRun } from './LadderSwap';
import { MilestoneStinger } from './MilestoneStinger';

const PLACE = PLACES_BY_ID.arena;
/** Rungs shown either side of the swap, so the rows move past something. */
const NEIGHBOURHOOD = 2;
/** Rungs shown either side of the player on the board itself. */
const LIVE_RUNGS = 5;

export function ArenaScreen() {
  const save = useGameStore((state) => state.save);
  const openArena = useGameStore((state) => state.openArena);
  const refreshDay = useGameStore((state) => state.refreshDay);
  const fightOpponent = useGameStore((state) => state.fightOpponent);
  const rerollArenaDraw = useGameStore((state) => state.rerollArenaDraw);
  const skipArenaCooldown = useGameStore((state) => state.skipArenaCooldown);
  const setBattleSpeed = useGameStore((state) => state.setBattleSpeed);
  const overnightRaids = useGameStore((state) => state.overnightRaids);

  const [staged, setStaged] = useState<DuelTransition | null>(null);
  const [beatenId, setBeatenId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [moment, setMoment] = useState<ArenaMoment>('browse');
  const [barkTick, setBarkTick] = useState(0);
  const [now, setNow] = useState(() => gameNow());

  const drawDay = save?.arena.drawDay ?? null;

  /**
   * Keep the board current.
   *
   * Two things can empty it: midnight, and the world catch-up noticing the player's rank drifted
   * out from under a board drawn at their old rung. The catch-up runs *after* first paint (so the
   * save is on screen immediately), which is why this watches `drawDay` rather than only running
   * on mount — otherwise the arena would sit on an empty board until the next visit.
   */
  useEffect(() => {
    refreshDay();
    openArena();
  }, [openArena, refreshDay, drawDay]);

  useEffect(() => {
    const id = setInterval(() => setNow(gameNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const say = useCallback((next: ArenaMoment) => {
    setMoment(next);
    setBarkTick((tick) => tick + 1);
  }, []);

  const hero = save?.hero ?? null;
  const world = save?.world ?? null;
  const arena = save?.arena ?? null;
  const playerRank = save ? rankOfPlayer(save) : 0;

  const ready = arena ? isReady(arena.cooldownUntil, now) : true;
  const waitMs = arena ? msUntilReady(arena.cooldownUntil, now) : 0;

  const revengeIds = useMemo(
    () => new Set(arena?.revengeQueue.map((grudge) => grudge.botId) ?? []),
    [arena],
  );
  const rivalIds = useMemo(() => new Set(world?.rivals.map((rival) => rival.botId) ?? []), [world]);

  /** The three posters, with their reads. Recomputed only when the draw or the hero changes. */
  const cards = useMemo(() => {
    if (!save || !hero || !world) return [];

    const player = buildHeroCombatant(hero, 'player');
    return drawnOpponents(save).map((record) => {
      const profile: BotProfile = botProfile(world.seed, record, now);
      const rank = world.ladder.indexOf(record.id) + 1;
      return {
        profile,
        rank,
        // Positive is up the ladder — rank 1 is the top, so the subtraction runs this way.
        gap: playerRank - rank,
        threat: threatRead(player, materializeBot(world.seed, record)),
      };
    });
    // `now` deliberately excluded: it ticks every second and would rebuild three combatants each
    // time. Dormancy is the only thing it feeds and the draw already excluded dormant heroes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, hero, world, playerRank]);

  /** Read a run of rungs off an order, resolving names. Shared by both ladder views. */
  const readRungs = useCallback(
    (order: readonly number[], from: number, to: number): LadderRow[] => {
      if (!world || !hero) return [];
      const rows: LadderRow[] = [];
      for (let rank = from; rank <= to; rank += 1) {
        const id = order[rank - 1];
        if (id === undefined) continue;
        if (id === PLAYER_LADDER_ID) {
          rows.push({ id, name: hero.name, honor: hero.honor, isPlayer: true });
          continue;
        }
        const record = world.bots[id];
        if (!record) continue;
        rows.push({
          id,
          name: botProfile(world.seed, record, 0).name,
          honor: record.honor,
          isPlayer: false,
        });
      }
      return rows;
    },
    [hero, world],
  );

  /**
   * The rungs around the player, live.
   *
   * Not decoration filling a gap: the rank swap on the result screen only *reads* as a climb if
   * the player already knows what the rungs around them look like. Showing the neighbourhood
   * before the fight is what makes the two rows trading places afterwards mean anything.
   */
  const standing = useMemo((): LadderRun[] => {
    if (!world || playerRank === 0) return [];
    const from = Math.max(1, playerRank - LIVE_RUNGS);
    const to = Math.min(world.ladder.length, playerRank + LIVE_RUNGS);
    return [{ topRank: from, rows: readRungs(world.ladder, from, to) }];
  }, [playerRank, readRungs, world]);

  /**
   * The rungs around the swap, captured before the fight so they can slide afterwards.
   *
   * Two clusters when the fighters are far apart. The draw reaches up to 4% of the ladder, so a
   * mid-table win can be a forty-rung jump — and rendering every rung between them fills the
   * result screen with strangers and pushes the Continue button off the bottom.
   */
  const neighbourhood = useMemo((): LadderRun[] => {
    if (!staged || !world) return [];

    // Read from the *pre-fight* ladder: the store has already written the new one, so the old
    // order has to be reconstructed by undoing the swap.
    const order = [...world.ladder];
    if (staged.result.outcome.swapped) {
      const a = order.indexOf(PLAYER_LADDER_ID);
      const b = order.indexOf(staged.result.opponentId);
      if (a !== -1 && b !== -1) [order[a], order[b]] = [order[b]!, order[a]!];
    }

    const { attackerRankBefore, defenderRankBefore } = staged.result.outcome;
    const high = Math.min(attackerRankBefore, defenderRankBefore);
    const low = Math.max(attackerRankBefore, defenderRankBefore);
    const size = world.ladder.length;
    const run = (from: number, to: number): LadderRun => ({
      topRank: Math.max(1, from),
      rows: readRungs(order, Math.max(1, from), Math.min(size, to)),
    });

    // Close enough that the gap between them is only a couple of rows: draw it as one block.
    if (low - high <= NEIGHBOURHOOD * 2 + 1) {
      return [run(high - NEIGHBOURHOOD, low + NEIGHBOURHOOD)];
    }
    return [
      run(high - NEIGHBOURHOOD, high + NEIGHBOURHOOD),
      run(low - NEIGHBOURHOOD, low + NEIGHBOURHOOD),
    ];
  }, [staged, readRungs, world]);

  const handleFight = useCallback(
    (opponentId: number) => {
      const outcome = fightOpponent(opponentId);
      if ('kind' in outcome) {
        setMessage(
          outcome.kind === 'cooling-down'
            ? `The bell has not rung — ${formatRemaining(outcome.msRemaining)} to go.`
            : outcome.kind === 'not-on-ladder'
              ? 'You are not on the ladder yet.'
              : 'That one is not available.',
        );
        say('waiting');
        return;
      }

      setMessage(null);
      setStaged(outcome);
    },
    [fightOpponent, say],
  );

  const handleReroll = useCallback(() => {
    const refusal = rerollArenaDraw();
    if (refusal) {
      setMessage(
        refusal.kind === 'insufficient-dice'
          ? 'A fresh board costs a Golden Die before the bell, and you have none.'
          : 'Nothing to reroll.',
      );
      say('broke');
      return;
    }
    setMessage(null);
    say('rerolled');
  }, [rerollArenaDraw, say]);

  const handleSkip = useCallback(() => {
    const refusal = skipArenaCooldown();
    if (refusal) {
      setMessage(
        refusal.kind === 'skip-cap-reached'
          ? `Three skips a day is the lot. The bell rings in ${formatRemaining(waitMs)}.`
          : 'You are a Golden Die short.',
      );
      say('broke');
      return;
    }
    setMessage(null);
  }, [say, skipArenaCooldown, waitMs]);

  const closeBattle = useCallback(() => {
    if (staged?.result.won) {
      setBeatenId(staged.result.opponentId);
      setTimeout(() => setBeatenId(null), 1400);
    }
    say(
      staged?.result.rewards.milestone
        ? 'milestone'
        : staged?.result.won
          ? staged.result.rewards.pastCap
            ? 'past-cap'
            : 'won'
          : 'lost',
    );
    setStaged(null);
  }, [say, staged]);

  if (!save || !hero || !world || !arena) return null;

  const rewardedLeft = Math.max(0, REWARDED_WINS_PER_DAY - arena.rewardedWinsToday);
  const rerollPrice = rerollCost(arena.cooldownUntil, now);
  const rankDelta = arena.lastSeenRank > 0 ? arena.lastSeenRank - playerRank : 0;
  const atTheFoot = playerRank === world.ladder.length;

  /**
   * What Hildy is reacting to.
   *
   * Derived rather than pushed into state by an effect. Everything except the fight outcomes is
   * a fact about the current save — whether the bell has rung, whether anyone came for the
   * player overnight, whether a grudge is outstanding — so mirroring it into `moment` would
   * only add a cascading render and a chance for the two to disagree.
   */
  const raidedOvernight = (overnightRaids?.grudges.length ?? 0) > 0;
  const activeMoment: ArenaMoment =
    moment === 'browse'
      ? !ready
        ? 'waiting'
        : raidedOvernight
          ? 'raided'
          : revengeIds.size > 0
            ? 'revenge'
            : atTheFoot
              ? 'newcomer'
              : 'browse'
      : moment;

  return (
    <div className="relative h-full w-full" data-testid="place-arena">
      <AmbientStage
        backdrop={PLACE.backdrop}
        {...(PLACE.tint ? { tint: PLACE.tint } : {})}
        {...(PLACE.effects ? { effects: PLACE.effects } : {})}
      >
        <div className="relative flex h-full flex-col overflow-y-auto px-8 py-6">
          <header className="mb-5 flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
                Emberhollow
              </p>
              <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
                {PLACE.name}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Rewarded wins is a cap, and a cap the player cannot see is a trap. */}
              <span
                className="chamfer-sm border-parchment-500/15 bg-wood-900/70 text-parchment-500/70 flex items-center gap-2 border px-3 py-1.5 text-xs"
                data-testid="rewarded-wins"
              >
                <LaurelIcon size={13} />
                {rewardedLeft} paid {rewardedLeft === 1 ? 'win' : 'wins'} left today
              </span>

              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={ready ? 'ready' : 'cooling'}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={snappy}
                  className={`chamfer-sm flex items-center gap-2 border px-3 py-1.5 text-xs ${
                    ready
                      ? 'border-moss-600/60 bg-moss-600/20 text-parchment-300'
                      : 'border-parchment-500/15 bg-wood-900/70 text-parchment-500/70'
                  }`}
                  data-testid="arena-cooldown"
                >
                  <HourglassIcon size={13} />
                  {ready ? 'The bell is yours' : `Bell in ${formatRemaining(waitMs)}`}
                </motion.span>
              </AnimatePresence>
            </div>
          </header>

          <div className="mb-5">
            <KeeperBark
              keeper="Hildy"
              line={hildySays(activeMoment, barkTick)}
              data-testid="bark-arena"
            />
          </div>

          <AnimatePresence>
            {message && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={standard}
                className="chamfer-sm border-blood-600/40 bg-blood-600/12 text-parchment-300 mb-4 border px-3 py-2 text-sm"
                data-testid="arena-message"
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <TavernPanel
              className="flex flex-col"
              bodyClassName="flex-1"
              title="Signed up to meet you"
              headerSlot={
                <ActionButton
                  size="sm"
                  variant="secondary"
                  {...(rerollPrice > 0 ? { cost: { dice: rerollPrice } } : {})}
                  {...(rerollPrice > hero.dice
                    ? {
                        disabledReason:
                          'Golden Dice are earned, never bought — wait for the bell instead.',
                      }
                    : {})}
                  onClick={handleReroll}
                  data-testid="reroll-draw"
                >
                  {rerollPrice > 0 ? 'New board' : 'New board (free)'}
                </ActionButton>
              }
              data-testid="duel-board"
            >
              {cards.length === 0 ? (
                <p className="text-parchment-500/55 py-10 text-center text-sm">
                  Nobody near your rung is taking challenges. Try again after the bell.
                </p>
              ) : (
                <motion.div
                  key={arena.rerollsToday}
                  layout
                  className="grid auto-rows-min content-start gap-4 md:grid-cols-3"
                >
                  <AnimatePresence mode="popLayout">
                    {cards.map((card, index) => (
                      <DuelPoster
                        key={card.profile.id}
                        index={index}
                        profile={card.profile}
                        rank={card.rank}
                        gap={card.gap}
                        threat={card.threat}
                        disabled={!ready || staged !== null}
                        {...(!ready
                          ? { disabledReason: `Bell in ${formatRemaining(waitMs)}` }
                          : {})}
                        revenge={revengeIds.has(card.profile.id)}
                        rival={rivalIds.has(card.profile.id)}
                        beaten={beatenId === card.profile.id}
                        onFight={() => handleFight(card.profile.id)}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* The rungs themselves, under the posters. The swap on the result screen only
                  reads as a climb if the player already knows what this looked like. */}
              {standing.length > 0 && (
                <div className="border-parchment-500/12 mt-6 border-t pt-4">
                  <p className="font-display text-parchment-500/45 mb-2 flex items-center gap-2 text-[0.62rem] tracking-[0.3em] uppercase">
                    <ArenaIcon size={12} />
                    Your rungs
                  </p>
                  <LadderSwap
                    runs={standing}
                    swapped={false}
                    playerId={PLAYER_LADDER_ID}
                    opponentId={-2}
                  />
                </div>
              )}
            </TavernPanel>

            <div className="space-y-4">
              <TavernPanel title="Your standing" data-testid="standing">
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-4xl font-extrabold text-amber-500 tabular-nums">
                    #{playerRank.toLocaleString()}
                  </span>
                  {rankDelta !== 0 && (
                    <motion.span
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={standard}
                      className={`chamfer-sm border px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                        rankDelta > 0
                          ? 'border-moss-600/60 bg-moss-600/20 text-parchment-300'
                          : 'border-blood-600/40 bg-blood-600/12 text-blood-600'
                      }`}
                      data-testid="rank-delta"
                    >
                      {rankDelta > 0 ? '▲' : '▼'} {Math.abs(rankDelta).toLocaleString()}
                    </motion.span>
                  )}
                </div>
                <p className="text-parchment-500/60 mt-1 text-xs tabular-nums">
                  {hero.honor.toLocaleString()} honour · of {world.ladder.length.toLocaleString()}{' '}
                  heroes
                </p>

                {arena.bestRank > 0 && arena.bestRank < playerRank && (
                  <p className="text-parchment-500/45 mt-2 text-xs">
                    Best ever: #{arena.bestRank.toLocaleString()}
                  </p>
                )}
              </TavernPanel>

              {!ready && (
                <TavernPanel title="Between fights" data-testid="cooldown-panel">
                  <p className="text-parchment-500/60 text-xs leading-relaxed">
                    Ten minutes between duels. You can buy past it {MAX_SKIPS_PER_DAY} times a day —{' '}
                    {MAX_SKIPS_PER_DAY - arena.skipsToday} left.
                  </p>
                  <div className="mt-3">
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      fullWidth
                      cost={{ dice: SKIP_DICE_COST }}
                      {...(hero.dice < SKIP_DICE_COST || arena.skipsToday >= MAX_SKIPS_PER_DAY
                        ? {
                            disabledReason:
                              arena.skipsToday >= MAX_SKIPS_PER_DAY
                                ? 'Three a day is the lot.'
                                : 'Golden Dice are earned, never bought.',
                          }
                        : {})}
                      onClick={handleSkip}
                      data-testid="skip-cooldown"
                    >
                      Ring it early
                    </ActionButton>
                  </div>
                </TavernPanel>
              )}

              {/* The first time somebody hits you while you are away needs a sentence: a rank
                  gone missing overnight reads as the game cheating (tutorial spec §4). */}
              <Explainer id="first-revenge" when={arena.revengeQueue.length > 0} />

              {arena.revengeQueue.length > 0 && (
                <TavernPanel title="They came for you" data-testid="revenge-panel">
                  <ul className="space-y-1.5">
                    {arena.revengeQueue.map((grudge) => {
                      const record = world.bots[grudge.botId];
                      if (!record) return null;
                      const name = botProfile(world.seed, record, now).name;
                      return (
                        <li
                          key={`${grudge.botId}:${grudge.at}`}
                          className="text-parchment-500/70 flex items-baseline justify-between gap-2 text-xs"
                        >
                          <span className="truncate">{name}</span>
                          <span className="text-blood-600 shrink-0 tabular-nums">
                            {grudge.ranksLost > 0 ? `−${grudge.ranksLost} rungs` : 'beat you'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-parchment-500/45 mt-3 text-xs leading-relaxed">
                    Beat them and the grudge is settled — they will be on the board when they are
                    near your rung.
                  </p>
                </TavernPanel>
              )}

              <TavernPanel title="House rules">
                <ul className="text-parchment-500/55 space-y-1.5 text-xs leading-relaxed">
                  <li>Win against someone above you and you take their rung.</li>
                  <li>
                    The first {REWARDED_WINS_PER_DAY} wins a day pay gold and experience. After that
                    the ladder still moves.
                  </li>
                  <li>A failed attack costs you 2% of your honour. Nothing else.</li>
                  <li>
                    Reaching rank 500, 100, 10 or 1 for the first time pays {MILESTONE_DICE[500]},{' '}
                    {MILESTONE_DICE[100]}, {MILESTONE_DICE[10]} and {MILESTONE_DICE[1]} Golden Dice.
                  </li>
                </ul>
              </TavernPanel>
            </div>
          </div>
        </div>
      </AmbientStage>

      {/* The fight takes the whole stage. */}
      <AnimatePresence>
        {staged && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={dramatic}
            className="bg-wood-900 absolute inset-0 z-40"
            data-testid="arena-battle"
          >
            <StagedDuel
              staged={staged}
              heroName={hero.name}
              neighbourhood={neighbourhood}
              opponentName={
                cards.find((card) => card.profile.id === staged.result.opponentId)?.profile.name ??
                (world.bots[staged.result.opponentId]
                  ? botProfile(world.seed, world.bots[staged.result.opponentId]!, now).name
                  : 'your opponent')
              }
              speed={save.settings.battleSpeed}
              skipByDefault={save.settings.battleSkipDefault}
              onSpeedChange={setBattleSpeed}
              onDone={closeBattle}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The milestone stinger sits above everything, including the battle. */}
      <MilestoneStinger
        milestone={staged?.result.rewards.milestone ?? null}
        dice={staged?.result.rewards.dice ?? 0}
      />
    </div>
  );
}

/** The fight, its result, and the ladder sliding underneath it. */
function StagedDuel({
  staged,
  heroName,
  opponentName,
  neighbourhood,
  speed,
  skipByDefault,
  onSpeedChange,
  onDone,
}: {
  staged: DuelTransition;
  heroName: string;
  opponentName: string;
  neighbourhood: readonly LadderRun[];
  speed: 1 | 2 | 4;
  skipByDefault: boolean;
  onSpeedChange: (speed: 1 | 2 | 4) => void;
  onDone: () => void;
}) {
  const [finished, setFinished] = useState(false);
  const analysis = useMemo(
    () => analyseBattle(staged.result.battle.log, 'a'),
    [staged.result.battle.log],
  );

  const { rewards, won, outcome } = staged.result;
  const banked: BattleRewards | undefined = won
    ? {
        ...(rewards.gold > 0 ? { gold: rewards.gold } : {}),
        ...(rewards.xp > 0 ? { xp: rewards.xp } : {}),
        ...(rewards.dice > 0 ? { dice: rewards.dice } : {}),
        honor: rewards.honorDelta,
        bonuses: [
          ...(outcome.swapped
            ? [{ label: 'Rank taken', amount: `#${outcome.attackerRankAfter.toLocaleString()}` }]
            : []),
          ...(staged.levelsGained > 0
            ? [{ label: 'Level up', amount: `→ ${staged.save.hero?.level ?? ''}` }]
            : []),
          ...(rewards.pastCap ? [{ label: 'Past the daily cap', amount: 'rank only' }] : []),
        ],
      }
    : undefined;

  return (
    <BattleScene
      log={staged.result.battle.log}
      backdrop={PLACE.backdrop}
      initialSpeed={speed}
      onSpeedChange={onSpeedChange}
      startFinished={skipByDefault}
      onFinished={() => setFinished(true)}
      result={
        <div className="flex w-full max-w-5xl flex-col items-center gap-4">
          <BattleResult
            victory={won}
            analysis={analysis}
            heroName={heroName}
            opponentName={opponentName}
            {...(banked ? { rewards: banked } : {})}
            onContinue={onDone}
            continueLabel="Back to the sand"
          />

          {/* The climb, shown. Only when there was one — a loss has nothing to slide. */}
          {outcome.swapped && neighbourhood.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...dramatic, delay: 0.35 }}
              className="chamfer-sm border-parchment-500/15 bg-wood-900/85 w-full max-w-lg border p-3"
            >
              <p className="font-display text-parchment-500/50 mb-2 flex items-center gap-2 text-[0.6rem] tracking-[0.3em] uppercase">
                <ArenaIcon size={12} />
                The ladder
              </p>
              <LadderSwap
                runs={neighbourhood}
                swapped={finished}
                playerId={PLAYER_LADDER_ID}
                opponentId={staged.result.opponentId}
              />
            </motion.div>
          )}
        </div>
      }
    />
  );
}
