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

**Q21. Item icons: game-icons.net is unreachable from the build environment.** ✅ **Answered
2026-08-01: vendor them — and for the whole set, not only items.** (Detail at the end of the
entry; the original question is left intact because its reasoning is what made the swap cheap.)
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

**Answered 2026-08-01 — "update ALL icons with better fitting ones from game-icons.net":** option
2, and further than option 2. Not items only — everything: 67 of the 69 ids, chrome included.
The premise that made this a question is gone; game-icons.net itself is still blocked from the
sandbox, but the upstream mirror repository turned out to be reachable over git, which is also
what makes the licence dischargeable, since that repo encodes the author in the directory path
and CC BY 3.0 credits the artist rather than the site. The prediction in the question held
exactly: the swap was one registry file (`src/components/icons/index.tsx`), a mapping
(`scripts/icon-map.mjs`) and a generator, and **no game data changed** — `iconId` strings did
their job. The chevron and the Vigor tankard stayed hand-drawn on their merits, not on the
question's. See ROADMAP §Post-1.0, style guide §6, asset-pipeline §2, CREDITS.md.
→ `docs/tech/asset-pipeline.md` §2, `CREDITS.md`

*New product ambiguities get appended here under a dated heading with a proposed default (per
`CLAUDE.md` working rules).*

---

## 2026-07-31 — Phase 17 (Balancing)

**Q22. The §0 milestone table's middle row cannot be hit with any smooth XP curve.**
The pacing sim (`npm run pacing`) now measures the reference player against §0. Two of the three
level rows fit comfortably; the third does not, and the reason is arithmetic rather than tuning.

Hitting **level 10 by day 3** and **level 55 by day 30** fixes the two ends of the curve. Between
them, **level 25 by day 14** demands that the average cost of a level *fall* from 96.8 Vigor
(levels 10–24) to 70.4 Vigor (levels 25–54) — a game that speeds up as you climb. No monotone
divisor can do it, and the shape it would need is not one we want.

What is shipped: `XP_DIVISOR_BASE`/`PER_LEVEL` re-fitted from 28/1.2 to **42/1.5**, which lands
L10 at 3.5 days (+17%), L25 at 11.4 (−19%) and L55 at 34.5 (+15%) — every row inside the ±20%
the ROADMAP asks for, with the error spread evenly rather than parked on one row.

1. **Leave it.** All three rows pass at ±20%; the table stays as written and the sim keeps
   measuring against it.
2. **Move the L25 row to ~day 11** to match the curve the other two rows imply, so the table
   describes the game rather than a third target pulling against them.
3. **Slow the mid-game deliberately** with a non-monotone curve (a plateau between 10 and 25).
   Buys the table at the cost of a stretch where levelling visibly stalls.

**Default while unanswered: option 1** — nothing is out of tolerance, so nothing is blocked.
→ `docs/design/balancing-formulas.md` §0, §1

**Q23. A full five-piece set takes ~125 days, against §0's 45–60.**
Mission drops carry `set: 0` by design — set pieces come from Vesna's featured card and the
forge's recipes, nowhere else. On the published featured rate, and counting only the gacha, the
reference player closes their first five-piece set around **day 125**. First *piece* arrives about
day 12, so §0's "level 55 with 1–2 set pieces by day 30" is met; it is the *completion* promise
that is roughly 2.4× out.

This is a design decision rather than a tuning one — it touches a published rate, the odds panel
and the F2P promise — so it is yours:

1. **Raise the featured rate** (the direct lever). Changes a number printed on the odds panel and
   makes every banner more generous, including for pieces the player is not chasing.
