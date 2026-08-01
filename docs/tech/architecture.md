# Technical Architecture

> Stack, project structure, state/persistence, time & determinism, performance and quality
> gates. Companion: `data-models.md` (types), `ui-ux-style-guide.md` (presentation),
> `asset-pipeline.md` (assets), `deployment.md` (what Vercel actually serves).

## 1. Stack (chosen, with rationale)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16 (App Router, Turbopack) + React 19 + TypeScript (strict)** | First-class Vercel target, modern defaults, file-routing for the town's screens; game is client-rendered (`"use client"` shell) with static delivery — no server runtime needed at 1.0 |
| Styling | **Tailwind CSS v4** + CSS custom-property design tokens | Token-driven theming (rarity colors, chamfer system) without fighting a component library; zero runtime CSS cost |
| State | **Zustand** (slice pattern) + **Immer** | Minimal boilerplate for a large mutable game state; selector-based re-render control for 60fps HUD |
| Persistence | **IndexedDB** via `idb` + **Zod v4** schemas | Structured saves > localStorage limits; Zod validates on load and powers versioned migrations; export/import as compressed JSON file |
| Animation | **Motion (Framer Motion) 12** + CSS keyframes + canvas particle layer | Choreographed UI/battle animation with springs; Kenney particle sprites composited on a single overlay canvas for impacts |
| RNG | Custom **sfc32/splitmix** seeded PRNG lib (`src/engine/rng.ts`) | Determinism everywhere; named streams; ~30 LOC, no dependency risk |
| Testing | **Vitest** (+ RTL) unit/sim; **Playwright** e2e (Chromium preinstalled) | Engine golden-logs & balance harness in CI; e2e over the tutorial + core loop |
| Quality | ESLint 9 (flat) + Prettier + `tsc --noEmit` + GitHub Actions CI | Standard, boring, effective |
| Deploy | **Vercel** (static-first output) | Requirement; zero-config previews per PR |

Explicitly rejected: PixiJS/canvas UI (DOM+Motion suffices for S&F-style scenes and keeps
accessibility/dev-speed), Redux (ceremony), server DB/auth at 1.0 (Q1 — local-first).

### As-built notes (Phase 0, 2026-07-29)

What the install actually resolved to, and the three places reality differed from the plan:

- **Next.js 16.2.12 / React 19.2 / TypeScript 6.0 / Tailwind 4.3 / Vitest 4.1 / Zod 4.4.**
  Next 16 was current at scaffold time; the App Router, static export and Turbopack build all
  behave as planned. Next 16 removed the `eslint` key from `next.config.ts` — linting is its own
  CI step, which it already was.
- **ESLint pinned to 9.x, not 10.** `eslint-config-next@16` still bundles an `eslint-plugin-react`
  that calls APIs removed in ESLint 10 (`context.getFilename`), so `eslint .` crashes on 10.x.
  Pinned to `eslint@^9` (9.39) until the Next config catches up; revisit when
  `eslint-config-next` declares ESLint 10 support. The config itself is flat-config native —
  `eslint-config-next/core-web-vitals` and `/typescript` export `Linter.Config[]` directly, so
  no `FlatCompat` shim is needed.
- **Vitest 4 removed `environmentMatchGlobs`.** The default environment is `node` (which is what
  enforces engine purity — an engine module that touches the DOM fails its own test); UI tests opt
  into jsdom with a `// @vitest-environment jsdom` docblock at the top of the file.
