# The Collector's Album

> **Status:** shipped (post-1.0). Save schema **v19**.
> **Canon:** GDD §4 · numbers in `balancing-formulas.md` §20 · code in `src/data/album.ts`,
> `src/engine/album/`, `src/state/albumActions.ts`, `src/components/album/AlbumScreen.tsx`.

---

## 1. What it is, and the problem it solves

A bestiary the player fills by **beating** things. Nineteen pages, 186 entries: one page per zone
(its mission roster, nine or ten deep) and one per dungeon (its ten floors). Finishing a page pays
a small, permanent multiplier on gold *and* experience, for good.

It was thirteen pages over 126 at 1.0. The far country grew it to nineteen without this feature
being touched, because the pages are *derived* from the content modules — which is the argument in
§2 paying for itself on the first occasion it could.

It exists because a game with 96 mission monsters across ten level-banded zones throws almost all
of them away. You outlevel the Whispering Woods in the first week and never see a Sootback Boar
again — the content is bought, built and then discarded by the very progression it was made for.
Before the album, a contract was picked on two axes, duration and payout, and the zone was
scenery.

The album adds a third axis that costs no new content: **where**. A player with eight of ten Woods
entries has a reason to take a level-3 contract at level 40, and the reason is legible, bounded and
worth a real number.

Three secondary jobs it does:

- it makes the Long Road's early chapters worth walking twice over, because a chapter's stages are
  its zone's roster;
- it gives the Undertavern's fifty floors a record that survives the trophy;
- it gives a very long-tail player something to finish that is not a stat.

**Not** a battle pass, not timed, not purchasable, and it cannot be missed: everything in it is
something the player was going to fight anyway.

---

## 2. The pages, and why almost nothing is stored

`data/album.ts` derives every page from `MONSTERS`, `DUNGEONS` and `ZONES` — which is why the far
country's four zones and two dungeons arrived as six new pages without this module being edited at
all. There is no second
list of who exists — a second list is a second place for a monster to go missing, and adding a zone
or a dungeon adds a page for free. `album.test.ts` counts rather than lists, so "every monster is
filed exactly once" is asserted as a property.

Pages are ordered zones-then-dungeons, each group by the level it is met at. The screen labels the
two groups, because a list that runs Lv 84 then Lv 10 looks like a sort that broke.

### What the save holds

```ts
album: { foes: string[] }   // v19
```

One set of ids. Nothing else — no per-monster tally, no page state, no bonus.

This is the rare case that fails CLAUDE.md's "don't store what the save can already answer", and it
fails it honestly. `PROGRESS_METRICS` counts **actions** (contracts won, items scrapped, levels
gained) and `activity.zoneMissions` counts **attempts per zone**. Neither carries monster identity,
and no arrangement of counters can: the fact is not implied by anything already written down. It is
the same argument the pets doc makes for `pets.eggs` and `gacha.pets`.

It is a set rather than a tally because the album asks one thing of each foe — beaten, or not — so
it stores one bit, spelled as membership. A kill count would be a bigger save, a bigger migration
and a harder question to answer on screen.

### Why the Long Road's bosses are not a page of their own

They are foes, they are named, and they are the game's most memorable fights. They still do not
belong here, for the storage rule read backwards: a boss stands on stage 12, 24, … 168, and
`campaign.stagesCleared` is a single contiguous number, so "have I beaten the Ashen Warden" is
`stagesCleared >= 12`. Filing them would put a derivable fact in a stored set.

The design reason agrees. A zone page makes a level band worth revisiting and a dungeon page makes
a delve worth finishing; a road page would restate progress the player is already making, and it
would move the capstone behind the last stage — turning "beaten one of everything" into "finished the
entire game", which is a different promise. The road still *fills* the album: its ordinary stages
are the chapter zone's roster, so pushing records foes exactly as a contract does.

### The engine

`engine/album/album.ts`, three pure functions:

| Function | Answers |
|---|---|
| `recordFoe(foes, id)` | What this victory did — the entry added, and whether it finished a page |
| `albumProgress(foes)` | How full the book is, page by page |
| `albumBonus(foes)` | What it is paying, as a `PayoutBonus` |

`recordFoe` returns an **outcome** rather than a boolean because the page completing is the moment
worth a flourish, and the caller cannot work it out afterwards — by then the page is simply full
and looks the same as it will on the next kill. It is idempotent by construction: the hundredth
Sootback Boar returns the identical array, so the caller's spread is a no-op and the autosave has
nothing to write.

