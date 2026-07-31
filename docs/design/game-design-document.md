# TavernRPG — Game Design Document (Master)

> The single source of truth for **what TavernRPG is**. Detailed mechanics live in
> `docs/design/systems/*`; numbers and curves live in `docs/design/balancing-formulas.md`.
> When documents disagree, this GDD's *intent* wins and the discrepancy must be fixed.

---

## 1. Vision

**TavernRPG is a cozy, warmly-lit fantasy world that pretends to be an MMO.** You are one hero in
the bustling realm of **Aldenvale** — taking tavern quests, climbing the arena ladder, joining a
guild, delving dungeons — except every other "player" is a simulated hero with their own schedule,
ambitions and bad habits. It plays in minutes-long sips across the day (semi-idle), yet always
offers something active to do. It must feel like a full, living RPG — never like a prototype.

**Fantasy statement:** *"You're the newest regular at the Gilded Tankard tavern, and one day you'll
be the most famous hero in Aldenvale."*

### Design pillars

1. **A living world, not a menu.** Simulated players progress, chat, taunt, join guilds and defend
   ladder ranks around the clock. The world moves while you're away — and tells you about it.
2. **Sips, not sessions.** The core loop fits in 3–10 minute check-ins (start mission → return →
   fight → equip loot), with optional 30–60 minute active sessions (arena pushes, dungeon runs,
   forge sprees). Out of Vigor ≠ out of things to do.
3. **Every screen is a place.** Tavern, Armory, Stables, Proving Grounds — each screen uses its
   painted backdrop, ambient animation and a keeper character. Navigation feels like walking a town.
4. **Numbers you can read at a glance.** Five attributes, small percentage kits, short fights.
   Depth comes from build/economy decisions, not stat soup.
5. **Generous but bounded.** Daily caps (Vigor, arena rewards, scrap limit) protect pacing; the
   premium currency is earned, never bought; nothing is paywalled because there is no paywall.

### Anti-goals (what TavernRPG is *not*)

- Not a 1:1 S&F clone — see `docs/research/shakes-and-fidget-reference.md` for deliberate departures.
- Not an MMO, no accounts/servers at 1.0 — the world is simulated locally (see Q1 in `USER_QUESTIONS.md`).
- Not a parody comedy — tone is cozy warmth with a wink, not joke-per-line.
- Not idle-only — pure AFK (Patrol) is the *fallback* activity, never the optimal one.
- Not a skeleton/MVP — features ship complete with animation, feedback and edge cases handled.

## 2. Player profile & platform

- **Audience:** fans of S&F-style semi-idle RPGs and incremental games; play pattern of many short
  daily visits (morning coffee, lunch, evening) plus one longer evening session.
- **Platform:** desktop browser, **desktop-first**, optimized for 1920×1080 and 2560×1440,
  functional at 1366×768 (Q19). Full-viewport layout — the game *is* the browser window.
- **Deployment:** Vercel. Single-player, local-first persistence with save export/import (Q1, Q15).

## 3. The core loops

### Minute loop (active)
Pick mission at Tavern → wait (or do something else in-game) → **battle scene** → loot/gold/XP →
equip/sell/scrap decision → raise a stat with gold → repeat while Vigor lasts.

### Day loop (retention)
Vigor + shop stock + arena rewards + daily tasks reset at midnight → Notice Board dailies →
login calendar tick → check gacha banner rotation → feed pet → donate to guild → dungeon attempt(s)
→ end the day broke (gold sunk into stats) and out of Vigor → start Patrol overnight.

### Week loop (chase)
Weekly task chest → weekly gacha banner (rate-up set) → arena rank milestones → guild bounty payout
→ dungeon floor pushes as gear/stat growth compounds → mount rental renewal decision.

