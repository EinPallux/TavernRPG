# Changelog

All notable changes to TavernRPG are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[SemVer](https://semver.org/) once code exists (0.x during development, 1.0.0 at release —
see `ROADMAP.md` phase gates).

## [Unreleased]

### Added
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
