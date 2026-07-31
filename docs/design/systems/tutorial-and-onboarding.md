# System Spec — Tutorial & Onboarding

> A fully guided first hour that never feels like homework, plus level-gated feature unlocks that
> double as pacing. Goal: an S&F-newcomer reaches level 10 with zero external help and can explain
> Vigor, training, and the ladder in their own words.

## 1. Principles

1. **Play first, read never.** Every beat is "do the thing with the UI spotlighted", max 2
   sentences of Marla voiceover text per step. No tutorial screens without an action.
2. **The tavern teaches.** Marla (barkeep) is the guide; keepers introduce their own buildings.
3. **Skippable, resumable, replayable.** "I've been here before" opt-out at creation (marks all
   beats seen, keeps unlock gates); tutorial state survives reload mid-beat; glossary tooltips
   remain forever (40 entries, content plan §7).
4. **Gates = curriculum.** Features unlock by level so the first days introduce one system at a
   time (S&F's proven drip — reference §13).

## 2. The 12 beats (first ~20 minutes)

1. **Welcome in** — creation done, Marla greets by name, points at the quest table. *(spotlight: mission board)*
2. **First mission** — forced 5-min card shown, but first mission timer is tutorial-shortened to
   20s ("The well is *right there*."). *(learn: accept/duration)*
3. **First fight** — battle scene at forced ×1 with three callouts (HP bars, damage numbers, your proc). *(learn: combat is watchable)*
4. **First loot** — rarity beam, equip via drag with slot glow. *(learn: item cards, paperdoll)*
5. **Get stronger with gold** — training panel spotlight, buy 3 points (gifted gold), watch derived stats move. *(learn: the gold sink)*
6. **A real mission** — free choice of the 3 cards; introduce Vigor gauge ("Adventure runs on ale and daylight."). *(learn: budget)*
7. **The Armory** — Bram intro, compare tooltip spotlight, sell one starter item. *(learn: commerce; gates: shops @lvl 2)*
8. **Notice Board** — today's tasks + chest preview. *(gates: board @lvl 3)*
9. **The Proving Grounds** — Hildy walks you to your first arena win (opponent draw is
   seeded-friendly: a bot 2 levels below), ladder-swap animation highlighted, rank shown on HoF. *(gates: arena @lvl 4)*
10. **Patrol** — end-of-Vigor moment triggers Hildy's patrol pitch; start a 1h shift. *(learn: the AFK fallback)*
11. **Overnight return** — next-day first load: overnight card walkthrough (patrol collect,
    calendar stamp, shop restock ping). *(learn: the day loop)*
12. **The ladder is alive** — Town Crier shows a bot passing the player; "Reclaim it" CTA into
    arena; on win, tutorial completes with a keepsake (Tankard Imp progress hint + 2 Golden Dice).

## 3. Feature unlock gates

| Level | Unlocks (toast + nav rail reveal animation + keeper bark) |
|---|---|
| 1 | Tavern, Character, Missions |
| 2 | Shops (Armory, Gilded Facet) |
| 3 | Notice Board, Patrol |
| 4 | Arena, Hall of Fame |
| 5 | Stables |
| 6 | Emberforge |
| 8 | Fortune's Table, Menagerie |
| 10 | Undertavern (dungeons), Guilds |

Locked rail items show as darkened silhouettes with level tags (visible ambition, no mystery meat).

## 4. Post-tutorial guidance (soft)

- **Next Step hint chip** (dismissible, single, priority-picked): "Rusty Key found — the Cellars
  await" > "Banner ends tonight" > "3 unspent stat buys". Never more than one hint at once.
- First-encounter micro-explainers (one-time 1-liners) for: first Epic, first set piece, first
  revenge chip, first pity trigger, first dungeon wall (the "walls are normal" message).
- Loss screens always teach (combat doc §6): the reason hint doubles as ongoing tutorialization.

## 5. Data hooks

`TutorialState` {beat, seenBeats, optedOut}, `FeatureGates` derived from level (single source used
by nav rail, routers, and task pool). Beats are data-driven (`src/data/tutorial.ts`) with
spotlight target selectors, copy keys, and completion predicates — new beats ship as content.

## 6. As built (Phase 16)

The twelve beats, the spotlight, the glossary and the six explainers all shipped. Five decisions
diverged from — or sharpened — the spec above, and each is worth knowing before touching this.

### The active beat is derived, not stored

`TutorialState` in §5 named a `beat` cursor. There isn't one. `engine/tutorial/beats.ts#activeBeat`
walks the twelve in curriculum order and returns **the first the save cannot already prove
happened**. Nothing advances it; the predicate simply stops being false.

That buys resumability outright — "resumable mid-beat" (§1 rule 3) needed no code, because the
position was never written down — and it removes the whole class of bug where a cursor points at
something already done (a second tab, an action that fired twice, a migration landing mid-tour).

**The price, and it is a real one: every predicate must be monotone.** Once true for a save, true
for every save after it. The first draft finished beat 4 on "are your bags empty?", which is false
again the moment a second contract drops something — and beat 7 asks the player to *hold* loot for
Bram to buy. Beat 4 would have reactivated every time they did what beat 7 asked, and the tour
could never have reached beat 8. `engine/tutorial/tutorial.test.ts` replays a whole playthrough and
fails on any step where the finished count falls.

Making them monotone added three facts to `data/progress.ts`: `missionsAccepted` (signed),
`missionsReturned` (came home) and `itemsEquipped`. Three counters over one lifecycle, not three
names for one event — each is a different moment the tour has to be able to point at.

Only the two `'read'` beats store anything (`tutorial.acknowledged`), because "notice this" has no
observable consequence to derive from.

### The overlay only draws when it has a hole

The spotlight is one element with `0 0 0 100vmax` of box-shadow, and the whole layer is
`pointer-events-none` except the keeper's card — the dim is a *look*, not a modal, so every control
on screen stays live including the ones the beat is not pointing at.

When there is no hole — the player is in another room, or the beat's target has not mounted — the
tour renders **nothing over the page** and speaks from a chip in the HUD instead (`TutorialChip`,
beside the Next Step chip). This replaced a version that floated a card bottom-centre in that case,
which sat directly on Vesna's roll buttons and failed three Fortune's Table e2e tests with "subtree
intercepts pointer events". A tutorial blocking a button in a room it is not talking about is the
exact failure the layer exists to avoid, so the fix is structural rather than careful.

### The first contract, and only the first

`FIRST_MISSION_MS = 20_000` moves **`endsAt` and nothing else**. The Vigor is spent at the real
cost, `resolveMission` still prices the payout off `duration`, and the card still prints
"10-minute contract" — so the player's *next* job, which really does take ten minutes, does not
make the first one retroactively a lie. The card says Marla knows a shortcut, because an
unexplained short timer reads as a bug the second time round. Derived from
`missionsAccepted === 0`; there is no first-mission flag.

### Callouts fire off progress, not events

The three notes over the first fight (§2 beat 3) are keyed to playback progress bands rather than
to a block or a proc landing: a fight with no block would never show the middle note, and one with
six would show it at whichever happened to land. The copy is written about the *system* rather than
the blow on screen, so it is true whatever the dice did. The fight is stretched to 16s and pinned
to ×1 — with a reason on the disabled buttons — because a player who left the speed on ×4 from a
previous character would watch the whole lesson go past in two seconds. Skip still works.

### Opt-out, and what it does not switch off

The creation tick sets one flag. Gates still open by level, the glossary still works, and the six
one-time explainers **still fire** — "I have played before" is a claim about the twelve beats, not
about the pity floor or the dungeon wall, and a returning player on a fresh save has met neither in
this world. Turning the tour back on resumes at beat one rather than pretending the twelve
happened, because the flag answers "shown?" and never touches the facts.

### Deferred

The glossary's **settings-screen index** (all 41 entries, grouped by topic) waits for Phase 18,
which builds the Settings screen. The tooltips are live now — `components/ui/Term.tsx`, wired into
the character screen's derived-stats panel, the forge wallet and the pity meter.
