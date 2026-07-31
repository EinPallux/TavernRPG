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

## Phase 1 — Design System & App Shell (L) ✅
Tokens (colors/type/chamfers/motion springs), fonts, `<TavernPanel>`, `<ActionButton>`, `<Meter>`,
`<Toast>`, `<Modal>`, `<TimerChip>`, `<KeeperBark>`, `<AmbientStage>` + nav rail + top HUD +
place routing with transitions + `/dev/kit` harness page. All 15 places routed with backdrop +
"under construction" keeper barks (locked ones show gate levels).
**Accept:** style guide §2–§8 visibly implemented; 60fps transitions; reduced-motion works;
kit page reviewed against "no rounded slop" checklist; 1366×768 degradation verified.

**Delivered:** the full component kit plus a 20-glyph hand-drawn icon family; grouped nav rail
with visible level gates and collapse-to-icons (persisted); top HUD with portrait/level ring, XP
meter, wallet and a Vigor tankard that fills; directional place transitions; all 15 places routed
and dressed with their backdrop, ambience and keeper bark. Feature gates live in the engine as
one source of truth. **Save schema v2** adds player settings, with a real v1→v2 migration and a
Phase 0 save fixture proving old saves still open. 94 unit tests + 12 e2e, including automated
style-rule checks (no `border-radius` > 4px, no serif fonts anywhere) and a 1366×768 no-overflow
check.

## Phase 2 — Hero Creation & Character Screen (L) ✅
Class data (5 kits' *data*, procs stubbed as definitions), creation flow (class cards → naming →
world seed), Hero state slice, paperdoll + backpack + satchel UI, attributes panel with training
buys (`statCost`), derived-stats panel (static math, no combat yet), item model + `generateItem`
+ `<ItemCard>`/tooltip/compare, equip/drag/lock flows. Dev cheat drawer (flagged) for item spawning.
**Accept:** create hero → equip generated items → buy stats → reload-safe; item budgets match
formulas doc (property tests); compare tooltips correct for all 10 slots; class-lock rules enforced
at generation (unit-tested).

**Delivered:** the five classes as data (kits declared; procs implemented in Phase 3), a creation
flow that leads with *feel* rather than stat tables, and the full character screen — paperdoll,
attribute training with visible prices, derived-stat panel with hover breakdowns, backpack with
overflow satchel. `generateItem` is the single choke point for all gear: budgets, naming, value
and scrap yield, with class restriction enforced at generation so wrong-class loot cannot exist.
**Save schema v3** replaces the walking-skeleton payload with the hero and ships a v2 fixture.
170 unit + 27 e2e green. Item icons are drawn in-house rather than sourced from game-icons.net —
that library is unreachable from the build sandbox (see USER_QUESTIONS Q21).

## Phase 3 — Combat Engine (M) ✅
Pure engine: initiative, rounds, procs (all 5 class kits incl. Verses), crit/armor math, battle
log emission, `buildCombatant` (hero + archetype monsters), golden-log snapshots, 10k-fight
balance harness with mirror/win-rate assertions (CI). No UI beyond a dev log-viewer.
**Accept:** harness passes bands (45–55% mirrors at 4 level checkpoints; archetype win-rate
targets); logs deterministic across Node/browser; engine has zero DOM/state imports (lint rule).

**Delivered:** `fight()` as one pure function emitting a serializable log, all five class procs,
five monster archetypes, and `buildCombatant` putting heroes and monsters through identical
formulas. The balance harness measured the classes as originally specified and found them badly
broken (Warrior beat Mage 100%); the rebalance that followed — class weapon-damage factors and a
narrower survivability spread — is documented in `systems/characters-and-classes.md`. Final:
mirrors 49–52%, per-class averages 49–51%, worst matchup 67%, fights 4–16 rounds. Golden logs
freeze the engine; `/dev/combat` shows every roll. 212 unit + 27 e2e green.

