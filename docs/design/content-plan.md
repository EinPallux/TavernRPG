# Content Plan (v1.0 volumes, naming, and data shape)

> What must exist as *data* for 1.0 to feel full — with counts, naming conventions, and where each
> asset hook lives. All content is authored as typed TypeScript modules under `src/data/` (see
> `docs/tech/data-models.md`). Every entity carries `iconId` (game-icons.net) and optional
> `artOverride` (user-supplied art later) per `docs/tech/asset-pipeline.md`.

## 1. Zones & mission theaters (14 zones → 14 backgrounds)

| Zone | Level band | Backdrop file(s) | Monster families |
|---|---|---|---|
| Whispering Woods | 1–8 | mission_background_13, _10 | Forest beasts, bandits |
| Miller's Fields | 5–14 | mission_background_11, _12 | Vermin, scarecrows, brigands |
| Old King's Road | 10–20 | mission_background_3, _5 | Highwaymen, wargs, restless dead |
| Fogmoor Marsh | 16–28 | mission_background_2 | Bog creatures, witches' servants |
| Thornhill Ruins | 24–36 | mission_background_4 | Cultists, animated armor, gargoyles |
| Silverpine Pass | 32–46 | mission_background_9 | Mountain clans, harpies, ice wolves |
| Ember Caves | 42–58 | mission_background_6 | Kobolds, magma beasts, salamanders |
| Gloomhollow | 54–72 | mission_background_8 | Shades, night hags, spiders |
| Sunken Chapel | 68–88 | mission_background_1, _14 | Drowned dead, deep cult, reliquary guardians |
| Frostfell Ridge | 84–110+ | mission_background_7 | Frost giants' kin, wraiths, rocs |
| Saltmere Wrecks | 100–130 | mission_background_14, _1 | Salt-cured drowned, wreck-things |
| The Glass Waste | 122–156 | mission_background_12, _11 | Mirages, heat, fused glass |
| Starfall Barrens | 148–186 | mission_background_6, _9 | Starmetal constructs, things that fell |
| The Hollow Crown | 178+ | mission_background_4, _8 | A dead court, still in session |

> **The far country** (the last four) was added post-1.0 because the tenth zone was levelled
> `84 → ∞` and an active player met their last new monster on day 40. It re-uses backdrops
> with distinct tints — fourteen paintings, fourteen zones — which is what the `tint` field
> was added for. Real art drops in through the override manifest. `balancing-formulas.md` §21.

> **Corrected in Phase 5.** The original table numbered the backdrops sequentially, sight
> unseen, which put a tropical shipwreck behind "Whispering Woods" and a flower meadow behind
> the marsh. The mapping above is what the files actually depict: 13/10 are deep forest, 11/12
> are farmland, 3/5 are road-and-watchtower, 6 is a volcano, 7 is frozen peaks, 1/14 are
> coastal. Two zones have no matching art in the pack (Fogmoor Marsh, Gloomhollow) and lean on
> their `tint` until the content pass commissions art — which drops in via the override
> manifest with no code change (`asset-pipeline.md` §3).

Zone selection follows player level (current band ± neighbors). Zones are flavor + monster pool +
backdrop; rewards depend only on level & duration (`balancing-formulas.md` §1–2).

## 2. Monsters

- **Target: 136 mission monsters** (≈9–10 per zone), each: name, zone, archetype (bruiser /
  skirmisher / caster / tank / swarm), `iconId`, `artOverride?`, flavor line.
  Names lean cozy-grim ("Sootback Boar", "Toll-Keeper's Ghost", "Marsh Widow").
- **30 dungeon monsters** (10 per dungeon), individually named with signature procs on floors 5/10
  (mini-boss/boss). Examples — Rat Cellars: "Cellar King Riddletail" (F10); Barrowdeep: "The Pale
  Margrave" (F10); Emberdeep: "Foundry Tyrant Vulkarr" (F10).
