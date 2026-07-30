# System Spec — Dungeons (The Undertavern)

> Three key-gated, ten-floor monster gauntlets far above the player's level — the epic/set loot
> chase and the long-term power benchmark. Reached through the Gilded Tankard's suspiciously deep
> cellar. Numbers: `../balancing-formulas.md` §5, §7.

Backdrop: `dungeons_background.png` (hub) + per-dungeon tint/vignette. Unlocks level 10.

## 1. The three dungeons (1.0)

| Dungeon | Gate | Monster levels (F1→F10) | Identity |
|---|---|---|---|
| **The Rat Cellars** | level 10 + Rusty Key | 14 → 32 | Vermin kingdom under the tavern; comedic-grim; boss: Cellar King Riddletail |
| **Barrowdeep Crypt** | level 25 + Bone Key | 31 → 58 | Restless nobility, pale rites; boss: The Pale Margrave |
| **Emberdeep Foundry** | level 55 + Brand Key | 59 → 95 | Abandoned dwarf-works, living forges; boss: Foundry Tyrant Vulkarr |

Keys drop from missions (6%/mission once level-gated, until owned); each key is a one-time unlock
(the door stays open). Later dungeons ship per patch (S&F's 18-dungeon cadence — reference §9).

## 2. Floor rules

- Enter → face **floor N monster** (progress is per-dungeon, persistent). Free attempts.
- **Win:** advance immediately; may chain the next floor in the same visit until a loss (winstreak
  delving feels great after a gear spike). Rewards per floor: big XP (`90 × xpPerVigor`), gold,
  drop roll (50% item + separate 25% epic roll; floor 10: guaranteed Epic-or-Set + dungeon
  completion trophy + 3 Golden Dice + pet/recipe firsts per pets/crafting specs).
- **Loss:** 30-minute cooldown for that dungeon (Q17) — "the horrors regroup". Loss screen shows
  the reason hint + "come back stronger" framing; no resource cost.
- Floors 5 & 10 are **bosses** with signature procs (mini kit-twists: Riddletail summons a rat
  swarm add-hit every 3rd round; the Margrave heals 8% on your missed hits; Vulkarr's armor grows
  +2pp DR/round `[TUNE]`) — introduced with a nameplate sting + proc explainer line so deaths
  teach rather than confuse.

## 3. Difficulty philosophy

Dungeon monsters use mission-monster templates ×1.35 budget (bosses ×1.6) at fixed levels — the
player *will* wall. Walls are the point: each floor is a visible power benchmark ("Floor 7 needs
~2k more HP worth of CON or the Thornstalker 4pc"). The dungeon hub shows per-floor best-attempt
damage bars to make progress tangible between wins `[TUNE]`.

## 4. Presentation

Hub: three doors in the Undertavern with progress plaques (X/10, boss silhouettes, next-floor
monster preview after first attempt). Entering a floor: torch-lit descent transition → battle scene
with dungeon backdrop + dust motes; boss floors add name banner + drum sting. Completion: door
seals with a trophy crest; Town Crier headline; the trophy row shows on the player profile.

## 5. Data hooks

`DungeonDef` {id, gateLevel, keyItemId, floors: MonsterRef[10], theme}, `DungeonProgress`
{floorsCleared, cooldownUntil, bestAttempts[]}. Floor fights use standard `fight()` with dungeon
context seeds (`combat.md` §5).

## 6. As built (Phase 11)

`src/data/dungeons.ts` (three dungeons, thirty named floors, six boss signatures),
`src/engine/dungeons/` — `floors` (combatant construction, budgets, payouts, best-attempt share),
`delve` (the lifecycle), `keys`. Three new `CombatProc` kinds and their events live in
`src/engine/combat/`; the store transitions in `src/state/dungeonActions.ts`; the room in
`src/components/dungeons/`. Numbers and their derivations: `../balancing-formulas.md` §5.

Five decisions worth not re-making:

- **A floor's level is fixed and its reward is priced at that level.** Gold at the floor's own
  level is what makes back-filling worthless without a rule against it; XP takes the *lower* of
  the floor's and the hero's, because XP is a share of a level's requirement rather than an
  absolute, and pricing it at the floor let a fresh delver leapfrog several levels in one visit.
- **An attempt is seeded by its number, not by the floor.** The inverse of the mission rule, and
  deliberately: a mission commits its seed at accept because its outcome must survive the timer,
  while a floor is free and repeatable — a seed fixed per floor would make the wall you lost to
  the same fight forever, with no reason to come back. The attempt counter lives in the save, so
  replaying one descent is identical and the next one is genuinely different.
- **Archetype order carries as much of the ramp as the level curve.** See balancing §5: twelve
  levels of spread against eighteen levels of curve. Any new dungeon must be measured, not
  authored on flavour alone, or it will get easier somewhere in the middle.
- **Floor 5 teaches what floor 10 tests.** Each mid-boss carries a weaker version of its own
  finale's signature, at the smaller ×1.5 budget. Meeting "it heals when you miss" for the first
  time at the final boss is a lesson arriving too late to use.
- **Losing leaves a number behind.** The share of the monster's health an attempt took off is the
  only progress a loss produces, and the hub draws it straight onto the rung.