## Phase 4 — Battle Scene (L) ✅
The animated replay: entrances, lunges, particles (Kenney canvas layer), damage numbers, crit
slow-mo, block/dodge/verse presentation, HP ghost bars, KO/victory/defeat, speed controls + skip,
result screen with reward lines & reason hints. Choreography config file. Fuzz: random valid logs
render without throw.
**Accept:** mission-length fight ≤8s at ×1 and 60fps on target hardware; every BattleEvent type
has distinct presentation; reduced-motion variant; result screen matches combat spec §6.

**Delivered.** `battleChoreo.ts` holds every timing; `timeline.ts` turns a log into a schedule as
a pure function (so pacing is unit-tested without rendering); `useBattlePlayback` derives the
current frame from elapsed time, which is what makes skip, replay and speed changes free.
`BattleScene` composes the fighters, a pooled canvas particle layer, floating numbers and screen
shake; `BattleResult` reads the fight back through `engine/combat/analysis.ts`. Harness at
`/dev/battle`.

Two things the phase forced that were not in the plan:
- **Adaptive pacing.** A fixed pace cannot serve both a 3-round and a 20-round fight. The
  exchange now compresses toward the 8s target while the entrance, knockout, closing beat and
  every *impact frame* keep their length (combat spec §4). Measured: median 4.8s, p99 8.0s.
- **The tank archetype was retuned** (balancing §5). It produced 23-round average fights the hero
  won 99.7% of the time — that is a design problem no choreography can fix. Now ~11 rounds, and
  it hits hard enough to matter. Golden log regenerated; balance harness still green.

Also shipped: save schema **v4** (persisted battle speed + skip preference) with migration and a
captured v3 fixture.

## Phase 5 — Tavern & Missions (L) ✅
Tavern screen (ambient, Marla, quest table), Vigor system + HUD tankard, mission offers
(zones/monsters/blurbs data for bands 1–30 initially), duration picker, real-time timers
(+offline completion), fight-at-return via engine+scene, rewards & drop tables, reroll/skip dice
sinks, Ale (barkeep). Mission backgrounds wired for zones 1–4.
**Accept:** full core loop playable (accept → wait → fight → loot → train); Vigor resets at
midnight via Reset Engine v1 (day-key logic + missed-day processing); drop rates match tables
(seeded batch tests); mission state survives reload mid-timer and mid-"return".

**Delivered.** The loop is playable end to end. 10 zones and 64 monsters as data; `board.ts`
draws a stable seeded board; `lifecycle.ts` runs accept → wait → resolve with the outcome
committed at accept; `resetEngine.ts` owns every daily boundary; `drops.ts` holds the §7 tables
that both the roll *and* the printed odds read from. Save schema **v5** carries the activity
slice, so a mission is two timestamps in the save and survives anything.

Four things the phase forced that were not in the plan:
- **New heroes owned nothing.** Fatal once there was something to fight — an unarmed hero swings
  for 1–2. `createHero` now grants a seeded starter kit.
- **Level-1 heroes met level-3 monsters** and lost a fifth of their first missions. The jitter no
  longer rounds upward below level 5; opening hours went ~80% → ~99%.
- **Zone backdrops did not match their zones.** The content-plan table was numbered sight unseen
  and put a tropical shipwreck behind "Whispering Woods". Remapped to what the art depicts.
- **Rewards were banked before the fight played,** so the HUD lit up with the gold before the
  first sword was drawn. Claiming now happens when the fight ends; nothing is lost, because the
  mission stays pending until claimed.

Also fixed: `claimMission` would pay twice if called twice (a double-clicked Continue). It now
refuses anything that is not the pending mission.

## Phase 6 — Patrol & Economy Pass 1 (S) ✅
Patrol screen (Hildy, shift slider, offline accrual, cancel pro-rating, shift report), mission↔
patrol exclusivity, gold faucet/sink instrumentation (dev economy dashboard, flagged), first
economy CI sim (30 modeled days) asserting the "always slightly broke" band.
**Accept:** patrol collects correctly across reloads/offline; economy sim green; dashboards show
faucet/sink ledger per modeled day.

