/**
 * The Phase 17 tuning pass, as one report (ROADMAP Phase 17).
 *
 * Every `[TUNE]` in the build has to be either *changed* or *defended* before 1.0, and defending
 * one means having looked at what it currently does rather than at what it was set to. This walks
 * the source for the markers, then runs the three harnesses at the horizons the phase asks for —
 * a 90-day economy rather than the 30-day CI band, the full pacing ladder, and the class table —
 * and prints them side by side.
 *
 *   npm run tuning
 *
 * Read-only: it changes nothing and asserts nothing. The assertions live in the harness tests;
 * this is the thing you look at before deciding what to move.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  ACTIVE_PLAYER,
  CASUAL_PLAYER,
  FRUGAL_PLAYER,
  MODELLED_FAUCETS,
  MODELLED_SINKS,
  simulateEconomy,
  totalEarned,
  totalSpent,
  type PlayStyle,
  type SimResult,
} from '../src/engine/economy/simulate';
import {
  MILESTONES,
  MILESTONE_KIND,
  TARGET_DAYS,
  TARGET_EARLIEST,
  drift,
  earlyBy,
  simulatePacing,
  windowDrift,
  withinBand,
} from '../src/engine/pacing/pacing';
import { CLASSES } from '../src/data/classes';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

/* ── The inventory ───────────────────────────────────────────────────────────── */

interface Marker {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      out.push(path);
    }
  }
  return out;
}

function markers(): Marker[] {
  const found: Marker[] = [];
  for (const path of walk(SRC)) {
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((text, index) => {
      if (text.includes('[TUNE]')) {
        found.push({ file: relative(ROOT, path), line: index + 1, text: text.trim() });
      }
    });
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/* ── Reporting ───────────────────────────────────────────────────────────────── */

const pct = (part: number, whole: number) =>
  whole === 0 ? '—' : `${((part / whole) * 100).toFixed(1)}%`;
const round = (value: number) => Math.round(value).toLocaleString();

function economyRow(label: string, style: PlayStyle, days: number): void {
  const run: SimResult = simulateEconomy({ days, style });
  const earned = totalEarned(run.ledger);
  const spent = totalSpent(run.ledger);
  const faucets = MODELLED_FAUCETS.map(
    (key) =>
      `${key} ${pct(
        run.ledger.reduce((sum, day) => sum + day.earned[key], 0),
        earned,
      )}`,
  ).join('  ');
  const sinks = MODELLED_SINKS.map(
    (key) =>
      `${key} ${pct(
        run.ledger.reduce((sum, day) => sum + day.spent[key], 0),
        spent,
      )}`,
  ).join('  ');

  console.log(`\n  ${label} — ${days} days`);
  console.log(
    `    level ${run.finalLevel}   purse ${round(run.finalPurse)}   points ${run.totalPointsBought}   pet L${run.finalPetLevel}`,
  );
  console.log(`    earned ${round(earned)}  ·  ${faucets}`);
  console.log(`    spent  ${round(spent)}  ·  ${sinks}`);
  console.log(
    `    unspent Vigor/day ${(run.ledger.reduce((sum, day) => sum + day.vigorUnspent, 0) / days).toFixed(1)}`,
  );
}

function main(): void {
  const inventory = markers();
  const byFile = new Map<string, number>();
  for (const marker of inventory) byFile.set(marker.file, (byFile.get(marker.file) ?? 0) + 1);

  console.log('═══ [TUNE] inventory ═══');
  console.log(`  ${inventory.length} markers across ${byFile.size} files`);
  for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`    ${String(count).padStart(2)}  ${file}`);
  }

  console.log('\n═══ economy — 90 days, three styles ═══');
  for (const [label, style] of [
    ['active', ACTIVE_PLAYER],
    ['casual', CASUAL_PLAYER],
    ['frugal', FRUGAL_PLAYER],
  ] as const) {
    economyRow(label, style, 90);
  }

  console.log('\n═══ pacing — §0 milestones ═══');
  const pacing = simulatePacing();
  for (const milestone of MILESTONES) {
    const day = pacing.reached[milestone];
    const earliest = TARGET_EARLIEST[milestone];
    const latest = TARGET_DAYS[milestone];
    /*
     * Two numbers, because §0 states half its rows as ranges and they mean different things.
     * `drift` is distance from the *promise* — the fact worth reporting either way. `windowDrift`
     * is distance from the **window**, which is what the band actually judges, and is zero for a
     * row that landed inside it. Printing only the first read "−28.5%" for level 25 on a game
     * delivering it four days into the week §0 promised.
     */
    const off = drift(pacing, milestone);
    const outside = windowDrift(pacing, milestone);
    const early = earlyBy(pacing, milestone);
    const note = day === null ? ' ✖ never' : withinBand(pacing, milestone) ? '' : ' ⚠ outside band';
    const ahead = early === null ? '' : `  (${early.toFixed(1)}d early)`;
    const window = earliest === latest ? `${latest}` : `${earliest}–${latest}`;
    console.log(
      `    ${milestone.padEnd(16)} ${MILESTONE_KIND[milestone].padEnd(8)}` +
        ` day ${day === null ? '  —  ' : day.toFixed(1).padStart(5)}` +
        `  §0 ${window.padStart(6)}` +
        `  drift ${off === null ? '   —  ' : `${(off * 100).toFixed(1).padStart(6)}%`}` +
        `  outside ${outside === null ? '   —  ' : `${(outside * 100).toFixed(1).padStart(6)}%`}` +
        `${note}${ahead}`,
    );
  }

  console.log('\n═══ classes ═══');
  console.log(`    ${CLASSES.length} classes: ${CLASSES.map((entry) => entry.name).join(', ')}`);
  console.log('    win-rate bands are asserted by `npm run balance`; this is the roster check.');

  console.log('\nDone. Nothing was changed — see balancing-formulas.md §16 for the recorded pass.');
}

main();
