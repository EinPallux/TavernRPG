# TavernRPG Documentation Index

**Start here.** Reading order for newcomers: GDD → a couple of system specs → architecture →
ROADMAP (root).

## Design
- [`design/game-design-document.md`](design/game-design-document.md) — **the master GDD:** vision, pillars, loops, feature summary, canon
- [`design/balancing-formulas.md`](design/balancing-formulas.md) — every curve & number (single source; `[TUNE]` markers)
- [`design/content-plan.md`](design/content-plan.md) — content volumes, naming, zones/monsters/text counts

### System specifications (`design/systems/`)
| Spec | Covers |
|---|---|
| `characters-and-classes.md` | 5 classes, attributes, training, paperdoll/backpack |
| `combat.md` | engine contract, resolution rules, battle log, battle scene, test harness |
| `tavern-and-patrol.md` | Vigor, mission board, timers, patrol shifts |
| `items-and-gear.md` | slots, rarities, procedural generation, restriction rules |
| `gear-sets.md` | the 10 launch sets with bonuses, sources, collections UI |
| `shops-and-stables.md` | Armory, Gilded Facet, selling, 4 mounts |
| `crafting-and-scrapping.md` | Emberforge: materials, RNG crafting, set recipes |
| `gacha-fortunes-table.md` | banners, rates, pity, dupes, roll ceremony |
| `pets.md` | the 12 pets, feeding, rarity tiers |
| `arena-and-hall-of-fame.md` | duels, ladder swaps, honor, HoF tabs, revenge |
| `guilds.md` | join/found, Treasury/Drillmaster, chat, weekly bounty |
| `dungeons.md` | 3 dungeons × 10 floors, keys, bosses, walls |
| `world-simulation.md` | **the 1,500 bots:** generation, progression, ticks, rivals, Town Crier |
| `economy-and-currencies.md` | currency roster, faucet/sink map, reset ledger |
| `daily-loop-and-retention.md` | Notice Board, login calendar, Reset Engine |
| `tutorial-and-onboarding.md` | 12 beats, feature gates, hint system |

## Technical
- [`tech/architecture.md`](tech/architecture.md) — stack, structure, state/saves, time/determinism, budgets, CI
- [`tech/data-models.md`](tech/data-models.md) — canonical TypeScript type sketch
- [`tech/ui-ux-style-guide.md`](tech/ui-ux-style-guide.md) — design language, tokens, motion system, component kit, UX rules
- [`tech/asset-pipeline.md`](tech/asset-pipeline.md) — icons, backgrounds, **art-override system**, credits obligations

## Research
- [`research/shakes-and-fidget-reference.md`](research/shakes-and-fidget-reference.md) — how S&F actually works + our deliberate departures

## Root-level
- [`../ROADMAP.md`](../ROADMAP.md) — 19 development phases with acceptance criteria
- [`../USER_QUESTIONS.md`](../USER_QUESTIONS.md) — open decisions awaiting the user (with working defaults)
- [`../CLAUDE.md`](../CLAUDE.md) / [`../AGENTS.md`](../AGENTS.md) — AI-developer working rules
- [`../CHANGELOG.md`](../CHANGELOG.md) — Keep-a-Changelog format

## Documentation rules

1. Mechanics live in their system spec; **numbers live in `balancing-formulas.md`**; types in
   `data-models.md`. Cross-reference, don't duplicate.
2. Docs are updated **in the same PR** as the behavior they describe.
3. `[TUNE]` marks values expected to move in Phase 17 — tuning edits balancing doc only.
4. Open questions always route through `USER_QUESTIONS.md` with a default recorded.