`albumProgress` counts against the pages rather than `foes.length`, so an id left behind by a
deleted monster cannot inflate the total into "187/186".

---

## 3. Recording a victory — one path

`state/albumActions.ts#recordVictory(save, foeId)` is the only thing that writes `album.foes`, and
**missions, delves and the Long Road all call it**. `albumActions.test.ts` reads the source to
check both halves of that: that nothing else assigns the slice, and that all three transitions call
it and return the record on their result.

The audit exists because the failure is silent. Three call sites that each have to remember is
three chances at a page that can never be finished, and nothing about the fight, the payout or the
save would look wrong. Phase 15 found `itemsScrapped` and `levelsGained` had *never* been credited
from the player's side despite being bounty metrics — the same bug with a different name.

Two rules the three callers do not share:

- **Arena duels record nothing.** An opponent is another hero and belongs in no bestiary.
  `recordFoe` answers that by returning `added: null` for an id it cannot place, rather than by
  each caller being asked not to call it.
- **Campaign practice counts.** `campaignStages` credits *new ground* only, because a farmable
  stage would make "clear three stages" mean "press stage one three times". The album measures
  whether you have ever beaten a Sootback Boar, and beating one on a re-run is beating one. It is a
  set, so the second time is free.

### The reward

`albumBonus` folds into `state/petActions.ts#payoutBonus` beside the greenhorn's due, the guild
tracks and the pet's boost — one edit, and it reaches every payout the game bonuses at all.

**Gold and experience by the same factor**, which is the safety argument rather than a stylistic
choice (balancing §19, §20). Gold per level is `goldPerVigor × vigorPerLevel`; scaling both leaves
it invariant, so a completionist arrives at every level with the attributes they always would have
had and only the clock moves. On XP alone the album would level its most engaged players into
monsters they could not afford — punishing the exact behaviour it rewards.

Numbers, the two-sided reasoning and the measured effect: **balancing §20**.

---

## 4. The screen

A third tab on the character screen, beside *Gear & training* and *Set collections*. Not a room:
the town map is one painting with fourteen artist-drawn nameplates and a census test, and the album
is a ledger you keep rather than a place you walk to.

Layout is Set Collections turned ninety degrees — nineteen pages down the left, one page's foes on
the right — because this is a page you *visit* rather than glance at, and a deliberate selection
beats scrolling 186 cells.

**The open page is derived, not stored.** State holds only a pinned override; with nothing pinned
the shown page is the first unfinished one — where the work is. Storing a default of page one would
open a finished Whispering Woods for a player fifty hours in, which is precisely the bug the road's
chapter board shipped.

**An unrecorded foe keeps its name.** The obvious build silhouettes the name too, and it is the
wrong call here: nothing in Emberhollow lets a player look a monster up, so a hidden name is a goal
with no way to pursue it. The cell shows the name muted, the archetype glyph as a silhouette, and
no flavour — you know what you are hunting and where, and beating it is still what turns the light
on.

**The archetype glyph is tinted by the fight's own palette.** `data/combatVfx.ts` already assigns
every archetype a school with a colour, so a recorded Caster is the same red-hex as the caster the
player fought. One source for the colour, not two.

**The bonus is stated twice on purpose** — what the book pays now, and what a finished book would
pay. A collection with an unstated reward is a chore, and rule 6 says the odds are always visible.

### The moment

`BattleResult` takes the record and shows one of two things after the spoils:

- **Recorded** — a quiet line naming the foe and the page it went on.
- **Page complete** — an amber band with a laurel seal stamping down, naming the page and the
  permanent 1% it just bought.

The difference between them is the whole reason `recordFoe` returns an outcome. A page completing
is worth a permanent raise on every payout the player will ever take, and a feature that pays that
quietly is a feature nobody knows they have.

---

## 5. Tests

| File | What it defends |
|---|---|
| `src/data/album.test.ts` | The census: every monster and floor filed exactly once, pages sorted, road bosses out |
| `src/engine/album/album.test.ts` | Idempotence, page completion firing once, the bonus curve, gold ≡ xp |
| `src/state/albumActions.test.ts` | One write path, all three callers, the fold |
| `src/engine/save/fixtures.test.ts` | The v19 fixture — eight finished pages, one part-filled, four empty |
| `src/engine/economy/economy.test.ts` | The fill pace, monotonicity, and the A/B against a player whose book stays shut |
| `e2e/album.spec.ts` | Opens where the work is, records on a win, survives a reload, agrees with the Tankard |
