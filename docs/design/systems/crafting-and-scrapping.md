# System Spec — The Emberforge (Scrapping & Crafting)

> The alternative to selling: break gear into materials, gamble materials into new gear. RNG-driven
> by explicit user requirement — crafting is a slot machine with better odds than the world, not a
> deterministic vending machine.

Backdrop: (Emberforge uses a tinted variant of the weapon shop interior until a dedicated
background is supplied — asset hook `forge_background.png` ready). Keeper: **Torvald** (booming,
sentimental about metal).

## 1. Materials (3 tiers)

| Material | From scrapping | Icon |
|---|---|---|
| **Scrap** | Common/Uncommon gear | gear-icons: metal-scales |
| **Essence** | Rare/Epic gear | crystal-shine |
| **Starmetal** | Set gear + gacha dupes + dungeon boss bonus | meteor-impact |

Yields per scrapped item `[TUNE]`: C→ 3–5 Scrap · U→ 6–9 Scrap · R→ 4–6 Essence ·
E→ 9–14 Essence + 0–1 Starmetal · Set→ 3 Starmetal + 10 Essence (double confirm; set pieces warn
about collection progress). Yields stored on the item at generation (no retro changes).

## 2. Scrapping rules

- **10 scraps/day** (resets midnight) — S&F blacksmith-limit analog; makes sell-vs-scrap a real
  choice instead of "scrap everything".
- Scrap flow: drag to the crucible → smelt animation (particles, sparks) → material chips fly to
  the materials wallet (HUD-visible at forge only). Locked items can't be scrapped.

## 3. Crafting (RNG-driven)

**Standard craft:** choose a slot (10 tiles) → choose an investment tier:

| Investment | Cost `[TUNE]` | Rarity odds (C/U/R/E) |
|---|---|---|
| Rough forge | 12 Scrap | 45 / 40 / 14 / 1 |
| Fine forge | 30 Scrap + 6 Essence | 10 / 45 / 36 / 9 |
| Master forge | 12 Essence + 1 Starmetal | 0 / 25 / 52 / 23 |

- Crafted item = `generateItem` at player level, chosen slot, rolled rarity, forge RNG stream —
  same budgets as world loot; the value is *choosing the slot* and Epic odds far above drop tables.
- Forge moment: anvil strike mini-cinematic → rarity beam reveal (shared loot component). A pity
  ember meter (+1 per Master forge, at 5 → next Master forge is Epic-guaranteed) `[TUNE]`.

**Set recipe craft:** recipes drop from dungeon floors 5/10 and monthly banner pity track. A recipe
(per set) unlocks: 2 Starmetal + 20 Essence → craft a **random missing piece** of that set (100%
set result, RNG *which piece*). If set complete → rolls a level-refreshed copy of a random piece
(gear-refresh path for outleveled sets).

## 4. Why both sell AND scrap (economy stance)

Selling pays gold (→ stat training); scrapping pays progress toward *chosen-slot* gear and sets.
Rule of thumb the UI teaches: "Sell what's cheap, scrap what's interesting." Daily scrap cap + gold
hunger keep the tension permanent (economy doc has the faucet/sink table).

## 5. Data hooks

`MaterialWallet` {scrap, essence, starmetal}, `ForgeState` {scrapsUsedToday, emberMeter,
recipesOwned: SetId[]}, `craftItem(slot, tier, rng)`. All costs/odds in one `forgeConfig.ts`.
