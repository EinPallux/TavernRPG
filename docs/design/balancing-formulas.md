# Balancing & Formulas (Canonical Numbers)

> **This file is the single home for cross-system curves.** System docs describe *mechanics* and
> reference these constants. Anything tagged `[TUNE]` is a starting value expected to move during
> Phase 17 (Balancing) — change it here, nowhere else. All randomness uses the seeded RNG streams
> defined in `docs/tech/architecture.md` (no `Math.random()` anywhere in game logic).

## 0. Pacing targets (what the curves must produce)

| Milestone | Target (active daily player, ~45 min/day) |
|---|---|
| Level 10 (all features unlocked) | Day 2–3 |
| Level 25 (Barrowdeep unlocked) | ~Week 2 |
| Level 55, 1–2 set pieces equipped | ~Day 30 |
| First full 5-piece set | Day 45–60 |
| Hall of Fame top 100 | Month 2–3 |
| Rank 1 (campaign goal) | Month 6+ (bots keep progressing too) |

**Measured, Phase 17** (`npm run pacing`, reference player = `ACTIVE_PLAYER`):

| Milestone | Target | Measured | Drift |
|---|---|---|---|
| Level 10 | day 3 | **3.5** | +17% |
| Level 25 | day 14 | **11.4** | −19% |
| Level 55 | day 30 | **34.5** | +15% |
| First set piece | day 30 | **12.5** | −58% |
| Full 5-piece set | day 52 | **125** | +140% ⚠ |
| Hall of Fame top 100 | day 75 | **45** | −40% |

The three level rows are inside the ±20% the ROADMAP asks for, and `pacing.test.ts` enforces
them. Two rows are **not** tuning problems and are logged as open questions rather than quietly
adjusted: the L25 row cannot be hit alongside the other two by any monotone curve (Q22), and the
full-set chase is ~2.4× slower than promised because mission drops carry `set: 0` and only
Vesna's featured card feeds it (Q23).

Milestones are reported in **fractional days**. A day-indexed ledger rounds every milestone up to
the end of the day it landed on, which at a three-day target is a third of the budget — enough on
its own to fail a curve that is inside tolerance.

## 1. Experience & levels

- XP to go from level `L` to `L+1`: `xpNeeded(L) = round(60 · L^2.1 + 240 · L)` `[TUNE]`
  - L1→2: 300 · L10→11: 9,954 · L25→26: 57,740 · L50→51: 233,814 · L100→101: 974,936
  - (Exact values, asserted by `src/engine/progression/progression.test.ts`.)
- No level cap. Level-up: full heal in dungeon context, celebratory FX, +0 free stat points
  (stats are bought with gold — S&F model).
- Mission XP per Vigor point at level `L`: `xpPerVigor(L) = xpNeeded(L) / vigorPerLevel(L)`,
  where `vigorPerLevel(L) = 28 + 1.2·L` `[TUNE]`
  - **Retuned in Phase 6.** The original was a flat `/320`, which made levels-per-day *constant*
    (100 Vigor → 0.31 levels, at level 2 and at level 200 alike) and put **level 10 — where the
    last feature gate opens — on day 29**. The prose beside it said "~3.2 levels/day early game",
    which is `/32`: the shipped constant had an extra zero, and neither value produces a curve.
  - Growing the divisor with level is what makes it a curve: fast onboarding, a long tail.
    Measured against §0, missions only, 100 Vigor/day — **L10 day 4 · L25 day 11 · L55 day 34**.
  - **Known gap:** §0 also wants L100 around day 180. Missions alone reach it around day 88, and
    no simple divisor fits both ends — §0 implies 1.8 levels/day to L55 and then 0.3 to L100, a
    6× deceleration. Dailies, arena and dungeons all add XP and will pull every figure *earlier*,
    so the endgame curve is re-fit in Phase 17 once they are in the economy model. The
    simulation (`src/engine/economy/economy.test.ts`) measures all four milestones every build.
- Arena win XP: `12 × xpPerVigor(L)` (first 10 wins/day). Dungeon floor win: `90 × xpPerVigor(L)`.
- Patrol XP: `4 × xpPerVigor(L)` per hour (deliberately weak vs. missions).

## 2. Gold

- Mission gold per Vigor point: `goldPerVigor(L) = round(3.5 · L^1.35 + 8)` `[TUNE]`
  - L1: 12 · L5: 39 · L10: 86 · L25: 278 · L50: 696 · L100: 1,762
  - (Exact values, asserted by `src/engine/progression/rewards.test.ts`.)
  - A full day of Vigor is therefore worth `100 × goldPerVigor(L)` — and **rewards are linear in
    Vigor**, so twenty 5-minute missions pay exactly what five 20-minute ones do. Long missions
    are bought with better *odds* (§7), never with a better rate.