**Delivered.** A shift is three numbers and a level in the save; what it has earned is *computed
from the clock, never accumulated*, which is what makes closing the tab for six hours work with no
background timer and a rewound clock unable to mint gold. Collecting and cancelling are the same
call — an abandoned shift can never be paid by different rules than a completed one. Exclusivity
lives in the engine (`startShift` / `acceptMission` both refuse), not in a disabled button. Save
schema **v6** carries the shift, with a v5 fixture that has a mission mid-flight. `/dev/economy`
renders the CI sim's ledger day by day. 438 unit + 67 e2e green.

The sim is the story of the phase — it found two real problems on its first run:
- **Levelling was ~10× too slow.** `xpPerVigor` was a flat `xpNeeded(L)/320`, which makes
  levels-per-day *constant* (the hundredth level costing the same as the second) and put level 10
  — where the last feature gate opens — on **day 29** against a design target of day 2–3. Now
  `28 + 1.2L`: L10 day 4, L25 day 11, L55 day 34. The §0 table's L100 target needs a 6× deceleration
  no simple divisor gives; flagged for Phase 17, and the dashboard measures all four milestones
  every build.
- **Faster levelling exposed gear supply.** A level-13 hero was still swinging the level-1 starter
  weapon, with win-rate sliding 100% → 40%. Slot weighting alone did not fix it (the problem is
  variance, not rate), so drops now carry a **weapon pity floor** — five levels behind and the next
  drop is a weapon. Pity decides *what* a drop is, never *whether* one happens. Phase 7's shops are
  the real fix.

Two more things the phase forced:
- **The gate only existed in the nav rail.** `/patrol` rendered fine at level 1 by URL, and it pays
  real gold. `GatedPlace` now enforces `gateFor()` where the room renders, wrapping the screen
  rather than modifying it.
- Two Phase 5 tests were quietly fiction — the "playthrough" hero never trained and only equipped
  into empty slots, and `isUpgrade` ignored weapon damage entirely, so better weapons stayed in the
  bag and the resulting losses read as a balance problem. Both fixed; see CLAUDE.md on what
  "on curve" means.

## Phase 7 — Shops & Stables (M) ✅
Armory + Gilded Facet (day-seed stock, guaranteed-mix rules, reroll, buy/sell with confirms),
universal `disposeItem` service, Stables with 4 rental mounts (timer chip, renewal reminder,
replacement confirm), mission-timer integration.
**Accept:** stock deterministic per day-seed (same day+seed ⇒ same stock); sell/buy ledger
balances; mounts reduce timers exactly per tier; all keeper barks in; restock at midnight verified
across a simulated week.

**Delivered.** Both shops are one screen (`ShopScreen`) with two keepers — everything structural
is identical and duplicating it would guarantee drift. The shelf is drawn from
`(worldSeed, dayKey, shopId, rerollCount)` and *persisted*, not regenerated on read: storing the
seed would be smaller, but a change to `generateItem` could then swap the item between the card
and the click, which is the one bug a shop must not have. Sold slots keep their place behind a
wrapped parcel. Restock is the Reset Engine's job — shelves are cleared at the boundary and drawn
lazily on the next visit, so no feature compares its own stored day. `disposeItem` quotes before
it acts, which is what lets the confirm the UI renders be the same rule the engine enforces.
Save schema **v7**; 552 unit + 91 e2e green.

Three things the phase forced or settled:
- **The guaranteed mix is what makes shops the gear-supply fix**, not the reroll. Bram always has
  a weapon and an offhand for your class, so a hero whose weapon has fallen behind can buy one on
  any day at any level. The Phase 6 pity floor stays as the floor for a player who never shops.
- **Renewing a mount extends; only switching replaces.** The spec's "replaces the remainder" is
  right for a different animal and quietly robs anyone who renews early on the same one. Runway
  is capped at two terms, because prices pin to `goldPerVigor` *at purchase* and without a cap a
  level-10 player could buy a season of Warhorse and ride it into their forties.
- **The economy sim grew shops, mount upkeep and loot sales**, as Phase 6 promised it would. It
  says training still takes 85.8% of spending (correct — §2 calls it "the endless one") and shops
  only 3.1%, which makes the Armory a gear-supply fix rather than a gold sink. Recorded with the
  measured table in balancing §9 and flagged for the Phase 17 pass; the lever is the 3.2×
  multiplier, not the stock size.

