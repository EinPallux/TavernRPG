'use client';

/**
 * The Collector's Album (album spec §4).
 *
 * Thirteen pages down the left, one page's foes on the right. It is the Set Collections layout
 * turned ninety degrees, and for the same reason: this is a page you *visit*, not one you glance
 * at, so it gets the width and a deliberate selection rather than a scroll through 126 cells.
 *
 * Three decisions worth writing down.
 *
 * **An unrecorded foe keeps its name.** The obvious build silhouettes the name too, S&F-style, and
 * it is the wrong call here — nothing in Emberhollow lets a player look a monster up, so a hidden
 * name is a goal with no way to pursue it. The cell shows the name muted, the archetype glyph as
 * a silhouette, and no flavour: you know what you are hunting and where, and beating it is still
 * what turns the light on.
 *
 * **The archetype glyph is the identity, tinted by the fight's own palette.** `data/combatVfx.ts`
 * already assigns every archetype a school with a colour, so a recorded Caster is the same red-hex
 * as the caster the player fought. One source for the colour, not two — the guild-bounty lesson.
 *
 * **The bonus is stated twice on purpose.** Once as what the book pays *now*, once as what a
 * finished book would pay, because a collection with an unstated reward is a chore and rule 6 says
 * the odds are always visible.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ALBUM_CAPSTONE_BONUS,
  ALBUM_PAGE_BONUS,
  type AlbumEntry,
  type AlbumPage,
} from '@/data/album';
import { ARCHETYPES_BY_ID, type ArchetypeId } from '@/data/monsterArchetypes';
import { schoolFor } from '@/data/combatVfx';
import { albumBonus, albumBonusCeiling, albumProgress } from '@/engine/album/album';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { Meter } from '@/components/ui/Meter';
import { useTooltip } from '@/components/ui/Tooltip';
import { Icon } from '@/components/icons';
import type { IconId } from '@/data/icons';
import { listItemIn, snappy, staggerChildren, standard } from '@/styles/motion';

/**
 * What each archetype looks like on the page.
 *
 * Borrowed from the weapon vocabulary rather than drawn fresh: an axe, a dagger, a wand and a
 * shield are already how this game says "hits hard", "quick", "casts" and "soaks". The beetle is
 * the swarm, and it is the same beetle the chitin school is named after.
 */
const ARCHETYPE_GLYPH: Readonly<Record<ArchetypeId, IconId>> = {
  bruiser: 'axe',
  skirmisher: 'dagger',
  caster: 'wand',
  tank: 'shield',
  swarm: 'petBeetle',
};

const percent = (factor: number) => `${Math.round((factor - 1) * 1000) / 10}%`;