- Patrol gold per hour: `goldPatrol(L) = 14 · goldPerVigor(L) · 0.55` (≈55% of mission rate) `[TUNE]`
- Arena win gold: `25 × goldPerVigor(L)` (first 10 wins/day).
- Item sale value: `itemValue = baseSlotValue(L) · rarityMult` where `baseSlotValue(L) = 6 · L^1.35`
  and rarityMult = Common 1 / Uncommon 2.2 / Rare 5 / Epic 12 / Set 25. Shops buy at 100% of value,
  **shop purchase price = 3.2 × value** (buying is a splurge, selling is income). `[TUNE]`

## 3. Attribute training costs (primary gold sink)

Cost of buying the `n`-th point of an attribute (points bought with gold only, `n` counts per-attribute):

`statCost(n) = round(2 + 0.6 · n^1.65)` gold `[TUNE]`

- n=10: 29 · n=50: 383 · n=100: 1,199 · n=300: 7,337 · n=1000: 53,477
  (Exact values, asserted by `src/engine/progression/progression.test.ts`.)
- Soft cap via price alone; no hard cap. UI offers +1 / +5 / +25 / Max-affordable buys.
- Design check: a day's mission gold at level L should buy roughly **L/2 points** spread across
  attributes early on, decaying to ~L/6 by level 100 (keeps missions → stats → harder missions loop taut).

## 4. Combat (full spec in `systems/combat.md`)

**Tuned in Phase 3 against the simulation harness — these are measured values, not estimates.**

| Class | HP factor | DR cap | Weapon damage ×| Spread | Signature |
|---|---|---|---|---|---|
| Warrior | 4.2 | 35% | 0.935 | ±20% | Block 25% |
| Bard | 3.6 | 22% | 1.382 | ±25% | Verses |
| Mage | 3.4 | 15% | 1.990 | ±45% | Arcane Certainty (defences at 62%) |
| Hunter | 3.6 | 25% | 1.030 | ±22% | Dodge 40% |
| Swashbuckler | 3.8 | 25% | 0.918 | ±20% | Flurry 60% @75% + Parry 15% |

- `HP = CON · (level + 1) · classHpFactor`
- Hit damage: `roll(weaponMin..weaponMax) · (1 + mainStat/10) · critMult · (1 − armorDR)`
- `armorDR = min(totalArmor / (attackerLevel · 50), classDRcap)`
- Crit: `critChance = min(luck · 5 / (2 · opponentLevel), 50%)`, `critMult = 2.0`.
- Weapon damage: `avg = (4 + 2.4·level) · rarityFactor · classWeaponDamageFactor`. The class factor
  is what pays for the survivability spread — without it, high-HP classes were strictly better
  (see `systems/characters-and-classes.md` §"Phase 3 rebalance").
- Initiative: dexterity-weighted, damped toward even (`0.5 + (dexShare − 0.5) · 0.8`).
- Round cap 100 → higher remaining HP-fraction wins; exact tie → defender wins (attacker risk).

**Measured outcome** (levels 10/25/50/100, thousands of fights each): mirrors 49–52%; per-class
average across all opponents 49.3–50.6%; worst single matchup 67%; fights 4–16 rounds. A deliberate
counter triangle exists: Bard > Mage > Hunter > Bard. CI asserts all of it
(`src/engine/combat/balance.test.ts`).

## 5. Enemy scaling

- Mission monster at player level L: level `L + jitter(−1..+2)`; attributes from **monster archetype
  templates** (bruiser/skirmisher/caster/tank/swarm) budgeted to `statBudget(L) = 12 + 5.2·L` total
  points distributed per archetype weights; HP factor per archetype (2.5–3.5). `[TUNE]`
- Mission **win-rate target ≥ 97%** for a player whose stats track the level curve (missions are
  pacing, not challenge; losses come from long gear neglect).
- **Fight length is a balance constraint, not just a presentation one.** An archetype is out of
  band if the median fight against an on-curve hero runs past ~12 rounds. The Phase 4 retune of
  the **tank** (hp 5.0 → 3.2, armour ×1.5 → ×1.2, DR cap 0.45 → 0.30, block 20% → 15%, damage
  ×0.75 → ×1.2) came from that rule: the original stacked four defences and produced 23-round
  average fights the hero still won 99.7% of the time. It is still the beefiest thing in a zone
  (its 0.5 CON weight sees to that) at ~11 rounds, and now hits hard enough to be worth
  respecting. Measured after the change: mission win rates 99.5–100%, still inside the ≥97% floor.
