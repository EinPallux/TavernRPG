# Changelog

All notable changes to TavernRPG are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[SemVer](https://semver.org/) once code exists (0.x during development, 1.0.0 at release —
see `ROADMAP.md` phase gates).

## [Unreleased]

### Added — Phase 14: The Menagerie (twelve companions, one at your side)
- **Ownership is derived, not stored.** There is no "pets owned" list anywhere in the save.
  `ownedPets()` answers the question from the facts that *earned* each pet — floors cleared,
  contracts won, the best ladder rank ever held — every one of which was already in the save
  before this phase existed. A player who took Barrowdeep to its fifth floor back in Phase 11
  owns the Gloom Cat the moment the room opens: no migration, no reconciliation pass, and no
  second copy of the truth to drift from the first. The counters are totals rather than
  increments on a boundary, so the day-keyed double-pay bug CLAUDE.md warns about five times over
  simply has nowhere to live here.
- **A pet's source is data, and the silhouette reads from it.** `PetSource` is a closed union, so
  a thirteenth companion with a new kind of source is a type error until the engine handles it —
  and the `hint` an empty stall shows is authored beside the check it describes. A collection page
  whose empty slots are question marks makes the player feel behind; one whose empty slots are
  *directions* gives them somewhere to go. `pets.test.ts` matches every dungeon and zone id in the
  table against the real content, because a hint naming a floor nothing looks at is exactly the
  drift this shape exists to prevent.
- **The two luck-based pets store their luck**, and only those two. For a coin-flip that lands
  once in two hundred there is nothing else in the save to read it back from, so the Frost Fox's
  egg and Vesna's grants are facts rather than derivations.
- **Feeding, and the ceiling it climbs to.** A Scrap and some gold buys a level; the boost runs
  1% at level one to 4.9% at fifty, half rate for armour, gold-find and experience because those
  three multiply things already multiplied elsewhere. Three rarity upgrades buy a frame, a trail
  and half a percent each — deliberately skippable, which is what lets the materials price be
  steep. The whole system caps at **+6.4%** against the **+6.6%** an average Rare chest line is
  worth at level 30, and the test measures *both* sides against the live generators rather than
  freezing either number.
- **One at a time, and free to switch.** Attribute and armour boosts go through `deriveStats`, so
  the paperdoll, the compare tooltips and the fight all read one figure and a pet cannot be worth
  more in a battle than it says on the chip. Gold-find and experience become a `PayoutBonus`
  composed with the guild's. Switching costs nothing and never will: a switching cost would make
  the player think hard about something the design has deliberately made not worth thinking hard
  about.
- **The room.** Twelve stalls, owned ones breathing on their own cycles so the grid is never in
  lockstep, yours sorted to the front. A feed chomps and flashes the number it moved. The exact
  boost is on every tile, the upgrade button names the frame it buys and its price, and every
  refusal is a sentence written by the same function that would decline it.
- **The rail says when something arrived.** Companions are earned while the player is somewhere
  else — a floor cleared, a rank held, a hundredth contract — so without a cue the room only gets
  visited by players who already suspect. The badge counts against a remembered number and clears
  itself by being looked at.
- **Save schema v14** — the sparse pet-progress record, the active id, Tavern Scraps, hatched
  eggs, the seen-count and a per-zone mission counter — with a v13 fixture captured at Vesna's
  table. The migration grants nothing, which is the whole point: the history already earns the
  pets.

### Changed — Phase 14
- **Tavern Scraps drop at 16%, not 8%.** The economy sim's fourth pass measured the old rate at
  0.8 Scraps a day, which took a companion two months to grow and made the published three-a-day
  feed cap literally unreachable — the stall was advertising "3/3 feeds left" for a pace the game
  could not supply. At 16% × 2 a companion reaches fifty in **31 modelled days**, and the cap
  becomes what it was always meant to be: a burst allowance for a player who banked Scraps while
  away, not a daily target.
- **The economy sim gains a pet sink**, held under 3% of all gold out and measured at 0.5–1.2%.
  Feeding must never compete with training, and a band is a better guarantee of that than an
  intention.

### Fixed — Phase 14
- **Gear `goldFind` and `xpBonus` had been decorative since Phase 2.** `deriveStats` has computed
  them for twelve phases and no payout ever read the numbers, so an amulet advertising "+3% gold
  found" was advertising nothing. `payoutBonus()` now composes the hall's cut, the pet's and the
  gear's into one object — one function, so no call site can quietly assemble a subset.
- **The per-zone mission counter counted attempts; its sibling counted victories.** The Wisp of
  the Chapel asks for forty contracts at the Sunken Chapel and the Tankard Imp asks for a hundred
  anywhere — and one of those being satisfiable by *losing* made the harder-sounding gate the
  easier one.

### Added — Phase 13: Fortune's Table (a gacha that tells you the truth)
- **Three banners, and the calendar decides them.** The Daily Draw highlights a slot, Set of the
  Week puts one of your class's two sets on the table until Monday, and Vesna's Grand Reading
  turns over on the first. The schedule is a **pure function of `(date, world seed, class)`** and
  is stored nowhere — a save that has not been opened for a fortnight already knows what was
  featured on every day it missed, and nothing has to *advance* it, which keeps the Reset Engine
  the only thing in the game that decides it is tomorrow.
- **The odds are on the screen, beside the button.** Not in a menu, not behind an "i" — a
  permanent panel showing all seven outcomes as exact percentages, following whichever banner you
  are looking at. `outcomeOdds()` reads the same weights the roll rolls against, so there is no
  version of the panel that can advertise a rate the engine does not honour. That is CLAUDE.md
  rule 6 implemented as a shared constant rather than as a promise.
