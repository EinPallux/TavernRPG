# System Spec — World Simulation (The 1,500)

> TavernRPG's flagship system: a persistent cast of simulated heroes and guilds that make a
> single-player game feel like a lived-in server. Everything else (arena, Hall of Fame, guilds,
> Town Crier) is a *view* over this simulation. Numbers: `../balancing-formulas.md` §10–12.

## 1. Design goals

1. **Plausible at a glance, fair under inspection:** bots obey the same growth curves, class kits
   and gear budgets as the player — inspecting any profile shows a believable hero, and fighting
   one uses the real combat engine (never faked outcomes).
2. **Alive around the clock:** progression, arena churn, guild drama and chat continue while the
   player is away, then *reconcile instantly* on load (no visible "simulating…" stall > 1s for a
   week's absence).
3. **Deterministic:** world seed + elapsed time ⇒ identical world state. Bugs are reproducible;
   save-scumming can't change fate.
4. **Personal:** the sim generates *relationships* — rivals, guildmates, familiar names climbing
   alongside you. Names the player recognizes are the retention feature.

## 2. World generation (once per save)

- **1,500 heroes** from the world seed: name (generator, content plan §5), class (equal-ish split),
  level distribution simulating a ~90-day-old server (log-normal, median 28, p95 74, max 92),
  honor ladder seeded by level+noise, personality vector, timezone offset, guild membership
  (~55% start guilded across **60 guilds**).
- **Personality vector** per bot: `dedication` (0.15–1.1, drives daily XP), `aggression`
  (arena attack rate), `sociability` (chat/donation frequency), `hoarding` (gear score lag/lead),
  `volatility` (schedule noise, quit/return arcs). Archetype labels derive from the vector
  (Grinder, Casual, Weekend Warrior, Collector, Social, Rival-material) for content/AI-flavor use.
- **Top-10 named legends** hand-authored (fixed names/backstories in data, stats still on-curve)
  so the endgame chase has faces ("Serathiel the Unbowed", rank 1).

## 3. Bot progression model

- Daily XP = `dedication × playerReferenceXP(day) × scheduleNoise` (§12); levels via the shared
  XP curve; gear score follows level with personality lag; stat blocks derived from
  level+gearScore through the same budget formulas as players (`buildCombatant(bot)`).
- Bots "do activities" statistically (no per-bot pathfinding): mission counts, arena attacks,
  donations, chat lines are sampled per tick from schedule × personality — cheap, but leaves
  concrete traces (feed entries, chat lines, ladder swaps) the player can verify.
- Quit/return arcs: ~2%/month go dormant (volatility-weighted), some return with a chat line
  ("back after exams") — ladders breathe like real servers.

## 4. Simulation ticks & offline reconciliation

- **Online:** lightweight tick every 5 min (sample bot activity near the player's rank band +
  player's guild + rivals in detail; everything else coarse hourly).
- **On load:** elapsed time replayed in **1-hour coarse ticks** up to 14 days; absences beyond 14
  days use closed-form progression (integrate XP curves, resample ladder around the player, and
  synthesize summary events) — load-time budget ≤1s for any absence (perf test in CI).
- **Level-of-detail bands:** rivals & guildmates & ladder ±100 ranks = full event fidelity;
  ladder ±500 = swaps only; rest = distribution-level updates (indistinguishable in UI, 10× cheaper).
- All sampling from dedicated RNG streams (`sim:<worldSeed>:<hourBucket>`), so reconciliation is
  order-independent and deterministic.

## 5. Rivals (the personal antagonists)

- The sim maintains **2–3 active rivals**: picked from bots near the player's rank with compatible
  trajectory (rival archetypes in content plan §5). Rivalry *heat* rises with arena encounters,
  overtakes, guild bounty races; decays with rank separation (rivals rotate naturally as you climb).
- Rivals: attack the player's rank more often, taunt via Town Crier ("Kargath the Unlucky says
  your shield arm looks tired"), get revenge-chip priority, and generate a beat when *defeated
  for the first time* / overtaken (headline + small dice bonus). Endgame: the named legends are
  everyone's final rivals.

## 6. Town Crier (world news feed)

Home-panel feed (+ Tavern chalkboard variant) rendering sim events as headlines with timestamps:
level-ups of known names, ladder milestones, guild drama (merges, mass departures), weekly legends,
rival taunts, world flavor ("A wyvern was seen over Frostfell Ridge. Probably nothing."). Rules:
max ~30 entries/day surfaced, priority to *names the player knows* (rivals > guildmates > ladder
neighbors > strangers), collapsible categories, never blocks input. The feed is the proof-of-life
for the whole simulation — it gets animation polish (entries slide in with wax-seal stamps).

## 7. Performance & storage budgets

Bot record ≤ ~200 bytes hot state (identity/stats derivable from seed; only *divergence* is
stored: level, honor, guildId, heat, dormancy). 1,500 bots ≈ trivial. Sim tick ≤ 8ms online;
full 14-day reconciliation ≤ 1s. Chat/feed logs capped (200 / 300 entries) with archival trim.

## 7b. As built (Phase 8)

**Identity is derived, never stored.** A `BotRecord` is seven numbers — level, xp, honor, guild,
gear score, dormancy — and `engine/world/identity.ts` recomputes name, class, culture,
personality and timezone from `(worldSeed, botId)` on demand. Measured: **99 bytes a bot, 145 KB
for the whole world**, inside the ≤200 B/bot budget. The constraint this imposes is that every
identity function is a pure function of the *id*, never of a draw order — the level-of-detail
bands touch bots in whatever order they please.

**The level curve needed two fixes to match §12.** A dedication *multiplier* on the log-normal
moved the median from the intended 28 down to 24, because scaling a distribution moves its
centre; dedication and level are now correlated through a Gaussian copula, which puts the
diligent above the idle while leaving the marginal distribution exactly where the spec wants it.
And a hard clamp at 92 left seventy-five heroes tied on the ceiling — a wall, not a ladder — so
the top is now **compressed asymptotically** toward a ceiling of 82, with the ten legends
occupying 83–92 as a visible tier above the field. Measured: median 28, p95 74, max 92.

**Reconciliation.** Full band (rivals, guildmates, ±100 ranks, the top ten) replays hour by hour
with events; ±500 gets one pass a day, ladder swaps only; everyone else is a single closed-form
integration. Measured **135 ms for a fortnight and 177 ms for a year** — the year costs no more
because anything past fourteen days is integrated rather than replayed.

What is guaranteed: determinism (same world, span and context ⇒ same result), order-independence
*within* a tick, and that `integrateProgress` **composes** — a fortnight in one step equals
fourteen daily steps, which is what lets the closed-form path and the replay path meet at the
fourteen-day boundary without a seam. What is deliberately *not* guaranteed is that one long call
equals many short ones: the bands follow the player, so a bot drifting across a band boundary
between calls gets different treatment. That is the level-of-detail system working, and the
difference is invisible at the distances where it happens.

**The Crier may only report deltas.** Every `FeedEntry` carries the `SimEvent` behind it, and the
audit test walks a hundred entries checking it exists. The one exception is `flavour` — lines
about the world rather than its people — which carries `sourceEvent: null` and is tagged so the
audit can tell the two apart. Two things beyond raw priority proved necessary:

- **Category diversity.** The sim emits roughly twice as many ladder passes as level-ups and
  ladder scores higher, so pure score ranking produced fourteen ladder passes and nothing else.
  No category may take more than 40% of the board; entries held back for variety backfill the
  remainder, so a genuinely one-note day still fills up.
- **A warm-up day.** The world is generated with its clock a day in the past so the first
  catch-up has something to report. Without it a new hero walked into a Tavern with a blank
  board, and the whole simulation was invisible until the second session.

**Two things the phase changed outside itself.** The autosave is now **serialised and
coalescing**: writes used to run in parallel with a guard that stopped a stale one writing back
into the store, which protected the store but not the disk — once the save reached 145 KB an
older `put` regularly landed last, and a hero levelled to 10 reloaded as 5. And the world catches
up **after first paint** rather than before, so ~300 ms of simulation no longer sits in front of
the player's own hero on every load.

## 8. Data hooks

`WorldState` {seed, createdAt, lastSimAt, bots: BotRecord[], guilds, ladder, rivals, feed},
`simTick(worldState, toTimestamp)`, `materializeBot(botId)` → Combatant. Ladder mutations only via
the shared ladder service (`arena-and-hall-of-fame.md` §5).