- Monster stat blocks are **generated from archetype templates** at fight time (level-driven, seeded)
  — content authors only pick archetype + proc, keeping 126 monsters maintainable.

## 3. Items

- **Procedural general gear** (the main gear stream) needs *name parts*, not per-item entries:
  - Base nouns per slot (~12 each across 10 slots) + rarity prefixes (~10/rarity tier) +
    suffix pool keyed to attribute mix (~24) → "Runed Ironclad Helm of the Badger".
  - Weapon bases per class (Warrior swords/axes/maces · Bard lutes/horns/drums · Mage staves/wands ·
    Hunter bows/crossbows · Swashbuckler sabers/rapiers), 8–10 bases each.
  - Offhand bases per class (shields / songbooks / orbs / quivers / parry daggers), 4–6 each.
- **Icon mapping:** every base noun maps to a game-icons.net icon; rarity recolors via CSS token, so
  procedural items are visually distinct without custom art.
- **10 gear sets** (2/class × 5 classes) with 5 fixed pieces each = **50 curated set items**
  (names/statlines/bonuses in `systems/gear-sets.md`), plus 5 outlined post-1.0 sets (1/class).
- **Consumables/specials:** Ale, 3 Dungeon Keys, materials ×3 tiers (Scrap, Essence, Starmetal),
  set recipes ×10, pet food ("Tavern Scraps").

## 4. Pets (12)

Ember Pup (STR) · Moss Tortoise (CON) · Gloom Cat (DEX) · Owl of Vesna (INT) · Coin Toad (LCK) ·
Brass Beetle (armor%) · Tankard Imp (gold find%) · Sooty Raven (XP%) · Frost Fox (DEX) ·
Cellar Rat King (CON) · Wisp of the Chapel (INT) · Gilded Snail (LCK). Acquisition mapped in
`systems/pets.md` (dungeon firsts, milestones, gacha, rare mission egg).

## 5. Simulated world content

- **Name generator:** 2-syllable tables per culture (Northfolk/Valefolk/Emberfolk) × epithet pool
  (~120) → ~50k unique combos; guild name generator (adjective+noun+suffix pools, ~8k combos:
  "The Amber Blades", "Order of the Quiet Flame").
- **60 seed guild identities** (name, banner colors from Kenney UI palette, motto) + churn rules.
- **Chat/feed template corpus:** ≥150 lines across categories (greeting, brag, grumble, mission
  talk, arena taunt, donation ping, welcome, farewell) with slot-fill variables; rivals get a
  dedicated taunt set (~30). Town Crier event templates (~40).
- **Rival archetypes:** 6 (The Overachiever, The Trash-Talker, The Ghost, The Copycat, The Veteran,
  The Newcomer) — selection & behavior in `systems/world-simulation.md`.

## 6. Quest flavor text

- **~160 mission blurbs** (16/zone): one-sentence hooks in cozy-grim voice ("Something keeps
  blowing out the lanterns on the Old King's Road. Find out what — before the toll collector does.").
  Each maps duration-agnostic; monster + zone + blurb compose the mission card.
- 30 dungeon floor intros (1 line each), 12 keeper barks per NPC (Marla, Torvald, Vesna, Odo, Sela,
  Bram, Hildy) for idle/success/failure moments.

## 7. Tutorial & UX copy

12 onboarding beats (`systems/tutorial-and-onboarding.md`), ~40 tooltip glossary entries (Vigor,
Honor, rarity, set bonus, scrapping, pity...), empty-state lines for every screen ("No patrol
running. The streets of Emberhollow keep themselves tonight, apparently.").

## 8. Content pipeline rules

1. All strings live in `src/data/strings/` modules (English-only at 1.0, structured for i18n later — Q12).
2. No content object is instantiated ad hoc in components; everything imports from `src/data/`.
3. Every data module has a Vitest schema test (Zod) so bad content fails CI, not runtime.
4. Icon IDs are validated against the vendored icon manifest at build time.
