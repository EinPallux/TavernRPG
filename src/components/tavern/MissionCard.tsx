'use client';

/**
 * A job on the quest table (tavern spec §3).
 *
 * The card has to answer four questions before a click: where, what, how long, and what it
 * pays. Duration is picked *on the card* rather than in a modal, because the rewards change
 * with it and the player should watch them change — that is the whole decision.
 *
 * Odds are printed, not hidden (CLAUDE.md rule 6). The percentages come from the same table
 * the roll uses, so the card cannot lie.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { missionDropTable, rarityOdds } from '@/engine/items/drops';
import {
  MISSION_DURATIONS,
  missionPayout,
  greenhornBonus,
  GREENHORN_UNTIL,
  type PayoutBonus,
  type MissionDuration,
} from '@/engine/progression/rewards';
import { xpNeeded } from '@/engine/progression/xp';
import type { StoredMissionOffer } from '@/engine/save/schema';
import { blurb as blurbById, renderBlurb } from '@/data/missionBlurbs';
import { monster as monsterById } from '@/data/monsters';
import { ZONES_BY_ID, backdropFor, type ZoneId } from '@/data/zones';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTooltip } from '@/components/ui/Tooltip';
import { CoinIcon, SparkIcon } from '@/components/icons';
import { snappy, standard } from '@/styles/motion';

export interface MissionCardProps {
  readonly offer: StoredMissionOffer;
  readonly heroLevel: number;
  readonly vigor: number;
  /** Everything multiplying the payout — the greenhorn's due, the hall, the companion. */
  readonly bonus: PayoutBonus;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly onAccept: (duration: MissionDuration) => void;
  readonly index?: number;
}

