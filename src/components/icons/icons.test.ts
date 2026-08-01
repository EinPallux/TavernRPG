/**
 * The icon census — artwork, attribution and the shape of the generated module.
 *
 * Two of the three things checked here are licence obligations, not tidiness. game-icons.net is
 * **CC BY 3.0 per icon, per artist**, so the set of authors whose work ships is a legal fact about
 * the build, and CREDITS.md's table of them has to be derived from the artwork rather than
 * maintained beside it. This file is what derives it: the counts in the document are checked
 * against the files on disk, so a sixth artist cannot arrive quietly and a departed one cannot
 * linger. The previous version of that section was a *promise* to keep a list, kept for sixteen
 * phases without a list existing.
 *
 * The third thing is the sliver bug. The first conversion rounded path coordinates to integers to
 * halve the payload, which destroyed every drawing — SVG path data is compact, so `10.5.75` is two
 * numbers, and a `\d+\.\d+` regex eats the first and leaves the second glued on. Typecheck, lint
 * and the production build all passed; a screenshot found it. The `d` string in the generated
 * module is therefore asserted **byte-identical** to the `d` in the vendored file, because "the
 * artwork survived the pipeline" is not something any other gate in this repo can see.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICON_IDS, type IconId } from '@/data/icons';
import { ART_CREDITS } from '@/data/credits';
import { VENDORED_AUTHORS, VENDORED_ICONS, type VendoredIcon } from './vendored';

const VENDOR = join(process.cwd(), 'game_assets', 'icons');
const DOC = readFileSync(join(process.cwd(), 'CREDITS.md'), 'utf8');
const REGISTRY = readFileSync(join(process.cwd(), 'src/components/icons/index.tsx'), 'utf8');

/** The one id with no drawing behind it — a chevron is a direction, not a thing. */
const IN_HOUSE: readonly IconId[] = ['chevron'];

const entries = Object.entries(VENDORED_ICONS) as [IconId, VendoredIcon][];

/** Every `<name>.svg` on disk, by author, which is the licence-bearing source of truth. */
function onDisk(): Map<string, string[]> {
  const byAuthor = new Map<string, string[]>();
  for (const author of readdirSync(VENDOR)) {
    if (!statSync(join(VENDOR, author)).isDirectory()) continue;
    const files = readdirSync(join(VENDOR, author))
      .filter((file) => file.endsWith('.svg'))
      .map((file) => file.replace(/\.svg$/, ''));
    if (files.length > 0) byAuthor.set(author, files.sort());
  }
  return byAuthor;
}

describe('every icon id resolves to something drawn', () => {
  it('covers the whole vocabulary with no id left over', () => {
    const drawn = new Set<string>([...Object.keys(VENDORED_ICONS), ...IN_HOUSE]);
    for (const id of ICON_IDS) {
      expect(drawn.has(id), `${id} has no icon`).toBe(true);
    }
    // The other direction: a vendored drawing nothing references is 1.5 KB of dead payload and a
    // credit line for artwork the player never sees.
    for (const id of Object.keys(VENDORED_ICONS)) {
      expect(ICON_IDS as readonly string[], `${id} is vendored but not an IconId`).toContain(id);
    }
    expect(entries.length + IN_HOUSE.length).toBe(ICON_IDS.length);
  });

  it('keeps the two hand-drawn glyphs hand-drawn', () => {
    // Not a style preference — see the module header in index.tsx. Both would get *worse* as
    // artwork, so the registry is asserted to still splice them in rather than map them.
    expect(REGISTRY).toContain('chevron: ChevronIcon');
    expect(REGISTRY).toContain('export function VigorTankard');
  });
});