- **Pity in public.** Twenty cards on the weekly banner without a featured hit and the next one
  *is* one. The meter fills on the card, prints the exact count, and says "guaranteed" out loud
  before the click. The counter **follows the set, not the week**: twelve rolls into Oathsworn
  survive a Wolfblood week rather than being spent by it — and the meter reads zero on a week it
  will not pay, because "12/20" under a card that cannot honour it is a lie told for six days.
- **A card is never nothing.** A featured hit is always a piece you are *missing*; once the set is
  whole it converts on the table instead — two Starmetal and a shard, five shards a pattern — as
  its own reveal frame rather than a silent substitution. An Ale you cannot drink pays gold. The
  Grand Reading has no featured pity because its **track** is its floor: fifteen cards always buy
  a rung, and the three rungs are a set recipe, the Owl of Vesna, and six Starmetal.
- **The roll moment.** Dice tumble across the felt, cards land face-down, then they turn **in
  rhythm with the best one last** — which is what makes a ten-card spread a crescendo instead of a
  list. Skippable from the first frame, collapsed entirely under reduced motion, and the cards
  are already in the save before the first frame plays: closing the tab mid-ceremony keeps them.
- **A receipt.** The last two hundred cards, with free ones marked free and pitied ones marked
  owed, because a log that flattened those into "featured" would make the published floor
  unverifiable from the one place anyone would go to check it.
- **Save schema v13** — the weekly counter and the set it follows, the monthly track's
  roll-denominated high-water mark, shards, the free daily card, Vesna's pet grants and the
  history — with a v12 fixture captured at Torvald's bench. Empty on arrival for the third schema
  running: a returning player has spent dice on Ale and rerolls for twelve phases, and none of
  that is a roll that owes pity.
- **The economy sim gains a gacha faucet** and a band that holds it under 12% of income. Measured
  at 10.5% for an active player over sixty days — a garnish, not a wage. If rolling ever paid
  better per day than running missions, the correct play would be to stop playing the game.

### Fixed — Phase 13
- **The whole e2e suite had been running at 1280×720** while the config claimed 1080p:
  `devices['Desktop Chrome']` carries its own viewport, and a project-level `use` beats the
  top-level block. The declaration moved below the spread. The 1366×768 floor is still tested
  explicitly, where it was always meant to be.
- **Two more e2e helpers created a hero and navigated before the write landed** (`app-shell`).
  Same rule as the four fixed in Phase 12, same parallel-load-only symptom.
- **A countdown longer than two days read as hours.** "Turns over in 673h" is a number, not an
  answer; past 48 hours `formatRemaining` speaks in days.
- **"Keepers explain why their rooms are unfinished" ran out of keepers.** With Vesna's table
  open, every keeper-run room in Emberhollow is built. The test now checks the three keeperless
  placeholders, which explain themselves in the panel's own voice.

### Added — Phase 12: Gear Sets & the Emberforge (a chase, and a bench to cheat at it)
- **Ten curated sets, two per class.** Helm, chest, gloves, boots, belt — the one item type in
  the game whose statline is *authored* rather than rolled, because a set is a build and a build
  cannot be a shrug of the dice. Oathsworn Bulwark and Wolfblood Warplate for the Warrior;
  Maestro's Ensemble and Dawnchorus Attire for the Bard; Emberweave Vestments and Tidecaller's
  Regalia for the Mage; Thornstalker's Guise and Galewind Harness for the Hunter; Corsair King's
  Finery and Nighttide Silks for the Swashbuckler.
- **Thirty bonuses at 2, 4 and 5 pieces, declared as data.** A bonus is a list of named
  `SetEffect` levers that the engine folds into one `CombatModifiers` bag at build time; the
  resolver reads that bag at the handful of places it matters. Thirty branches in `fight()` would
  have been thirty places to get it wrong, and an eleventh set is now a data change.
- **Five-piece bonuses that change how a fight goes, not how big it is.** Blocks that throw
  damage back, dodges that answer with a free shot, crits that peel armour off, a flurry that can
  chain a third strike, a shield that catches you the first time you drop under a third health,
  a first blow that always crits, a damage floor that lifts — and, for the Maestro, **choosing
  the Verse you open on**, the one bonus in the game that is a decision rather than a number.
  All of them bounded by a once-a-battle limit or a stack cap; the harness holds a full-set
  mirror inside 42–58%.
- **The Emberforge, and Torvald.** Three benches under one roof because they are one loop.
  The **crucible** takes ten pieces a day and pays materials (Scrap from Commons, Essence from
  Rares, Starmetal from Epics and Sets); the **anvil** turns those materials into gear *in a slot
  you choose*, at three published investment tiers; the **recipe shelf** turns them into a piece
  of a specific set.
- **Odds on the tile, always.** The rarity distribution the screen prints and the weights
  `rollForgeRarity()` rolls against are the same object — there is no version of the screen that
  can advertise a number the dice do not honour. So is the pity track: five Master forges banks a
  guaranteed Epic, the meter is drawn as five pips, and the tile says "Strike (Epic)" when it is
  ready. A floor nobody can see is indistinguishable from good luck.
- **The forge moment.** Three hammer blows and a shower of sparks, then a rarity beam and the
  card. The item is decided and written to the save *before* the first frame — closing the tab
  mid-ceremony still leaves it in your bags — and the whole thing is skippable and
  reduced-motion safe.
- **Set pieces from the dark.** Below dungeon floor four a Set piece replaces an Epic one time in
  five, and a cleared boss is a coin flip. Neither can ever hand over a piece you already own,
  and a recipe craft always rolls a *missing* slot until the five are yours — then rolls a
  level-refreshed copy, which is the documented path for a set you have outgrown.
- **Set Collections, as a character-screen tab.** Five silhouettes per set that fill as you find
  them, the 2/4/5 bonuses listed whether or not they are live, and a source line for what is
  still out there. Owned and worn are counted **separately**, because "how far off am I?" and
  "why is my four-piece not firing?" are different questions and a page that conflates them
  answers neither. Worn pieces breathe gold on the paperdoll from two up, and every item card
  carries its set's pip strip and next bonus.