## Phase 8 — World Simulation Core (L) ✅
World generation (1,500 bots, 60 guilds, personalities, ladder seed, top-10 legends data), bot
progression ticks (online 5-min + load reconciliation with LoD bands, ≤1s/14-day budget), ladder
service, Town Crier feed (generation + home panel UI + overnight summary card). No player-facing
arena yet (dev ladder viewer, flagged).
**Accept:** same seed ⇒ identical world at any timestamp (property test); reconciliation budget
met (perf test); feed entries reference real sim deltas (audit test samples 100 entries);
bot stat blocks pass `buildCombatant` plausibility bounds vs level curves.

**Delivered.** Fifteen hundred heroes, sixty guilds and ten named legends from one number.
Identity is *derived* rather than stored — 99 bytes a bot, 145 KB for the world — so a
`BotRecord` is only what the simulation actually changes. Bots are built on the same curves
players are, which is what makes inspecting or fighting one honest. All four acceptance criteria
are tests: determinism, **135 ms for a fortnight / 177 ms for a year**, the hundred-entry feed
audit, and stat blocks bounded against `buildReferenceCombatant`. 651 unit + 104 e2e green.

Two numbers had to be *solved* rather than chosen:
- **The level curve missed §12 twice.** A dedication multiplier on the log-normal pulled the
  median from 28 to 24 — scaling a distribution moves its centre — so dedication and level are
  now correlated through a Gaussian copula, which keeps the marginal exactly on target. And a
  hard clamp at 92 left seventy-five heroes tied on the ceiling; the top is now compressed
  asymptotically, with the legends occupying a visible tier above the field.
- **The Crier was monotonous before it was wrong.** Every headline was true and backed by a real
  delta, and the board still came out fourteen ladder passes in a row, because the sim emits
  twice as many of those and they score higher. No category may now take more than 40% of the
  board.

Three things the phase forced outside its own scope:
- **The autosave was losing writes.** Parallel writes were guarded against clobbering the *store*
  but not the *disk*; at 145 KB an older `put` regularly landed last, and a hero levelled to 10
  reloaded as 5. Writes are now serialised and coalescing.
- **World catch-up moved after first paint.** ~300 ms of simulation was sitting in front of the
  player's own hero on every load.
- A new hero met a blank Crier board, so the world is now generated with its clock a day back and
  that day is simulated on arrival.

## Phase 9 — Arena & Hall of Fame (M) ✅
Opponent draw (±rank band), threat reads, cooldown/skip, rewarded-wins caps, rank-swap + honor
math via ladder service, revenge queue (sim attacks land Phase 8's hooks), HoF tabs (virtualized
heroes list, guilds, legends archive), weekly payout, milestone stingers.
**Accept:** fighting a bot uses its materialized combatant (spot-check fairness harness); ladder
churn visible overnight; 1,501-row list scrolls at 60fps; weekly payout fires exactly once across
DST/multi-day absence fixtures.
**Done 2026-07-30.** `engine/arena/` (draw, threat reads, duel, raids, payout), the player seated
on the ladder at world-raise, `state/arenaActions.ts`, the Proving Grounds with duelling posters
and the rank swap shown as sliding rungs, the Hall of Fame's three tabs over a hand-rolled
virtualized list (35 rows mounted of 1,501), `engine/world/halls.ts`, and save schema v9.

## Phase 10 — Guilds (L) ✅
Browse/apply/join (bot decision delays), founding flow (banner builder), roster & roles, Treasury/
Drillmaster donations + buffs into economy multipliers, guild chat (template corpus + event-driven
chatter + player-message responses), weekly Guild Bounty, guild HoF integration, Guildmaster tools.
**Accept:** join AND found paths fully playable; buffs verifiably applied to mission/patrol
payouts; chat references real events only; bounty completes/partials across a simulated week;
bots apply to player guilds at spec'd rates (statistical test).
**Done 2026-07-30.** `engine/guilds/` (`membership` — everything about a hall derived from
`(worldSeed, guildId, roster)` so sixty halls need no stored state; `buffs` — two tracks priced
superlinearly to +25%; `chat`; `bounty`), `data/guildChat.ts` (162 slotted templates) and
`data/bounties.ts`, `state/guildActions.ts`, the two-faced Guild Hall with a live banner preview
in the founding flow, economy sim pass 3, and save schema v10. Phase 8's generator was retuned
twice on the way — it had never respected the twenty-five cap, and its seeded treasury predated
`stepCost` and left all sixty halls at +1%.

