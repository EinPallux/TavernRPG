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

## 4b. As built (Phase 7 — the shops)

- **One screen, two keepers.** `components/shops/ShopScreen.tsx` serves both. The Armory and the
  Facet differ in what they stock, who stands behind the counter and what the room looks like —
  none of which is a reason for two components, and duplicating the shelf, the sold gaps, the
  restock clock, the reroll and the sell counter would guarantee the two drift apart.
- **The mix is guaranteed, not rolled** (`engine/shops/stock.ts`). A shop that *might* have no
  weapon is a shop the player learns to skip, and it would not close the gear-supply gap the
  Phase 6 pity floor is holding open. Only rarity is rolled.
- **The shelf is persisted, not regenerated.** It would be smaller to store the seed and redraw
  on read, but then a change to `generateItem` could swap what a player is looking at between
  opening the shop and clicking buy — and selling somebody a different item than the one on the
  card is the single bug a shop must not have.
- **Sold slots keep their place.** An index in a `sold` list, not a splice, so the remaining
  goods do not slide under the cursor after every purchase. The gap shows a wrapped parcel.
- **Restock is the Reset Engine's job.** The shelves are *cleared* at the day boundary and drawn
  lazily on the next visit. A shop noticing its own stored day was yesterday's is exactly the
  second clock that module exists to prevent.
- **The comparison is on the card, not on hover.** "Is this better than mine?" is the question
  the player walked in with; making them hover for it is making them work for the one thing they
  came for.
- **A full bag refuses the purchase.** `addItem` will discard the oldest satchel item to make
  room for a *drop* — right for loot nobody asked for, wrong for something just paid for in gold.

## 4c. As built (Phase 7 — `disposeItem`)

Selling and scrapping are the same act with different payouts and identical safety rules, so
`engine/items/dispose.ts` owns both. It **quotes before it acts**: `quoteDisposal` answers "what
would happen, and how hard should I ask first?" without touching the hero, so a screen can
neither invent a confirmation the engine does not want nor skip one it does.

- Locked → refused. Equipped → refused (`not-held`; disposal is bags-only). Set piece → refused
  for sale, `double` confirm for scrap.
- Rare and Epic ask once; Common and Uncommon go without ceremony, because a confirm on every
  Common turns the dialog into furniture the player clicks through without reading — which is how
  a Rare gets sold by accident.
- Scrap yields come off the item, rolled at generation, so a piece pays the same whenever it is
  broken up. The **materials wallet and the 10/day cap belong to the Emberforge** (Phase 12): the
  service takes the cap as a parameter and *reports* materials rather than crediting them, so
  Phase 12 is a wiring job rather than a rewrite.

## 4d. As built (Phase 7 — the Stables)

- A rental is one id and an expiry. Whether it is still running is **computed from the clock**,
  the same way a patrol shift is, so a mount bought on Monday is correctly expired when the tab
  reopens the following Tuesday with nothing having run in between. The lapsed record is kept
  rather than pruned — `activeMount()` is the only truth, and the record is what lets the screen
  say *which* mount ran out.
- **Renewing the same mount extends; switching replaces.** The spec's "buying a different mount
  replaces the remainder" is unchanged, but a flat "reset to seven days" would also rob anyone
  who renews before the last hour — so paying for the mount you already have adds a term to the
  existing expiry. Switching still forfeits the remainder, and the confirm names the animal and
  the days.
- **Runway is capped at two terms.** Prices are pinned to `goldPerVigor(level)` at purchase, so
  without a cap a level-10 player could buy a season of Warhorse for pocket change and ride it
  into their forties. Two terms keeps renewal safe while bounding that arbitrage to one term.
- The stall card shows what the tier does in the units missions are booked in — "20m → 14m" —
  because `−30%` is a number and `20 → 14` is a decision.

## 5. Data hooks

`ShopStock` {daySeed, items[6], rerollCount}, `MountState` {tier, expiresAt}. Stock generation uses
`generateItem` with shop context (items doc §3); sell/scrap route through one `disposeItem` service.
