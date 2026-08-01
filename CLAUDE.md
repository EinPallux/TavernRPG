# CLAUDE.md — Working rules for Claude Code on TavernRPG

TavernRPG is a **fully-fledged** single-player fantasy browser RPG (S&F-inspired, simulated-MMO,
semi-idle) — not a prototype. Quality bar: every shipped slice is complete with animation,
feedback, edge cases and tests. Deployed on Vercel.

## Current state

**Design locked; Phases 0–18 complete — the game is at 1.0.** All 20 questions in `USER_QUESTIONS.md` were answered on
2026-07-29 and the specs reflect the answers.

- **Phase 0:** scaffold, seeded RNG, GameClock, save system (Zod + migrations + IndexedDB).
- **Phase 1:** design tokens + motion system, the component kit (`src/components/ui/`), the
  hand-drawn icon family (since replaced — see post-1.0 below), the app shell (nav rail + HUD +
  place transitions), all 15 places
  routed as dressed placeholders, feature gates, `/dev/kit`, and save schema v2 (settings).

- **Phase 2:** the five classes as data, hero creation, the character screen (paperdoll,
  attribute training, derived stats, backpack), `generateItem`, and save schema v3 (hero).

- **Phase 3:** the combat engine — pure `fight()`, all five class procs, monster archetypes,
  golden logs and the balance harness (plus the rebalance it forced).

- **Phase 4:** the battle scene — `battleChoreo.ts` (every timing), the pure `timeline.ts`
  (log → schedule → frame), `useBattlePlayback`, the canvas particle layer, the result screen
  with typed loss hints from `engine/combat/analysis.ts`, `/dev/battle`, and save schema v4
  (persisted playback speed). Nothing in `src/engine/combat/` changed to render the log — as
  designed — but the phase did force a **tank archetype retune** (see balancing §5).

- **Phase 5:** the core loop — zones/monsters/blurbs as data, the seeded mission board, the
  accept → wait → resolve lifecycle, the Reset Engine (one owner for every daily boundary), drop
  tables, the Gilded Tankard screen with the fight mounted at the door, and save schema v5
  (activity). Two long-standing gaps closed here: new heroes now get a **starter kit** (an
  unarmed hero cannot win anything), and the low-level monster **jitter grace band** keeps a
  brand-new player's first missions winnable.

- **Phase 6:** the City Watch and the first economy simulation — `engine/patrol/` (a shift is
  three numbers and a level; earnings are *computed from the clock, never accumulated*),
  `state/patrolActions.ts`, the two-faced patrol screen, `engine/economy/simulate.ts` + 15 CI
  bands, `/dev/economy`, `GatedPlace` (gates enforced where a room renders, not only where the
  nav rail links), and save schema v6. The sim found the XP curve was ~10× too slow and, once
  fixed, that gear supply could not keep up — hence the weapon pity floor in `items/drops.ts`.

- **Phase 7:** commerce — `engine/shops/stock.ts` (day-seeded shelves with a *guaranteed* mix, so
  Bram always has a weapon), `engine/items/dispose.ts` (one path for sell + scrap that quotes
  before it acts), `engine/stables/mounts.ts` (7-day rentals; renewing extends, switching
  replaces), one `ShopScreen` serving both keepers, the Stables, economy sim pass 2, and save
  schema v7. Shop restock joined the Reset Engine rather than each shop checking the date.

- **Phase 8:** the 1,500 — `engine/world/` (`identity` derives everything from `(seed, botId)`
  so a `BotRecord` is only divergence; `generate`, `materialize`, `ladder` as the single
  authority over rank and honor, `simulate` with LoD bands, `rivals`, `crier`), the Town Crier
  board, the absence card, `/dev/world`, and save schema v8. Also fixed the autosave, which was
  losing writes once the save grew (see below).

- **Phase 9:** the player joins the ladder — `engine/arena/` (`arena` draw + threat reads,
  `duel` through the same `resolveLadderFight` the sim uses, `raids`, `payout`), the seat itself
  (`seatPlayer` at world-raise, which is what finally switched *rivals* on), `state/arenaActions.ts`,
  the Proving Grounds (duelling posters, the rank swap shown as sliding rungs, milestone stingers),
  the Hall of Fame's three tabs over a hand-rolled virtualized list, `engine/world/halls.ts`, and
  save schema v9. Three real bugs fell out of building it — see the CHANGELOG's Phase 9 *Fixed*.

- **Phase 10:** guilds — `engine/guilds/` (`membership` derives everything about one of the sixty
  from `(worldSeed, guildId, roster)`, so a hall stores nothing; `buffs`; `chat`; `bounty`),
  `data/guildChat.ts` (162 slotted templates) and `data/bounties.ts`, `state/guildActions.ts`,
  the two-faced Guild Hall, economy sim pass 3, and save schema v10. Building it forced two
  retunes of the *Phase 8* generator: it had never respected `GUILD_CAPACITY` (halls advertised
  "78/25 members"), and its seeded treasury predated `stepCost`, leaving all sixty on +1%.