## Phase 11 — Dungeons (M) ✅
Undertavern hub, 3 dungeons data (30 monsters incl. boss procs), key drops & gates, floor
progression + chaining, loss cooldown, best-attempt bars, boss presentation (nameplates, stings,
proc explainers), floor-10 ceremonies + trophies, dungeon loot tables (epic/set hooks live in P12
— until then floor-10 grants Epic).
**Accept:** all 30 floors fightable with tuned walls (harness win-rate bands per floor); progress/
cooldowns persist; keys drop per spec; boss procs render with explainer lines.
**Done 2026-07-30.** `data/dungeons.ts` (three dungeons, thirty named floors, six boss
signatures), three new `CombatProc` kinds in the resolver with their own events, `engine/dungeons/`
(`floors`, `delve`, `keys`), `state/dungeonActions.ts`, the Undertavern with its torch-lit descent
and floor-10 ceremony, and save schema v11. The harness measured what nobody had: **archetype is
worth up to twelve levels of difficulty at dungeon budget**, more than the level curve gains
across six floors — so the first draft's flavour-first floor ordering had three places where the
dungeon got *easier* as you went down.

## Phase 12 — Gear Sets & The Emberforge (L) ✅
10 launch sets (data + set-bonus procs in engine + sigil presentation), Set Collections page,
set-aware paperdoll glows, dungeon/loot integration (Set replaces Epic rolls per tables, no-dupe
rule), Emberforge screen: scrapping (limits, yields, crucible ceremony), standard crafting
(3 investment tiers + ember pity), set recipes.
**Accept:** every set completable via dungeons+crafting (simulated acquisition test converges);
set bonuses measurably fire in harness (each 5pc bonus has a dedicated engine test); forge odds
match config in 100k-roll tests; scrap/sell decision surfaces correct values.
**Done 2026-07-30.** `data/gearSets.ts` (ten sets, thirty bonuses declared as `SetEffect` data),
`engine/items/sets.ts` (the fold into one `CombatModifiers` bag, plus derived set progress),
`engine/forge/` (`forgeConfig`, `craft`), `state/forgeActions.ts`, the Emberforge's three benches
with the anvil-strike ceremony, the Set Collections tab with its paperdoll glow, and save schema
v12. The design decision that paid for itself: **thirty bonuses as declarative data rather than
thirty proc kinds** — the golden logs confirm the resolver costs nothing for a fighter wearing no
set, and set eleven is now a data change.

## Phase 13 — Fortune's Table (M) ✅
Gacha room (Vesna, ambience), 3 banner types with deterministic rotation, roll economics (free
daily, dice rolls), drop tables, weekly pity + monthly pity track, dupe conversion, the roll
ceremony (dice tumble, tarot flips, rarity buildups), odds panel + history log.
**Accept:** rates match config (100k-roll test incl. pity trigger paths & missing-first); rotation
matches calendar fixtures (month boundaries, week starts); ceremony skippable & reduced-motion
safe; converted dupes credit correctly.
**Done 2026-07-30.** `data/banners.ts` (three banners, one seven-outcome table, the monthly
track), `data/vesnaBarks.ts`, `engine/gacha/` (`schedule` — the rotation as a pure function of the
calendar; `roll`; `track`), `state/gachaActions.ts`, the room with its always-visible odds panel,
public pity meter, tarot ceremony and history log, an economy-sim gacha faucet, and save schema
v13. The design position the whole room is built on: **every rate the player can be affected by is
on screen beside the button that spends the die**, which is only true because the panel and the
dice read the same object. Building it also caught that the entire e2e suite had been running at
1280×720 while the config claimed 1080p — `devices['Desktop Chrome']` brings its own viewport and
a project-level `use` beats the top-level one.

