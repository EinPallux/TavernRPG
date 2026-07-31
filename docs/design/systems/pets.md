# System Spec — The Menagerie (Pets)

> Small, charming, deliberately minor: pets give a single modest stat boost. One equipped at a
> time. S&F's sprawling pet metagame is right-sized to 12 collectible companions (reference §10).

Backdrop: `pets_background.png`. Unlocks level 8. **Built in Phase 14.**

## 1. The 12 pets & acquisition

| Pet | Boost | Source | `PetSource` kind |
|---|---|---|---|
| Ember Pup | STR % | Rat Cellars floor 5 | `dungeon-floor` |
| Moss Tortoise | CON % | login calendar day 28 | `daily-loop` *(Phase 15)* |
| Gloom Cat | DEX % | Barrowdeep floor 5 | `dungeon-floor` |
| Owl of Vesna | INT % | monthly track, second rung | `gacha` |
| Coin Toad | LCK % | Notice Board: 30 daily clears | `daily-loop` *(Phase 15)* |
| Brass Beetle | armour % | Emberdeep floor 5 | `dungeon-floor` |
| Tankard Imp | gold find % | 100 missions won | `missions` |
| Sooty Raven | XP % | arena rank ≤ 500 | `arena-rank` |
| Frost Fox | DEX % | mission egg, Frostfell/Silverpine, 0.5% | `egg` |
| Cellar Rat King | CON % | Rat Cellars floor 10 | `dungeon-floor` |
| Wisp of the Chapel | INT % | Sunken Chapel: 40 missions won | `zone-missions` |
| Gilded Snail | LCK % | Fortune's Table 1% slot, monthly banner | `gacha` |

Mix of deterministic milestones (most) + two rare-luck pets — collection feels earnable, with a
couple of stories to tell. Unowned pets show as silhouettes with source hints.

**Ownership is derived, not stored.** There is no "pets owned" list in the save;
`engine/pets/ownership.ts` answers the question from the facts that earned each pet — floors
cleared, missions won, best ladder rank held. Three consequences, all of them the point:

1. **Retroactive.** A player who cleared Barrowdeep's fifth floor in Phase 11 owns the Gloom Cat
   the moment the room opens, with no migration and no reconciliation pass.
2. **Nothing to drift.** A stored list can disagree with the history that produced it. There is
   only one copy of the fact.
3. **No idempotency bug to have.** The counters are totals, not increments on a boundary — the
   day-keyed double-pay failure has nowhere to live.

The two luck-based pets are the exception: for a coin-flip that lands once in two hundred, the
luck *is* the fact, so it is stored — `pets.eggs` for the Frost Fox, `gacha.pets` for Vesna's two.

`source` is a **closed union**, so a thirteenth pet with a new kind of source is a type error
until the engine handles it, and the silhouette's `hint` is authored beside the check it
describes. `pets.test.ts` matches every dungeon and zone id in the table against the real
content, because a hint naming a floor the engine does not look at is exactly the drift this
shape exists to prevent.

The two `daily-loop` pets are declared now and unobtainable until Phase 15. A collection with two
blank spaces that name what will fill them is better than two with no explanation.

## 2. Leveling & rarity

- Pet level 1–50 via feeding **Tavern Scraps** + gold; 3 feeds/pet/day cap `[TUNE]`.
- Boost = `base 1% + 0.08%/level` → 4.9% at 50 `[TUNE]`. Armour/gold-find/XP pets run at **half
  rate**: those three multiply things already multiplied elsewhere, and a flat 5% on gold found
  is worth considerably more over a month than 5% Strength.
- **Rarity upgrades** (C→U→R→E) at levels 15/30/45 cost 12E / 30E+1S / 60E+3S `[TUNE]` and buy a
  frame, a particle trail and **+0.5% flat** each — *not* halved for the half-rate pets, because a
  quarter of a percent would feel like nothing. Ceiling: **+6.4%**.
- One **active** pet (Character screen chip + Menagerie stall highlight); switch freely (no cost,
  no cooldown — generosity here, the boost is minor anyway).

**The three-a-day cap is a burst ceiling, not a target.** Scraps arrive at 16% × 2 per mission —
about 1.6 a day for a player spending their Vigor on 20-minute contracts — so the everyday
experience is one feed and one companion reaches 50 in about a month. The three exists so a
player who banked a week of Scraps while away can spend some of them the day they come back.
The rate was 8% until the Phase 14 economy pass measured it: a pet took two months and the cap
was literally unreachable, so the counter on the stall was advertising a pace the game could not
supply.

**The whole system caps out below one gear upgrade**, which is the constraint everything above is
solved against: +6.4% of one attribute against the ~6.6% an average Rare chest line is worth to a
reference hero at level 30. `pets.test.ts` measures both sides rather than trusting either
number.

## 3. UX

Menagerie = stable-style stalls with idle pet animations (owned pets breathe and shuffle, each on
its own cycle so the grid is never in lockstep), a feed button with a chomp and a boost-line
flash, the exact boost figure on every stall, collection counter (X/12) and silhouettes carrying
their source hint. Owned stalls sort to the front — an owned card is twice the height of a locked
one, so interleaved rows read as holes.

Feeding all pets stays viable (levels are per-pet) but only the active one boosts — collectors'
pressure without power bloat.

The nav rail carries an **arrivals badge**: companions are earned while the player is somewhere
else, so without a cue the room only gets visited by players who already suspect. It counts
against `pets.seenCount` and clears itself on the visit.

## 4. Data hooks

`PetDef` {id, name, flavour, boost, iconId, source, hint} in `data/pets.ts`;
`PetProgress` {level, rarity, fedToday} in the save, **sparse** — a pet that has never been fed
stores nothing. `pets.activeId`, `pets.scraps`, `pets.eggs`, `pets.seenCount`.

The boost lands in one of two places, never both: str/dex/int/con/lck and armour go through
`deriveStats` (so the paperdoll, the compare tooltips and the fight all read one number); gold
find and XP become a `PayoutBonus` composed with the guild's. `state/petActions.ts` owns the
transitions and `payoutBonus()` is the single composer — the same pass finally applied the gear
`goldFind`/`xpBonus` specials, which `deriveStats` had computed and nothing had read since
Phase 2.
