'use client';

/**
 * Attribute training — the game's endless gold sink (balancing §3).
 *
 * Every row shows where the number comes from (class + trained + gear), because a stat you
 * can't account for is a stat you can't plan around. Buy buttons always show their price, and
 * "Max" spends whatever the purse covers rather than refusing.
 */

import { motion } from 'motion/react';
import { ActionButton } from '@/components/ui/ActionButton';
import { TavernPanel } from '@/components/ui/TavernPanel';
import {
  ATTRIBUTE_BLURBS,
  ATTRIBUTE_IDS,
  ATTRIBUTE_LABELS,
  maxAffordable,
  statCost,
  statCostFor,
  type AttributeId,
} from '@/engine/progression/stats';
import type { DerivedStats } from '@/engine/hero/derived';
import type { Hero } from '@/engine/save/schema';
import { snappy } from '@/styles/motion';

const BUY_STEPS = [1, 5, 25] as const;

export interface AttributePanelProps {
  hero: Hero;
  derived: DerivedStats;
  mainStat: AttributeId;
  onTrain: (attribute: AttributeId, count: number) => void;
}

export function AttributePanel({ hero, derived, mainStat, onTrain }: AttributePanelProps) {
  return (
    <TavernPanel
      title="Attributes"
      headerSlot={
        <span className="text-parchment-500/45 text-xs tracking-wider">
          Trained with gold · price rises per point
        </span>
      }
      data-testid="attribute-panel"
    >
      <ul className="space-y-3">
        {ATTRIBUTE_IDS.map((attribute) => {
          const breakdown = derived.breakdown[attribute];
          const nextPrice = statCost(hero.trained[attribute]);
          const affordable = nextPrice <= hero.gold;
          const isMain = attribute === mainStat;
          const max = maxAffordable(hero.trained[attribute], hero.gold);

          return (
            <li key={attribute} data-testid={`attr-${attribute}`}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={`font-display text-sm tracking-wide ${
                      isMain ? 'text-amber-500' : 'text-parchment-300'
                    }`}
                  >
                    {ATTRIBUTE_LABELS[attribute]}
                    {isMain && <span className="ml-1 text-[10px] uppercase">main</span>}
                  </p>
                  <p className="text-parchment-500/45 text-[11px]">{ATTRIBUTE_BLURBS[attribute]}</p>
                </div>

                <div className="text-right">
                  <motion.p
                    key={breakdown.total}
                    initial={{ scale: 1.25, color: 'rgb(232 163 61)' }}
                    animate={{ scale: 1, color: 'rgb(242 232 203)' }}
                    transition={snappy}
                    className="text-xl leading-none font-semibold"
                    data-testid={`attr-${attribute}-total`}
                  >
                    {breakdown.total}
                  </motion.p>
                  <p className="text-parchment-500/40 text-[10px]">
                    {breakdown.base} base
                    {breakdown.trained > 0 && ` · ${breakdown.trained} trained`}
                    {breakdown.gear > 0 && ` · ${breakdown.gear} gear`}
                    {breakdown.pet > 0 && ` · ${breakdown.pet} companion`}
                  </p>
                </div>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {BUY_STEPS.map((step) => {
                  const cost = statCostFor(hero.trained[attribute], step);
                  const canAfford = cost <= hero.gold;
                  return (
                    <ActionButton
                      key={step}
                      size="sm"
                      variant={step === 1 ? 'primary' : 'secondary'}
                      onClick={() => onTrain(attribute, step)}
                      cost={{ gold: cost }}
                      data-testid={`buy-${attribute}-${step}`}
                      {...(canAfford
                        ? {}
                        : {
                            disabledReason: `Costs ${cost.toLocaleString()} gold — you have ${Math.floor(
                              hero.gold,
                            ).toLocaleString()}.`,
                          })}
                    >
                      +{step}
                    </ActionButton>
                  );
                })}

                <ActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() => onTrain(attribute, max.points)}
                  data-testid={`buy-${attribute}-max`}
                  {...(max.points > 0
                    ? { cost: { gold: max.cost } }
                    : {
                        disabledReason: `The next point costs ${nextPrice.toLocaleString()} gold — you have ${Math.floor(
                          hero.gold,
                        ).toLocaleString()}.`,
                      })}
                >
                  Max {max.points > 0 && `(+${max.points})`}
                </ActionButton>

                {!affordable && max.points === 0 && (
                  <span className="text-parchment-500/35 text-[11px]">
                    next: {nextPrice.toLocaleString()}g
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </TavernPanel>
  );
}