- Dungeon floor monster level: `dungeonBase + floor · dungeonStep` — Rat Cellars 12+2·f (14–32),
  Barrowdeep 28+3·f (31–58), Emberdeep 55+4·f (59–95). Stat budgets ×1.35 vs same-level mission
  monsters, boss floors (5, 10) ×1.6 with a signature proc. `[TUNE]`

**As built (Phase 11).** Two corrections, both measured rather than argued.

- **Archetype is worth up to twelve levels.** Against an on-curve reference hero at ×1.35, the
  level needed to clear a level-40 monster runs swarm 27, caster 32, skirmisher 34, bruiser 38,
  tank 39. That spread is larger than the level curve gains across six floors, so an archetype
  order picked for flavour dominates the ramp: the first draft had Barrowdeep floor 7 clearing at
  level 33 when floor 6 needed 46. All three dungeons now run **swarm → caster → skirmisher →
  bruiser → tank**, pushing in the same direction as the level curve. The resulting clear-level
  ramps are Rat Cellars 8→37, Barrowdeep 20→66, Emberdeep 50→110, all non-decreasing, all
  asserted in `engine/dungeons/dungeons.test.ts`.
- **Mid-bosses run ×1.5, not ×1.6.** At the flat ×1.6 the floor-5 bump was worth more than the
  four levels Emberdeep's curve gains in a step, so its floor 5 was harder than its floor 6. The
  smaller step is the one the design already implies — **floor 5 teaches what floor 10 tests** —
  and each mid-boss carries a weaker version of its own finale's signature.

A signature is worth 2–5 levels of clear difficulty on top of the budget (Vulkarr's the most, at
5). That is the right share: the wall is the stat budget, and the signature is what makes the
wall *memorable*.

**Floor rewards.** `FLOOR_VIGOR_EQUIVALENT = 90` per floor (spec §2), ×1.5 on bosses. **Gold is
priced at the floor's level and XP at the lower of the floor's and the hero's**, which is not
symmetry for its own sake. Gold is absolute, so pricing it at the floor makes sweeping an old
dungeon at level 90 worth pocket change and needs no rule forbidding it. XP is a share of *a*
level's requirement, and pricing that at the floor meant a level-10 delver banked two level-14
levels per clear — the four floors behind the Rusty Key would have taken them to 20 in one visit.

## 6. Vigor & mission durations

- Vigor 100/day, reset at local midnight. Base durations 5/10/15/20 min; Vigor cost = base minutes.
- Mount reduction applies to duration only (−10/−20/−30/−50%), never to cost or rewards.
- Ale: +20 Vigor, max 3/day, 1 Golden Die each (rare free Ales from tasks/calendar).
- Rewards scale linearly with Vigor cost; the 20-min mission also carries the highest item-drop odds
  (see §7) so long missions stay attractive.

## 7. Drop rates `[TUNE]`

| Source | Item chance | Rarity weights (C/U/R/E/Set) |
|---|---|---|
| Mission 5/10/15 min | 25% | 62 / 26 / 9.5 / 2.5 / 0 |
| Mission 20 min | 38% | 55 / 28 / 13 / 4 / 0 |
| Dungeon floor 1–9 | 50% + 25% separate epic roll | normal roll: 40/32/20/8/0; epic roll grants Epic; Set replaces Epic at 20% of epic hits |
| Dungeon floor 10 | 100% Epic **or** Set (50/50) | — |
| Shops stock (6 slots) | — | 30 / 38 / 24 / 8 / 0 (never Set) |
| Fortune's Table | see the banner tables below | weekly pity 20 |
| Golden Die from mission | 1.5% per 20-min mission, 0.6% others | — |
| Dungeon key drop | 6% per mission once dungeon level-gate reached (until key owned) | — |
| Ale drop | 2% per mission, cap 1/day | — |
| Tavern Scraps | 16% per mission, 2 at a time `[TUNE]` | — |
| Frost Fox egg | 0.5% per mission in Silverpine Pass / Frostfell Ridge, once only | — |
| Pet unlocks (the other eleven) | dungeon firsts & fixed milestones (deterministic, no RNG) | — |

**Drop slot weighting and the weapon floor (Phase 6).** Item chance and rarity are as published
above; *which slot* a drop lands in is not uniform. Weapon 22 / chest 14 / offhand 10 / helmet,
gloves, boots, belt 9 each / amulet, ring, trinket 6. Damage is linear in the weapon, so a hero
whose weapon lags loses regardless of the rest of their kit — and with ten slots at a 25% drop
chance, a uniform roll yields a weapon roughly once every forty missions.

