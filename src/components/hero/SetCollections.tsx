'use client';

/**
 * Set Collections (gear-sets spec §3).
 *
 * The long-term chase, made legible. Three questions, answered in this order because that is
 * the order a player asks them: *what have I got* (five silhouettes, filled or not), *what does
 * the next one buy me* (the 2/4/5 rows, with the locked ones readable rather than hidden), and
 * *where do I find it* (the source line).
 *
 * **Owned and worn are shown separately.** A piece in the bag counts toward the collection and
 * not toward the bonuses, and conflating them makes "why is my four-piece not firing?"
 * unanswerable — which is the exact question this page exists to answer.
 *
 * Everything here is derived by `setProgress()` from what the hero is carrying. Nothing about a
 * set is stored.
 */

import { motion } from 'motion/react';
import { setProgress, modifiersFor } from '@/engine/items/sets';
import { OPENING_VERSES, SET_SLOTS, type GearSetDef, type SetSlot } from '@/data/gearSets';
import { VERSES } from '@/engine/combat/verses';
import type { VerseId } from '@/engine/combat/types';
import { SLOT_LABELS, type Item } from '@/engine/items/types';
import type { Equipment } from '@/engine/hero/derived';
import type { Hero } from '@/engine/save/schema';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { Icon, LockIcon, SparkIcon } from '@/components/icons';
import type { IconId } from '@/data/icons';
import { dramatic, listItemIn, snappy, staggerChildren } from '@/styles/motion';

/** The silhouette a missing piece leaves behind — the same glyphs the paperdoll uses. */
const SLOT_GLYPH: Readonly<Record<SetSlot, IconId>> = {
  helmet: 'helm',
  chest: 'chestplate',
  gloves: 'gloves',
  boots: 'boots',
  belt: 'belt',
};

type PieceState = 'equipped' | 'owned' | 'missing';

function PieceCell({
  slot,
  name,
  state,
  index,
}: {
  slot: SetSlot;
  name: string;
  state: PieceState;
  index: number;
}) {
  const tone =
    state === 'equipped'
      ? 'border-rarity-set/70 bg-rarity-set/12 text-rarity-set shadow-[0_0_18px_-6px_rgb(232_163_61/0.85)]'
      : state === 'owned'
        ? 'border-rarity-set/35 bg-wood-900/70 text-rarity-set/70'
        : 'border-parchment-500/12 bg-wood-900/40 text-parchment-500/22';

  return (
    <motion.div
      variants={listItemIn}
      transition={{ ...snappy, delay: index * 0.03 }}
      className="flex w-[4.75rem] min-w-0 flex-col items-center gap-1"
      title={`${name} — ${state === 'equipped' ? 'worn' : state === 'owned' ? 'in your bags' : 'not found yet'}`}
      data-testid={`set-piece-${slot}`}
      data-state={state}
    >
      <span
        className={`chamfer-sm grid h-11 w-11 place-items-center border transition-colors ${tone}`}
      >
        <Icon name={SLOT_GLYPH[slot]} size={20} />
      </span>
      <span
        className={`w-full truncate text-center text-[10px] ${
          state === 'missing' ? 'text-parchment-500/30' : 'text-parchment-500/60'
        }`}
      >
        {SLOT_LABELS[slot]}
      </span>
    </motion.div>
  );
}