function EntryCell({
  entry,
  recorded,
  index,
}: {
  entry: AlbumEntry;
  recorded: boolean;
  index: number;
}) {
  const archetype = ARCHETYPES_BY_ID[entry.archetypeId];
  const school = schoolFor(archetype.name);
  const tip = useTooltip({
    title: recorded ? entry.name : 'Not yet beaten',
    detail: recorded
      ? `${entry.flavor} · ${archetype.name}: ${archetype.tell}`
      : `A ${archetype.name.toLowerCase()} — ${archetype.tell} Beat one to write it into the book.`,
  });

  return (
    <motion.li
      variants={listItemIn}
      transition={{ ...snappy, delay: Math.min(index, 12) * 0.02 }}
      className={`chamfer-sm flex items-center gap-2.5 border p-2 ${
        recorded
          ? 'bg-wood-800/70 border-amber-500/35'
          : 'border-parchment-500/10 bg-wood-900/45 opacity-70'
      }`}
      tabIndex={0}
      data-testid={`album-entry-${entry.id}`}
      data-recorded={recorded}
      {...tip}
    >
      <span
        className="chamfer-sm grid h-9 w-9 shrink-0 place-items-center border"
        style={
          recorded
            ? {
                color: school.palette.core,
                borderColor: `${school.palette.core}66`,
                backgroundColor: `${school.palette.core}14`,
                boxShadow: `0 0 16px -8px ${school.palette.core}`,
              }
            : undefined
        }
      >
        <Icon
          name={ARCHETYPE_GLYPH[entry.archetypeId]}
          size={18}
          className={recorded ? '' : 'text-parchment-500/72'}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-xs leading-tight ${
            recorded ? 'text-parchment-300' : 'text-parchment-500/72'
          }`}
        >
          {entry.name}
        </span>
        <span className="text-parchment-500/72 block truncate text-[10px]">
          {entry.boss ? 'Boss · ' : ''}
          {archetype.name}
        </span>
      </span>
    </motion.li>
  );
}

function PageTab({
  page,
  recorded,
  active,
  onSelect,
}: {
  page: AlbumPage;
  recorded: number;
  active: boolean;
  onSelect: () => void;
}) {
  const complete = recorded === page.entries.length;
  const tip = useTooltip({
    title: page.name,
    detail: complete
      ? `Finished. This page is paying +${percent(1 + ALBUM_PAGE_BONUS)} on every payout.`
      : `${page.entries.length - recorded} left. From level ${page.fromLevel}.`,
  });

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-selected={active}
      role="tab"
      className={`chamfer-sm relative flex w-full items-center gap-2 border px-2.5 py-1.5 text-left transition-colors ${
        active
          ? 'border-amber-500/55 bg-amber-500/10'
          : 'border-parchment-500/10 bg-wood-900/50 hover:border-amber-500/30'
      }`}
      data-testid={`album-page-${page.id}`}
      data-complete={complete}
      {...tip}
    >
      <Icon
        name={page.kind === 'dungeon' ? 'stairsDown' : 'map'}
        size={14}
        className={complete ? 'text-amber-400' : 'text-parchment-500/72'}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-xs leading-tight ${active || complete ? 'text-parchment-300' : 'text-parchment-500/72'}`}
        >
          {page.name}
        </span>
        <span className="text-parchment-500/72 block text-[10px] leading-tight">
          Lv {page.fromLevel}+
        </span>
      </span>
      <span
        className={`shrink-0 text-[11px] font-bold tabular-nums ${
          complete ? 'text-amber-400' : 'text-parchment-500/72'
        }`}
      >
        {recorded}/{page.entries.length}
      </span>
      {complete && (
        <motion.span
          layout
          className="absolute inset-y-0 left-0 w-0.5 bg-amber-500"
          transition={snappy}
        />
      )}
    </button>
  );
}

