# System Spec — The Long Road (Campaign)

> A hundred and sixty-eight fixed stages leaving Emberhollow by the gate: press once, walk as far
> as your hero can get, then come back stronger. One Vigor a stage; a first clear pays once and
> never again. Numbers: `../balancing-formulas.md` §17, and §21 for the four chapters the far
> country added.

Backdrop: `mission_background_3.png` (the road out of town). Unlocks level 2 — early on purpose:
this is the one system a brand-new hero can push into on the day they arrive.

## 0. What it is, and what it is not

Raid's campaign, as this game's pieces. The loop the player asked for is *battle as far as you can;
when you die, upgrade your hero's stats, equip new gear, and go again* — so the road's job is to be
a **wall that moves**, not a payout. Three things make it that and none of them are decoration:

| | Missions | Dungeon floors | Campaign stages |
|---|---|---|---|
| Monster level | **yours** | fixed, ×1.35 | fixed, ×0.92–1.12 (boss ×1.5) |
| Rationed by | Vigor (10/20/30) | a key + a 30-min cooldown | Vigor (**1**) |
| Repeatable | endlessly, for full pay | no | yes, for **nothing** |
| Meant to | be won | stop you once | stop you where you are |

A mission is drawn at your level and is meant to lose. A floor is a single hard gate behind a key.
A stage is neither: it is cheap, small, and one of a hundred and sixty-eight in a line, so its
value is
spread along its length rather than banked in any one fight.

## 1. The road

**Ten chapters of twelve stages**, one chapter per zone in the order the road leaves town — so the
campaign walks the same map the mission board draws from, and chapter VII is the Ember Caves
whether you got there by contract or on foot.

| Ch | Zone | Levels (first → last) | Boss | Archetype | Signature |
|---|---|---|---|---|---|
| I | The Whispering Woods | 1 → 8 | The Hollow Stag | tank | The Rut (swarm) |
| II | Miller's Fields | 9 → 14 | Old Thresher | tank | Threshing Floor (hardening) |
| III | Old King's Road | 15 → 20 | The Toll Warden | tank | The Toll (siphon) |
| IV | Fogmoor Marsh | 21 → 28 | Mother Bogwillow | tank | Rootmother (swarm) |
| V | Thornhill Ruins | 29 → 36 | The Last Magistrate | tank | Verdict (hardening) |
| VI | Silverpine Pass | 37 → 46 | The Pale Outrider | tank | Tithe of the Pass (siphon) |
| VII | Ember Caves | 47 → 58 | Cinderjaw | bruiser | Cinderfall (swarm) |
| VIII | Gloomhollow | 59 → 72 | The Quiet Shepherd | bruiser | The Flock (hardening) |
| IX | The Sunken Chapel | 73 → 88 | The Drowned Choir | bruiser | Second Voice (swarm) |
| X | Frostfell Ridge | 89 → 100 | The White Between | bruiser | Whiteout (swarm) |

Two axes climb inside a chapter, and both are needed. **Level** rises from the chapter's first
step to its last; **budget** rises from ×0.92 to ×1.12, so two stages at the same level still get
harder — which matters, because the level curve is flat across three or four steps in the shorter
chapters. Chapter openers sit *below* par deliberately: the stage after a boss should read as a
breather, and the chapter's own ramp is what takes it back over.

Bosses cycle the three signature shapes — swarm, siphon, hardening — twice each across the first
six chapters and then in rising strength, so the mechanic that ends chapter IX is one the player
met and survived in chapter III.

## 2. Rules

1. **A stage costs 1 Vigor to attempt** — win or lose. A refunded loss makes pushing into a wall
   free, and a free wall is one the player hammers thirty times in a sitting instead of going and
   getting stronger, which is the entire loop this feature exists for.
2. **Progress is permanent and contiguous.** You cannot clear stage 5 without clearing 4, so the
   save holds one number. Chapter, step, wall and what is open are all derived from it.
3. **You may re-enter any stage behind you.** It costs the Vigor, plays the fight, and pays
   nothing — it is *practice*, and the screen says so before you spend and again afterwards.
4. **A first clear pays once**: gold at the stage's level, XP at the lower of your level and the
   stage's, and a chapter boss pays double plus a Golden Die. Nothing drops — the road is gold, XP
   and ground, and gear stays the mission board's and the dungeon's business.
5. **Full health at the start of every stage.** No attrition between stages: the wall is the
   monster getting stronger, not a health bar running down. (Answered by the user, 2026-08-01.)
6. **A loss takes nothing but the Vigor** — no lost ground, no cooldown, no penalty. What it
   leaves is a **best attempt**: the share of that monster's health you took off, which belongs to
   the wall stage only and resets the moment the wall falls.
