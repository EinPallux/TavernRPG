'use client';

/**
 * Dev economy dashboard (`/dev/economy`) — ROADMAP Phase 6.
 *
 * `economy.test.ts` asserts the bands; this page shows the *shape*. A band that goes red tells
 * you a ratio broke; the ledger tells you which day it broke on and which faucet did it. Both
 * read the same `simulateEconomy` the CI sim does, so nothing here can drift from what the
 * build checks.
 *
 * Only faucets and sinks that exist in the game are modelled (`MODELLED_FAUCETS` /
 * `MODELLED_SINKS`), and the columns are driven off those lists rather than written out, so a
 * system that joins the sim appears here the same day. Shops and mounts landed in Phase 7,
 * Fortune's Table in Phase 13, pet feeding in Phase 14; guild donations and dungeon gold are
 * still outstanding.
 */

import { useMemo, useState } from 'react';
import {
  ACTIVE_PLAYER,
  CASUAL_PLAYER,
  MODELLED_FAUCETS,
  MODELLED_SINKS,
  pointsPerDayAffordable,
  simulateEconomy,
  totalEarned,
  totalSpent,
  type PlayStyle,
} from '@/engine/economy/simulate';
import { VIGOR_PER_DAY } from '@/engine/progression/rewards';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';

const STYLES: readonly { id: string; label: string; blurb: string; style: PlayStyle }[] = [
  {
    id: 'active',
    label: 'Active',
    blurb: 'Every point of Vigor, 20-minute jobs, 8h patrol, banks almost nothing.',
    style: ACTIVE_PLAYER,
  },
  {
    id: 'casual',
    label: 'Casual',
    blurb: 'Half the Vigor, shorter jobs, a long overnight shift instead.',
    style: CASUAL_PLAYER,
  },
];

const SPANS = [30, 90, 180] as const;

/** Levels the design cares about, and the day balancing §0 wants each one reached. */
const MILESTONES: readonly { level: number; targetDay: number }[] = [
  { level: 10, targetDay: 3 },
  { level: 25, targetDay: 14 },
  { level: 55, targetDay: 45 },
  { level: 100, targetDay: 180 },
];

/**
 * Half to one-and-a-half times the target day is "close enough" for a modeled player.
 *
 * The band has to be two-sided. Arriving early is the failure mode the current curve actually
 * has — L100 lands around day 88 against a 180 target — and a one-sided check would paint that
 * green and hide it.
 */
function onPace(day: number | null, targetDay: number): boolean {
  return day !== null && day >= targetDay * 0.5 && day <= targetDay * 1.5;
}

function gold(value: number): string {
  return value.toLocaleString();
}