/** One bonus row. Locked rows stay readable — a goal you cannot read is not a goal. */
function BonusRow({
  pieces,
  text,
  active,
  worn,
}: {
  pieces: number;
  text: string;
  active: boolean;
  worn: number;
}) {
  return (
    <li
      className={`flex items-start gap-2.5 ${active ? '' : 'opacity-45'}`}
      data-testid={`set-bonus-${pieces}`}
      data-active={active}
    >
      <span
        className={`chamfer-sm mt-0.5 grid h-6 w-8 shrink-0 place-items-center border text-[11px] font-bold tabular-nums ${
          active
            ? 'border-rarity-set/60 bg-rarity-set/15 text-rarity-set'
            : 'border-parchment-500/15 bg-wood-900/60 text-parchment-500/50'
        }`}
      >
        {pieces}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-xs leading-relaxed ${active ? 'text-parchment-300' : 'text-parchment-500/65'}`}
        >
          {text}
        </span>
        {!active && (
          <span className="text-parchment-500/40 mt-0.5 block text-[10px]">
            {pieces - worn === 1
              ? 'One more piece on the body.'
              : `${pieces - worn} more pieces on the body.`}
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * The Maestro five-piece: pick the Verse the fight opens on.
 *
 * A choice with no interface is not a choice, and this is the one set bonus in the game that is
 * *strategy* rather than a number. The pick is persisted on the hero and survives the set coming
 * off — `openingVerse()` in the engine only honours it while the bonus is live, so a stale
 * preference is harmless and a re-equipped set remembers what you wanted.
 */
function VersePicker({
  chosen,
  onChoose,
}: {
  chosen: VerseId | null;
  onChoose: (verse: VerseId) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={dramatic}
      className="chamfer-sm border-rarity-set/40 bg-rarity-set/8 mt-3 border p-2.5"
      data-testid="verse-picker"
    >
      <p className="font-display flex items-center gap-1.5 text-[0.65rem] tracking-[0.28em] text-amber-500 uppercase">
        <SparkIcon size={12} />
        Opening Verse
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {OPENING_VERSES.map((verse) => {
          const active = chosen === verse;
          return (
            <button
              key={verse}
              type="button"
              onClick={() => onChoose(verse)}
              aria-pressed={active}
              title={VERSES[verse].blurb}
              className={`chamfer-sm border px-2 py-1.5 text-[11px] transition-colors ${
                active
                  ? 'border-amber-500/70 bg-amber-500/15 text-amber-400'
                  : 'border-parchment-500/12 bg-wood-900/55 text-parchment-500/60 hover:text-parchment-300 hover:border-amber-500/40'
              }`}
              data-testid={`verse-${verse}`}
            >
              {VERSES[verse].name}
            </button>
          );
        })}
      </div>
      <p className="text-parchment-500/45 mt-2 text-[10px] leading-relaxed">
        {chosen
          ? `Every fight starts on ${VERSES[chosen].name}. ${VERSES[chosen].blurb}`
          : 'Unpicked — the room still chooses. Pick one and it never does again.'}
      </p>
    </motion.div>
  );
}

function SetCard({
  definition,
  owned,
  equipped,
  verseSlot,
}: {
  definition: GearSetDef;
  owned: ReadonlySet<string>;
  equipped: ReadonlySet<string>;
  verseSlot: React.ReactNode;
}) {
  const total = definition.pieces.length;
  const complete = owned.size >= total;

  return (
    <motion.div
      variants={listItemIn}
      className={`chamfer-md flex flex-col border p-4 ${
        equipped.size >= total
          ? 'border-rarity-set/60 bg-rarity-set/8 shadow-[0_0_34px_-18px_rgb(232_163_61/0.95)]'
          : 'border-parchment-500/12 bg-wood-900/55'
      }`}
      data-testid={`set-card-${definition.id}`}
    >
      <header className="flex items-start gap-3">
        <span
          className={`chamfer-sm bg-wood-800 grid h-12 w-12 shrink-0 place-items-center border ${
            owned.size > 0
              ? 'border-rarity-set/55 text-rarity-set'
              : 'border-parchment-500/15 text-parchment-500/35'
          }`}
        >
          <Icon name={definition.sigil} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`font-display text-base leading-tight font-bold ${
              owned.size > 0 ? 'text-rarity-set' : 'text-parchment-500/70'
            }`}
          >
            {definition.name}
          </p>
          <p className="text-parchment-500/55 mt-0.5 text-[11px] leading-snug italic">
            {definition.theme}
          </p>
        </div>
        <span
          className="text-rarity-set/85 shrink-0 text-sm font-bold tabular-nums"
          data-testid={`set-count-${definition.id}`}
        >
          {owned.size}/{total}
        </span>
      </header>

      {/* Five silhouettes. Worn pieces glow; bagged pieces are lit but quiet. */}
      <motion.div
        initial="hidden"
        animate="visible"
        transition={staggerChildren(0.03)}
        className="mt-3.5 flex flex-wrap gap-2"
      >
        {SET_SLOTS.map((slot, index) => {
          const piece = definition.pieces.find((entry) => entry.slot === slot);
          return (
            <PieceCell
              key={slot}
              slot={slot}
              name={piece?.name ?? SLOT_LABELS[slot]}
              state={equipped.has(slot) ? 'equipped' : owned.has(slot) ? 'owned' : 'missing'}
              index={index}
            />
          );
        })}
      </motion.div>

      <div className="facet-rule my-3.5" />

      <ul className="space-y-2">
        {definition.bonuses.map((bonus) => (
          <BonusRow
            key={bonus.pieces}
            pieces={bonus.pieces}
            text={bonus.text}
            active={equipped.size >= bonus.pieces}
            worn={equipped.size}
          />
        ))}
      </ul>

      {verseSlot}

      <p className="text-parchment-500/40 border-parchment-500/10 mt-3.5 flex items-start gap-1.5 border-t pt-3 text-[11px] leading-relaxed">
        <LockIcon size={11} className="mt-0.5 shrink-0" />
        {complete ? (
          <span>
            Complete. Torvald&rsquo;s recipe rolls level-refreshed copies once you outgrow these.
          </span>
        ) : (
          <span>Last seen: {definition.source}</span>
        )}
      </p>
    </motion.div>
  );
}

export function SetCollections({
  hero,
  onChooseVerse,
}: {
  hero: Hero;
  onChooseVerse: (verse: VerseId) => void;
}) {
  const equipment = hero.equipment as Equipment;
  const carried: readonly (Item | null)[] = [...hero.backpack, ...hero.satchel];
  const progress = setProgress(hero.classId, equipment, carried);
  const canChooseVerse = modifiersFor(equipment).chooseVerse;

  const held = progress.reduce((sum, entry) => sum + entry.owned.size, 0);
  const wanted = progress.reduce((sum, entry) => sum + entry.definition.pieces.length, 0);

  return (
    <TavernPanel
      title="Set collections"
      headerSlot={
        <span className="text-parchment-500/45 text-xs tabular-nums" data-testid="set-total">
          {held}/{wanted} pieces
        </span>
      }
      data-testid="set-collections"
    >
      <motion.div
        initial="hidden"
        animate="visible"
        transition={staggerChildren(0.07)}
        className="grid gap-4 xl:grid-cols-2"
      >
        {progress.map((entry) => {
          // Only the set that actually grants the choice gets the picker, and only while it is
          // being worn — a selector under a set you own three pieces of would be a lie.
          const grantsVerse = entry.definition.bonuses.some((bonus) =>
            bonus.effects.some((effect) => effect.kind === 'choose-verse'),
          );

          return (
            <SetCard
              key={entry.definition.id}
              definition={entry.definition}
              owned={entry.owned}
              equipped={entry.equipped}
              verseSlot={
                grantsVerse && canChooseVerse ? (
                  <VersePicker chosen={hero.openingVerse} onChoose={onChooseVerse} />
                ) : null
              }
            />
          );
        })}
      </motion.div>

      <p className="text-parchment-500/40 mt-4 text-[11px] leading-relaxed">
        Bonuses count what you are <em>wearing</em>, not what you own — a piece in the bag still
        fills a silhouette, but it does not fire anything. Pieces are Set rarity, class-locked, and
        roll their curated statline at whatever level you find them.
      </p>
    </TavernPanel>
  );
}