describe('the artwork survived the pipeline', () => {
  it('carries the vendored path through byte for byte', () => {
    for (const [id, icon] of entries) {
      const file = readFileSync(join(VENDOR, icon.author, `${icon.name}.svg`), 'utf8');
      const paths = [...file.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((match) => match[1]!);
      const artwork = paths.filter((d) => d !== 'M0 0h512v512H0z');
      expect(artwork, `${id}: ${icon.name}.svg should hold one drawing`).toHaveLength(1);
      expect(icon.d, `${id}: the generated path is not the vendored path`).toBe(artwork[0]);
    }
  });

  it('drops the preview backing and keeps nothing that paints a square', () => {
    for (const [id, icon] of entries) {
      expect(icon.d, `${id} still has the site's black backing behind it`).not.toContain(
        'M0 0h512v512H0z',
      );
      // The sliver bug produced valid-looking short paths. A real 512-grid drawing is not 40 bytes.
      expect(icon.d.length, `${id} is suspiciously small for a 512-grid drawing`).toBeGreaterThan(
        80,
      );
    }
  });

  it('stays within a sane payload', () => {
    // ~105 KB of path data against a 400 KB shared-chunk budget (perf-pass.mjs). Recorded as a
    // band so a careless mapping — a 40 KB filigree drawing for a 20px nav glyph — is visible.
    const kb = entries.reduce((sum, [, icon]) => sum + icon.d.length, 0) / 1024;
    expect(kb).toBeGreaterThan(60);
    expect(kb, 'the icon payload has grown — check what was added').toBeLessThan(160);
  });
});

describe('the CC BY 3.0 credit is derived from what ships', () => {
  const disk = onDisk();

  it('vendors nothing it does not use, and uses nothing it did not vendor', () => {
    const used = new Set(entries.map(([, icon]) => `${icon.author}/${icon.name}`));
    const stored = new Set(
      [...disk].flatMap(([author, names]) => names.map((name) => `${author}/${name}`)),
    );
    expect(
      [...stored].filter((file) => !used.has(file)),
      'orphaned SVGs',
    ).toEqual([]);
    expect(
      [...used].filter((file) => !stored.has(file)),
      'missing SVGs',
    ).toEqual([]);
  });

  it('names every artist in CREDITS.md and on the credits screen', () => {
    // `VENDORED_AUTHORS` is the directory name; the credit is the person. Both have to be
    // reachable from the other or the licence is discharged against nobody.
    const display: Record<string, string> = {
      'carl-olsen': 'Carl Olsen',
      delapouite: 'Delapouite',
      lorc: 'Lorc',
      skoll: 'Skoll',
      willdabeast: 'Willdabeast',
    };
    const credited = ART_CREDITS.filter((entry) => entry.licence === 'cc-by-3').map(
      (entry) => entry.source,
    );

    for (const author of VENDORED_AUTHORS) {
      const name = display[author];
      expect(name, `${author} ships artwork but has no credit name — add one`).toBeDefined();
      expect(DOC, `${name} is not in the CREDITS.md table`).toContain(name!);
      expect(
        credited.some((source) => source.startsWith(name!)),
        `${name} is not on the in-game credits screen`,
      ).toBe(true);
    }
    expect(credited).toHaveLength(VENDORED_AUTHORS.length);
  });

  it('states each artist’s real count', () => {
    /*
     * The row that goes stale. A table of names survives any change; a table of *counts* fails
     * the moment one icon is remapped, which is the point — the count is what tells a reader the
     * list was checked rather than copied.
     */
    for (const [author, names] of disk) {
      const shipped = entries.filter(([, icon]) => icon.author === author);
      expect(shipped, `${author} ships nothing`).toHaveLength(names.length);
      const row = DOC.split('\n').find(
        (line) => line.startsWith('| **') && line.toLowerCase().includes(author.replace('-', ' ')),
      );
      expect(row, `${author} has no row in the CREDITS.md table`).toBeDefined();
      expect(row, `${author}'s row does not state ${names.length}`).toMatch(
        new RegExp(`\\|\\s*${names.length}\\s*\\|`),
      );
      for (const name of names) {
        expect(row, `${author}'s row omits ${name}`).toContain(name);
      }
    }
  });

  it('states the same count on the credits screen', () => {
    // The third copy of the number, and the one with no reader to notice it drifting: the in-game
    // entry opens "43 icons — …". Two copies of a number is the mistake this codebase has made
    // with guild bounties and forge odds; a third is not better for being prose.
    for (const entry of ART_CREDITS.filter((credit) => credit.licence === 'cc-by-3')) {
      const author = entry.source.split(' (')[0]!;
      const claimed = Number(/^(\d+) icons?/.exec(entry.what)?.[1]);
      expect(claimed, `${author}'s entry should open with its icon count`).not.toBeNaN();
      const shipped = entries.filter(
        ([, icon]) => icon.author.replace(/-/g, ' ') === author.toLowerCase(),
      );
      expect(shipped.length, `the credits screen says ${author} drew ${claimed}`).toBe(claimed);
    }
  });

  it('ships the upstream licence next to the artwork', () => {
    // "The licence travels with the work" is the whole of CC BY's notice requirement, and a
    // README link is not a copy. The upstream file also *is* the list of author URLs.
    const licence = readFileSync(join(VENDOR, 'LICENSE.txt'), 'utf8');
    expect(licence).toMatch(/Creative Commons 3\.0 BY/i);
    expect(licence).toContain('game-icons.net');
    for (const author of VENDORED_AUTHORS) {
      const name = author.replace(/-/g, ' ');
      expect(licence.toLowerCase(), `${author} is not in the upstream notice`).toContain(name);
    }
  });
});
