# System Spec — Items & Gear (general loot)

> The procedural gear stream: slots, rarities, stat budgets, class restriction rules, naming,
> icons, and item UX. Curated **sets** live in `gear-sets.md`. Numbers: `../balancing-formulas.md` §7–8.

## 1. Slots (10)

Weapon · Offhand · Helmet · Chest · Gloves · Boots · Belt · Amulet · Ring · Trinket.

- **Weapon/Offhand are always class-specific** (families per class in
  `characters-and-classes.md` §3) — they only ever drop/stock/craft for the owning class (user rule).
- **Armor (Helm/Chest/Gloves/Boots/Belt) and Jewelry (Amulet/Ring/Trinket) are unrestricted** —
  any class can wear any general piece. Only **set** armor is class-locked.
- Armor pieces carry `armor` value + attributes; jewelry carries attributes (+ special lines:
  gold find % on Trinkets, XP % on Amulets — small, 1–4%).

## 2. Rarities (5)

| Rarity | Color token | Attribute lines | Notes |
|---|---|---|---|
| Common | `--rarity-common` (stone grey) | 1 | vendor fodder, early upgrades |
| Uncommon | green | 1 (higher budget) | |
| Rare | blue | 2 | first "keep" tier |
| Epic | purple | 3 or ALL-stats variant | dungeon/gacha highlights |
| Set | gold | fixed curated lines + set bonus | class-locked, `gear-sets.md` |

Rarity drives: stat budget multiplier, sale value, scrap yield tier, border/glow treatment, drop
weights (§7 tables). "Legendary" is deliberately reserved for a post-1.0 tier above Set.

## 3. Procedural generation (`generateItem(level, slot, rarityRoll, classId, rngStream)`)

1. Roll rarity (context table) → budget `itemBudget(L)` (§8 formulas).
2. Pick base noun (slot + class where relevant) → icon binding.
3. Split budget across attribute lines (weighted toward class-plausible mixes for weapons; fully
   random for general gear — cross-class loot trading decisions are content).
4. Weapons: damage range from §8; armor: armor value by piece weight; jewelry special-line chance 25%.
5. Name = [rarity prefix] + base + [suffix by dominant attribute] ("Runed Ironclad Helm of the
   Badger"); Epics get unique-feel double names ("Stormcaller's Vow").
6. Value & scrap yield computed at gen time and stored (no retro-pricing surprises).

Determinism: item RNG uses the owning context stream (mission seed, shop day-seed, gacha roll seed)
— reload-scumming can't reroll loot.

## 4. Item card anatomy (UI)

Rarity-colored chamfered frame · icon (game-icons.net, rarity-tinted backplate) · name · slot tag ·
class tag (weapons/offhands/sets) · armor/damage line · attribute lines (+set bonus block on set
pieces) · special lines · value footer (gold icon) · lock toggle. Hover anywhere in game shows the
same card (single `<ItemCard>` component). Compare mode overlays deltas vs equipped-in-slot.

## 5. Class-restriction enforcement (single choke point)

All item sources funnel through `rollDropClass(context)`: weapons/offhands/sets generate **only**
for the player's class from player-facing sources (missions, dungeons, shops, gacha, crafting).
World-sim bots roll against their own class. There is deliberately no cross-class weapon loot at 1.0
(no trading exists to justify it).

## 6. Acquisition & disposal map

| Get | Where |
|---|---|
| Drops | missions (25–38%), dungeon floors, gacha, guild bounty chest |
| Purchase | Armory / Gilded Facet daily stock |
| Craft | Emberforge (RNG rarity), set recipes |
| Dispose | Sell (shops, gold) · Scrap (forge, materials) · overflow satchel auto-discard (commons only) |

Sell vs scrap is the standing economy decision; scrap yields by rarity in
`crafting-and-scrapping.md` §3.

## 7. Anti-frustration rules

- Duplicate-slot epic protection: an Epic drop for a slot where you already wear an Epic of ≥ that
  budget gets +1 reroll attempt (once) toward another slot.
- Drops never roll below 90% of the *shop* budget for their level (drops always feel competitive).
- Set pieces never drop as duplicates while the set is incomplete via **dungeon** sources
  (gacha handles dupes with pity/conversion instead — its spec §5).
