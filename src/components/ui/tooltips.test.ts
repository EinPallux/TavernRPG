import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No native browser tooltips (style guide §8.1).
 *
 * A `title` attribute is the one piece of another product's interface the game cannot restyle: a
 * grey OS rectangle, in a system font, after a second and a half, on hover only and never on
 * focus. `components/ui/Tooltip.tsx` replaced all twenty-six of them, and this is what stops the
 * twenty-seventh: `title=` is the easiest thing in the world to type, and it *works*, so nothing
 * fails when somebody adds one back — it just quietly looks like Windows again in one corner.
 *
 * A source-reading audit rather than a behavioural one, for the same reason
 * `engine/reset/audit.test.ts` reads source: the failure is invisible from the outside. A rendered
 * `title` looks like nothing at all until a human hovers that exact element for two seconds.
 *
 * `title` as a *prop* is fine and common — `<TavernPanel title="Backpack">` is a heading, not a
 * tooltip. Only lowercase JSX tags (real DOM elements) and `motion.*` are checked, which is
 * exactly the set that reaches the browser.
 */

const ROOTS = ['src/components', 'src/app'];

/** SVG has a `<title>` *element*, which is an accessible name and entirely welcome. */
const ALLOWED = new Set<string>([]);

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly tag: string;
  readonly text: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (entry.endsWith('.tsx')) out.push(path);
  }
  return out;
}

/**
 * Find the JSX tag a `title=` belongs to by walking back to the nearest opening tag.
 *
 * Crude on purpose. A real parser would be more accurate and would also be a second thing to
 * maintain; this is looking for one attribute in hand-written JSX where the tag is always within
 * a few lines above, and it is checked against a known count so a parsing failure shows up as a
 * changed number rather than as silence.
 */
function findTitles(file: string): Finding[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  const found: Finding[] = [];

  lines.forEach((line, index) => {
    if (!/\btitle=/.test(line)) return;
    if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return;

    let tag = '?';
    for (let back = index; back >= 0 && back > index - 30; back -= 1) {
      const opens = [...lines[back]!.matchAll(/<([A-Za-z][\w.]*)/g)];
      const last = opens[opens.length - 1];
      if (last) {
        tag = last[1]!;
        break;
      }
    }
    found.push({ file, line: index + 1, tag, text: line.trim() });
  });

  return found;
}

describe('no native browser tooltips', () => {
  const all = ROOTS.flatMap((root) => walk(root)).flatMap(findTitles);

  it('never puts a `title` attribute on a DOM element', () => {
    const dom = all.filter(
      (hit) =>
        (/^[a-z]/.test(hit.tag) || hit.tag.startsWith('motion.')) &&
        !ALLOWED.has(`${hit.file}:${hit.line}`),
    );

    expect(
      dom.map((hit) => `${hit.file}:${hit.line} <${hit.tag}> ${hit.text}`),
      'use `useTooltip()` from @/components/ui/Tooltip instead of a `title` attribute',
    ).toEqual([]);
  });

  it('still allows `title` as a component prop, which is a heading', () => {
    // The guard has to be narrow or it becomes the guard everyone disables: eighty panels carry a
    // `title` prop, and none of them is a tooltip.
    const props = all.filter((hit) => /^[A-Z]/.test(hit.tag));
    expect(props.length).toBeGreaterThan(50);
  });

  it('resolves the element for every `title` it finds', () => {
    // If the tag scan starts returning `?` the audit above has quietly stopped checking things.
    expect(all.filter((hit) => hit.tag === '?').map((hit) => `${hit.file}:${hit.line}`)).toEqual(
      [],
    );
  });
});
