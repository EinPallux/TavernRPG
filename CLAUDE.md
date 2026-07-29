# CLAUDE.md — Working rules for Claude Code on TavernRPG

TavernRPG is a **fully-fledged** single-player fantasy browser RPG (S&F-inspired, simulated-MMO,
semi-idle) — not a prototype. Quality bar: every shipped slice is complete with animation,
feedback, edge cases and tests. Deployed on Vercel.

## Current state

**Design locked; Phases 0–3 complete.** All 20 questions in `USER_QUESTIONS.md` were answered on
2026-07-29 and the specs reflect the answers.

- **Phase 0:** scaffold, seeded RNG, GameClock, save system (Zod + migrations + IndexedDB).
- **Phase 1:** design tokens + motion system, the component kit (`src/components/ui/`), the
  hand-drawn icon family, the app shell (nav rail + HUD + place transitions), all 15 places
  routed as dressed placeholders, feature gates, `/dev/kit`, and save schema v2 (settings).

- **Phase 2:** the five classes as data, hero creation, the character screen (paperdoll,
  attribute training, derived stats, backpack), `generateItem`, and save schema v3 (hero).

- **Phase 3:** the combat engine — pure `fight()`, all five class procs, monster archetypes,
  golden logs and the balance harness (plus the rebalance it forced).

212 unit tests + 27 e2e green. Next work: `ROADMAP.md` **Phase 4 (Battle Scene)** — turning the
battle log into the animated showpiece. The log format is final and fuzz-safe; nothing in
`src/engine/combat/` should need to change to render it.

**Before touching class constants:** run `npm run balance`. The numbers in `src/data/classes.ts`
were solved for, not chosen, and the bands in `src/engine/combat/balance.test.ts` will catch a
regression — but the harness tells you *why*.

## Where things live (as built)

`src/engine/` pure logic — `rng`, `clock`, `save/` (schema + migrations), `progression/`
(xp, stats, gates), `items/` (types, generate), `hero/` (actions, derived) ·
`src/data/` content — places, classes, itemBases, icon vocabulary ·
`src/state/` stores + persistence + the shared clock ·
`src/components/{ui,shell,icons,items,hero}/` · `src/app/(game)/<place>/` one route per place ·
`src/styles/motion.ts` springs.
Run `/dev/kit` for every component state; the character screen's dev drawer conjures gear,
levels and gold while loot sources are still being built.

## Read before working (in order)

1. `docs/design/game-design-document.md` — what we're building (canon: names, tone, pillars)
2. The system spec you're touching — `docs/design/systems/<feature>.md`
3. `docs/design/balancing-formulas.md` — ALL numbers live here (`[TUNE]` markers)
4. `docs/tech/architecture.md` + `docs/tech/data-models.md` — structure & types
5. `docs/tech/ui-ux-style-guide.md` — binding visual/motion/UX rules
6. `ROADMAP.md` — current phase scope & acceptance criteria

## Hard rules (from the user — never violate)

1. **No serif fonts.** Display = Alegreya Sans SC, body = Inter (approved, Q14).
2. **No rounded AI-slop UI.** Chamfered corners (clip-path tokens); `border-radius` > 4px is banned
   (see style guide §3).
3. **Highly animated.** Anything that changes state moves (style guide §7); battles are full
   choreographed scenes (`combat.md` §4). No unanimated feature is "done".
4. **Desktop-first, full-viewport** (1080p/1440p optimized; functional at 1366×768).
5. **Art-swap ready.** Every item/monster/pet resolves art via the override manifest
   (`asset-pipeline.md` §3) — never hardcode entity images. Icons: game-icons.net (vendored,
   attributed). AI bot players use class portraits only.
6. **F2P forever.** Golden Dice are never purchasable; no dark patterns; odds always visible.
7. **Don't lean on Kenney UI for everything** — panels/frames follow our token system; Kenney
   supplies textures/particles selectively.

## Engineering rules

- **Purity split:** `src/engine/` + `src/data/` never import React/DOM and must run in Node.
  Components render; engine computes. No game math in components.
- **Determinism:** all randomness via `rng.ts` streams with committed seeds; wall time only via
  `clock.ts` (GameClock). `Math.random`/`Date.now` are lint-banned outside those modules.
- **Content is data:** new monsters/items/sets/tasks/barks = typed modules in `src/data/` with
  Zod schema tests. Never instantiate content ad hoc in components.
- **Numbers are config:** tunables live in config/data modules mirroring
  `balancing-formulas.md` — when tuning, update the doc in the same PR.
- **Saves are sacred:** any persisted-shape change ships a migration + fixture test
  (`architecture.md` §3). Breaking saves breaks players.
- **TS strict, zero `any`**, no ESLint disables without a linked issue comment.
- **Tests:** engine changes need unit/golden coverage; balance-affecting changes must keep the
  simulation harness green (mirror win-rates, economy bands, pacing sim).
- Docs update **in the same PR** as behavior changes. New open product questions → append to
  `USER_QUESTIONS.md` (dated) with a working default; don't silently decide big things.

## Conventions

- Branches: `phase-<n>/<slug>` · PR titles: `[P<n>] <what>` · CHANGELOG entry per phase completion
  (Keep-a-Changelog).
- Phase "done" = acceptance criteria in `ROADMAP.md` demonstrated + tests green + docs updated +
  deployed preview plays clean.
- Commands (after Phase 0 lands): `npm run dev` / `build` / `test` / `test:e2e` / `lint` /
  `assets:manifest` — keep this list current as scripts appear.

## Canon quick-reference (avoid re-deciding)

Realm **Aldenvale**, town **Emberhollow**, tavern **the Gilded Tankard**. Classes: Warrior, Bard,
Mage, Hunter, Swashbuckler. Currencies: Gold, **Golden Dice** (premium, earn-only), Honor,
materials (Scrap/Essence/Starmetal), dungeon keys, Vigor (100/day). Places: Tavern, Character,
Notice Board, Patrol, Armory, Gilded Facet, Emberforge, Stables, Menagerie, Proving Grounds,
Hall of Fame, Guild Hall, Undertavern, Fortune's Table. Keepers: Marla (tavern), Bram (armory),
Sela (jeweler), Torvald (forge), Odo (stables), Hildy (guard/arena), Madame Vesna (gacha).
World: 1,500 simulated heroes, 60 guilds, top-10 named legends, 2–3 active rivals.
