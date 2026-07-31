/**
 * The 1.0 release definition, as data (GDD §7, ROADMAP Phase 18).
 *
 * §7 says 1.0 ships when *"every feature in §4 is complete **with** animation/feedback polish"* —
 * seventeen rows of a markdown table, which is exactly the kind of promise that gets marked done
 * by reading it sympathetically. So each row names what would have to exist for the claim to be
 * true: the engine module that implements it, the screen that renders it, the tests that exercise
 * it, and — the part a feature list never carries — **the animated moment that makes it feel
 * finished**, because "no unanimated feature is done" is a hard rule (CLAUDE.md §3) and a rule
 * nothing checks is a preference.
 *
 * `release.test.ts` parses the GDD's own table and fails if this file and that table disagree in
 * either direction, then checks every path here exists on disk. It cannot prove a ceremony is
 * *good* — nothing can — but it can prove somebody had to name one, and that the file they named
 * is still there. The failure this prevents is the ordinary one: a feature quietly loses its
 * screen or its spec in a refactor and the release checklist, written once, still says yes.
 *
 * Pure data. No React, no DOM.
 */

export interface FeatureEvidence {
  /** The §4 table's first column, verbatim — the census key. */
  readonly feature: string;
  /** Spec doc under `docs/design/systems/`. */
  readonly spec: string;
  /** Pure modules that implement it. */
  readonly engine: readonly string[];
  /** Where a player meets it. */
  readonly screens: readonly string[];
  /** Unit/golden coverage. */
  readonly unit: readonly string[];
  /** The browser proof. */
  readonly e2e: readonly string[];
  /**
   * The animated moment, named. One sentence a person can go and look at — not "it has
   * transitions". If you cannot name one, the feature is not finished.
   */
  readonly ceremony: string;
}