2. **Let recipes carry the chase.** A recipe craft is a *guaranteed* piece of a named set, which
   is exactly the deterministic path the design added; making recipes more common (dungeon drops,
   Vesna's monthly track) or cheaper in Starmetal closes sets without touching the gacha odds.
   The sim deliberately excludes this route today, so today's 125 days is the pessimistic floor.
3. **Let missions drop set pieces** at a low weight, so the chase advances while playing the core
   loop rather than only at the two premium rooms.
4. **Move the §0 row to ~90–120 days** and treat a full set as a two-to-four-month chase.

**Default while unanswered: option 2** — it is the only one that does not touch a published rate
or the loop's loot table, and the deterministic path is already built. Nothing is blocked either
way; `pacing.test.ts` asserts today's number so the change is visible when it happens.
→ `docs/design/systems/gear-sets.md`, `docs/design/balancing-formulas.md` §0

> **Resolved 2026-07-31 under the stated default (option 2), and the diagnosis was incomplete.**
> The 125 days was not only the gacha's rate. The sim *excluded the forge* — on the reasoning
> that a deterministic craft would flatter the number — and the forge route was itself
> unreachable: a recipe costs 2 Starmetal, Starmetal comes only from scrapping an Epic, and an
> Epic scrap paid an average of **half of one**, pricing the "guaranteed path" at ~210 days.
> Each fact concealed the other. The sim now costs the recipe route from the real material
> budget, and an Epic scrap yields **1–2** Starmetal. A full set closes at **day 51.5** against
> the 52-day target. No published rate moved and the mission loot table is untouched, which is
> what option 2 asked for. Recorded in balancing §16.1.

---

---

## 2026-07-31 — Phase 18 (Release hardening)

**Q24. Should the full OFL 1.1 text ship next to the fonts, or is a link enough?**
`next/font/google` self-hosts: both typefaces are downloaded at build and served as `.woff2` from
this origin, so the build *redistributes* them. The SIL Open Font License requires that "the above
copyright notice and this license notice shall be included in all copies" of the font software.

Named designers and a link to the licence now appear in `CREDITS.md` and on the in-game credits
screen, which is what almost every site serving Google Fonts does. Whether a link satisfies
"included in all copies" for a webfont is a genuine judgement call, and it is the kind that should
be made on purpose rather than by inheriting the default.

1. **Link only** (as now). Standard practice; the notice is present and the licence is one click
   away.
2. **Vendor the licence text** into `public/licenses/OFL-1.1.txt` and link to the local copy. A
   few kilobytes, removes the question entirely, and survives the linked page moving.
3. **Both** — vendor the text *and* keep the upstream link.

**Default while unanswered: option 1**, because it is what the ecosystem does and the attribution
itself is unambiguous and present. Nothing is blocked; option 2 is a ten-minute change whenever
you want it. Worth a deliberate answer before 1.0 rather than a shrug.
→ `CREDITS.md`, `src/data/credits.ts`

## 2026-08-01 — the day's work (Golden Dice for Vigor spent)

**Q25. More Vigor is faster levelling, and §0's level rows were re-fitted rather than the feature
trimmed.** ✅ **Answered 2026-08-01: keep three dice a day, move the rows.**

The ask was "some ways to daily farm Golden Dice, especially now the Campaign needs Vigor". The
answer shipped is balancing §18: a die at 50, 100 and 150 Vigor spent, up to three a day.

The consequence was measured before shipping and is larger than the obvious one. Three Ale a day
becomes self-funding, which is **+60% Vigor**, and Vigor is XP:

| Ale/day | Level 10 | Level 25 | Level 55 |
|---|---|---|---|
| 0 (before) | 3.3 | 10.0 | 31.7 |
| 3 (shipped) | **2.2** | **6.9** | **21.8** |

Level rows are two-sided *schedules*, so arriving early failed exactly as arriving late would.
There is no mechanism that adds Vigor without speeding the ladder, so the choice was between the
feature and a written-down schedule. §0's level rows now describe the game: level 25 in the first
week, level 55 on day 20–26. The set rows did **not** move — the extra dice go to Ale, not to
Fortune's Table — and the deadline rows were already generous.

Alternatives considered and not taken, in case this wants revisiting:

1. **Cap the self-funded Ale at 1** (rungs at 50/100 only). +20% Vigor, §0 untouched, level 55 on
   day 27. Ale stops being fully self-funding.
2. **Three dice, but the third cannot buy Ale.** +40% Vigor, level 55 on day 24 — right on the
   band's edge — at the cost of a rule players have to be told.

→ `docs/design/balancing-formulas.md` §0, §18

## 2026-08-01 — the greenhorn's due (early-game scaling)

**Q26. How far into the game should the early-game bonus reach, and does §0's level-10 row move
again?** ✅ **Answered 2026-08-01 within the latitude the ask gave: ×1.6 fading to nothing at
level 25; the level-10 row moves, the other two do not.**

The ask was "add scaling to the Tavern Missions — 20 minutes of waiting is too little XP early on;
make early game a little bit quicker, up until like level 20 or something or maybe even 40". The
answer shipped is balancing §19.

The measured problem first, because it was worse than "a little": `vigorPerLevel` curves from 2.30
levels per hundred Vigor at level 1 to 1.55 at fifteen, which is a decay too flat to be felt. Two
contracts bought a level at level one and a shade over two bought one at fifteen — the same forty
minutes of waiting per level, over and over, across the whole of onboarding.

The `(peak, until)` sweep, in days to each milestone:

| Peak | Until | Level 10 | Level 25 | Level 55 | Full set |
|---|---|---|---|---|---|
| ×1.0 | — | 2.2 | 6.9 | 21.8 | 51.5 |
| ×1.4 | 40 | 1.7 | 5.4 | 19.6 | 51.5 |
| ×1.6 | 40 | 1.5 | 4.9 | 18.8 | 51.5 |
| **×1.6** | **25** | **1.5** | **5.3** | **20.1** | **51.5** |
| ×1.9 | 25 | 1.3 | 5.4 | 21.2 | 51.5 |

**Concentrated rather than spread**, which is the one genuinely arguable call. ×1.6-to-25 and
×1.4-to-40 buy the same level-10 day; the short shape then disturbs level 55 by 8% against the long
one's 10% *and* gives a stronger kick in the first hour, because the help is spent where the player
is deciding whether to stay rather than dribbled across a fortnight they had already committed to.
The contrast is also legible in a way a fortnight-long fade is not: fast, then normal.

§0's level-10 row moved from "day 2–3" to "day 1–2" — the second re-fit in two slices, and unlike
Q25's this one is the *point* rather than a side effect: the ask was for level 10 to arrive sooner.
Level 55 did **not** move, which is the property the "until 25" choice was made for. Level 25's
window had its early edge widened by a day, to 5–9: the row has always promised "the first week"
and 5.3 is inside it, but the parenthesised range said 6. The ±20% band would have covered the
difference; the range was edited rather than leaned on, because a window the reference player
predictably lands outside of is not a window. Every §0 row now sits inside its own window.

Alternatives considered and not taken, in case this wants revisiting:

1. **×1.4 to level 40**, the far end of the range in the ask. A gentler ramp that reaches further,
   at a slightly weaker start and slightly more disturbance to level 55.
2. **×1.9 to level 25.** Level 10 on day 1.3, but level 55 drifts *back* to 21.2 as the sharper
   early lead gets spent on higher-cost levels — more bonus buying less schedule.
3. **XP only, gold untouched.** Rejected on the merits rather than the numbers: gold per level is
   `goldPerVigor × vigorPerLevel`, so scaling XP alone lands the player at each level under-trained
   against monsters priced for it. A faster ride into a wall.

→ `docs/design/balancing-formulas.md` §0, §19

---

**Q27. What belongs in the Collector's Album, and what is a finished book worth?**
✅ **Decided: 126 foes over 13 pages (zones + dungeons, no campaign bosses); +1% a page, +5%
capstone, +18% full.** *(2026-08-01 — flagging rather than asking, because both halves are
arguable and both are cheap to revisit. Numbers: balancing §20; spec: `systems/album.md`.)*

**What is in it.** Every mission monster (96, on ten zone pages) and every dungeon floor (30, on
three). The Long Road's ten chapter bosses are **out**, and that is the call worth defending: they
are the game's most memorable fights, so the instinct is to file them. Two arguments say no.

1. `campaign.stagesCleared` is a single contiguous number, so "have I beaten the Ashen Warden" is
   `stagesCleared >= 12`. Filing them would put a **derivable** fact into a stored set, which is
   the antipattern the album is otherwise the honest exception to.
2. A zone page makes a level band worth revisiting; a dungeon page makes a delve worth finishing.
   A road page would restate progress the player is already making for its own sake — and it would
   move the capstone behind stage 120, turning "beaten one of everything" into "finished the entire
   game", which is a different promise from the one the screen makes.

If this is revisited, the cheapest version is a fourteenth page that pays **no** page bonus and does
not gate the capstone — a trophy shelf rather than a scoring page. That keeps the memory and avoids
both objections.

**What it pays.** Thirteen pages at 1% plus 5% for the lot, on gold *and* experience together.

| Shape | Full book | Why not |
|---|---|---|
| 1% a page, no capstone | +13% | Finishing the *last* page — every zone and all thirty floors — is a different achievement from finishing the tenth, and reads as nothing |
| **1% a page + 5%** | **+18%** | **taken** |
| 2% a page + 10% | +36% | A third of every payout for a collection is a second economy, not a bonus; the 90-day A/B would land near 1.4× |
| Scaled by page size | 8–10% per page | A player working out which page pays best is doing arithmetic instead of playing, and the pages differ by one entry |

Measured over ninety days the modelled player finishes 9–10 zone pages and earns **1.02–1.20×** an
identical player whose book stays shut. Every §0 row is unmoved. The gear-share economy floor came
down from 2% to 1.5%, which is a property of that band rather than of this feature — a fixed count
of shop buys divided by a growing income falls whatever the income is doing.

**Not asked, deliberately:** whether the bonus should be Golden Dice instead of a multiplier. Dice
are earn-only and the day's-work track already prints the daily ones; a second dice faucet tied to
a months-long collection would be either negligible or a reason to farm old zones on a schedule,
and the multiplier is the version that just pays you for playing where you like.

→ `docs/design/systems/album.md`, `docs/design/balancing-formulas.md` §20
