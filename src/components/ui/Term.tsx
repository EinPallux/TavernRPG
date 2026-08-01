'use client';

/**
 * A glossary word, explained where it stands (tutorial spec §1).
 *
 * The game uses forty terms as if everyone already knows them — Vigor, pity, Starmetal, the
 * damage reduction cap. A tutorial can teach the first few; it cannot teach the one a returning
 * player forgot three weeks later, which is why the glossary is **not** tutorial content and
 * never turns off. Wrap the word, and it explains itself forever.
 *
 * Hover *and* focus, because a keyboard is a legitimate way to read a screen. Deliberately not a
 * click: a definition you have to open is a definition nobody opens.
 *
 * An unknown term renders as plain text rather than throwing — `glossary.test.ts` is what catches
 * a typo, not a blank screen in front of a player.
 *
 * ## The innermost explanation wins
 *
 * A term is a *word inside a sentence*, and that sentence often sits on something with a tooltip of
 * its own — the character screen's stat rows are the worst case, where "Damage reduction" carries
 * the row hint "Against an opponent of your own level" and the label inside it is the glossary term
 * *Damage reduction cap*. `pointerenter` fires on an ancestor when the pointer enters any part of
 * its subtree, so hovering the word opened **both**: the general one stacked over the specific one
 * the player had actually pointed at.
 *
 * So opening a term shuts the shell tooltip and cancels anything it had queued. Nesting is the
 * normal case rather than the exotic one, and the rule this settles on is the one a reader expects:
 * the more specific explanation is the one you asked for.
 */

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { glossary } from '@/data/glossary';
import { dismissTooltips } from '@/components/ui/Tooltip';
import { duration, standard } from '@/styles/motion';

export function Term({ name, children }: { readonly name: string; readonly children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const entry = glossary(name);

  if (!entry) return <>{children ?? name}</>;

  /*
   * `dismissTooltips` rather than `hideAll`: an ancestor's 340 ms timer may already be counting
   * down, and clearing only what is *showing* would let it fire a moment later — a tooltip for
   * something the player pointed past, on top of the one they pointed at.
   */
  const claim = () => {
    dismissTooltips();
    setOpen(true);
  };

  return (
    <span
      className="relative inline-block"
      onMouseEnter={claim}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onFocus={claim}
        onBlur={() => setOpen(false)}
        aria-describedby={open ? `term-${entry.term}` : undefined}
        className="cursor-help underline decoration-amber-500/50 decoration-dotted underline-offset-[3px] transition-colors hover:decoration-amber-400"
        data-testid={`term-${entry.term.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {children ?? name}
      </button>

      <AnimatePresence>
        {open && (
          <motion.span
            id={`term-${entry.term}`}
            role="tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ ...standard, opacity: { duration: duration.quick } }}
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 block w-64 -translate-x-1/2"
          >
            <span className="chamfer-sm surface-parchment bg-parchment-500 edge-etched text-ink-900 block px-3 py-2">
              <span className="font-display block text-[10px] tracking-[0.2em] text-amber-800 uppercase">
                {entry.term}
              </span>
              <span className="mt-0.5 block text-xs leading-snug">{entry.definition}</span>
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