## Phase 14 — The Menagerie (S) ✅
12 pets (data, acquisition wiring to dungeon firsts/milestones/banner slots/egg drops), stalls UI
with idle animations, feeding (caps, food economy), rarity upgrades, active-pet boost into
`buildCombatant`/economy multipliers, collection silhouettes.
**Accept:** every pet acquirable via its documented source (integration tests for deterministic
ones, rate tests for RNG ones); boosts apply and display with breakdowns; feed caps reset properly.
**Done 2026-07-30.** `data/pets.ts` (twelve companions whose *source* is a closed union of the
facts that earn them), `engine/pets/` (`ownership` — derived, never stored; `feeding`; `boost`;
`eggs`), `state/petActions.ts`, the Menagerie with its twelve stalls, the active-pet chip on the
character screen, the nav rail's arrivals badge, economy sim pass 4, and save schema v14.

The shape worth copying: **ownership is derived from the history that earned it.** There is no
"pets owned" list, so a player who cleared Barrowdeep floor 5 in Phase 11 owns the Gloom Cat the
moment the room opens — no migration, no reconciliation pass, and no stored copy to disagree
with the fact. Only the two luck-based pets store their grant, because for a 0.5% roll the luck
*is* the fact. Building it turned up three things: the Scrap drop rate was half what the copy
promised (a pet took two months and the three-a-day cap was literally unreachable — the sim
caught it), `zoneMissions` counted attempts while its sibling counted victories, and the gear
`goldFind`/`xpBonus` specials had been computed by `deriveStats` since Phase 2 and applied to
nothing.

## Phase 15 — Notice Board, Calendar & Daily Polish (M) ✅
Daily task pool (feature-aware weighting), points/chests, weekly ladder chest, 28-day login
calendar (pause-not-reset), overnight summary card final form, Reset Engine v2 (full §5 economy-
doc ledger + reset moment UX), out-of-Vigor wind-down flow (Patrol CTA + tomorrow preview).
**Accept:** all resets in one engine (audit: no feature reads clock independently — lint/grep
gate); multi-day absence fixtures (2/9/40 days incl. DST) process correctly; dice paycheck
(§13 tables) verified across a simulated month.
**Done 2026-07-30.** `data/progress.ts` (one vocabulary for everything the game counts),
`data/dailyTasks.ts` and `data/calendar.ts`, `engine/board/` (`tasks` — a day-seeded,
feature-aware, neglect-weighted draw; `chest`), `engine/calendar/`, Reset Engine v2 with its
ledger, `state/progressActions.ts` as the single credit path, `boardActions` + `calendarActions`,
the two-faced Notice Board, the reset-moment flourish, the out-of-Vigor wind-down, and save
schema v15. The Moss Tortoise and the Coin Toad are now obtainable.

The shape worth copying: **one vocabulary, one credit path, many consumers.** The guild bounty
and the daily tasks both ask the player to do countable things, and before this phase they would
have kept separate lists of what those things are — the third occasion of a failure CLAUDE.md
already records twice. Building it turned up that two of six bounty metrics had never been
credited from the player's side at all. The reset audit (`engine/reset/audit.test.ts`) is the
other piece worth keeping: it reads the source and fails on the *shape* a drift bug takes,
because behaviour cannot catch two features that each decide it is tomorrow.