- **Phase 11:** dungeons — `data/dungeons.ts` (three dungeons, thirty fixed-level floors, six
  boss signatures), three new `CombatProc` kinds in the resolver with their own events,
  `engine/dungeons/` (`floors`, `delve`, `keys`), `state/dungeonActions.ts`, the Undertavern with
  its torch-lit descent and floor-10 ceremony, and save schema v11.

- **Phase 12:** gear sets and the forge — `data/gearSets.ts` (ten sets, thirty bonuses declared as
  `SetEffect` data rather than thirty proc kinds), `engine/items/sets.ts` (the fold into one
  `CombatModifiers` bag, derived progress, the no-dupe draw), `engine/forge/`
  (`forgeConfig` + `craft`), `state/forgeActions.ts`, the Emberforge's three benches with the
  anvil-strike ceremony, the Set Collections tab with its paperdoll glow, and save schema v12.

- **Phase 13:** Fortune's Table — `data/banners.ts` (three banners over one seven-outcome table,
  the monthly track) and `data/vesnaBarks.ts`, `engine/gacha/` (`schedule` derives the whole
  rotation from `(date, seed, class)` and stores nothing; `roll`; `track`),
  `state/gachaActions.ts`, the room with its always-visible odds panel, public pity meter, tarot
  ceremony and history log, an economy-sim gacha faucet, and save schema v13.

- **Phase 14:** the Menagerie — `data/pets.ts` (twelve companions whose `source` is a closed union
  of the facts that earn them), `engine/pets/` (`ownership` derives who you have and stores
  nothing; `feeding`; `boost`; `eggs`), `state/petActions.ts`, the room with its twelve stalls,
  the character screen's companion chip, the nav rail's arrivals badge, economy sim pass 4, and
  save schema v14. It also closed a twelve-phase-old gap: gear `goldFind`/`xpBonus` had been
  computed by `deriveStats` since Phase 2 and applied to nothing.

- **Phase 15:** the daily loop — `data/progress.ts` (one vocabulary for everything the game
  counts), `data/dailyTasks.ts`, `data/calendar.ts`, `engine/board/` (`tasks` — a day-seeded,
  feature-aware, neglect-weighted draw; `chest`), `engine/calendar/`, **Reset Engine v2** with its
  ledger and its source audit, `state/progressActions.ts` as the single credit path,
  `boardActions` + `calendarActions`, the two-faced Notice Board, the reset-moment flourish, the
  out-of-Vigor wind-down, and save schema v15. Every room in Emberhollow is now built.

- **Phase 16:** onboarding — `data/tutorial.ts` (twelve beats as place + target + two sentences +
  a predicate) and `data/glossary.ts` (41 entries), `engine/tutorial/` (`beats` — the active beat
  *derived* as the first the save cannot prove; `hints`; `firstMission`), `state/tutorialActions.ts`,
  the spotlight (`components/tutorial/`), the three battle callouts, unlock toasts and the rail
  reveal, `components/ui/Term.tsx`, six one-time explainers, and save schema v16. It also added
  three facts the save could not previously answer — `missionsAccepted`, `missionsReturned`,
  `itemsEquipped` — because the beats needed them and nothing counted a contract *signed*.

- **Phase 17:** balancing, content fill and feel — the roster to plan volume (96 monsters, 124
  blurb definitions over 340 zone pairings), `data/sfx.ts` (24 cues as oscillator recipes) with
  `state/sfx.ts` and `state/bgm.ts`, the Settings screen, `scripts/tuning-pass.ts` and the
  balancing §16 record of all 68 `[TUNE]` markers, 90-day economy bands, `e2e/contrast.ts` +
  `e2e/a11y.spec.ts`, `scripts/perf-pass.mjs`, and a `sync-assets` step that transcodes the art.
  **Save schema unchanged at v16** — the only phase since Phase 1 with no migration, which is what
  a tuning phase should look like.

- **Phase 18:** release hardening and **1.0** — the v16 fixture and a census that makes a missing
  one impossible, corrupted-save triage, export/import (`state/persistence.ts` + `SavePanel`), the
  tab lock (`state/tabLock.ts`) and `RoomBoundary`, the credits screen and its licence audit,
  production headers and a CSP with no third-party origin and no `eval`, `engine/release/`
  (the §4 census, the onboarding harness) behind `npm run release`, and
  `e2e/regression.spec.ts` — thirteen steps over one save from the door to the day after.
  **Save schema unchanged at v16.**

