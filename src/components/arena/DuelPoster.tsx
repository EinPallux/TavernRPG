'use client';

/**
 * An opponent, as a duelling poster (arena spec §4).
 *
 * The spec asks for "nailed parchment, wax seal rank", and the reason is worth stating: three
 * rows in a table are three strangers, but three posters nailed to a board are three people
 * somebody bothered to write about. The poster is the card, the seal is the rank, and the winner
 * gets a laurel stamped across theirs.
 *
 * The threat read is the one piece of copy this component must not improvise. `threatRead`
 * produces it in the world's voice and deliberately without numbers (scouting is post-1.0); a
 * poster that quietly showed "armour 412" would undo the whole design.
 */

import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import type { ThreatLevel, ThreatRead } from '@/engine/arena/arena';
import type { BotProfile } from '@/engine/world/materialize';
import { guild } from '@/data/guilds';
import { ActionButton } from '@/components/ui/ActionButton';
import { LaurelIcon } from '@/components/icons';
import { dramatic, snappy } from '@/styles/motion';

/**
 * How far up or down the ladder this one sits.
 *
 * A gap rather than a bucket. The draw *aims* for one above, one level and one below, but a
 * player at the foot of the ladder has nobody below them and one at the top has nobody above —
 * so a fixed "The climb / A fair fight / Safe points" caption is three identical labels exactly
 * when the player most needs to tell the cards apart. The rungs are always true and always
 * distinguish.
 */
function gapLabel(gap: number): string {
  if (gap === 0) return 'Your rung';
  const rungs = Math.abs(gap);
  return `${rungs.toLocaleString()} ${rungs === 1 ? 'rung' : 'rungs'} ${gap > 0 ? 'up' : 'down'}`;
}

/**
 * Tones are dark-on-parchment, not the usual light-on-timber.
 *
 * The poster is the one parchment surface in the room, so the palette inverts: `parchment-300`
 * and `amber-400` are chosen to sit on dark wood and disappear entirely here.
 */
const THREAT_LOOK: Readonly<Record<ThreatLevel, { label: string; tone: string; edge: string }>> = {
  /*
   * The *dark* semantic colours, deliberately, and the one place in the game that wants them.
   *
   * A duelling poster is pinned parchment, so this is light-surface text — the exact inverse of
   * every panel in Emberhollow, and the Phase 17 pass caught the -400 siblings sitting on it at
   * 1.5:1. The -400s exist for dark timber; on parchment they are almost invisible. Anything
   * added to this map is on a light background and takes a -600.
   */
  easy: { label: 'Favourable', tone: 'text-moss-600', edge: 'border-moss-600/35' },
  even: { label: 'Even', tone: 'text-ink-900/75', edge: 'border-ink-900/20' },
  risky: { label: 'Risky', tone: 'text-ember-700', edge: 'border-amber-500/50' },
  dangerous: { label: 'Dangerous', tone: 'text-blood-700', edge: 'border-blood-600/45' },
};

/**
 * The wax seal carrying the rank.
 *
 * Drawn rather than imaged so it can take any number of digits — rank 1 and rank 1,487 have to
 * sit in the same blob without one of them overflowing it.
 */
function RankSeal({ rank, pressed }: { rank: number; pressed: boolean }) {
  return (
    <motion.span
      initial={pressed ? { scale: 1.7, rotate: -18, opacity: 0 } : false}
      animate={{ scale: 1, rotate: -6, opacity: 1 }}
      transition={snappy}
      className="absolute -top-3 -right-2 grid h-12 w-12 place-items-center"
      data-testid="rank-seal"
      aria-hidden
    >
      <svg viewBox="0 0 48 48" className="text-blood-400 absolute inset-0 h-full w-full">
        {/* An irregular blob: a perfect circle reads as a button, not as wax. */}
        <path
          d="M24 2c6 0 9 4 13 6s9 1 9 7-4 8-4 13 4 7 2 12-8 3-12 6-6 4-12 3-8-6-12-8-8-2-8-8 3-7 3-12-3-8-1-13 8-3 12-4 4-2 10-2Z"
          fill="currentColor"
          fillOpacity="0.9"
        />
        <path
          d="M24 2c6 0 9 4 13 6s9 1 9 7-4 8-4 13 4 7 2 12-8 3-12 6-6 4-12 3-8-6-12-8-8-2-8-8 3-7 3-12-3-8-1-13 8-3 12-4 4-2 10-2Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      <span className="font-display text-ink-900 relative text-[0.62rem] leading-none font-extrabold tabular-nums">
        {rank > 999 ? `${Math.round(rank / 100) / 10}k` : rank}
      </span>
    </motion.span>
  );
}

export interface DuelPosterProps {
  readonly profile: BotProfile;
  readonly rank: number;
  /** Rungs between the player and this one; positive is up the ladder. */
  readonly gap: number;
  readonly threat: ThreatRead;
  /** True while the cooldown is running or a fight is already staged. */
  readonly disabled: boolean;
  readonly disabledReason?: string;
  /** This one owes the player a fight (arena spec §1 step 6). */
  readonly revenge?: boolean;
  /** They are one of the two or three names the player knows. */
  readonly rival?: boolean;
  /** Stamped after a win, before the poster leaves the board. */
  readonly beaten?: boolean;
  readonly index: number;
  readonly onFight: () => void;
}

