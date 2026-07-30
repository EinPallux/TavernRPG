'use client';

/**
 * Dev world viewer (`/dev/world`) — ROADMAP Phase 8.
 *
 * The ladder, the level curve and the Crier's output, from a seed you can change. The arena is
 * Phase 9, so until then this is the only way to *look* at the 1,500 — and looking at them is
 * how the bugs get found. The level histogram in particular is what caught the first version
 * piling seventy-five heroes on the cap.
 *
 * It runs the real generator and the real tick, so the reconciliation cost shown here is the
 * cost the player pays on load.
 */

import { useEffect, useMemo, useState } from 'react';
import { generateWorld, MAX_BOT_LEVEL, rankOf } from '@/engine/world/generate';
import { botIdentity, archetypeOf, BOT_COUNT } from '@/engine/world/identity';
import { materializeBot } from '@/engine/world/materialize';
import { simTick } from '@/engine/world/simulate';
import { updateRivals } from '@/engine/world/rivals';
import { buildFeed } from '@/engine/world/crier';
import { guild as guildById } from '@/data/guilds';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';

const DAY = 86_400_000;
/** Fixed so the page is reproducible; the sim never reads a live clock. */
const T0 = Date.parse('2026-08-01T00:00:00Z');

const SPANS = [0, 1, 7, 14, 90] as const;

