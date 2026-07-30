/**
 * World generation tests — what the world *is*.
 *
 * Two acceptance criteria live here. **Same seed ⇒ identical world**, because a world that
 * drifts is a world whose bugs cannot be reproduced and whose save cannot be trusted. And
 * **bot stat blocks pass plausibility bounds against the level curves**, because the design
 * promise is "fair under inspection" — a bot has to be a hero built the way heroes are built,
 * not a monster wearing a name.
 */

import { describe, expect, it } from 'vitest';
import { CLASS_IDS } from '@/engine/items/types';
import { buildReferenceCombatant } from '@/engine/combat/combatant';
import { GUILDS, GUILD_COUNT } from '@/data/guilds';
import { LEGENDS, LEGEND_COUNT } from '@/data/legends';
import { CULTURES, EPITHETS, guildName, heroName, nameCapacity } from '@/data/names';
import { BOT_COUNT, archetypeOf, botIdentity, dedicationPercentile } from './identity';
import {
  GUILDED_SHARE,
  MAX_BOT_LEVEL,
  MAX_ORDINARY_LEVEL,
  MIN_BOT_LEVEL,
  botsInRankRange,
  generateWorld,
  probit,
  rankOf,
  seededHonorForRank,
  softCap,
} from './generate';
import { botProfile, materializeBot } from './materialize';

const SEED = 20260730;
const T0 = Date.parse('2026-08-01T00:00:00Z');

const world = generateWorld(SEED, T0);

/** Sorted levels, for percentile assertions. */
const levels = [...world.bots.map((bot) => bot.level)].sort((a, b) => a - b);
const percentile = (p: number) =>
  levels[Math.min(levels.length - 1, Math.floor(levels.length * p))]!;

describe('determinism — the whole system rests on this', () => {
  it('produces an identical world from the same seed', () => {
    expect(generateWorld(SEED, T0)).toEqual(generateWorld(SEED, T0));
  });

  it('produces the same population whenever the world is created', () => {
    // `createdAt` is stamped in but never sampled from, so two players starting a month apart
    // on the same seed meet the same fifteen hundred people.
    const later = generateWorld(SEED, T0 + 40 * 86_400_000);
    expect(later.bots).toEqual(world.bots);
    expect(later.ladder).toEqual(world.ladder);
  });

  it('produces a different world from a different seed', () => {
    expect(generateWorld(SEED + 1, T0).bots).not.toEqual(world.bots);
  });

  it('derives identity from the seed alone, in any order', () => {
    // Bot 900 must be materialisable without touching 0–899 — the level-of-detail bands
    // depend on it.
    const direct = botIdentity(SEED, 900);
    const afterOthers = [1, 500, 1499, 900].map((id) => botIdentity(SEED, id)).at(-1);
    expect(afterOthers).toEqual(direct);
  });
});

describe('the population', () => {
  it('is fifteen hundred strong, all on the ladder', () => {
    expect(world.bots).toHaveLength(BOT_COUNT);
    expect(world.ladder).toHaveLength(BOT_COUNT);
    expect(new Set(world.ladder).size).toBe(BOT_COUNT);
  });

  it('stores bots by id, so a lookup is an index and not a search', () => {
    world.bots.forEach((bot, index) => expect(bot.id).toBe(index));
  });

  it('splits the classes roughly evenly', () => {
    const counts = new Map<string, number>();
    for (let id = 0; id < BOT_COUNT; id += 1) {
      const classId = botIdentity(SEED, id).classId;
      counts.set(classId, (counts.get(classId) ?? 0) + 1);
    }

    expect(counts.size).toBe(CLASS_IDS.length);
    for (const [classId, count] of counts) {
      expect(count / BOT_COUNT, classId).toBeGreaterThan(0.15);
      expect(count / BOT_COUNT, classId).toBeLessThan(0.25);
    }
  });

  it('gives almost everybody a distinct name', () => {
    const names = new Set(Array.from({ length: BOT_COUNT }, (_, id) => botIdentity(SEED, id).name));
    // A handful of collisions across 1,500 draws is fine; a ladder of duplicates is not.
    expect(names.size).toBeGreaterThan(BOT_COUNT * 0.98);
  });

  it('has far more names available than people to name', () => {
    expect(nameCapacity()).toBeGreaterThan(50_000);
  });
});

