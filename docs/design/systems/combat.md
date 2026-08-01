# System Spec — Combat Engine & Battle Presentation

> One deterministic engine powers every fight in the game: mission monsters, arena duels, dungeon
> bosses, (post-1.0) guild content. The engine is **pure TypeScript** with zero UI dependencies; it
> emits a **battle log** that the animated Battle Scene replays. Numbers: `../balancing-formulas.md` §4–5.

## 1. Architecture contract

```
fight(attacker: Combatant, defender: Combatant, seed: Seed) -> BattleResult
  BattleResult = { winnerId, rounds, log: BattleEvent[], hpTimeline, statsSummary }
```

- **Pure & deterministic:** same inputs + seed → identical result. No Date, no Math.random.
- `Combatant` is a *snapshot* (final computed stats incl. gear/pet/set/guild bonuses) built by
  `buildCombatant(hero | monster | bot)` — the engine never reads live game state.
- The same seed is stored with mission/arena/dungeon instances so refreshing the page replays the
  identical fight (no re-roll scumming).
- Engine ships with exhaustive Vitest coverage + a **simulation harness** (10k-fight batches for
  balance assertions, run in CI, see §7).

## 2. Resolution rules

1. **Initiative:** dexterity-weighted and damped toward even (`0.5 + (dexShare − 0.5) · 0.8`);
   sides then alternate single attacks (A1, B1, A2, B2 … one attack pair per round).