**Shipped since 1.0** (no phase number; each is a self-contained slice on top of the release):

- **Three save slots** — Settings → Characters, plus a remembered active slot beside the saves.
- **The Town Map** — `data/townMap.ts` (hotspots as percentages of the painting, with a
  census test), the `map` place, `components/map/TownMapScreen.tsx`, and `/` redirecting to it.
  The rail keeps its job; both now read badges from `state/townSignals.ts`.
- **Our own tooltips** — `components/ui/Tooltip.tsx` + `state/tooltipStore.ts`. One element at
  shell level; `useTooltip()` at every trigger; **`title=` on a DOM element is banned** and
  `components/ui/tooltips.test.ts` reads the source to enforce it. Style guide §8.1.

- **The Long Road** — the campaign. `data/campaign.ts` (ten chapters of twelve stages, one per
  zone, with the boss table *solved* rather than chosen), `engine/campaign/` (`stages`, `push`),
  `state/campaignActions.ts`, `components/campaign/CampaignScreen.tsx`, the `campaign` place and
  its map hotspot, an economy faucet, and save schema **v17**. One Vigor a stage; a first clear
  pays once and everything after it is practice.

- **The icons are game-icons.net now** — 67 of 69, vendored under `game_assets/icons/<author>/`,
  mapped one reviewable line per id in `scripts/icon-map.mjs`, compiled to
  `src/components/icons/vendored.ts` by `npm run icons:sync`. Call sites did not change: same ids,
  same `<Icon name>`, same `currentColor`. Only the chevron (a direction, not a thing) and the
  Vigor tankard (a meter whose clip path is the mug) stay hand-drawn. **The licence is per icon**
  — CC BY 3.0 names the artist, so the author travels from the directory name into the module and
  on into CREDITS.md, and `components/icons/icons.test.ts` derives that table from disk rather
  than trusting it.

- **The day's work** — Vigor spent pays a Golden Die at 50/100/150, up to three.
  `engine/progression/dayWork.ts` (pure), `state/vigorActions.ts#spendVigor` (the *one* path both
  spenders go through), `components/ui/DayWorkTrack.tsx`, `shell/DayWorkWatcher.tsx`, and save
  schema **v18** (`activity.vigorSpentToday`). No high-water mark — the payout is a difference of
  two totals inside the update that spends the Vigor, which is `monthlyPaidThrough`'s shape one
  step further in. Balancing §18.

1,464 unit tests + 289 e2e green. **The game is feature-complete at 1.0.** Next work: whatever
the user picks from `ROADMAP.md` §Post-1.0, or the deploy, which is theirs to make.

**A `clip-path` clips its descendants — and this codebase has now shipped that bug twice.** Item
hover cards spent eighteen phases rendered inside their own gear cell, inside a `TavernPanel`,
which wears `chamfer-md`; every card was sliced off at the panel's edge and the e2e test asserting
one visible passed throughout. The rule was already written down after the town map's plaques and
it did not stop the second occasion, because the second occasion was *older code nobody re-read*.
So: when a lesson lands, grep for the shape rather than only fixing the instance. Anything that
overhangs its parent goes in a layer — `useHoverCard` now, beside `useTooltip`, sharing one owner
so a tooltip and a card can never both be open.

**More Vigor is faster levelling, and there is no design that avoids it.** The day's work makes
three Ale self-funding, which is +60% Vigor, which pulled level 55 from day 32 to day 22 and
failed §0's schedule. The fix was not a cleverer mechanism — it was choosing, out loud, between
the feature and a written-down schedule, and re-fitting §0. Before shipping anything that adds
Vigor, run `npm run pacing` *first*: the level rows are two-sided, so generosity fails them
exactly like stinginess, and the ripple reaches the pet ceiling, the road's length and the
casual-vs-active gap as well.

**"Every gate passed" is not "the artwork survived".** Rounding SVG coordinates to halve the icon
payload collapsed all 67 drawings into slivers, and typecheck, lint and the production build were
green the whole time — because path data is *compact*, and `10.5.75` is two numbers, so a
`\d+\.\d+` regex eats one and glues the remainder to the next. Nothing in this repo can see that
except a human looking at a picture. Two rules fell out: never rewrite path data with a regex (the
tool is a real parser), and any asset that passes through a transform gets an equality assertion
against its source, because "it compiled" says nothing about what came out.

**A default is a decision, and `useState(1)` is the easiest place to hide one.** The road's chapter
board held its chapter in state seeded at 1 and corrected it during render when the *reached*
chapter changed — the right pattern for following a boss's fall, and no help at all on arriving,
because on the first render nothing has changed. A player who reloaded twenty stages down the road
was shown chapter I with no stone on it to press. The fix was to stop storing the answer: the shown
chapter is `pinned ?? reached`, so the default is *absence* and clicking a numeral is the only
thing that pins one. When "state that follows a prop" has a meaningful value before any change has
happened, derive it and let the state hold only the override.

