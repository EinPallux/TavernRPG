# TavernRPG — Development Roadmap

> **19 small, serious phases to 1.0.** Each phase is independently shippable to the playable main
> branch (feature-flagged where needed), ends with working software + tests + updated docs, and
> has explicit acceptance criteria. No phase builds "every system's skeleton" — each builds a
> *complete* slice. Sizes: S ≈ focused session, M ≈ a few sessions, L ≈ sustained effort.
> Specs referenced live under `docs/`.

**Status legend:** 🔲 not started · 🔨 in progress · ✅ done

---

## Phase 0 — Foundation & Walking Skeleton (M) ✅
Scaffold Next.js 16 + TS strict + Tailwind v4 + Zustand + Motion + Vitest + Playwright + ESLint/
Prettier + CI (typecheck/lint/test/build) + Vercel deploy. Seeded RNG lib + GameClock + save
envelope (Zod, slot 1 only) with a trivial "tavern door" placeholder page proving persistence
round-trip. Repo hygiene: `game_assets` → served pipeline stub, CREDITS.md seeded.
**Accept:** CI green on PR; deployed preview loads; a counter survives reload via IndexedDB save;
`Math.random`/`Date.now` lint ban active; docs: architecture "as-built" notes updated.

**Delivered:** 68 unit tests + 5 Playwright e2e, all green; `npm run verify` (typecheck → lint →
test → build) passes; static build output; determinism + engine-purity lint guards verified to fire;
save system ships versioned Zod validation, a migration chain with tests, backup-fallback recovery
and export/import; asset sync script serving 503 files; `bgm.mp3` drop-in folder created.
Toolchain deviations from plan (Next 16, ESLint pinned to 9, Vitest 4 environment handling) are
recorded in `docs/tech/architecture.md` §1 "As-built notes".

## Phase 1 — Design System & App Shell (L) 🔲
Tokens (colors/type/chamfers/motion springs), fonts, `<TavernPanel>`, `<ActionButton>`, `<Meter>`,
`<Toast>`, `<Modal>`, `<TimerChip>`, `<KeeperBark>`, `<AmbientStage>` + nav rail + top HUD +
place routing with transitions + `/dev/kit` harness page. All 15 places routed with backdrop +
"under construction" keeper barks (locked ones show gate levels).
**Accept:** style guide §2–§8 visibly implemented; 60fps transitions; reduced-motion works;
kit page reviewed against "no rounded slop" checklist; 1366×768 degradation verified.

## Phase 2 — Hero Creation & Character Screen (L) 🔲
Class data (5 kits' *data*, procs stubbed as definitions), creation flow (class cards → naming →
world seed), Hero state slice, paperdoll + backpack + satchel UI, attributes panel with training
buys (`statCost`), derived-stats panel (static math, no combat yet), item model + `generateItem`
+ `<ItemCard>`/tooltip/compare, equip/drag/lock flows. Dev cheat drawer (flagged) for item spawning.
**Accept:** create hero → equip generated items → buy stats → reload-safe; item budgets match
formulas doc (property tests); compare tooltips correct for all 10 slots; class-lock rules enforced
at generation (unit-tested).

## Phase 3 — Combat Engine (M) 🔲
Pure engine: initiative, rounds, procs (all 5 class kits incl. Verses), crit/armor math, battle
log emission, `buildCombatant` (hero + archetype monsters), golden-log snapshots, 10k-fight
balance harness with mirror/win-rate assertions (CI). No UI beyond a dev log-viewer.
**Accept:** harness passes bands (45–55% mirrors at 4 level checkpoints; archetype win-rate
targets); logs deterministic across Node/browser; engine has zero DOM/state imports (lint rule).

## Phase 4 — Battle Scene (L) 🔲
The animated replay: entrances, lunges, particles (Kenney canvas layer), damage numbers, crit
slow-mo, block/dodge/verse presentation, HP ghost bars, KO/victory/defeat, speed controls + skip,
result screen with reward lines & reason hints. Choreography config file. Fuzz: random valid logs
render without throw.
**Accept:** mission-length fight ≤8s at ×1 and 60fps on target hardware; every BattleEvent type
has distinct presentation; reduced-motion variant; result screen matches combat spec §6.

## Phase 5 — Tavern & Missions (L) 🔲
Tavern screen (ambient, Marla, quest table), Vigor system + HUD tankard, mission offers
(zones/monsters/blurbs data for bands 1–30 initially), duration picker, real-time timers
(+offline completion), fight-at-return via engine+scene, rewards & drop tables, reroll/skip dice
sinks, Ale (barkeep). Mission backgrounds wired for zones 1–4.
**Accept:** full core loop playable (accept → wait → fight → loot → train); Vigor resets at
midnight via Reset Engine v1 (day-key logic + missed-day processing); drop rates match tables
(seeded batch tests); mission state survives reload mid-timer and mid-"return".