export const RELEASE_CHECKLIST: readonly FeatureEvidence[] = [
  {
    feature: 'Hero & classes',
    spec: 'docs/design/systems/characters-and-classes.md',
    engine: ['src/engine/hero/actions.ts', 'src/engine/hero/derived.ts', 'src/data/classes.ts'],
    screens: ['src/components/hero/HeroCreation.tsx', 'src/components/hero/CharacterScreen.tsx'],
    unit: ['src/engine/progression/progression.test.ts', 'src/engine/hero/hero.test.ts'],
    e2e: ['e2e/hero.spec.ts'],
    ceremony: 'Training a point ticks the derived stat up and flies a +N to the HUD.',
  },
  {
    feature: 'Combat engine',
    spec: 'docs/design/systems/combat.md',
    engine: ['src/engine/combat/fight.ts', 'src/engine/combat/analysis.ts'],
    screens: ['src/components/battle/BattleScene.tsx', 'src/components/battle/BattleResult.tsx'],
    unit: [
      'src/engine/combat/fight.test.ts',
      'src/engine/combat/golden.test.ts',
      'src/engine/combat/balance.test.ts',
    ],
    e2e: ['e2e/battle.spec.ts'],
    ceremony: 'The whole scene: lunges, shakes, crit slow-motion, the knockout desaturation.',
  },
  {
    feature: 'Tavern missions',
    spec: 'docs/design/systems/tavern-and-patrol.md',
    engine: ['src/engine/missions/board.ts', 'src/engine/missions/lifecycle.ts'],
    screens: ['src/components/tavern/TavernScreen.tsx', 'src/components/tavern/MissionCard.tsx'],
    unit: ['src/engine/missions/missions.test.ts'],
    e2e: ['e2e/missions.spec.ts'],
    ceremony:
      'The contract comes home to a fight mounted at the tavern door, then the loot reveal.',
  },
  {
    feature: 'Patrol',
    spec: 'docs/design/systems/tavern-and-patrol.md',
    engine: ['src/engine/patrol/patrol.ts'],
    screens: ['src/components/patrol/PatrolScreen.tsx'],
    unit: ['src/engine/patrol/patrol.test.ts'],
    e2e: ['e2e/patrol.spec.ts'],
    ceremony: 'The shift report counts up out of the log, line by line, when Hildy pays out.',
  },
  {
    feature: 'Items & gear',
    spec: 'docs/design/systems/items-and-gear.md',
    engine: [
      'src/engine/items/generate.ts',
      'src/engine/items/drops.ts',
      'src/engine/items/dispose.ts',
    ],
    screens: ['src/components/items/ItemCard.tsx', 'src/components/hero/CharacterScreen.tsx'],
    unit: [
      'src/engine/items/generate.test.ts',
      'src/engine/items/drops.test.ts',
      'src/engine/items/dispose.test.ts',
    ],
    e2e: ['e2e/hero.spec.ts'],
    ceremony: 'The shared loot reveal: card back, rarity beam, flip, statline cascade.',
  },
  {
    feature: 'Gear sets',
    spec: 'docs/design/systems/gear-sets.md',
    engine: ['src/engine/items/sets.ts', 'src/data/gearSets.ts'],
    screens: ['src/components/hero/SetCollections.tsx'],
    unit: ['src/engine/forge/forge.test.ts'],
    e2e: ['e2e/forge.spec.ts'],
    ceremony: 'A completed set lights the paperdoll; the collections tab fills its pips.',
  },
  {
    feature: 'Shops',
    spec: 'docs/design/systems/shops-and-stables.md',
    engine: ['src/engine/shops/stock.ts', 'src/engine/items/dispose.ts'],
    screens: ['src/components/shops/ShopScreen.tsx', 'src/components/shops/StockCard.tsx'],
    unit: ['src/engine/shops/stock.test.ts'],
    e2e: ['e2e/shops.spec.ts'],
    ceremony: 'A bought item leaves a wrapped parcel in the gap; the coin cost flies from the HUD.',
  },
  {
    feature: 'Stables',
    spec: 'docs/design/systems/shops-and-stables.md',
    engine: ['src/engine/stables/mounts.ts', 'src/data/mounts.ts'],
    screens: ['src/components/stables/StableScreen.tsx'],
    unit: ['src/engine/stables/mounts.test.ts'],
    e2e: ['e2e/shops.spec.ts'],
    ceremony: 'The stall doors open on the rented mount and the HUD grows its timer chip.',
  },
  {
    feature: 'Emberforge',
    spec: 'docs/design/systems/crafting-and-scrapping.md',
    engine: ['src/engine/forge/craft.ts', 'src/engine/forge/forgeConfig.ts'],
    screens: ['src/components/forge/ForgeScreen.tsx'],
    unit: ['src/engine/forge/forge.test.ts'],
    e2e: ['e2e/forge.spec.ts'],
    ceremony: 'The anvil strike — hammer, sparks, and the result rising out of the heat.',
  },
  {
    feature: "Fortune's Table",
    spec: 'docs/design/systems/gacha-fortunes-table.md',
    engine: [
      'src/engine/gacha/roll.ts',
      'src/engine/gacha/schedule.ts',
      'src/engine/gacha/track.ts',
    ],
    screens: ['src/components/gacha/FortuneScreen.tsx', 'src/components/gacha/BannerCard.tsx'],
    unit: ['src/engine/gacha/gacha.test.ts'],
    e2e: ['e2e/fortune.spec.ts'],
    ceremony: 'The dice tumble into a tarot fan; the pity meter fills in view of the player.',
  },
  {
    feature: 'Menagerie (pets)',
    spec: 'docs/design/systems/pets.md',
    engine: [
      'src/engine/pets/ownership.ts',
      'src/engine/pets/feeding.ts',
      'src/engine/pets/boost.ts',
    ],
    screens: ['src/components/pets/MenagerieScreen.tsx', 'src/components/pets/PetStall.tsx'],
    unit: ['src/engine/pets/pets.test.ts'],
    e2e: ['e2e/menagerie.spec.ts'],
    ceremony: 'A stall unlatches when its companion arrives; feeding pops the level and the boost.',
  },
  {
    feature: 'Arena & Hall of Fame',
    spec: 'docs/design/systems/arena-and-hall-of-fame.md',
    engine: ['src/engine/arena/arena.ts', 'src/engine/arena/duel.ts', 'src/engine/arena/payout.ts'],
    screens: [
      'src/components/arena/ArenaScreen.tsx',
      'src/components/arena/LadderSwap.tsx',
      'src/components/world/HallOfFame.tsx',
    ],
    unit: ['src/engine/arena/arena.test.ts'],
    e2e: ['e2e/arena.spec.ts'],
    ceremony: 'The rank swap plays as two sliding rungs, with a stinger on a milestone.',
  },
  {
    feature: 'Guilds',
    spec: 'docs/design/systems/guilds.md',
    engine: [
      'src/engine/guilds/membership.ts',
      'src/engine/guilds/buffs.ts',
      'src/engine/guilds/bounty.ts',
    ],
    screens: ['src/components/guild/GuildHallScreen.tsx', 'src/components/guild/HallInterior.tsx'],
    unit: ['src/engine/guilds/guilds.test.ts'],
    e2e: ['e2e/guild.spec.ts'],
    ceremony: 'A donation raises the track and the hall answers in chat.',
  },
  {
    feature: 'Dungeons',
    spec: 'docs/design/systems/dungeons.md',
    engine: [
      'src/engine/dungeons/delve.ts',
      'src/engine/dungeons/floors.ts',
      'src/engine/dungeons/keys.ts',
    ],
    screens: ['src/components/dungeons/UndertavernScreen.tsx'],
    unit: ['src/engine/dungeons/dungeons.test.ts'],
    e2e: ['e2e/dungeons.spec.ts'],
    ceremony: 'The torch-lit descent between floors, and the floor-10 ceremony at the bottom.',
  },
  {
    feature: 'World simulation',
    spec: 'docs/design/systems/world-simulation.md',
    engine: [
      'src/engine/world/simulate.ts',
      'src/engine/world/ladder.ts',
      'src/engine/world/crier.ts',
    ],
    screens: ['src/components/world/TownCrier.tsx', 'src/components/world/AbsenceCard.tsx'],
    unit: ['src/engine/world/world.test.ts'],
    e2e: ['e2e/world.spec.ts'],
    ceremony: 'The Crier board deals its overnight news in; the absence card counts the days away.',
  },
  {
    feature: 'Economy',
    spec: 'docs/design/systems/economy-and-currencies.md',
    engine: ['src/engine/economy/simulate.ts', 'src/engine/progression/rewards.ts'],
    screens: ['src/components/shell/TopHud.tsx'],
    unit: ['src/engine/economy/economy.test.ts'],
    e2e: ['e2e/app-shell.spec.ts'],
    ceremony:
      'Every currency in the HUD tick-counts, and gains arc to it from where they were won.',
  },
  {
    feature: 'Daily systems',
    spec: 'docs/design/systems/daily-loop-and-retention.md',
    engine: [
      'src/engine/board/tasks.ts',
      'src/engine/board/chest.ts',
      'src/engine/calendar/calendar.ts',
    ],
    screens: ['src/components/board/BoardScreen.tsx', 'src/components/shell/ResetMoment.tsx'],
    unit: ['src/engine/board/board.test.ts', 'src/engine/calendar/calendar.test.ts'],
    e2e: ['e2e/board.spec.ts'],
    ceremony: 'Midnight strikes over the town; the chest opens for the day it was owed.',
  },
  {
    feature: 'Tutorial',
    spec: 'docs/design/systems/tutorial-and-onboarding.md',
    engine: ['src/engine/tutorial/beats.ts', 'src/engine/tutorial/hints.ts'],
    screens: ['src/components/tutorial/Spotlight.tsx', 'src/components/tutorial/TutorialChip.tsx'],
    unit: ['src/engine/tutorial/tutorial.test.ts'],
    e2e: ['e2e/tutorial.spec.ts'],
    ceremony: 'The spotlight cuts a hole that chases its target, and the rail reveals a new room.',
  },
];