export default function WorldDevPage() {
  const [seed, setSeed] = useState(20260730);
  const [days, setDays] = useState<number>(7);
  const [playerRank, setPlayerRank] = useState(700);

  /**
   * The simulation runs **after paint**, not during render.
   *
   * Two reasons, and the lint rule only catches the first: `performance.now()` is impure and
   * has no business in a render pass, and a 1,500-bot fortnight would block the frame on every
   * keystroke of the rank slider. Deferring to a frame keeps the controls responsive and makes
   * the timing honest — it is measuring the work, not the render.
   */
  const [snapshot, setSnapshot] = useState(() => ({
    world: generateWorld(seed, T0),
    events: [] as ReturnType<typeof simTick>['events'],
    elapsedMs: 0,
    integrated: false,
    rivals: [] as ReturnType<typeof updateRivals>['rivals'],
    feed: [] as ReturnType<typeof buildFeed>,
  }));

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const base = generateWorld(seed, T0);
      if (days === 0) {
        setSnapshot({
          world: base,
          events: [],
          elapsedMs: 0,
          integrated: false,
          rivals: [],
          feed: [],
        });
        return;
      }

      const started = performance.now();
      const result = simTick(base, T0 + days * DAY, {
        playerRank,
        rivalIds: [],
        guildmateIds: [],
      });
      const cost = performance.now() - started;

      const rivalUpdate = updateRivals({
        world: result.world,
        playerRank,
        current: [],
        now: T0 + days * DAY,
        daysElapsed: days,
      });

      setSnapshot({
        world: result.world,
        events: result.events,
        elapsedMs: cost,
        integrated: result.integrated,
        rivals: rivalUpdate.rivals,
        feed: buildFeed({
          context: {
            world: result.world,
            rivals: rivalUpdate.rivals,
            playerRank,
            playerGuildId: -1,
          },
          events: result.events,
          now: T0 + days * DAY,
          days,
        }),
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [days, playerRank, seed]);

  const { world, events, elapsedMs, feed, rivals, integrated } = snapshot;

  // Ten-level buckets. The shape is the thing — a spike at the top means the cap is clamping.
  const histogram = useMemo(() => {
    const buckets = Array.from({ length: 10 }, () => 0);
    for (const bot of world.bots) {
      const index = Math.min(9, Math.floor(((bot.level - 1) / MAX_BOT_LEVEL) * 10));
      buckets[index] = (buckets[index] ?? 0) + 1;
    }
    return buckets;
  }, [world]);

  const tallest = Math.max(...histogram, 1);
  const levels = useMemo(
    () => [...world.bots.map((bot) => bot.level)].sort((a, b) => a - b),
    [world],
  );
  const at = (p: number) => levels[Math.min(levels.length - 1, Math.floor(levels.length * p))]!;

  const nearPlayer = world.ladder.slice(Math.max(0, playerRank - 6), playerRank + 5);

  return (
    <div className="min-h-screen p-8">
      <header className="mb-6">
        <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
          TavernRPG · Engine
        </p>
        <h1 className="font-display text-parchment-300 text-4xl font-extrabold">The 1,500</h1>
        <p className="text-parchment-500/60 mt-2 max-w-2xl text-sm">
          A whole world from one number. The generator and the tick here are the ones the game runs,
          so the reconciliation cost below is the cost a player pays on load.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <TavernPanel title="World" animate={false}>
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <ActionButton size="sm" onClick={() => setSeed((value) => value + 1)}>
                  Next seed ({seed})
                </ActionButton>
                <ActionButton size="sm" variant="secondary" onClick={() => setSeed(20260730)}>
                  Reset
                </ActionButton>
              </div>

              <div>
                <p className="text-parchment-500/60 mb-1.5 text-xs tracking-widest uppercase">
                  Simulate
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SPANS.map((span) => (
                    <ActionButton
                      key={span}
                      size="sm"
                      variant={span === days ? 'primary' : 'secondary'}
                      onClick={() => setDays(span)}
                    >
                      {span === 0 ? 'Fresh' : `${span}d`}
                    </ActionButton>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="text-parchment-500/60 mb-1 block text-xs tracking-widest uppercase">
                  Player at rank {playerRank}
                </span>
                <input
                  type="range"
                  min={1}
                  max={BOT_COUNT}
                  value={playerRank}
                  onChange={(event) => setPlayerRank(Number(event.target.value))}
                  className="w-full accent-amber-500"
                />
              </label>

              <dl className="border-parchment-500/12 space-y-1.5 border-t pt-3">
                <div className="flex justify-between">
                  <dt className="text-parchment-500/65">Reconcile cost</dt>
                  <dd
                    className={`tabular-nums ${elapsedMs > 1_000 ? 'text-blood-600' : 'text-moss-600'}`}
                  >
                    {elapsedMs.toFixed(0)}ms {integrated ? '(integrated)' : ''}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-parchment-500/65">Events</dt>
                  <dd className="text-parchment-300 tabular-nums">{events.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-parchment-500/65">Median / p95 / max</dt>
                  <dd className="text-parchment-300 tabular-nums">
                    {at(0.5)} / {at(0.95)} / {levels.at(-1)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-parchment-500/65">Guilded</dt>
                  <dd className="text-parchment-300 tabular-nums">
                    {((world.bots.filter((b) => b.guildId >= 0).length / BOT_COUNT) * 100).toFixed(
                      0,
                    )}
                    %
                  </dd>
                </div>
              </dl>
            </div>
          </TavernPanel>

          <TavernPanel title="Level distribution" animate={false}>
            <p className="text-parchment-500/50 mb-3 text-xs leading-snug">
              Balancing §12 wants median 28, p95 74, max 92. A spike in the last bucket means the
              ceiling is clamping instead of compressing.
            </p>
            {/* The bar needs a parent with a *definite* height for its percentage to resolve
                against — the first version nested it under an auto-height column and every bar
                came out zero tall. */}
            <div className="flex h-36 items-stretch gap-1">
              {histogram.map((count, index) => (
                <div key={index} className="flex h-full flex-1 flex-col items-center gap-1">
                  <span className="text-parchment-500/40 text-[9px] tabular-nums">{count}</span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full bg-amber-500/70"
                      style={{ height: `${Math.max(1, (count / tallest) * 100)}%` }}
                      title={`${count} heroes`}
                    />
                  </div>
                  <span className="text-parchment-500/35 text-[9px] tabular-nums">
                    {Math.round((index * MAX_BOT_LEVEL) / 10)}
                  </span>
                </div>
              ))}
            </div>
          </TavernPanel>

          <TavernPanel title="Rivals at this rank" animate={false}>
            {rivals.length === 0 ? (
              <p className="text-parchment-500/45 text-xs">Simulate a day to draw rivals.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {rivals.map((rival) => {
                  const identity = botIdentity(world.seed, rival.botId);
                  return (
                    <li key={rival.botId} className="flex items-baseline justify-between gap-2">
                      <span className="text-parchment-300 truncate">{identity.name}</span>
                      <span className="text-parchment-500/50 shrink-0 tabular-nums">
                        #{rankOf(world, rival.botId)} · {rival.archetype} · heat{' '}
                        {Math.round(rival.heat)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </TavernPanel>
        </div>

        <div className="space-y-4">
          <TavernPanel title="The ladder, around the player" animate={false}>
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="text-parchment-500/55">
                <tr className="border-parchment-500/12 border-b">
                  <th className="py-1.5 pr-3 font-normal tracking-widest uppercase">#</th>
                  <th className="py-1.5 pr-3 font-normal tracking-widest uppercase">Hero</th>
                  <th className="py-1.5 pr-3 font-normal tracking-widest uppercase">Class</th>
                  <th className="py-1.5 pr-3 text-right font-normal tracking-widest uppercase">
                    Lv
                  </th>
                  <th className="py-1.5 pr-3 text-right font-normal tracking-widest uppercase">
                    HP
                  </th>
                  <th className="py-1.5 pr-3 text-right font-normal tracking-widest uppercase">
                    Honor
                  </th>
                  <th className="py-1.5 font-normal tracking-widest uppercase">Guild</th>
                </tr>
              </thead>
              <tbody>
                {[...world.ladder.slice(0, 10), ...nearPlayer].map((id, index) => {
                  const bot = world.bots[id]!;
                  const identity = botIdentity(world.seed, id);
                  const rank = rankOf(world, id);
                  const home = bot.guildId >= 0 ? guildById(bot.guildId) : null;
                  const isPlayerRow = rank === playerRank;

                  return (
                    <tr
                      key={`${id}-${index}`}
                      className={`border-parchment-500/8 border-b last:border-0 ${
                        isPlayerRow ? 'bg-amber-500/10' : ''
                      }`}
                    >
                      <td className="text-parchment-500/55 py-1 pr-3">{rank}</td>
                      <td
                        className={`py-1 pr-3 ${identity.legend ? 'text-amber-400' : 'text-parchment-300/85'}`}
                      >
                        {identity.name}
                      </td>
                      <td className="text-parchment-500/60 py-1 pr-3">{identity.classId}</td>
                      <td className="text-parchment-300/85 py-1 pr-3 text-right">{bot.level}</td>
                      <td className="text-parchment-500/60 py-1 pr-3 text-right">
                        {materializeBot(world.seed, bot, identity).maxHealth.toLocaleString()}
                      </td>
                      <td className="text-parchment-300/85 py-1 pr-3 text-right">
                        {bot.honor.toLocaleString()}
                      </td>
                      <td className="text-parchment-500/50 truncate py-1">
                        {home?.name ?? '—'}{' '}
                        <span className="text-parchment-500/30">
                          {archetypeOf(identity.personality)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-parchment-500/35 mt-3 text-[11px]">
              Top ten, then the eleven around rank {playerRank}.
            </p>
          </TavernPanel>

          <TavernPanel title="What the Crier would say" animate={false}>
            {feed.length === 0 ? (
              <p className="text-parchment-500/45 text-xs">Simulate a day to fill the board.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {feed.slice(0, 24).map((entry) => (
                  <li key={entry.id} className="flex items-baseline gap-2">
                    <span className="text-parchment-500/35 w-24 shrink-0 tracking-wider uppercase">
                      {entry.category}
                    </span>
                    <span className="text-parchment-300/85 flex-1">{entry.text}</span>
                    <span
                      className={`shrink-0 text-[10px] ${
                        entry.relation === 'rival' ? 'text-blood-600' : 'text-parchment-500/30'
                      }`}
                    >
                      {entry.relation}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TavernPanel>
        </div>
      </div>
    </div>
  );
}