7. **Each attempt is its own fight.** The seed is `(worldSeed, stage, attemptNumber)`, not
   `(worldSeed, stage)` — a stage seeded per stage would replay the identical losing fight forever
   and give a walled player no reason to come back after buying a sword.

## 3. The push

**One press walks the road.** "Push on" fights the wall, plays the battle scene, banks the result
and starts the next one — chaining until a loss, an empty tankard, the end of the road, or the
player pressing stop. The run ends by saying *which* of those it was.

That last one is not a detail. An auto-runner you cannot interrupt is a cutscene, and the battle
scene mounts over the road panel — so the Stop control lives in a floating chip above the fight,
carrying the run's readout (stage, cleared, Vigor left) beside it. `e2e/campaign.spec.ts` presses
it mid-fight, which is the only place that could be proven.

The chain's "are we still going" flag lives in a ref and every step re-reads the store, because a
timeout closure captured two stages ago holds a save that has since moved on.

## 4. The screen

- **Header** — the road walked as a meter (`n/120`), the Vigor tankard, and the pitch.
- **Chapter board** — ten numerals, only the reached ones enabled; twelve stones under them
  showing step, level, cleared (✦), locked (padlock) or the wall (a breathing amber outline, the
  only stone asking to be pressed). The board opens on **wherever the player is standing** and
  follows them out of a chapter when its boss falls; clicking a numeral pins one so they can look
  back without being dragged forward again.
- **In your way** — the wall's name and flavour, its stage/level, what a first clear pays, the
  boss's signature *in words before the first blow*, the best-attempt bar, and the button.
- **The fight** — the same `BattleScene` the tavern and the Undertavern use, four seconds for a
  stage and seven and a half for a boss, with the speed control and Skip the player already knows.
- **This push** — a running summary while the chain is going and after it stops: stages taken,
  gold, XP, and one sentence naming what ended it.

## 5. Cost and reward

`[TUNE]` markers all live in `balancing-formulas.md` §17 and in `engine/campaign/stages.ts`.

| Quantity | Value | Why |
|---|---|---|
| Vigor per stage | 1 | The road is meant to be walked, not rationed. |
| First clear | `6 ×` what one Vigor buys on the board | Six times sounds enormous until you notice it pays **once** and there are only 120 of them. |
| Chapter boss | `× 2` on that, plus 1 Golden Die | It is the wall; it pays like one. |
| Gold level | the **stage's** | A level-90 hero sweeping chapter I is paid chapter-I money, so back-filling needs no rule against it: it simply is not worth doing. |
| XP level | `min(hero, stage)` | One lucky win against a level-40 wall at level 12 would otherwise move the bar three levels. |
| Guild buffs | apply | A member's bonuses do not stop at the town gate. |

The whole road is worth roughly **900 Vigor-equivalents** — nine days of a full mission board —
spread over the months it takes to walk. Measured in `economy.test.ts`: about **11% of income in
week one**, under **5% by month three**, and never more than the mission board on any single day.

## 6. Where it sits

- **Vigor** is the only thing the road competes for, and it competes honestly: while the road is at
  your level a stage is the best thing a Vigor can buy, and once you outrun it the XP cap makes it
  content rather than income. `engine/economy/simulate.ts` models exactly that comparison.
- **`campaignStages`** is a `ProgressMetric` counted in **new ground** — a practice win does not
  credit it, or "clear three stages" on the Notice Board would mean clicking stage one three times.
  Two daily tasks read it, at two and four stages: small on purpose, because a walled player cannot
  clear *any* new stage today and a big target would be impossible on the hardest day.
  It is deliberately **not** a guild bounty metric — see the note in `data/bounties.ts`.
- **Nothing is stored but the four facts** (`stagesCleared`, `bestAttempt`, `attempts`,
  `finishedAt`). Save schema v17; the migration is additive and empty, because paying a returning
  player for stages nobody fought would be inventing gold *and* spending thirty of the hundred and
  twenty one-time rewards a hero ever gets.
- **The road has no midnight work**, so it adds nothing to the Reset Engine. Vigor refilling is
  already `refreshActivityDay`'s job and the road just spends it.

## 7. Open

- No stage drops gear. If the road ever needs a loot hook, it should be a chapter-completion chest
  rather than a per-stage roll — a per-stage roll at 1 Vigor is the cheapest drop source in the
  game by a factor of ten.
- Chapters XI+ are the obvious content patch: `CHAPTER_LEVELS` and one `CHAPTERS` entry per zone
  is the whole change, and `campaign.test.ts` measures the new wall automatically.
