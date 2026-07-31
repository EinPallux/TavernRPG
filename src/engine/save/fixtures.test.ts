/**
 * Historical save fixtures.
 *
 * One real save file per shipped schema version, captured from an actual build. These are the
 * regression net behind "saves are sacred": if a migration ever stops opening a released
 * format, this test fails instead of a player's save.
 *
 * When bumping the schema: add a fixture for the *previous* version here, never edit an old one.
 *
 * `v8-phase8.json` is minified where the earlier ones are pretty-printed: a real Phase 8 save
 * carries the whole 1,500-hero world and runs to 184 KB, which no one is going to read either
 * way. The compact form at least makes it obvious it is machine output.
 */

import { describe, expect, it } from 'vitest';
import v1Phase0 from './fixtures/v1-phase0.json';
import v2Phase1 from './fixtures/v2-phase1.json';
import v3Phase3 from './fixtures/v3-phase3.json';
import v4Phase4 from './fixtures/v4-phase4.json';
import v5Phase5 from './fixtures/v5-phase5.json';
import v6Phase6 from './fixtures/v6-phase6.json';
import v7Phase7 from './fixtures/v7-phase7.json';
import v8Phase8 from './fixtures/v8-phase8.json';
import v9Phase9 from './fixtures/v9-phase9.json';
import v10Phase10 from './fixtures/v10-phase10.json';
import v11Phase11 from './fixtures/v11-phase11.json';
import v12Phase12 from './fixtures/v12-phase12.json';
import v13Phase13 from './fixtures/v13-phase13.json';
import v14Phase14 from './fixtures/v14-phase14.json';
import v15Phase15 from './fixtures/v15-phase15.json';
import { BOT_COUNT } from '@/engine/world/identity';
import { PLAYER_LADDER_ID } from '@/engine/world/ladder';
import { ownedPets } from '@/engine/pets/ownership';
import { activeBeat, tutorialComplete } from '@/engine/tutorial/beats';
import { migrateSave } from './migrations';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_ACTIVITY,
  DEFAULT_ARENA,
  DEFAULT_DUNGEONS,
  DEFAULT_FORGE,
  DEFAULT_GACHA,
  DEFAULT_GUILD,
  DEFAULT_CALENDAR,
  DEFAULT_PETS,
  DEFAULT_TASKS,
  DEFAULT_TUTORIAL,
  EMPTY_MATERIALS,
  DEFAULT_SETTINGS,
  type SaveFile,
} from './schema';

