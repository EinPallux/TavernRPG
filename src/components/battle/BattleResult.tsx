'use client';

/**
 * Result screen (combat spec §6).
 *
 * Victory cascades its rewards in one at a time — a loot card that simply appears is a loot
 * card nobody feels. Defeat is muted, never scolding, and always states *why*: a loss the
 * player can't explain is a loss they can't fix.
 */

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { BattleAnalysis, LossHint } from '@/engine/combat/analysis';
import type { Item } from '@/engine/items/types';
import { ActionButton } from '@/components/ui/ActionButton';
import { ItemCard } from '@/components/items/ItemCard';
import { Explainer } from '@/components/tutorial/Explainer';
import { CoinIcon, DiceIcon } from '@/components/icons';
import { dramatic, duration } from '@/styles/motion';

export interface BattleRewards {
  readonly gold?: number;
  readonly xp?: number;
  readonly dice?: number;
  readonly honor?: number;
  readonly item?: Item;
  /** Extra credited lines — guild Treasury, Drillmaster, pet bonus. */
  readonly bonuses?: readonly { readonly label: string; readonly amount: string }[];
}

export interface BattleResultProps {
  readonly victory: boolean;
  readonly analysis: BattleAnalysis;
  /** Name of whoever this screen is written for, for the headline. */
  readonly heroName: string;
  readonly opponentName: string;
  readonly rewards?: BattleRewards;
  readonly onContinue?: () => void;
  readonly continueLabel?: string;
  readonly onReplay?: () => void;
}

/** Loss hints become sentences here, so a copy edit never touches the engine. */
function hintCopy(hint: LossHint, opponentName: string): string {
  switch (hint.kind) {
    case 'armour':
      return `${opponentName}'s armour shrugged off ${Math.round(hint.mitigatedShare * 100)}% of your damage — raise your main attribute or find a heavier weapon.`;
    case 'evaded':
      return `${hint.evaded} of your ${hint.swings} swings were blocked, dodged or swung wide. Luck raises your critical rate; a higher level narrows their guard.`;
    case 'outpaced':
      return `They dealt ${Math.round(hint.theirPerRound)} damage a round to your ${Math.round(hint.yourPerRound)}. You need a better weapon before this fight is winnable.`;
    case 'fragile':
      return `You went down in ${hint.roundsSurvived} rounds. Constitution and armour buy you the rounds you need to land yours.`;
    case 'so-close':
      return `They finished on ${hint.theirRemaining} health of ${hint.theirMaxHealth}. One more point of damage a swing and this goes the other way.`;
    case 'round-limit':
      return 'Neither of you could finish it, and they held the larger share of their health when the bell rang.';
  }
}

interface RewardLineSpec {
  readonly label: string;
  readonly value: string;
  readonly icon?: ReactNode;
  readonly testId?: string;
}

/** Each line lands a beat after the last — the cascade is what makes rewards feel earned. */
const CASCADE_START = 0.18;
const CASCADE_STEP = 0.11;
const cascadeDelay = (index: number) => CASCADE_START + (index + 1) * CASCADE_STEP;

/** Flatten the rewards into the order they cascade in. */
function rewardLines(rewards: BattleRewards): readonly RewardLineSpec[] {
  const lines: RewardLineSpec[] = [];

  if (rewards.gold !== undefined) {
    lines.push({
      label: 'Gold',
      value: `+${rewards.gold.toLocaleString()}`,
      icon: <CoinIcon size={14} />,
      testId: 'reward-gold',
    });
  }
  if (rewards.xp !== undefined) {
    lines.push({
      label: 'Experience',
      value: `+${rewards.xp.toLocaleString()}`,
      testId: 'reward-xp',
    });
  }
  if (rewards.honor !== undefined) {
    lines.push({
      label: 'Honor',
      value: `${rewards.honor >= 0 ? '+' : ''}${rewards.honor.toLocaleString()}`,
      testId: 'reward-honor',
    });
  }
  if (rewards.dice !== undefined) {
    lines.push({
      label: 'Golden Dice',
      value: `+${rewards.dice.toLocaleString()}`,
      icon: <DiceIcon size={14} />,
      testId: 'reward-dice',
    });
  }
  for (const bonus of rewards.bonuses ?? []) {
    lines.push({ label: bonus.label, value: bonus.amount });
  }

  return lines;
}

function RewardLine({ label, value, icon, delay, testId }: RewardLineSpec & { delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...dramatic, delay }}
      className="border-parchment-500/12 flex items-center justify-between gap-6 border-b py-1.5 last:border-b-0"
      data-testid={testId}
    >
      <span className="text-parchment-500/70 flex items-center gap-2 text-sm">
        {icon}
        {label}
      </span>
      <span className="font-display text-parchment-300 text-base font-bold tabular-nums">
        {value}
      </span>
    </motion.div>
  );
}

