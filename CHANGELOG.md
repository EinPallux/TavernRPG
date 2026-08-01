# Changelog

All notable changes to TavernRPG are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[SemVer](https://semver.org/) once code exists (0.x during development, 1.0.0 at release —
see `ROADMAP.md` phase gates).

## [Unreleased]

### Added — schools of arms

- **Every fighter's blows look like their own now.** `data/combatVfx.ts` gives each of the ten
  `kind` values — five classes, five archetypes — a **school**: what gathers before the blow, what
  crosses the gap, what happens where it lands, and in what colour. Combat spec §4 has asked for
  "magic flare per class" since Phase 4 and what shipped was two sprite lists, so a Mage's bolt and
  a Tank's shoulder-charge were the same twelve orange specks.
- **Spells and arrows cross the stage.** A school that does not close the distance braces, gathers
  its cast, and sends something over the gap that lands on the exact frame the damage does. A cast
  gets its own wind-up (300ms against a swing's 100) because at the melee timing the bolt existed
  for six frames.
- **The player's magic is teal and the monsters' is red** — deliberate, and asserted. Two bolts of
  the same shape crossing the same gap, and at ×4 the colour is the only thing that says which way
  the damage is going.
- **A blow now moves the fighter it lands on**: a white flash and a shove away from the impact,
  scaled by how much it took off them and capped so an execute cannot throw a portrait out of its
  column. Before this, twenty rounds could pass with nothing moving but the numbers.
- **The dodge sidesteps and leaves an afterimage**, and the block flashes the shield — both written
  into spec §4 in Phase 4, both previously just a word on a plate.
- **A crit blooms.** `critHold` has paused the fight on a critical hit since Phase 4 with nothing
  on screen marking the pause, so the extra 140ms read as a dropped frame rather than as emphasis.
- Two new sound cues, `cast` and `proc`, for two moments that were silent. Reusing a near-enough
  cue is the mistake `useBattleSfx` already carries a note about.
- `/dev/battle` gained a **Boss + sets** toggle, because two of the features below had no way of
  appearing on the harness — and a harness that cannot show a feature is how a feature stays
  broken.

### Fixed — two features that were invisible in the shipped game

- **Set bonuses drew nothing.** `set_proc` has been in the battle log since Phase 12 and has had a
  *beat on the timeline* since Phase 12 — `beatDuration` gave it a moment and `frameAt` had no case
  for it. All eight effects occupied time and rendered nothing, so a five-piece capstone firing was
  a 220ms pause. They are named flourishes in the effect's own colour now, beside the fighter they
  fired for, exactly as gear-sets §3 has always described.
- **Hardening drew nothing.** Same shape, one phase older: `harden` reached the frame in Phase 11
  and no component ever read it, so Vulkarr cooling into his own armour was a fight that silently
  got harder. It is plating on the portrait now, and it thickens.
- **The damage numbers and the particles disagreed about where the fighters were standing** — 28%
  and 72% in one file, 30% and 70% in another, both hard-coded and both wrong at any width where
  the fighter row's `max-w-5xl` cap bites. Every burst on a wide monitor bloomed in open air beside
  the fighter it belonged to. Both read measured anchors now.
- **Three shop e2e tests reloaded before their write reached disk.** One of them flaked in a
  full-suite run and passed alone, which is the signature exactly: `stock-sold-2` being visible
  proves the *store* took the purchase, never that IndexedDB did. The file already had the `flush`
  helper and already used it twice — "anything that mutates then navigates must flush" is a
  CLAUDE.md rule, and these three were the ones that had not been told.

### Added — the greenhorn's due

- **Emberhollow pays a new hero over the odds.** ×1.6 on contract gold and XP at level 1, sliding
  to ×1 by level 25. A 20-minute contract used to hand a level-1 hero 46% of a level after twenty
  real minutes of waiting; it hands them 74% now, and 48% at level 10 where it used to be 35%.
- **The first fortnight has a shape it did not have.** `vigorPerLevel` already curved, but only
  from 2.3 levels per hundred Vigor to 1.55 across the whole of onboarding — two contracts a level
  at level one and a shade over two at fifteen, which reads as no curve at all. It now runs 3.68
  down to 1.94 over the same span, and a player can feel that without being told.
- **Gold and XP move by the same factor, which is the whole safety argument.** Gold per *level* is
  unchanged, so a hero arrives at level 20 with the attributes they always would have had and the
  power curve is untouched — only the clock moved. Boosting XP alone would have levelled new
  players into monsters they could not afford to fight.
- Concentrated to level 25 rather than spread to 40: the sweep showed the short shape gives a
  stronger early kick *and* disturbs level 55 less, because the help lands where the player is
  deciding whether to stay. Balancing §19 has the table and the alternatives.
- The card prints it while it lasts — `Greenhorn's due ×1.60`, a row beside Gold and XP, with the
  explanation on hover. A bonus the player cannot see is one that only exists in a spreadsheet,
  and this one shrinks every level, so the multiplier is the part worth showing. (It was a
  sentence first. Three contracts are on the board at once, so a sentence is drawn three times and
  reads as a banner — which only a screenshot can tell you, since every test passes on one card.)

### Fixed

- **The mission card quoted a payout it was not going to pay.** `MissionCard` called
  `missionPayout(...)` with no bonus, so a guilded player with a fed companion was told one number
  at the table and handed a larger one at the door — against the explicit note on `missionPayout`
  that the bonus belongs at quote time, because "a buff applied only on collection is a buff
  nobody believes in". Invisible while every source was an opt-in mid-game buff; impossible to
  miss at ×1.6 from level one.
- **Two tooltips at once, wherever a glossary term sat inside a tooltip trigger.** The character
  screen's "Damage reduction" row carries the hint "Against an opponent of your own level" and its
  label is the term _Damage reduction cap_; `pointerenter` fires on an ancestor when the pointer
  enters any part of its subtree, so hovering the word opened both and the general explanation
  covered the specific one. Opening a term now shuts the shell tooltip and cancels anything it had
  queued — the innermost explanation wins. Found by running the full e2e suite, which had not been
  run since before the day's work landed; the assertion that caught it was itself asking for
  `getByRole('tooltip')` unqualified, so it could only ever have passed by luck.

### Changed

- **§0's level-10 row is day 1–2**, which is the point of the feature rather than a side effect.
  Level 55 (20.1) did not move at all, because the bonus is spent by level 25 — which is what
  concentrating it there was for.
- **§0's level-25 row reads day 5–9**, its early edge widened by one day. The row has always
  promised "the first week"; the reference player now lands on 5.3, inside the week but 11.5%
  early of the parenthesised range, which was a reading of the promise rather than a second
  constraint. It would have passed the ±20% band either way — that tolerance is for model noise,
  not for absorbing a change made on purpose, so the range was edited instead of leaned on. Every
  §0 row now sits inside its window with nothing riding on the band.
- The guild-compounding floor came down from 1.15× to 1.08×: the greenhorn's due is a partial
  equaliser, since a guilded player levels faster and therefore spends fewer days being paid
  extra. The advantage returns in full past level 25, where the isolated check still measures it.
- `combineBonus` is variadic. Three sources nested as `combine(a, combine(b, c))` read like an
  accident of arity rather than the design, which is that every source multiplies.

### Added — the day's work

- **Vigor spent earns Golden Dice.** A die at 50, 100 and 150 Vigor spent in a day, up to three.
  Contracts and the Long Road are the only things that spend Vigor and both fill it, so the road
  now pays on a day it clears no chapter — which was the gap: a stage is a Vigor sink that pays
  nothing once its chapter is behind you.
- **Ale pays for itself, and cannot do better than that.** Three Ale costs three dice and the
  finished track pays three, and the third rung is only reachable *with* the Ale — so the trade is
  time for time, never dice for dice. A player who spends the Vigor gets the Ale back and keeps
  their chest and calendar dice for Fortune's Table. Dice earned went from ~1.9 a day to ~4.9.
- **Bounded by the game rather than by a cap.** Vigor is the hard daily budget — 100 plus at most
  three Ale is 160, and 160 is three rungs. There is no grind that produces a fourth die, no room
  to sit in, no action to repeat.
- **The track is on screen before it pays**, not explained afterwards: the rungs and the distance
  to the next one show at the Gilded Tankard beside the Ale button, on the Notice Board beside the
  chest, and in a sentence on the HUD's Vigor tooltip. A die that lands is announced wherever the
  player is standing.
- Save schema **v18** — one field, `activity.vigorSpentToday`, cleared by the Reset Engine and
  nothing else. No high-water mark: the payout is a difference of two totals inside the update
  that spends the Vigor, so replaying it cannot double-pay.

### Changed — what the day's work cost, measured

- **§0's level rows are re-fitted.** Self-funded Ale is +60% Vigor and Vigor is XP, so level 25
  moved to day 7 and level 55 to day 22. There is no version of "more Vigor" that leaves the
  ladder where it was; the schedule is the thing that was written down to be revised. Full details
  and every band that moved are in balancing §18.
- **The economy sim models the Ale loop as a fixed point** (`alesADay`): the Ale buys the Vigor
  that pays the dice that buy the Ale. Modelling the new dice as gacha rolls instead would have
  been modelling the option rather than the choice — Vigor compounds into gold, XP *and* loot, and
  a card does not. The full set still lands on day 51.5, unchanged, because the dice go to Ale.
- Three economy bands moved with the supply and say so: the companion reaches its ceiling on day
  ~20 rather than ~25, the Long Road is walked out by day 59 (still at level 101 — the *level* was
  always the load-bearing half of that check), and half-Vigor play is 68% of full-Vigor play
  rather than 70%, which is a track that pays for spending doing exactly that.

### Fixed

- **Item hover cards were being sliced off inside their own panel.** A gear cell rendered its card
  as a child, positioned `absolute bottom-full` — and a cell lives in a `TavernPanel`, which wears
  `chamfer-md`, which is a `clip-path`, which clips descendants. The paperdoll's top row showed a
  strip and the backpack's showed less. Eighteen phases, and the e2e test asserting the card
  visible passed the whole time: `toBeVisible` knows `display`, `visibility`, `opacity` and box
  size, and nothing at all about clipping. Same shape as the town map's plaques, second occasion.
  Cards go through the shell-level layer now (`useHoverCard`), which also gets them viewport
  clamping and flip-above-when-it-does-not-fit for free — and the spec walks the ancestor chain
  and fails on a `clip-path` rather than inferring it from visibility.

### Changed — every icon in the game

- **67 of the 69 glyphs are now game-icons.net artwork.** A beer stein that is a beer stein, a
  watchtower for the City Watch, a cave mouth for the Undertavern, and twelve companions you can
  tell apart at nav-rail size — a rat, a raven, a scarab, a snail. The set they replaced was
  hand-drawn line work that had covered the whole vocabulary since Phase 1, and at 19px a lot of
  it was the same three shapes. Silhouettes survive that size; strokes do not.
- **Nothing at a call site changed.** Same ids (`src/data/icons.ts`), same `<Icon name>`, same
  `size` prop, same `currentColor` tinting — the wrapper went from a 24-grid stroke to a 512-grid
  fill and every existing text-colour class kept working. `items.tsx` and `pets.tsx` are gone;
  their two hundred hand-plotted paths are one generated table.
- **The chevron and the Vigor tankard stayed hand-drawn.** A chevron is a direction rather than a
  thing, and the tankard is a *meter* whose clip path is tied to the mug it draws so the ale level
  can be a real liquid line. Both would have got worse as artwork.
- **A vendoring step, not a dependency.** `scripts/icon-map.mjs` holds the decisions as one
  reviewable line per icon (`tankard: 'beer-stein'`, `stairsDown: 'cave-entrance'`), the SVGs are
  tracked under `game_assets/icons/<author>/` exactly as the backgrounds are, and
  `npm run icons:sync` compiles the two into a committed module. No runtime package, no network,
  no `public/` copy that could 404.

### Added — the licence, discharged per artist

- **CC BY 3.0 credits the artist, not the website**, so CREDITS.md now names all five — Lorc (43
  icons), Delapouite (20), Skoll (2), Carl Olsen (1), Willdabeast (1) — with the upstream file
  names beside each, and the upstream notice vendored verbatim at
  `game_assets/icons/LICENSE.txt`. The in-game Settings → Credits screen shows the same five
  marked *required*.
- **`src/components/icons/icons.test.ts` derives that table from the files on disk.** Counts
  included: a list of names survives any change, a list of *counts* fails the moment one icon is
  remapped, which is the only version worth reading. It also fails on an orphaned SVG, an unused
  id, and a sixth artist arriving unlisted.
- **`credits.test.ts` now runs in both directions.** Phase 18 caught this file claiming an
  obligation the build did not have; the artwork landing turned the correction itself into the
  false half, in the same paragraph. A stated absence has to stop being stated the day it stops
  being true, so both halves are asserted.

### Fixed — while building it

- **Rounding path coordinates destroyed every drawing, and every gate passed.** Integers at 512
  scale are 0.03px at render size and halved the payload, so the first conversion rounded them.
  SVG path data is *compact*: in `M10.5.75l3.25.5` the token `10.5.75` is **two** numbers, and a
  `\d+\.\d+` regex matches `10.5`, rounds it to `11` and leaves `.75` glued on — two coordinates
  collapse into one and the shape becomes a sliver. Typecheck, lint and the production build were
  all green. A screenshot found it. The rounding is gone (105 KB of path data against a 400 KB
  chunk budget), the generated `d` is asserted byte-identical to the vendored file, and the script
  header records that the tool for this job is a real path parser, never a regex.

### Added — the Long Road

- **A campaign.** A hundred and twenty fixed stages leaving Emberhollow by the gate, in ten
  chapters of twelve — one chapter per zone, in the order the road leaves town. Press **Push on**
  once and it walks: stage after stage, each a full battle scene, until something stops you. Then
  it tells you which of the four things it was.
- **One Vigor a stage, win or lose.** A refunded loss makes pushing into a wall free, and a free
  wall is one you hammer thirty times instead of going and getting stronger — which is the loop
  the whole feature exists for.
- **A first clear pays once.** Gold at the stage's level, XP at the lower of yours and the
  stage's, double plus a Golden Die at a chapter boss. Re-entering a cleared stage costs the Vigor
  and pays nothing; the screen says so before you spend and again afterwards.
- **A loss takes nothing but the Vigor** — no lost ground, no cooldown. What it leaves is a best
  attempt: "you took it to 62% of its health", which is a target where "you lost" is a wall. It
  belongs to the wall stage alone and resets the moment the wall falls.
- **Every attempt is a different fight.** The seed is `(worldSeed, stage, attempt)`, so a stage you
  lost is reproducible but not unloseable-forever — there is a reason to come back with a sword.
- **Ten chapter bosses with signatures announced in words before the first blow**, cycling swarm,
  siphon and hardening twice across the first six chapters and then in rising strength, so the
  mechanic that ends chapter IX is one you met and survived in chapter III.
- Reachable from both the rail and the town map (the road running out through the gate, at the
  bottom of the painting). Unlocks at level 2 — deliberately early: it is the one system a hero can
  push into on the day they arrive.
- Save schema **v17**, additive and empty. A returning player walks the first chapters themselves,
  quickly: paying for stages nobody fought would be inventing gold, and granting thirty of the
  hundred and twenty one-time rewards is deleting content from somebody who was never asked.

### Added — the road on the Notice Board

- **Two daily tasks** ("walk 2 new stages", "push 4 stages further"), so the board can send you
  down the road like it sends you anywhere else. Targets are deliberately small: the metric counts
  *new ground*, so a player sitting at their wall cannot clear a stage today however long they
  play, and a five-stage task would be impossible on exactly the day the road is hardest.
- **Three glossary entries** — *stage*, *wall*, *practice* — because the road introduces three
  words the rest of the game does not use.
- **No guild bounty, on purpose**, and `bounties.ts` now says why: a bounty is a weekly total
  across a roster, and the road is a finite once-per-hero resource. Asking a hall for two hundred
  stages is asking its members to spend content they can never get back — and a bot has no
  campaign for `simulateBotContribution` to model.
- **`data/progress.test.ts`** audits the vocabulary from both ends: every metric must be credited
  by something in `src/state/` *and* read by a daily task, a bounty or a tutorial beat. Both halves
  have failed here before — Phase 15 found two bounty metrics nothing credited, and the road
  shipped the mirror image. Neither is visible from behaviour.

### Changed — what the road forced

- **The economy sim models the road as a faucet, and models the *choice*.** A player walks a stage
  while its XP beats what the same Vigor buys at the mission board, and stops at the first stage
  above their level. Measured: 11% of income in week one, 2% by month three, never more than the
  mission board on any single day, and the whole road walked by about day 86 at level 101.
- **A §0 schedule row is now measured against §0's window, not one end of it.** Three of the six
  rows are ranges ("Day 2–3", "~Week 2", "Day 45–60") and `TARGET_DAYS` collapses each to its slow
  end — right for a deadline, wrong for the early side of a schedule. Level 25 was reading as a
  29% miss for arriving on day 10, four days into the week §0 promised it in. `TARGET_EARLIEST`
  and `windowDrift` fix that without loosening anything: day 5 still fails.
- **The mission board's last contract of the day is fractional in the model.** Taking Vigor off the
  top for the road dropped a hundred-Vigor day from five twenty-minute contracts to four and binned
  the other eighteen — waste no player suffers, since the board offers ten, twenty and thirty. All
  three shipped play styles divide exactly, so no band tuned before the road moved.

### Fixed — while building it

- **The road opened on chapter I however far down it you were.** The board held its chapter in
  state seeded at 1 and corrected it when the reached chapter *changed* — right for following a
  boss's fall, and no help at all on arriving, because on the first render nothing has changed. A
  player who reloaded twenty stages in was shown a chapter with no stone to press. The shown
  chapter is derived by default and pinned only when a numeral is clicked.
- **An auto-runner you cannot interrupt is a cutscene.** The battle scene mounts over the road
  panel, so its Stop button was behind the fight for the whole run. Stop now rides in a chip above
  the scene with the run's readout beside it.
- **`Meter` labels and counts by default**, which on a 0–1 share renders "1 / 1" — both ends round
  to one — directly under a line that has just said 62%. Twice on this screen: the road-walked bar
  printed the count the header had already given.

### Added — tooltips that belong to this game

- **Every explanation in Emberhollow is now drawn by the game**, not by the browser. Chamfered
  timber, the facet strip, a display-face heading and a quiet second line — the same surface as
  the panels, instead of a grey OS rectangle in a system font. Twenty-six of them.
- **They open on keyboard focus, not only on hover**, which a native `title` has never done. Half
  the game's explanations were invisible to anybody navigating by keyboard.
- **A disabled button explains itself properly.** "Not enough gold", "one shift at a time" — the
  most useful tooltip in the game, on the one control the browser refuses to talk about.
- Hover waits a beat before opening and then stays warm, so reading along the HUD does not cost a
  third of a second per chip. Press, scroll, resize or Escape closes it.
- `src/components/ui/tooltips.test.ts` reads the source and fails on a new `title` attribute; a
  browser tooltip renders identically whether it was deliberate or forgotten, so it cannot be left
  to review. `/dev/kit` gained a tooltip section.

### Fixed

- **Dismissing a tooltip could produce another one.** Clicking a button re-renders the panel under
  a stationary cursor, which starts the hover timer of whatever moved into that spot; Escape
  emptied the tooltip but not the timer, so one appeared a third of a second *after* the player
  dismissed one. A dismissal now cancels what is on its way as well as what is open.

### Added — the town, as a place you can stand in

- **The Town Map.** Emberhollow painted from above, with all fourteen buildings clickable, and it
  is where the game now opens — `/` lands outside rather than in the tavern, because "not inside
  anything" is a state the game should be able to be in. Hovering a building opens a plaque naming
  the room, what you do there and who keeps it; clicking walks in. The nav rail does exactly the
  same job as a list, and neither is the real one: the map is how you learn the town, the rail is
  faster once you know it.
- **Locked buildings stay painted**, carrying a level plate — twelve of the fourteen at level 1 —
  so the shape of the next ten levels is visible from the front door. The dimming is a feathered
  halo rather than a grey box on each rectangle.
- **The tour can point at a building.** A new hero lands on the map, and the beat's building wears
  a slow amber ring, so "Marla is waiting at The Gilded Tankard" has a Gilded Tankard to point at.
- **One source for the badges** (`state/townSignals.ts`). The rail and the map are the same list
  drawn two ways, and a signal that appears on one and not the other is a player missing a
  companion for a fortnight because they navigate by picture.
- A broken room's way out now leads to the map rather than the tavern — the one screen whose job
  is to contain every other one.

### Fixed — while building it

- **A `clip-path` clips its descendants.** The plaques began life inside their hotspot buttons,
  which carry `chamfer-sm`; every one was cut off at the edge of its own building and never
  appeared. The e2e test asserting them visible passed throughout — `toBeVisible` knows nothing
  about clipping. Plaques are a layer now, and the test walks the ancestor chain instead
  (style guide §7.2).
- **Two plaques at once**, from keying the plaque on which building it described. Style guide
  §7.1, third occasion.

### Added — three characters, reachable

- **Settings → Characters.** Three save slots, which the engine has had since Phase 0 and nothing
  could reach: `readSave(slot)`, `deleteSave(slot)` and even a `listSlots` slot-picker helper have
  been there for eighteen phases while the shell called `hydrate(1)` on every load. The shelf
  names who is in each slot — hero, class, level, when they were last played — and switching puts
  one hero down where they stand and picks another up. An empty slot opens hero creation; a full
  one is one click away.
- **The slot is remembered**, in one key beside the saves rather than inside any of them. Closing
  the tab on your second hero brings you back to your second hero. Anything unreadable falls back
  to slot 1, because a bad value here must never keep a player out of their game.
- **Deleting says the name.** "Delete Ysolde, level 12?" rather than "Are you sure?", with the
  export button in the panel above it as the actual undo. Deleting the character you are playing
  puts you with another one rather than nowhere.

### Fixed — while building it

- **An effect keyed on the active save cannot see a sibling.** The shelf re-read the disk whenever
  the *played* save changed, so deleting a character you were not playing left their name on
  screen until something else nudged it.
- **Two delete confirms at once.** Keying the confirm panel on which slot it was asking about made
  moving the question between heroes an exit plus an entrance, and `AnimatePresence` keeps the
  outgoing one mounted — style guide §7.1, written one commit earlier and demonstrated here.

## [1.0.0] — Emberhollow opens

Eighteen phases. The game is complete against the definition in GDD §7, and `npm run release`
runs that definition line by line rather than restating it.

**What 1.0 is.** A single-player fantasy RPG that behaves like an MMO: five classes, a
deterministic combat engine you watch rather than play, contracts and patrols priced in a daily
Vigor budget, ten gear slots and ten sets, two shops, a forge, a gacha with its odds on the wall,
twelve companions, three dungeons, a weekly guild bounty, and 1,500 simulated heroes who level,
duel and gossip whether or not anyone is looking. Everything lives in the player's own browser.
No accounts, no server, no purchase of any kind.

### Added — Phase 18: release hardening

- **The save can be got out and put back.** Export writes a file named after the hero; import
  reads it, validates it through the real migration chain, and names both saves in the confirm
  before it replaces anything. There is no cloud, so a file is the only thing that survives a
  cleared browser.
- **A save that will not open now says so, and offers the raw bytes before anything is reset.**
  Sixteen phases of migration care ended at the point where a file was too broken to migrate.
- **Two tabs no longer race.** A `BroadcastChannel` leader election with a heartbeat — a crashed
  tab hands ownership back by doing nothing, which is the only thing a crashed tab reliably does.
  The second tab watches, and "play here instead" moves the save without hunting for a window.
- **A room that throws fails inside its own frame.** The rail and the HUD survive, the message is
  the real one, and leaving the room clears it by construction (the boundary is re-keyed on the
  path) rather than by a reset handler somebody has to remember to call.
- **A credits screen**, and the absences listed as prominently as the credits.
- **Production headers**, verified against a live server rather than read off the config: a CSP
  with no third-party origin and no `eval`, the security set on every response, and caching split
  by whether the URL is content-addressed.
- **`npm run release`** — the GDD §7 definition, executed. Four gates run their real harness; the
  fifth says plainly that frames per second on real hardware is a person's job.
- **`e2e/regression.spec.ts`** — thirteen steps over one save, from hero creation to the day
  after, with a reload between each.
- **The tutorial's "to level 10 unaided" claim has a harness** for the first time: every room open
  by level 10 is introduced from inside the game, the tour is walkable by the player it is written
  for, and the pacing sim reaches ten inside the §0 budget.

### Changed — Phase 18

- **The tour teaches Patrol and the Crier before the arena.** Not a preference — see *Fixed*.
- **Zod validates without `eval`** (`jitless`), which is what lets the CSP forbid it outright.
  3.20 ms → 4.16 ms on a 175 KB save, once, at load.
- **`/assets/*` caches for a day with a week of stale-while-revalidate**, and `/_next/static/*`
  keeps its immutable year. `immutable` is a promise about the URL, and only one of those two is
  content-addressed.
- **Item stat lines list `ATTRIBUTE_IDS`**, the order the rest of the game already uses, instead
  of whatever order the object was built in.
- The dev harness routes ship, deliberately, and carry `X-Robots-Tag: noindex`.

### Fixed — Phase 18

- **The town was being drawn over a save that had not loaded.** The tab-lock election put 350 ms
  in front of `hydrate()` and the shell rendered straight through it — so Settings offered
  "Export this save" against `save === null`, and a quick click produced a file named
  `tavernrpg-hero-slot1.json` holding the *previous* session. A guard that delays a load has to
  gate the render too.
- **The tour went silent for a whole level.** `activeBeat` stops at a beat gated above the hero
  rather than skipping it — deliberately — but the arena beat (level 4) sat in front of Patrol and
  the Crier (both level 3). A level-3 player who finished the Notice Board got no guidance at all
  until they hit four, with two rooms open and unmentioned.
- **A chip on its way out still took clicks.** `AnimatePresence mode="wait"` keeps the outgoing
  child mounted; keying the tutorial chip on its *state* rather than its identity meant a click in
  the hand-over window ran a handler with nothing to do. It looked live and did nothing.
- **Item stat lines re-ordered themselves across a reload.** Object key order is not a data model:
  insertion order agreed with schema order only by accident, and stopped agreeing the day the
  parser went interpreted.
- **The credits list was wrong in both directions** — a claimed CC BY obligation for artwork the
  build has never contained, and an unlisted OFL obligation for fonts it self-hosts and therefore
  redistributes.
- **Phase 16 bumped the save schema and never captured a fixture.** Fixed, and a census now makes
  the omission impossible rather than unlikely.
- Eleven contrast readings closed, down to **three** budgeted with their evidence written down.
- **A release gate that cries wolf.** Lighthouse scores 97–98 here against a threshold of 90 and
  drops a room under it whenever anything else is resident — a different room each time, and
  reproducibly so: the same sequence passed from `node` and failed through `npm run`. The release
  command now gates the deterministic half of performance and hands the Lighthouse reading to
  `npm run perf` with "on an idle machine" written next to it.
- **`npm run format:check` had been failing since Phase 8** — 31 files, none of them noticed,
  because every phase checked the files it had touched rather than the tree. A CI step nobody runs
  locally is a CI step that reports on whoever pushes next. Swept, and the captured save fixtures
  are now ignored by Prettier: a fixture is a record of what the game wrote, and reformatting one
  is editing evidence that the next capture would undo anyway.

### Known at 1.0

- Three contrast readings remain, each a measurement artefact rather than a colour, named in style
  guide §10.3.
- The frames-per-second line of GDD §7 is measured as main-thread cost (0.8 ms of an 8 ms budget)
  plus Lighthouse ≥ 90. The fps reading itself needs real hardware.
- Three open questions run on stated defaults: game-icons.net (unreachable from the build
  environment; the hand-drawn set stays), the §0 milestone middle row, and whether the full OFL
  text should ship beside the fonts. All are recorded in `USER_QUESTIONS.md`.

---

*Everything below is also 1.0.0 — eighteen phases of one unreleased line, kept phase by phase
because that is how it was built and how the reasoning reads. Nothing here shipped separately.*

### Added — Phase 17: balancing, content fill and feel
- **Content to plan volume.** 96 mission monsters (9–10 a zone, up from 70), 124 blurb
  definitions across 340 zone pairings, and keeper barks floored at twelve a keeper with at least
  two per moment — `data/content.test.ts` asserts all three, because a roster that is one line
  short in one zone is invisible until a player reads the same sentence twice.
- **Sound, synthesized.** 24 cues written as oscillator recipes in `data/sfx.ts` and built at play
  time — ~2 KB of data instead of twenty files, nothing to attribute, and a cue is a number you
  can edit. The context opens on the first gesture and never before it, a muted player never gets
  one at all, and throttling is per family so a flurry of interface ticks cannot eat the crit
  landing in the same frame. Music is one file the player supplies; its absence is the documented
  default and shows no toggle at all.
- **The Settings screen.** Sound, volume, motion, rail, playback speed, skip-by-default and
  Marla's tour. The last placeholder room in Emberhollow is now a working panel.
- **The tuning pass.** All 68 `[TUNE]` markers carry a verdict in balancing §16 — changed, held
  against a named harness, or (for the three simulation parameters) held to a stricter standard.
  Plus 90-day economy bands and `npm run tuning`.
- **The accessibility pass.** A contrast harness that reads real pixels, WCAG 2 A/AA via axe on
  five screens, tab order asserted against reading order, a visible focus indicator on twenty
  consecutive stops, and reduced motion checked for the states an animation was carrying.
- **The performance pass.** `npm run perf`: Lighthouse on the stage screens, a per-route bundle
  budget, and the battle scene's main-thread cost.

### Changed — Phase 17
- **Set pieces are reachable.** An Epic scrap yields 1–2 Starmetal, up from 0–1, and the pacing
  sim costs the forge's recipe route it had been excluding. A full five-piece set closes at day
  51.5 against §0's 52, where it read 125.
- **The muted-text ladder.** 408 usages spread from `/18` to `/70` collapsed into three tiers with
  `/72` as the floor. The semantic colours gained text-safe siblings — light for timber, dark for
  the parchment of a duelling poster — and the style guide §10 says which surface takes which.
- **The art ships transcoded.** `sync-assets.mjs` re-encodes backdrops and portraits to WebP at
  display size: 79 MB of PNG becomes 2.4 MB. Lighthouse 49 → 98.
- **Milestones are schedules or deadlines.** A content gate is wrong early *and* late; a long
  chase is only wrong late. All six §0 rows are inside ±20% and `pacing.test.ts` asserts the
  distinction itself.

### Fixed — Phase 17
- **The fight was silent in one specific way.** `play(frame.reaction.kind)` handed the timeline's
  `blocked`/`dodged`/`missed` to a mixer that knows `block`/`dodge`/`miss`. It type-checked
  against `play(id: string)` and no-opped forever. `play` takes a typed `SfxId` now and the hook
  bridges the two vocabularies through a checked map.
- **Settings hydrated wrong on every load.** `audioAvailable()` reads `window` during render, so
  the server shipped "no speaker" and the client built the mix — a React 19 hydration failure that
  announced itself only as a minified error number.
- **`sfx('constructor')` returned the `Object` constructor.** The lookup was an object literal.
- **The `XP_DIVISOR_*` constants had no `[TUNE]` marker** — the two numbers that set the pace of
  the whole game were invisible to the pass whose job is to review every tunable.
- **A latent Phase 7 race.** Two selling tests conjured an item and navigated without flushing;
  they only began failing once a click grew a few milliseconds of work.
- **Per-frame values were going through Motion's `animate`.** The fighter's lunge offset asked
  Motion to tween toward a target that changed again next frame, sixty times a second, with a
  `transition` object whose identity swapped every tick.

### Added — Phase 16: the first twenty minutes
- **The active beat is derived, not stored.** Twelve beats in `data/tutorial.ts`, each a place, a
  thing to point at, two sentences and a predicate — and the live one is simply the first the save
  cannot already prove happened. Nothing advances it. That makes "resumable mid-beat" free rather
  than implemented: a reload lands on the same beat because the position was never written down,
  and a cursor can never point at something the player already did in another tab. Only the two
  `'read'` beats store anything, because "notice this" has no consequence to derive from.
- **Every predicate is monotone, and a test replays a playthrough to prove it.** The price of a
  derived cursor is that a predicate which can go back to false drags the whole tour backwards.
  Beat 4 first asked "are your bags empty?", which is false again the moment a second contract
  drops something — and beat 7 asks the player to *hold* loot for Bram to buy, so beat 4 would
  have reactivated every time they did what beat 7 asked and the tour could never have reached
  beat 8. Fixing it added three facts to the one progress vocabulary: `missionsAccepted`,
  `missionsReturned` and `itemsEquipped`, each credited at the one place its action happens.
- **A spotlight that cannot trap anybody.** One element with `0 0 0 100vmax` of shade cuts the
  hole; the whole layer is `pointer-events-none` except the keeper's card, so every control on
  screen stays live — including the ones the beat is not pointing at. The hole tracks its target
  on a rAF loop through resizes, scrolls and place transitions, and the card places itself below
  it or above it depending on what the viewport has left. Escape folds it, the fold is keyed on
  the beat id so it silences one and not the next, and "Skip the tour" is on the card at all times.
- **Off the beat's screen, the tour is a chip, not a card.** When there is no hole to draw — wrong
  room, target not mounted — nothing renders over the page and the HUD says it instead. This is
  the fix for a real bug rather than a preference: the first version floated a card bottom-centre
  in that case, landed it on Vesna's roll buttons, and three Fortune's Table tests failed with
  "subtree intercepts pointer events".
- **A twenty-second first contract.** Beat 2 has to end before beat 3 can begin, and a five-minute
  wall on the second thing a player has ever done is where they close the tab. Only `endsAt`
  moves: the Vigor is spent at the real cost, the payout is still priced off `duration`, and the
  card still prints "10-minute contract" — so the next job, which really does take ten minutes,
  does not make the first one retroactively a lie. The card says Marla knows a shortcut, because
  an unexplained short timer reads as a bug the second time round.
- **Three callouts over the first fight, pinned to ×1.** Keyed to playback progress rather than to
  a block landing — a fight without one would never show the middle note — and written about the
  system rather than the blow on screen, so each is true whatever the dice did. The fight stretches
  to 16s so they are readable, and the speed buttons say why they are locked instead of going
  quietly dead. Skip still works.
- **"I have played before", at creation.** One tick, one flag, and it only stops the overlay
  rendering: the gates still open by level, the glossary still works, the six explainers still
  fire, and turning the tour back on resumes at beat one rather than pretending the twelve
  happened.
- **Rooms announce themselves.** One watcher on the hero's level toasts every room a climb opened
  — however many levels it covered at once — and lights the rail row it belongs to. Both read the
  same list, so the toast and the flourish cannot disagree about what just happened.
- **One hint, ever.** The Next Step chip ranks seven rules by how *perishable* each is rather than
  by how valuable, because the chip's job is to catch the thing you would regret missing. It waits
  for the tour to finish, goes where it points, and a dismissal lasts until the reset walk clears
  it at midnight.
- **A glossary that never switches off.** Forty-one one-sentence entries, each answering the
  question with a number where the rule has one, attached to the word wherever it appears
  (`components/ui/Term.tsx`). It is deliberately not tutorial content: the player who needs "what
  was Starmetal for?" is three weeks past the tutorial. The settings-screen index lands with the
  Settings screen in Phase 18.
- **Six one-time explainers** for the moments that need a sentence and never need it again. They
  mark themselves seen on *show* rather than on dismiss, so a reload mid-Epic does not bring them
  back, and they never block — these fire in the middle of a loot reveal, so they are a card
  beside the thing rather than a modal over it. The dungeon wall is the important one: hitting a
  floor you cannot beat is the intended experience and reads as a balance bug unless somebody says
  so out loud.
- Save schema **v16** (`tutorial`), with the 15→16 migration marking an existing save opted-out —
  a player mid-Phase-15 has already learned all of this.
- `tutorialContent.test.ts` checks the data against the app: every beat's spotlight testid is one
  a component actually renders, no beat is gated below the room it happens in, copy stays inside
  its sentence budget, and the glossary never defines one unknown word with two more.

### Fixed — Phase 16
- **`itemsEquipped`, `missionsAccepted` and `missionsReturned` did not exist.** The tutorial needed
  facts the save could not answer, which is a gap rather than a tutorial problem: nothing counted
  a contract *signed* (only won), and nothing counted a piece put on. All three now go through
  `credit()` like every other metric.
- **`landMission` was a silent transition.** It is the moment the waiting ended — a different
  lesson from the fight that follows — and now says so.
- Playback settings could change under a mounted `useBattlePlayback`: banking the victory on the
  closing beat flipped "is this their first fight?" while the same scene was still on screen,
  handing it a new speed and a new pacing target as the result slid up. The answer is frozen at
  mount.

### Added — Phase 15: the Notice Board, the ledger, and one owner for midnight
- **Three notices a day, and the board tracks them itself.** No per-task claim button, now or
  ever: three notices with three claim buttons and then a chest button is four clicks for one
  reward. The tasks fill as you play and the single claim moment is the chest. 40/30/30 means all
  three are required, which is the point rather than an accident of arithmetic — a board where
  two of three suffices is a board whose third task is a suggestion, and the third task is the one
  that sends you somewhere you were not already going.
- **The draw is feature-aware and leans toward neglect.** A task is never drawn for a room the
  hero cannot enter, and `gateFor()` is the authority rather than a level written down twice. The
  weighting climbs with how *little* of something the player has done — capped under 2× across
  the whole range, because a board that leans harder becomes a list of everything they have
  decided they do not enjoy. Every notice names the room it sends you to and links straight there.
- **The dice paycheck.** One Golden Die a day for clearing the board, and three more for a
  perfect week. Dice are never purchasable, so this and Vesna's free card are the entire supply —
  which is why the die is named on the button rather than discovered inside it. Seven-of-seven for
  the weekly chest, deliberately: six would be the kinder rule and the wrong one, because a weekly
  bonus you get most weeks is a weekly bonus you stop noticing.
- **Marla's ledger pauses; it never resets.** Twenty-eight squares, stamped automatically on the
  first load of the day, with dice on 7/14/21 and an Epic plus the Moss Tortoise on 28. The state
  is a *count of days attended* and the date of the last one — there is no streak field, so there
  is nowhere for a "break the streak" branch to live. A player who vanishes for six weeks comes
  back to day 19, because day 19 is what they earned. Gold on the ledger is denominated in Vigor,
  so a square is worth the same share of a day's work at forty as it was at four.
- **One vocabulary for everything the game counts.** The weekly Guild Bounty and the daily tasks
  both ask for countable things, and each would have kept its own list of what those are — the
  third occasion of a bug this project has already recorded twice. `data/progress.ts` owns the
  union, each consumer narrows to its subset, and `credit()` is the only path from a player action
  to a number.
- **Reset Engine v2.** The walk now returns a ledger rather than a boolean: the boundaries
  crossed, the days away, the Sundays that closed and the Vigor forfeited. `weeksClosed` is handed
  out rather than recomputed, so the arena payout, the guild bounty and the weekly chest cannot
  disagree about which Sundays a fortnight contained. A **source audit** enforces the rule the
  engine exists for — one caller for `processResets`, one funnel for every per-feature refresh,
  and no screen comparing a stored day key against today.
- **The session bookends.** A minute before midnight the HUD says the tavern clock strikes soon;
  when it does, a soft card names what refreshed — filtered to rooms this hero can actually walk
  into, and never dropped over a fight in progress. And out of Vigor is no longer a dead end: the
  Watch still pays tonight, and three lines say what is waiting at dawn.
- **Save schema v15** — the day's tally, the lifetime tally, the two chest high-water marks, the
  week's rungs, and the ledger — with a v14 fixture captured in the Menagerie. The calendar
  migrates to **zero** on purpose: the save has never recorded which days a returning player came,
  so any starting square would be invented rather than earned, and day 28 grants a pet.
- **The Moss Tortoise and the Coin Toad are obtainable.** Both still derived rather than granted —
  a closed ledger cycle and thirty daily chests. Thirty *chests*, not thirty consecutive days: a
  pet gated on a streak would quietly contradict the calendar's own promise from the next room
  over.

### Fixed — Phase 15
- **Two of the six guild bounty metrics were never credited from the player's side.**
  `itemsScrapped` and `levelsGained` were only ever moved by the hall's own simulation, so a week
  that drew either one gave the player nothing they could do about it and left the hall carrying
  the bounty alone. Both now go through the shared credit path, along with selling, forging,
  training, feeding, delving and rolling.
- **Fortune's Table advertised "Bootss" and "Glovess".** A blanket `+ 's'` on slot labels, two of
  which are already plural, since Phase 13. There is a `SLOT_PLURALS` map now.
- **A finished ledger rendered as an empty page.** Sitting on day 28 with the roll pending cleared
  every mark — so a player who had *just completed a twenty-eight-day ledger* was shown a blank
  one. The completed page now stands until the next mark opens a new cycle.
- **The three-keyframe spring, for the third time.** Springs take exactly two keyframes and drop
  the animation silently when handed three; the board's completion tick joined the Phase 12
  wallet pulse and the forge beam. Duration-based now, and the comment says why.
- **A staggered list inside `AnimatePresence mode="wait"` needs somewhere to exit to.** Without an
  exit variant the children never finish leaving, the wait never resolves, and the tab strip moves
  over a blank panel. The Notice Board's notices needed `exit="hidden"`.

### Added — Phase 14: The Menagerie (twelve companions, one at your side)
- **Ownership is derived, not stored.** There is no "pets owned" list anywhere in the save.
  `ownedPets()` answers the question from the facts that *earned* each pet — floors cleared,
  contracts won, the best ladder rank ever held — every one of which was already in the save
  before this phase existed. A player who took Barrowdeep to its fifth floor back in Phase 11
  owns the Gloom Cat the moment the room opens: no migration, no reconciliation pass, and no
  second copy of the truth to drift from the first. The counters are totals rather than
  increments on a boundary, so the day-keyed double-pay bug CLAUDE.md warns about five times over
  simply has nowhere to live here.
- **A pet's source is data, and the silhouette reads from it.** `PetSource` is a closed union, so
  a thirteenth companion with a new kind of source is a type error until the engine handles it —
  and the `hint` an empty stall shows is authored beside the check it describes. A collection page
  whose empty slots are question marks makes the player feel behind; one whose empty slots are
  *directions* gives them somewhere to go. `pets.test.ts` matches every dungeon and zone id in the
  table against the real content, because a hint naming a floor nothing looks at is exactly the
  drift this shape exists to prevent.
- **The two luck-based pets store their luck**, and only those two. For a coin-flip that lands
  once in two hundred there is nothing else in the save to read it back from, so the Frost Fox's
  egg and Vesna's grants are facts rather than derivations.
- **Feeding, and the ceiling it climbs to.** A Scrap and some gold buys a level; the boost runs
  1% at level one to 4.9% at fifty, half rate for armour, gold-find and experience because those
  three multiply things already multiplied elsewhere. Three rarity upgrades buy a frame, a trail
  and half a percent each — deliberately skippable, which is what lets the materials price be
  steep. The whole system caps at **+6.4%** against the **+6.6%** an average Rare chest line is
  worth at level 30, and the test measures *both* sides against the live generators rather than
  freezing either number.
- **One at a time, and free to switch.** Attribute and armour boosts go through `deriveStats`, so
  the paperdoll, the compare tooltips and the fight all read one figure and a pet cannot be worth
  more in a battle than it says on the chip. Gold-find and experience become a `PayoutBonus`
  composed with the guild's. Switching costs nothing and never will: a switching cost would make
  the player think hard about something the design has deliberately made not worth thinking hard
  about.
- **The room.** Twelve stalls, owned ones breathing on their own cycles so the grid is never in
  lockstep, yours sorted to the front. A feed chomps and flashes the number it moved. The exact
  boost is on every tile, the upgrade button names the frame it buys and its price, and every
  refusal is a sentence written by the same function that would decline it.
- **The rail says when something arrived.** Companions are earned while the player is somewhere
  else — a floor cleared, a rank held, a hundredth contract — so without a cue the room only gets
  visited by players who already suspect. The badge counts against a remembered number and clears
  itself by being looked at.
- **Save schema v14** — the sparse pet-progress record, the active id, Tavern Scraps, hatched
  eggs, the seen-count and a per-zone mission counter — with a v13 fixture captured at Vesna's
  table. The migration grants nothing, which is the whole point: the history already earns the
  pets.

### Changed — Phase 14
- **Tavern Scraps drop at 16%, not 8%.** The economy sim's fourth pass measured the old rate at
  0.8 Scraps a day, which took a companion two months to grow and made the published three-a-day
  feed cap literally unreachable — the stall was advertising "3/3 feeds left" for a pace the game
  could not supply. At 16% × 2 a companion reaches fifty in **31 modelled days**, and the cap
  becomes what it was always meant to be: a burst allowance for a player who banked Scraps while
  away, not a daily target.
- **The economy sim gains a pet sink**, held under 3% of all gold out and measured at 0.5–1.2%.
  Feeding must never compete with training, and a band is a better guarantee of that than an
  intention.

### Fixed — Phase 14
- **Gear `goldFind` and `xpBonus` had been decorative since Phase 2.** `deriveStats` has computed
  them for twelve phases and no payout ever read the numbers, so an amulet advertising "+3% gold
  found" was advertising nothing. `payoutBonus()` now composes the hall's cut, the pet's and the
  gear's into one object — one function, so no call site can quietly assemble a subset.
- **The per-zone mission counter counted attempts; its sibling counted victories.** The Wisp of
  the Chapel asks for forty contracts at the Sunken Chapel and the Tankard Imp asks for a hundred
  anywhere — and one of those being satisfiable by *losing* made the harder-sounding gate the
  easier one.

### Added — Phase 13: Fortune's Table (a gacha that tells you the truth)
- **Three banners, and the calendar decides them.** The Daily Draw highlights a slot, Set of the
  Week puts one of your class's two sets on the table until Monday, and Vesna's Grand Reading
  turns over on the first. The schedule is a **pure function of `(date, world seed, class)`** and
  is stored nowhere — a save that has not been opened for a fortnight already knows what was
  featured on every day it missed, and nothing has to *advance* it, which keeps the Reset Engine
  the only thing in the game that decides it is tomorrow.
- **The odds are on the screen, beside the button.** Not in a menu, not behind an "i" — a
  permanent panel showing all seven outcomes as exact percentages, following whichever banner you
  are looking at. `outcomeOdds()` reads the same weights the roll rolls against, so there is no
  version of the panel that can advertise a rate the engine does not honour. That is CLAUDE.md
  rule 6 implemented as a shared constant rather than as a promise.
- **Pity in public.** Twenty cards on the weekly banner without a featured hit and the next one
  *is* one. The meter fills on the card, prints the exact count, and says "guaranteed" out loud
  before the click. The counter **follows the set, not the week**: twelve rolls into Oathsworn
  survive a Wolfblood week rather than being spent by it — and the meter reads zero on a week it
  will not pay, because "12/20" under a card that cannot honour it is a lie told for six days.
- **A card is never nothing.** A featured hit is always a piece you are *missing*; once the set is
  whole it converts on the table instead — two Starmetal and a shard, five shards a pattern — as
  its own reveal frame rather than a silent substitution. An Ale you cannot drink pays gold. The
  Grand Reading has no featured pity because its **track** is its floor: fifteen cards always buy
  a rung, and the three rungs are a set recipe, the Owl of Vesna, and six Starmetal.
- **The roll moment.** Dice tumble across the felt, cards land face-down, then they turn **in
  rhythm with the best one last** — which is what makes a ten-card spread a crescendo instead of a
  list. Skippable from the first frame, collapsed entirely under reduced motion, and the cards
  are already in the save before the first frame plays: closing the tab mid-ceremony keeps them.
- **A receipt.** The last two hundred cards, with free ones marked free and pitied ones marked
  owed, because a log that flattened those into "featured" would make the published floor
  unverifiable from the one place anyone would go to check it.
- **Save schema v13** — the weekly counter and the set it follows, the monthly track's
  roll-denominated high-water mark, shards, the free daily card, Vesna's pet grants and the
  history — with a v12 fixture captured at Torvald's bench. Empty on arrival for the third schema
  running: a returning player has spent dice on Ale and rerolls for twelve phases, and none of
  that is a roll that owes pity.
- **The economy sim gains a gacha faucet** and a band that holds it under 12% of income. Measured
  at 10.5% for an active player over sixty days — a garnish, not a wage. If rolling ever paid
  better per day than running missions, the correct play would be to stop playing the game.

### Fixed — Phase 13
- **The whole e2e suite had been running at 1280×720** while the config claimed 1080p:
  `devices['Desktop Chrome']` carries its own viewport, and a project-level `use` beats the
  top-level block. The declaration moved below the spread. The 1366×768 floor is still tested
  explicitly, where it was always meant to be.
- **Two more e2e helpers created a hero and navigated before the write landed** (`app-shell`).
  Same rule as the four fixed in Phase 12, same parallel-load-only symptom.
- **A countdown longer than two days read as hours.** "Turns over in 673h" is a number, not an
  answer; past 48 hours `formatRemaining` speaks in days.
- **"Keepers explain why their rooms are unfinished" ran out of keepers.** With Vesna's table
  open, every keeper-run room in Emberhollow is built. The test now checks the three keeperless
  placeholders, which explain themselves in the panel's own voice.

### Added — Phase 12: Gear Sets & the Emberforge (a chase, and a bench to cheat at it)
- **Ten curated sets, two per class.** Helm, chest, gloves, boots, belt — the one item type in
  the game whose statline is *authored* rather than rolled, because a set is a build and a build
  cannot be a shrug of the dice. Oathsworn Bulwark and Wolfblood Warplate for the Warrior;
  Maestro's Ensemble and Dawnchorus Attire for the Bard; Emberweave Vestments and Tidecaller's
  Regalia for the Mage; Thornstalker's Guise and Galewind Harness for the Hunter; Corsair King's
  Finery and Nighttide Silks for the Swashbuckler.
- **Thirty bonuses at 2, 4 and 5 pieces, declared as data.** A bonus is a list of named
  `SetEffect` levers that the engine folds into one `CombatModifiers` bag at build time; the
  resolver reads that bag at the handful of places it matters. Thirty branches in `fight()` would
  have been thirty places to get it wrong, and an eleventh set is now a data change.
- **Five-piece bonuses that change how a fight goes, not how big it is.** Blocks that throw
  damage back, dodges that answer with a free shot, crits that peel armour off, a flurry that can
  chain a third strike, a shield that catches you the first time you drop under a third health,
  a first blow that always crits, a damage floor that lifts — and, for the Maestro, **choosing
  the Verse you open on**, the one bonus in the game that is a decision rather than a number.
  All of them bounded by a once-a-battle limit or a stack cap; the harness holds a full-set
  mirror inside 42–58%.
- **The Emberforge, and Torvald.** Three benches under one roof because they are one loop.
  The **crucible** takes ten pieces a day and pays materials (Scrap from Commons, Essence from
  Rares, Starmetal from Epics and Sets); the **anvil** turns those materials into gear *in a slot
  you choose*, at three published investment tiers; the **recipe shelf** turns them into a piece
  of a specific set.
- **Odds on the tile, always.** The rarity distribution the screen prints and the weights
  `rollForgeRarity()` rolls against are the same object — there is no version of the screen that
  can advertise a number the dice do not honour. So is the pity track: five Master forges banks a
  guaranteed Epic, the meter is drawn as five pips, and the tile says "Strike (Epic)" when it is
  ready. A floor nobody can see is indistinguishable from good luck.
- **The forge moment.** Three hammer blows and a shower of sparks, then a rarity beam and the
  card. The item is decided and written to the save *before* the first frame — closing the tab
  mid-ceremony still leaves it in your bags — and the whole thing is skippable and
  reduced-motion safe.
- **Set pieces from the dark.** Below dungeon floor four a Set piece replaces an Epic one time in
  five, and a cleared boss is a coin flip. Neither can ever hand over a piece you already own,
  and a recipe craft always rolls a *missing* slot until the five are yours — then rolls a
  level-refreshed copy, which is the documented path for a set you have outgrown.
- **Set Collections, as a character-screen tab.** Five silhouettes per set that fill as you find
  them, the 2/4/5 bonuses listed whether or not they are live, and a source line for what is
  still out there. Owned and worn are counted **separately**, because "how far off am I?" and
  "why is my four-piece not firing?" are different questions and a page that conflates them
  answers neither. Worn pieces breathe gold on the paperdoll from two up, and every item card
  carries its set's pip strip and next bonus.
- **Save schema v12** — the materials wallet, the forge's daily counter, ember meter and recipes,
  and the Bard's chosen opening Verse, with a v11 fixture captured five floors into the Rat
  Cellars. Materials arrive deliberately **empty**: back-paying a returning player's stockpile
  would hand them a Master forge on the visit where the room is introducing itself.

### Fixed — Phase 12
- **A `text-` → `bg-` string swap does not make a Tailwind class.** The published-odds bar built
  its segment colours by rewriting the rarity text class at runtime, which produces names the v4
  scanner never compiled — a bar of four invisible segments. Written out as literals.
- **A spring cannot animate three keyframes.** The wallet chips pulse on change, and Motion drops
  the animation entirely (with a console warning) when a there-and-back is handed a spring. They
  use a tween now.
- **`AnimatePresence mode="wait"` needs an exit that resolves.** Both new tab strips animated
  their body with `variants={listItemIn}` and an inline `exit` — but `listItemIn` declares no
  exit variant, so the underline moved and the panel never did.
- **Stale phase copy on the character screen.** The derived-stats panel still promised that
  "fights themselves arrive in Phase 3", and the empty backpack pointed at Phase 5 for loot.
- **A hero creation that never reached disk.** Four e2e helpers created their hero and navigated
  immediately; under parallel load the write was still in flight and the next page rendered the
  class picker instead. The suite's own "mutate then navigate must flush" rule, applied to the
  helpers that skipped it.
- **"Continue" hid under the playback bar** on a tall battle result (Phase 11 surface, found by
  the parallel run). The bar stays mounted after a fight so Replay is reachable, and a dungeon
  result carrying a best-attempt bar or a clear ceremony grew until its button landed
  underneath it.

### Added — Phase 11: Dungeons (three doors under the Tankard)
- **The Undertavern.** Three key-gated, ten-floor gauntlets in the cellar: the Rat Cellars, the
  Barrowdeep Crypt and the Emberdeep Foundry. Thirty named floors, and every one of them stands
  at a **fixed level** — floor 7 of the Rat Cellars is level 26 whether you meet it at 20 or at
  60. That single property is what makes a dungeon a power benchmark instead of content.
- **A wall you can measure yourself against.** Floors carry a ×1.35 stat budget, so you will
  stop; the point is being able to see *how far short*. Every door shows ten rungs, what is
  standing on the current one, and how much of its health your best attempt took off. Between two
  gear upgrades that bar is the only progress there is, and "you took it to 71%" is a target
  where "you lost" is a wall.
- **Free attempts, and a chain.** No Vigor, no cost, no timer. Win and the next floor is right
  there in the same visit — a good delve after a gear spike runs four floors deep. Lose and the
  door shuts for thirty minutes while the horrors regroup; nothing else is taken from you.
- **Six bosses with signatures, announced.** Floors 5 and 10, each carrying a named ability with
  a written explainer that holds the stage before the first blow: Riddletail's swarm arrives every
  third round and cannot be parried, the Pale Margrave drinks every swing that fails to land, and
  Vulkarr cools into his own armour a little more each round. Three different *shapes* of ability
  rather than three bigger numbers, and **floor 5 teaches what floor 10 tests** — each mid-boss is
  a weaker version of its own finale, so the mechanic that ends a dungeon is one you have met.
- **Keys off the road.** Six percent a mission once you are old enough for the door they open, and
  only ever one key in the pool at a time — the lowest door you have reached and cannot yet open.
  A key is a one-time unlock; the door then stays open forever.
- **The payoff.** Every floor pays a Vigor-day of XP and gold plus a 50% drop with a separate 25%
  Epic roll on top. Floor 10 hands over a guaranteed Epic, three Golden Dice and the dungeon's
  crest, seals the door behind you, and puts the trophy on your profile.
- **Save schema v11** — dungeon progress, keys and trophies, with a v10 fixture captured mid-week
  inside a guild hall.

### Fixed — Phase 11
- **Two dungeons got easier as you went down.** Archetype turns out to be worth up to twelve
  levels of difficulty at dungeon budget — more than the level curve gains across six floors — so
  a roster picked for flavour alone put a swarm on Barrowdeep's floor 7 that fell to a level-33
  hero when floor 6 needed 46. All three dungeons now run their archetypes in ascending order of
  measured difficulty, and the harness asserts the ramp never dips.
- **The mid-bosses overshot.** At the spec's flat ×1.6, Emberdeep's floor 5 was harder than the
  floor *below* it. Mid-bosses now run ×1.5 — the smaller wall the "floor 5 teaches, floor 10
  tests" design already implied.
- **A floor paid XP at the floor's level**, so a fresh level-10 delver collected two level-14
  levels from one clear and the four chainable floors behind the Rusty Key would have carried
  them to 20 in a single visit. Gold is still priced at the floor (which is what stops
  back-farming); XP now takes the lower of the two levels.
- **Eighteen rounds in eight seconds is not a fast fight.** Dungeon fights run genuinely longer
  than missions — a tank floor is 15–17 rounds at the level that clears it — and the standard
  pacing target compressed them into an unreadable smear. The Undertavern gets its own targets.
- **`ember-500` was never a colour.** Several dungeon classes named a token that does not exist
  (it is `ember-600`), so the boss banner and the best-attempt bars rendered in plain parchment.

### Added — Phase 10: Guilds (a hall with people in it)
- **Sixty halls, and none of them is a row in a list.** Every card carries what the hall is
  *like* — cosy, nocturnal, cutthroat, early risers — derived from the personalities of the
  people actually in it, plus the level and honour it will ask of you and the buffs it pays.
  Nothing about a hall is stored: name, banner, vibe, requirements and buff steps all fall out
  of `(worldSeed, guildId, roster)`, so sixty guilds cost the save nothing.
- **Apply, and wait.** A letter takes five to ninety minutes to answer, off how promptly that
  hall's Guildmaster tends to reply. The answer is a written note, accepted or not, and it
  arrives whether or not you were watching the screen.
- **Or found the sixty-first.** Name it, cut its banner from a field colour, a charge colour and
  a sigil with the real thing previewing as you choose, and pay for it. The name is checked as
  you type — against the sixty and against your own — rather than after the gold has gone.
- **The Treasury and the Drillmaster.** Two tracks, a hundred steps each, priced at `500 × n^1.7`
  to a ceiling of +25% gold and +25% XP. Donations that cannot afford a step are *banked* rather
  than lost, which is what makes a hall of three viable. Golden Dice are accepted at a stated
  gold value and never sold — earn-only, as always.
- **The buffs are real money.** They multiply the mission and patrol payouts the player is
  actually shown, through the same `PayoutBonus` the economy simulation runs 30 days of days
  against. A full hall is worth roughly a tenth of your income.
- **The hall talks, and only about things that happened.** 162 slotted templates across eleven
  categories, inheriting the Town Crier's rule: a line either names something the simulation did
  or is tagged as colour. Members speak in their own voice, sleep in their own timezone, and
  answer you — greeting for greeting, congratulations or a ribbing for a brag.
- **The weekly Guild Bounty.** Posted Monday, judged Sunday, counted off things everybody was
  doing anyway. Targets scale per member so a hall of three is not asked for a hall of
  twenty-five's numbers, and the hall's own week is simulated off its members' dedication — so
  the bounty is genuinely co-operative: they get you past the half-chest line, your week is the
  difference between half a chest and all of it.
- **Guildmaster's desk** — applicants with resumes, promote, kick, and the motto — visible only
  to the player who founded the hall.
- **Save schema v10** — the guild slice, with a v9 fixture captured from real engine output.

### Fixed — Phase 10
- **The hall never worked on its own bounty.** Bot output was floored per member per day, and
  most bounties count in small whole numbers — three arena wins a week is under half a win a day,
  so every member rounded to nothing and a hall of twenty-two posted 0/44 all week. The fraction
  is now carried as the *odds* of a whole unit, which keeps the expected value exact and still
  replays identically. The private per-week table that made this possible to miss is gone; bot
  output reads off the bounty's own `perMember`, so target and simulation cannot drift apart.
- **The hall repeated itself.** Colour is drawn from thirty-two lines narrowed again by voice, so
  a three-day catch-up put the same greeting on screen four times — the loudest possible tell
  that nobody is home. A line is now off the table until it scrolls out of a twelve-message
  window, and nobody follows themselves while anyone else is awake.
- **Donating to one of the sixty looked like nothing happened.** Their pot has seven digits in it
  and the next step costs six, so ten thousand gold moved no number on the screen. The remainder
  toward the next step is now derived back out of the treasury and shown on a bar, the same one a
  founded hall has.
- **Guild halls advertised "78/25 members".** Phase 8's world generator predated the capacity
  rule and packed the popular halls well past it.
- **All sixty halls paid +1%.** Phase 8 seeded guild treasuries at 900 gold a member, a number
  chosen before `stepCost` existed — step 60 actually costs about twelve million. Retuned, the
  sixty now spread from +4.5% to +13%, which makes the browse list a decision.

### Added — Phase 9: Arena & Hall of Fame (the ladder you have been watching)
- **You are on the ladder now.** 1,501 rungs, and the bottom one is yours from the moment the
  world is raised — not from the moment the arena unlocks. That one change switched on a feature
  Phase 8 had shipped dormant: rivals are drawn from the band around your *rank*, so until you
  had one, nobody ever became a rival and the Crier never had a personal line to write.
- **The Proving Grounds.** Three opponents on nailed parchment with a wax seal for their rank,
  one above you, one level, one below. A ten-minute bell between fights, free rerolls once it has
  rung, and a Golden Die if you cannot wait.
- **Threat reads in the world's voice, never in numbers.** "Their armour looks far heavier than
  yours", not "armour 412". Scouting is post-1.0, and a read you can act on with certainty is a
  spreadsheet lookup rather than a judgement.
- **A duel is the same fight a bot has.** The real `fight()` against the opponent's materialized
  combatant, settled through the same ladder service the simulation calls thousands of times a
  day. Nothing is faked and no outcome is pre-decided — that is what "bots are fair" has to mean.
- **The climb is shown, not numbered.** Win and the ladder rows physically trade places on the
  result screen, past the neighbours you were already looking at on the board. Rank 500, 100, 10
  and 1 take the whole screen with a crowd-roar stinger and a one-time purse of Golden Dice.
- **They come for you while you sleep.** One or two bot attacks a day, more when a rivalry is hot,
  resolved against your snapshot during catch-up. Losses become revenge chips you can settle.
- **The weekly ladder payout**, Sunday midnight, by bracket. Fires **exactly once** across a
  fortnight away, a month away, and both directions of a daylight-saving change — because a week
  is identified by the date of the Sunday that ends it, and a date cannot be ambiguous.
- **The Hall of Fame.** All 1,501 heroes honour-sorted with search and jump-to-rank, your row
  pinned and carrying a "▲ 12" chip since your last visit; sixty guilds ranked by the honour of
  their best twenty; and a weekly Legends archive. Only ~35 rows are ever mounted, so it scrolls.
- **Save schema v9** — hero honour, the arena slice, and the Legends archive, with a v8 fixture
  captured mid-mission from real engine output.

### Fixed — Phase 9
- **Bot attacks fired again on every page reload.** A day's raid is seeded by its day index, so
  re-running it picks the same attacker and replays the same fight — which sounds idempotent and
  is the opposite, because the honour loss lands a second time. An e2e reload caught two honour
  going missing; `arena.lastRaidDay` is the high-water mark that fixes it.
- **The attack band was inverted.** Raids asked "who can *I* reach?" instead of "who can reach
  me?" — a difference that matters because the band is asymmetric (60 rungs up, 15 down), and
  getting it backwards left the player attackable only by people already behind them.
- **A milestone leap paid one rank and banked the other.** A first arena win landing inside the
  top 100 clears 500 on the way; it now pays both and fires the stinger for the better one.
- **`worldSchema.ladder` rejected the player.** The ladder floor was 0 and the player's id is -1,
  so the save would have failed validation the first time anyone took their seat.
- **The board went stale when the ladder moved.** Overnight drift left three cards drawn around a
  rung the player no longer stood on; the draw is now discarded when their rank changes.

### Added — Phase 8: World Simulation Core (the 1,500)
- **Aldenvale has people in it.** Fifteen hundred simulated heroes, spread across sixty guilds,
  on a ladder that already looks ninety days old when you arrive. They level, they fight each
  other, they climb past you, they go quiet for a fortnight and come back.
- **Ten named legends at the top** — Serathiel the Unbowed at rank one, and nine more behind her.
  Hand-written identities on the same stat curves as everybody else: the endgame has faces, not
  just numbers.
- **The Town Crier**, on the Tavern wall. Level-ups, ladder swaps, milestones, guild drama, rival
  taunts and the odd note about a wyvern over Frostfell Ridge. Entries arrive under a wax seal
  and categories collapse. **Every headline is backed by something the simulation actually did**
  — there is no "generate plausible news" path, and a test audits a hundred entries to keep it
  that way.
- **Rivals.** Two or three names near your rank who keep turning up, keep passing you and keep
  having opinions. Rivalries heat up with encounters and cool with distance, so they rotate
  naturally as you climb — nothing has to decide a rivalry is over.
- **"While you were away."** Come back after a week and the game tells you how many levels were
  gained, how many ranks changed hands, and — the number that stings — how many places you
  slipped by standing still.
- **The world keeps running whether you are there or not**, and catching up is free: a fortnight
  reconciles in 135 ms and a year in 177 ms, because anything past two weeks is integrated rather
  than replayed. Detail is spent where it can be seen — heroes near your rank get simulated hour
  by hour, the far ones are a single closed-form step.
- **The same seed always builds the same world**, at any timestamp, so a bug is reproducible and
  save-scumming cannot change fate.
- **Save schema v8** carries the world as pure divergence — 99 bytes a bot, 145 KB all in —
  because names, classes and personalities are recomputed from the seed rather than stored.
- `/dev/world`: the ladder, the level histogram and the Crier's output from any seed.

### Changed — Phase 8
- **The autosave no longer loses writes.** Saves were written in parallel with a guard that
  stopped a stale one overwriting the store — but not the disk. Once the world took the save to
  145 KB an older write regularly landed last, and a hero levelled to 10 could reload as 5.
  Writes are now serialised and coalescing: a burst of twenty changes costs two writes, and the
  second is always the newest state.
- The world catches up **after the first frame** rather than before it, so the hero, the HUD and
  the quest table are never waiting on a simulation none of them need.

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