Weighting raises the rate but cannot put a floor under it: measured at every weapon weight from
22 to 40, at least one class in five still finished a 60-mission run on its **starter weapon**,
with its win rate sliding from 100% to 40%. So a **pity rule** applies — a hero whose weapon is
5+ levels behind gets a weapon on their next drop. Pity decides *what* a drop is, never *whether*
one happens, so the published item chance is untouched. It matters less once Bram's Armory opens
in Phase 7 and gold can simply buy a weapon; it remains the floor for a player who never shops.

**Shop shelves as built (Phase 7).** Bram's six slots are a *guaranteed mix*, not six rolls:
1 weapon + 1 offhand (class-locked) + 3 distinct armour pieces + 1 wildcard. Sela's are 2 rings +
2 amulets + 1 trinket + 1 wildcard jewellery. Only rarity is rolled, off the table above. The
guarantee is what makes the shop a *fix* for gear supply rather than a second slot machine — a
player whose weapon has fallen behind can buy one on any day, at any level, for
`3.2 × itemValue`. Reroll is 1 Golden Die with no free one (unlike the mission board, whose free
daily reroll exists because the day's *work* must always be there).

**The Emberforge as built (Phase 12).** All of it lives in `src/engine/forge/forgeConfig.ts`, and
the crafting screen renders those tables directly — the promise that odds are always visible only
survives if the tile the player reads and the roll the engine makes are the *same object*.

| Investment | Cost `[TUNE]` | C / U / R / E | Feeds pity |
|---|---|---|---|
| Rough forge | 12 Scrap | 45 / 40 / 14 / 1 | no |
| Fine forge | 30 Scrap + 6 Essence | 10 / 45 / 36 / 9 | no |
| Master forge | 12 Essence + 1 Starmetal | 0 / 25 / 52 / 23 | yes |

`EMBER_PITY = 5` `[TUNE]` — the fifth Master forge banks the fifth ember, and the *next* one is a
guaranteed Epic. Checked **before** the roll, not after: a meter that only pays when the dice
would have failed silently eats the Epics you were going to get anyway. Only the Master tier feeds
it, because that is the tier being gambled on. `SCRAPS_PER_DAY = 10` `[TUNE]` is what keeps
sell-vs-scrap a live choice rather than "scrap everything"; `RECIPE_COST = 20 Essence + 2
Starmetal` `[TUNE]` is deliberately steeper than a Master forge, because a recipe craft is a
*guaranteed* set piece and the only path that cannot hand back a duplicate.

**Set acquisition (Phase 12).** `SET_REPLACES_EPIC = 0.20` below dungeon floor 10 and
`CLEAR_SET_CHANCE = 0.50` on the clear, per the table above. Neither can produce a piece already
owned: `drawMissingPiece()` draws uniformly across every missing slot of **both** the class's
sets, not a set first and then a slot — drawing a set first keeps offering pieces of a finished
one, so the chase stalls at the end. `forge.test.ts` simulates the documented sources and asserts
a five-piece set converges; the same suite holds a full-set mirror inside **42–58%** (gear-sets
spec §3).

**Fortune's Table as built (Phase 13).** All three banners run one seven-outcome table with
different weights, in `src/data/banners.ts`, and the odds panel renders those weights directly —
the same shared-object discipline the forge tiers use.

| Outcome | Daily Draw | Set of the Week | Grand Reading |
|---|---|---|---|
| Featured | 14% | 5% | 9% |
| Epic gear | 2% | 3% | 6% |
| Rare gear | 12% | 12% | 15% |
| Materials | 28% | 30% | 26% |
| Gold cache | 22% | 22% | 20% |
| Ale | 6% | 8% | 4% |
| Uncommon gear | 16% | 20% | 20% |

`[TUNE]` A gold cache is `45 × goldPerVigor(level)`; a capped Ale pays 60% of one instead of
nothing. Pity is **20** on the weekly banner only, checked *before* the roll, and the counter
follows the featured **set** rather than the week. The Grand Reading has no featured pity because
its track is its floor: `MONTHLY_TRACK_STEP = 15` `[TUNE]` buys a rung, three rungs (a set recipe,
the Owl of Vesna, six Starmetal), and it does not loop. Duplicate set pieces convert to
`DUPE_STARMETAL = 2` plus a shard, `SHARDS_PER_RECIPE = 5`. `SNAIL_CHANCE = 1%` rides *on top of*
a monthly card rather than replacing one.

The Daily Draw's rate-up is `DAILY_SLOT_RATE_UP = 3` on the highlighted **slot** within a featured
result — it does not change how often "featured" comes up, and `gacha.test.ts` asserts the
featured share is the same on every day of the week.

### Measured shares, Phase 13 (`npm run economy`)

Sixty modelled days, active player, now including 1.6 cards a day at Fortune's Table:

| faucet | share |
|---|---|
| missions | 52.5% |
| patrol | 33.0% |
| loot sales | 4.0% |
| **gacha** | **10.5%** |

The band asserts gacha stays under 12% and below the mission faucet. The room is a *dice* sink
first; if rolling ever paid better per day than running missions, the correct play would be to
stop playing the game and spin the wheel.

### The Menagerie, Phase 14 (`npm run economy`)

Scraps are the pace, not the three-a-day cap. At 16% × 2 a player spending 100 Vigor on 20-minute
contracts banks ~1.6 a day, which takes one companion from level 1 to 50 in **31 modelled days** —
the "a month per pet" the spec claims. The rate was 8% until this pass measured it: a pet took
62 days and the published cap was unreachable, so the stall's "3/3 feeds left" was advertising a
pace the game could not supply.

| pet lever | value |
|---|---|
| boost curve | `1% + 0.08%/level` → **4.9%** at 50 `[TUNE]` |
| half rate (armour, gold find, XP) | half the level term, **not** the rarity bonus |
| rarity bonus | **+0.5%** flat per step, at levels 15 / 30 / 45 `[TUNE]` |
| ceiling (level 50, Epic, full rate) | **+6.4%** |
| reference: average Rare chest main-stat line, level 30 | **+6.6%** |
| feed cost | `18 × pet level` gold + 1 Scrap `[TUNE]` |
| feeding as a share of all gold sinks | **0.5–1.2%** |

The ceiling clears the one-gear-upgrade bar by two tenths of a percent, on purpose.
`pets.test.ts` measures **both** sides against the live generators rather than freezing either
number, so tuning gear down is caught as readily as tuning pets up.

## 8. Item stat budgets

- Attribute budget on a level-L item: `itemBudget(L) = round((2 + 1.05·L) · rarityFactor · slotFactor)`
  with rarityFactor C 0.55 / U 0.75 / R 1.0 / E 1.35 / Set 1.5; slotFactor Weapon 1.2, Chest 1.1,
  other armor 1.0, jewelry 0.9. Budget splits across 1 (C/U), 2 (R), 3 (E) attributes; Set pieces
  have fixed curated statlines. Epics may roll "all attributes" at 0.45× budget each. `[TUNE]`
- Weapon damage at level L: `avg = 4 + 2.4·L·slotWeaponFactor(class)`, spread ±20% (Mage ±45%);
  offhands carry attributes + class proc bonuses (shield: +block dmg reduction; quiver: +crit dmg;
  orb: +spell spread floor; songbook: +verse duration; parry dagger: +double-strike dmg). `[TUNE]`
- Armor value on armor pieces: `armor(L) = round(L · 7 · rarityFactor · pieceWeight)` distributed
  Helm .18 / Chest .30 / Gloves .14 / Boots .14 / Belt .12 (+ shield .12 for Warriors). `[TUNE]`

## 9. Golden Dice economy (premium, earn-only)

**Faucets (expected/day for active player ≈ 1.6):** daily task full-clear 1 · login calendar avg 0.35 ·
mission drops ~0.15 · arena/dungeon/guild milestones ~0.1 amortized.
**Sinks:** gacha roll 1 · Ale 1 · shop reroll 1 · arena cooldown skip 1 (max 3/day) · Royal Griffin
6 per 7 days · backpack +5 slots: 10/20/40 (one-time ×3). Target: meaningful weekly tension between
"roll the banner" vs "ride the Griffin" vs "one more Ale". `[TUNE]`

### Measured shares, Phase 7 (`npm run economy`)

Sixty modelled days, active player (all Vigor, 8h patrol, a Warhorse, two shop pieces a week):

| | share |
|---|---|
| **In:** missions | 58.7% |
| **In:** patrol | 36.9% |
| **In:** loot sales | 4.4% |
| **Out:** attribute training | 85.8% |
| **Out:** mount upkeep | 11.2% |
| **Out:** shop purchases | 3.1% |

Two things to read off this. Training dominating is **correct** — §2 calls it "the endless one",
and `statCost`'s `n^1.65` outruns every other sink by design. But **shops at 3.1% are close to
decoration**: at two pieces a week the markup barely dents a purse that is mostly going into
attributes anyway. That is not obviously wrong (buying gear is meant to be optional, and the
frugal control reaches the same level with *more* attribute points), but it means the Armory is
currently a gear-supply fix rather than a gold sink. `[TUNE]` — revisit in the Phase 17 balance
pass once the gacha, mounts-at-scale and guild donations are also in `MODELLED_SINKS`; if shops
should carry more of the sink load, the lever is the 3.2× multiplier, not the stock size.

## 10. Honor & ladder

- Initial bot honor spread: rank r → `honor ≈ 9800 − 6.1·r` for 1,500 bots `[TUNE]`.
- Win vs higher rank: swap ranks (S&F style) + honor transfer `round(0.02 · loserHonor)`.
- Win vs lower rank: +1 honor (discourage down-fighting); loss to attacker −2% honor, no rank loss
  below current position beyond the swap rule.
- Bots fight each other on schedule ticks; ladder churn ~3–5% of ranks/day around any given rank.

**As built (Phase 8).** Rank and honor are *separate consequences* of the same win, which is the
S&F model the rule above describes — so after a few days of simulation the ladder is no longer
sorted by honor, and rank 1 may hold less than rank 3. That is correct, not a bug: **rank is the
position, honor is the score.** They only coincide at world generation, where the ladder is
seeded from honor.

**As built (Phase 9) — the player's side of it.**

| Lever | Value | Where |
| --- | --- | --- |
| Opponents drawn | 3, one above / level / below | `arena/arena.ts` `DRAW_SIZE` |
| Draw band | ±4% of ladder position, floor 8 rungs | `DRAW_BAND_SHARE`, `MIN_DRAW_BAND` |
| Cooldown | 10 min; skip 1 die, 3/day | `COOLDOWN_MS`, `MAX_SKIPS_PER_DAY` |
| Reroll | free after the bell, else 1 die | `rerollCost` |
| Rewarded wins | 10/day; past that the rank still swaps | `REWARDED_WINS_PER_DAY` |
| Arena win purse | `25 × goldPerVigor(L)`, `12 × xpPerVigor(L)` | `arena/duel.ts` |
| Milestone dice | 500→1, 100→2, 10→3, 1→5, once ever | `MILESTONE_DICE` |
| Bot attacks | 1/day base, hard cap 2, scaled by rivalry heat | `arena/raids.ts` |
| Revenge queue | 5 unanswered losses | `REVENGE_QUEUE_CAP` |
| Weekly payout | Sunday: rank 1→5, ≤10→3, ≤100→2, ≤500→1 dice | `arena/payout.ts` |
| Guild honor | sum of the **top twenty** members `[TUNE]` | `world/halls.ts` |
| Newcomer honor | `max(10, round(50 − size·0.002))` | `world/ladder.ts` |

Two rules the numbers above do not show:

- **A day of raids rolls once, ever.** The attack is seeded by the day index, so re-running a day
  picks the same attacker and replays the same fight — which *applies the honor loss again*.
  `arena.lastRaidDay` is the high-water mark that stops a page reload being an attack.
- **Who may attack whom is asymmetric.** The band is 60 rungs up and 15 down, so "the ranks I can
  reach" (`attackableRanks`) and "the ranks that can reach me" (`attackersOf`) are different sets.
  A player at the very foot of the ladder has nobody below them and is left alone, which is right
  twice over: beating last place gains a bot nothing, and a new hero should not be raided on their
  first morning.

## 11. Guild economics

- Treasury/Drillmaster: 100 upgrade steps each; step `s` costs `500 · s^1.7` gold donated (any
  member); each step = +0.25% gold/XP → cap +25%. Bot members donate per their personality budget;
  a healthy bot guild reaches ~+15% by month 2. Guild Bounty weekly chest: gold pot + 1 Golden Die +
  materials, scaled to completion %. `[TUNE]`

**As built (Phase 10).** Three numbers had to be solved for rather than chosen.

- **`TREASURY_PER_MEMBER = 420_000`** (`world/generate.ts`). Phase 8 seeded a guild's treasury at
  900 gold a member — a figure invented before `stepCost` existed. Step 60 costs about twelve
  million, so every one of the sixty landed on step 4 and advertised +1%, and the browse list was
  a formality. At 420k a member the sixty spread **+4.5% to +13%, median +8.8%**, which puts the
  spec's "~+15% by month 2" at the top of the range rather than at the average, and makes which
  hall you join a real decision. Asserted in `guilds.test.ts` ("buffs worth choosing between").
- **`HALL_EFFORT = 0.82`** (`guilds/bounty.ts`). What a hall of *average* dedication gets done
  toward its own bounty in a week, without the player. It is the number that decides whether the
  bounty is co-operative or decorative: above 1 the hall clears it alone and the poster is
  scenery; below the 0.6 partial threshold the player cannot reach the line however hard they
  work. At 0.82 the hall reliably banks half a chest and **the player's week is the difference
  between half a chest and all of it.** Bot output is read off the bounty's own `perMember`, not
  a parallel table, so a change to a bounty target re-paces the simulation with it.
- **`MEAN_DEDICATION = 0.495`**, the population mean implied by §12's distribution (60% casual
  0.15–0.5, 30% regular 0.5–0.85, 10% hardcore 0.85–1.1). Divided back out so `HALL_EFFORT` means
  a share of the target rather than a share of what a maximally dedicated hall would manage.