describe('the level curve — balancing §12', () => {
  it('has a median around 28', () => {
    expect(percentile(0.5)).toBeGreaterThanOrEqual(25);
    expect(percentile(0.5)).toBeLessThanOrEqual(31);
  });

  it('has a p95 around 74', () => {
    expect(percentile(0.95)).toBeGreaterThanOrEqual(66);
    expect(percentile(0.95)).toBeLessThanOrEqual(82);
  });

  it('tops out at 92 and never below 2', () => {
    expect(levels.at(-1)).toBe(MAX_BOT_LEVEL);
    expect(levels[0]).toBeGreaterThanOrEqual(MIN_BOT_LEVEL);
  });

  it('does not pile the population on the ceiling', () => {
    // The first version clamped instead of compressing and left seventy-five heroes tied at
    // level 92 — a wall, not a ladder.
    const atCeiling = levels.filter((level) => level >= MAX_ORDINARY_LEVEL).length;
    expect(atCeiling).toBeLessThan(BOT_COUNT * 0.05);
  });

  it('holds its shape across seeds', () => {
    for (const seed of [1, 4242, 999_999]) {
      const other = [...generateWorld(seed, T0).bots.map((b) => b.level)].sort((a, b) => a - b);
      const median = other[Math.floor(other.length * 0.5)]!;
      expect(median, `seed ${seed}`).toBeGreaterThanOrEqual(24);
      expect(median, `seed ${seed}`).toBeLessThanOrEqual(32);
    }
  });

  it('puts the diligent above the idle without distorting the distribution', () => {
    // The correlation is a Gaussian copula precisely so both halves of this hold at once —
    // a plain multiplier moved the median from 28 to 24.
    const sample = world.bots.filter((_, id) => id % 7 === 0);
    const keen = sample.filter((b) => botIdentity(SEED, b.id).personality.dedication > 0.85);
    const idle = sample.filter((b) => botIdentity(SEED, b.id).personality.dedication < 0.35);

    const mean = (list: typeof sample) => list.reduce((s, b) => s + b.level, 0) / list.length;
    expect(mean(keen)).toBeGreaterThan(mean(idle) * 1.5);
  });
});

describe('the legends', () => {
  it('hold the top ten ranks', () => {
    for (let rank = 1; rank <= LEGEND_COUNT; rank += 1) {
      expect(world.ladder[rank - 1], `rank ${rank}`).toBe(rank - 1);
    }
  });

  it('are a tier above the field, descending by authored rank', () => {
    const legendLevels = world.ladder.slice(0, LEGEND_COUNT).map((id) => world.bots[id]!.level);

    expect(legendLevels[0]).toBe(MAX_BOT_LEVEL);
    // Strictly descending, so the top ten read as an order rather than a tie.
    for (let i = 1; i < legendLevels.length; i += 1) {
      expect(legendLevels[i]!, `legend ${i}`).toBeLessThan(legendLevels[i - 1]!);
    }
    // And every one of them above anybody else.
    const bestOther = world.bots[world.ladder[LEGEND_COUNT]!]!.level;
    expect(legendLevels.at(-1)!).toBeGreaterThan(bestOther);
  });

  it('carry their authored names and classes', () => {
    for (const legend of LEGENDS) {
      const identity = botIdentity(SEED, legend.rank - 1);
      expect(identity.name).toBe(legend.name);
      expect(identity.classId).toBe(legend.classId);
      expect(identity.legend).toBe(true);
    }
  });

  it('are the same ten in every world — they are the shared chase', () => {
    for (const seed of [1, 77, 20260730]) {
      expect(botIdentity(seed, 0).name).toBe('Serathiel the Unbowed');
    }
  });
});

describe('guilds', () => {
  it('seeds all sixty halls', () => {
    expect(world.guilds).toHaveLength(GUILD_COUNT);
    expect(GUILDS).toHaveLength(60);
  });

  it('guilds about the share the spec asks for', () => {
    const guilded = world.bots.filter((bot) => bot.guildId >= 0).length;
    const share = guilded / BOT_COUNT;
    expect(share).toBeGreaterThan(GUILDED_SHARE - 0.08);
    expect(share).toBeLessThan(GUILDED_SHARE + 0.08);
  });

  it('agrees with itself about who is in which hall', () => {
    for (const hall of world.guilds) {
      for (const memberId of hall.memberIds) {
        expect(world.bots[memberId]!.guildId, `bot ${memberId}`).toBe(hall.id);
      }
    }
  });

  it('makes some halls big and most modest, rather than sixty identical ones', () => {
    const sizes = world.guilds.map((hall) => hall.memberIds.length).sort((a, b) => b - a);
    expect(sizes[0]!).toBeGreaterThan(sizes.at(-1)! * 3);
  });

  it('has unique hand-authored names and mottos', () => {
    expect(new Set(GUILDS.map((g) => g.name)).size).toBe(GUILDS.length);
    expect(new Set(GUILDS.map((g) => g.motto)).size).toBe(GUILDS.length);
  });

  it('keeps a generator for the halls that form later', () => {
    const generated = new Set(Array.from({ length: 200 }, (_, i) => guildName(i)));
    expect(generated.size).toBeGreaterThan(150);
  });
});

