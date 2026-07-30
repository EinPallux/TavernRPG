# CLAUDE.md — Working rules for Claude Code on TavernRPG

TavernRPG is a **fully-fledged** single-player fantasy browser RPG (S&F-inspired, simulated-MMO,
semi-idle) — not a prototype. Quality bar: every shipped slice is complete with animation,
feedback, edge cases and tests. Deployed on Vercel.

## Current state

**Design locked; Phases 0–11 complete.** All 20 questions in `USER_QUESTIONS.md` were answered on
2026-07-29 and the specs reflect the answers.

- **Phase 0:** scaffold, seeded RNG, GameClock, save system (Zod + migrations + IndexedDB).
- **Phase 1:** design tokens + motion system, the component kit (`src/components/ui/`), the
  hand-drawn icon family, the app shell (nav rail + HUD + place transitions), all 15 places
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

984 unit tests + 153 e2e green. Next work: `ROADMAP.md` **Phase 14 (The Menagerie)**.

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
Reset Engine the only thing that decides it is tomorrow. Phase 14's banner slots should follow
the same shape.

**The gacha's pity counter follows the set, not the week** (`gacha.weeklyPitySet`). Rolls banked
toward Oathsworn survive a Wolfblood week — but `pityFor()` reports **zero** on a week that will
not honour them, because a meter reading 12/20 under a card that cannot pay it is a lie told for
six days. The two behaviours look contradictory and are both required.

**Five day-or-count-keyed high-water marks now exist** — `arena.lastRaidDay`,
`guild.lastApplicantDay`, `lastChatDay`, `lastBountyDay`, and `gacha.monthlyPaidThrough`. The last
one is denominated in *rolls*, not rungs, and is the shape to copy: rungs are
`floor(rolls / 15)` arithmetic on totals rather than an increment on a boundary, so replaying it
cannot double-pay.

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
`gacha/` (schedule, roll, track), `economy/`, `reset/` ·
`src/data/` content — places, classes, itemBases, icons, zones, monsters, blurbs, barks,
patrolLog, mounts, shopBarks, arenaBarks, forgeBarks, vesnaBarks, names, guilds, guildChat,
bounties, dungeons, gearSets, banners, legends, crierTemplates ·
`src/state/` stores + persistence + the shared clock ·
`src/components/{ui,shell,icons,items,hero,battle,tavern,patrol,shops,stables,world,arena,guild,dungeons,forge,gacha}/` ·
`src/app/(game)/<place>/` one route per place · `src/styles/motion.ts` springs.
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
  sim) / `assets:sync` — keep this list current as scripts appear.

## Canon quick-reference (avoid re-deciding)

Realm **Aldenvale**, town **Emberhollow**, tavern **the Gilded Tankard**. Classes: Warrior, Bard,
Mage, Hunter, Swashbuckler. Currencies: Gold, **Golden Dice** (premium, earn-only), Honor,
materials (Scrap/Essence/Starmetal), dungeon keys, Vigor (100/day). Places: Tavern, Character,
Notice Board, Patrol, Armory, Gilded Facet, Emberforge, Stables, Menagerie, Proving Grounds,
Hall of Fame, Guild Hall, Undertavern, Fortune's Table. Keepers: Marla (tavern), Bram (armory),
Sela (jeweler), Torvald (forge), Odo (stables), Hildy (guard/arena), Madame Vesna (gacha).
World: 1,500 simulated heroes, 60 guilds, top-10 named legends, 2–3 active rivals.
