'use client';

/**
 * Credits, in the game (CREDITS.md, ROADMAP Phase 18 — "credits screen, license gate").
 *
 * Rendered from `data/credits.ts` rather than written out here, and `credits.test.ts` holds that
 * file and `CREDITS.md` to the same names. The alternative — a screen with its own copy of the
 * list — is the mistake this codebase has made twice already, with the guild bounty targets and
 * the forge odds: never let a surface hold a second copy of the thing it displays.
 *
 * The absences are shown as prominently as the credits, which is unusual and deliberate. An
 * attribution list is a claim about provenance, and a claim that is generous about work you did
 * not use is not trustworthy about the work you did.
 */

import { motion } from 'motion/react';
import {
  ART_CREDITS,
  FONT_CREDITS,
  LICENCES,
  NOT_INCLUDED,
  type CreditEntry,
} from '@/data/credits';
import { listItemIn } from '@/styles/motion';

function Entry({ entry }: { readonly entry: CreditEntry }) {
  const licence = LICENCES[entry.licence];
  return (
    <motion.li
      variants={listItemIn}
      className="border-parchment-500/10 border-b py-3 last:border-b-0"
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-parchment-300 text-sm font-semibold">
          {entry.url ? (
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-amber-500/50 underline-offset-2 hover:decoration-amber-500"
            >
              {entry.source}
            </a>
          ) : (
            entry.source
          )}
        </p>
        <p className="text-parchment-500/72 shrink-0 text-[11px]">
          {licence.url ? (
            <a
              href={licence.url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-amber-500/40 underline-offset-2"
            >
              {licence.name}
            </a>
          ) : (
            licence.name
          )}
          {licence.attributionRequired && <span className="text-amber-500"> · required</span>}
        </p>
      </div>
      <p className="text-parchment-500/72 mt-1 text-xs leading-snug">{entry.what}</p>
      {entry.note && (
        <p className="text-parchment-500/72 mt-1 text-[11px] leading-snug italic">{entry.note}</p>
      )}
    </motion.li>
  );
}

export function CreditsPanel() {
  return (
    <div data-testid="credits">
      <p className="text-parchment-500/72 text-xs leading-relaxed">
        TavernRPG is built on other people&rsquo;s work. Everything below is listed whether the
        licence demands it or not — the ones marked <span className="text-amber-500">required</span>{' '}
        are the ones that do.
      </p>

      <h3 className="font-display text-parchment-300 mt-4 text-xs tracking-[0.2em] uppercase">
        Art
      </h3>
      <motion.ul initial="hidden" animate="visible" data-testid="credits-art">
        {ART_CREDITS.map((entry) => (
          <Entry key={`${entry.source}-${entry.what}`} entry={entry} />
        ))}
      </motion.ul>

      <h3 className="font-display text-parchment-300 mt-4 text-xs tracking-[0.2em] uppercase">
        Type
      </h3>
      <motion.ul initial="hidden" animate="visible" data-testid="credits-fonts">
        {FONT_CREDITS.map((entry) => (
          <Entry key={entry.source} entry={entry} />
        ))}
      </motion.ul>
      <p className="text-parchment-500/72 mt-2 text-[11px] leading-snug">
        Both typefaces are served from this site rather than fetched from anywhere, so the game
        redistributes them and the Open Font License travels with them.
      </p>

      <h3 className="font-display text-parchment-300 mt-5 text-xs tracking-[0.2em] uppercase">
        What is not in here
      </h3>
      <ul className="mt-1 space-y-2" data-testid="credits-absences">
        {NOT_INCLUDED.map((absence) => (
          <li key={absence.what}>
            <p className="text-parchment-300 text-xs font-semibold">{absence.what}</p>
            <p className="text-parchment-500/72 text-[11px] leading-snug">{absence.detail}</p>
          </li>
        ))}
      </ul>

      <p className="text-parchment-500/72 mt-5 text-[11px] leading-relaxed">
        The game itself runs on Next.js, React, TypeScript, Tailwind, Zustand, Motion, Zod and idb,
        each under its own open-source licence. Full detail lives in{' '}
        <span className="text-parchment-300">CREDITS.md</span> in the repository.
      </p>
    </div>
  );
}
