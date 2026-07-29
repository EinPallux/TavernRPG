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
  shop reroll 1 · mission skip 1 · arena cooldown skip 1, ≤3/day · **Royal Griffin 12/14 days** ·
  backpack rows 10/20/40 one-time · guild flex-donation.
- Weekly F2P budget ≈ 11 dice vs ~25 dice of wants → permanent, honest scarcity with zero paywall.
  The Griffin (≈ 6/week amortized) is the "subscription" decision anchoring the economy.
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
- The CI economy simulation (`sim:economy` test) replays 90 modeled days each build and asserts
  ratio drift stays within bands — economy regressions fail the build, not the player.
