/**
 * The one-owner audit (ROADMAP Phase 15 acceptance: "no feature reads the clock independently").
 *
 * Every other test in the suite checks what the code *does*. This one checks the shape it is
 * allowed to have, because the rule it defends cannot be caught by behaviour: two features that
 * each decide "is it tomorrow yet?" both work perfectly in isolation and drift only in
 * production, at midnight, for a player who had the tab open. The shop rerolled and the tasks
 * did not; nothing threw.
 *
 * So the audit is structural and it reads the source. Three claims:
 *
 * 1. **One walk.** `processResets` has exactly one caller, and it is `refreshDay`.
 * 2. **One funnel.** Every `refresh<Feature>Day` is called from `refreshDay` and nowhere else.
 * 3. **No second clock.** Nothing outside the clock modules and the reset engine compares a
 *    stored day key against today to decide a refresh for itself.
 *
 * A failure here is not a bug yet. It is the shape a bug takes three phases before it happens.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = join(process.cwd(), 'src/state');
const COMPONENTS_DIR = join(process.cwd(), 'src/components');

function sourceFiles(dir: string): { name: string; path: string; text: string }[] {
  const out: { name: string; path: string; text: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push({ name: entry.name, path, text: readFileSync(path, 'utf8') });
    }
  }
  return out;
}

const stateFiles = sourceFiles(STATE_DIR);
const componentFiles = sourceFiles(COMPONENTS_DIR);

describe('one owner decides it is tomorrow', () => {
  it('calls processResets from exactly one place', () => {
    const callers = stateFiles.filter((file) => file.text.includes('processResets('));
    expect(callers.map((file) => file.name)).toEqual(['missionActions.ts']);

    // ...and once inside it, not once per screen that happens to be open.
    const body = callers[0]!.text;
    expect(body.split('processResets(').length - 1).toBe(1);
  });

  it('routes every per-feature refresh through refreshDay and nowhere else', () => {
    // Each feature's midnight work is a `refresh<X>Day` export. They exist so the walk can hand
    // them the boundary; a screen calling one directly would be a second clock with extra steps.
    const refreshers = new Set<string>();
    for (const file of stateFiles) {
      // `refresh<Capital>Day` — the per-feature ones. `refreshDay` itself is the funnel's own
      // public entry and is *supposed* to be called from the store.
      for (const match of file.text.matchAll(/export function (refresh[A-Z]\w*Day)\b/g)) {
        refreshers.add(match[1]!);
      }
    }
    // Sanity: the audit is worthless if it found nothing to audit.
    expect(refreshers.size).toBeGreaterThanOrEqual(5);

    for (const name of refreshers) {
      const callers = stateFiles
        .filter((file) => !file.text.includes(`export function ${name}`))
        .filter((file) => new RegExp(`\\b${name}\\s*\\(`).test(file.text))
        .map((file) => file.name);

      expect(callers, `${name} is called from ${callers.join(', ') || 'nowhere'}`).toEqual([
        'missionActions.ts',
      ]);
    }
  });

  it('lets no component call a refresher itself', () => {
    // Screens may ask the store to *refresh the day* — that is the funnel. What they may not do
    // is reach past it to one feature's boundary work.
    for (const file of componentFiles) {
      const direct = file.text.match(/\brefresh(Arena|Guild|Forge|Gacha|Pet|Board)Day\s*\(/);
      expect(direct?.[0], `${file.name} calls ${direct?.[0]}`).toBeUndefined();
    }
  });
});

describe('nobody keeps a second clock', () => {
  /**
   * The shape of an independent clock check: a stored day key compared against today, outside
   * the modules whose job that is.
   *
   * `boardActions` and `calendarActions` are allowed and named here on purpose — both compare a
   * stored key, and both are *called by the walk* rather than by a screen. Being on this list is
   * the acknowledgement that they are part of the reset engine's surface, not an exemption from
   * the rule.
   */
  const ALLOWED = new Set([
    'clock.ts',
    'resetEngine.ts',
    'missionActions.ts',
    'boardActions.ts',
    'calendarActions.ts',
    // The arena and the guild compare *week* keys for their payouts, which the walk hands them.
    'arenaActions.ts',
    'guildActions.ts',
    'gachaActions.ts',
  ]);

  it('keeps day-key comparison out of every screen', () => {
    for (const file of componentFiles) {
      // `currentDayKey()` is fine in a component — reading today to *display* it is not deciding
      // anything. Comparing it to something stored is.
      const suspicious = file.text.match(
        /(currentDayKey\(\)\s*[!=]==?|[!=]==?\s*currentDayKey\(\))/,
      );
      expect(suspicious?.[0], `${file.name} compares against currentDayKey`).toBeUndefined();
    }
  });

  it('keeps it out of every state module that is not part of the walk', () => {
    for (const file of stateFiles) {
      if (ALLOWED.has(file.name)) continue;
      const suspicious = file.text.match(/lastStampedDay|lastChestDay|drawnFor|boardDay/);
      expect(suspicious?.[0], `${file.name} reads a stored day key`).toBeUndefined();
    }
  });
});
