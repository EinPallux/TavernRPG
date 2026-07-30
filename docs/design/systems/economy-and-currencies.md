# System Spec — Economy & Currencies

> Every currency, every faucet, every sink — one map. The economy's job: gold always wanted
> (stat training is endless), Golden Dice always scarce-but-flowing (F2P premium with real
> decisions), materials always a choice (scrap vs sell). Numbers: `../balancing-formulas.md` §2–3, §9.

## 1. Currency roster

| Currency | Role | Cap | HUD |
|---|---|---|---|
| **Gold** 🪙 | soft currency, flows constantly | none (display shorthand 1.2k/3.4M) | always |
| **Golden Dice** 🎲 | premium, **earned only** (F2P covenant — never sold) | none, hoardable | always |
| **Honor** 🏅 | arena ladder metric (not spendable) | — | arena/HoF |
| **Materials** (Scrap/Essence/Starmetal) | crafting inputs | 9,999 ea | forge wallet |
| **Dungeon Keys** 🗝️ | one-time unlocks (items) | 1 ea | inventory |
| **Vigor** 🍺 | daily action budget | 100 + Ale | always (tankard) |

Deliberately **no** second soft currency at 1.0 (no arena tokens/guild coins — those are post-1.0
shop hooks). Fewer wallets, harder choices.

## 2. Gold faucets → sinks

**Faucets:** missions (primary, `goldPerVigor`) · patrol (55% rate) · arena wins (capped 10/day) ·
dungeon floors · selling items · daily tasks/calendar · guild bounty chest · Treasury buff (+%).
**Sinks:** **stat training (the endless one, §3 curve)** · shop purchases (3.2× value) · mount
rentals (~15–20% of daily gold) · guild founding/donations · pet feeding · confirm-gated nothing
else — gold pressure must stay simple and legible.

Health check (CI simulation): a day-30 on-curve player earns ~X gold and can afford ~L/4 stat
points *after* mount upkeep and one shop splurge — asserts the "always slightly broke" feel `[TUNE]`.

## 3. Golden Dice — the F2P premium promise

- **Income ≈ 1.6/day active** (tasks 1, calendar ~0.35, drops ~0.15, milestones ~0.1) — §9 table.
- **Sinks (each a distinct desire):** Fortune's Table roll 1 · Ale (+20 Vigor) 1, ≤3/day ·
  shop reroll 1 · mission skip 1 · arena cooldown skip 1, ≤3/day · **Royal Griffin 6/7 days** ·
  backpack rows 10/20/40 one-time · guild flex-donation.
- Weekly F2P budget ≈ 11 dice vs ~25 dice of wants → permanent, honest scarcity with zero paywall.
  The Griffin (exactly 6 dice/week) is the "subscription" decision anchoring the economy: riding
  it costs ~55% of the weekly dice income, every week.
- Never: dice→gold conversion (would collapse both loops); gold→dice (would trivialize premium).

## 4. Materials & keys

Scrap/Essence/Starmetal flows in `crafting-and-scrapping.md`; keys in `dungeons.md`. Both exist to
make *loot disposal* and *mission grinding* respectively feel purposeful beyond gold.

## 5. Reset ledger (what midnight does)

Vigor → 100 · Ale count → 0 · shop stocks reroll · mission board reroll (free) + free-reroll flag ·
arena rewarded-wins & skips → 0 · scrap count → 0 · pet feeds → 0 · daily tasks reroll · Daily Draw
free roll → 1 · login calendar tick. Weekly (Mon): banner rotation, guild bounty; (Sun): ladder
payout. Monthly (1st): grand banner. One reset engine owns this table (`daily-loop-and-retention.md`).

## 6. Inflation control

- Rewards scale polynomially with level, but so do stat costs and shop prices (all pinned to the
  same `goldPerVigor`/`statCost` primitives — ratios, not absolutes, are the tuned quantities).
- Item sale values pinned to level at *generation* (old loot deflates naturally — no stockpiling exploit).
- Dice have no exchange rate, so premium can't inflate.
- The CI economy simulation (`npm run economy`, also part of `npm test`) replays modeled days each
  build and asserts ratio drift stays within bands — economy regressions fail the build, not the
  player.

## 6b. As built — the simulation (Phase 6, pass 1)

`src/engine/economy/simulate.ts` plays modeled days through the **real** reward curves and records
every coin in and every coin out as a per-day `DayLedger`. Two rules keep it honest:

- **It calls the same functions the game does.** Nothing in it re-implements a curve, so a change
  to `missionPayout`, `goldPatrolPerHour` or `statCost` moves the sim the same day it moves the
  game. The moment the sim carries its own copy of a formula it starts asserting its own past.
- **It models only what exists.** Pass 1 (Phase 6) covered missions and patrol as faucets and
  training as the sink; **pass 2 (Phase 7)** added loot sales as a faucet and shop purchases and
  mount upkeep as sinks (`MODELLED_FAUCETS` / `MODELLED_SINKS`). The gacha, guild donations, pet
  feeding and dungeon gold are still absent because they are not built — a sim that invents
  numbers for unbuilt systems asserts a fiction, and the §2 health check above only becomes fully
  checkable once they land. Each is added to the constant as it ships, and the bands tighten
  with it.
- **Order of spending is deliberate**: upkeep, then gear, then training takes a share of what
  survives. That is what makes training the *residual* sink the design wants, and it is why
  adding shops in Phase 7 correctly slowed attribute growth instead of leaving it untouched.
  The measured shares are tabled in `../balancing-formulas.md` §9.

15 CI bands in `economy.test.ts`: the §0 pacing milestones, the "always slightly broke" purse (the
tuned quantity is *attribute points a day's income buys*, not a gold figure — a ratio survives
every reward-curve change an absolute would not), patrol staying strictly the fallback, and
ledger integrity. `/dev/economy` renders the same ledger day by day, so a red band can be traced
to the day and the faucet that broke it.

Two problems it found on its first run — a levelling curve ~10× too slow, and the gear-supply gap
that fix exposed — are recorded in `../balancing-formulas.md` §1 and §7.
