/**
 * The Notice Board's daily draw (daily-loop spec §1).
 *
 * Three tasks, drawn from `(worldSeed, dayKey)` so the board is the same one all day however many
 * times it is read, and stored only as three ids — the definitions, the points and the progress
 * are all looked up. Nothing here writes; `state/boardActions.ts` does that.
 *
 * **The weighting is the design.** A uniform draw gives a mission-runner three mission tasks
 * often enough to matter, and a board that only ever asks for what you were already doing is a
 * board with no reason to exist. So each candidate's weight climbs with how *little* the player
 * has done of it lately: the pool leans toward the neglected corner without ever forcing it,
 * which is the difference between a nudge and a chore.
 *
 * Two guards that look like politeness and are load-bearing:
 *
 * - **Nothing locked.** `gateFor()` decides, so the gate lives in one place rather than being
 *   written down again here. A task for a room you cannot enter is points behind a locked door.
 * - **Nothing impossible.** The guild donation task is skipped for a player with no hall — the
 *   room is open at level 10 whether or not anyone let them in.
 *
 * Pure module.
 */

import { createRng, deriveSeed, type RngStream } from '@/engine/rng';
import { gateFor } from '@/engine/progression/gates';
import {
  DAILY_TASKS,
  TASKS_PER_DAY,
  TASK_POINTS,
  dailyTask,
  type DailyTaskDef,
} from '@/data/dailyTasks';
import { tallyOf, type ProgressMetric, type ProgressTally } from '@/data/progress';

export interface DrawContext {
  readonly worldSeed: number;
  readonly dayKey: string;
  readonly heroLevel: number;
  /** False for a player with no hall — the donation task has nowhere to send them. */
  readonly inGuild: boolean;
  /**
   * Lifetime units per metric, for the neglect weighting. Sparse and approximate on purpose:
   * this decides which of two reasonable tasks to show, not anything a player can be wronged by.
   */
  readonly history: ProgressTally;
}

/** One drawn task, resolved. */
export interface BoardTask {
  readonly definition: DailyTaskDef;
  /** 40, 30 or 30 — the *slot* carries the points, not the task (spec §1). */
  readonly points: number;
}

/** Whether this task could be drawn for this hero at all. */
export function isEligible(definition: DailyTaskDef, context: DrawContext): boolean {
  if (!gateFor(definition.place, context.heroLevel).unlocked) return false;
  if (definition.metric === 'goldDonated' && !context.inGuild) return false;
  return true;
}

/**
 * `[TUNE]` How hard the draw leans toward neglect.
 *
 * A metric the player has never touched is worth `1 + NEGLECT_LEAN` times one they have done a
 * lot of. Kept modest: at 1.0 the board would become a nagging list of everything the player has
 * decided they do not enjoy, which is a different game than the one being nudged.
 */
export const NEGLECT_LEAN = 0.85;

/**
 * A metric's weight, from how much of it the player has done.
 *
 * `1 / (1 + log)` rather than `1 / count`: the difference between never and once should matter,
 * and the difference between four hundred and eight hundred should not.
 */
export function weightFor(metric: ProgressMetric, history: ProgressTally): number {
  const done = Math.max(0, tallyOf(history, metric));
  const familiarity = Math.log10(1 + done) / Math.log10(1 + 500);
  return 1 + NEGLECT_LEAN * (1 - Math.min(1, familiarity));
}

/**
 * Draw the day's three.
 *
 * One metric per slot — three variations on "run missions" is a worse board than three different
 * rooms, even when the weighting would have picked missions twice on merit. The pool is large
 * enough that this never runs dry above level 3; below it, whatever the tavern can offer is what
 * the board shows, and a short board is honest.
 */
export function drawTasks(context: DrawContext): readonly BoardTask[] {
  const rng = createRng(deriveSeed(context.worldSeed, `board/${context.dayKey}`), 'tasks');
  const pool = DAILY_TASKS.filter((entry) => isEligible(entry, context));

  const chosen: DailyTaskDef[] = [];
  const usedMetrics = new Set<ProgressMetric>();

  for (let slot = 0; slot < TASKS_PER_DAY; slot += 1) {
    const candidates = pool.filter(
      (entry) => !usedMetrics.has(entry.metric) && !chosen.includes(entry),
    );
    // Fall back to allowing a repeated metric rather than shipping a two-task board: at level 3
    // the tavern is nearly the whole pool, and a board that pays 70 of a 100-point chest is a
    // chest the player can never open.
    const usable = candidates.length > 0 ? candidates : pool.filter((e) => !chosen.includes(e));
    if (usable.length === 0) break;

    const picked = pickWeighted(usable, context.history, rng.fork(`slot/${slot}`));
    chosen.push(picked);
    usedMetrics.add(picked.metric);
  }

  return chosen.map((definition, index) => ({
    definition,
    points: TASK_POINTS[index] ?? 0,
  }));
}

function pickWeighted(
  pool: readonly DailyTaskDef[],
  history: ProgressTally,
  rng: RngStream,
): DailyTaskDef {
  const weights = pool.map((entry) => weightFor(entry.metric, history));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng.next() * total;

  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index]!;
    if (roll <= 0) return pool[index]!;
  }
  return pool.at(-1)!;
}

/** Resolve stored ids back into tasks, dropping any the content no longer knows about. */
export function tasksFromIds(ids: readonly string[]): readonly BoardTask[] {
  return ids.flatMap((id, index) => {
    const definition = dailyTask(id);
    return definition ? [{ definition, points: TASK_POINTS[index] ?? 0 }] : [];
  });
}

/* ── Progress ────────────────────────────────────────────────────────────────────── */

export interface TaskProgress {
  readonly task: BoardTask;
  /** Units done today, clamped to the target — the meter never overfills. */
  readonly done: number;
  readonly target: number;
  readonly complete: boolean;
  /** Points this task has actually earned. All or nothing (spec §1). */
  readonly earned: number;
}

export function progressFor(task: BoardTask, tally: ProgressTally): TaskProgress {
  const target = task.definition.target;
  const raw = tallyOf(tally, task.definition.metric);
  const done = Math.min(target, raw);
  const complete = raw >= target;
  return { task, done, target, complete, earned: complete ? task.points : 0 };
}

export function pointsEarned(tasks: readonly BoardTask[], tally: ProgressTally): number {
  return tasks.reduce((sum, task) => sum + progressFor(task, tally).earned, 0);
}
