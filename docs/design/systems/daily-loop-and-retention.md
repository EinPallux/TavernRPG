# System Spec — Daily Loop & Retention (Notice Board, Calendar, Resets)

> The systems that answer "why log in today?" — and the single reset engine that makes midnight
> trustworthy. Numbers: `../balancing-formulas.md` §13.

## 1. Notice Board (daily tasks)

A physical board by the tavern door (own screen + HUD badge with unclaimed-state dot). Unlocks level 3.

- **3 daily tasks** drawn from a pool respecting unlocked features, e.g. "Complete 5 missions",
  "Win 2 arena bouts", "Scrap 3 items", "Feed your pet", "Spend 5,000 gold on training". Weighted
  toward whatever the player has been neglecting (gentle re-engagement with breadth) `[TUNE]`.
- Points 40/30/30 → **Daily Chest at 100**: gold + materials + **1 Golden Die** (the dice paycheck).
- **Weekly ladder:** 7 daily-chest claims this week → **Weekly Chest**: 3 dice + 2 Ale + Rare+
  item (25% Epic). Resets Monday; missing a day makes the weekly chest tight but reachable (7/7
  needed by design — perfect-attendance psychology, Q-check in USER_QUESTIONS #16 discussion).
- Tasks auto-track (no "claim task" micro-clicks; one chest claim moment with burst animation).

## 2. Login Calendar (28-day cycle)

Marla's ledger page one click from the Tavern. Auto-stamps on first load of the day (stamp
animation + reward toast). Gold/materials/Ale cadence with **Golden Dice on days 7/14/21** and an
**Epic item + Moss Tortoise pet (first cycle) on day 28**. Missing a day **pauses** progress (never
resets — respect for the player, §13). Cycle restarts with refreshed rewards after day 28.

## 3. Town Crier engagement beats

The feed (world-sim §6) is also the retention surface: overnight summary card on first daily load
("While you slept: patrol earned 4,120 gold · Brenna Thornsong passed you — rank 214 → 217 ·
guild bounty hit 60%"). One card, three lines, one CTA ("Reclaim your rank").

## 4. The Reset Engine (technical contract)

- Single module owns the §5 economy-doc ledger: computes *missed resets* from
  `lastProcessedDay` → now on load (multi-day absences process each boundary in order — calendar
  stamps once, Vigor doesn't stack, weekly boundaries respected).
- All "daily" logic subscribes to this engine; **no feature checks the clock independently**
  (prevents the classic drift bugs: shop rerolled but tasks didn't).
- Reset moment while playing: 60s prior, HUD shows "The tavern clock strikes soon…" then a soft
  full-screen chime + summary of refreshed systems (never yanks an in-progress fight; queues behind modals).
- Timezone = device local; DST double/skipped midnights handled by day-key comparison
  (YYYY-MM-DD), not elapsed-hours.

## 5. Session bookends (feel)

- **First load of day:** overnight card → calendar stamp → board glance: a designed 60-second
  "morning at the tavern" ritual.
- **Out of Vigor:** the game *suggests the wind-down* (Patrol CTA + tomorrow preview: "New banner
  at dawn: Nighttide Silks") instead of a dead end — always end sessions pointing at tomorrow.