### Long loop (mastery)
Complete class gear sets → clear all 30 dungeon floors → top-100 → top-10 → **Rank 1 of the Hall of
Fame** (the "campaign goal") → collection/completion chases (post-1.0: Collector's Album, events).

## 4. Feature summary (v1.0)

| Feature | One-liner | Spec |
|---|---|---|
| Hero & classes | 5 classes (Warrior, Bard, Mage, Hunter, Swashbuckler), 5 attributes, paperdoll + backpack, gold stat training, no level cap | `systems/characters-and-classes.md` |
| Combat engine | Deterministic round-based auto-battle → battle log → cinematic animated replay | `systems/combat.md` |
| Tavern missions | 3-choice quest board, Vigor budget (100/day), timed missions ending in a fight, 14 illustrated mission scenes | `systems/tavern-and-patrol.md` |
| Patrol | 1–12 h AFK city patrol for gold + trickle XP when Vigor is spent | `systems/tavern-and-patrol.md` |
| Items & gear | 10 equip slots, 5 rarities, class-locked weapons/offhands, unrestricted general armor/jewelry, level-scaled procedural drops | `systems/items-and-gear.md` |
| Gear sets | 2 full themed sets per class at launch (10 sets), set bonuses at 2/4/5 pieces, sourced from dungeons/gacha/crafting | `systems/gear-sets.md` |
| Shops | The Armory (weapons/armor) & The Gilded Facet (jewelry), 6 daily items, premium reroll, selling | `systems/shops-and-stables.md` |
| Stables | 4 rental mounts, −10/−20/−30/−50% mission time; Royal Griffin costs Golden Dice | `systems/shops-and-stables.md` |
| Emberforge | Scrap gear → tiered materials; RNG-driven crafting incl. set-piece recipes; 10 scraps/day | `systems/crafting-and-scrapping.md` |
| Fortune's Table | Gacha: daily/weekly/monthly rotating banners, dice-per-roll, pity at 20, dupes → materials | `systems/gacha-fortunes-table.md` |
| Menagerie (pets) | 12 pets, one equipped, small single-stat % boost, feed to level, rarity upgrades | `systems/pets.md` |
| Arena & Hall of Fame | Pick-of-3 near-rank opponents, honor ladder vs 1,500 sims, 10 rewarded wins/day, full browsable ladder | `systems/arena-and-hall-of-fame.md` |
| Guilds | Create or join simulated guilds; donations → Treasury/Drillmaster % buffs; chat; weekly Guild Bounty | `systems/guilds.md` |
| Dungeons | 3 dungeons × 10 floors, key-gated, epic/set loot, boss chase far above player level | `systems/dungeons.md` |
| World simulation | 1,500 persistent simulated heroes + 60 guilds with schedules, personalities, rivalries; Town Crier news feed | `systems/world-simulation.md` |
| Economy | Gold / Golden Dice (premium, earn-only) / Honor / Materials / Keys; full faucet-sink map | `systems/economy-and-currencies.md` |
| Daily systems | Notice Board (3 dailies + weekly chest), 28-day login calendar, midnight reset rules | `systems/daily-loop-and-retention.md` |
| Tutorial | Guided 12-beat onboarding + level-gated feature unlocks doubling as pacing | `systems/tutorial-and-onboarding.md` |

## 5. World, tone & naming canon

- **Realm:** Aldenvale. Home town: **Emberhollow**. The player's haunt: the **Gilded Tankard** tavern.
- **Tone:** warm, painterly, gently humorous. NPC keepers have personality (barkeep **Marla**,
  forgemaster **Torvald**, fortune-teller **Madame Vesna**, stablemaster **Odo**, jeweler **Sela**,
  armorer **Bram**, guard-captain **Hildy**) but dialogue stays short and skippable. Tone question → Q11.
- **Zones (mission theaters, mapped to the 14 mission backgrounds):** Whispering Woods, Miller's
  Fields, Old King's Road, Fogmoor Marsh, Thornhill Ruins, Silverpine Pass, Ember Caves, Gloomhollow,
  Sunken Chapel, Frostfell Ridge — level-banded in `docs/design/content-plan.md`.
- **Dungeons:** The Rat Cellars → Barrowdeep Crypt → Emberdeep Foundry (all reached through the
  Undertavern — the Gilded Tankard's suspiciously deep cellar).
- **Simulated heroes:** fantasy name generator with epithets ("Brenna Thornsong", "Kargath the
  Unlucky"); tone follows Q10/Q11.

## 6. Screen map

Persistent frame: **left navigation rail** (town locations), **top HUD** (portrait/level/XP bar,
Gold, Golden Dice, Vigor tankard, mount timer, settings), **center stage** (current place, full-bleed
backdrop). See `docs/tech/ui-ux-style-guide.md` for layout math.

Places: Tavern (missions + Fortune's Table + barkeep) · Character (paperdoll/backpack/stats) ·
Notice Board · Patrol post · Armory · Gilded Facet · Emberforge · Stables · Menagerie · Proving
Grounds (arena) · Hall of Fame · Guild Hall · Undertavern (dungeons) · Town Crier feed (home panel) ·
Settings/Save.

## 7. Release definition

**1.0 ships when:** every feature in §4 is complete *with* animation/feedback polish, the tutorial
carries a new player to level 10 unaided, a simulated 30-day player reaches ~level 55 with 1–2 set
pieces (pacing targets in `balancing-formulas.md`), saves survive version migration, and the game
runs 60 fps on a mid-range laptop at 1080p. Phase gates in `ROADMAP.md`.

### How each line is settled (Phase 18)

`npm run release` runs the whole definition and prints it line by line. It is deliberately not a
summary of green ticks written elsewhere: four gates run their real harness, the fifth says what
it cannot do.

| line | settled by |
|---|---|
| every §4 feature, with polish | `src/engine/release/checklist.ts` — each of the seventeen names its engine module, screen, tests **and its animated moment**; `release.test.ts` parses §4 above and fails if the two disagree in either direction, then checks all 140 paths still exist |
| tutorial to level 10 unaided | `src/engine/release/onboarding.test.ts` — every room open by level 10 is introduced by a beat or announced when its gate lifts; the tour never points at a room the player cannot enter; the pacing sim reaches 10 inside the §0 budget |
| 30-day player at ~level 55 | `npm run pacing` — the §0 table, ±20%, all six rows |
| saves survive migration | `src/engine/save/fixtures.test.ts` — a captured fixture per shipped version and the whole v1→current chain |
| 60 fps at 1080p | **partly.** `npm run perf` gates *main-thread cost per frame* (budget 8 ms, measured 0.8 ms) and Lighthouse ≥ 90. Frames per second is a property of a graphics card and the CI container renders through SwiftShader with none — see style guide §11.1. The number is real and must be taken on the target laptop, by a person, once. |

Three things stay human and no harness replaces them: the fresh-profile playthrough, that fps
reading, and reading the tour as a newcomer with no docs open. `npm run release` lists them every
run so signing off cannot mean "the green ones passed".

## 8. Post-1.0 direction (headline patches)

Collector's Album · seasonal events · guild wars & raid bosses · legendary dungeon · witch/potions
shop · pet habitats & pet battles · 6th class · achievements v2 · cloud sync & accounts · mobile
layout. Backlog with sketches: `ROADMAP.md` §Post-1.0.
