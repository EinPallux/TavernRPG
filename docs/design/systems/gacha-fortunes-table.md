# System Spec — Fortune's Table (Gacha)

> A back-room of the Gilded Tankard where **Madame Vesna** reads fortunes and spins the Wheel-of-
> What-May-Be. Genshin-style rotating banners tuned for a single-player, F2P-only economy: pity,
> dupe conversion, no currency purchases (Golden Dice are earned — economy doc §9).

## 1. The room

Accessed via a curtained door in the Tavern (unlocks level 8). Candle-lit table, tarot spread,
the **Wheel**. Vesna barks fortunes ("The cards say… laundry. No — glory. Could be either.").

## 2. Banners (3 concurrent, auto-rotating; schedule derived deterministically from the calendar date + world seed)

| Banner | Rotation | Featured | Purpose |
|---|---|---|---|
| **Daily Draw** | daily | a random *slot* highlighted (e.g. "Helms day") — featured slot odds ×3 | cheap daily ritual, 1 free roll/day |
| **Set of the Week** | weekly (Mon) | one **gear set** for your class (rate-up + dedicated pity) | the primary set-chase banner |
| **Vesna's Grand Reading** | monthly (1st) | premium spread: higher Epic odds, exclusive **pet** + set-recipe pity track | the "save up" banner |

Rotation preview: next banner teased with silhouette + countdown ("The cards are being shuffled…").

## 3. Roll economics

- **1 roll = 1 Golden Die** (income ≈1.6/day → ~11/week; rolling is a real decision vs Ale/Griffin/rerolls).
- **Daily Draw grants 1 free roll/day** (login ritual; free roll doesn't advance weekly pity).
- 10-roll spread on the monthly banner only (visual tarot spread, no discount — dice are too scarce
  for bulk pricing to be honest).

## 4. Drop table (Set of the Week; others are variants) `[TUNE]`

| Result | Odds |
|---|---|
| Featured set piece (missing-first) | 5% |
| Random Epic (your class where relevant) | 3% |
| Random Rare | 12% |
| Materials bundle (tier-weighted) | 30% |
| Gold cache (`45 × goldPerVigor`) | 22% |
| Ale (respects daily cap → converts to gold if capped) | 8% |
| Random Uncommon | 20% |

- **Pity: 20 rolls** on the weekly banner counter → guaranteed featured set piece (missing-first).
  Pity counter persists across weeks *for the same set* and shows as a filling tarot-card meter
  (transparent odds panel — exact percentages always visible; single-player honesty, no dark patterns).
- Monthly banner pity: every 15 rolls advances its track: set recipe → exclusive pet → big Starmetal cache.

## 5. Duplicates

Owned set pieces can still drop (post-completion): auto-convert → 2 Starmetal + set-recipe progress
shard (5 shards = 1 recipe). Conversion is shown as its own reveal frame (never feels like a whiff).

## 6. The roll moment (presentation is the product)

Dice tumble across the table (CSS 3D, ~1.4s, skippable after first) → tarot card lands face-down →
flip with rarity color buildup (grey shimmer → blue pulse → purple arc → **gold beam + set sigil +
Vesna gasp** for set pieces) → result card w/ equip/convert CTA. 10-roll: cards fan out, flip in
rhythm, best result last. Speed toggle persists.

## 7. Guardrails (single-player gacha ethics)

No real money, ever (F2P covenant in GDD §1). Odds panel on every banner. Pity visible. No
FOMO-exclusive *power*: monthly-exclusive pet is a LCK% variant, matched by an earnable pet next
patch cycle. Banner history log ("what did I roll") in Settings.

## 8. Data hooks

`BannerSchedule` (pure function of date+seed), `PityState` {weeklyCount, weeklySetId, monthlyTrack},
`rollBanner(bannerId, rng)` → `GachaResult`. Roll history persisted (last 200).
