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

## 8. Data hooks

`WorldState` {seed, createdAt, lastSimAt, bots: BotRecord[], guilds, ladder, rivals, feed},
`simTick(worldState, toTimestamp)`, `materializeBot(botId)` → Combatant. Ladder mutations only via
the shared ladder service (`arena-and-hall-of-fame.md` §5).