/* ── The other four §7 lines ───────────────────────────────────────────────────────── */

export interface ReleaseGate {
  readonly id: string;
  /** The §7 sentence, in the words the GDD uses. */
  readonly claim: string;
  /** What settles it. `null` means no harness can — a human has to look. */
  readonly harness: string | null;
  /** How to run it. */
  readonly command: string;
  readonly note?: string;
}

export const RELEASE_GATES: readonly ReleaseGate[] = [
  {
    id: 'features',
    claim: 'every feature in §4 is complete with animation/feedback polish',
    harness: 'src/engine/release/release.test.ts',
    command: 'npm test -- src/engine/release',
  },
  {
    id: 'tutorial-to-ten',
    claim: 'the tutorial carries a new player to level 10 unaided',
    harness: 'src/engine/release/onboarding.test.ts',
    command: 'npm test -- src/engine/release',
    note: 'Two halves: the tour reaches every room a level-10 player has, and the pacing sim says level 10 lands inside the §0 budget.',
  },
  {
    id: 'pacing',
    claim: 'a simulated 30-day player reaches ~level 55 with 1–2 set pieces',
    harness: 'src/engine/pacing/pacing.test.ts',
    command: 'npm run pacing',
  },
  {
    id: 'migrations',
    claim: 'saves survive version migration',
    harness: 'src/engine/save/fixtures.test.ts',
    command: 'npm test -- src/engine/save',
    note: 'Every shipped version has a captured fixture and the whole v1→current chain is walked.',
  },
  {
    id: 'performance',
    claim: 'the game runs 60 fps on a mid-range laptop at 1080p',
    harness: 'scripts/perf-pass.mjs',
    command: 'npm run perf',
    note: 'Measured as main-thread cost per frame, not fps — see GDD §7 and style guide §11.1. Frames per second on real hardware is the one line a CI container cannot answer.',
  },
];
