#!/usr/bin/env node
/**
 * `npm run release` — the GDD §7 release definition, line by line, run rather than read.
 *
 * Five sentences decide whether 1.0 ships. Four of them have harnesses, and the fifth cannot have
 * one, so this prints all five with their real status and is honest about the difference. It runs
 * the harnesses; it does not restate their verdicts. A gate that cannot be checked here says so
 * in the output rather than being quietly dropped from the list — a release checklist that only
 * lists the checkable parts is how "60 fps" stops being a requirement without anybody deciding.
 *
 * Exit code 1 if any automated gate fails. The manual ones never fail the run; they print as
 * `you` and are listed again at the end so nobody signs off having read only the green.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const GREEN = '[32m';
const RED = '[31m';
const AMBER = '[33m';
const DIM = '[2m';
const OFF = '[0m';

/** `perf-pass.mjs` drives a real production server rather than a dev one. */
const PERF_PORT = 3100;

/** Is anything answering on the port the performance pass needs? */
async function serving() {
  try {
    const response = await fetch(`http://127.0.0.1:${PERF_PORT}/tavern`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Run a command, swallow its output, report whether it passed. */
function run(command, args) {
  try {
    execFileSync(command, args, { stdio: 'pipe', encoding: 'utf8' });
    return { ok: true };
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    // Vitest's summary line is the useful part; a hundred lines of stack is not.
    const summary =
      /Tests\s+.*failed.*$/m.exec(output)?.[0] ??
      /✘.*$/m.exec(output)?.[0] ??
      output.trim().split('\n').slice(-2).join(' ');
    return { ok: false, detail: summary.slice(0, 160) };
  }
}

const CHECKS = [
  {
    line: 'every feature in §4 is complete, with animation/feedback polish',
    how: 'census: the GDD table vs src/engine/release/checklist.ts, and every path it names',
    run: () => run('npx', ['vitest', 'run', 'src/engine/release/release.test.ts']),
  },
  {
    line: 'the tutorial carries a new player to level 10 unaided',
    how: 'every room by level 10 is introduced in-game; the tour is walkable; the sim reaches 10 in time',
    run: () => run('npx', ['vitest', 'run', 'src/engine/release/onboarding.test.ts']),
  },
  {
    line: 'a simulated 30-day player reaches ~level 55 with 1–2 set pieces',
    how: 'the §0 milestone table, ±20%',
    run: () => run('npx', ['vitest', 'run', 'src/engine/pacing/pacing.test.ts']),
  },
  {
    line: 'saves survive version migration',
    how: 'a captured fixture per shipped version, and the whole v1→current chain walked',
    run: () => run('npx', ['vitest', 'run', 'src/engine/save']),
  },
  {
    line: 'the game runs 60 fps on a mid-range laptop at 1080p',
    how: 'main-thread cost per frame + Lighthouse — see GDD §7. Frames on real hardware is yours.',
    run: async () => {
      if (!existsSync('.next/BUILD_ID')) {
        return { skipped: true, detail: 'no production build — run `npm run build` first' };
      }
      if (!(await serving())) {
        return {
          skipped: true,
          detail: `nothing serving on :${PERF_PORT} — run \`npx next start --port ${PERF_PORT}\` first`,
        };
      }
      return run('node', ['scripts/perf-pass.mjs']);
    },
    manual: 'Play a ×4 fight on the target laptop and watch it, once.',
  },
];

/** The parts of the definition no script can settle. */
const BY_HAND = [
  'Play the opening in a fresh browser profile: create a hero, take a contract, come home to the fight, reload mid-session.',
  'Watch a ×4 battle at 1080p on a mid-range laptop — the fps line, which no CI container can answer.',
  'Read the tour as a newcomer would: twelve beats, no docs open.',
];

console.log(`\n${DIM}GDD §7 — the release definition, run${OFF}\n`);

let failed = 0;
let skipped = 0;

for (const check of CHECKS) {
  const result = await check.run();
  const mark = result.skipped
    ? `${AMBER}skip${OFF}`
    : result.ok
      ? `${GREEN} ok ${OFF}`
      : `${RED}FAIL${OFF}`;
  console.log(`  ${mark} ${check.line}`);
  console.log(`       ${DIM}${check.how}${OFF}`);
  if (result.detail) console.log(`       ${result.skipped ? AMBER : RED}${result.detail}${OFF}`);
  if (result.skipped) skipped += 1;
  else if (!result.ok) failed += 1;
}

console.log(`\n${DIM}Still yours, and no harness replaces them:${OFF}`);
for (const item of BY_HAND) console.log(`  ${AMBER}·${OFF} ${item}`);

if (failed > 0) {
  console.log(`\n${RED}${failed} of ${CHECKS.length} release gates failed.${OFF}\n`);
  process.exitCode = 1;
} else if (skipped > 0) {
  console.log(`\n${AMBER}${skipped} gate(s) skipped — the rest passed.${OFF}\n`);
} else {
  console.log(`\n${GREEN}Every automated release gate passed.${OFF}\n`);
}