export function AlbumScreen({ foes }: { foes: readonly string[] }) {
  const progress = albumProgress(foes);
  const bonus = albumBonus(foes);
  const ceiling = albumBonusCeiling();

  /**
   * Which page is open.
   *
   * `null` is "nobody has chosen", and the shown page is then the first unfinished one — where
   * the work is. Storing a default of `ALBUM_PAGES[0]` would open a completed Whispering Woods
   * for a player fifty hours in, which is the road's chapter-board bug exactly (CLAUDE.md: when
   * state follows the data, derive it and let the state hold only the override).
   */
  const [pinned, setPinned] = useState<string | null>(null);
  const firstUnfinished = progress.pages.find((entry) => !entry.complete) ?? progress.pages[0]!;
  const shown = progress.pages.find((entry) => entry.page.id === pinned) ?? firstUnfinished;

  const kept = new Set(foes);

  return (
    <TavernPanel
      title="The Collector's Album"
      headerSlot={
        <span className="text-parchment-500/72 text-xs tabular-nums" data-testid="album-total">
          {progress.recorded}/{progress.total} recorded
        </span>
      }
      data-testid="album"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        {/* ── The pages ───────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div
            className="chamfer-sm border-parchment-500/12 bg-wood-900/55 border p-3"
            data-testid="album-payout"
          >
            <p className="font-display text-[0.65rem] tracking-[0.28em] text-amber-500 uppercase">
              What the book pays
            </p>
            <p
              className="font-display text-parchment-300 mt-1 text-2xl font-bold tabular-nums"
              data-testid="album-bonus"
              data-factor={bonus.gold}
            >
              +{percent(bonus.gold)}
            </p>
            <p className="text-parchment-500/72 mt-1 text-[11px] leading-relaxed">
              Gold <em>and</em> experience, on every contract, delve and stage.{' '}
              {progress.pagesComplete === 0
                ? `Finish a page for +${percent(1 + ALBUM_PAGE_BONUS)}.`
                : `${progress.pagesComplete} page${progress.pagesComplete === 1 ? '' : 's'} finished.`}{' '}
              A full book pays +{percent(ceiling)}, the last {percent(1 + ALBUM_CAPSTONE_BONUS)} of
              it for finishing every page.
            </p>
          </div>

          {/*
            The list scrolls itself rather than taking the page with it. Thirteen pages is taller
            than a 1366×768 viewport, and a nav column that scrolls the open page out of sight
            makes browsing pages mean losing the thing you are browsing them for.
          */}
          <div
            className="space-y-1 lg:max-h-[58vh] lg:overflow-y-auto lg:pr-1"
            role="tablist"
            aria-label="Album pages"
          >
            {progress.pages.map((entry, index) => (
              <div key={entry.page.id} className="space-y-1">
                {/*
                  The list runs zones then dungeons, each in level order — so the Rat Cellars at
                  level 10 sit below Frostfell Ridge at 84. Without a heading that looks like a
                  sort that broke; with one it is two shelves.
                */}
                {entry.page.kind !== progress.pages[index - 1]?.page.kind && (
                  <p className="font-display text-parchment-500/72 px-1 pt-2 text-[0.6rem] tracking-[0.28em] uppercase first:pt-0">
                    {entry.page.kind === 'dungeon' ? 'The Undertavern' : 'The zones'}
                  </p>
                )}
                <PageTab
                  page={entry.page}
                  recorded={entry.recorded}
                  active={entry.page.id === shown.page.id}
                  onSelect={() => setPinned(entry.page.id)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── The open page ───────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={shown.page.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={standard}
            className={`chamfer-md border p-4 ${
              shown.complete
                ? 'border-amber-500/45 bg-amber-500/6 shadow-[0_0_34px_-18px_rgb(232_163_61/0.95)]'
                : 'border-parchment-500/12 bg-wood-900/50'
            }`}
            data-testid="album-open-page"
            data-page={shown.page.id}
          >
            <header className="mb-3">
              <p className="font-display text-parchment-300 text-lg leading-tight font-bold">
                {shown.page.name}
              </p>
              <p className="text-parchment-500/72 mt-0.5 text-[11px] leading-snug italic">
                {shown.page.tagline}
              </p>
            </header>

            <Meter
              value={shown.recorded}
              max={shown.total}
              tone={shown.complete ? 'success' : 'xp'}
              label={shown.complete ? 'Page complete' : 'Recorded'}
              data-testid="album-page-meter"
            />

            <motion.ul
              initial="hidden"
              animate="visible"
              transition={staggerChildren(0.02)}
              className="mt-4 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3"
            >
              {shown.page.entries.map((entry, index) => (
                <EntryCell
                  key={entry.id}
                  entry={entry}
                  recorded={kept.has(entry.id)}
                  index={index}
                />
              ))}
            </motion.ul>

            <p className="text-parchment-500/72 mt-4 text-[11px] leading-relaxed">
              {shown.page.kind === 'dungeon'
                ? 'Filed by clearing the floor it stands on. A floor you have already cleared is already in the book.'
                : 'Filed by winning a contract against it — at the Gilded Tankard, or on the stretch of the Long Road that crosses this ground.'}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </TavernPanel>
  );
}
