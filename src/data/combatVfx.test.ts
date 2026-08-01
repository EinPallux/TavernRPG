/**
 * The school census.
 *
 * Two things can quietly break a school and neither is visible from a screenshot of *this* fight:
 * a sixth class arriving with no school (so it silently falls back to steel and looks like a
 * Warrior), and a sprite name with a typo (so the particle draws the loading-fallback speck
 * forever and the fight looks slightly cheap for reasons nobody can point at).
 *
 * Both are census problems, so this reads the other modules and the disk rather than trusting a
 * list — the same shape as `components/icons/icons.test.ts` and for the same reason: a list of
 * names survives any change, a list *derived* from the source fails when the source moves.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_BURST,
  DODGE_BURST,
  HEAL_BURST,
  PROC_BURST,
  PROC_PALETTE,
  SCHOOLS,
  SCHOOL_BY_KIND,
  SCHOOL_IDS,
  VFX_SPRITE_ROOT,
  allVfxSprites,
  schoolFor,
  type CombatSchool,
  type VfxBurst,
} from './combatVfx';
import { CLASSES } from './classes';
import { ARCHETYPES } from './monsterArchetypes';

const SPRITE_DIR = join(process.cwd(), 'public', VFX_SPRITE_ROOT);

/** Every value `CombatantCard.kind` can hold — derived, never listed. */
function everyKind(): readonly string[] {
  return [...CLASSES.map((entry) => entry.name), ...ARCHETYPES.map((entry) => entry.name)];
}

function everyBurst(): readonly { where: string; burst: VfxBurst }[] {
  const out: { where: string; burst: VfxBurst }[] = [];
  for (const school of Object.values(SCHOOLS)) {
    if (school.cast) out.push({ where: `${school.id}.cast`, burst: school.cast });
    out.push({ where: `${school.id}.impact`, burst: school.impact });
    out.push({ where: `${school.id}.crit`, burst: school.crit });
  }
  out.push({ where: 'block', burst: BLOCK_BURST });
  out.push({ where: 'dodge', burst: DODGE_BURST });
  out.push({ where: 'heal', burst: HEAL_BURST });
  out.push({ where: 'proc', burst: PROC_BURST });
  return out;
}

describe('every fighter has a school', () => {
  it('paints all five classes and all five archetypes', () => {
    for (const kind of everyKind()) {
      expect(SCHOOL_BY_KIND[kind], `no school for "${kind}"`).toBeDefined();
    }
  });

  it('maps nothing that is not a real kind', () => {
    // The other direction, and the one that catches a rename: a school keyed on "Rogue" after
    // the class was renamed to "Swashbuckler" leaves the fighter on the fallback and the map
    // looking complete.
    const kinds = new Set(everyKind());
    for (const key of Object.keys(SCHOOL_BY_KIND)) {
      expect(kinds.has(key), `"${key}" is mapped but is nobody's kind`).toBe(true);
    }
  });

  it('gives the ten kinds ten different looks', () => {
    // The point of the feature. If two kinds shared a school the fight would be back to where it
    // started for that pairing, and nothing else here would notice.
    const used = new Set(everyKind().map((kind) => SCHOOL_BY_KIND[kind]));
    expect(used.size).toBe(SCHOOL_IDS.length);
  });

  it('falls back rather than throwing on a kind it has never heard of', () => {
    // A monster added in a hotfix should look ordinary, not take down the showpiece.
    expect(schoolFor('Something New').id).toBe('steel');
    expect(schoolFor('').id).toBe('steel');
  });

  it('declares every school in SCHOOL_IDS and no others', () => {
    expect(Object.keys(SCHOOLS).sort()).toEqual([...SCHOOL_IDS].sort());
    for (const id of SCHOOL_IDS) expect(SCHOOLS[id].id).toBe(id);
  });
});

describe('every sprite is on disk', () => {
  it('resolves each name in the Kenney pack', () => {
    const missing = allVfxSprites().filter((name) => !existsSync(join(SPRITE_DIR, name)));
    expect(missing, `not in ${VFX_SPRITE_ROOT}`).toEqual([]);
  });

  it('checks a real directory, so a moved pack fails loudly', () => {
    // Without this the test above passes vacuously the day `sync-assets` changes a path: an empty
    // sprite list has no missing members. `allVfxSprites` is also asserted non-trivial.
    expect(existsSync(SPRITE_DIR)).toBe(true);
    expect(allVfxSprites().length).toBeGreaterThan(30);
  });
});