describe('save fixtures — every shipped version still loads', () => {
  it('opens a Phase 0 (v1) save and upgrades it to the current format', () => {
    const result = migrateSave(structuredClone(v1Phase0));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(1);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('preserves the player’s world across every upgrade step (v1 → current)', () => {
    const result = migrateSave(structuredClone(v1Phase0));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The things a player would notice if we got this wrong.
    expect(result.save.worldSeed).toBe(3863720897);
    expect(result.save.clock.lastSeen).toBe(1785062400000);
    expect(result.save.slot).toBe(1);
    // Their world survives; they simply have no hero yet, so creation opens.
    expect(result.save.hero).toBeNull();
  });

  it('fills newly added settings with defaults rather than leaving them undefined', () => {
    const result = migrateSave(structuredClone(v1Phase0));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('opens a Phase 1 (v2) save and keeps the settings the player chose', () => {
    const result = migrateSave(structuredClone(v2Phase1));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(2);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // Settings are the player's own choices — a migration must never reset them. Keys added
    // by later versions arrive at their defaults.
    expect(result.save.settings).toEqual({
      navCollapsed: true,
      motion: 'reduced',
      sfxEnabled: true,
      musicEnabled: false,
      volume: 0.4,
      battleSpeed: DEFAULT_SETTINGS.battleSpeed,
      battleSkipDefault: DEFAULT_SETTINGS.battleSkipDefault,
    });
    expect(result.save.worldSeed).toBe(208181039);
    expect(result.save.slot).toBe(2);
    expect(result.save.clock.clampCount).toBe(1);
    expect(result.save.hero).toBeNull();
  });

  it('drops the retired walking-skeleton payload', () => {
    const result = migrateSave(structuredClone(v2Phase1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save).not.toHaveProperty('skeleton');
  });

  it('opens a Phase 3 (v3) save with a geared hero intact', () => {
    const result = migrateSave(structuredClone(v3Phase3));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(3);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // A hero is the thing a player would most notice losing.
    const hero = result.save.hero;
    expect(hero).not.toBeNull();
    expect(hero?.name).toBe('Wren Ashdown');
    expect(hero?.classId).toBe('hunter');
    expect(hero?.level).toBe(12);
    expect(hero?.trained).toEqual({ str: 0, dex: 14, int: 0, con: 5, lck: 0 });
    // Four equipped pieces and the spare in the bags.
    expect(Object.keys(hero?.equipment ?? {}).sort()).toEqual([
      'amulet',
      'chest',
      'helmet',
      'weapon',
    ]);
    expect(hero?.backpack.filter(Boolean)).toHaveLength(1);
  });

  it('adds the Phase 4 battle preferences without touching the rest of settings', () => {
    const result = migrateSave(structuredClone(v3Phase3));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.settings).toEqual({
      navCollapsed: false,
      motion: 'full',
      sfxEnabled: false,
      musicEnabled: true,
      volume: 0.85,
      battleSpeed: 1,
      battleSkipDefault: false,
    });
  });

  it('opens a Phase 4 (v4) save with its playback preference intact', () => {
    const result = migrateSave(structuredClone(v4Phase4));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(4);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.save.settings.battleSpeed).toBe(4);
    expect(result.save.settings.battleSkipDefault).toBe(true);
    expect(result.save.hero?.name).toBe('Bram Halloway');
    expect(result.save.hero?.level).toBe(27);
    // Six pieces worn, four in the bags, and the locked one still locked.
    expect(Object.keys(result.save.hero?.equipment ?? {})).toHaveLength(6);
    expect(result.save.hero?.backpack.filter(Boolean)).toHaveLength(4);
    expect(result.save.hero?.backpack.find((entry) => entry?.locked)).toBeDefined();
  });

  it('gives a pre-Phase-5 save a full day of Vigor and an empty board', () => {
    const result = migrateSave(structuredClone(v4Phase4));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Additive migration: they wake up exactly as they would after any midnight.
    expect(result.save.activity).toEqual(DEFAULT_ACTIVITY);
    expect(result.save.activity.vigor).toBe(100);
    expect(result.save.activity.mission).toBeNull();
    // A null board day is what forces the redraw on first read.
    expect(result.save.activity.boardDay).toBeNull();
  });

  it('opens a Phase 5 (v5) save with a mission still running', () => {
    const result = migrateSave(structuredClone(v5Phase5));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(5);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // A mission in flight is the thing most likely to be broken by a careless migration.
    const activity = result.save.activity;
    expect(activity.mission).not.toBeNull();
    expect(activity.mission?.offer.monsterId).toBe('sunken-drover');
    expect(activity.mission?.duration).toBe(15);
    expect(activity.vigor).toBe(85);
    expect(activity.board).toHaveLength(2);
    expect(activity.boardRerollsToday).toBe(1);
    expect(activity.alesHeld).toBe(2);
    expect(activity.missionsCompleted).toBe(37);
    expect(result.save.hero?.name).toBe('Odo Marchand');
  });

  it('gives a pre-Phase-6 save an empty patrol slot without disturbing anything else', () => {
    const result = migrateSave(structuredClone(v5Phase5));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.activity.patrol).toBeNull();
    expect(result.save.activity.patrolsCompleted).toBe(0);
    // The additive migration reaches *inside* the activity slice, so the rest must be intact.
    expect(result.save.activity.lastProcessedDay).toBe('2026-08-14');
  });

  it('opens a Phase 6 (v6) save with a shift still on the beat', () => {
    const result = migrateSave(structuredClone(v6Phase6));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(6);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // A running shift is timestamps, and timestamps are what a careless migration mangles.
    const patrol = result.save.activity.patrol;
    expect(patrol).not.toBeNull();
    expect(patrol?.hours).toBe(8);
    expect(patrol?.endsAt).toBe((patrol?.startedAt ?? 0) + 8 * 3_600_000);
    expect(patrol?.heroLevel).toBe(18);
    expect(result.save.activity.patrolsCompleted).toBe(4);
    expect(result.save.activity.vigor).toBe(40);
  });

  it('gives a pre-Phase-7 save empty shelves and an empty stall', () => {
    const result = migrateSave(structuredClone(v6Phase6));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Empty shelves are exactly what a player sees the morning after a restock: they draw
    // lazily on first visit, so nobody arrives to a broken shop.
    expect(result.save.activity.shops).toEqual({});
    expect(result.save.activity.mount).toBeNull();
    // Additive inside the activity slice — the shift and the counters must be untouched.
    expect(result.save.activity.patrol).not.toBeNull();
    expect(result.save.activity.missionsCompleted).toBe(37);
  });

  it('opens a Phase 7 (v7) save with a half-sold shelf and a mount still in the stall', () => {
    const result = migrateSave(structuredClone(v7Phase7));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(7);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    const activity = result.save.activity;
    expect(activity.shops['armory']?.sold).toEqual([0, 3]);
    expect(activity.shops['armory']?.rerollsToday).toBe(2);
    expect(activity.mount?.mountId).toBe('warhorse');
    // The shift from v6 is still in flight underneath all of it.
    expect(activity.patrol?.hours).toBe(8);
  });

  it('gives a pre-Phase-8 save no world, which the load path then raises', () => {
    const result = migrateSave(structuredClone(v7Phase7));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Null rather than generated: the migration is a pure function with no clock, and an
    // existing hero without a world is exactly the case the load path already handles.
    expect(result.save.world).toBeNull();
    expect(result.save.hero?.name).toBe('Odo Marchand');
  });

  it('opens a Phase 8 (v8) save with all 1,500 of them still standing', () => {
    const result = migrateSave(structuredClone(v8Phase8));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(8);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // The world is the bulk of a real save — 184 KB of it — and the migration must not so much
    // as reorder it. If a bot, a guild roll or a rung of the ladder went missing here, the
    // player's Hall of Fame would quietly disagree with itself.
    const world = result.save.world;
    expect(world?.bots).toHaveLength(BOT_COUNT);
    expect(world?.guilds).toHaveLength(60);
    expect(world?.ladder).toHaveLength(BOT_COUNT);
    expect(world?.feed.length).toBeGreaterThan(0);
    expect(world?.ladder).toEqual((v8Phase8 as unknown as SaveFile).world?.ladder);
  });

  it('gives a Phase 8 hero the honor and the arena slice they were missing', () => {
    const result = migrateSave(structuredClone(v8Phase8));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Zero, not a seeded rank's worth: honor is earned in the arena, and a hero who has never
    // fought there has none. `joinLadder` seats them when they first walk into the Proving
    // Grounds, which is a load-path decision and not a migration's business.
    expect(result.save.hero?.honor).toBe(0);
    expect(result.save.arena).toEqual(DEFAULT_ARENA);

    // Everything the v8 player was mid-way through survives intact.
    expect(result.save.hero?.name).toBe('Sela Thornwick');
    expect(result.save.hero?.level).toBe(24);
    expect(result.save.activity.mission?.offer.monsterId).toBe('fen-stalker');
    expect(result.save.activity.patrol?.hours).toBe(8);
    expect(result.save.activity.mount?.mountId).toBe('courser');
    expect(result.save.activity.shops['facet']?.rerollsToday).toBe(2);
  });

  it('leaves a v8 player off the ladder, exactly as v8 left them', () => {
    const result = migrateSave(structuredClone(v8Phase8));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Phase 8 shipped a world the player watched but never entered, so their saved ladder has no
    // seat for them and — because rivals are drawn from the band around the player's rank — no
    // rivals either. Phase 9 is what changes that, on load rather than in the migration.
    expect(result.save.world?.ladder).not.toContain(PLAYER_LADDER_ID);
    expect(result.save.world?.rivals).toEqual([]);
  });

  it('opens a Phase 9 (v9) save with its arena mid-session', () => {
    const result = migrateSave(structuredClone(v9Phase9));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(9);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // Everything the v9 player had in flight: a rung, a cooldown, a grudge, a week archived.
    expect(result.save.world?.ladder.indexOf(PLAYER_LADDER_ID)).toBe(686);
    expect(result.save.hero?.honor).toBe(5_142);
    expect(result.save.arena.draw).toHaveLength(3);
    expect(result.save.arena.rewardedWinsToday).toBe(6);
    expect(result.save.arena.revengeQueue).toHaveLength(1);
    expect(result.save.arena.legends[0]?.weekKey).toBe('2026-09-06');
    expect(result.save.arena.bestRank).toBe(669);
  });

  it('gives a Phase 9 player a Guild Hall they have not walked into yet', () => {
    const result = migrateSave(structuredClone(v9Phase9));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Purely additive: an existing hero is simply unguilded, the state a new one starts in. The
    // sixty halls were already in their world slice — they just had no door until now.
    expect(result.save.guild).toEqual(DEFAULT_GUILD);
    expect(result.save.guild.guildId).toBeNull();
    expect(result.save.world?.guilds.length).toBe(60);
    // And nothing else moved.
    expect(result.save.hero?.name).toBe('Bryn Halloway');
    expect(result.save.activity.mount?.mountId).toBe('griffin');
    expect(result.save.activity.missionsCompleted).toBe(214);
  });

  it('opens a Phase 10 (v10) save mid-week in its hall', () => {
    const result = migrateSave(structuredClone(v10Phase10));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(10);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // Everything the v10 player had in flight: a hall, a chat log, a bounty part-done, gold in
    // the pot, and the high-water marks that stop any of it being re-rolled on the way in.
    expect(result.save.guild.guildId).toBe(15);
    expect(result.save.guild.chat.length).toBe(29);
    expect(result.save.guild.bounty?.bountyId).toBe('climb');
    expect(result.save.guild.bounty?.botUnits).toBe(18);
    expect(result.save.guild.contributions['player']).toBe(12_500);
    expect(result.save.guild.lastChatDay).toBeGreaterThan(0);
    expect(result.save.guild.lastBountyDay).toBeGreaterThan(0);
  });

  it('gives a Phase 10 player an Undertavern with the doors still shut', () => {
    const result = migrateSave(structuredClone(v10Phase10));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Purely additive, and deliberately empty rather than generous. Handing a returning player
    // the Rusty Key would skip the one drop the whole unlock is built around.
    expect(result.save.dungeons).toEqual(DEFAULT_DUNGEONS);
    expect(result.save.dungeons.keys).toEqual([]);
    expect(result.save.dungeons.trophies).toEqual([]);
    // And nothing else moved.
    expect(result.save.hero?.name).toBe('Bryn Halloway');
    expect(result.save.hero?.honor).toBe(5_142);
    expect(result.save.world?.ladder.indexOf(PLAYER_LADDER_ID)).toBe(686);
    expect(result.save.activity.mount?.mountId).toBe('griffin');
  });

  it('opens a Phase 11 (v11) save mid-delve', () => {
    const result = migrateSave(structuredClone(v11Phase11));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(11);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // Everything the v11 player had underground: two keys, five floors down, the attempt
    // counter that keeps their next descent a different fight.
    expect(result.save.dungeons.keys).toEqual(['rusty-key', 'bone-key']);
    expect(result.save.dungeons.progress['rat-cellars']?.floorsCleared).toBe(5);
    expect(result.save.dungeons.progress['rat-cellars']?.attempts).toBe(12);
  });

  it('gives a Phase 11 player an empty purse and a cold forge', () => {
    const result = migrateSave(structuredClone(v11Phase11));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    /*
     * Deliberately empty rather than generous. Phase 7's disposal quoted a scrap yield and then
     * threw it away, because there was nowhere to put it — back-paying that stockpile would hand
     * a returning player a Master forge on the visit where the room is introducing itself.
     */
    expect(result.save.hero?.materials).toEqual(EMPTY_MATERIALS);
    expect(result.save.hero?.openingVerse).toBeNull();
    expect(result.save.forge).toEqual(DEFAULT_FORGE);
    // And nothing else moved.
    expect(result.save.hero?.name).toBe('Bryn Halloway');
    expect(result.save.guild.guildId).toBe(15);
    expect(result.save.world?.ladder.indexOf(PLAYER_LADDER_ID)).toBe(686);
  });

  it('opens a Phase 12 (v12) save with a stocked purse and a warm forge', () => {
    const result = migrateSave(structuredClone(v12Phase12));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(12);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // Everything the v12 player had at the bench: a purse, three melts spent today, an ember
    // banked, a pattern found, and the set piece it bought them.
    expect(result.save.hero?.materials).toEqual({ scrap: 81, essence: 45, starmetal: 3 });
    expect(result.save.forge.scrapsUsedToday).toBe(3);
    expect(result.save.forge.emberMeter).toBe(1);
    expect(result.save.forge.recipes).toEqual(['nighttide-silks']);
    const bagged = [...result.save.hero!.backpack, ...result.save.hero!.satchel];
    expect(bagged.filter((item) => item?.setId === 'nighttide-silks')).toHaveLength(1);
  });

  it('sits a Phase 12 player down at an empty table', () => {
    const result = migrateSave(structuredClone(v12Phase12));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    /*
     * Empty rather than generous, for the third schema running. A returning player has spent
     * Golden Dice on Ale, shop rerolls and cooldown skips for twelve phases — none of which were
     * rolls, so none of which owe pity. Seeding the counter from any of that would hand out a
     * guaranteed set piece for work done on a different system, and a published pity track is
     * only honest if the number on screen is the number that was earned.
     */
    expect(result.save.gacha).toEqual(DEFAULT_GACHA);
    // And nothing else moved.
    expect(result.save.hero?.name).toBe('Bryn Halloway');
    expect(result.save.hero?.classId).toBe('swashbuckler');
    expect(result.save.dungeons.keys).toEqual(['rusty-key', 'bone-key']);
  });

  it('opens a Phase 13 (v13) save with an evening at the table behind it', () => {
    const result = migrateSave(structuredClone(v13Phase13));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(13);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // Fifteen cards, four banked toward the Corsair set, the free daily card spent, and a
    // pattern the ten-card spread's track paid out.
    expect(result.save.gacha.rolls).toBe(15);
    expect(result.save.gacha.weeklyPity).toBe(4);
    expect(result.save.gacha.weeklyPitySet).toBe('corsair-kings-finery');
    expect(result.save.gacha.freeRollsToday).toBe(1);
    expect(result.save.gacha.history).toHaveLength(15);
    expect(result.save.forge.recipes).toHaveLength(1);
  });

  it('hands a Phase 13 player the pets their history already earned', () => {
    const result = migrateSave(structuredClone(v13Phase13));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    /*
     * The one migration in the chain that is *not* empty-handed, and it did not have to grant
     * anything to manage it. Ownership is derived from the facts that earn each pet, and this
     * save has been five floors into the Rat Cellars since Phase 11 — so the Ember Pup is simply
     * there, with no back-fill and no reconciliation.
     */
    expect(result.save.dungeons.progress['rat-cellars']?.floorsCleared).toBe(5);
    expect(ownedPets(result.save).map((entry) => entry.id)).toContain('ember-pup');

    // What the slice actually adds is progress, and that genuinely starts at nothing.
    expect(result.save.pets).toEqual(DEFAULT_PETS);
    expect(result.save.activity.zoneMissions).toEqual({});
    // And nothing else moved.
    expect(result.save.hero?.name).toBe('Bryn Halloway');
    expect(result.save.hero?.classId).toBe('swashbuckler');
  });

  it('opens a Phase 14 (v14) save with a fed companion at its side', () => {
    const result = migrateSave(structuredClone(v14Phase14));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(14);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // Three feeds into an Ember Pup, walking beside them, with two zones counted.
    expect(result.save.pets.progress['ember-pup']).toEqual({
      level: 4,
      rarity: 'common',
      fedToday: 3,
    });
    expect(result.save.pets.activeId).toBe('ember-pup');
    expect(result.save.activity.zoneMissions['ember-caves']).toBe(12);
  });

  it('starts a Phase 14 player’s ledger at nothing, rather than inventing attendance', () => {
    const result = migrateSave(structuredClone(v14Phase14));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    /*
     * The tempting migration is the wrong one. This player has logged in on plenty of days, and
     * the save has never recorded which — so any starting square would be invented rather than
     * earned. Day 28 grants a pet, which would make an invented number into a fabricated fact in
     * a system whose whole premise is that ownership comes from things that really happened.
     */
    expect(result.save.calendar).toEqual(DEFAULT_CALENDAR);
    expect(result.save.tasks).toEqual(DEFAULT_TASKS);
    expect(ownedPets(result.save).map((entry) => entry.id)).not.toContain('moss-tortoise');
    expect(ownedPets(result.save).map((entry) => entry.id)).not.toContain('coin-toad');

    // And the Menagerie it arrived with is untouched.
    expect(result.save.pets.activeId).toBe('ember-pup');
    expect(result.save.hero?.name).toBe('Bryn Halloway');
  });

  it('opens a Phase 15 (v15) save with a day’s work behind it', () => {
    const result = migrateSave(structuredClone(v15Phase15));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(15);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // A cleared board, a claimed chest and a marked ledger.
    expect(result.save.tasks.totalChests).toBe(1);
    expect(result.save.tasks.claimsThisWeek).toBe(1);
    expect(result.save.calendar.day).toBe(1);
    expect(result.save.calendar.lastStampedDay).toBe('2026-07-30');
  });

  it('does not walk a fifteen-phase-old save through its first contract', () => {
    const result = migrateSave(structuredClone(v15Phase15));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    /*
     * The one place the onboarding migration takes a position. Ten of the twelve beats would
     * skip themselves — they are derived from facts this save already holds — but the two
     * `'read'` beats cannot be, because nothing in a save proves somebody has *looked* at the
     * Crier. Without the flag a veteran gets two spotlights out of nowhere.
     */
    expect(result.save.tutorial.optedOut).toBe(true);
    expect(activeBeat(result.save)).toBeNull();
    expect(tutorialComplete(result.save)).toBe(true);
  });

  it('gives a save with no hero the real tutorial', () => {
    // A v1 walking-skeleton save has never had a hero, so it has not started — and the whole
    // point of the opt-out is that it is for people who *have*.
    const result = migrateSave(structuredClone(v1Phase0));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.hero).toBeNull();
    expect(result.save.tutorial).toEqual(DEFAULT_TUTORIAL);
  });

  it('is idempotent — re-migrating an already-current save changes nothing', () => {
    const once = migrateSave(structuredClone(v1Phase0));
    expect(once.ok).toBe(true);
    if (!once.ok) return;

    const twice = migrateSave(structuredClone(once.save));
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;

    expect(twice.save).toEqual(once.save);
    expect(twice.migratedFrom).toBeNull();
  });
});
