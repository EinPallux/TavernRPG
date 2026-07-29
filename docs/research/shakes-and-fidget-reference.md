# Shakes & Fidget — Systems Reference (Research)

> **Purpose.** TavernRPG is *inspired by* Shakes & Fidget (S&F), not a copy. This document records how
> S&F's systems actually work, so every TavernRPG design decision is made **knowingly** — either
> following the proven S&F pattern or deliberately departing from it. Each section ends with a
> **"TavernRPG takeaway"**. Sources: official Playa Games help center, the S&F fandom wiki,
> community formula collections (kalais.net, sfporadnik.pl, number13.de) and first-hand play knowledge.
> Community-reverse-engineered formulas are approximations and are marked as such.

---

## 1. Tavern & Quests (the core loop)

How S&F does it:

- The **Tavern** is the heart of the game. A quest giver offers **3 quests to choose from**; each shows
  duration, gold reward, XP reward and sometimes an item preview.
- Quests consume **Thirst for Adventure** ("beer bar"): **1 thirst point = 1 minute of questing**,
  **100 thirst per day**, resetting at midnight. Quest durations go up to **20 minutes** base.
- While a quest runs, a timer counts down. At the end the hero fights a **quest monster**; only a win
  pays out gold/XP/item. Losses are rare at appropriate gear levels but possible.
- The **Barman sells beer**: 1 premium mushroom → +20 thirst, up to 10/day (hard daily cap ⇒ even
  paying players have bounded daily progress).
- **Mounts shorten quest duration** (up to −50%), effectively doubling quests per day — the single
  most important early purchase.
- Quest rewards scale with **player level** and quest duration; longer quests pay proportionally more
  but tie up the timer. Quests occasionally award souvenir/collection items and event resources.
- Quest text is comedic parody (pop-culture references); each quest has a small illustrated scene.

**TavernRPG takeaway.** Keep: 3-choice board, thirst-style budget (we call it **Vigor**), duration =
cost, fight-at-the-end, mount reduction, midnight reset, bounded daily refills. Change: our refills are
rarer (premium **Golden Dice** are F2P-earned), quest flavor text is cozy-fantasy rather than parody,
and every mission scene uses one of the 14 prepared mission backgrounds.

## 2. City Guard (idle work)

- Working for the **City Guard** pays **gold only** (no items), chosen in blocks of **1–10 hours**.
  Earnings scale with level. It continues while offline — the classic "money while you sleep".
- It competes with questing for time: you cannot quest while on guard duty. It is the designated
  activity for when thirst is spent.

**TavernRPG takeaway.** Our **Patrol** system mirrors this: long AFK blocks (1–12 h), gold-focused,
usable only when you choose to idle, cancellable. We add a small XP trickle and (post-1.0) random
patrol events so it feels alive rather than a spreadsheet timer.

## 3. Character, Attributes & Stat Training

- Five attributes: **Strength, Dexterity, Intelligence, Constitution, Luck**. Each class has a *main*
  attribute driving damage; CON drives HP; LCK drives crit.
- Attributes are raised with **gold**, price rising with the number of points already bought
  (community data: cost grows polynomially, capped at 10M gold per point late game). This is the
  game's primary **gold sink** and the reason gold always matters.
- Character screen = **paperdoll** (equipment around the hero portrait) + backpack grid (5 base slots,
  expandable via fortress up to ~50) + attribute panel with "+" buy buttons.
- No hard level cap in practice (level 800+ exists); XP requirements grow steeply.

