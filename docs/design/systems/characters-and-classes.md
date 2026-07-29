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
- STR · HP ×5.0 · DR cap 50% · 1H weapon + **Shield** offhand.
- **Shield Wall:** 25% chance to block an incoming hit (blocked = 0 damage). Cannot block Mage attacks.
- Feel: slow, unkillable, honest damage. Beginner-friendly (highest mission win-rate stability).

### 🎵 Bard — "The Dawnchorus Duelist"
- INT · HP ×3.0 · DR cap 20% · 2H **instrument** (lute/horn/drum) + **Songbook** offhand.
- **Verses:** opens battle with a random Verse, refreshed every 4th round (seeded):
  - *Battle Hymn* — +25% damage for 3 rounds.
  - *Ironsong* — +25% damage reduction for 3 rounds.
  - *Discord* — enemy has 20% miss chance for 3 rounds.
- Feel: swingy, musical, RNG-flavored support-for-self. Verse banners are big battle-scene moments.

### 🔮 Mage — "The Emberweaver"
- INT · HP ×2.5 · DR cap 10% · 2H staff/wand + **Orb** offhand.
- **Arcane Certainty:** attacks can't be dodged or blocked; weapon damage spread ±45% (glass cannon
  with spiky rolls; orbs raise the spread floor).
- Feel: highest highs, made of paper. Punishes stat neglect hardest.

### 🏹 Hunter — "The Silverpine Shadow"
- DEX · HP ×4.0 · DR cap 25% · 2H bow/crossbow + **Quiver** offhand.
- **Windstep:** 45% chance to fully dodge an incoming hit (not vs Mage). Quivers add +crit damage.
- Feel: death by a thousand misses (theirs), steady crits (yours).

### 🗡️ Swashbuckler — "The Corsair of Emberhollow"
- DEX · HP ×4.0 · DR cap 25% · 1H saber/rapier + **Parry Dagger** offhand.
- **Flurry:** every attack attempts a second strike — 60% chance, dealing 75% damage. Parry daggers
  boost the follow-up's damage.
- Feel: fast, flashy, consistent DPS pressure; the animation showcase class.

Balance guardrails: mirror-gear win-rates between any two classes stay within 45–55% at equal
level/budget (Vitest simulation harness asserts this in CI — see `combat.md` §7).

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
