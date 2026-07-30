# System Spec — The Proving Grounds (Arena) & Hall of Fame

> "PvP" against the simulated server: near-rank duels, ladder swaps, honor, and the fully
> browsable Hall of Fame that makes rank feel real. Numbers: `../balancing-formulas.md` §10.

Backdrop: `arena_background.png`. Unlocks level 4.

## 1. Arena flow

1. Arena presents **3 opponents** near the player's rank (one slightly above, one near, one
   slightly below — ranks within ±4% of ladder position `[TUNE]`), showing portrait (class art),
   name, guild tag, level, honor, and a **threat read** ("Their armor looks heavier than yours") —
   never exact stats (scouting is post-1.0).
2. Reroll opponents: free every 10 min (same as cooldown), or 1 Golden Die.
3. Fight = full battle scene vs the bot's materialized combatant (world-sim provides level, gear
   score → stat block via the same budget curves players live under — bots are *fair*).
4. **Cooldown 10 min** between fights (skip: 1 Golden Die, max 3 skips/day).
5. Rewards: win vs ≥rank → **rank swap** + honor transfer + gold/XP (first **10 rewarded wins/day**;
   fights beyond still swap ranks). Loss → −2% honor, no rank drop beyond swap rule, no cost.
6. Revenge hook: losses to bot *attacks* (world-sim initiated, see §3) queue a "Revenge" chip on
   the arena screen (bypasses opponent draw, honors cooldown).

## 2. Hall of Fame

Backdrop: shared arena environment, laurel motif. Three tabs:

- **Heroes:** all 1,501 world heroes, honor-sorted, virtualized list with jump-to-rank/search;
  rows: rank, name (class icon), guild tag, level, honor. Player row pinned/highlighted; rank-delta
  chip shows movement since last visit ("▲ 12 overnight"). Clicking a bot → profile card (portrait,
  level, guild, honor history sparkline, rivalry status, "Challenge" if within arena range).
- **Guilds:** 60 guilds by guild honor (sum of top-20 members `[TUNE]`).
- **Legends:** weekly top-10 snapshot archive (world history, feeds Town Crier).

## 3. The ladder lives (world-sim contract)

- Bots fight each other on their schedules; ladder churns ~3–5%/day near any rank.
- Bots near the player occasionally **attack the player's rank** (resolved offline vs the player's
  snapshot; notified via Town Crier + revenge chip). Frequency scales with rivalry heat, capped
  1–2/day so mornings feel eventful, not punishing `[TUNE]`.
- Weekly ladder payout (Sunday midnight): Golden Dice by bracket (rank 1: 5 · top 10: 3 · top 100:
  2 · top 500: 1) + Town Crier "Weekly Legends" post. `[TUNE]`

## 4. Presentation

Opponent cards as dueling posters (nailed parchment, wax seal rank); winner poster gets a laurel
stamp. Rank-swap moment: ladder rows visibly slide (the climb *shown*, not just numbered).
Honor delta counts up on the result screen. Milestone ranks (500/100/10/1) trigger crowd-roar
stinger + Town Crier headline + one-time dice bonus.

## 5. Data hooks

`ArenaState` {draw: [botId×3], drawSeed, cooldownUntil, rewardedWinsToday, skipsToday, revengeQueue},
honor mutations via ladder service (single authority over rank swaps, used by player fights AND
world-sim bot fights — one code path, no divergence).

---

## As built (Phase 9)

**The player joins the ladder when the world is raised, not when the arena unlocks.** Phase 8
shipped a world the player could watch but not enter, and it quietly disabled a feature: rivals
are drawn from the band around the player's *rank*, and `updateRivals` bails when that rank is
zero — so nobody ever got a rival and the Crier never had a personal line to write. A seat costs
nothing before the Proving Grounds opens at level 4, and everything downstream of rank works the
moment they have one. `arena.lastRaidDay` and the attack band keep a bottom-ranked newcomer from
being raided on their first morning.

**One code path for every fight.** `resolveDuel` runs the real `fight()` against `materializeBot`
and settles it through `resolveLadderFight` — the same call the world simulation makes thousands
of times a day. The only thing the player's fights add is a purse, because bots have no gold.

**Two changes to the design above, both forced by building it:**

- **The three cards are labelled by rung gap, not by slot.** The draw still aims for one above,
  one level and one below, but a player at the foot of the ladder has nobody below and one at the
  top has nobody above — so a fixed "The climb / A fair fight / Safe points" caption becomes three
  identical labels exactly when the player most needs to tell the cards apart. "17 rungs up" is
  always true and always distinguishes.
- **Milestones pay every rank they clear, not the first one found.** A first-ever arena win that
  lands inside the top 100 has passed 500 on the way. Paying one and banking the other for
  whatever fight happens next reads as a bug from the player's chair.

**Not built, and why:** the profile card has no honor-history sparkline. The save keeps one honor
figure per bot, not a series, and a fortnight of samples for 1,500 heroes would add roughly 40 KB
to every write — for a line nobody makes a decision on. If it comes back, it wants a downsampled
weekly series on the ~60 heroes near the player, not all 1,500.