export function BattleResult({
  victory,
  analysis,
  heroName,
  opponentName,
  rewards,
  onContinue,
  continueLabel = 'Continue',
  onReplay,
}: BattleResultProps) {
  const viewerLowest = analysis.lowestHealth.a;
  const viewerMax = analysis.maxHealth.a;
  const survivedOn = Math.max(0, viewerLowest);
  const lines = victory && rewards ? rewardLines(rewards) : [];
  // The loot card is the last thing to arrive, after every reward line has landed.
  const itemDelay = cascadeDelay(lines.length);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={dramatic}
      className={`chamfer-md edge-etched-strong w-full max-w-lg border p-6 ${
        victory ? 'bg-wood-800/96 border-amber-500/45' : 'bg-wood-900/96 border-parchment-500/20'
      }`}
      data-testid="battle-result"
      data-outcome={victory ? 'victory' : 'defeat'}
    >
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={dramatic}
        className="mb-4 text-center"
      >
        <p
          className={`font-display text-4xl font-extrabold tracking-wide ${
            victory ? 'text-amber-400' : 'text-parchment-500/70'
          }`}
        >
          {victory ? 'Victory' : 'Defeat'}
        </p>
        <p className="text-parchment-500/55 mt-1 text-sm">
          {victory
            ? `${heroName} leaves ${opponentName} in the dust after ${analysis.rounds} rounds.`
            : 'The tale continues…'}
        </p>
      </motion.header>

      {lines.length > 0 && (
        <div className="mb-4" data-testid="reward-lines">
          {lines.map((line, index) => (
            <RewardLine key={line.label} {...line} delay={cascadeDelay(index)} />
          ))}
        </div>
      )}

      {victory && rewards?.item && (
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...dramatic, delay: itemDelay }}
          className="mb-4"
          data-testid="reward-item"
        >
          <p className="text-parchment-500/45 mb-1.5 text-[11px] tracking-[0.25em] uppercase">
            Spoils
          </p>
          <ItemCard item={rewards.item} />
        </motion.div>
      )}

      {!victory && analysis.hints.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: duration.base, delay: 0.2 }}
          className="chamfer-sm border-blood-600/30 bg-blood-600/8 mb-4 border p-3"
          data-testid="loss-hints"
        >
          <p className="text-blood-600/85 mb-1.5 text-[11px] tracking-[0.25em] uppercase">
            What went wrong
          </p>
          <ul className="space-y-1.5">
            {analysis.hints.slice(0, 2).map((hint) => (
              <li key={hint.kind} className="text-parchment-300/80 text-sm leading-snug">
                {hintCopy(hint, opponentName)}
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/*
        The three one-time lines this screen owns (tutorial spec §4).

        Here rather than in each caller because every fight in the game — mission, duel, dungeon
        floor — ends on this component, so "the first Epic you ever see" means the same thing
        whichever room produced it. Each fires once per save and then never again; `Explainer`
        decides for itself.
      */}
      <div className="mb-4 empty:mb-0">
        <Explainer id="first-epic" when={rewards?.item?.rarity === 'epic'} />
        <Explainer id="first-set-piece" when={rewards?.item?.setId !== undefined} />
        <Explainer id="first-loss" when={!victory} />
      </div>

      {/* Closest moment — the stat that turns a number into a story. */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: duration.base, delay: 0.32 }}
        className="text-parchment-500/45 mb-5 text-center text-xs"
        data-testid="closest-moment"
      >
        {victory
          ? `Closest moment: you held on at ${survivedOn.toLocaleString()} of ${viewerMax.toLocaleString()} health.`
          : `You took them to ${Math.max(0, analysis.lowestHealth.b).toLocaleString()} of ${analysis.maxHealth.b.toLocaleString()} health.`}
        {' · '}
        {analysis.stats.a.crits} critical{analysis.stats.a.crits === 1 ? '' : 's'} in{' '}
        {analysis.stats.a.swings} swings
      </motion.p>

      <div className="flex items-center justify-center gap-3">
        {onContinue && (
          <ActionButton onClick={onContinue} data-testid="result-continue">
            {continueLabel}
          </ActionButton>
        )}
        {onReplay && (
          <ActionButton variant="secondary" onClick={onReplay} data-testid="result-replay">
            Watch again
          </ActionButton>
        )}
      </div>
    </motion.div>
  );
}