Whole-number metrics are **rounded stochastically**: a member whose day comes to 0.27 arena wins
has a 27% chance of one win, rather than being floored to zero. Flooring was the original
implementation and it took the entire hall's contribution to nothing on four of the six metrics.
The roll comes off the same day-and-bot seed as everything else, so a week replays identically.

Guild buffs are the one multiplier that **compounds**: gold and XP together mean faster levels
mean higher payouts. A single day is exactly `1 + 0.0025 · steps`; over a month a maxed hall is
worth more than +25%, which is why `economy.test.ts` asserts the exact figure on one day and a
wider band over thirty.

## 12. Simulated-player progression

- Each bot has `dedication ∈ [0.15, 1.1]` (distribution: 60% casual 0.15–0.5, 30% regular 0.5–0.85,
  10% hardcore 0.85–1.1). Bot daily XP = `dedication · playerReferenceXP(day)` where
  `playerReferenceXP` is the §0 pacing curve; gear score follows with lag + noise. Top-10 bots are
  hand-tuned "named rivals" with dedication ≈ 1.0–1.1 so Rank 1 is a real chase. `[TUNE]`
- Bot levels at world-gen (day 0) seed a believable server age of ~90 days: level distribution
  log-normal, median ~28, p95 ~74, max ~92 — the player starts at the bottom of a living ladder.