2. **Attack sequence per hit:**
   - Defender proc roll (Warrior block 25%, Hunter dodge 40%, Swashbuckler parry 15%) → on
     success, damage = 0, event `blocked`/`dodged`. A Mage attacker multiplies those chances by
     **0.62** rather than skipping them (see the class spec's Phase 3 rebalance note).
   - Damage roll: `weaponRoll · (1 + mainStat/10)`; crit roll (`critChance`, ×2.0);
     armor DR applied (`min(armor/(attackerLvl·50), classCap)`).
   - Swashbuckler: follow-up strike 60% @75% damage (own proc/crit rolls).
   - Bard: Verse state machine ticks at round starts (rounds 1, 5, 9 …); active verse modifies
     damage/DR/miss according to `characters-and-classes.md` §3.
3. **HP floors at 0** → `ko` event → result. **Round cap 100:** higher remaining HP-fraction wins;
   exact tie → defender wins.
4. All rolls consume a dedicated RNG stream (`combat:<seed>`), events record roll context for
   debugging ("why did I lose" tooltips in the result screen).
5. **Set modifiers (Phase 12).** A combatant may carry a `CombatModifiers` bag — the fold of every
   active gear-set bonus, built before the fight and read at the points above (damage, crit,
   block/dodge, verse length, and a handful of dedicated branches: reflect, lifesteal, absorb,
   dodge-fury, counter, shred, third-strike, first-strike-crit, steady, execute). Set bonuses are
   *not* `CombatProc`s despite what `gear-sets.md` §4 originally sketched; see that spec's §5 for
   why, and for the rule that a new lever needs a fold case, a read, and a test.

## 3. BattleEvent vocabulary (renderer contract)

`battle_start` {a, b, first} · `round_start` {n} · `verse_change` {side, verse} · `attack` {source,
raw, final, crit, followUp?} · `blocked` {target} · `dodged` {target} · `missed` {source} ·
`damage` {target, amount, hpAfter, overkill?} · `ko` {target} · `battle_end` {winner, rounds,
reason}. Log is serializable JSON; renderer must handle any
valid log (fuzz-tested) — this is the firewall that lets us restyle presentation without touching math.

## 4. Battle Scene (the showpiece)

Full-stage takeover with the location backdrop (mission zone art / arena / dungeon):

1. **Entry (~1.2s):** backdrop parallax push-in; combatants slide from edges with name/level/class
   plates; HP bars unfurl; VS flash; Bard verse banner if any.
2. **Rounds:** attacker lunge (spring, ~250ms) → impact: Kenney VFX particle burst (slash arc /
   magic flare per class), 4px screen shake on hits ≥15% HP, floating damage numbers (crit: ×1.6
   scale, gold, slow-mo 120ms), block = shield flash + "CLANG" plate, dodge = ghost-trail sidestep,
   Flurry = double-hit rhythm, Verse change = musical note ribbon.
3. **HP bars:** instant red chip + trailing "ghost" drain (300ms); low-HP pulse under 20%.
4. **Finish:** KO slow-mo + desaturate loser → victory stinger (banner + gold/XP/loot cards
   cascading in) or defeat card (muted, "The tale continues…" + retry hint where applicable).
5. **Controls:** speed ×1/×2/×4 (persisted), Skip-to-result after first viewing of a fight type;
   arena auto-replays available from the log (battles are data!).
- Target length: mission fight ≤8s at ×1; dungeon boss ≤20s with intro sting.
- All timings live in a single `battleChoreo.ts` config — animation tuning never touches engine code.

**Adaptive pacing (as built, Phase 4).** Fights range from three rounds to twenty, so a fixed
pace either rushes the short ones or drags the long ones. `buildTimeline` therefore lays every
event on the clock at its authored length, then compresses toward `TARGET_FIGHT_DURATION` if the
total overruns:

- **Never compressed:** the entrance, the knockout and the closing beat. A rushed knockout is a
  wasted knockout.
- **Never compressed:** the frame in which a blow *connects* (`attackImpact`). That frame is the
  event; lose it and a flurry becomes a smear.
- **Compressed, down to `PACE_FLOOR` (0.35):** anticipation, recovery, the pause on a round
  number, defence and verse beats.
- A fight long enough to need more than that floor is allowed to run over target rather than
  become unreadable. Measured across every class × archetype × level band: median 4.8s, p99 8.0s,
  worst case 8.7s (a 22-round, 101-event outlier — 0.2% of fights).

The timeline is a pure function of `(log, choreo, ranged)`, so all of this is unit-tested without
rendering anything (`src/components/battle/timeline.test.ts`).

### 4.1 Schools of arms (the VFX pass)

Step 2 above has asked for "slash arc / **magic flare per class**" since Phase 4, and what shipped
was two sprite lists: one for a hit, one for a crit. A Mage's bolt and a Tank's shoulder-charge
were the same twelve orange specks.

A **school** is the whole visual grammar of one fighter's offence — what gathers before the blow,
what crosses the gap, what happens where it lands, and in what colour. There are ten in
`src/data/combatVfx.ts`, keyed on `CombatantCard.kind`, which is every value that field can hold:
the five class names and the five archetype names. `combatVfx.test.ts` derives both lists from
their own modules, so a sixth class cannot ship unpainted.

| | Melee | Ranged |
|---|---|---|
| **Classes** | Warrior · steel · Bard · song · Swashbuckler · blades | Mage · arcane (teal) · Hunter · arrow (moss) |
| **Monsters** | Bruiser · beast · Skirmisher · venom · Tank · stone · Swarm · chitin | Caster · hex (blood) |

- **Melee lunges, ranged throws.** A school that does not close the distance braces, gathers its
  cast, and sends something across the gap that arrives exactly as the beat ends — the frame the
  `damage` event fires on. A cast gets `castWindUp` rather than `attackWindUp` (300ms against 100),
  because at the melee wind-up the bolt existed for about six frames.
- **The player's magic is teal; the monsters' is red.** A Mage's bolt and a Caster's hex are the
  same shape crossing the same gap, and at ×4 the colour is the only thing telling you which way
  the damage is going. Asserted in `combatVfx.test.ts`.
- **A school is a look, never a number.** `fight()` does not import `combatVfx.ts` and cannot. No
  amount of re-painting can change who wins.

Everything else the pass added is a reaction the log already described and nothing ever drew:

| Moment | What the player sees now |
|---|---|
| A blow lands | White flash on the struck fighter, and a shove away from it scaled by the damage |
| Block | Sparks off the shield, plus the plate |
| Dodge | A sidestep with an afterimage left behind (spec §4 step 2's "ghost-trail sidestep") |
| Crit | A warm bloom from the stage edges, rising and falling with the swing that `critHold` holds for |
| `set_proc` | The set's name, in that effect's colour, beside the fighter (gear-sets §3) |
| `harden` | Plating on the boss's portrait, thickening every round (dungeons §2) |

The last two had been in the log since Phase 12 and Phase 11 and had **beats on the timeline the
whole time** — `beatDuration` gave them a moment and `frameAt` had no case for them, so a
five-piece capstone firing was a pause and Vulkarr's armour grew invisibly.

**Reduced motion keeps the meaning and drops the violence.** The particle layer drops out whole —
no bursts, no bolt, no trail (Phase 4 behaviour, asserted in `e2e/battle.spec.ts`) — and with it go
the flash, the knockback and the shake. What survives is everything that *carries information*: a
set bonus keeps its full label life, because reading it is the entire point, and a caster keeps
their **stance**, bracing and releasing on `castLead` where a melee school lunges. That stance is
the last thing distinguishing a Mage's attack from a Warrior's once the sparks are gone.

**A canvas is invisible to `toBeVisible`.** `e2e/battle.spec.ts` reads the pixels instead: a strip
down the middle of the gap, where nothing belongs but a projectile. The Mage measures 436 lit
pixels in teal, the Caster 459 in red, the Hunter's thinner arrow ~100 in moss — and **two melee
schools measure zero**, which is the control that makes the other three a claim rather than a
coincidence.

## 5. Where fights trigger

| Context | Attacker | Notes |
|---|---|---|
| Mission end | Hero vs zone monster | seed fixed at mission accept |
| Arena | Hero vs bot snapshot | bot gear/stats materialized from its sim record |
| Dungeon floor | Hero vs floor monster | boss floors add intro sting + proc banner |
| (post-1.0) Guild content | multi-fight series | log format already supports series wrapper |

## 6. Result screen

Rewards breakdown (gold w/ guild Treasury bonus line, XP w/ Drillmaster line, item card w/ rarity
reveal), honor delta (arena), "closest moment" stat (min HP survived), share-free replay button.
Loss screens always state the *reason hint* ("Their armor shrugged off 41% of your damage — raise
Strength or find a heavier weapon").

**As built.** `src/engine/combat/analysis.ts` reads the log back into counts, the closest-moment
figures and a ranked list of typed `LossHint` codes; `BattleResult.tsx` turns those codes into
sentences. The split matters: the arithmetic is engine work and unit-tested, the wording is UI
work and can be edited without touching a pure module. Hints available today —

| Code | Fires when | Points the player at |
|---|---|---|
| `so-close` | loser took the winner under 15% health | leads the list; nothing to fix, keep going |
| `armour` | ≥30% of raw damage absorbed | main attribute, heavier weapon |
| `evaded` | ≥30% of swings blocked/dodged/missed | Luck, levels |
| `outpaced` | their damage/round ≥1.25× yours | weapon upgrade |
| `fragile` | knocked out inside 5 rounds | Constitution, armour |
| `round-limit` | nobody could finish it | health fractions decided it |

A defeat with no hint is a bug, and is tested as one. The screen shows the top two.

## 7. Testing & balance harness

- Golden-log snapshot tests (seeded fights) freeze engine behavior; any math change shows as a diff.
- `simulate(a, b, opts)` powers the balance suite, which asserts three distinct bands at levels
  10/25/50/100 (see `systems/characters-and-classes.md` §"Balance policy"):
  **mirrors 45–55%** (symmetry check on the engine itself), **per-class average 45–55%** (no class
  quietly stronger), **any single matchup 30–70%** (counters allowed, walls not).
  Also asserted: mission win-rate ≥97% on-curve, and fight length 4–30 rounds so the battle scene
  always has something watchable to animate. Dungeon floor bands land with Phase 11.
- Fuzz: random valid logs → renderer must not throw (jsdom test).
