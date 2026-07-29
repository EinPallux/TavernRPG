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