## Phase 16 — Tutorial & Onboarding (M) ✅
12 data-driven beats with spotlight system, tutorial-shortened first mission, gates enforcement
polish (rail silhouettes, unlock toasts), opt-out path, glossary tooltips (41 entries),
first-encounter micro-explainers, hint chip system.
**Accept:** fresh-profile Playwright run completes all 12 beats; opt-out grants gates correctly;
every beat resumable after mid-beat reload; a no-docs playtester (user proxy checklist) reaches
level 10 unaided.
**Done:** `e2e/tutorial.spec.ts` drives a fresh profile through the tour — chip off-site,
spotlight on it, 20-second first contract, three callouts at a locked ×1 — plus a mid-beat reload
that resumes on the same beat, opt-out at creation, skip-and-reload, the hint chip falling through
to its next rule, six unlock toasts on a 1→4 climb, and a glossary tooltip on an opted-out save.
`tutorial.test.ts` replays a whole playthrough and fails if the finished-beat count ever falls;
`tutorialContent.test.ts` checks every beat's spotlight against the components that render it.
1,150 unit + 184 e2e green. **Deferred to Phase 18:** the glossary's settings-screen index, which
needs the Settings screen. The no-docs playtest is the user's to run.

## Phase 17 — Balancing, Content Fill & Feel (L) ✅
Fill content to plan volumes (96 monsters, 160 blurbs, all zones wired to 14 backdrops, barks,
empty states), run pacing simulations vs §0 targets and tune every `[TUNE]`, class-balance pass
via harness, economy 90-day sim bands finalized, SFX pass + `bgm.mp3` drop-in music support
(Q13 approved — asset pipeline §6), a11y pass (focus order, contrast, reduced-motion audit),
performance pass vs budgets (bundle, fps, reconciliation).
**Accept:** pacing sim hits §0 milestone table ±20%; all `[TUNE]` values have post-tuning entries
in balancing doc changelog section; Lighthouse perf ≥ 90 on stage screens; zero contrast failures.

**Delivered.** Content to plan volume, every `[TUNE]` accounted for, sound, the last placeholder
room retired, and two audits that had to be *built* before they could find anything. Save schema
unchanged at **v16** — the only phase since Phase 1 that needed no migration, which is the right
shape for a tuning phase. 1,243 unit + 211 e2e green.

Three of the four acceptance criteria are met outright:
- **Pacing sim hits §0 ±20%** — all six rows, where three were outside. See below.
- **Every `[TUNE]` has a post-tuning entry** — 68 markers, balancing §16, each changed or defended.
- **Lighthouse ≥ 90 on stage screens** — 98 · 98 · 98 · 99.

The fourth, **zero contrast failures**, is **not met**: eleven remain out of 500+ at the start,
each named in `e2e/a11y.spec.ts` and style guide §10.3 with an owner. They fall in two groups —
type sitting directly on backdrop art (needs a scrim, a visual-design change) and cross-fade
artifacts the audit harness still catches. Budgeted per room so the count can only come down.

Four things the phase forced:

- **Two measurement bugs were hiding a third.** §0 promised a full set in 45–60 days and the sim
  said 125. The recorded reason (Q23: only the gacha feeds the chase) was half of it — the sim
  *excluded the forge* on the stated reasoning that a deterministic craft would flatter the
  number, and the forge route was itself unreachable at 2 Starmetal a recipe against an Epic
  scrap paying an average of half of one. ~210 days for the "guaranteed path". Each fact
  concealed the other: the exclusion hid the price, and the price justified the exclusion. Fixed
  both; a set closes at day 51.5. **The third instance of "a cap the game cannot supply is a lie
  on the screen"** — and the new lesson is that a *simulation* can tell it too, by declining to
  measure something and calling the result pessimistic.
- **An audit that inspects one element is worse than no audit.** `axe-core` reported zero contrast
  violations on the tavern — out of **one** node it could resolve, with 103 returned `incomplete`
  because it cannot see through a `background-image`, and every room has one. Reading real pixels
  instead found 500+ failures: the muted-parchment ladder measured 2.5–4.3:1, and the semantic
  colours had only *fill* shades being used as text.
- **Frame rate was the wrong gate, and finding that out was the work.** A ×4 fight measured 20fps
  against a 60fps baseline in the same browser — then the container turned out to render through
  SwiftShader with no GPU. The gate is main-thread cost now (0.7ms of an 8ms budget), which is
  GPU-independent. `frameAt` was the first suspect and measurement exonerated it at **9
  microseconds** a call.
