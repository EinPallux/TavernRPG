# 🍺 TavernRPG

**A cozy fantasy browser RPG that pretends to be an MMO.**

You are the newest regular at the Gilded Tankard tavern in the realm of **Aldenvale** — taking
timed tavern missions, climbing an arena ladder of 1,500 simulated heroes, joining living guilds,
delving key-gated dungeons, chasing class gear sets, and rolling the Fortune's Table gacha — all
single-player, all free, heavily inspired by *Shakes & Fidget* without copying it.

> **Status: 🍻 1.0 — Emberhollow is open.** All eighteen phases complete: fifteen rooms, five
> classes, three dungeons, sixty guilds and 1,500 simulated heroes, with 1,343 unit tests and 280
> end-to-end tests green. `npm run release` runs the release definition (GDD §7) line by line.
> Since 1.0: three save slots, a clickable **town map** you can navigate by instead of the menu,
> and tooltips the game draws itself. What comes next is the post-1.0 backlog in `ROADMAP.md`.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build, serve the build |
| `npm test` | Unit tests (engine, saves, store) — Vitest |
| `npm run test:e2e` | End-to-end tests — Playwright |
| `npm run lint` / `typecheck` / `format` | ESLint · `tsc --noEmit` · Prettier |
| `npm run verify` | The full gate: typecheck → lint → test → build |
| `npm run assets:sync` | Transcodes `game_assets/` into `public/assets/` (runs automatically before dev/build) |
| `npm run release` | The GDD §7 release definition, run line by line |
| `npm run balance` / `economy` / `pacing` | The combat harness, the 90-day economy sim, the §0 milestone ladder |
| `npm run tuning` | Every `[TUNE]` value with its post-tuning verdict |
| `npm run perf` | Lighthouse, bundle budget and main-thread cost (needs a server on :3100) |

Want background music? Drop an MP3 at `public/assets/audio/bgm.mp3` — the game picks it up and
gives it its own volume control. No file, no music, no errors.

## What makes it special

- **A living world:** 1,500 persistent simulated players with schedules, personalities, guilds
  and rivalries progress around the clock — the ladder moves while you sleep, and the Town Crier
  tells you who passed you.
- **Semi-idle done right:** minutes-long check-ins (missions, arena, forge) backed by a real AFK
  fallback (Patrol) — S&F pacing with modern presentation.
- **Fully F2P premium:** Golden Dice are earned, never sold. The gacha has visible odds, pity,
  and no wallet.
- **Every fight is a scene:** a deterministic combat engine emits battle logs replayed as
  animated duels — lunges, crits in slow-mo, verse banners, particle impacts.

## Documentation map

| Where | What |
|---|---|
| [`docs/README.md`](docs/README.md) | **Documentation index — start here** |
| [`docs/design/game-design-document.md`](docs/design/game-design-document.md) | Master GDD: vision, pillars, loops |
| [`docs/design/systems/`](docs/design/systems/) | 16 full system specifications |
| [`docs/design/balancing-formulas.md`](docs/design/balancing-formulas.md) | Every curve and number |
| [`docs/tech/`](docs/tech/) | Architecture, data models, UI/UX style guide, asset pipeline, deployment |
| [`ROADMAP.md`](ROADMAP.md) | 19 development phases with acceptance criteria |
| [`USER_QUESTIONS.md`](USER_QUESTIONS.md) | **Open decisions awaiting your answers** (defaults set) |
| [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) | Working rules for AI developers |
| [`CHANGELOG.md`](CHANGELOG.md) | Keep-a-Changelog history |

## Tech (planned — see `docs/tech/architecture.md`)

Next.js 15 · React 19 · TypeScript (strict) · Tailwind v4 · Zustand · Motion (Framer) ·
IndexedDB (local-first saves) · seeded deterministic RNG · Vitest + Playwright · deployed on
**Vercel**. Desktop-first (1080p/1440p), full-viewport, dark & warm, **no serif fonts, no
rounded-slop UI**.

## Assets

`game_assets/` holds the prepared art: 23 low-poly scene backgrounds (every town screen + 14
mission theaters), 5 class portraits, Kenney Fantasy UI + VFX particle packs (CC0). Item/monster
art arrives later — the art-override pipeline (`docs/tech/asset-pipeline.md`) is designed so each
piece drops in individually with zero code changes. UI icons come from
[game-icons.net](https://game-icons.net/) (CC BY 3.0, credited).