- **Transitive advisories pinned up.** `postcss` and `sharp` arrive inside Next's own dependency
  tree at versions with published advisories; `overrides` in `package.json` pull them to patched
  releases (npm's suggested "fix" was a downgrade to Next 9, which is not a fix).
- **Playwright browsers.** CI installs Chromium normally; sandboxes that ship their own browser can
  point at it with `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

## 2. Repository layout (target)

```
src/
  app/                    # Next.js routes: one route per town place + layout shell
                          # `/` redirects to `/map` — outside is a place, not an absence
  engine/                 # PURE game logic — no React, no DOM, no Date.now/Math.random
    combat/               # fight(), procs, battle log types, choreo-independent
    economy/              # gold/dice/materials mutations, prices, resets
    items/                # generateItem, budgets, sets, scrapping yields
    progression/          # xp/levels/stat costs
    sim/                  # world generation, bot progression, ticks, ladder, rivals, feed
    save/                 # save schema (Zod) + migration chain — pure, no storage
    rng.ts                # seeded streams: fork(name) → deterministic sub-streams
    clock.ts              # GameClock — sole reader of wall time
  state/                  # Zustand slices (hero, world, ui, settings) + persistence glue
  data/                   # ALL content: classes, zones, monsters, sets, pets, banners,
                          # tasks, tutorial beats, strings/, icon manifest (typed const modules)
  components/             # UI kit (TavernPanel, ItemCard, StatRow…) + screens' components
  features/               # screen-level composition per place (tavern/, arena/, forge/…)
  styles/                 # tokens.css, tailwind config, fonts
public/assets/            # icons/ (game-icons vendored), art/ (overrides), ui/ (Kenney), bg/
docs/                     # this documentation
```

**The golden rule:** `engine/` and `data/` are importable in Node (tests/sim) with zero DOM.
React components never compute game math; they call engine functions and render results.
This is enforced, not merely asked for: an ESLint `no-restricted-imports` block fails the build if
anything under `src/engine` or `src/data` imports React, Next, Zustand or `idb`.

Built so far (Phase 0): `engine/rng.ts`, `engine/clock.ts`, `engine/save/{schema,migrations}.ts`,
`state/{persistence,gameStore}.ts`, and the throwaway `components/skeleton/TavernDoor.tsx`
walking-skeleton screen that Phase 1 replaces with the real app shell.

## 3. State & persistence

- **Slices:** `hero`, `world` (sim), `activity` (mission/patrol/cooldowns), `meta`
  (settings/tutorial/statistics), `ui` (ephemeral, never persisted).
- **Save model:** 3 slots (Q2) + autosave: debounced 5s after mutations + on `visibilitychange`/
  `pagehide`. Save = `{schemaVersion, savedAt, worldSeed, slices…}` (~bots stored as divergence
  records, world-sim §7 — target < 1 MB/slot; measured 145 KB with the world, 99 B/bot).
- **The autosave is serialised and coalescing** (as built, Phase 8). Only one write runs at a
  time; callers arriving mid-write set a dirty flag and the drain loop re-reads current state.
  The earlier design fired writes in parallel with a sequence guard, which stopped a stale write
  clobbering the *store* but not the *disk* — once the world took the save to 145 KB an older
  `put` regularly landed last, and a hero levelled to 10 reloaded as 5. A burst of twenty
  mutations now costs two writes, and the second is always the newest state.
- **Expensive load work happens after first paint.** World reconciliation (~300 ms) runs in a
  deferred task rather than before `status: 'ready'`, so the hero and the HUD are never waiting
  on a simulation they do not read.
- **Migrations:** `migrations/vN.ts` chain, pure functions with Vitest fixtures per version;
  loading any historical save from 1.0-beta onward must succeed (CI keeps fixture saves).
  Shipped so far: **v1** walking skeleton · **v2** settings · **v3** hero · **v4** battle playback
  preferences · **v5** activity (Vigor, mission) · **v6** patrol shift · **v7** shop shelves and
  the mount stall · **v8** the simulated world · **v9** the arena · **v10** the guild ·
  **v11** dungeons · **v12** materials and the forge · **v13** the gacha · **v14** pets ·
  **v15** tasks and the calendar · **v16** the tutorial · **v17** the Long Road ·
  **v18** the day's-work track (`activity.vigorSpentToday`). Every one ships a
  captured fixture of the *previous* version, and a fixture is captured in the least convenient
  state the version can be in rather than at rest — v5's carries a mission mid-timer, because a
  migration that only handles the idle save is a migration that has not been tested, and v17's was
  captured mid-road: seven stages cleared, the eighth lost at 85% of the monster's health.
  `fixtures.test.ts` is a **census**, not a list: it asserts one fixture per shipped version with
  no gaps, because a fixture you failed to add cannot fail a test.
- **Export/import:** deflate-compressed base64 `.tavernsave` file; import validates via Zod and
  reports version/corruption in human language. Tampering is the player's right (Q15) — import
  never crashes, worst case rejects politely.
- **Multi-tab guard:** BroadcastChannel leader election; secondary tabs get a friendly takeover screen.
- **Three slots, reachable** (as built, post-1.0). The slot argument has threaded through
  `readSave`/`writeSave`/`deleteSave` since Phase 0 and `listSlots` was written as slot-picker
  data — but the shell called `hydrate(1)` on every load, so two thirds of the save system was
  unreachable for eighteen phases. Settings → **Characters** is the room that plumbing was for:
  each slot names its hero, class, level and when they were last played, and switching flushes
  the outgoing save before it opens the next.
  - **Which slot is active is a property of the browser, not of a save.** It lives in one
    `active-slot` key beside the three saves — never a field inside them, because three saves each
    carrying "am I the active one?" is three places to disagree. Read before the first `hydrate`,
    so closing the tab on your second hero returns you to your second hero. Anything unreadable
    falls back to slot 1: a bad value here must never keep a player out of their game.
  - **A slot is a character, not a file.** Opening an empty slot writes an envelope before anybody
    is made, so `occupied` (there are bytes) and `hero` (there is somebody) are different
    questions and the picker asks the second.
- **Nothing renders over an unloaded save** (as built, Phase 18). The shell used to draw the town
  the instant it mounted, over a store still at `status: 'idle'`; the window was a couple of
  milliseconds while `hydrate()` was the first thing a page load did, and nobody ever saw it. The
  tab-lock election put 350 ms in front of the load and turned that into a dependable bug —
  Settings offered "Export this save" against `save === null` and produced a file named
  `tavernrpg-hero-slot1.json` holding the *previous* session. **A guard that delays a load has to
  gate the render too.** `AppShell` paints nothing while electing or loading, and
  `e2e/resilience.spec.ts` samples every frame for "a room exists and the store is not ready".
  Priced at a point or two of Lighthouse (98 → 97, LCP 1.1s → 1.2s) and paid without hesitating.

## 4. Time, offline progress & determinism

- **GameClock** is the only module reading wall time; everything else receives timestamps.
  Backwards clock jumps clamp (timers never negative, nothing re-awards); forward jumps process
  normally (missions/patrol complete, resets fire in order via the Reset Engine, sim reconciles).
- **On load sequence:** validate save → migrations → Reset Engine processes missed day boundaries
  → world-sim reconciliation (≤1s budget) → overnight summary card data → interactive.
- **RNG streams:** `rng.fork("combat:"+seed)`, `"shop:"+dayKey`, `"sim:"+hourBucket`,
  `"gacha:"+rollIndex`… Committed seeds (stored at accept-time) make refresh-scumming inert.
  ESLint rule bans `Math.random`/`Date.now` outside `clock.ts`/`rng.ts`.

## 5. Performance budgets (CI-enforced where feasible)

60fps during battle scenes on a 2019 mid-range laptop · initial JS < 350 KB gz (art lazy-loads
per screen) · save write < 20ms · load-to-interactive < 2.5s warm · sim reconciliation ≤1s/14 days
· Hall of Fame list virtualized (1,501 rows) · particle canvas capped 200 sprites with pooling.

## 6. Quality gates & CI

PR pipeline: typecheck → lint → unit (engine goldens, migration fixtures, Zod content tests,
balance harness incl. economy 90-day sim) → build → Playwright smoke (create hero → tutorial beats
1–5 → save/reload integrity). `main` deploys preview; tagged releases deploy production. Zero
`any`, zero ESLint disables without linked issue. Feature flags via `meta.flags` for
staged rollout of phases into a playable main branch at all times.

**As built (Phase 18):** the e2e suite runs against `npm run build && npx next start`, not the dev
server, which is what makes the production-only Content-Security-Policy a tested thing rather than
a declared one — `e2e/headers.spec.ts` plays five rooms and a full battle with a
`securitypolicyviolation` listener attached and fails on one report. It also reads the build's own
route manifests and fails if the deploy stops being fully static. See `deployment.md`.

## 7. Error handling & resilience

Global error boundary with tavern-flavored recovery screen (state intact, "return to the taproom")
· save writes are transactional (write-then-swap key) with last-good fallback · corrupted-save
triage: offer export of raw data before reset · all user-facing errors have human copy (no codes).
