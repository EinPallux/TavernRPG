'use client';

/**
 * The 1,501, virtualized (arena spec §2).
 *
 * The acceptance criterion is "scrolls at 60fps", and 1,501 rows of portrait, name, guild and
 * honor is comfortably enough DOM to miss it on a laptop. So only the visible window is mounted:
 * a spacer of the full height holds the scrollbar honest, and roughly thirty rows are rendered at
 * any moment.
 *
 * Hand-rolled rather than a virtualization library. The list is *uniform* — every row is exactly
 * `ROW_HEIGHT` — which makes the whole problem three lines of arithmetic, and the dependency
 * would be several hundred kilobytes to solve a case it is not needed for.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { PLAYER_LADDER_ID } from '@/engine/world/ladder';
import { guild } from '@/data/guilds';
import { snappy } from '@/styles/motion';

/** Fixed, and it must stay fixed — the whole windowing calculation assumes it. */
export const ROW_HEIGHT = 40;
/** Rows rendered above and below the viewport, so a fast flick does not show holes. */
const OVERSCAN = 8;

export interface LadderEntry {
  readonly id: number;
  readonly rank: number;
  readonly name: string;
  readonly level: number;
  readonly honor: number;
  readonly guildId: number;
  readonly portrait: string;
  readonly isPlayer: boolean;
  readonly legend: boolean;
  readonly dormant: boolean;
  readonly rival: boolean;
}

export interface LadderListProps {
  readonly entries: readonly LadderEntry[];
  /** Scrolled to on mount and whenever it changes — the player's own rung. */
  readonly focusRank?: number;
  readonly onSelect?: (entry: LadderEntry) => void;
  readonly selectedId?: number | null;
  readonly height: number;
}

export function LadderList({ entries, focusRank, onSelect, selectedId, height }: LadderListProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  // Scroll-to-focus runs once per focus value rather than on every render, so a player who
  // scrolls away is not yanked back on the next tick.
  const focused = useRef<number | null>(null);

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      viewport.current = node;
      if (!node || focusRank === undefined || focused.current === focusRank) return;
      focused.current = focusRank;
      // Centre it: a row pinned to the top edge reads as "the list starts here".
      node.scrollTop = Math.max(0, (focusRank - 1) * ROW_HEIGHT - height / 2 + ROW_HEIGHT / 2);
      setScrollTop(node.scrollTop);
    },
    [focusRank, height],
  );

  const window_ = useMemo(() => {
    const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visible = Math.ceil(height / ROW_HEIGHT) + OVERSCAN * 2;
    return { first, rows: entries.slice(first, first + visible) };
  }, [entries, height, scrollTop]);

  return (
    <div
      ref={attach}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className="relative overflow-y-auto"
      style={{ height }}
      data-testid="ladder-list"
    >
      {/* The spacer carries the full height so the scrollbar tells the truth about 1,501 rows. */}
      <div style={{ height: entries.length * ROW_HEIGHT }} className="relative">
        {window_.rows.map((entry, index) => (
          <LadderRow
            key={entry.id}
            entry={entry}
            top={(window_.first + index) * ROW_HEIGHT}
            selected={selectedId === entry.id}
            {...(onSelect ? { onSelect } : {})}
          />
        ))}
      </div>
    </div>
  );
}

function LadderRow({
  entry,
  top,
  selected,
  onSelect,
}: {
  entry: LadderEntry;
  top: number;
  selected: boolean;
  onSelect?: (entry: LadderEntry) => void;
}) {
  const hall = guild(entry.guildId);

  return (
    <button
      type="button"
      onClick={onSelect ? () => onSelect(entry) : undefined}
      style={{ top, height: ROW_HEIGHT }}
      className={`chamfer-sm absolute inset-x-0 flex w-full items-center gap-3 border px-3 text-left text-sm transition-colors ${
        entry.isPlayer
          ? 'text-parchment-300 border-amber-500/60 bg-amber-500/12'
          : selected
            ? 'bg-wood-700/70 text-parchment-300 border-amber-500/35'
            : 'border-parchment-500/8 bg-wood-900/40 text-parchment-500/70 hover:bg-wood-800/60 hover:border-amber-500/30'
      } ${entry.dormant ? 'opacity-55' : ''}`}
      data-testid={entry.isPlayer ? 'ladder-entry-player' : `ladder-entry-${entry.id}`}
    >
      <span className="font-display w-14 shrink-0 text-right text-xs font-bold tabular-nums opacity-70">
        #{entry.rank.toLocaleString()}
      </span>

      <span className="chamfer-sm border-parchment-500/15 relative h-7 w-7 shrink-0 overflow-hidden border">
        <Image
          src={entry.portrait}
          alt=""
          width={28}
          height={28}
          className="h-full w-full object-cover"
        />
      </span>

      <span className="min-w-0 flex-1 truncate">
        {entry.name}
        {entry.legend && <span className="ml-1.5 text-xs text-amber-500">★</span>}
        {entry.rival && (
          <span className="text-blood-600 ml-1.5 text-[0.6rem] font-bold tracking-wider uppercase">
            rival
          </span>
        )}
      </span>

      <span className="hidden w-44 shrink-0 truncate text-xs opacity-50 lg:block">
        {hall ? hall.name : '—'}
      </span>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums opacity-60">
        L{entry.level}
      </span>
      <span className="w-24 shrink-0 text-right text-xs tabular-nums opacity-80">
        {entry.honor.toLocaleString()}
      </span>
    </button>
  );
}

/** The "▲ 12 overnight" chip, shown against the player's own row. */
export function RankDelta({ delta }: { delta: number }) {
  if (delta === 0) return null;
  return (
    <motion.span
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={snappy}
      className={`chamfer-sm border px-1.5 py-0.5 text-xs font-bold tabular-nums ${
        delta > 0
          ? 'border-moss-600/50 bg-moss-600/15 text-parchment-300'
          : 'border-blood-600/45 bg-blood-600/12 text-blood-600'
      }`}
      data-testid="hall-rank-delta"
    >
      {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString()}
    </motion.span>
  );
}

export { PLAYER_LADDER_ID };
