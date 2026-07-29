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

## 1. Experience & levels

- XP to go from level `L` to `L+1`: `xpNeeded(L) = round(60 · L^2.1 + 240 · L)` `[TUNE]`
  - L1→2: 300 · L10→11: 9,954 · L25→26: 57,740 · L50→51: 233,814 · L100→101: 974,936
  - (Exact values, asserted by `src/engine/progression/progression.test.ts`.)
- No level cap. Level-up: full heal in dungeon context, celebratory FX, +0 free stat points
  (stats are bought with gold — S&F model).
- Mission XP per Vigor point at level `L`: `xpPerVigor(L) = xpNeeded(L) / 320` `[TUNE]`
  → ~3.2 levels/day early game from missions alone, slowing naturally as `xpNeeded` outgrows income.
- Arena win XP: `12 × xpPerVigor(L)` (first 10 wins/day). Dungeon floor win: `90 × xpPerVigor(L)`.
- Patrol XP: `4 × xpPerVigor(L)` per hour (deliberately weak vs. missions).

## 2. Gold

- Mission gold per Vigor point: `goldPerVigor(L) = round(3.5 · L^1.35 + 8)` `[TUNE]`
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
  points distributed per archetype weights; HP factor per archetype (2.5–5.0). `[TUNE]`
- Mission **win-rate target ≥ 97%** for a player whose stats track the level curve (missions are
  pacing, not challenge; losses come from long gear neglect).
- Dungeon floor monster level: `dungeonBase + floor · dungeonStep` — Rat Cellars 12+2·f (14–32),
  Barrowdeep 28+3·f (31–58), Emberdeep 55+4·f (59–95). Stat budgets ×1.35 vs same-level mission
  monsters, boss floors (5, 10) ×1.6 with a signature proc. `[TUNE]`

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
| Fortune's Table | table in `systems/gacha-fortunes-table.md` | pity 20 |
| Golden Die from mission | 1.5% per 20-min mission, 0.6% others | — |
| Dungeon key drop | 6% per mission once dungeon level-gate reached (until key owned) | — |
| Ale drop | 2% per mission, cap 1/day | — |
| Pet egg | dungeon firsts & fixed milestones (deterministic, no RNG) | — |

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

## 10. Honor & ladder

- Initial bot honor spread: rank r → `honor ≈ 9800 − 6.1·r` for 1,500 bots `[TUNE]`.
- Win vs higher rank: swap ranks (S&F style) + honor transfer `round(0.02 · loserHonor)`.
- Win vs lower rank: +1 honor (discourage down-fighting); loss to attacker −2% honor, no rank loss
  below current position beyond the swap rule.
- Bots fight each other on schedule ticks; ladder churn ~3–5% of ranks/day around any given rank.

## 11. Guild economics

- Treasury/Drillmaster: 100 upgrade steps each; step `s` costs `500 · s^1.7` gold donated (any
  member); each step = +0.25% gold/XP → cap +25%. Bot members donate per their personality budget;
  a healthy bot guild reaches ~+15% by month 2. Guild Bounty weekly chest: gold pot + 1 Golden Die +
  materials, scaled to completion %. `[TUNE]`

## 12. Simulated-player progression

- Each bot has `dedication ∈ [0.15, 1.1]` (distribution: 60% casual 0.15–0.5, 30% regular 0.5–0.85,
  10% hardcore 0.85–1.1). Bot daily XP = `dedication · playerReferenceXP(day)` where
  `playerReferenceXP` is the §0 pacing curve; gear score follows with lag + noise. Top-10 bots are
  hand-tuned "named rivals" with dedication ≈ 1.0–1.1 so Rank 1 is a real chase. `[TUNE]`
- Bot levels at world-gen (day 0) seed a believable server age of ~90 days: level distribution
  log-normal, median ~28, p95 ~74, max ~92 — the player starts at the bottom of a living ladder.

## 13. Daily/weekly reward tables

- Daily tasks: 3 tasks → 40/30/30 points; chest at 100 pts: gold (= 60·goldPerVigor), materials,
  **1 Golden Die**. Weekly chest (7 daily clears): 3 dice + Ale ×2 + guaranteed Rare+ item + Epic @ 25%.
- Login calendar (28 days): gold/materials/Ale cadence, Dice on days 7/14/21, Epic item day 28.
  Missing a day pauses (doesn't reset) the calendar. `[TUNE]`
