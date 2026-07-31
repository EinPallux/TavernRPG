/**
 * The release checklist has to agree with the GDD, and with the disk.
 *
 * "Every feature in §4 is complete" (GDD §7) is settled by reading a table and nodding, unless
 * something makes the nodding expensive. This is that something, and it is a **census**, not a
 * behaviour test: `docs/design/game-design-document.md` §4 is parsed for its seventeen feature
 * rows and compared against `checklist.ts` in both directions. Adding a feature to the GDD
 * without evidence fails here; quietly dropping one from the GDD while the checklist still
 * claims it fails here too.
 *
 * Then every path either file names is checked to exist. Six months of refactors is enough to
 * rename a screen, and a checklist that points at a file nobody has opened since is a checklist
 * that has stopped checking. This is the same shape as `reset/audit.test.ts` and
 * `save/fixtures.test.ts`: behaviour cannot catch an omission, only a census can.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RELEASE_CHECKLIST, RELEASE_GATES } from './checklist';

const GDD = readFileSync(join(process.cwd(), 'docs/design/game-design-document.md'), 'utf8');

/** The first column of every row in the §4 table, in document order. */
function featuresInGdd(): string[] {
  const section = /## 4\. Feature summary \(v1\.0\)([\s\S]*?)\n## /.exec(GDD);
  if (!section) throw new Error('GDD §4 not found — the release census cannot run');

  return section[1]!
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|')[1]!.trim())
    .filter((cell) => cell.length > 0 && cell !== 'Feature' && !/^-+$/.test(cell));
}

describe('the checklist and the GDD name the same features', () => {
  it('covers every row of §4', () => {
    const claimed = new Set(RELEASE_CHECKLIST.map((entry) => entry.feature));
    for (const feature of featuresInGdd()) {
      expect(
        claimed.has(feature),
        `GDD §4 lists "${feature}" and the release checklist does not`,
      ).toBe(true);
    }
  });

  it('claims nothing §4 does not', () => {
    const inGdd = new Set(featuresInGdd());
    for (const entry of RELEASE_CHECKLIST) {
      expect(
        inGdd.has(entry.feature),
        `"${entry.feature}" is on the checklist but not in GDD §4`,
      ).toBe(true);
    }
  });

  it('found a real table rather than an empty match', () => {
    // The census is only worth having if it actually parsed something; a regex that quietly
    // matches nothing reports a clean sweep. Seventeen rows at 1.0.
    expect(featuresInGdd().length).toBeGreaterThanOrEqual(17);
  });
});

describe('every feature can show its work', () => {
  const exists = (path: string) => existsSync(join(process.cwd(), path));

  it.each(RELEASE_CHECKLIST.map((entry) => [entry.feature, entry] as const))(
    '%s — spec, engine, screen, tests all present',
    (_feature, entry) => {
      expect(exists(entry.spec), `missing spec: ${entry.spec}`).toBe(true);
      expect(entry.engine.length, 'a feature with no engine module').toBeGreaterThan(0);
      expect(entry.screens.length, 'a feature the player cannot reach').toBeGreaterThan(0);
      expect(entry.unit.length, 'a feature with no unit coverage').toBeGreaterThan(0);
      expect(entry.e2e.length, 'a feature no browser test opens').toBeGreaterThan(0);

      for (const path of [...entry.engine, ...entry.screens, ...entry.unit, ...entry.e2e]) {
        expect(exists(path), `${entry.feature} points at a file that is gone: ${path}`).toBe(true);
      }
    },
  );

  it('names an animated moment for each, in words somebody could go and look at', () => {
    /*
     * The hard rule is "no unanimated feature is done" (CLAUDE.md §3). Nothing can assert a
     * ceremony *looks* right, but a required sentence is a required decision — and a row that
     * says "it has transitions" is a row whose author had nothing to point at.
     */
    for (const entry of RELEASE_CHECKLIST) {
      expect(entry.ceremony.length, `${entry.feature} has no named ceremony`).toBeGreaterThan(24);
      expect(
        /transitions?\.?$|animated\.?$|polish/i.test(entry.ceremony),
        `${entry.feature}'s ceremony is a description of animation rather than an animation`,
      ).toBe(false);
    }
  });
});

describe('the four remaining §7 lines', () => {
  it('each name a harness that exists, or say plainly that none can', () => {
    for (const gate of RELEASE_GATES) {
      if (gate.harness === null) {
        expect(gate.note, `${gate.id} has no harness and no explanation`).toBeTruthy();
        continue;
      }
      expect(existsSync(join(process.cwd(), gate.harness)), `${gate.id}: ${gate.harness}`).toBe(
        true,
      );
      expect(gate.command.length).toBeGreaterThan(3);
    }
  });

  it('quote the release definition the GDD actually contains', () => {
    /*
     * The gate that would rot silently: §7 gets reworded, the checklist keeps quoting the old
     * promise, and `npm run release` reports on a definition nobody holds any more. Match on the
     * distinctive phrase of each line rather than the whole sentence, which is punctuation.
     */
    const release = /## 7\. Release definition([\s\S]*?)\n## /.exec(GDD)?.[1] ?? '';
    expect(release.length).toBeGreaterThan(100);
    for (const phrase of [
      'every feature in §4',
      'level 10 unaided',
      'saves survive version migration',
    ]) {
      expect(release, `GDD §7 no longer says "${phrase}"`).toContain(phrase);
    }
  });

  it('covers the performance line without pretending it was measured as fps', () => {
    // The one line a container cannot answer. It must be present, and it must say so.
    const perf = RELEASE_GATES.find((gate) => gate.id === 'performance');
    expect(perf).toBeDefined();
    expect(perf!.note, 'the fps caveat is the honest half of this gate').toMatch(/main-thread/i);
  });
});
