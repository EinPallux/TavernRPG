# System Spec — Characters & Classes

> Hero creation, the five classes, attributes, leveling, stat training, and the Character screen
> (paperdoll + backpack). Numbers: `../balancing-formulas.md` §1, §3, §4.

## 1. Hero creation

- Flow: pick class (5 cards with portrait, kit summary, "playstyle feel" line) → name (text field +
  "suggest" die button using the world name generator) → confirm → world generates (seed derived
  from name + timestamp) → tutorial starts.
- Portraits are the prepared class images (`game_assets/UI/Classes/*.png`); no gender/appearance
  variants at 1.0 (Q20).
- Name rules: 3–16 chars, letters/spaces/'/-, uniqueness vs. bot names enforced.

## 2. Attributes (5)

| Attribute | Effect |
|---|---|
| **Strength** | Main stat for Warrior. +damage for STR classes |
| **Dexterity** | Main stat for Hunter & Swashbuckler. +damage for DEX classes |
| **Intelligence** | Main stat for Mage & Bard. +damage for INT classes |
| **Constitution** | HP for everyone: `HP = CON · (level+1) · classHpFactor` |
| **Luck** | Crit chance vs opponent level (cap 50%) |

Main-stat damage rule: `damage = weaponRoll · (1 + mainStat/10)`. Non-main offensive stats do
nothing for you directly (clean S&F-style readability); CON/LCK matter to all. Starting spread per
class pre-seeds flavor (e.g. Warrior 14/8/6/12/8 STR/DEX/INT/CON/LCK; full table in data module).

**Stat training:** buy attribute points with gold, per-attribute rising cost `statCost(n)` (§3
formulas). Buttons +1/+5/+25/Max. This is the deliberate endless gold sink. Item/pet/set bonuses
never change training cost (cost counts only *bought* points).

## 3. The five classes

Each class = main stat + HP factor + armor cap + **one signature proc** + weapon family. Kits are
original but tuned to S&F-style archetype clarity (reference doc §4).

### ⚔️ Warrior — "The Wall of Aldenvale"
- STR · HP ×4.2 · DR cap 35% · weapon damage ×0.935 · 1H weapon + **Shield** offhand.
- **Shield Wall:** 25% chance to block an incoming hit (blocked = 0 damage).
- Feel: slow, unkillable, honest damage. Beginner-friendly (highest mission win-rate stability).

### 🎵 Bard — "The Dawnchorus Duelist"
- INT · HP ×3.6 · DR cap 22% · weapon damage ×1.382 · 2H **instrument** + **Songbook** offhand.
- **Verses:** opens battle with a random Verse, refreshed every 4th round (seeded):
  - *Battle Hymn* — +25% damage for 3 rounds.
  - *Ironsong* — +25% damage reduction for 3 rounds.
  - *Discord* — enemy has 20% miss chance for 3 rounds.
- Feel: swingy, musical, RNG-flavored support-for-self. Verse banners are big battle-scene moments.

### 🔮 Mage — "The Emberweaver"
- INT · HP ×3.4 (lowest) · DR cap 15% · weapon damage ×1.99 · 2H staff/wand + **Orb** offhand.
- **Arcane Certainty:** blocks and dodges work at **62% of their normal chance** against magic;
  weapon damage spread ±45% (glass cannon with spiky rolls; orbs raise the spread floor).
  *Originally "cannot be dodged or blocked" — measured at a 97% hard counter to the Hunter, so
  it was softened to a strong tilt rather than an auto-win (see §8).*
- Feel: highest highs, made of paper. Punishes stat neglect hardest.

### 🏹 Hunter — "The Silverpine Shadow"
- DEX · HP ×3.6 · DR cap 25% · weapon damage ×1.03 · 2H bow/crossbow + **Quiver** offhand.
- **Windstep:** 40% chance to fully dodge an incoming hit (reduced against magic). Quivers add
  +crit damage.
- Feel: death by a thousand misses (theirs), steady crits (yours).

### 🗡️ Swashbuckler — "The Corsair of Emberhollow"
- DEX · HP ×3.8 · DR cap 25% · weapon damage ×0.918 · 1H saber/rapier + **Parry Dagger** offhand.
- **Flurry:** every attack attempts a second strike — 60% chance, dealing 75% damage. Parry daggers
  boost the follow-up's damage.