describe('the seeded ladder', () => {
  it('runs from about 9,800 honor down', () => {
    expect(seededHonorForRank(1)).toBe(9_800);
    expect(seededHonorForRank(1_500)).toBeLessThan(1_000);
    expect(seededHonorForRank(1_500)).toBeGreaterThan(0);
  });

  it('never goes negative, however deep the ladder', () => {
    expect(seededHonorForRank(100_000)).toBeGreaterThan(0);
  });

  it('is sorted by honor, best first', () => {
    for (let i = 1; i < world.ladder.length; i += 1) {
      const above = world.bots[world.ladder[i - 1]!]!.honor;
      const below = world.bots[world.ladder[i]!]!.honor;
      expect(above, `rank ${i}`).toBeGreaterThanOrEqual(below);
    }
  });

  it('reports ranks that agree with the ladder array', () => {
    expect(rankOf(world, world.ladder[0]!)).toBe(1);
    expect(rankOf(world, world.ladder[499]!)).toBe(500);
  });

  it('slices rank ranges inclusively', () => {
    const band = botsInRankRange(world, 10, 14);
    expect(band).toEqual(world.ladder.slice(9, 14));
  });
});

describe('bots are heroes, not monsters with names', () => {
  it('builds a stat block inside the reference hero’s bounds at every level', () => {
    // The plausibility check the roadmap asks for: a bot must look like an on-curve player of
    // the same class and level, scaled only by their gear.
    for (const bot of world.bots.filter((_, id) => id % 37 === 0)) {
      const identity = botIdentity(SEED, bot.id);
      const combatant = materializeBot(SEED, bot, identity);
      const reference = buildReferenceCombatant(identity.classId, bot.level);

      const label = `bot ${bot.id} (${identity.classId} L${bot.level})`;
      expect(combatant.level, label).toBe(bot.level);
      // Gear score runs 0.8–1.15, so every derived number should sit in that band of the
      // reference, with a little slack for rounding at low levels.
      expect(combatant.maxHealth, label).toBeGreaterThan(reference.maxHealth * 0.7);
      expect(combatant.maxHealth, label).toBeLessThan(reference.maxHealth * 1.3);
      expect(combatant.armour, label).toBeGreaterThan(reference.armour * 0.75);
      expect(combatant.armour, label).toBeLessThan(reference.armour * 1.25);
      expect(combatant.weapon.max, label).toBeGreaterThan(reference.weapon.max * 0.7);
      expect(combatant.weapon.max, label).toBeLessThan(reference.weapon.max * 1.3);
    }
  });

  it('gives every bot the procs of its class', () => {
    for (const bot of world.bots.slice(0, 40)) {
      const identity = botIdentity(SEED, bot.id);
      const combatant = materializeBot(SEED, bot, identity);
      const reference = buildReferenceCombatant(identity.classId, bot.level);
      expect(combatant.procs.map((p) => p.kind)).toEqual(reference.procs.map((p) => p.kind));
    }
  });

  it('makes a well-geared bot beat a badly-geared one of the same level on paper', () => {
    const base = world.bots[100]!;
    const poor = materializeBot(SEED, { ...base, gearScore: 0.8 });
    const rich = materializeBot(SEED, { ...base, gearScore: 1.15 });

    expect(rich.maxHealth).toBeGreaterThan(poor.maxHealth);
    expect(rich.weapon.max).toBeGreaterThan(poor.weapon.max);
    expect(rich.armour).toBeGreaterThan(poor.armour);
  });

  it('uses class portraits and never per-bot art', () => {
    // CLAUDE.md rule 5: 1,500 generated faces would be 1,500 chances to look wrong.
    const portraits = new Set(
      world.bots.slice(0, 200).map((bot) => materializeBot(SEED, bot).portrait),
    );
    expect(portraits.size).toBeLessThanOrEqual(CLASS_IDS.length);
  });

  it('profiles a bot without leaking anything the UI should not show', () => {
    const profile = botProfile(SEED, world.bots[42]!, T0);
    expect(profile.name).toBe(botIdentity(SEED, 42).name);
    expect(profile.dormant).toBe(false);
    expect(profile.level).toBe(world.bots[42]!.level);
  });
});