- **Save schema v12** — the materials wallet, the forge's daily counter, ember meter and recipes,
  and the Bard's chosen opening Verse, with a v11 fixture captured five floors into the Rat
  Cellars. Materials arrive deliberately **empty**: back-paying a returning player's stockpile
  would hand them a Master forge on the visit where the room is introducing itself.

### Fixed — Phase 12
- **A `text-` → `bg-` string swap does not make a Tailwind class.** The published-odds bar built
  its segment colours by rewriting the rarity text class at runtime, which produces names the v4
  scanner never compiled — a bar of four invisible segments. Written out as literals.
- **A spring cannot animate three keyframes.** The wallet chips pulse on change, and Motion drops
  the animation entirely (with a console warning) when a there-and-back is handed a spring. They
  use a tween now.
- **`AnimatePresence mode="wait"` needs an exit that resolves.** Both new tab strips animated
  their body with `variants={listItemIn}` and an inline `exit` — but `listItemIn` declares no
  exit variant, so the underline moved and the panel never did.
- **Stale phase copy on the character screen.** The derived-stats panel still promised that
  "fights themselves arrive in Phase 3", and the empty backpack pointed at Phase 5 for loot.
- **A hero creation that never reached disk.** Four e2e helpers created their hero and navigated
  immediately; under parallel load the write was still in flight and the next page rendered the
  class picker instead. The suite's own "mutate then navigate must flush" rule, applied to the
  helpers that skipped it.
- **"Continue" hid under the playback bar** on a tall battle result (Phase 11 surface, found by
  the parallel run). The bar stays mounted after a fight so Replay is reachable, and a dungeon
  result carrying a best-attempt bar or a clear ceremony grew until its button landed
  underneath it.

### Added — Phase 11: Dungeons (three doors under the Tankard)
- **The Undertavern.** Three key-gated, ten-floor gauntlets in the cellar: the Rat Cellars, the
  Barrowdeep Crypt and the Emberdeep Foundry. Thirty named floors, and every one of them stands
  at a **fixed level** — floor 7 of the Rat Cellars is level 26 whether you meet it at 20 or at
  60. That single property is what makes a dungeon a power benchmark instead of content.
- **A wall you can measure yourself against.** Floors carry a ×1.35 stat budget, so you will
  stop; the point is being able to see *how far short*. Every door shows ten rungs, what is
  standing on the current one, and how much of its health your best attempt took off. Between two
  gear upgrades that bar is the only progress there is, and "you took it to 71%" is a target
  where "you lost" is a wall.
- **Free attempts, and a chain.** No Vigor, no cost, no timer. Win and the next floor is right
  there in the same visit — a good delve after a gear spike runs four floors deep. Lose and the
  door shuts for thirty minutes while the horrors regroup; nothing else is taken from you.
- **Six bosses with signatures, announced.** Floors 5 and 10, each carrying a named ability with
  a written explainer that holds the stage before the first blow: Riddletail's swarm arrives every
  third round and cannot be parried, the Pale Margrave drinks every swing that fails to land, and
  Vulkarr cools into his own armour a little more each round. Three different *shapes* of ability
  rather than three bigger numbers, and **floor 5 teaches what floor 10 tests** — each mid-boss is
  a weaker version of its own finale, so the mechanic that ends a dungeon is one you have met.
- **Keys off the road.** Six percent a mission once you are old enough for the door they open, and
  only ever one key in the pool at a time — the lowest door you have reached and cannot yet open.
  A key is a one-time unlock; the door then stays open forever.
- **The payoff.** Every floor pays a Vigor-day of XP and gold plus a 50% drop with a separate 25%
  Epic roll on top. Floor 10 hands over a guaranteed Epic, three Golden Dice and the dungeon's
  crest, seals the door behind you, and puts the trophy on your profile.
- **Save schema v11** — dungeon progress, keys and trophies, with a v10 fixture captured mid-week
  inside a guild hall.

### Fixed — Phase 11
- **Two dungeons got easier as you went down.** Archetype turns out to be worth up to twelve
  levels of difficulty at dungeon budget — more than the level curve gains across six floors — so
  a roster picked for flavour alone put a swarm on Barrowdeep's floor 7 that fell to a level-33
  hero when floor 6 needed 46. All three dungeons now run their archetypes in ascending order of
  measured difficulty, and the harness asserts the ramp never dips.
- **The mid-bosses overshot.** At the spec's flat ×1.6, Emberdeep's floor 5 was harder than the
  floor *below* it. Mid-bosses now run ×1.5 — the smaller wall the "floor 5 teaches, floor 10
  tests" design already implied.
- **A floor paid XP at the floor's level**, so a fresh level-10 delver collected two level-14
  levels from one clear and the four chainable floors behind the Rusty Key would have carried
  them to 20 in a single visit. Gold is still priced at the floor (which is what stops
  back-farming); XP now takes the lower of the two levels.
- **Eighteen rounds in eight seconds is not a fast fight.** Dungeon fights run genuinely longer
  than missions — a tank floor is 15–17 rounds at the level that clears it — and the standard
  pacing target compressed them into an unreadable smear. The Undertavern gets its own targets.
- **`ember-500` was never a colour.** Several dungeon classes named a token that does not exist
  (it is `ember-600`), so the boss banner and the best-attempt bars rendered in plain parchment.

### Added — Phase 10: Guilds (a hall with people in it)
- **Sixty halls, and none of them is a row in a list.** Every card carries what the hall is
  *like* — cosy, nocturnal, cutthroat, early risers — derived from the personalities of the
  people actually in it, plus the level and honour it will ask of you and the buffs it pays.
  Nothing about a hall is stored: name, banner, vibe, requirements and buff steps all fall out
  of `(worldSeed, guildId, roster)`, so sixty guilds cost the save nothing.