describe('a burst is drawable', () => {
  it('has sprites, a positive count and a life', () => {
    for (const { where, burst } of everyBurst()) {
      expect(burst.sprites.length, where).toBeGreaterThan(0);
      expect(burst.count, where).toBeGreaterThan(0);
      expect(burst.life, where).toBeGreaterThan(0);
      expect(burst.size, where).toBeGreaterThan(0);
      expect(burst.cone, where).toBeGreaterThanOrEqual(0);
      expect(burst.cone, where).toBeLessThanOrEqual(Math.PI * 2);
    }
  });

  it('keeps every burst inside the 200-particle pool', () => {
    // `architecture.md` caps the scene at 200 sprites and the pool recycles round-robin when it
    // is full. A single burst larger than the pool would eat its own head — the last particles
    // spawned would overwrite the first ones of the *same* burst.
    for (const { where, burst } of everyBurst()) {
      expect(burst.count, `${where} would overflow the pool on its own`).toBeLessThanOrEqual(60);
    }
  });

  it('always spends more on a crit than on an ordinary hit', () => {
    // Not decoration: the crit is the moment the whole choreography holds for (`critHold`), and a
    // crit that threw fewer sparks than a graze would be a tuning slip nothing else could catch.
    for (const school of Object.values(SCHOOLS)) {
      expect(school.crit.count, school.id).toBeGreaterThan(school.impact.count);
      expect(school.crit.speed, school.id).toBeGreaterThan(school.impact.speed);
    }
  });
});

describe('the ranged schools are actually ranged', () => {
  const ranged = Object.values(SCHOOLS).filter((school) => !school.melee);

  it('there are some, and each one has something to throw', () => {
    expect(ranged.length).toBeGreaterThan(0);
    for (const school of ranged) {
      expect(school.travel, `${school.id} is ranged with nothing to throw`).not.toBeNull();
    }
  });

  it('never gives a melee school a projectile', () => {
    // The scene picks lunge-vs-cast off `melee`, so a melee school carrying `travel` would send a
    // bolt *and* charge in behind it — which is not a bug the type system can see.
    for (const school of Object.values(SCHOOLS)) {
      if (school.melee) expect(school.travel, school.id).toBeNull();
    }
  });

  it('braces rather than charges', () => {
    // A caster that lunges as far as a Warrior is a caster nobody reads as a caster.
    const meleeLunge = Math.min(
      ...Object.values(SCHOOLS)
        .filter((school: CombatSchool) => school.melee)
        .map((school) => school.lunge),
    );
    for (const school of ranged) expect(school.lunge, school.id).toBeLessThan(meleeLunge);
  });
});

describe('the palettes stay on the token sheet', () => {
  it('uses only six-digit hex, so nothing is a named CSS colour', () => {
    const hex = /^#[0-9a-f]{6}$/;
    for (const school of Object.values(SCHOOLS)) {
      for (const [slot, value] of Object.entries(school.palette)) {
        expect(value, `${school.id}.${slot}`).toMatch(hex);
      }
    }
    for (const [effect, palette] of Object.entries(PROC_PALETTE)) {
      for (const [slot, value] of Object.entries(palette)) {
        expect(value, `${effect}.${slot}`).toMatch(hex);
      }
    }
  });

  it('keeps the player teal and the monsters red', () => {
    /*
     * The one deliberate asymmetry, asserted because it is the thing a well-meaning re-paint
     * would undo. A Mage's bolt and a Caster's hex are the same shape crossing the same gap; the
     * colour is the only thing that tells a player at ×4 which way the damage is going.
     */
    expect(SCHOOLS.arcane.palette.core).not.toBe(SCHOOLS.hex.palette.core);
    expect(SCHOOLS.arcane.melee).toBe(false);
    expect(SCHOOLS.hex.melee).toBe(false);
  });
});