- **Parry:** 15% dodge. Small by design — without it the class was a Hunter with no defence at all.
- Feel: fast, flashy, consistent DPS pressure; the animation showcase class.

### Balance policy (measured, not asserted)

The harness in `src/engine/combat/` runs thousands of seeded fights per matchup at levels 10, 25,
50 and 100. CI enforces three bands:

| Band | Rule | Why |
|---|---|---|
| Mirrors | 45–55% | A same-class fight is symmetric; anything else means the *engine* favours a seat |
| Per-class average | 45–55% | No class may be quietly stronger across the board |
| Any single matchup | 30–70% | Counters are allowed; walls are not |

Measured at the end of Phase 3: every mirror 49–52%, every class averaging 49.3–50.6%, worst
single matchup 67%. Individual matchups are *deliberately* uneven — there is a counter triangle,
**Bard > Mage > Hunter > Bard** — because an arena where every duel is a coin flip has no texture.

### Phase 3 rebalance — what changed, and why

The classes as first specified were unbalanced by a wide margin once measured: Warrior beat Bard
and Mage 100% of the time, Mage lost to Hunter 0%. Two causes, both fixed:

1. **Every class swung the same weapon.** The design assumed glass cannons compensate with
   two-handed damage (as in S&F), but nothing expressed that, so HP ×2.5 versus ×5.0 simply made
   the tanky classes better. Classes now carry a `weaponDamageFactor`, and it applies to real
   generated gear as well as to the harness.
2. **The survivability spread was too wide.** HP ×2.5–5.0 with DR caps of 10–50% produced mirror
   fights ranging from 2 rounds to 34 — bad for balance and unwatchable as an animated scene.
   Narrowed to ×3.4–4.2 and 15–35%, giving 4–16 round fights. The Mage keeps the lowest
   health of the five, because a glass cannon that reads as sturdy on the character sheet is a
   broken promise.

## 4. Character screen (paperdoll + backpack)

Layout (desktop-first, one screen, no scrolling at 1080p):

- **Left column — Paperdoll:** class portrait center; 10 slots around it: Weapon, Offhand, Helmet,
  Chest, Gloves, Boots, Belt, Amulet, Ring, Trinket. Set-piece slots glow with the set's accent;
  hovering a slot highlights all equipped pieces of the same set + shows set-bonus progress.
- **Center column — Attributes & derived:** 5 attribute rows (value = base bought + item + pet +
  set, with hover breakdown) + buy buttons with live cost; derived panel: HP, damage range, crit %,
  armor DR vs same-level foe, block/dodge/proc line; equipped mount + timer; active pet chip.
- **Right column — Backpack:** 15 slots (3×5), +3-row expansions (Golden Dice, §9 formulas) to max
  30. Drag-and-drop equip with valid-slot highlighting; right-click menu: Equip / Compare / Sell
  (at shop only) / Scrap (at forge only) / Lock. Compare tooltip shows stat deltas colored by gain/loss.
- Item lock flag prevents sell/scrap; full-backpack mission loot goes to a 5-slot **overflow
  satchel** (oldest auto-discarded with toast warning; overflow banner on HUD).

## 5. Leveling

- XP sources: missions (main), arena (capped), dungeons (bursts), patrol (trickle), guild bounty.
- Level-up moment: radial burst on portrait, HUD ribbon, Town Crier entry at milestones (10/25/50/…),
  feature-unlock toasts per `tutorial-and-onboarding.md` gates.

## 6. Data hooks

`ClassId`, `ClassDef` (hpFactor, drCap, proc def, weaponFamilies, startingStats, portrait),
`Attributes` record, `Hero` (identity, level, xp, boughtStats, equipment, backpack, satchel, gold,
dice, vigor, flags) — full types in `docs/tech/data-models.md`.

## 7. Edge cases

- Equipping lower-level gear is always allowed (no level requirements on gear at 1.0; power comes
  from budgets — keeps loot decisions simple).
- Class-locked items (weapons/offhands/sets) are hidden from other classes' drop tables entirely
  (they never drop wrong — see `items-and-gear.md` §5).
- Respec: none at 1.0 (stats are additive, no builds to brick); noted for post-1.0 "Retraining"
  service at the witch.