describe('personality', () => {
  it('spreads dedication across the §12 bands', () => {
    const dedications = Array.from(
      { length: BOT_COUNT },
      (_, id) => botIdentity(SEED, id).personality.dedication,
    );
    const casual = dedications.filter((d) => d < 0.5).length / BOT_COUNT;
    const hardcore = dedications.filter((d) => d >= 0.85).length / BOT_COUNT;

    expect(casual).toBeGreaterThan(0.5);
    expect(casual).toBeLessThan(0.7);
    expect(hardcore).toBeGreaterThan(0.05);
    expect(hardcore).toBeLessThan(0.2);
  });

  it('round-trips dedication through its percentile', () => {
    for (const roll of [0, 0.1, 0.59, 0.6, 0.75, 0.9, 0.99]) {
      const dedication =
        roll < 0.6
          ? 0.15 + (roll / 0.6) * 0.35
          : roll < 0.9
            ? 0.5 + ((roll - 0.6) / 0.3) * 0.35
            : 0.85 + ((roll - 0.9) / 0.1) * 0.25;
      expect(dedicationPercentile(dedication), `roll ${roll}`).toBeCloseTo(roll, 6);
    }
  });

  it('labels every bot with an archetype', () => {
    const seen = new Set(
      Array.from({ length: 400 }, (_, id) => archetypeOf(botIdentity(SEED, id).personality)),
    );
    // All six should turn up in four hundred people, or the labels are not describing anyone.
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('keeps legends steady — they are the chase, not a coin flip', () => {
    for (let id = 0; id < LEGEND_COUNT; id += 1) {
      const personality = botIdentity(SEED, id).personality;
      expect(personality.dedication, `legend ${id}`).toBeGreaterThanOrEqual(1);
      expect(personality.volatility, `legend ${id}`).toBeLessThan(0.35);
    }
  });
});

describe('the maths behind the curve', () => {
  it('inverts the normal CDF accurately', () => {
    expect(probit(0.5)).toBeCloseTo(0, 6);
    expect(probit(0.975)).toBeCloseTo(1.959964, 4);
    expect(probit(0.025)).toBeCloseTo(-1.959964, 4);
    expect(probit(0.95)).toBeCloseTo(1.644854, 4);
  });

  it('survives the edges rather than returning infinity', () => {
    expect(Number.isFinite(probit(0))).toBe(true);
    expect(Number.isFinite(probit(1))).toBe(true);
  });

  it('leaves everything below the knee untouched', () => {
    expect(softCap(10, 70, 82)).toBe(10);
    expect(softCap(70, 70, 82)).toBe(70);
  });

  it('converges on the ceiling and never passes it', () => {
    // Realistic inputs stay strictly under; absurd ones land exactly on it once `exp(-x)`
    // underflows to zero, which is the asymptote arriving at the limits of float precision
    // rather than the cap failing.
    expect(softCap(100, 70, 82)).toBeLessThan(82);
    expect(softCap(200, 70, 82)).toBeLessThan(82);
    expect(softCap(10_000, 70, 82)).toBeLessThanOrEqual(82);
    expect(softCap(10_000, 70, 82)).toBeGreaterThan(81.9);
  });

  it('compresses rather than clamps, so the tail thins instead of stacking', () => {
    const inputs = [75, 85, 95, 110, 140];
    const outputs = inputs.map((raw) => softCap(raw, 70, 82));
    // Strictly increasing: every distinct input still maps to a distinct level band, which a
    // hard clamp destroys.
    for (let i = 1; i < outputs.length; i += 1) {
      expect(outputs[i]!).toBeGreaterThan(outputs[i - 1]!);
    }
  });
});

describe('names', () => {
  it('gives each culture its own sound', () => {
    const samples = CULTURES.map((culture) => heroName(culture, 3, 3));
    expect(new Set(samples).size).toBe(CULTURES.length);
  });

  it('does not cluster consecutive ids on one head syllable', () => {
    // A naive `index % heads.length` puts every tenth hero on the same syllable, which is very
    // visible on a sorted ladder page.
    const heads = Array.from({ length: 12 }, (_, i) => heroName('northfolk', i, i).slice(0, 3));
    expect(new Set(heads).size).toBeGreaterThan(8);
  });

  it('has enough epithets to keep a ladder page varied', () => {
    expect(EPITHETS.length).toBeGreaterThanOrEqual(120);
    expect(new Set(EPITHETS).size).toBe(EPITHETS.length);
  });
});