- **Apply, and wait.** A letter takes five to ninety minutes to answer, off how promptly that
  hall's Guildmaster tends to reply. The answer is a written note, accepted or not, and it
  arrives whether or not you were watching the screen.
- **Or found the sixty-first.** Name it, cut its banner from a field colour, a charge colour and
  a sigil with the real thing previewing as you choose, and pay for it. The name is checked as
  you type — against the sixty and against your own — rather than after the gold has gone.
- **The Treasury and the Drillmaster.** Two tracks, a hundred steps each, priced at `500 × n^1.7`
  to a ceiling of +25% gold and +25% XP. Donations that cannot afford a step are *banked* rather
  than lost, which is what makes a hall of three viable. Golden Dice are accepted at a stated
  gold value and never sold — earn-only, as always.
- **The buffs are real money.** They multiply the mission and patrol payouts the player is
  actually shown, through the same `PayoutBonus` the economy simulation runs 30 days of days
  against. A full hall is worth roughly a tenth of your income.
- **The hall talks, and only about things that happened.** 162 slotted templates across eleven
  categories, inheriting the Town Crier's rule: a line either names something the simulation did
  or is tagged as colour. Members speak in their own voice, sleep in their own timezone, and
  answer you — greeting for greeting, congratulations or a ribbing for a brag.
- **The weekly Guild Bounty.** Posted Monday, judged Sunday, counted off things everybody was
  doing anyway. Targets scale per member so a hall of three is not asked for a hall of
  twenty-five's numbers, and the hall's own week is simulated off its members' dedication — so
  the bounty is genuinely co-operative: they get you past the half-chest line, your week is the
  difference between half a chest and all of it.
- **Guildmaster's desk** — applicants with resumes, promote, kick, and the motto — visible only
  to the player who founded the hall.
- **Save schema v10** — the guild slice, with a v9 fixture captured from real engine output.

### Fixed — Phase 10
- **The hall never worked on its own bounty.** Bot output was floored per member per day, and
  most bounties count in small whole numbers — three arena wins a week is under half a win a day,
  so every member rounded to nothing and a hall of twenty-two posted 0/44 all week. The fraction
  is now carried as the *odds* of a whole unit, which keeps the expected value exact and still
  replays identically. The private per-week table that made this possible to miss is gone; bot
  output reads off the bounty's own `perMember`, so target and simulation cannot drift apart.
- **The hall repeated itself.** Colour is drawn from thirty-two lines narrowed again by voice, so
  a three-day catch-up put the same greeting on screen four times — the loudest possible tell
  that nobody is home. A line is now off the table until it scrolls out of a twelve-message
  window, and nobody follows themselves while anyone else is awake.
- **Donating to one of the sixty looked like nothing happened.** Their pot has seven digits in it
  and the next step costs six, so ten thousand gold moved no number on the screen. The remainder
  toward the next step is now derived back out of the treasury and shown on a bar, the same one a
  founded hall has.
- **Guild halls advertised "78/25 members".** Phase 8's world generator predated the capacity
  rule and packed the popular halls well past it.
- **All sixty halls paid +1%.** Phase 8 seeded guild treasuries at 900 gold a member, a number
  chosen before `stepCost` existed — step 60 actually costs about twelve million. Retuned, the
  sixty now spread from +4.5% to +13%, which makes the browse list a decision.

### Added — Phase 9: Arena & Hall of Fame (the ladder you have been watching)
- **You are on the ladder now.** 1,501 rungs, and the bottom one is yours from the moment the
  world is raised — not from the moment the arena unlocks. That one change switched on a feature
  Phase 8 had shipped dormant: rivals are drawn from the band around your *rank*, so until you
  had one, nobody ever became a rival and the Crier never had a personal line to write.
- **The Proving Grounds.** Three opponents on nailed parchment with a wax seal for their rank,
  one above you, one level, one below. A ten-minute bell between fights, free rerolls once it has
  rung, and a Golden Die if you cannot wait.
- **Threat reads in the world's voice, never in numbers.** "Their armour looks far heavier than
  yours", not "armour 412". Scouting is post-1.0, and a read you can act on with certainty is a
  spreadsheet lookup rather than a judgement.
- **A duel is the same fight a bot has.** The real `fight()` against the opponent's materialized
  combatant, settled through the same ladder service the simulation calls thousands of times a
  day. Nothing is faked and no outcome is pre-decided — that is what "bots are fair" has to mean.
- **The climb is shown, not numbered.** Win and the ladder rows physically trade places on the
  result screen, past the neighbours you were already looking at on the board. Rank 500, 100, 10
  and 1 take the whole screen with a crowd-roar stinger and a one-time purse of Golden Dice.
- **They come for you while you sleep.** One or two bot attacks a day, more when a rivalry is hot,
  resolved against your snapshot during catch-up. Losses become revenge chips you can settle.
- **The weekly ladder payout**, Sunday midnight, by bracket. Fires **exactly once** across a
  fortnight away, a month away, and both directions of a daylight-saving change — because a week
  is identified by the date of the Sunday that ends it, and a date cannot be ambiguous.
- **The Hall of Fame.** All 1,501 heroes honour-sorted with search and jump-to-rank, your row
  pinned and carrying a "▲ 12" chip since your last visit; sixty guilds ranked by the honour of
  their best twenty; and a weekly Legends archive. Only ~35 rows are ever mounted, so it scrolls.
- **Save schema v9** — hero honour, the arena slice, and the Legends archive, with a v8 fixture
  captured mid-mission from real engine output.

### Fixed — Phase 9
- **Bot attacks fired again on every page reload.** A day's raid is seeded by its day index, so
  re-running it picks the same attacker and replays the same fight — which sounds idempotent and
  is the opposite, because the honour loss lands a second time. An e2e reload caught two honour
  going missing; `arena.lastRaidDay` is the high-water mark that fixes it.
