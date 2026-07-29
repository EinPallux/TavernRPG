# System Spec — Shops (The Armory & The Gilded Facet) & Stables

> Daily-rotating gear commerce plus the mount rental ladder. Numbers: `../balancing-formulas.md`
> §2, §7–9.

## 1. The Armory (weapon & armor shop)

Backdrop: `weaponshop_background.png`. Keeper: **Bram** (gruff, fair).

- **Stock: 6 items**, generated from the day-seed at player level: guaranteed mix = 1 weapon +
  1 offhand (player's class) + 3 armor pieces + 1 wildcard. Rarity weights §7 (never Set; Epic 8%).
- Restock at midnight; **manual reroll = 1 Golden Die** (unlimited, each reroll new seed).
- Prices: `3.2 × itemValue` (buying is a splurge). Hover-compare vs equipped built into stock cards.
- **Selling:** drag/click-sell at 100% `itemValue`; Rare+ asks confirm; Set pieces refuse sale
  ("Bram won't take heirlooms — try the Forge? No… keep it, hero.") — scrap-only (with double confirm).

## 2. The Gilded Facet (jewelcrafting shop)

Backdrop: `jewelcraftingshop_background.png`. Keeper: **Sela** (precise, kindly sharp).

- Stock: 6 items = 2 rings + 2 amulets + 1 trinket + 1 wildcard jewelry; same restock/reroll/pricing
  rules. Jewelry special lines (gold-find/XP %) make this the "economy gearing" stop.
- Sela also buys jewelry (and anything — one universal sell flow; shops share the sell backend).

## 3. Shared shop UX

- Stock cards on shelf shelves matching the backdrop lighting; sold slot leaves a charming gap
  (wrapped parcel) until restock.
- Restock countdown chip; reroll button with die cost and "new stock preview shimmer" animation.
- Purchases fly to backpack (full backpack → button disabled with tooltip, never a modal error).
- Keeper barks on browse/buy/sell/broke (rotating, capped frequency).

## 4. The Wandering Stables (mounts)

Backdrop: `stable_background.png`. Keeper: **Odo** (sleepy, loves the animals).

| Mount | Effect | Cost | Term |
|---|---|---|---|
| Pack Mule | −10% mission time | gold: `20 × goldPerVigor(L)` | 7 days |
| Dappled Courser | −20% | `55 × goldPerVigor(L)` | 7 days |
| Armored Warhorse | −30% | `130 × goldPerVigor(L)` | 7 days |
| **Royal Griffin** | **−50%** | **6 Golden Dice** | 7 days |

- **7-day rentals** (Q5 answered: shorter terms, faster recurring sink; prices re-pinned so the
  amortized share of daily gold is unchanged vs a 14-day model). One active mount; buying a
  different mount replaces the remainder (confirm shows lost days). Renewal reminder at 24h left
  (HUD chip pulse + Odo bark). No stacking, no partial refunds.
- Mount affects mission *timer only* (never Vigor cost, rewards, or patrol).
- Stable screen shows the four stalls with idle mount animations; active mount appears as a small
  chip on the HUD and beside the mission timer.
- `[TUNE]` costs pinned to `goldPerVigor` so rentals stay ~15–20% of daily gold at every level.

## 5. Data hooks

`ShopStock` {daySeed, items[6], rerollCount}, `MountState` {tier, expiresAt}. Stock generation uses
`generateItem` with shop context (items doc §3); sell/scrap route through one `disposeItem` service.
