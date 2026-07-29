# Changelog

All notable changes to TavernRPG are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[SemVer](https://semver.org/) once code exists (0.x during development, 1.0.0 at release —
see `ROADMAP.md` phase gates).

## [Unreleased]

### Added — Phase 3: Combat Engine
- **`fight()`** — the whole of combat as one pure, seeded function emitting a serializable battle
  log. Every fight in the game will run through it, so balance lives in exactly one place.
- **All five class kits implemented**: Shield Wall, Verses (with its three-song state machine),
  Arcane Certainty, Windstep and Flurry — plus the Swashbuckler's Parry.
- **Five monster archetypes** (bruiser, skirmisher, caster, tank, swarm) generated from level
  rather than hand-authored, so 126 monsters stay maintainable and can never drift off-curve.
- **Balance harness**: thousands of seeded fights per matchup, with CI asserting three bands —
  mirrors 45–55%, per-class average 45–55%, and any single matchup 30–70%.
- **Golden battle logs** freeze the engine's exact output; a diff means every committed seed in
  every save now resolves differently.
- **`/dev/combat`** viewer shows every roll of a seeded fight, and the win rate over 600 more.

### Changed — the Phase 3 rebalance
- Measuring the classes as originally specified showed they were badly unbalanced: Warrior beat
  Bard and Mage 100% of the time, Mage lost to Hunter 0%. Two causes, both fixed:
  **classes now have a weapon-damage factor** (a Warrior's one-hander hits softly, a Mage's staff
  hits like a falling tree — this is what pays for the survivability spread), and **the HP/armour
  spread was narrowed** from ×2.5–5.0 / 10–50% to ×3.4–4.2 / 15–35%, which also brought mirror
  fights from a 2-to-34-round range into 4–16.
- **Arcane Certainty softened** from "cannot be blocked or dodged" to "defences work at 62%". The
  absolute version measured as a 97% hard counter to the Hunter; an arena where your class simply
  loses is miserable.
- Hunter dodge 45%→40%; Swashbuckler gained a 15% Parry (it previously had no defence at all).
- Class specs, the balancing doc and the affected set bonuses were updated to match.

### Added — Phase 2: Hero Creation & Character Screen
- **The five classes as data** (`src/data/classes.ts`): main stat, HP factor, armour cap and one
  signature proc each, declared now and implemented by the combat engine in Phase 3. Creation
  cards lead with how a class *feels* rather than with a stat table.
- **Hero creation**: class pick → name (with validation that explains itself, and suggestions so
  the blank field is never a wall). No hero means the game opens here instead of in the town.
- **Character screen**: paperdoll with all 10 slots, attribute training with visible prices and a
  Max button that spends what it can, a derived-stat panel with hover breakdowns showing where
  every number comes from, and a backpack with an overflow satchel.
- **Item generation** (`generateItem`): one choke point for all gear — budgets, damage bands,
  armour, procedural naming, value and scrap yield. Class restriction is enforced *at generation*,
  so a wrong-class drop cannot exist rather than being filtered later.
- **25 item icons** drawn in the existing line family, taking the vocabulary to 45 glyphs.
- **Progression maths**: XP curve with multi-level rollover, and the rising per-point attribute
  cost that is the game's endless gold sink.
- **Save schema v3**: the hero replaces the retired walking-skeleton payload, with a v2→v3
  migration and a captured Phase 1 save proving settings survive the upgrade.
- **Dev drawer** on the character screen conjures gear, levels and gold so the screen is
  reviewable before loot sources exist; `grantXp` is the same call missions will use in Phase 5.

### Changed
- Hero mutations now write through immediately instead of waiting out a 5-second debounce, with a
  write-sequence guard so an older in-flight save can never land after a newer one and resurrect
  stale state.
- The HUD and nav-rail gates read the real hero (level, gold, portrait) instead of preview values.
- Corrected the XP and stat-cost example values in `balancing-formulas.md` — the quoted figures
  were miscalculated approximations. The curves are unchanged; the tests now assert the exact
  values so doc and code cannot drift again.

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
