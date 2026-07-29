# System Spec — Gear Sets

> Curated, class-locked 5-piece armor sets (Helm/Chest/Gloves/Boots/Belt) — the visible long-term
> gear chase. 2 sets per class at 1.0 (10 sets, 50 items), a 3rd per class outlined for 1.1 (Q18).

## 1. Rules

- Set pieces are **Set rarity** (gold), class-locked, fixed curated statlines scaled to the
  *player's level at acquisition* (level-scaled like all loot; a piece found at level 30 rolls its
  curated statline at level-30 budget ×1.5 rarity factor).
- **Set bonuses at 2 / 4 / 5 pieces** — the 5-piece bonus is a build-defining proc modifier.
- Sources: dungeon floors (Set replaces Epic at 20% of epic hits; floor-10 50/50 — §7 formulas),
  Fortune's Table featured banners (rate-up + pity), Emberforge set recipes (crafted piece is
  random-missing from that set).
- Re-acquisition of an owned piece: dungeons never dupe (items doc §7); gacha dupes convert
  (gacha doc §5); crafting always rolls a missing piece until complete, then rolls level-refreshed
  copies (gear refresh path for outleveled sets).

## 2. The ten launch sets

### Warrior
**Oathsworn Bulwark** (the anvil) — theme: tower-shield honor guard; stats CON/STR-heavy.
2pc: +10% armor · 4pc: blocks reflect 15% of prevented damage · 5pc: **Shield Wall 25% → 33%**.
**Wolfblood Warplate** (the cleaver) — theme: berserk wolf-cult plate; STR/LCK.
2pc: +8% damage · 4pc: +10% crit damage · 5pc: **killing-blow rounds grant an immediate extra attack** (once/battle).

### Bard
**Maestro's Ensemble** — theme: concert-hall finery; INT/CON.
2pc: Verses last +1 round · 4pc: +12% damage during any Verse · 5pc: **choose your opening Verse** (pre-fight selector — strategy!).
**Dawnchorus Attire** — theme: festival dawn silks; INT/LCK.
2pc: +6% crit · 4pc: Verse changes heal 6% max HP · 5pc: **Discord miss chance 20% → 30%**.

### Mage
**Emberweave Vestments** — theme: smoldering scholar robes; INT/LCK.
2pc: +8% damage · 4pc: +15% crit damage · 5pc: **damage-roll floor raised from −45% to −15%** (consistency capstone).
**Tidecaller's Regalia** — theme: drowned-chapel vestments; INT/CON.
2pc: +10% max HP · 4pc: 10% of damage dealt returns as HP · 5pc: **first time below 30% HP, absorb shield = 25% max HP** (once/battle).

### Hunter
**Thornstalker's Guise** — theme: briar-laced leathers; DEX/CON.
2pc: +5% dodge (40→45) · 4pc: successful dodges add +10% to your next hit (stacks ×3) · 5pc: **dodging grants a free counter-shot at 50% damage** (max 1/round).
**Galewind Harness** — theme: sky-courier straps; DEX/LCK.
2pc: +6% crit · 4pc: +12% crit damage · 5pc: **crits reduce enemy armor DR by 5pp** (stacks ×4).

### Swashbuckler
**Corsair King's Finery** — theme: flamboyant captain's regalia; DEX/LCK.
2pc: Flurry chance 60→68% · 4pc: Flurry strikes +15% damage · 5pc: **Flurry can chain a third strike at 35% chance, 50% damage**.
**Nighttide Silks** — theme: moonlit-heist blacks; DEX/CON.
2pc: +8% parry (15→23) · 4pc: +10% damage while above 70% HP · 5pc: **first hit each battle is an automatic crit**.

*(1.1 outlines: Dragonsbane Aegis · Requiem of the Deep · Starbound Raiment · Wyrmscale Fletching ·
Serpent's Grin — named now so dungeons/banners can tease them.)*

## 3. UX

- **Set Collections page** (Character screen tab): per-set piece checklist with silhouette icons,
  bonus reveal states, source hints ("Last seen: Barrowdeep Crypt, floors 4+"), and progress pips
  shown on the paperdoll set-glow hover.
- Set piece drop = upgraded loot fanfare (gold beam + set sigil stamp + Town Crier entry).
- Balance note: 5pc bonuses are strong by design (weeks of chase) but bounded (once/battle or
  capped stacks); harness asserts mirror win-rates with full sets stay within 42–58% `[TUNE]`.

## 4. Data hooks

`GearSetDef` {id, classId, name, theme, pieces: 5×curated statline templates, bonuses: {2,4,5},
sigilIconId}; `SetProgress` derived from owned/equipped pieces. Set procs implement the same proc
interface as class kits (engine treats them uniformly — `combat.md` §2).
