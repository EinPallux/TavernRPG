'use client';

/**
 * The rank swap, *shown* (arena spec §4: "ladder rows visibly slide — the climb shown, not just
 * numbered").
 *
 * A result screen that says "rank 412 → 397" has told the player a fact. Two rows physically
 * trading places has told them they climbed. The difference is the whole reason this component
 * exists, and it is why the rows animate by `layout` rather than by a number ticking: the eye
 * follows the movement, not the digits.
 *
 * Renders the neighbourhood around the swap — a couple of rungs either side — so the two rows
 * move *past* something rather than in a void. When the two are far apart it shows two clusters
 * with the distance between them named, because thirty rungs of strangers is not context, it is
 * a scrollbar.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { dramatic, snappy } from '@/styles/motion';

export interface LadderRow {
  readonly id: number;
  readonly name: string;
  readonly honor: number;
  readonly isPlayer: boolean;
}

/** A run of rungs, and the rank its first row sits at. */
export interface LadderRun {
  readonly topRank: number;
  readonly rows: readonly LadderRow[];
}

export interface LadderSwapProps {
  /**
   * One or two runs of rows, best first, as they stood *before* the fight. Two runs render with
   * the skipped rungs counted between them.
   */
  readonly runs: readonly LadderRun[];
  /** True once the swap should play. */
  readonly swapped: boolean;
  /** The two ids that trade places. */
  readonly playerId: number;
  readonly opponentId: number;
}

export function LadderSwap({ runs, swapped, playerId, opponentId }: LadderSwapProps) {
  const reduced = useReducedMotion();
  // Hold the old order for a beat so the player sees where they *were* before it moves. The flag
  // is only ever raised by the timer — deriving `moved` from `swapped` alone would move the rows
  // on the same frame the result appears, which is the beat this component exists for.
  const [elapsed, setElapsed] = useState(false);
  const moved = swapped && elapsed;

  useEffect(() => {
    if (!swapped) return;
    const id = setTimeout(() => setElapsed(true), reduced ? 0 : 420);
    return () => clearTimeout(id);
  }, [reduced, swapped]);

  /**
   * The rows to draw, flattened with their ranks resolved.
   *
   * The swap is applied across runs rather than within one, because the two fighters are usually
   * in *different* clusters — that is why there are two.
   */
  const drawn = useMemo(() => {
    const flat = runs.flatMap((run, runIndex) =>
      run.rows.map((row, index) => ({
        row,
        rank: run.topRank + index,
        /** True on the first row of a run that follows a gap. */
        gapBefore: runIndex > 0 && index === 0,
        gapSize:
          runIndex > 0
            ? run.topRank -
              ((runs[runIndex - 1]?.topRank ?? 0) + (runs[runIndex - 1]?.rows.length ?? 0))
            : 0,
      })),
    );

    if (!moved) return flat;

    const a = flat.findIndex((entry) => entry.row.id === playerId);
    const b = flat.findIndex((entry) => entry.row.id === opponentId);
    if (a === -1 || b === -1) return flat;

    // Rows swap; the rungs they sit on do not. Rank, gap marker and all stay with the position.
    const next = [...flat];
    next[a] = { ...next[a]!, row: flat[b]!.row };
    next[b] = { ...next[b]!, row: flat[a]!.row };
    return next;
  }, [moved, opponentId, playerId, runs]);

  return (
    <ol className="space-y-1" data-testid="ladder-swap" data-moved={moved}>
      {drawn.map(({ row, rank, gapBefore, gapSize }) => {
        const involved = row.id === playerId || row.id === opponentId;

        return (
          <li key={row.id} className={gapBefore ? 'pt-1' : undefined}>
            {gapBefore && gapSize > 0 && (
              <p
                className="text-parchment-500/72 mb-1 text-center text-[0.65rem] tracking-widest"
                data-testid="ladder-gap"
              >
                ⋯ {gapSize.toLocaleString()} {gapSize === 1 ? 'rung' : 'rungs'} ⋯
              </p>
            )}
            <motion.div
              layout
              transition={reduced ? { duration: 0 } : dramatic}
              className={`chamfer-sm flex items-center gap-3 border px-3 py-1.5 text-sm ${
                row.isPlayer
                  ? 'text-parchment-300 border-amber-500/60 bg-amber-500/12'
                  : involved
                    ? 'border-parchment-500/25 bg-wood-800/70 text-parchment-300/85'
                    : 'border-parchment-500/10 bg-wood-900/45 text-parchment-500/72'
              }`}
              data-testid={row.isPlayer ? 'ladder-row-player' : `ladder-row-${row.id}`}
            >
              {/* The rank belongs to the *rung*, not the row — it stays put while names move past
                  it, which is what makes the climb legible. */}
              <motion.span
                key={`${row.id}:${rank}`}
                initial={reduced ? false : { scale: involved ? 1.25 : 1 }}
                animate={{ scale: 1 }}
                transition={snappy}
                className="font-display w-12 shrink-0 text-right text-xs font-bold tabular-nums opacity-70"
              >
                #{rank.toLocaleString()}
              </motion.span>
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <span className="shrink-0 text-xs tabular-nums opacity-60">
                {row.honor.toLocaleString()}
              </span>
            </motion.div>
          </li>
        );
      })}
    </ol>
  );
}