## Phase 6 — Patrol & Economy Pass 1 (S) 🔲
Patrol screen (Hildy, shift slider, offline accrual, cancel pro-rating, shift report), mission↔
patrol exclusivity, gold faucet/sink instrumentation (dev economy dashboard, flagged), first
economy CI sim (30 modeled days) asserting the "always slightly broke" band.
**Accept:** patrol collects correctly across reloads/offline; economy sim green; dashboards show
faucet/sink ledger per modeled day.

## Phase 7 — Shops & Stables (M) 🔲
Armory + Gilded Facet (day-seed stock, guaranteed-mix rules, reroll, buy/sell with confirms),
universal `disposeItem` service, Stables with 4 rental mounts (timer chip, renewal reminder,
replacement confirm), mission-timer integration.
**Accept:** stock deterministic per day-seed (same day+seed ⇒ same stock); sell/buy ledger
balances; mounts reduce timers exactly per tier; all keeper barks in; restock at midnight verified
across a simulated week.

## Phase 8 — World Simulation Core (L) 🔲
World generation (1,500 bots, 60 guilds, personalities, ladder seed, top-10 legends data), bot
progression ticks (online 5-min + load reconciliation with LoD bands, ≤1s/14-day budget), ladder
service, Town Crier feed (generation + home panel UI + overnight summary card). No player-facing
arena yet (dev ladder viewer, flagged).
**Accept:** same seed ⇒ identical world at any timestamp (property test); reconciliation budget
met (perf test); feed entries reference real sim deltas (audit test samples 100 entries);
bot stat blocks pass `buildCombatant` plausibility bounds vs level curves.

## Phase 9 — Arena & Hall of Fame (M) 🔲
Opponent draw (±rank band), threat reads, cooldown/skip, rewarded-wins caps, rank-swap + honor
math via ladder service, revenge queue (sim attacks land Phase 8's hooks), HoF tabs (virtualized
heroes list, guilds, legends archive), weekly payout, milestone stingers.
**Accept:** fighting a bot uses its materialized combatant (spot-check fairness harness); ladder
churn visible overnight; 1,501-row list scrolls at 60fps; weekly payout fires exactly once across
DST/multi-day absence fixtures.

## Phase 10 — Guilds (L) 🔲
Browse/apply/join (bot decision delays), founding flow (banner builder), roster & roles, Treasury/
Drillmaster donations + buffs into economy multipliers, guild chat (template corpus + event-driven
chatter + player-message responses), weekly Guild Bounty, guild HoF integration, Guildmaster tools.
**Accept:** join AND found paths fully playable; buffs verifiably applied to mission/patrol
payouts; chat references real events only; bounty completes/partials across a simulated week;
bots apply to player guilds at spec'd rates (statistical test).

## Phase 11 — Dungeons (M) 🔲
Undertavern hub, 3 dungeons data (30 monsters incl. boss procs), key drops & gates, floor
progression + chaining, loss cooldown, best-attempt bars, boss presentation (nameplates, stings,
proc explainers), floor-10 ceremonies + trophies, dungeon loot tables (epic/set hooks live in P12
— until then floor-10 grants Epic).
**Accept:** all 30 floors fightable with tuned walls (harness win-rate bands per floor); progress/
cooldowns persist; keys drop per spec; boss procs render with explainer lines.

## Phase 12 — Gear Sets & The Emberforge (L) 🔲
10 launch sets (data + set-bonus procs in engine + sigil presentation), Set Collections page,
set-aware paperdoll glows, dungeon/loot integration (Set replaces Epic rolls per tables, no-dupe
rule), Emberforge screen: scrapping (limits, yields, crucible ceremony), standard crafting
(3 investment tiers + ember pity), set recipes.
**Accept:** every set completable via dungeons+crafting (simulated acquisition test converges);
set bonuses measurably fire in harness (each 5pc bonus has a dedicated engine test); forge odds
match config in 100k-roll tests; scrap/sell decision surfaces correct values.

## Phase 13 — Fortune's Table (M) 🔲
Gacha room (Vesna, ambience), 3 banner types with deterministic rotation, roll economics (free
daily, dice rolls), drop tables, weekly pity + monthly pity track, dupe conversion, the roll
ceremony (dice tumble, tarot flips, rarity buildups), odds panel + history log.
**Accept:** rates match config (100k-roll test incl. pity trigger paths & missing-first); rotation
matches calendar fixtures (month boundaries, week starts); ceremony skippable & reduced-motion
safe; converted dupes credit correctly.