**A range asserted against one end of it is a band nobody wrote.** §0 states three of its six rows
as ranges — "Day 2–3", "~Week 2", "Day 45–60" — and `TARGET_DAYS` collapses each to its slow end,
which is right for a deadline and wrong for the early side of a schedule. Level 25 read as a 29%
miss for arriving on day 10, four days *into* the week §0 promised it in. `TARGET_EARLIEST` +
`windowDrift` measure the window; day 5 still fails, so nothing was loosened. This is
`MILESTONE_KIND` one step further in, and the same lesson: the semantics of a target belong in
data, because a semantic that lives in a comment gets rewritten by whoever is in a hurry.

**A simulated player has to be modelled making the choice, not taking the option.** The road's
first economy model walked every stage at or below the hero's level. At level 200 that spent the
whole day's Vigor on level-one stages and reported **zero missions** — not a balance finding, a
model that had never been asked what a player would do. A stage pays XP at `min(hero, stage)`, so
once you outrun the road it stops being income; the sim now walks while a stage's XP beats what the
same Vigor buys at the board, which is the comparison the player actually makes and needs no new
number. Watch for the same shape wherever a `PlayStyle` flag says *whether* rather than *how much*.

**Never manufacture waste in a model.** Taking two Vigor off the top for the road dropped a
hundred-Vigor day from five twenty-minute contracts to four and binned the other eighteen, which
reported the road as costing a fifth of the mission board. No player suffers that — the board
offers ten, twenty and thirty. Payout is linear in duration, so the day's last contract is
fractional now, the same convention `itemsBought` has used since Phase 7: the ledger is a rate, not
a shopping list.

**`Meter` labels and counts by default.** On a 0–1 share that renders "1 / 1" — both ends round to
one — under a line that has just said 62%. It appeared twice on one screen before anybody looked at
it, and no test can see it. Pass `showNumbers={false}` for any fractional meter, and *look at the
screen* (below).

**A dismissal has to cancel what is on its way, not just what is showing.** Clicking a button
re-renders the panel under a stationary cursor, so `pointerover` fires on whatever moved into that
spot and its hover timer starts. Press Escape in that window and the tooltip store empties — and
then the timer fires, and dismissing a tooltip has *produced* one, for something the player never
pointed at. Anything with an open-after-a-delay has this shape: the close path must reach the
pending timers too (`dismissTooltips()` walks a module-level set of them). Found by an e2e
assertion that Escape closes the rail's tooltip, which instead found a stat row the cursor had been
left sitting on after hero creation — the test was right for a reason it was not written for.

**Two ways to do the same thing means two places for a signal to go missing.** The nav rail and
the town map are the same list of places drawn as a list and as a picture, and a player who
navigates by one never sees a badge that only appears on the other. `state/townSignals.ts` is the
single answer both read, and `e2e/map.spec.ts` asserts they agree rather than asserting each. This
is the guild-bounty and forge-tile lesson for the third time: **never let a second surface hold its
own copy of a number.** The corollary is a design constraint, not just a code one — if a feature
puts a mark on the rail, it puts the same mark on the map, or the map is a worse way to play.

**A `clip-path` clips its descendants, and no test framework will tell you.** The map's hover
plaques were nested inside their hotspot buttons, which carry `chamfer-sm` — so every plaque was
cut off at the edge of its own building and never rendered a visible pixel. The e2e test asserting
one was visible **passed the entire time**: `toBeVisible` knows `display`, `visibility`, `opacity`
and box size, and nothing about clipping; `boundingBox()` is no better. A screenshot found it.
Anything that deliberately overhangs its parent — a tooltip, a plaque, a badge pinned outside a
box — belongs in a *layer*, not inside the thing it describes. And when the invariant is one the
framework cannot see, assert it directly: the spec now walks the plaque's ancestors and fails on a
`clip-path`.

**Look at the screen.** Both of the above were found by taking a screenshot and reading it, after
the whole suite was green. A visual feature is not done when its tests pass; it is done when
somebody has looked at it.

**A guard that delays a load has to gate the render too.** The tab-lock election put 350ms in
front of `hydrate()`, and `AppShell` kept drawing the town over a store still at `status: 'idle'` —
so Settings offered "Export this save" against `save === null` and a fast click produced a file
holding the *previous* session. The window had existed since Phase 1 and was two milliseconds
wide, so nobody ever saw it; adding a deliberate delay in front of the load turned an invisible
race into a dependable bug. The shell paints nothing until the save is real, and
`e2e/resilience.spec.ts` samples every frame for "a room exists and the store is not ready" —
an invariant, not an ordering, because polling cannot tell you which of two things happened first
when both flip in one tick.