- **Lighthouse 49 → 98 was one asset decision.** 56 MB of backdrop PNGs served exactly as
  authored, for an LCP of 21.5 seconds on a first paint of 0.3. The sync step transcodes now.
  No code changed.

## Phase 18 — Release Hardening & 1.0 (M) ✅
Save migration framework proven (beta-save fixtures), export/import UX, multi-tab guard, error
boundary flows, corrupted-save triage, credits screen (game-icons attribution — license gate),
settings completeness, Vercel production config (headers/caching for assets), full regression
matrix (Playwright suite over the core loops), CHANGELOG 1.0.0, tag & deploy.
**Accept:** GDD §7 release definition satisfied line-by-line; upgrade-from-oldest-beta save works;
production deploy plays clean in a fresh browser profile end-to-end.

**Delivered.** Every scope item built; 1,311 unit + 256 e2e green; `npm run release` runs the
release definition rather than restating it. **Two acceptance criteria are met, and the third is
the user's to take:** the deploy itself, and the fresh-profile playthrough on it.

- **GDD §7 line by line — met, and now executable.** `engine/release/checklist.ts` gives each of
  the seventeen §4 features its spec, engine, screens, tests and *named animated moment*, and
  `release.test.ts` parses the GDD's own table so the two cannot drift. The line that had no
  harness at all — "carries a new player to level 10 unaided" — has one, and it failed on the
  first run. The fps clause is restated as what is actually measured, with the reading on real
  hardware named as a human step rather than dropped.
- **Upgrade-from-oldest-beta — met.** v1 → v16, a captured fixture per version, and a census that
  fails when a version ships without one. Phase 16 had already skipped its fixture.
- **A fresh-profile production playthrough — not met here.** It needs a deploy, and the deploy is
  the user's call. `docs/tech/deployment.md` §6 is the checklist.

Five things the phase forced, and four of them were bugs the hardening itself created or exposed:

- **A guard that delays a load has to gate the render too.** The tab-lock election put 350ms in
  front of `hydrate()` and the shell kept drawing the town over an empty store — so Settings
  offered "Export this save" against `save === null`. A theoretical race became a dependable bug
  the moment something slowed the load down. Cost: a point of Lighthouse, paid without hesitating.
- **An audit is worth what it inspected — again.** The header work found three pre-existing
  failures in the e2e suite that a full run had not been done to catch, including a tutorial chip
  that looked live and did nothing for a few hundred milliseconds after every arrival.
- **`immutable` is a promise about the URL, not the bytes.** 505 art files at authored paths that
  the sync step rewrites in place; marking them immutable would pin a superseded painting in a
  returning player's browser for a year.
- **A CSP that forbids `eval` took a code change, not a config one.** Zod's JIT probe reported a
  violation on every load — caught, harmless, and permanent console noise that trains you to
  ignore console noise.
- **Object key order is not a data model.** Item stat lines agreed with schema order by accident
  until the parser went interpreted, and the Armory's shelf started re-ordering itself on reload.

---

## Post-1.0 backlog (headline patches, rough order)

**Shipped since 1.0:**

- *Three save slots.* Settings → Characters. The slot argument had threaded through the save layer
  since Phase 0 with nothing able to reach past slot 1 — this is the room that plumbing was always
  for, plus a remembered active slot that lives beside the saves rather than inside one.
  `architecture.md` §3.
- *Tooltips of our own.* `components/ui/Tooltip.tsx` + `state/tooltipStore.ts` — one element at
  shell level, opening on hover *and* focus, and every native `title` in the game converted to it.
  `tooltips.test.ts` reads the source so a twenty-seventh cannot arrive quietly. Style guide §8.1.
- *The Town Map.* Emberhollow painted from above with all fourteen buildings clickable, and the
  screen the game opens on — `/` redirects to `/map`, because standing outside is a place. The rail
  stays, does the same job as a list, and reads its badges from the same `state/townSignals.ts`;
  neither way of getting around is the real one. Hotspots are data (`data/townMap.ts`) with a
  census test, and `e2e/map.spec.ts` measures the real boxes at three window sizes because the fit
  is CSS, not arithmetic. Style guide §2.1, §7.2.

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