## Phase 14 — The Menagerie (S) 🔲
12 pets (data, acquisition wiring to dungeon firsts/milestones/banner slots/egg drops), stalls UI
with idle animations, feeding (caps, food economy), rarity upgrades, active-pet boost into
`buildCombatant`/economy multipliers, collection silhouettes.
**Accept:** every pet acquirable via its documented source (integration tests for deterministic
ones, rate tests for RNG ones); boosts apply and display with breakdowns; feed caps reset properly.

## Phase 15 — Notice Board, Calendar & Daily Polish (M) 🔲
Daily task pool (feature-aware weighting), points/chests, weekly ladder chest, 28-day login
calendar (pause-not-reset), overnight summary card final form, Reset Engine v2 (full §5 economy-
doc ledger + reset moment UX), out-of-Vigor wind-down flow (Patrol CTA + tomorrow preview).
**Accept:** all resets in one engine (audit: no feature reads clock independently — lint/grep
gate); multi-day absence fixtures (2/9/40 days incl. DST) process correctly; dice paycheck
(§13 tables) verified across a simulated month.

## Phase 16 — Tutorial & Onboarding (M) 🔲
12 data-driven beats with spotlight system, tutorial-shortened first mission, gates enforcement
polish (rail silhouettes, unlock toasts), opt-out path, glossary tooltips (40 entries),
first-encounter micro-explainers, hint chip system.
**Accept:** fresh-profile Playwright run completes all 12 beats; opt-out grants gates correctly;
every beat resumable after mid-beat reload; a no-docs playtester (user proxy checklist) reaches
level 10 unaided.

## Phase 17 — Balancing, Content Fill & Feel (L) 🔲
Fill content to plan volumes (96 monsters, 160 blurbs, all zones wired to 14 backdrops, barks,
empty states), run pacing simulations vs §0 targets and tune every `[TUNE]`, class-balance pass
via harness, economy 90-day sim bands finalized, SFX pass + `bgm.mp3` drop-in music support
(Q13 approved — asset pipeline §6), a11y pass (focus order, contrast, reduced-motion audit),
performance pass vs budgets (bundle, fps, reconciliation).
**Accept:** pacing sim hits §0 milestone table ±20%; all `[TUNE]` values have post-tuning entries
in balancing doc changelog section; Lighthouse perf ≥ 90 on stage screens; zero contrast failures.

## Phase 18 — Release Hardening & 1.0 (M) 🔲
Save migration framework proven (beta-save fixtures), export/import UX, multi-tab guard, error
boundary flows, corrupted-save triage, credits screen (game-icons attribution — license gate),
settings completeness, Vercel production config (headers/caching for assets), full regression
matrix (Playwright suite over the core loops), CHANGELOG 1.0.0, tag & deploy.
**Accept:** GDD §7 release definition satisfied line-by-line; upgrade-from-oldest-beta save works;
production deploy plays clean in a fresh browser profile end-to-end.

---

## Post-1.0 backlog (headline patches, rough order)

1. **The Collector's Album** — S&F-scrapbook-style collection of items/monsters with % XP bonus.
2. **Guild Wars & Raid Bosses** — scheduled guild-vs-guild battles + co-op PvE chains (sim ready).
3. **Seasonal Events** — 2-week themed events (new banners, event currency shop, decorated tavern).
4. **The Witch's Hut** — potions (attribute %, S&F-style), gear enchanting, respec service.
5. **Legendary tier + Legendary Dungeon** — above-Set chase for veterans.
6. **Pet Habitats & Pet Duels** — expand Menagerie toward S&F's metagame, right-sized.
7. **3rd gear set per class** (named in `gear-sets.md`), new dungeons (4–6), zone expansion.
8. **6th class** (community-teased via Town Crier lore first).
9. **Cloud saves/accounts** (revisits Q1), mobile layout, i18n (German first — Q12).
10. **Achievements v2, Patrol events, arena scouting, buyback tab, hero appearance/gender
    variants (Q20)** — QoL wave.

## Working agreements

- A phase is *done* when: accept criteria demoed, tests green, docs updated, CHANGELOG entry added,
  feature flag removed (or justified), and the deployed preview plays clean.
- Scope creep goes to the backlog, not into the current phase. Bugs found in later phases fix in
  place (no "polish phase" dumping ground except the designed P17).
- Every PR title: `[P<n>] <what>`; branch names `phase-<n>/<slug>`.