- **The attack band was inverted.** Raids asked "who can *I* reach?" instead of "who can reach
  me?" — a difference that matters because the band is asymmetric (60 rungs up, 15 down), and
  getting it backwards left the player attackable only by people already behind them.
- **A milestone leap paid one rank and banked the other.** A first arena win landing inside the
  top 100 clears 500 on the way; it now pays both and fires the stinger for the better one.
- **`worldSchema.ladder` rejected the player.** The ladder floor was 0 and the player's id is -1,
  so the save would have failed validation the first time anyone took their seat.
- **The board went stale when the ladder moved.** Overnight drift left three cards drawn around a
  rung the player no longer stood on; the draw is now discarded when their rank changes.

### Added — Phase 8: World Simulation Core (the 1,500)
- **Aldenvale has people in it.** Fifteen hundred simulated heroes, spread across sixty guilds,
  on a ladder that already looks ninety days old when you arrive. They level, they fight each
  other, they climb past you, they go quiet for a fortnight and come back.
- **Ten named legends at the top** — Serathiel the Unbowed at rank one, and nine more behind her.
  Hand-written identities on the same stat curves as everybody else: the endgame has faces, not
  just numbers.
- **The Town Crier**, on the Tavern wall. Level-ups, ladder swaps, milestones, guild drama, rival
  taunts and the odd note about a wyvern over Frostfell Ridge. Entries arrive under a wax seal
  and categories collapse. **Every headline is backed by something the simulation actually did**
  — there is no "generate plausible news" path, and a test audits a hundred entries to keep it
  that way.
- **Rivals.** Two or three names near your rank who keep turning up, keep passing you and keep
  having opinions. Rivalries heat up with encounters and cool with distance, so they rotate
  naturally as you climb — nothing has to decide a rivalry is over.
- **"While you were away."** Come back after a week and the game tells you how many levels were
  gained, how many ranks changed hands, and — the number that stings — how many places you
  slipped by standing still.
- **The world keeps running whether you are there or not**, and catching up is free: a fortnight
  reconciles in 135 ms and a year in 177 ms, because anything past two weeks is integrated rather
  than replayed. Detail is spent where it can be seen — heroes near your rank get simulated hour
  by hour, the far ones are a single closed-form step.
- **The same seed always builds the same world**, at any timestamp, so a bug is reproducible and
  save-scumming cannot change fate.
- **Save schema v8** carries the world as pure divergence — 99 bytes a bot, 145 KB all in —
  because names, classes and personalities are recomputed from the seed rather than stored.
- `/dev/world`: the ladder, the level histogram and the Crier's output from any seed.

### Changed — Phase 8
- **The autosave no longer loses writes.** Saves were written in parallel with a guard that
  stopped a stale one overwriting the store — but not the disk. Once the world took the save to
  145 KB an older write regularly landed last, and a hero levelled to 10 could reload as 5.
  Writes are now serialised and coalescing: a burst of twenty changes costs two writes, and the
  second is always the newest state.
- The world catches up **after the first frame** rather than before it, so the hero, the HUD and
  the quest table are never waiting on a simulation none of them need.

### Added — Phase 7: Shops & Stables
- **The Armory and the Gilded Facet are open.** Six pieces on the shelf every morning, drawn from
  the day's seed. Bram always has a weapon and an offhand for your class plus three armour
  pieces; Sela always has two rings, two amulets and a trinket. Only the sixth slot is a
  wildcard — a shop that *might* have nothing you can use is a shop you learn to skip.
- **The shelf answers the question you walked in with.** Every card shows what it would do to
  your hero against what you are wearing, on the card rather than behind a hover.
- **Buying is a splurge, selling is income** — 3.2× value out, 100% of value back. Sold slots
  leave a wrapped parcel in the gap so the shelf does not reflow under your cursor, and the
  restock clock says exactly how long until Bram unpacks the next cart.
- **A fresh shelf costs a Golden Die**, with no free one. The mission board gets a free daily
  reroll because the day's *work* must always be there; a shop shelf is a convenience.
- **One way to get rid of an item** (`disposeItem`), shared by both keepers and, later, the
  forge. Junk goes with a click; a Rare or an Epic asks once; a locked piece is refused; and a
  Set piece is not merchandise at any price. The service quotes before it acts, so the confirm
  you see is the rule the engine enforces rather than a screen's opinion.
- **The Wandering Stables.** Four stalls, seven-day rentals, one at a time: Pack Mule −10%,
  Dappled Courser −20%, Armoured Warhorse −30%, and the Royal Griffin at −50% for six earned
  Golden Dice. Each stall shows what it does to a mission in minutes, not percentages.
- **A mount shortens the road and nothing else** — mission timers only, never Vigor, never
  rewards, never patrol. It rides on the HUD beside whatever is running and beside the mission
  timer itself, and pulses in its last day.
- **Renewing extends, switching replaces.** Paying for the mount you already have adds a week to
  the week you have left rather than throwing it away; taking a different animal forfeits the
  remainder and says how many days that is before you confirm.
- **Save schema v7** carries both shelves and the stall, with a v6 fixture caught mid-shift.
- The economy simulation now models shop purchases, mount upkeep and loot sales, and
  `/dev/economy` shows them per day.

### Changed — Phase 7
- Shop restock joins the Reset Engine rather than each shop checking the date. A shop that
  notices its own stored day is yesterday's is exactly the second clock that module exists to
  prevent.
- The top HUD's mount chip is real rather than a preview value, and the mission card names the
  animal that shortened the road.

### Added — Phase 6: Patrol & Economy Pass 1
- **The City Watch is open.** Sign on for 1–12 hours with Hildy, watch the lantern move along the
  route, and clock off for the pay. It is the "I'm done for today" button: a floor under a bad
  day, deliberately the worse deal so it never becomes the optimal way to play.