**An element on its way out is still an element.** `AnimatePresence mode="wait"` keeps the
outgoing child mounted, and mounted means clickable. Keying the tutorial chip on
`${beat.id}:${folded ? 'folded' : 'away'}` made a label change an exit plus a re-entrance, and for
a couple of hundred milliseconds the chip a player saw was the old one, running a closure that had
nothing to do. Two rules, for every presence-animated control: **key on identity, not on state**,
and **read the store in the handler, not the closure**.

**`immutable` is a promise about the URL, not about the bytes.** `/_next/static/*` earns it —
content hash in the filename. `/assets/*` does not: 506 files at authored paths that
`sync-assets.mjs` rewrites in place, so a year of `immutable` would pin a superseded painting in a
returning player's browser with no URL that could reach past it. Also: never restate a header
Next already sets. `e2e/headers.spec.ts` asserts Next's value instead of mirroring it.

**A CSP that forbids `eval` took a code change, not a config one.** Zod 4 feature-detects its JIT
with `Function("")` in a try/catch — caught, degraded correctly, and *still reported* as a
violation on every load. `schema.ts` declares `jitless`, which costs 0.96 ms on a 175 KB save and
is the difference between a policy that forbids eval and one that watches it fail. The general
form: a permanent, harmless violation is worse than none, because it teaches you to ignore the
report.

**Object key order is not a data model.** Item stat lines rendered in `Object.entries` order —
insertion order for a freshly generated item, schema order for one read back through Zod. Those
agreed by accident until the parser went interpreted, and the Armory's shelf started re-ordering
"Luck / Intelligence" across a reload, failing a test about *restocking*. `statLines()` uses
`ATTRIBUTE_IDS`, the order the rest of the game already shows.

**`fromLevel` must never go backwards down `BEATS`.** `activeBeat` *stops* at a beat gated above
the hero rather than skipping it — deliberately, so the curriculum cannot jump ahead — which makes
a level-4 beat placed before two level-3 ones a total silence, not a reordering. A level-3 player
who finished the Notice Board beat got no guidance at all until they hit four, with two rooms open
and unmentioned. Asserted now in `engine/release/onboarding.test.ts`.

**An effect keyed on one record is blind to its siblings.** The Characters shelf re-read the disk
whenever the *active* save changed — its slot, its `savedAt`, the load status — which is every
change except the one that matters: deleting a character you are not playing. Their name stayed on
screen until something unrelated nudged the component. Whatever performs a change outside the
watched record has to say so; there is no dependency array that covers "a sibling moved".

**Run the gate, not the files you touched.** `npm run format:check` — a CI step since Phase 0 —
had been failing since **Phase 8**, on 31 files, because every phase ran `prettier --check` over
its own diff and called it green. Nobody saw it, because nobody ran the command CI runs. Before
claiming a gate passes, run *the gate*: `npm run verify` and `npm run format:check`, whole-tree,
not the subset you happen to have open. (And `src/engine/save/fixtures/` is Prettier-ignored now:
a captured save is evidence, not source, and reformatting it is a change the next capture undoes.)

**A release definition is executable or it is a mood.** `npm run release` runs GDD §7 line by
line: `engine/release/checklist.ts` gives each §4 feature its spec, engine, screens, tests and its
**named animated moment**, and `release.test.ts` parses the GDD's own table so the two cannot
drift in either direction. The gate that cannot be automated — fps on real hardware — prints as
*yours* rather than being quietly dropped, because a checklist that lists only the checkable parts
is how a requirement stops being one without anybody deciding.

**An audit that inspects one element is worse than no audit.** `axe-core` reported zero contrast
violations on the tavern — out of **one** node it could resolve, because it gives up (honestly, as
`incomplete`) at a `background-image` and every room in Emberhollow has one. `e2e/contrast.ts`
reads real pixels instead: hide every glyph, screenshot, sample the band each text run occupies.
That found 500+ failures. Before trusting a green audit, ask what it *inspected* — `textRunCount`
and the planted-failure test exist so this one can answer.

**A simulation can tell the "cap the game cannot supply" lie too.** §0 promised a full gear set in
45–60 days; the sim said 125 and blamed the gacha. It had also *excluded the forge*, on the
reasoning that folding in a deterministic craft would flatter the number — while the forge route
was itself priced at ~210 days, because a recipe costs 2 Starmetal and the only source paid an
average of half of one. Neither was visible without costing the other. A measurement you declined
to take is not a pessimistic estimate; it is an unexamined one.

