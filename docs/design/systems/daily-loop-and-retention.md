# System Spec — Daily Loop & Retention (Notice Board, Calendar, Resets)

> The systems that answer "why log in today?" — and the single reset engine that makes midnight
> trustworthy. Numbers: `../balancing-formulas.md` §13. **Built in Phase 15.**

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

**40/30/30 means all three are required**, and that is the point rather than an accident of
arithmetic. A board where two of three suffices is a board whose third task is a suggestion, and
the third task is the one that sends the player somewhere they were not already going.

**The pool is feature-aware and the gate is `gateFor()`, not a level written down twice.** Every
entry names the place it sends you to; the draw skips a task whose room is shut, and the board
links straight there. The guild donation is skipped for a player with no hall as well as for one
below the gate — the Guild Hall opens at level 10 whether or not anyone let them in.

**One metric per slot.** Three variations on "run missions" is a worse board than three different
rooms, even on a day the weighting would have picked missions twice on merit.

**The weighting leans toward neglect at `1 + 0.85 × (1 − familiarity)`** `[TUNE]`, where
familiarity is a log of lifetime units. Never and once are different; four hundred and eight
hundred are not. Capped under 2× across the whole range, because a board that leans harder than
that becomes a list of everything the player has decided they do not enjoy.

**What the game counts lives in one place.** `data/progress.ts` owns the vocabulary; the weekly
Guild Bounty and the daily tasks each narrow to the subset they use, and `state/progressActions.ts`
is the only path from a player action to a number. Building this turned up that `itemsScrapped`
and `levelsGained` — two of the six bounty metrics — had never been credited from the player's
side at all, so a week drawing either gave the player nothing to do about it.

## 2. Login Calendar (28-day cycle)

Marla's ledger, a tab on the Notice Board. Auto-stamps on first load of the day — inside the one
reset walk, so a player who logs in, runs a mission and closes the tab has still been marked
present. Gold/materials/Ale/Tavern-Scraps cadence with **Golden Dice on days 7/14/21** and an
**Epic item + the Moss Tortoise (first cycle) on day 28**. Cycle restarts with refreshed rewards
after day 28.

**Missing a day pauses progress; it never resets it** (§13), and the implementation is the
argument. The state is `{ day, lastStampedDay, cyclesCompleted }` — a *count of days attended*
and the last date it happened. There is no streak field, so there is nowhere for a
"break the streak" branch to live. A player who vanishes for six weeks comes back to day 19,
because day 19 is what they earned.

That leaves exactly one rule to enforce: **one stamp per day.** `lastStampedDay` is compared,
never incremented — the same shape as the six other day-keyed high-water marks in the save, and
for the same reason: a day-keyed reward applied to the save doubles on reload without one, and
looks perfectly correct the first time.

Gold on the ledger is denominated in **Vigor**, not as a flat number, so a square is worth the
same share of a day's work at level 40 as it was at level 4.

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
- The walk returns a **ledger**, not a boolean: `daysProcessed`, `daysAway`, `weeksClosed` and
  `vigorForfeited`. Two surfaces need to say what happened — the reset-moment card and the
  overnight summary — and neither should be re-deriving it. `weeksClosed` in particular is handed
  out rather than recomputed, so the arena payout, the guild bounty and the weekly chest cannot
  disagree about which Sundays a fortnight's absence contained.
- **`audit.test.ts` enforces the rule structurally.** It reads the source and asserts that
  `processResets` has one caller, that every `refresh<Feature>Day` is called only from
  `refreshDay`, and that no screen compares a stored day key against today. A failure there is not
  a bug yet — it is the shape a bug takes three phases before it happens.
- Reset moment while playing: 60s prior, HUD shows "The tavern clock strikes soon…" then a soft
  full-screen chime + summary of refreshed systems (never yanks an in-progress fight; queues behind modals).
- Timezone = device local; DST double/skipped midnights handled by day-key comparison
  (YYYY-MM-DD), not elapsed-hours.

## 5. Session bookends (feel)

- **First load of day:** overnight card → calendar stamp → board glance: a designed 60-second
  "morning at the tavern" ritual.
- **Out of Vigor:** the game *suggests the wind-down* (Patrol CTA + tomorrow preview: "New card at
  dawn: Nighttide Silks") instead of a dead end — always end sessions pointing at tomorrow. The
  preview's three lines are gated the same way the reset ritual's are: a level-4 player being told
  which set Vesna will feature is being told about a door that does not open for four more levels.
