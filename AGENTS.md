# AGENTS.md — Instructions for AI coding agents

> Canonical, tool-agnostic working rules for any AI agent in this repository.
> `CLAUDE.md` carries the same rules with Claude-Code-specific detail — **the two files must stay
> in sync; edit both or neither.**

## Project

TavernRPG: a fully-fledged single-player fantasy browser RPG (Shakes-&-Fidget-inspired,
simulated-MMO, semi-idle), Next.js/TypeScript, deployed on Vercel. Currently **planning-complete
and user-reviewed, pre-code** — all `USER_QUESTIONS.md` answers are in (2026-07-29); Phase 0 of
`ROADMAP.md` is the next milestone.

## Before any task

1. Read the relevant spec: `docs/design/systems/<feature>.md` (mechanics),
   `docs/design/balancing-formulas.md` (numbers), `docs/tech/*` (architecture, types, UI rules).
2. Check `ROADMAP.md` for the current phase — do not pull future-phase scope forward.
3. Check `USER_QUESTIONS.md` — unanswered questions have recorded defaults; follow them.

## Non-negotiable product rules

- No serif fonts · no rounded-corner-slop UI (chamfer system, radius ≤ 4px) · highly animated
  (unanimated features are incomplete) · desktop-first full-viewport · premium currency is never
  purchasable · entity art must route through the art-override manifest (individually swappable
  later) · simulated players use class portraits only.

## Non-negotiable engineering rules

- `src/engine/` and `src/data/` stay React/DOM-free (pure, Node-runnable).
- All randomness through seeded RNG streams; all wall-clock reads through GameClock.
- Content and tunables are typed data modules, never inline literals in components.
- Persisted-shape changes require a migration + fixture test.
- TypeScript strict, no `any`; tests accompany engine/balance changes; docs update in the same PR.
- Product ambiguities: append a dated question with a proposed default to `USER_QUESTIONS.md`;
  implement the default; never silently make major product decisions.

## Definition of done (any phase/slice)

Acceptance criteria from `ROADMAP.md` demonstrated · tests green (unit, golden-log, balance
harness, e2e as applicable) · style-guide compliant · CHANGELOG + docs updated · deployed
preview verified.