**A pacing milestone is a schedule or a deadline, and it matters which.** Level 55 on day 5 is as
wrong as day 90 — a content gate is two-sided. "1–2 set pieces *by* day 30" is not: arriving early
is the game being generous. Two rows were failing a two-sided band while describing a game that
over-delivers by three weeks. `MILESTONE_KIND` makes the distinction explicit and
`pacing.test.ts` asserts the distinction itself, because a semantic that lives only in a comment
gets rewritten by whoever is in a hurry.

**A value the timeline already computed goes in `style`, never `animate`.** The fighter's lunge
offset sat in Motion's `animate`, asking it to start a tween toward a target that changed again on
the next frame — sixty times a second, for two fighters — with a `transition` object whose
identity swapped every tick, so each tween tore down the last. `animate` is for state changes.
And `filter` is the most expensive property Motion can touch: the knockout desaturation is a CSS
transition.

**Every text colour belongs to a surface.** Emberhollow is dark timber with one light surface —
parchment (keeper barks, duelling posters, the tutorial card). `blood`/`moss`/`ember` therefore
come in pairs: a `-400` for timber, a `-600`/`-700` for parchment, and the `-500`/`-600` fills
stay fills. Using the wrong half is the single easiest way to put a contrast failure back. Muted
parchment text has a floor of `/72` and there is no tier below it (style guide §10).

**A derived cursor demands monotone predicates.** The tutorial's active beat is the first of twelve
the save cannot prove happened — no stored position, so a mid-beat reload resumes for free and two
tabs cannot desync. The price is absolute: a predicate that can go back to false drags the whole
tour backwards. Beat 4 first read "are your bags empty?", and beat 7 asks the player to *hold* loot
for Bram — beat 4 would have reactivated every time they did what beat 7 asked, and beat 8 was
unreachable. Read lifetime counters and acknowledgements, never present state.
`engine/tutorial/tutorial.test.ts` replays a playthrough and fails if the finished count ever falls.

**A tutorial card that floats over the page will land on somebody's button.** The spotlight only
renders when it has a hole to draw around; every other state — wrong room, target not mounted,
pushed aside — speaks from a chip in the HUD. The version that floated a card bottom-centre "when
there was nothing to point at" sat on Vesna's roll buttons and failed three Fortune's Table e2e
tests with *subtree intercepts pointer events*. Anchoring the only page-level element to a real
measured target makes that unrepresentable rather than merely unlikely. (The layer is otherwise
`pointer-events-none`: the dim is a look, not a modal, and every control stays live.)

**A dungeon floor's difficulty is level *and* archetype, and archetype is worth more than you
think.** Twelve levels of spread at dungeon budget — swarm 27, caster 32, skirmisher 34, bruiser
38, tank 39 against a level-40 monster — which is more than the level curve gains across six
floors. Pick a new floor's archetype on flavour alone and the dungeon will get easier somewhere
in the middle. `engine/dungeons/dungeons.test.ts` measures the whole ramp and fails on a dip.

**A day-keyed roll is reproducible, which is the opposite of idempotent.** Four high-water marks
now exist for this one bug — `arena.lastRaidDay`, `guild.lastApplicantDay`, `lastChatDay`,
`lastBountyDay`. If you add anything seeded by a day index whose *effect* is applied to the save,
it needs a fifth. The tell is that it looks right on first load and doubles on reload.

**Guild bounty numbers are two-sided.** `HALL_EFFORT` (what the hall manages alone) is tuned
against the bounty targets in `data/bounties.ts`, and `simulateBotContribution` reads those
targets directly rather than keeping its own copy — which it did, briefly, until the two
disagreed and the hall contributed nothing. Whole-number metrics round *stochastically*; flooring
a member's 0.27 arena wins a day takes an entire hall to zero. `guilds.test.ts` asserts the band.

**Two arena rules that look like tidiness and are not.** A day's raid is seeded by its day index,
so re-running it replays the same fight *and re-applies the honor loss* — `arena.lastRaidDay` is
what stops a page reload being an attack. And the attack band is asymmetric (60 rungs up, 15
down), so `attackableRanks` (who I can reach) and `attackersOf` (who can reach me) are genuinely
different functions; using one for the other is a mistake that reads as correct.

**The autosave is serialised and coalescing** (`gameStore.ts`). It was parallel with a guard that
protected the store but not the disk; at 145 KB an older write landed last and ate a level. If
you add a store action, `void persistNow()` is still correct — the queue handles the rest.

**Anything that mutates then navigates must flush.** e2e helpers call `store.getState().flush()`
before `page.reload()` or `page.goto()`, because the suite does in microseconds what a player
does in seconds. A test that reloads without flushing is racing its own write.

**A set bonus is data, and the resolver reads a bag.** Thirty bonuses across ten sets would be
thirty branches in `fight()`; instead each is a list of named `SetEffect` levers that
`modifiersFor()` folds into one `CombatModifiers` object at build time. Adding an eleventh set is
a change to `data/gearSets.ts` alone — only a genuinely new *mechanic* costs engine work. If you
add a lever, it needs a fold case, a read in `fight()`, and a test that proves it fires; the
suite has one per five-piece capstone for exactly that reason.

