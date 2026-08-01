/**
 * The progress vocabulary, audited from both ends.
 *
 * `PROGRESS_METRICS` is the one list of things the game counts, and a name on it is only worth
 * having if something **writes** it and something **reads** it. Both halves have failed in this
 * codebase already, in opposite directions:
 *
 * - Phase 15 unified the bounty and the board and found that `itemsScrapped` and `levelsGained`
 *   — two of six bounty metrics — had never been credited from the player's side at all. Posters
 *   asking for something no action produced.
 * - The Long Road shipped the mirror image: `campaignStages` declared and credited on every first
 *   clear, with no daily task and no bounty reading it. A room with no way onto the Notice Board,
 *   and a counter that only ever went up in the save file.
 *
 * Neither is visible from behaviour — every test passes, the number is right, and nobody is
 * asking for it. So this reads the source, the way `reset/audit.test.ts` and `tooltips.test.ts`
 * do, and fails on a metric with a missing end.
 *
 * A **consumer** is deliberately any of three things, because the vocabulary genuinely serves
 * three surfaces: the Notice Board's daily pool, the weekly Guild Bounty, and the tutorial's
 * beats — which is where `missionsAccepted`, `missionsReturned` and `itemsEquipped` are read, and
 * the reason those three exist at all.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROGRESS_METRICS, type ProgressMetric } from './progress';
import { DAILY_TASKS, TASKS_PER_DAY } from './dailyTasks';
import { BOUNTY_METRICS } from './bounties';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/**
 * The transition layer with its prose removed.
 *
 * `src/state/` is the only place a player action becomes a number, so a metric's name appearing
 * in live code there means it is credited. Comments are stripped first, because this file is
 * mostly comment and a metric discussed in one is exactly the case being guarded against.
 */
const STATE = walk(join(SRC, 'state'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

const BEATS = readFileSync(join(SRC, 'engine', 'tutorial', 'beats.ts'), 'utf8');

const taskMetrics = new Set<ProgressMetric>(DAILY_TASKS.map((task) => task.metric));
const bountyMetrics = new Set<string>(BOUNTY_METRICS);

describe('every metric the game counts', () => {
  it.each(PROGRESS_METRICS)('%s is credited by something the player does', (metric) => {
    /*
     * `credit()` and `creditAll()` are the only paths from an action to a number
     * (`state/progressActions.ts`), so a metric nobody puts through one is one the game will
     * report as zero forever.
     *
     * Checked as "the name appears in live code under `src/state/`" rather than by matching the
     * call shape. `creditAll` takes pairs and `credit`'s third argument is often a computed
     * expression, so a shape regex needs a character window — and a window is a number that
     * silently stops covering the call the day somebody reformats it. This proxy is exact in the
     * direction that matters: nothing else in the transition layer has a reason to name a metric.
     */
    expect(
      STATE.includes(`'${metric}'`),
      `no credit() or creditAll() call in src/state names '${metric}'`,
    ).toBe(true);
  });

  it.each(PROGRESS_METRICS)('%s is read by a task, a bounty or a beat', (metric) => {
    const where = [
      taskMetrics.has(metric) && 'a daily task',
      bountyMetrics.has(metric) && 'a guild bounty',
      BEATS.includes(`'${metric}'`) && 'a tutorial beat',
    ].filter(Boolean);

    expect(
      where.length,
      `'${metric}' is counted and nothing asks for it — give it a daily task in dailyTasks.ts, ` +
        `a bounty in bounties.ts, or delete it`,
    ).toBeGreaterThan(0);
  });

  it('found real source to read rather than an empty match', () => {
    // The census is only worth having if it parsed something; a walk that quietly returned
    // nothing would pass every assertion above by matching against an empty string.
    expect(STATE.length).toBeGreaterThan(50_000);
    expect(STATE).toContain('creditAll');
    expect(BEATS).toContain('missionsAccepted');
    expect(PROGRESS_METRICS.length).toBeGreaterThan(10);
  });
});

describe('the Notice Board pool', () => {
  it('sends the player to a room that exists, with an icon that exists', () => {
    // Cheap, and it is the failure that produces a task nobody can complete: the draw filters on
    // `place` being unlocked, so a typo there silently removes the task from the pool forever.
    for (const task of DAILY_TASKS) {
      expect(PROGRESS_METRICS, task.id).toContain(task.metric);
      expect(task.target, task.id).toBeGreaterThan(0);
      expect(task.title, task.id).toContain('{n}');
    }
  });

  it('is deep enough that a week is not the same three posters', () => {
    /*
     * The pool's own stated rule, as the property rather than as a per-room count. Three are
     * drawn a day and the draw is neglect-weighted, so what matters is that the pool is several
     * times a day's draw and spread across rooms — not that every metric has exactly two, which
     * would only ever be true until the next one that sensibly has one.
     */
    expect(DAILY_TASKS.length).toBeGreaterThan(TASKS_PER_DAY * 4);
    expect(new Set(DAILY_TASKS.map((task) => task.place)).size).toBeGreaterThan(6);
  });
});
