# Legendaries

> The tier above Set, and the endgame chase. What a Legendary is, why it is never a set piece,
> where it comes from, and how it is re-rolled. General loot: `items-and-gear.md`. Curated sets:
> `gear-sets.md`. Numbers: `../balancing-formulas.md` §22.

## 1. What it is, and the problem it solves

**A class's entire gear chase is ten drops long.** Two sets of five pieces, and
`drawMissingPiece()` never hands back a piece you own — so exactly ten set drops finishes every
piece your class will ever see (`forge.test.ts`, *acquisition converges*). §0 puts the first full
set at day 45–60 and the content now runs to **day 124**. From somewhere near the halfway mark,
no drop of any rarity can be an upgrade in kind, and a contract's loot line stops being a reason
to take it.

The Collector's Album gave a *zone* a reason to matter past its level band. This does the same for
a *drop*.

**A Legendary is a set bonus on one item, rolled instead of authored.** Its affixes come from the
same `SetEffect` vocabulary the ten gear sets already speak, so the tier costs the resolver
nothing: `modifiersFor()` folds a legendary's affixes into the same `CombatModifiers` bag it folds
set bonuses into, at the one place that fold happens, and `fight()`, the balance harness and the
economy sim all get it without an edit. Only a genuinely new *mechanic* would cost engine work —
the same bargain `gear-sets.md` struck for thirty bonuses across ten sets.

And because the affixes and their magnitudes are **rolled**, the chase does not terminate. There is
always a better roll of the item you are already wearing. That is the whole point of the tier and
the reason it, rather than an eleventh gear set, is the answer to the measurement above.

## 2. Why a Legendary is never a set piece

A Legendary occupies one of the ten slots like any other item. Five of those slots — helmet,
chest, gloves, boots, belt — are where set pieces live, and `equippedSetCounts()` deliberately
does **not** count a legendary toward a set.

So in a set slot, equipping a Legendary costs you a piece of progress, and possibly a threshold:

> Wearing *The Ninefold Coat* means the Warden's Vigil is four pieces, not five. You trade the
> capstone for two rolled affixes.

That is the first genuine build decision in the game. Attributes are bought and every point helps;
gear until now was a strict ordering by budget. Here two legible options disagree, the item card
states the consequence at the point of equipping, and neither answer is right for every class.

It also protects the ten sets from obsolescence. A tier that were simply *above* Set would make
the entire Phase 12 chase vestigial the first time a Legendary dropped; a tier that **competes**
with it keeps both alive for the rest of the game.

In the other five slots — weapon, offhand, amulet, ring, trinket — there is no set to lose, so a
Legendary there is a clean upgrade over an Epic. That asymmetry is intended: those slots have had
nothing to chase since Phase 2.

## 3. The stat budget is not the reward

`rarityFactor` for legendary is **1.5 — identical to Set**. A Legendary is not a bigger number; it
is the same statline a set piece carries, plus two affixes, minus the set. Keeping the budget flat
is what makes the trade in §2 a real comparison rather than arithmetic with a foregone conclusion,
and it means the tier adds nothing to the stat curve the combat harness is solved against.

Three attribute lines, like an Epic or a Set piece. Two affixes, drawn without replacement from
the legendary's own pool, each rolling a magnitude inside a published band.

## 4. Where they come from

| Source | Rate |
|---|---|
| The Sundered Anvil, floor 10 | guaranteed, first clear |
| The Sundered Anvil, floors 5–9 | a published chance per floor |
| The Drowned Vault / The Sunless Court, floor 10 | a small chance |
| Far-country contracts (level 100+) | a very small chance |
| Fortune's Table | **never** |

The last row is a design position, not an oversight. Golden Dice are earn-only and can never be
bought (hard rule 6) — but keeping the top tier off the banner entirely means the best gear in the
game cannot be reached through the premium currency *at all*, by any route, even a free one. The
chase is play, and only play.

The rest is deliberately not single-source. A tier that exists behind exactly one door is a tier
most players never see, and the far-country contract rate is what makes a legendary something that
can happen on an ordinary evening.

## 5. The Sundered Anvil

The sixth dungeon, below the Sunless Court. Ten floors and two bosses, like the other five, on the
same archetype ladder the ramp harness polices — a Legendary Dungeon that were a *different shape*
would be fighting the delve engine, the album's derived pages and `dungeons.test.ts` all at once,
and the novelty of this slice belongs in the tier rather than in a second kind of descent.

Where Aldenvale's named arms were made, and unmade. It is the reason the Emberforge can re-roll a
Legendary at all: Torvald is working from what the Anvil gives up.

The album gains a nineteenth-plus page for it without being edited, because its pages derive from
`DUNGEONS`.

## 6. Reforging

The Emberforge's fourth bench. Spend Starmetal, re-roll both affixes.

- The odds and the bands are rendered from the same objects the roll reads, which is what makes
  "odds always visible" true rather than intended — the discipline `forgeOdds()` and
  `rollForgeRarity()` have shared since Phase 12.
- A reforge **replaces**; there is no "keep the better one" button, because a re-roll you cannot
  lose is not a decision. The card shows what you have before you press.
- Starmetal is the cost because it is the scarcest material and had exactly one sink (set recipes).
  A player who has finished their recipes has had nothing to spend it on since.

## 7. Anti-frustration

- A Legendary cannot be sold or scrapped, like a set piece. It refuses at the same choke point in
  `dispose.ts`.
- No duplicate protection is needed and none is offered: two rolls of the same legendary are two
  different items, which is the tier working.
- A legendary drop has its own loot cue. `lootCue()` had already reserved the name; it shared
  `loot-epic` and now does not, because the one sound in the game over half a second should not be
  the sound of the thing that happens a hundred times as often.

## 8. Tests

- The fold: a legendary's affixes reach `CombatModifiers`, and `equippedSetCounts()` does not count
  it toward a set — both asserted directly, because the second is a *negative* and the kind of
  thing a later refactor quietly reverses.
- Mirror win-rates with two max-rolled affixes stay inside **42–58%**, the same band a full set is
  held to.
- Every rollable affix fires in a fight at least once — the `set_proc` lesson, which sat on the
  timeline for a phase drawing nothing. An effect that cannot be observed is not shipped.
- The ramp: `dungeons.test.ts` measures the Anvil's ten floors and fails on a dip.
- Supply: the economy sim reports days to a first legendary and Starmetal per reforge against
  Starmetal income, because a reforge nobody can afford is a cap the game cannot supply.