- **A shift is time, not a session.** What it has earned is computed from the clock rather than
  accumulated by a ticker, so closing the tab for six hours works with no background timer, and a
  rewound device clock cannot mint gold. Reload mid-shift, come back tomorrow — the numbers are
  the same either way.
- **Walk off early and you are paid for what you walked**, pro-rated to the minute, with a report
  that says so. Collecting and cancelling are literally the same call, so an abandoned shift can
  never be paid by different rules than a completed one.
- **The shift report**: hours signed off, the pay counted out, and a few lines from the beat. The
  night lines only appear on shifts long enough to have a night in them, and a longer shift tells
  more of the story.
- **One place at a time.** A hero on the beat cannot take a job and a hero on a job cannot sign
  on — enforced in the engine, so it holds for every caller and not just for the button that
  happens to check. A mission waiting to be watched counts as still out.
- **The economy simulation** (`engine/economy/simulate.ts`) plays modeled days through the real
  reward curves and records every coin in and out. 15 CI bands cover pacing, the "always slightly
  broke" purse and patrol staying the fallback; `/dev/economy` shows the same ledger day by day.
  It models only what exists — shops and mounts join as they ship.
- **Save schema v6** carries the shift, with a v5 fixture caught mid-mission.

### Changed — Phase 6
- **Levelling was about ten times too slow, and now is not.** `xpPerVigor` divided by a flat 320,
  which makes levels-per-day *constant* — the hundredth level costing exactly as much play as the
  second — and put level 10, where the last feature gate opens, on day 29 against a target of day
  2–3. It is now a curve (`28 + 1.2L`): level 10 on day 4, 25 on day 11, 55 on day 34. Reaching
  100 still arrives well ahead of its target; that needs a deceleration no single divisor gives,
  and is flagged for the Phase 17 balance pass with the sim measuring it every build.
- **Gear now keeps up with levelling.** Faster levels exposed a supply problem the slow curve was
  hiding: a level-13 hero still swinging their level-1 starter weapon, win-rate sliding from 100%
  to 40%. Drops are slot-weighted toward weapons, and carry a **pity floor** — five levels behind
  and the next drop is a weapon. Pity decides what a drop is, never whether one happens. Shops
  (Phase 7) are the real fix.
- Feature gates are enforced where a room renders, not only where the nav rail links to it. That
  was fine while every locked place was a placeholder; the watch house pays real gold, and
  `/patrol` was reachable at level 1 by typing the URL.

### Fixed — Phase 6
- Two Phase 5 tests were asserting a fiction. The "playthrough" hero never spent gold on
  attributes and only equipped into empty slots, and `isUpgrade` ignored weapon damage entirely —
  so a strictly better weapon stayed in the backpack, and the losses that followed read as a
  balance problem rather than a test bug.

### Added — Phase 5: Tavern & Missions (the core loop)
- **The loop is playable**: accept a job → wait out a real timer → watch the fight → take the
  loot → spend it on training → go again. The Gilded Tankard is a real screen now, not a dressed
  placeholder.
- **The quest table**: three seeded jobs a day, each with its zone art, a posting written by
  somebody in the world, the foe, a length picker (5/10/15/20 min) that moves the rewards as you
  choose it, and the **drop odds printed on the card** — read from the same table the roll obeys,
  so they cannot drift apart.
- **Vigor** (100/day) with a real tankard in the HUD, Ale from Marla (3/day cap, raises the
  ceiling rather than overflowing it), and a mission timer chip that becomes "your hero is back".
- **Missions never auto-resolve.** A timer that expires while the tab is closed leaves the fight
  waiting at the door — the battle is the payoff, and resolving it in the background would hand
  the player a result they never got to watch.
- **The outcome is committed at accept.** Reloading mid-timer, closing the tab for a day, or
  rewatching cannot change what a mission pays. The timer is two timestamps in the save.
- **The Reset Engine** owns every daily boundary in one place — no feature checks the clock
  itself. Missed days are walked in order (nine days away is nine boundaries but still one day of
  Vigor), and day *keys* are compared rather than elapsed hours, so DST is a non-event.
- **Content**: 10 zones with overlapping level bands, 64 mission monsters (full rosters for the
  bands this phase ships, levels 1–36), 24 parameterised mission blurbs, and Marla's barks.
- **Save schema v5** adds the activity slice, with a migration and a captured v4 fixture.
- Golden Dice sinks arrive with their faucets: board reroll (free once daily, then a die) and
  calling the hero back early.

### Changed — Phase 5
- **New heroes start in a kit.** `createHero` granted nothing at all, which was invisible while
  there was nothing to fight and fatal the moment there was: an unarmed hero swings for 1–2 and
  loses to the gentlest thing in the woods. A seeded common weapon and chest now go straight onto
  the body.
- **Monster level jitter no longer rounds upward below level 5.** Plus-two levels is a rounding
  error at 40 and a different game at 1; a brand-new hero was losing about a fifth of their first
  missions. Measured: the opening hours went from ~80% to ~99%, with nothing past level 5 touched.
- **Zone backdrops were remapped to the art that actually depicts them.** The content-plan table
  numbered the files sight unseen, which put a tropical shipwreck behind "Whispering Woods" and a
  flower meadow behind the marsh.
- **Rewards are banked when the fight ends, not when it starts.** Claiming on the way in lit up
  the HUD with the gold before the first sword was drawn, spoiling the scene it exists to tell.
  Nothing is lost by waiting: the mission stays pending until claimed.
- Battle fighters are laid out within a capped width so they read as a duel rather than as two
  portraits at opposite ends of a landscape, and a monster without art now shows a lit archetype
  card instead of a near-black hole.
