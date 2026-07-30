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

## 9. As built (Phase 13)

`src/data/banners.ts` (every rate in the room), `src/data/vesnaBarks.ts`, `src/engine/gacha/` —
`schedule` (the rotation), `roll` (one card), `track` (the Grand Reading's rungs and the shard
counter) — `src/state/gachaActions.ts` for the banking, and `src/components/gacha/` for the room.
Numbers: `../balancing-formulas.md` §7.

Six decisions worth not re-making:

- **The schedule is derived, not stored.** All three banners are a pure function of
  `(dayKey, worldSeed, classId)`, and each seed is keyed on its *period* — the day, the week's
  Monday, the month — rather than on the day. A weekly banner seeded by the day re-rolls every
  morning. Nothing stores the schedule and nothing has to *advance* it, which keeps the Reset
  Engine the only thing in the game that decides it is tomorrow, and means a save opened after a
  fortnight already knows what was featured on every day it missed.
- **The panel and the dice read the same object.** `outcomeOdds()` and `rollOutcome()` both go
  through the banner's `odds` weights. This is rule 6 implemented as a shared constant rather
  than as a promise, and it is the third time the codebase has reached for that shape (guild
  bounty targets, forge tiers, now this).
- **Three banners, one table.** They differ in emphasis, not in kind: every roll produces one of
  the same seven outcomes. Three unrelated tables would let a future edit give the Daily Draw a
  payout the Grand Reading cannot produce, and no type would catch it.
- **The pity counter follows the set, not the week** (§4), which needs two fields — the count and
  the set it belongs to. But the *meter* shows zero on a week that will not honour it. Both are
  required: the rolls are not lost, and a meter reading 12/20 under a card that cannot pay it
  would be a lie told for six days.
- **The Grand Reading has no featured pity because its track is its floor.** Fifteen cards always
  buy a rung. The track does not loop — three rungs and it stops — or the monthly would be
  strictly better than the weekly and the choice between them would evaporate.
- **No card is ever nothing.** A featured hit is missing-first; a complete set converts on the
  table with its own reveal frame; an Ale the player cannot drink pays gold. The rule is asserted
  directly in `gacha.test.ts` rather than left as an emergent property.

Two departures from the spec above, both deliberate:

- **The daily's rate-up moves *which slot*, not how often "featured" comes up.** §2 says "featured
  slot odds ×3"; that is implemented as a 3:1 weight on the highlighted slot within the featured
  result, and the odds panel says so. Raising two numbers at once would make the rate-up
  unverifiable from the panel.
- **The exclusive pet is recorded by its source, not in a pet inventory.** `gacha.pets` lists only
  what Vesna handed over. The Menagerie (Phase 14) derives ownership of all twelve from their
  documented sources — dungeon trophies, mission counters, arena rank, the login calendar — every
  one of which is already a fact in the save. A second "pets owned" list would be the same fact
  written twice and free to drift.