**As built (Phase 8).** `median = exp(mu)` and `p95 = exp(mu + 1.645σ)` give `mu = ln(28)`,
`σ = ln(74/28)/1.645 ≈ 0.59`. Two corrections were needed to hit that:

- **Dedication correlates, it does not multiply.** Scaling the draw by a dedication factor moves
  the distribution's *centre* — the first implementation did exactly that and pulled the median
  from 28 to 24. Level and dedication are now joined by a Gaussian copula (correlation 0.65):
  the bot's dedication percentile becomes one z-score, noise another, and the two mix in
  quadrature. The diligent sit above the idle and the marginal distribution is untouched.
- **The ceiling compresses, it does not clamp.** At n = 1,500 a raw log-normal's top draw lands
  near level 185; clamping at 92 left ~75 heroes tied on the cap. Anything above level 70 is now
  bent asymptotically toward **82** for ordinary bots, with the ten legends taking 83–92 as an
  authored tier. Measured across seeds: median 27–28, p95 73–76, max 92, ~2% at the ordinary
  ceiling.

Bot hourly XP is anchored to the player's own curve (`VIGOR_PER_DAY × xpPerVigor(level)`), so a
change to player pacing re-paces the whole world with it rather than leaving 1,500 heroes behind.

## 13. Daily/weekly reward tables

