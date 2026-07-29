# USER_QUESTIONS — Decisions from the user

> **Status: all 20 questions answered by the user on 2026-07-29.** The answers below are locked
> design decisions — specs reference these numbers (e.g. "(Q4)"), so numbering stays fixed.
> New questions arising during development get appended in dated sections at the bottom, each
> with a working default so nothing blocks.

---

## A. Platform & saves

**Q1. Saves.** ✅ **Answered: IndexedDB (local-first) with export/import.** No accounts/server at
1.0; cloud sync remains a post-1.0 candidate. → `docs/tech/architecture.md` §3

**Q2. Save slots.** ✅ **Answered: 3 slots.**

**Q3. Real-time progression while the browser is closed.** ✅ **Answered: yes — full S&F "server
feel".** Missions/patrol/world-sim continue in real time; the ladder moves while you're away.

## B. Core systems

**Q4. Guild-vs-guild battles.** ✅ **Answered: post-1.0 feature.** 1.0 guilds are economic/social
(donations → buffs, chat, weekly co-op bounty). → `docs/design/systems/guilds.md`

**Q5. Mounts.** ✅ **Answered: rentals, but 7-day terms** (recurring gold sink, faster cadence
than the proposed 14 days). Prices re-pinned to keep the same share of daily gold; Royal Griffin
= 6 Golden Dice / 7 days. → `docs/design/systems/shops-and-stables.md` §4, balancing §9

**Q6. Premium naming.** ✅ **Answered: Golden Dice + Fortune's Table.**

**Q7. Daily active-play budget.** ✅ **Answered: Vigor 100/day + up to 3 Ale (+20 each).**
→ `docs/design/balancing-formulas.md` §6

**Q8. Gacha pity.** ✅ **Answered: pity at 20 rolls** (weekly set banner). → gacha spec §4

**Q9. Content volumes for 1.0.** ✅ **Answered: as listed** — 3 dungeons · 10 gear sets · 12 pets
· ~96 monsters · 10 zones · ~160 blurbs. → `docs/design/content-plan.md`

## C. World, tone & language

**Q10. World size & bot naming.** ✅ **Answered: 1,500 heroes / 60 guilds, light-epithet
serious-fantasy names** ("Kargath the Unlucky"). → world-sim spec §2

**Q11. Overall tone.** ✅ **Answered: cozy with a wink** — warm fantasy, light keeper-bark humor,
no parody. → GDD §5

**Q12. Language.** ✅ **Answered: English-only at 1.0** (strings centralized for later localization).

**Q13. Sound.** ✅ **Answered: light SFX pass + background-music drop-in support** — the game must
support a user-supplied `bgm.mp3` placed into the game files (looping background music with its
own toggle/volume; silent if the file is absent). → `docs/tech/asset-pipeline.md` §6

## D. Presentation & remaining decisions

**Q14. Fonts.** ✅ **Answered: as proposed** — Alegreya Sans SC (display) + Inter (body).
→ style guide §5

**Q15. Save-editing tolerance.** ✅ **Answered: no anti-cheat.** Export files stay readable;
tampering is the player's own business.

**Q16. Daily/weekly strictness.** ✅ **Answered: keep 7/7 weekly chest and 10 rewarded arena
wins/day.** → daily-loop spec §1, arena spec §1

**Q17. Dungeon retry.** ✅ **Answered: 30-minute cooldown after a loss**, free chaining after wins.
→ dungeons spec §2

**Q18. Third gear set per class.** ✅ **Answered: yes — ships in 1.1.** → `gear-sets.md`

**Q19. Resolution targets.** ✅ **Answered: as listed** — optimized 1920×1080/2560×1440,
functional ≥1366×768, no mobile at 1.0. → style guide §2

**Q20. Hero appearance.** ✅ **Answered: class portrait only at 1.0; gender/appearance variants
are post-1.0.** → ROADMAP post-1.0 backlog

---

## Open questions

### 2026-07-29 — raised during Phase 2

**Q21. Item icons: game-icons.net is unreachable from the build environment.**
The plan (and your brief) specifies game-icons.net for item/weapon/armour icons. That site is
blocked from this sandbox, and the mirror repository can't be attached either, so I drew the 25
item glyphs in the same line-carved family as the UI chrome instead. They read cleanly and are
stylistically consistent, but they are simpler than what game-icons offers for hundreds of
distinct items.

This is *contained*, not baked in: content data references stable `iconId` strings declared in
`src/data/icons.ts`, so swapping in game-icons SVGs later changes one registry file and no game
data. Options:

1. **Keep the in-house set** — one consistent visual family, no attribution burden. Fine for
   1.0 if you like how they look.
2. **Vendor game-icons.net later** — you (or a session with network access to it) drop the SVGs
   into `public/assets/icons/`, and I wire the registry. Best when item variety grows past ~50
   distinct bases.
3. **Both** — in-house for UI chrome (as now), game-icons for items only.

**Default while unanswered: option 3** — keep the hand-drawn set in place, and treat vendoring
game-icons for items as a task for whenever the assets can actually be fetched. Nothing blocks.
→ `docs/tech/asset-pipeline.md` §2, `CREDITS.md`

*New product ambiguities get appended here under a dated heading with a proposed default (per
`CLAUDE.md` working rules).*