export function MissionCard({
  offer,
  heroLevel,
  vigor,
  bonus,
  disabled = false,
  disabledReason,
  onAccept,
  index = 0,
}: MissionCardProps) {
  const [duration, setDuration] = useState<MissionDuration>(10);
  const greenTip = useTooltip({
    title: 'The greenhorn’s due',
    detail:
      'Gold and experience both, on contracts, the Long Road and the Undertavern. It shrinks a ' +
      `little every level and is gone at ${GREENHORN_UNTIL} — by then a contract pays what it ` +
      'always did.',
  });
  const oddsTip = useTooltip({
    title: 'Published odds',
    detail: 'The same numbers the game rolls against — never rounded in the house’s favour.',
  });

  const zone = ZONES_BY_ID[offer.zoneId as ZoneId];
  const monster = monsterById(offer.monsterId);
  const template = blurbById(offer.blurbId);

  /*
   * Quoted **with** the bonus, because the payout is paid with it.
   *
   * This card had been showing `missionPayout(...)` bare since Phase 5, so a guilded player with
   * a fed companion was told one number at the table and handed a larger one at the door. The
   * module comment on `missionPayout` says the bonus belongs at quote time for exactly this
   * reason — "a buff applied only on collection is a buff nobody believes in" — and the one
   * screen that quotes was the one place not passing it. The greenhorn's due made it impossible
   * to ignore: at level 1 the card would have understated the reward by more than half.
   */
  const payout = missionPayout(heroLevel, duration, xpNeeded(heroLevel), bonus);
  const greenhorn = greenhornBonus(heroLevel);
  const table = missionDropTable(duration);
  const affordable = vigor >= duration;

  const reason = disabledReason ?? (affordable ? undefined : `Needs ${duration} Vigor.`);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...standard, delay: index * 0.06 }}
      className="chamfer-md edge-etched surface-timber bg-wood-800/92 relative flex w-full flex-col overflow-hidden border border-amber-500/20"
      data-testid={`mission-card-${offer.id}`}
      data-zone={offer.zoneId}
    >
      {/* Zone art strip — the postcard from where you are being sent. */}
      <div className="relative h-28 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: zone ? `url('${backdropFor(zone, offer.backdropIndex)}')` : undefined,
          }}
        />
        <div aria-hidden className={`absolute inset-0 bg-gradient-to-t ${zone?.tint ?? ''}`} />
        {/* A scrim under the caption, because the tint is a mood and this is a label. Miller's
            Fields is a bright wheat field; the zone name measured 4.4:1 against it (style guide
            §10.3). Bottom-anchored so the painting stays a painting above the type. */}
        <div
          aria-hidden
          className="from-wood-900/95 pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t to-transparent"
        />
        <div className="absolute right-0 bottom-0 left-0 px-3 pb-2">
          <p className="font-display text-parchment-300 text-lg leading-tight font-bold">
            {zone?.name ?? offer.zoneId}
          </p>
          <p className="text-parchment-500/72 text-[11px] italic">{zone?.tagline}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* The posting */}
        <p className="text-parchment-300/85 min-h-[3.5rem] text-sm leading-snug">
          {template
            ? renderBlurb(template.text, {
                monster: monster?.name ?? 'something',
                zone: zone?.name ?? 'the wilds',
              })
            : `Work in ${zone?.name ?? 'the wilds'}.`}
        </p>

        {/* Who is out there */}
        <div className="chamfer-sm bg-wood-900/60 border-parchment-500/12 flex items-center gap-2.5 border px-2.5 py-2">
          <span className="text-parchment-500/72 text-[10px] tracking-[0.2em] uppercase">Foe</span>
          <span className="text-parchment-300 text-sm font-bold">{monster?.name ?? 'Unknown'}</span>
          <span className="text-parchment-500/72 ml-auto text-xs">
            Lv {offer.monsterLevel} · {monster?.archetypeId ?? '—'}
          </span>
        </div>

        {/* Length. Rewards scale with it, so the buttons live next to the numbers. */}
        <div>
          <p className="text-parchment-500/72 mb-1.5 text-[10px] tracking-[0.2em] uppercase">
            Length · costs Vigor
          </p>
          <div className="flex gap-1.5" role="group" aria-label="Mission length">
            {MISSION_DURATIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDuration(option)}
                aria-pressed={duration === option}
                disabled={disabled}
                className={`chamfer-sm font-display flex-1 border py-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${
                  duration === option
                    ? 'text-ink-900 border-amber-400 bg-amber-500'
                    : vigor >= option
                      ? 'border-parchment-500/25 text-parchment-500/75 hover:border-amber-500/60 hover:text-amber-500'
                      : 'border-parchment-500/10 text-parchment-500/72'
                }`}
                data-testid={`duration-${offer.id}-${option}`}
              >
                {option}m
              </button>
            ))}
          </div>
        </div>

        {/* What it pays */}
        <motion.dl
          key={duration}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={snappy}
          className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm"
        >
          <div className="flex items-center justify-between">
            <dt className="text-parchment-500/72 flex items-center gap-1.5">
              <CoinIcon size={13} />
              Gold
            </dt>
            <dd className="text-parchment-300 tabular-nums" data-testid={`payout-gold-${offer.id}`}>
              {payout.gold.toLocaleString()}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-parchment-500/72 flex items-center gap-1.5">
              <SparkIcon size={13} />
              XP
            </dt>
            <dd className="text-parchment-300 tabular-nums" data-testid={`payout-xp-${offer.id}`}>
              {payout.xp.toLocaleString()}
            </dd>
          </div>
        </motion.dl>

        {/* The greenhorn's due, said out loud while it lasts (balancing §19) — a bonus the player
            cannot see is one that only exists in a spreadsheet.

            A label and a number rather than a sentence, and that is a decision made at the
            screenshot: three cards are on the board at once, so any prose here is printed three
            times and reads as a banner rather than as part of the card. The multiplier is the
            interesting part — it shrinks every level — and it belongs in the payout block whose
            figures it inflates. The sentence lives in the tooltip, where it is read once. */}
        {greenhorn > 1 && (
          <p
            className="border-parchment-500/10 flex items-baseline justify-between border-t pt-2 text-[11px] text-amber-400"
            data-testid="greenhorn-note"
            data-bonus={greenhorn.toFixed(2)}
            {...greenTip}
            tabIndex={0}
          >
            <span>Greenhorn’s due</span>
            <span className="font-bold tabular-nums">×{greenhorn.toFixed(2)}</span>
          </p>
        )}

        {/* Published odds — the same table the roll obeys. */}
        <div
          className="border-parchment-500/10 border-t pt-2"
          data-testid={`odds-${offer.id}`}
          {...oddsTip}
          tabIndex={0}
        >
          <div className="text-parchment-500/72 flex items-center justify-between text-[11px]">
            <span>Item drop</span>
            <span className="tabular-nums">{Math.round(table.itemChance * 100)}%</span>
          </div>
          <div className="text-parchment-500/72 mt-0.5 flex items-center justify-between text-[10px]">
            <span>Rare / Epic</span>
            <span className="tabular-nums">
              {rarityOdds(table, 'rare').toFixed(1)}% / {rarityOdds(table, 'epic').toFixed(1)}%
            </span>
          </div>
        </div>

        <ActionButton
          fullWidth
          onClick={() => onAccept(duration)}
          disabled={disabled}
          {...(reason ? { disabledReason: reason } : {})}
          data-testid={`accept-${offer.id}`}
        >
          Take the job
        </ActionButton>
      </div>
    </motion.article>
  );
}
