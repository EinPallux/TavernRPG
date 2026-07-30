# Changelog

All notable changes to TavernRPG are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[SemVer](https://semver.org/) once code exists (0.x during development, 1.0.0 at release —
see `ROADMAP.md` phase gates).

## [Unreleased]

### Added — Phase 7: Shops & Stables
- **The Armory and the Gilded Facet are open.** Six pieces on the shelf every morning, drawn from
  the day's seed. Bram always has a weapon and an offhand for your class plus three armour
  pieces; Sela always has two rings, two amulets and a trinket. Only the sixth slot is a
  wildcard — a shop that *might* have nothing you can use is a shop you learn to skip.
- **The shelf answers the question you walked in with.** Every card shows what it would do to
  your hero against what you are wearing, on the card rather than behind a hover.
- **Buying is a splurge, selling is income** — 3.2× value out, 100% of value back. Sold slots
  leave a wrapped parcel in the gap so the shelf does not reflow under your cursor, and the
  restock clock says exactly how long until Bram unpacks the next cart.
- **A fresh shelf costs a Golden Die**, with no free one. The mission board gets a free daily
  reroll because the day's *work* must always be there; a shop shelf is a convenience.
- **One way to get rid of an item** (`disposeItem`), shared by both keepers and, later, the
  forge. Junk goes with a click; a Rare or an Epic asks once; a locked piece is refused; and a
  Set piece is not merchandise at any price. The service quotes before it acts, so the confirm
  you see is the rule the engine enforces rather than a screen's opinion.
- **The Wandering Stables.** Four stalls, seven-day rentals, one at a time: Pack Mule −10%,
  Dappled Courser −20%, Armoured Warhorse −30%, and the Royal Griffin at −50% for six earned
  Golden Dice. Each stall shows what it does to a mission in minutes, not percentages.
- **A mount shortens the road and nothing else** — mission timers only, never Vigor, never
  rewards, never patrol. It rides on the HUD beside whatever is running and beside the mission
  timer itself, and pulses in its last day.
- **Renewing extends, switching replaces.** Paying for the mount you already have adds a week to
  the week you have left rather than throwing it away; taking a different animal forfeits the
  remainder and says how many days that is before you confirm.
- **Save schema v7** carries both shelves and the stall, with a v6 fixture caught mid-shift.
- The economy simulation now models shop purchases, mount upkeep and loot sales, and
  `/dev/economy` shows them per day.

### Changed — Phase 7
- Shop restock joins the Reset Engine rather than each shop checking the date. A shop that
  notices its own stored day is yesterday's is exactly the second clock that module exists to
  prevent.
- The top HUD's mount chip is real rather than a preview value, and the mission card names the
  animal that shortened the road.

### Added — Phase 6: Patrol & Economy Pass 1
- **The City Watch is open.** Sign on for 1–12 hours with Hildy, watch the lantern move along the
  route, and clock off for the pay. It is the "I'm done for today" button: a floor under a bad
  day, deliberately the worse deal so it never becomes the optimal way to play.
- **A shift is time, not a session.** What it has earned is computed from the clock rather than
  accumulated by a ticker, so closing the tab for six hours works with no background timer, and a
  rewound device clock cannot mint gold. Reload mid-shift, come back tomorrow — the numbers are
  the same either way.
- **Walk off early and you are paid for what you walked**, pro-rated to the minute, with a report
  that says so. Collecting and cancelling are literally the same call, so an abandoned shift can
  never be paid by different rules than a completed one.
- **The shift report**: hours signed off, the pay counted out, and a few lines from the beat. The
  night lines only appear on shifts long enough to have a night in them, and a longer shift tells
  more of the story.
- **One place at a time.** A hero on the beat cannot take a job and a hero on a job cannot sign
  on — enforced in the engine, so it holds for every caller and not just for the button that
  happens to check. A mission waiting to be watched counts as still out.