- `goldPerVigor`'s worked examples in balancing §2 were wrong (L25 said 311; it is 278) and are
  now asserted by tests.

### Fixed — Phase 5
- `claimMission` paid out again if called twice with the same mission — a double-clicked Continue
  button, or a component mounting twice, would have paid the player twice. It now refuses
  anything that is not the currently pending mission.

### Added — Phase 4: Battle Scene
- **The battle scene** (`src/components/battle/`) — the Phase 3 log, choreographed. Fighters slide
  in behind a backdrop push-in, attackers lunge, hits throw Kenney particles from a pooled canvas,
  damage numbers float (crits at ×1.6, gold), health bars chip instantly with a ghost trail
  draining behind, big hits shake the stage, and the loser desaturates and falls.
- **Every `BattleEvent` type has its own presentation**: blocks, dodges and misses each get a
  distinct plate; Bard verses fly a ribbon; a Flurry's second hit lands quicker than the swing
  that set it up.
- **`battleChoreo.ts`** holds every timing in the fight, so pacing can be retuned without touching
  a single rule — and a balance change can never accidentally alter pacing.
- **`timeline.ts`** turns a log into a schedule as a *pure* function, and `frameAt(t)` derives the
  whole picture at any moment. That is what makes skip, replay and speed changes free, and it puts
  the hard part of animation under unit test without rendering anything.
- **Adaptive pacing.** A fixed pace cannot serve both a 3-round and a 20-round fight, so the
  exchange compresses toward the 8-second target while the entrance, the knockout, the closing
  beat and every *impact frame* keep their authored length. Measured across every class ×
  archetype × level band: median 4.8s, p99 8.0s, worst case 8.7s.
- **Result screen** with cascading reward lines, a rarity-revealed loot card, the "closest moment"
  stat, and — after a loss — a reason hint that names something the player can actually change.
- **`engine/combat/analysis.ts`** reads a log back into counts, closest-moment figures and ranked
  typed hint codes. The arithmetic is engine work and tested; the wording is UI work.
- **Reduced motion** keeps every beat and every plate, dropping only anticipation, shake,
  slow-motion and the particle canvas — the fight stays followable, it just stops performing.
- **Save schema v4**: battle speed and skip preference persist, with a migration and a captured v3
  fixture (a real geared hero) added to the regression set.
- **`/dev/battle`** stages any matchup at any level and reports the run time against the target.
- Tests: 44 new unit tests (timeline, analysis, scene render, store), a fuzz pass that scrubs every
  class × archetype × level fight frame by frame, and 11 e2e covering playback, skip, replay,
  speed, the result screen, reduced motion and the no-rounded-corners rule.

### Changed — Phase 4
- **The tank archetype was retuned** (hp ×5.0 → ×3.2, armour ×1.5 → ×1.2, damage-reduction cap
  0.45 → 0.30, block 20% → 15%, damage ×0.75 → ×1.2). It stacked four defences and produced
  23-round average fights the hero still won 99.7% of the time — a wall you cannot lose to is not
  tension, it is a wait. Now ~11 rounds, still comfortably the beefiest thing in a zone, and now
  hitting hard enough to be worth respecting. Mission win rates stay inside the ≥97% floor.
  *Fight length is now written down as a balance constraint, not just a presentation one.*
- The `swashbuckler vs dungeon boss` golden log was regenerated to match (19 rounds → 11).

### Added — Phase 3: Combat Engine
- **`fight()`** — the whole of combat as one pure, seeded function emitting a serializable battle
  log. Every fight in the game will run through it, so balance lives in exactly one place.
- **All five class kits implemented**: Shield Wall, Verses (with its three-song state machine),
  Arcane Certainty, Windstep and Flurry — plus the Swashbuckler's Parry.
- **Five monster archetypes** (bruiser, skirmisher, caster, tank, swarm) generated from level
  rather than hand-authored, so 126 monsters stay maintainable and can never drift off-curve.
- **Balance harness**: thousands of seeded fights per matchup, with CI asserting three bands —
  mirrors 45–55%, per-class average 45–55%, and any single matchup 30–70%.
- **Golden battle logs** freeze the engine's exact output; a diff means every committed seed in
  every save now resolves differently.
- **`/dev/combat`** viewer shows every roll of a seeded fight, and the win rate over 600 more.

### Changed — the Phase 3 rebalance
- Measuring the classes as originally specified showed they were badly unbalanced: Warrior beat
  Bard and Mage 100% of the time, Mage lost to Hunter 0%. Two causes, both fixed:
  **classes now have a weapon-damage factor** (a Warrior's one-hander hits softly, a Mage's staff
  hits like a falling tree — this is what pays for the survivability spread), and **the HP/armour
  spread was narrowed** from ×2.5–5.0 / 10–50% to ×3.4–4.2 / 15–35%, which also brought mirror
  fights from a 2-to-34-round range into 4–16.
- **Arcane Certainty softened** from "cannot be blocked or dodged" to "defences work at 62%". The
  absolute version measured as a 97% hard counter to the Hunter; an arena where your class simply
  loses is miserable.
- Hunter dodge 45%→40%; Swashbuckler gained a 15% Parry (it previously had no defence at all).
- Class specs, the balancing doc and the affected set bonuses were updated to match.

### Added — Phase 2: Hero Creation & Character Screen
- **The five classes as data** (`src/data/classes.ts`): main stat, HP factor, armour cap and one
  signature proc each, declared now and implemented by the combat engine in Phase 3. Creation
  cards lead with how a class *feels* rather than with a stat table.
- **Hero creation**: class pick → name (with validation that explains itself, and suggestions so
  the blank field is never a wall). No hero means the game opens here instead of in the town.
- **Character screen**: paperdoll with all 10 slots, attribute training with visible prices and a
  Max button that spends what it can, a derived-stat panel with hover breakdowns showing where
  every number comes from, and a backpack with an overflow satchel.