**TavernRPG takeaway.** Adopt the 5-attribute model wholesale (it's elegant and battle-readable),
gold-driven stat training as the primary sink, paperdoll+backpack character screen. Our backpack
grows via premium purchase instead of a fortress build.

## 4. Classes & Combat

Community-documented class kit (per official descriptions + wiki):

| Class | Main stat | Weapons | Signature mechanic | Armor DR cap | HP factor |
|---|---|---|---|---|---|
| Warrior | STR | 1H + shield | **25% block** | 50% | ×5 |
| Mage | INT | 2H wand/staff | attacks **cannot be evaded/blocked** | 10% | ×2 |
| Scout | DEX | 2H bow | **50% evade** | 25% | ×4 |
| Assassin | DEX | two 1H weapons | **attacks twice** + 50% evade | 25% | ×4 |
| Berserker | STR | 1H | **50% chance to chain another attack** (repeatable) | 25% | ×4 |
| Bard | INT | instrument | **plays melodies that buff him** during battle | 10% | ×2 |
| Battle Mage | STR/INT | warrior weapon | opening **fireball** (up to 33% max-HP damage), 40% magic shield | — | — |

Combat model (community-derived, approximate):

- Auto-battle in **rounds**; a random (luck-weighted) side strikes first, then hits alternate.
- **HP ≈ CON × (level + 1) × class HP factor.**
- **Damage per hit ≈ weapon damage roll × (1 + main stat / 10)**, minus defender armor reduction
  (armor value vs attacker level, capped by defender's class DR cap).
- **Crit chance ≈ (LCK × 5) / (2 × opponent level)**, capped at 50%; crits deal ×2.
- Evade/block rolls happen per incoming hit; mage attacks skip those rolls.
- Fights are short (seconds of real time), fully deterministic server-side, replayed client-side as an
  animated scene with floating damage numbers.

**TavernRPG takeaway.** This round-based, percentage-kit model is the right chassis: tiny rule set,
huge build expressiveness, trivially deterministic. We keep 5-stat math and per-class signature
percentages but design **our own five kits** (Warrior/Bard/Mage/Hunter/Swashbuckler — see
`docs/design/systems/characters-and-classes.md`), and we formalize the **battle log → animated
replay** split from day one.

## 5. Arena & Hall of Fame

- Arena offers **3 opponents of similar rank**; beating one swaps you upward in the **Hall of Fame**
  (honor-sorted ladder of *all players on the server*). Honor gained depends on rank/honor gap.
- Arena rewards **XP and honor up to 10× a day**; further fights still change rank. A short cooldown
  between attacks (10 min, mushroom-skippable) throttles climbing.
- Hall of Fame is browsable end-to-end (rank, name, guild, level, class) — enormously motivating.

**TavernRPG takeaway.** Reproduce exactly this feel against **simulated players**: pick-of-3 near-rank
opponents, ladder swaps, 10 rewarded wins/day, browsable full ladder. Because bots progress on their
own schedules, rank defense matters even while the player sleeps.

## 6. Guilds

- Guilds have up to 50 members; members **donate gold and mushrooms**. Donations feed two shared
  upgrade tracks: **Treasure** (+% gold from quests/guard) and **Instructor** (+% XP from quests) — the
  bonus is guild points / 5, so an active guild is a permanent ~+25–200% economy boost.
- **Guild raids** against PvE monsters award every member XP/gold and feed guild skill.
- Guild vs guild **attacks/defenses** are scheduled brawls of all members' heroes.
- Chat + member list + officer roles; joining a good guild early is the #1 community advice.

**TavernRPG takeaway.** 1.0 keeps the *economic heart* (donations → Treasury/Drillmaster % buffs),
roster/roles, chat with simulated members, and a co-op weekly **Guild Bounty**. Guild-vs-guild wars
and raid bosses are explicitly deferred (they need the world-sim battle scheduler matured first).

## 7. Shops (Weapon & Magic)

- **Weapon Shop** sells weapons/armor; **Magic Shop** sells jewelry, potions and trinkets. Both hold
  **6 items**, restock **daily at midnight**, and can be **rerolled for 1 mushroom**.
- Item prices in gold (some special stock for mushrooms). Players also **sell** loot to either shop.
- Potions grant +10/15/25% to one attribute until replaced — a standing buy-back-your-power sink.

**TavernRPG takeaway.** Two shops confirmed by prepared assets: **The Armory** (weapons/armor) and
**The Gilded Facet** (jewelcrafting: rings/amulets/trinkets). 6 slots, midnight restock, premium
reroll. Potions → post-1.0 (listed in roadmap backlog) to keep 1.0 scope honest.

## 8. Mounts (Stable)

- Four rentable mount tiers cutting quest time by **−10% / −20% / −30% / −50%**; the top mount
  (Dragon/Griffin tier) costs **premium currency** and is the aspirational daily-efficiency purchase.
  Rentals last a fixed period (e.g. 14 days), so mounts are a recurring sink.

**TavernRPG takeaway.** Same four-tier rental ladder (Mule −10%, Courser −20%, Warhorse −30%,
**Royal Griffin −50%** for Golden Dice). Rentals (not permanent) keep the sink alive; the stable
background asset already exists.

## 9. Dungeons

- Long chain of themed dungeons (18+), each with **10 floors** of named monsters far above the
  player's level — a months-long chase list. Entry requires a **key** (found via quests/shops).
- Attempts are free; you fight floor N's monster, win → advance, lose → come back stronger.
- Loot: ~**50% normal item / 25% epic** per floor, **100% epic on floor 10**; dungeons are *the*
  epic source.

**TavernRPG takeaway.** 3 dungeons × 10 floors at 1.0 (Rat Cellars, Barrowdeep Crypt, Emberdeep
Foundry), keys from missions, free attempts with a short cooldown after a loss, epics & **set
pieces** concentrated here. More dungeons ship per patch, mirroring S&F's cadence.

## 10. Pets

- S&F's 2018 pet system is huge: 5 elements × 20 pets, habitats, daily pet PvP, fruit feeding,
  per-pet attribute % bonuses (1% per pet found, more at level milestones), max level 200.

**TavernRPG takeaway.** Right-size it: **12 pets**, each granting a small single-attribute % bonus
(≈1–5%), one equipped at a time, levelled by feeding (gold + materials), rarity upgrades. The full
habitat/pet-PvP metagame is deliberately out of scope for 1.0 — noted as a flagship post-1.0 patch.

## 11. Blacksmith (dismantle/upgrade) — S&F's crafting analog

- Blacksmith **dismantles up to 5 items/day** into **metal & arcane splinters**; destroyed forever.
- Splinters pay for **attribute upgrades** on items and **gem socket** installs. Gems (from the
  fortress mine) socket into gear for flat attribute boosts.

**TavernRPG takeaway.** Our **Emberforge** replaces upgrade-centric smithing with **scrap → craft**:
scrapping yields tiered materials; crafting rolls new gear with RNG rarity (user requirement:
"RNG-driven"). Daily scrap limit (10) preserved as a meaningful choice. Sockets/gems → post-1.0.

## 12. Premium economy (Mushrooms) — F2P translation

Mushroom sinks in S&F: beer refills, mount rental, shop rerolls, arena cooldown skips, backpack
expansion, gamble. S&F sells mushrooms for money; small free trickles exist (daily login bonus,
quest rare drops, achievements).

**TavernRPG takeaway.** Golden Dice replicate the sink list (Ale refills, Griffin rental, shop
rerolls, arena skip, backpack rows, **Fortune's Table gacha**) but are **earned only in-game**
(daily tasks, calendar, dungeon firsts, arena milestones, rare drops). Target income ≈ **1–2
dice/day** for an active player, making every sink a real decision.

## 13. Retention scaffolding

- Daily: thirst reset, shop restock, beer cap, arena reward cap, daily login bonus, daily tasks
  with point chests; Weekly/seasonal events (XP weekends, gold events) spike engagement.
- The **Scrapbook/collection album** (collect every item/monster image for an XP% bonus) is a
  legendary long-tail grind hook.

**TavernRPG takeaway.** 1.0 ships: midnight resets, Notice Board daily tasks + weekly chest,
28-day login calendar, rotating gacha banners, Town Crier world-news feed. Scrapbook-style
**Collector's Album** and rotating events are prime post-1.0 patches.

---

## What TavernRPG deliberately does differently

1. **Single-player with a simulated server.** S&F's magic is *other people on the ladder*. We
   recreate the pressure with 1,500 persistent simulated heroes with schedules, personalities,
   guilds and rivalries (`docs/design/systems/world-simulation.md`) — no backend needed.
2. **Fully F2P premium currency** earned by play, never bought.
3. **Gacha banners** (S&F has none) as the rare-gear chase, tuned single-player-fair
   (pity, dupe conversion).
4. **Full gear sets per class** as first-class content (S&F epics are mostly standalone).
5. **Cozy-fantasy tone** (warm tavern fantasy with light humor) instead of S&F's outright parody,
   matching the prepared low-poly art.
6. **Determinism everywhere** (seeded RNG, replayable battles) because there is no server authority.
