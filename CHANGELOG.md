# Changelog

All notable changes to TavernRPG are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[SemVer](https://semver.org/) once code exists (0.x during development, 1.0.0 at release —
see `ROADMAP.md` phase gates).

## [Unreleased]

### Added — Phase 1: Design System & App Shell
- **Design system:** colour/type/chamfer tokens, timber and parchment surface treatments, etched
  edges with brass brackets, the facet accent motif, and a named motion system (snappy / standard
  / dramatic springs) so timings are picked from one vocabulary rather than per component.
- **Component kit:** `TavernPanel`, `ActionButton` (with visible costs and self-explaining disabled
  states), `Meter`, `TimerChip`, `KeeperBark`, `Modal`, `ToastStack`, `AmbientStage`.
- **Icons:** a hand-drawn 20-glyph family for navigation, currencies and status, declared as a
  vocabulary in the data layer and implemented in components so a missing glyph fails the build.
  The Vigor tankard fills with ale instead of being a static glyph.
- **App shell:** grouped nav rail (collapsible, persisted, locked places shown with their unlock
  level), top HUD (portrait + level ring, XP meter, wallet, Vigor, activity timers), and
  direction-aware place transitions driven by rail order.
- **The town:** all 15 places routed and dressed — each with its backdrop, tint, ambient recipe
  and a keeper explaining what phase builds it.
- **Feature gates** in the engine as one source of truth for the rail, router and future task pool.
- **`/dev/kit` harness** showing every component state and driving the shell through hero levels,
  wallets and timers the game cannot produce yet.
- **Save schema v2** adds player settings (nav, motion, audio) with a real v1→v2 migration and a
  captured Phase 0 save fixture that must keep loading forever.

### Changed
- Preferences now write through immediately instead of waiting out the autosave debounce — a
  collapsed rail survived a reload only by luck before.
- The Phase 0 walking-skeleton screen is removed; `/` now redirects to the tavern.

### Added — Phase 0: Foundation & Walking Skeleton
- **Project scaffold:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict +
  Tailwind v4 + Zustand + Motion, with ESLint/Prettier, Vitest, Playwright and GitHub Actions CI.
- **Determinism primitives:** `src/engine/rng.ts` (seeded sfc32 streams — forkable by name,
  snapshot/restore, weighted picks and shuffles) and `src/engine/clock.ts` (GameClock: the only
  wall-time reader, clamps backwards clock jumps, day-key based reset boundaries).
- **Save system:** versioned Zod save envelope, migration chain with an injectable-chain test
  harness, IndexedDB persistence with backup fallback and corrupted-save recovery, plus
  export/import; autosave debounce with flush on page hide.
- **Walking-skeleton screen** ("the tavern door") proving the mutate → persist → reload →
  rehydrate path and visible seeded-RNG replay, on the real backdrop with the chosen fonts,
  colour tokens and the chamfer system.
- **Guardrails that fail the build:** `Math.random`/`Date.now`/`new Date()` are lint-banned outside
  the two sanctioned modules, and `src/engine`/`src/data` may not import React, Next, Zustand or idb.
- **Asset pipeline stub** (`npm run assets:sync`) serving the 503 prepared art files, including the
  drop-in `public/assets/audio/bgm.mp3` slot; `CREDITS.md` seeded with attribution obligations.
- Tests: 68 unit + 5 end-to-end, all green; `npm run verify` runs the full gate.

### Added — Planning phase
- **Complete planning package (pre–Phase 0):**
  - Master Game Design Document, balancing/formulas doc, content plan (`docs/design/`)
  - 16 system specifications covering every v1.0 feature (`docs/design/systems/`)
  - Technical architecture, data models, UI/UX style guide, asset pipeline (`docs/tech/`)
  - Shakes & Fidget systems research reference (`docs/research/`)
  - 19-phase development roadmap with acceptance criteria (`ROADMAP.md`)
  - Open decisions list with working defaults (`USER_QUESTIONS.md`)
  - AI-developer working rules (`CLAUDE.md`, `AGENTS.md`), documentation index (`docs/README.md`)

### Changed
- **Planning review complete (2026-07-29):** all 20 `USER_QUESTIONS.md` decisions answered by
  the user and folded into the specs. Deviations from proposed defaults: mount rentals shortened
  to **7-day terms** (prices re-pinned: 20/55/130 × goldPerVigor, Royal Griffin 6 dice/7 days);
  audio scope now includes a **user-supplied `bgm.mp3` drop-in** background-music system next to
  the light SFX pass; hero gender/appearance variants confirmed post-1.0 (backlog).

### Notes
- No game code yet by design — design is locked, Phase 0 (scaffolding) is next.
- Prior repository state: prepared art in `game_assets/` (backgrounds, class portraits,
  Kenney UI/VFX packs).