export function DuelPoster({
  profile,
  rank,
  gap,
  threat,
  disabled,
  disabledReason,
  revenge = false,
  rival = false,
  beaten = false,
  index,
  onFight,
}: DuelPosterProps) {
  const reduced = useReducedMotion();
  const look = THREAT_LOOK[threat.level];
  const hall = guild(profile.guildId);

  return (
    <motion.article
      layout
      initial={reduced ? false : { opacity: 0, y: -18, rotate: index % 2 === 0 ? -1.4 : 1.1 }}
      animate={{ opacity: 1, y: 0, rotate: index % 2 === 0 ? -0.7 : 0.6 }}
      exit={{ opacity: 0, y: 14, rotate: 0 }}
      transition={{ ...dramatic, delay: reduced ? 0 : index * 0.07 }}
      whileHover={reduced || disabled ? undefined : { rotate: 0, y: -3 }}
      className={`surface-parchment chamfer-md relative flex flex-col border ${look.edge} bg-parchment-500/95 text-ink-900 px-4 pt-4 pb-3 shadow-[0_14px_30px_-22px_rgb(0_0_0/0.9)]`}
      data-testid={`duel-poster-${profile.id}`}
      data-threat={threat.level}
    >
      {/* Two nails, because one nail would let the poster hang crooked and it does not. */}
      <span
        aria-hidden
        className="bg-wood-900/45 absolute top-1.5 left-3 h-1.5 w-1.5 rounded-[1px] shadow-inner"
      />
      <span
        aria-hidden
        className="bg-wood-900/45 absolute top-1.5 right-3 h-1.5 w-1.5 rounded-[1px] shadow-inner"
      />

      <RankSeal rank={rank} pressed={!reduced} />

      <p className="font-display text-ink-900/70 text-[0.6rem] tracking-[0.3em] uppercase">
        {gapLabel(gap)}
      </p>

      <div className="mt-2 flex items-start gap-3">
        {/* Bots use class portraits and nothing else (CLAUDE.md #5). Fifteen hundred generated
            faces would be fifteen hundred chances to look wrong. */}
        <span className="chamfer-sm border-ink-900/20 bg-wood-900/15 relative h-14 w-14 shrink-0 overflow-hidden border">
          <Image
            src={profile.portrait}
            alt=""
            width={56}
            height={56}
            className="h-full w-full object-cover"
          />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-ink-900 truncate text-lg leading-tight font-extrabold">
            {profile.name}
          </h3>
          <p className="text-ink-900/70 truncate text-xs">
            Level {profile.level}
            {hall ? ` · ${hall.name}` : ' · unguilded'}
          </p>
          <p className="text-ink-900/70 mt-0.5 text-xs tabular-nums">
            {profile.honor.toLocaleString()} honour
          </p>
        </div>
      </div>

      {(revenge || rival) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {revenge && (
            <span
              className="chamfer-sm border-blood-600/50 bg-blood-600/15 text-blood-400 border px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider uppercase"
              data-testid="revenge-chip"
            >
              Owes you one
            </span>
          )}
          {rival && (
            <span className="chamfer-sm border-ink-900/35 bg-ink-900/10 text-ink-900 border px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider uppercase">
              Rival
            </span>
          )}
        </div>
      )}

      <div className={`border-ink-900/12 mt-3 border-t pt-2.5`}>
        <p className={`font-display text-xs font-bold ${look.tone}`} data-testid="threat-level">
          {look.label} — {threat.summary}
        </p>
        <ul className="text-ink-900/70 mt-1.5 space-y-0.5 text-xs leading-snug">
          {threat.notes.map((note) => (
            <li key={note} className="flex gap-1.5">
              <span aria-hidden className="text-ink-900/70">
                ·
              </span>
              {note}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3">
        <ActionButton
          size="sm"
          variant={revenge ? 'danger' : 'primary'}
          fullWidth
          onClick={onFight}
          {...(disabled && disabledReason ? { disabledReason } : {})}
          {...(disabled && !disabledReason ? { disabledReason: 'Not yet.' } : {})}
          data-testid={`fight-${profile.id}`}
        >
          {revenge ? 'Settle it' : 'Fight'}
        </ActionButton>
      </div>

      {/* The laurel stamp: pressed on hard, then settles crooked, like a real one. Ringed and
          captioned, because a bare glyph at this size reads as a smudge rather than a verdict. */}
      {beaten && (
        <motion.span
          initial={reduced ? false : { scale: 2.4, opacity: 0, rotate: -34 }}
          animate={{ scale: 1, opacity: 1, rotate: -13 }}
          transition={snappy}
          className="text-blood-400/75 pointer-events-none absolute inset-0 grid place-items-center"
          data-testid="laurel-stamp"
          aria-hidden
        >
          <span className="chamfer-md flex flex-col items-center gap-0.5 border-[3px] border-current px-8 py-4">
            <LaurelIcon size={40} />
            <span className="font-display text-sm leading-none font-extrabold tracking-[0.25em]">
              BEATEN
            </span>
          </span>
        </motion.span>
      )}
    </motion.article>
  );
}