- Daily tasks: 3 tasks → 40/30/30 points; chest at 100 pts: gold (= 60·goldPerVigor), 4 Essence,
  6 Scrap, **1 Golden Die**. All three tasks are required — 40+30+30 is exactly the chest line, and
  a board where two of three suffices makes the third task a suggestion. Weekly chest (7 daily
  clears): 3 dice + Ale ×2 + guaranteed Rare + Epic @ 25%.
- Task draw: day-seeded from `(worldSeed, dayKey)`, one metric per slot, never a locked room.
  Neglect weighting `1 + 0.85·(1 − familiarity)` where `familiarity = log10(1+done)/log10(501)`,
  capped under 2× across the whole range `[TUNE]`.
- Login calendar (28 days): gold/materials/Ale/Tavern-Scraps cadence, Dice on days 7/14/21, Epic
  item + Moss Tortoise day 28. Gold denominated in **Vigor**, so a square holds its worth as the
  hero climbs. Missing a day pauses (doesn't reset) the calendar. `[TUNE]`

### The dice paycheck, counted (Phase 15)

Golden Dice are never purchasable (rule 6), so the daily chest *is* the premium currency's supply
line. Over a 28-day month of perfect attendance:

| source | dice |
|---|---|
| daily chests (28 × 1) | **28** |
| weekly chests (4 × 3) | **12** |
| **month total** | **40** |

Plus mission and calendar drops. If the daily figure moves, the whole Fortune's Table economy
moves with it — `board.test.ts` asserts the month.

## 14. Onboarding (Phase 16)

Four numbers, all in the first twenty minutes and none of them touching the economy.

| constant | value | where | why |
|---|---|---|---|
| `FIRST_MISSION_MS` | 20,000 ms `[TUNE]` | `data/tutorial.ts` | Beat 2 must *end* for beat 3 to start. Five minutes on the second thing a player has ever done is where they close the tab. |
| `CALLOUT_DURATION` | 16,000 ms `[TUNE]` | `components/battle/BattleCallouts.tsx` | Twice the usual 8s pacing target, so three notes get ~4s each. Three notes over 8s is a slideshow. |
| `IDLE_POINTS` | 3 `[TUNE]` | `engine/tutorial/hints.ts` | "Unspent gold" is measured in *points affordable*, not coin: 5,000 gold is a fortune at level 3 and a rounding error at 40. Three points ≈ a day's training. |
| `UNLOCK_FLOURISH_MS` | 6,000 ms `[TUNE]` | `state/shellStore.ts` | How long a newly-opened rail row keeps its wash. |

**The shortened first contract is not a discount.** Only `endsAt` moves: the Vigor is spent at the
full duration cost and `resolveMission` prices the payout off `duration`, so the twenty seconds
cost the economy nothing and the sim never sees them. It fires once per save
(`missionsAccepted === 0`) and is skipped entirely for a player who opted out.

**The hint chip is ordered by perishability, not by value.** A banner ending tonight outranks
unspent stat points that will still be unspent tomorrow, even though the stat points are worth
more — the chip's job is to catch the thing you would regret missing. The order is the list in
`engine/tutorial/hints.ts#RULES`, and the first rule that has something to say wins.

## 15. Sound (Phase 17)

Nothing here touches the economy, but every value is a `[TUNE]` because "how loud" and "how often"
are exactly the kind of number that gets set once by whoever wrote the feature and never revisited.

| constant | value | where | why |
|---|---|---|---|
| `THROTTLE_MS.ui` | 45 ms `[TUNE]` | `data/sfx.ts` | A pointer sweeping a list asks for thirty ticks a second. |
| `THROTTLE_MS.combat` | 30 ms `[TUNE]` | `data/sfx.ts` | The loosest, because a fight is *meant* to be busy. |
| `THROTTLE_MS.reward` | 60 ms `[TUNE]` | `data/sfx.ts` | Rewards arrive in bursts (a chest is gold *and* dice *and* materials); one sound is the event. |
| `THROTTLE_MS.forge` | 80 ms `[TUNE]` | `data/sfx.ts` | Anvil strikes are 380 ms apart by design, so this only ever catches a double-click. |
| cue ceiling | 900 ms | `data/sfx.test.ts` | The Epic reveal, and nothing longer. |
| interface ceiling | 150 ms | `data/sfx.test.ts` | The four cues that fire on every click. |
| `BGM_SHARE` | 0.45 `[TUNE]` | `components/shell/AppShell.tsx` | Music rides at 45% of the master. One slider, two jobs: a loop as loud as a crit buries the crit. |
| `FADE_IN_MS` | 1,600 ms `[TUNE]` | `state/bgm.ts` | Long enough to read as a fade. |
| `FADE_OUT_MS` | 600 ms `[TUNE]` | `state/bgm.ts` | Faster than the fade in — leaving a tab should feel like a door closing, not a dissolve. |
| `UNLOCK_CUE_DELAY_MS` | 760 ms `[TUNE]` | `components/shell/UnlockWatcher.tsx` | See below. |

**Throttling is per family, and that is the whole design.** One global gate would mean the first
cue in a tick silences the rest — so on the exact frame a crit lands during a flurry of interface
ticks, the thing the player is watching loses to the thing they are only touching. Keyed on
`SfxCategory`, the two never compete. `state/sfx.test.ts` asserts it directly.

**Two reward cues in one tick is a collision, not a chord.** A level that opens a room fires
`level-up` and `unlock` in the same handler, and at a 60 ms gap the second is simply dropped —
the unlock cue would go unheard on precisely the levels it exists for. `UNLOCK_CUE_DELAY_MS`
parks it just past the level-up's own 700 ms length, which turns the collision into a phrase.
Anything else that wants to play two cues of one family at a moment needs the same treatment.

**The throttle runs on `ctx.currentTime`, not a wall clock.** It is the same time base the cues
are scheduled in, it is monotonic, and it does not care what the tab was doing. It is also the
only clock available: `Date.now` is lint-banned outside GameClock, and rightly — nothing about
gameplay should be able to read the wall time through the speaker.
