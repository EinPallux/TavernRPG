# System Spec — Tavern Missions & Patrol

> The core loop (missions) and the zero-attention fallback (patrol). Numbers:
> `../balancing-formulas.md` §1–2, §6–7.

## 1. The Gilded Tankard (Tavern screen)

Backdrop: `tavern_background.png` (fireplace flicker + lantern glow ambient loops). Inhabitants:
**Marla** the barkeep (Ale & barks), the **quest giver table** (3 mission cards), door to
**Fortune's Table** (gacha, separate spec), Notice Board shortcut.

## 2. Vigor (thirst-for-adventure analog)

- **100 Vigor/day**, resets at local midnight (device clock; single-player, tampering is the
  player's own save — Q15). HUD shows a tankard gauge; hover = exact numbers + reset countdown.
- Missions cost Vigor = base duration in minutes (5/10/15/20).
- **Ale:** +20 Vigor, max 3/day: costs 1 Golden Die at Marla; free Ales drop rarely (cap 1/day) and
  from calendar/tasks — drinking a free Ale still counts against the 3/day cap.
- Vigor never banks above 100 + active Ale bonus; unspent Vigor is lost at reset (classic S&F
  pressure to log in).

## 3. Mission board

- **3 mission cards** drawn seeded-daily from the player's level band zones (`content-plan.md` §1):
  each shows zone art thumb, flavor blurb, duration options context, rewards preview (gold, XP,
  item-chance pips, rare-drop hints), and the monster silhouette (revealed if fought before).
- Player picks a card **and a duration** (5/10/15/20 min — one mission, scalable length; rewards
  scale linearly, 20-min carries best item odds). Mount reduces the *timer*, never cost/rewards.
- **Reroll the board:** free once/day, then 1 Golden Die (mirrors S&F shop reroll psychology).
- Accepting locks the mission: timer chip appears in HUD and on the Tavern screen (hero-walking
  progress ring over the zone thumb). Only one mission at a time; Patrol can't run concurrently.
- **Skip timer:** 1 Golden Die (full skip, any remaining time) — the impatience sink.
- On completion (real time, works while tab closed — Q3): "Return to the Tavern" state → player
  triggers the **fight** (seed pre-committed at accept). Win → rewards + possible drops (§7 tables);
  loss (rare) → 50% gold, no item, Vigor stays spent, gentle build hint.
- Offline queue: if the timer elapsed while away, the fight waits at the board — missions never
  auto-resolve; the battle is the payoff moment and is always watched (or skipped by choice).

## 4. Mission presentation details

- Mission accept = card stamp animation ("CONTRACTED") + Marla bark.
- Waiting state shows a living tavern (idle NPC sway, fire crackle); the mission card becomes a
  progress scene with the zone backdrop and a tiny walking hero icon.
- Completion burst + tavern door slam → fight CTA. Loot uses the rarity-beam reveal
  (`ui-ux-style-guide.md` §Loot).

## 5. Patrol (City Watch)

Backdrop: `patrol_background.png`. Guard-captain **Hildy** hosts.

- Purpose: the "I'm done for today" button — S&F City Guard analog (reference §2).
- Choose shift length **1–12 h** (slider, live payout preview). Rewards on collection:
  `goldPatrol(L)/h` + `4 × xpPerVigor(L)/h` (weak XP by design; missions always dominate).
- Runs in real time (offline included). **Cancel anytime** → pro-rated to full completed minutes.
- Cannot start while a mission runs (and vice versa); starting from the Tavern shows a polite
  Hildy confirm ("Off duty already?") if Vigor > 20 remains (soft anti-footgun, Q7).
- Collection moment: shift report card (hours, gold with Treasury bonus line, XP) + occasional
  flavor log lines ("03:12 — Escorted a very lost goose home."). Random *patrol events* with choices
  are post-1.0 (roadmap backlog) — 1.0 keeps flavor lines only, no mechanics.
- HUD chip mirrors mission chip (helmet icon + countdown).

## 6. Edge cases

- Clock set backwards: timers clamp (never negative, never re-award); forward jumps are honored
  (single-player stance, Q15) — implementation in `architecture.md` §Time.
- Mission accepted at 23:58 spans reset fine: Vigor was spent on accept; fight/rewards unaffected.
- 3 missions/board are guaranteed ≥2 zones for variety; a pity rule guarantees ≥1 item-drop mission
  (20-min card) per board.

## 6b. As built (Phase 5)

- **The board is drawn lazily**, on the first read of the day rather than at midnight, so a
  player who never opens the tavern never has a stale board to explain. Seeded from
  `(worldSeed, dayKey, rerollCount)`, which is what makes a refresh free and a reroll not.
- **The ≥2-zone guarantee is enforced, not hoped for**: the third card is forced onto an unused
  zone when the first two collide. It leans on `zonesForLevel` returning "band ± neighbours" —
  strict in-band selection leaves a level-50 hero with exactly one zone and the guarantee
  unsatisfiable.
- **Vigor is spent at accept**, which is why a mission signed at 23:58 is untouched by the
  midnight reset four minutes later.
- **The taken job leaves the board**; the other two stay. Accepting is the commitment, so the
  card it came from should not still be sitting there offering itself.
- **Rewards are banked when the fight *finishes*, not when it is opened.** Claiming on the way in
  lights up the HUD with the gold before the first sword is drawn, which spoils the scene. Nothing
  is at risk in waiting: the mission stays `pendingMission` until claimed, so closing the tab
  mid-battle leaves it waiting to be watched again.
- **A brand-new hero is given a kit** (`engine/items/starterKit.ts`) and meets no monster above
  their own level until level 5. Without either, the first mission is a coin flip; with both it is
  ~99% (balancing §5).
- Insufficient Vigor **disables the accept button with a reason on it** rather than failing on
  click — style guide §8. The shorter durations stay live, so the card is never a dead end.

## 6c. As built (Phase 6 — patrol)

- **A shift is three numbers and a level** (`startedAt`, `endsAt`, `hours`, `heroLevel`), and what
  it has earned is *computed from the clock, never accumulated*. That is the whole reason patrol
  survives a closed tab with no background timer, and the reason a rewound device clock cannot
  mint gold — `patrolEarnings` clamps to `[startedAt, endsAt]` at both ends.
- **Cancelling and collecting are the same call.** The only difference is how much time had been
  served. An abandoned shift can therefore never be paid by a different rule than a completed
  one; the report just labels itself `data-early` and says "paid for what you walked".
- **The level is recorded at signing.** A shift pays what it was worth when it started, so
  levelling mid-shift neither inflates nor devalues the hours already walked.
- **Exclusivity lives in the engine, not in a button.** `startShift` refuses while a mission is
  out and `acceptMission` refuses while on the beat, so the rule holds for every caller rather
  than only for the control that happens to check. A mission *waiting to be watched* counts as
  still out — the hero is at the door, not on the beat, and letting patrol start would strand an
  unwatched fight.
- **The screen's honesty rule:** the slider's promise must be the payout. `previewEarnings` and
  `patrolEarnings` are pinned to each other by a unit test at every hour and several levels. A
  preview that over-promises is worse than no preview.
- **The gate is enforced where the room renders,** not only where it is linked
  (`components/shell/GatedPlace.tsx`). The nav rail refusing to link to the watch house was
  enough while every gated place was a dressed placeholder; it stopped being enough the moment
  one of them paid real gold, because `/patrol` was still reachable by typing the URL.
- **Only completed shifts count toward `patrolsCompleted`** — walking off at 90 minutes of twelve
  is not a shift served, whatever it pays.
- Log lines are gated by shift length (`data/patrolLog.ts`): the night lines only appear on shifts
  long enough to have a night in them, and a longer shift tells more of the story. Lines are
  picked by index off a stable seed, never rolled — same rule as barks.

## 6d. As built (Phase 6 — economy pass 1)

- `engine/economy/simulate.ts` plays modeled days through the **real** formulas and records every
  coin. It calls the same functions the game does; nothing re-implements a curve. 15 CI bands in
  `economy.test.ts` cover pacing milestones, the "always slightly broke" purse, patrol staying the
  fallback, and ledger integrity. `/dev/economy` renders the same ledger day by day.
- **Pass 1 models only what exists** — missions, patrol, training. Shops (Phase 7), mounts, the
  gacha and guild bonuses are absent because they are not built, and a sim that invents numbers
  for unbuilt systems asserts a fiction. Each is added to `MODELLED_FAUCETS`/`MODELLED_SINKS` as
  it lands, and the bands tighten with it.
- The sim found the **XP curve was ~10× too slow** on its first run (balancing §1) and, once that
  was fixed, that **gear supply could not keep up** with the faster levelling — which is what the
  weapon pity floor in `items/drops.ts` is for until Phase 7's shops close the gap properly.

## 7. Data hooks

`MissionOffer` {id, zoneId, blurbId, monsterId, seed, durations, rewardsPreview},
`ActiveMission` {offer, chosenDuration, startedAt, endsAt, seed}, `PatrolShift` {startedAt, hours,
collected} — full types in `data-models.md`. Vigor/reset logic shared with the global reset engine
(`daily-loop-and-retention.md` §Resets).