export default function EconomyDevPage() {
  const [styleId, setStyleId] = useState('active');
  const [days, setDays] = useState<number>(90);

  const chosen = STYLES.find((entry) => entry.id === styleId) ?? STYLES[0]!;

  const { ledger, finalLevel, finalPurse, totalPointsBought, earned, spent, reached } =
    useMemo(() => {
      const result = simulateEconomy({ days, style: chosen.style });
      return {
        ...result,
        earned: totalEarned(result.ledger),
        spent: totalSpent(result.ledger),
        reached: MILESTONES.map((milestone) => ({
          ...milestone,
          day: result.ledger.find((entry) => entry.level >= milestone.level)?.day ?? null,
        })),
      };
    }, [chosen, days]);

  // The purse is the "always slightly broke" read: a player sitting on a hoard has nothing to
  // want, and one at zero every day cannot save for a shop.
  const peakPurse = ledger.reduce((max, entry) => Math.max(max, entry.purse), 0);
  const dayIncome = (entry: (typeof ledger)[number]) =>
    MODELLED_FAUCETS.reduce((sum, faucet) => sum + entry.earned[faucet], 0);
  const patrolShare = earned === 0 ? 0 : ledger.reduce((s, e) => s + e.earned.patrol, 0) / earned;

  return (
    <div className="min-h-screen p-8">
      <header className="mb-6">
        <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
          TavernRPG · Engine
        </p>
        <h1 className="font-display text-parchment-300 text-4xl font-extrabold">Economy Ledger</h1>
        <p className="text-parchment-500/60 mt-2 max-w-2xl text-sm">
          Modeled days through the real reward curves — every coin in, every coin out. The CI sim
          asserts the bands; this shows where a broken band actually went wrong.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <TavernPanel title="Model" animate={false}>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-parchment-500/60 mb-1.5 text-xs tracking-widest uppercase">
                  Play style
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map((entry) => (
                    <ActionButton
                      key={entry.id}
                      size="sm"
                      variant={entry.id === styleId ? 'primary' : 'secondary'}
                      onClick={() => setStyleId(entry.id)}
                      data-testid={`dev-style-${entry.id}`}
                    >
                      {entry.label}
                    </ActionButton>
                  ))}
                </div>
                <p className="text-parchment-500/55 mt-2 text-xs leading-snug">{chosen.blurb}</p>
              </div>

              <div>
                <p className="text-parchment-500/60 mb-1.5 text-xs tracking-widest uppercase">
                  Span
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SPANS.map((span) => (
                    <ActionButton
                      key={span}
                      size="sm"
                      variant={span === days ? 'primary' : 'secondary'}
                      onClick={() => setDays(span)}
                    >
                      {span} days
                    </ActionButton>
                  ))}
                </div>
              </div>

              <dl className="border-parchment-500/12 space-y-1.5 border-t pt-3">
                <div className="flex justify-between">
                  <dt className="text-parchment-500/65">Vigor a day</dt>
                  <dd className="text-parchment-300 tabular-nums">
                    {Math.floor(VIGOR_PER_DAY * chosen.style.vigorUsed)} / {VIGOR_PER_DAY}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-parchment-500/65">Mission length</dt>
                  <dd className="text-parchment-300 tabular-nums">{chosen.style.duration}m</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-parchment-500/65">Patrol</dt>
                  <dd className="text-parchment-300 tabular-nums">{chosen.style.patrolHours}h</dd>
                </div>
              </dl>
            </div>
          </TavernPanel>

          <TavernPanel title={`After ${days} days`} animate={false}>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-parchment-500/65">Level</dt>
                <dd className="text-parchment-300 tabular-nums">{finalLevel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-parchment-500/65">Gold in</dt>
                <dd className="text-parchment-300 tabular-nums">{gold(earned)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-parchment-500/65">Gold out</dt>
                <dd className="text-parchment-300 tabular-nums">{gold(spent)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-parchment-500/65">Attribute points</dt>
                <dd className="text-parchment-300 tabular-nums">{gold(totalPointsBought)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-parchment-500/65">Purse, end / peak</dt>
                <dd className="text-parchment-300 tabular-nums">
                  {gold(finalPurse)} / {gold(peakPurse)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-parchment-500/65">Patrol&rsquo;s share of income</dt>
                <dd className="text-parchment-300 tabular-nums">
                  {(patrolShare * 100).toFixed(1)}%
                </dd>
              </div>
            </dl>
          </TavernPanel>

          <TavernPanel title="Pacing milestones" animate={false}>
            <p className="text-parchment-500/55 mb-3 text-xs leading-snug">
              Balancing §0. The L100 target needs a deceleration the current curve does not have —
              flagged for Phase 17, measured here every time.
            </p>
            <dl className="space-y-1.5 text-sm">
              {reached.map((milestone) => (
                <div key={milestone.level} className="flex items-baseline justify-between">
                  <dt className="text-parchment-500/65">Level {milestone.level}</dt>
                  <dd className="tabular-nums">
                    <span
                      className={
                        milestone.day === null
                          ? 'text-parchment-500/40'
                          : onPace(milestone.day, milestone.targetDay)
                            ? 'text-moss-600'
                            : 'text-amber-500'
                      }
                    >
                      {milestone.day === null ? `not in ${days}d` : `day ${milestone.day}`}
                    </span>
                    <span className="text-parchment-500/45"> · target {milestone.targetDay}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </TavernPanel>
        </div>

        <TavernPanel title="Daily ledger" animate={false}>
          <div className="max-h-[76vh] overflow-y-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="bg-wood-800/95 text-parchment-500/60 sticky top-0">
                <tr className="border-parchment-500/12 border-b">
                  <th className="py-2 pr-3 font-normal tracking-widest uppercase">Day</th>
                  <th className="py-2 pr-3 font-normal tracking-widest uppercase">Lv</th>
                  {MODELLED_FAUCETS.map((faucet) => (
                    <th
                      key={faucet}
                      className="text-moss-600 py-2 pr-3 text-right font-normal tracking-widest uppercase"
                    >
                      +{faucet}
                    </th>
                  ))}
                  {MODELLED_SINKS.map((sink) => (
                    <th
                      key={sink}
                      className="text-ember-600 py-2 pr-3 text-right font-normal tracking-widest uppercase"
                    >
                      −{sink}
                    </th>
                  ))}
                  <th className="py-2 pr-3 text-right font-normal tracking-widest uppercase">
                    Points
                  </th>
                  <th className="py-2 pr-3 text-right font-normal tracking-widest uppercase">
                    Affordable
                  </th>
                  <th className="py-2 text-right font-normal tracking-widest uppercase">Purse</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry, index) => {
                  const trainedSoFar = ledger
                    .slice(0, index)
                    .reduce((sum, previous) => sum + previous.pointsBought, 0);
                  const levelledToday = index > 0 && entry.level > ledger[index - 1]!.level;

                  return (
                    <tr
                      key={entry.day}
                      className="border-parchment-500/8 text-parchment-300/85 border-b last:border-0"
                    >
                      <td className="text-parchment-500/60 py-1 pr-3">{entry.day}</td>
                      <td className={`py-1 pr-3 ${levelledToday ? 'text-amber-500' : ''}`}>
                        {entry.level}
                      </td>
                      {MODELLED_FAUCETS.map((faucet) => (
                        <td key={faucet} className="py-1 pr-3 text-right">
                          {gold(entry.earned[faucet])}
                        </td>
                      ))}
                      {MODELLED_SINKS.map((sink) => (
                        <td key={sink} className="py-1 pr-3 text-right">
                          {gold(entry.spent[sink])}
                        </td>
                      ))}
                      <td className="py-1 pr-3 text-right">{entry.pointsBought}</td>
                      <td className="text-parchment-500/55 py-1 pr-3 text-right">
                        {pointsPerDayAffordable(entry, trainedSoFar)}
                      </td>
                      <td className="py-1 text-right">{gold(entry.purse)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-wood-800/95 text-parchment-300 sticky bottom-0">
                <tr className="border-parchment-500/20 border-t">
                  <td className="py-2 pr-3" colSpan={2}>
                    Totals
                  </td>
                  {MODELLED_FAUCETS.map((faucet) => (
                    <td key={faucet} className="py-2 pr-3 text-right">
                      {gold(ledger.reduce((sum, entry) => sum + entry.earned[faucet], 0))}
                    </td>
                  ))}
                  {MODELLED_SINKS.map((sink) => (
                    <td key={sink} className="py-2 pr-3 text-right">
                      {gold(ledger.reduce((sum, entry) => sum + entry.spent[sink], 0))}
                    </td>
                  ))}
                  <td className="py-2 pr-3 text-right">{gold(totalPointsBought)}</td>
                  <td className="py-2 pr-3 text-right" />
                  <td className="py-2 text-right">{gold(finalPurse)}</td>
                </tr>
                <tr>
                  <td className="text-parchment-500/45 pb-1 text-[11px]" colSpan={9}>
                    Average day: {gold(Math.round(earned / Math.max(1, ledger.length)))} in,{' '}
                    {gold(Math.round(spent / Math.max(1, ledger.length)))} out, peak single-day
                    income {gold(Math.max(...ledger.map(dayIncome)))}.
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </TavernPanel>
      </div>
    </div>
  );
}