- **The economy simulation** (`engine/economy/simulate.ts`) plays modeled days through the real
  reward curves and records every coin in and out. 15 CI bands cover pacing, the "always slightly
  broke" purse and patrol staying the fallback; `/dev/economy` shows the same ledger day by day.
  It models only what exists — shops and mounts join as they ship.
- **Save schema v6** carries the shift, with a v5 fixture caught mid-mission.

### Changed — Phase 6
- **Levelling was about ten times too slow, and now is not.** `xpPerVigor` divided by a flat 320,
  which makes levels-per-day *constant* — the hundredth level costing exactly as much play as the
  second — and put level 10, where the last feature gate opens, on day 29 against a target of day
  2–3. It is now a curve (`28 + 1.2L`): level 10 on day 4, 25 on day 11, 55 on day 34. Reaching
  100 still arrives well ahead of its target; that needs a deceleration no single divisor gives,
  and is flagged for the Phase 17 balance pass with the sim measuring it every build.
- **Gear now keeps up with levelling.** Faster levels exposed a supply problem the slow curve was
  hiding: a level-13 hero still swinging their level-1 starter weapon, win-rate sliding from 100%
  to 40%. Drops are slot-weighted toward weapons, and carry a **pity floor** — five levels behind
  and the next drop is a weapon. Pity decides what a drop is, never whether one happens. Shops
  (Phase 7) are the real fix.
- Feature gates are enforced where a room renders, not only where the nav rail links to it. That
  was fine while every locked place was a placeholder; the watch house pays real gold, and
  `/patrol` was reachable at level 1 by typing the URL.

### Fixed — Phase 6
- Two Phase 5 tests were asserting a fiction. The "playthrough" hero never spent gold on
  attributes and only equipped into empty slots, and `isUpgrade` ignored weapon damage entirely —
  so a strictly better weapon stayed in the backpack, and the losses that followed read as a
  balance problem rather than a test bug.

### Added — Phase 5: Tavern & Missions (the core loop)
- **The loop is playable**: accept a job → wait out a real timer → watch the fight → take the
  loot → spend it on training → go again. The Gilded Tankard is a real screen now, not a dressed
  placeholder.
- **The quest table**: three seeded jobs a day, each with its zone art, a posting written by
  somebody in the world, the foe, a length picker (5/10/15/20 min) that moves the rewards as you
  choose it, and the **drop odds printed on the card** — read from the same table the roll obeys,
  so they cannot drift apart.
- **Vigor** (100/day) with a real tankard in the HUD, Ale from Marla (3/day cap, raises the
  ceiling rather than overflowing it), and a mission timer chip that becomes "your hero is back".
- **Missions never auto-resolve.** A timer that expires while the tab is closed leaves the fight
  waiting at the door — the battle is the payoff, and resolving it in the background would hand
  the player a result they never got to watch.
- **The outcome is committed at accept.** Reloading mid-timer, closing the tab for a day, or
  rewatching cannot change what a mission pays. The timer is two timestamps in the save.
- **The Reset Engine** owns every daily boundary in one place — no feature checks the clock
  itself. Missed days are walked in order (nine days away is nine boundaries but still one day of
  Vigor), and day *keys* are compared rather than elapsed hours, so DST is a non-event.
- **Content**: 10 zones with overlapping level bands, 64 mission monsters (full rosters for the
  bands this phase ships, levels 1–36), 24 parameterised mission blurbs, and Marla's barks.
- **Save schema v5** adds the activity slice, with a migration and a captured v4 fixture.
- Golden Dice sinks arrive with their faucets: board reroll (free once daily, then a die) and
  calling the hero back early.

### Changed — Phase 5
- **New heroes start in a kit.** `createHero` granted nothing at all, which was invisible while
  there was nothing to fight and fatal the moment there was: an unarmed hero swings for 1–2 and
  loses to the gentlest thing in the woods. A seeded common weapon and chest now go straight onto
  the body.
- **Monster level jitter no longer rounds upward below level 5.** Plus-two levels is a rounding
  error at 40 and a different game at 1; a brand-new hero was losing about a fifth of their first
  missions. Measured: the opening hours went from ~80% to ~99%, with nothing past level 5 touched.
