# USER_QUESTIONS — Decisions I need from you

> Answer inline under any question (short answers are fine). **Every question has a working
> default** — that's what I'll build if you leave it unanswered, so nothing blocks development.
> When you answer, I'll update the affected docs. Question numbers are referenced from the specs
> in `docs/` (e.g. "(Q4)"), so they stay fixed.

---

## A. Platform & saves

**Q1. Saves: local-first OK for 1.0?**
Plan: saves live in the browser (IndexedDB) with **export/import to a file** as backup/transfer.
No accounts, no server, no cross-device sync at 1.0 (cloud sync is a post-1.0 patch). This keeps
the game fully static on Vercel and shippable without auth/DB infrastructure.
**Default: yes, local-first.** → `docs/tech/architecture.md` §3

**Q2. How many save slots?** (parallel heroes, e.g. to try classes)
**Default: 3 slots.**

**Q3. Real-time progression while the browser is closed?**
Missions/patrol/world-sim continue in real time when the tab is closed (S&F server feel) — return
after 2 days and the ladder moved, patrol finished, your mission awaits its fight.
**Default: yes, full real-time.** (Alternative — "time pauses when closed" — is not S&F-like.)

## B. Core systems

**Q4. Guild-vs-guild battles in 1.0?** My plan keeps 1.0 guilds economic/social (donations →
+gold/+XP buffs, living chat, weekly co-op bounty) and ships **guild wars + raid bosses as the
flagship post-1.0 patch** — they need the battle scheduler matured, and 1.0 is already big.
**Default: guild wars post-1.0.** → `docs/design/systems/guilds.md`

**Q5. Mounts as 14-day rentals** (S&F-style recurring gold sink; the Royal Griffin −50% costs
Golden Dice) rather than permanent purchases?
**Default: rentals.** → `docs/design/systems/shops-and-stables.md` §4

**Q6. Premium currency = "Golden Dice" 🎲 and the gacha = "Fortune's Table"** (a tarot/dice den
behind the tavern, hosted by Madame Vesna)? Naming unifies premium + gacha thematically
(dice → fortune → gambling den). Alternatives: Gems/Crowns/Mead + a generic summon altar.
**Default: Golden Dice + Fortune's Table.** → `docs/design/systems/gacha-fortunes-table.md`

**Q7. Daily active-play budget:** Vigor 100/day (≈100 mission-minutes) + up to 3 Ale refills
(+20 each) ≈ **45–75 min of engaged play/day** (with mount, spread across check-ins) before
Patrol takes over. More generous? Tighter?
**Default: 100 + 3×20 Ale.** → `docs/design/balancing-formulas.md` §6

**Q8. Gacha tuning:** pity at 20 rolls (weekly set banner), dice income ≈1.6/day, duplicates
convert to materials + recipe shards. Feel right, or pity tighter (15) / looser (30)?
**Default: pity 20.** → gacha spec §4

**Q9. Content volumes for 1.0** (my targets): 3 dungeons · 10 gear sets (2/class) · 12 pets ·
~96 mission monsters · 10 zones · ~160 mission blurbs. Anything you want more/less of?
**Default: as listed.** → `docs/design/content-plan.md`

## C. World, tone & language

**Q10. World size & bot naming: 1,500 simulated heroes / 60 guilds**, seeded as a ~90-day-old
server (you start at the bottom of a living ladder; Rank 1 reachable in ~6 months). Bot names are
serious-fantasy with light epithets ("Kargath the Unlucky") — not joke names.
**Default: 1,500 / 60, light-epithet names.** → world-sim spec §2

**Q11. Overall tone:** cozy-warm fantasy with light humor via NPC keeper barks (Marla, Torvald,
Madame Vesna…) — NOT S&F's outright parody/pop-culture-joke tone; matches your art's vibe.
**Default: cozy with a wink.** → GDD §5

**Q12. Language:** English-only at 1.0, all strings centralized so localization (German first?)
can ship as a patch.
**Default: English-only 1.0.**

**Q13. Sound in 1.0:** light SFX pass (~20 sounds: coins, hits, crits, reveals; CC0 sources,
master toggle) — or fully silent 1.0?
**Default: light SFX, on by default with an easy toggle.** → asset pipeline §6

## D. Presentation & remaining decisions

**Q14. Fonts:** display **Alegreya Sans SC** (small-caps humanist sans — medieval feel, zero
serifs) + body **Inter**. Both free (Google Fonts, self-hosted). Approve, or want a different vibe?
**Default: as proposed.** → style guide §5

**Q15. Save-editing tolerance:** export files are (compressed) JSON a determined player could
edit. Single-player: cheating only cheats yourself; obfuscation costs effort better spent on the
game. Accept?
**Default: accept editable saves, no anti-cheat.**

**Q16. Daily/weekly strictness:** Weekly Chest requires **7/7 daily clears**; arena pays rewards
for the **first 10 wins/day**. Both are classic perfect-attendance pressure — keep, or soften
(e.g. weekly chest at 6/7)?
**Default: keep 7/7 and 10/day.** → daily-loop spec §1, arena spec §1

**Q17. Dungeon retry: 30-minute cooldown after a loss** (prevents brute-force spam, keeps "come
back stronger"), free instant chaining after wins. Alternative: no cooldown at all (S&F-style).
**Default: 30 min after losses.** → dungeons spec §2

**Q18. Third gear set per class** ships in 1.1 (names already teased in `gear-sets.md`) rather
than 1.0 — keeps the launch chase tight and gives patches headline content.
**Default: 1.1.**

**Q19. Minimum resolution:** optimized for 1920×1080 & 2560×1440; *functional* down to 1366×768
(nav rail collapses). Below that: unsupported notice. No mobile at 1.0. OK?
**Default: as listed.** → style guide §2

**Q20. Hero appearance:** 1.0 uses your five class portraits as-is (no gender/appearance
variants). Variants become content patches when you design more art.
**Default: class portrait only.**

---

*Unanswered questions never block development — defaults apply and are marked in the specs. New
questions arising during coding phases get appended here in dated sections.*