**The forge tile and the forge dice must be the same object.** `forgeOdds()` and
`rollForgeRarity()` both read `FORGE_TIER_DEFS`, which is what makes "odds always visible" (rule 6)
true rather than merely intended. Never let a screen hold a second copy of a rate — the guild
bounty already taught this lesson once, from the other direction.

**A rotating banner is a pure function of the calendar, not a stored schedule.**
`engine/gacha/schedule.ts` derives all three banners from `(dayKey, worldSeed, classId)` and keys
each seed on its *period* (the day, the week's Monday, the month) rather than the day — a weekly
banner seeded by the day re-rolls every morning. Nothing stores or advances it, which keeps the
Reset Engine the only thing that decides it is tomorrow. Pet ownership (Phase 14) is the same
idea one step further: derived from the *save's own history* rather than from the calendar.

**The gacha's pity counter follows the set, not the week** (`gacha.weeklyPitySet`). Rolls banked
toward Oathsworn survive a Wolfblood week — but `pityFor()` reports **zero** on a week that will
not honour them, because a meter reading 12/20 under a card that cannot pay it is a lie told for
six days. The two behaviours look contradictory and are both required.

**Eight day-or-count-keyed high-water marks now exist** — `arena.lastRaidDay`,
`guild.lastApplicantDay`, `lastChatDay`, `lastBountyDay`, `gacha.monthlyPaidThrough`,
`calendar.lastStampedDay`, `tasks.lastChestDay` and `tasks.lastWeeklyChestWeek`.
`gacha.monthlyPaidThrough` is denominated in *rolls*, not rungs, and is the shape to copy: rungs are
`floor(rolls / 15)` arithmetic on totals rather than an increment on a boundary, so replaying it
cannot double-pay.

**Don't store what the save can already answer.** `engine/pets/ownership.ts` keeps no list of who
you have; it reads the floors you cleared, the contracts you won and the rank you held. That is
why a Phase 11 player owns their dungeon pets the day the room opens — no migration, no
reconciliation pass, and nothing that can disagree with the history that produced it. The price
is that *granting* a pet means making its source true, which is why the two luck-based ones
(`pets.eggs`, `gacha.pets`) are stored: for a 0.5% roll the luck **is** the fact. Before adding a
`somethingOwned: string[]`, check whether the thing that earned it is already written down.

**Two counters that mean the same thing must be counted the same way.** `activity.zoneMissions`
shipped counting *attempts* while `activity.missionsCompleted` counted *victories* — which quietly
made the Wisp of the Chapel's forty-at-one-zone gate easier than the Tankard Imp's hundred-
anywhere. Any new progress counter that sits beside an existing one inherits its units, or it is
a balance bug wearing a plausible name. The converse also holds: `missionsAccepted`,
`missionsReturned` and `missions` are three counters over *one contract's lifecycle* and that is
fine, because signing, coming home and winning are three different events the tutorial has to
point at separately. Three names for one event is the bug; three events is a vocabulary.

**There is one vocabulary for what the game counts, and one path to credit it.**
`data/progress.ts` owns `ProgressMetric`; the guild bounty and the Notice Board each narrow it to
a subset, and `state/progressActions.ts#credit` is the only way a player action becomes a number.
This is the third occasion of the lesson above, and the fix was structural rather than careful:
when Phase 15 unified them it found that `itemsScrapped` and `levelsGained` — two of six bounty
metrics — had **never been credited from the player's side at all.** If you add a metric, credit
it at the one place the action happens; if you add a consumer, edit `credit()`.

**Every daily boundary goes through one walk, and a test reads the source to prove it.**
`engine/reset/audit.test.ts` asserts that `processResets` has one caller, that every
`refresh<Feature>Day` is called only from `refreshDay`, and that no screen compares a stored day
key against today. Behaviour cannot catch two features that each decide it is tomorrow — they
both work in isolation and drift at midnight, in production. If you add a feature with midnight
work, it gets a `refresh<X>Day` and a line in `refreshDay`, and the audit will tell you if it
does not.

**A pause is a shape, not a branch.** The login calendar's state is `{ day, lastStampedDay,
cyclesCompleted }` — a *count of days attended*, with no streak field — which is why "missing a
day pauses rather than resets" has no code that could get it wrong. When a rule is about *not*
doing something, prefer a state that cannot express the thing.

**A cap the game cannot supply is a lie on the screen.** The Menagerie advertised "3/3 feeds left"
against a Scrap drop rate that funded 0.8 feeds a day — a ceiling no player could ever reach, and
a pet that took two months rather than the month the spec claimed. `npm run economy` found it; the
band in `economy.test.ts` now measures **days to grow one companion**, not the cap. When you
publish a rate limit, make the sim prove the supply can approach it.

**Before touching class constants or monster archetypes:** run `npm run balance`. The numbers in
`src/data/classes.ts` were solved for, not chosen, and the bands in
`src/engine/combat/balance.test.ts` will catch a regression — but the harness tells you *why*.
Archetypes carry a second constraint that the harness does *not* check: a median fight against an
on-curve hero should stay under ~12 rounds. `src/components/battle/timeline.test.ts` catches it
from the pacing side.

**"On curve" means gear *and* training.** `buildReferenceCombatant` models a player who both
equips their drops and spends gold on attributes. A test hero with perfect gear and untouched
attributes sits well under the line the monsters are built against — that mistake cost an hour in
Phase 5. When you need a realistic hero, prefer the playthrough-shaped test in
`src/engine/missions/missions.test.ts` over a hand-built one at a flattering level.

## Where things live (as built)

`src/engine/` pure logic — `rng`, `clock`, `save/` (schema + migrations), `progression/`
(xp, stats, gates, rewards), `items/` (types, generate, drops, dispose, sets, starterKit), `hero/`
(actions, derived), `combat/`, `missions/` (board, lifecycle), `patrol/`, `shops/`, `stables/`,
`world/` (identity, generate, materialize, ladder, simulate, rivals, crier, halls), `arena/`
(arena, duel, raids, payout), `guilds/` (membership, buffs, chat, bounty),
`dungeons/` (floors, delve, keys), `forge/` (forgeConfig, craft),
`gacha/` (schedule, roll, track), `pets/` (ownership, feeding, boost, eggs),
`board/` (tasks, chest), `calendar/`, `campaign/` (stages, push), `tutorial/`
(beats, hints, firstMission), `economy/`, `pacing/` (the §0 ladder),
`reset/` (resetEngine + the one-owner audit) ·
`src/data/` content — places, townMap, classes, itemBases, icons, zones, monsters, blurbs, barks,
patrolLog, mounts, shopBarks, arenaBarks, forgeBarks, vesnaBarks, names, guilds, guildChat,
bounties, dungeons, campaign, gearSets, banners, pets, progress, dailyTasks, calendar, legends,
crierTemplates, tutorial, glossary, sfx ·
`src/state/` stores + persistence (three save slots + the remembered active one) + the shared
clock + the audio singletons (`sfx`, `bgm`) + `townSignals` (the badges the rail and the map
both read) + `tooltipStore` (the one tooltip) ·
`src/components/{ui,shell,map,icons,items,hero,battle,tavern,patrol,shops,stables,world,arena,guild,dungeons,campaign,forge,gacha,pets,board,tutorial,settings}/` ·
`src/app/(game)/<place>/` one route per place, `/` redirecting to `/map` · `src/styles/motion.ts`
springs.
Dev harnesses: `/dev/kit` (every component state), `/dev/combat` (every roll), `/dev/battle`
(the scene), `/dev/economy` (the faucet/sink ledger the CI sim asserts), `/dev/world` (the ladder,
the level histogram and the Crier's output from any seed). The character screen's dev drawer
conjures any combination of gear, levels and gold on demand.

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
- Commands: `npm run dev` / `build` / `test` / `test:e2e` / `lint` / `typecheck` / `format` /
  `verify` (typecheck → lint → test → build) / `balance` (combat harness) / `economy` (economy
  sim) / `pacing` (the §0 ladder) / `tuning` (the `[TUNE]` inventory + 90-day ledger) /
  `perf` (Lighthouse + bundle + main-thread cost, needs a server on :3100) /
  `release` (the GDD §7 definition, line by line) / `assets:sync` / `icons:sync`
  — keep this list current as scripts appear.

## Canon quick-reference (avoid re-deciding)

Realm **Aldenvale**, town **Emberhollow**, tavern **the Gilded Tankard**. Classes: Warrior, Bard,
Mage, Hunter, Swashbuckler. Currencies: Gold, **Golden Dice** (premium, earn-only), Honor,
materials (Scrap/Essence/Starmetal), dungeon keys, Vigor (100/day). Places: Tavern, Character,
Notice Board, Patrol, Armory, Gilded Facet, Emberforge, Stables, Menagerie, Proving Grounds,
Hall of Fame, Guild Hall, Undertavern, Fortune's Table. Keepers: Marla (tavern), Bram (armory),
Sela (jeweler), Torvald (forge), Odo (stables), Hildy (guard/arena), Madame Vesna (gacha).
World: 1,500 simulated heroes, 60 guilds, top-10 named legends, 2–3 active rivals.
