# System Spec — The Menagerie (Pets)

> Small, charming, deliberately minor: pets give a single modest stat boost. One equipped at a
> time. S&F's sprawling pet metagame is right-sized to 12 collectible companions (reference §10).

Backdrop: `pets_background.png`. Unlocks level 8.

## 1. The 12 pets & acquisition

| Pet | Boost | Source |
|---|---|---|
| Ember Pup | STR % | Rat Cellars first clear (floor 5) |
| Moss Tortoise | CON % | login calendar day 28 (first cycle) |
| Gloom Cat | DEX % | Barrowdeep floor 5 first clear |
| Owl of Vesna | INT % | monthly banner pity track |
| Coin Toad | LCK % | Notice Board: 30 daily clears milestone |
| Brass Beetle | armor % | Emberdeep floor 5 first clear |
| Tankard Imp | gold find % | 100 missions milestone |
| Sooty Raven | XP % | arena rank ≤ 500 milestone |
| Frost Fox | DEX % | rare mission egg drop (Frostfell/Silverpine, 0.5%) |
| Cellar Rat King | CON % | Rat Cellars floor 10 first clear |
| Wisp of the Chapel | INT % | Sunken Chapel zone: 40 missions milestone |
| Gilded Snail | LCK % | Fortune's Table random exclusive (1% slot, monthly banner) |

Mix of deterministic milestones (most) + two rare-luck pets — collection feels earnable, with a
couple of stories to tell. Unowned pets show as silhouettes with source hints.

## 2. Leveling & rarity

- Pet level 1–50 via feeding **Tavern Scraps** (pet food: from daily tasks, mission drops 8%,
  guild bounty chest) + gold per feed; 3 feeds/pet/day cap `[TUNE]`.
- Boost = `base 1% + 0.08%/level` → 5% at 50 `[TUNE]`. Armor/gold/XP pets use half rate (max ~3%).
- **Rarity upgrades** (C→U→R→E) at levels 15/30/45 cost materials (Essence, later Starmetal) and
  bump the *visual* (frame, particle trail on Character screen chip) + +0.5% flat `[TUNE]`.
- One **active** pet (Character screen chip + Menagerie stall highlight); switch freely (no cost,
  no cooldown — generosity here, the boost is minor anyway).

## 3. UX

Menagerie = stable-style stalls with idle pet animations (bought pets bounce/blink/snore), feed
button with satisfying chomp + progress ring, boost tooltip with exact numbers, collection counter
(X/12) + silhouettes. Feeding all pets stays viable (levels are per-pet) but only the active one
boosts — collectors' pressure without power bloat.

## 4. Data hooks

`PetDef` {id, boostStat, baseRate, sources, iconId, artOverride?}, `PetState` {owned, level,
rarityTier, fedToday}, `activePetId`. Boost feeds into `buildCombatant` + economy multipliers.