- **Item generation** (`generateItem`): one choke point for all gear — budgets, damage bands,
  armour, procedural naming, value and scrap yield. Class restriction is enforced *at generation*,
  so a wrong-class drop cannot exist rather than being filtered later.
- **25 item icons** drawn in the existing line family, taking the vocabulary to 45 glyphs.
- **Progression maths**: XP curve with multi-level rollover, and the rising per-point attribute
  cost that is the game's endless gold sink.
- **Save schema v3**: the hero replaces the retired walking-skeleton payload, with a v2→v3
  migration and a captured Phase 1 save proving settings survive the upgrade.
- **Dev drawer** on the character screen conjures gear, levels and gold so the screen is
  reviewable before loot sources exist; `grantXp` is the same call missions will use in Phase 5.

### Changed
- Hero mutations now write through immediately instead of waiting out a 5-second debounce, with a
  write-sequence guard so an older in-flight save can never land after a newer one and resurrect
  stale state.
- The HUD and nav-rail gates read the real hero (level, gold, portrait) instead of preview values.
- Corrected the XP and stat-cost example values in `balancing-formulas.md` — the quoted figures
  were miscalculated approximations. The curves are unchanged; the tests now assert the exact
  values so doc and code cannot drift again.

### Added — Phase 1: Design System & App Shell
- **Design system:** colour/type/chamfer tokens, timber and parchment surface treatments, etched
  edges with brass brackets, the facet accent motif, and a named motion system (snappy / standard
  / dramatic springs) so timings are picked from one vocabulary rather than per component.
- **Component kit:** `TavernPanel`, `ActionButton` (with visible costs and self-explaining disabled
  states), `Meter`, `TimerChip`, `KeeperBark`, `Modal`, `ToastStack`, `AmbientStage`.
- **Icons:** a hand-drawn 20-glyph family for navigation, currencies and status, declared as a
  vocabulary in the data layer and implemented in components so a missing glyph fails the build.
  The Vigor tankard fills with ale instead of being a static glyph.
- **App shell:** grouped nav rail (collapsible, persisted, locked places shown with their unlock
  level), top HUD (portrait + level ring, XP meter, wallet, Vigor, activity timers), and
  direction-aware place transitions driven by rail order.
- **The town:** all 15 places routed and dressed — each with its backdrop, tint, ambient recipe
  and a keeper explaining what phase builds it.
- **Feature gates** in the engine as one source of truth for the rail, router and future task pool.
- **`/dev/kit` harness** showing every component state and driving the shell through hero levels,
  wallets and timers the game cannot produce yet.
- **Save schema v2** adds player settings (nav, motion, audio) with a real v1→v2 migration and a
  captured Phase 0 save fixture that must keep loading forever.

### Changed
- Preferences now write through immediately instead of waiting out the autosave debounce — a
  collapsed rail survived a reload only by luck before.
- The Phase 0 walking-skeleton screen is removed; `/` now redirects to the tavern.

### Added — Phase 0: Foundation & Walking Skeleton
- **Project scaffold:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict +
  Tailwind v4 + Zustand + Motion, with ESLint/Prettier, Vitest, Playwright and GitHub Actions CI.
- **Determinism primitives:** `src/engine/rng.ts` (seeded sfc32 streams — forkable by name,
  snapshot/restore, weighted picks and shuffles) and `src/engine/clock.ts` (GameClock: the only
  wall-time reader, clamps backwards clock jumps, day-key based reset boundaries).
- **Save system:** versioned Zod save envelope, migration chain with an injectable-chain test
  harness, IndexedDB persistence with backup fallback and corrupted-save recovery, plus
  export/import; autosave debounce with flush on page hide.
- **Walking-skeleton screen** ("the tavern door") proving the mutate → persist → reload →
  rehydrate path and visible seeded-RNG replay, on the real backdrop with the chosen fonts,
  colour tokens and the chamfer system.
- **Guardrails that fail the build:** `Math.random`/`Date.now`/`new Date()` are lint-banned outside
  the two sanctioned modules, and `src/engine`/`src/data` may not import React, Next, Zustand or idb.
- **Asset pipeline stub** (`npm run assets:sync`) serving the 503 prepared art files, including the
  drop-in `public/assets/audio/bgm.mp3` slot; `CREDITS.md` seeded with attribution obligations.
- Tests: 68 unit + 5 end-to-end, all green; `npm run verify` runs the full gate.

### Added — Planning phase
- **Complete planning package (pre–Phase 0):**
  - Master Game Design Document, balancing/formulas doc, content plan (`docs/design/`)
  - 16 system specifications covering every v1.0 feature (`docs/design/systems/`)
  - Technical architecture, data models, UI/UX style guide, asset pipeline (`docs/tech/`)
  - Shakes & Fidget systems research reference (`docs/research/`)
  - 19-phase development roadmap with acceptance criteria (`ROADMAP.md`)
  - Open decisions list with working defaults (`USER_QUESTIONS.md`)
  - AI-developer working rules (`CLAUDE.md`, `AGENTS.md`), documentation index (`docs/README.md`)

### Changed
- **Planning review complete (2026-07-29):** all 20 `USER_QUESTIONS.md` decisions answered by
  the user and folded into the specs. Deviations from proposed defaults: mount rentals shortened
  to **7-day terms** (prices re-pinned: 20/55/130 × goldPerVigor, Royal Griffin 6 dice/7 days);
  audio scope now includes a **user-supplied `bgm.mp3` drop-in** background-music system next to
  the light SFX pass; hero gender/appearance variants confirmed post-1.0 (backlog).

### Notes
- No game code yet by design — design is locked, Phase 0 (scaffolding) is next.
- Prior repository state: prepared art in `game_assets/` (backgrounds, class portraits,
  Kenney UI/VFX packs).