- **Zone backdrops were remapped to the art that actually depicts them.** The content-plan table
  numbered the files sight unseen, which put a tropical shipwreck behind "Whispering Woods" and a
  flower meadow behind the marsh.
- **Rewards are banked when the fight ends, not when it starts.** Claiming on the way in lit up
  the HUD with the gold before the first sword was drawn, spoiling the scene it exists to tell.
  Nothing is lost by waiting: the mission stays pending until claimed.
- Battle fighters are laid out within a capped width so they read as a duel rather than as two
  portraits at opposite ends of a landscape, and a monster without art now shows a lit archetype
  card instead of a near-black hole.
- `goldPerVigor`'s worked examples in balancing §2 were wrong (L25 said 311; it is 278) and are
  now asserted by tests.

### Fixed — Phase 5
- `claimMission` paid out again if called twice with the same mission — a double-clicked Continue
  button, or a component mounting twice, would have paid the player twice. It now refuses
  anything that is not the currently pending mission.

### Added — Phase 4: Battle Scene
- **The battle scene** (`src/components/battle/`) — the Phase 3 log, choreographed. Fighters slide
  in behind a backdrop push-in, attackers lunge, hits throw Kenney particles from a pooled canvas,
  damage numbers float (crits at ×1.6, gold), health bars chip instantly with a ghost trail
  draining behind, big hits shake the stage, and the loser desaturates and falls.
- **Every `BattleEvent` type has its own presentation**: blocks, dodges and misses each get a
  distinct plate; Bard verses fly a ribbon; a Flurry's second hit lands quicker than the swing
  that set it up.
- **`battleChoreo.ts`** holds every timing in the fight, so pacing can be retuned without touching
  a single rule — and a balance change can never accidentally alter pacing.
- **`timeline.ts`** turns a log into a schedule as a *pure* function, and `frameAt(t)` derives the
  whole picture at any moment. That is what makes skip, replay and speed changes free, and it puts
  the hard part of animation under unit test without rendering anything.
- **Adaptive pacing.** A fixed pace cannot serve both a 3-round and a 20-round fight, so the
  exchange compresses toward the 8-second target while the entrance, the knockout, the closing
  beat and every *impact frame* keep their authored length. Measured across every class ×
  archetype × level band: median 4.8s, p99 8.0s, worst case 8.7s.
- **Result screen** with cascading reward lines, a rarity-revealed loot card, the "closest moment"
  stat, and — after a loss — a reason hint that names something the player can actually change.
- **`engine/combat/analysis.ts`** reads a log back into counts, closest-moment figures and ranked
  typed hint codes. The arithmetic is engine work and tested; the wording is UI work.
- **Reduced motion** keeps every beat and every plate, dropping only anticipation, shake,
  slow-motion and the particle canvas — the fight stays followable, it just stops performing.
- **Save schema v4**: battle speed and skip preference persist, with a migration and a captured v3
  fixture (a real geared hero) added to the regression set.
- **`/dev/battle`** stages any matchup at any level and reports the run time against the target.
- Tests: 44 new unit tests (timeline, analysis, scene render, store), a fuzz pass that scrubs every
  class × archetype × level fight frame by frame, and 11 e2e covering playback, skip, replay,
  speed, the result screen, reduced motion and the no-rounded-corners rule.

### Changed — Phase 4
- **The tank archetype was retuned** (hp ×5.0 → ×3.2, armour ×1.5 → ×1.2, damage-reduction cap
  0.45 → 0.30, block 20% → 15%, damage ×0.75 → ×1.2). It stacked four defences and produced
  23-round average fights the hero still won 99.7% of the time — a wall you cannot lose to is not
  tension, it is a wait. Now ~11 rounds, still comfortably the beefiest thing in a zone, and now
  hitting hard enough to be worth respecting. Mission win rates stay inside the ≥97% floor.
  *Fight length is now written down as a balance constraint, not just a presentation one.*
- The `swashbuckler vs dungeon boss` golden log was regenerated to match (19 rounds → 11).

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
