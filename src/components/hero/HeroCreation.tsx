'use client';

/**
 * Hero creation (character spec §1, tutorial spec §2 beat 1).
 *
 * Two decisions, in order: which class, then what name. The class cards lead with *feel*
 * rather than stat tables — a new player cannot evaluate "HP ×2.5, DR cap 10%", but they can
 * absolutely tell you whether they want to be unkillable or terrifying.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import Image from 'next/image';
import { CLASSES } from '@/data/classes';
import { validateHeroName } from '@/engine/hero/actions';
import { ATTRIBUTE_LABELS, type AttributeId } from '@/engine/progression/stats';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { KeeperBark } from '@/components/ui/KeeperBark';
import { useGameStore } from '@/state/gameStore';
import { listItemIn, snappy, staggerChildren } from '@/styles/motion';
import type { ClassId } from '@/engine/items/types';

const DEMAND_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Forgiving',
  2: 'Balanced',
  3: 'Demanding',
};

/** Name suggestions, so the blank field is never a wall. */
const SUGGESTIONS = [
  'Brenna Thornsong',
  'Kargath',
  'Sela Duskwren',
  'Aldric Vale',
  'Mirri Ashfoot',
  'Torvald Grimm',
  'Wren Silverpine',
  'Hollis Fenn',
];

export function HeroCreation() {
  const createHero = useGameStore((state) => state.createHero);
  const [classId, setClassId] = useState<ClassId | null>(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const validation = validateHeroName(name);
  const chosen = CLASSES.find((definition) => definition.id === classId) ?? null;
  const canSubmit = chosen !== null && validation.ok && !submitting;

  const submit = () => {
    if (!canSubmit || !chosen) return;
    setSubmitting(true);
    void createHero(name.trim(), chosen.id);
  };

  return (
    <AmbientStage
      backdrop="/assets/backgrounds/tavern_background.png"
      effects={['hearth', 'embers', 'motes']}
    >
      <div className="flex h-full flex-col items-center justify-center gap-6 overflow-y-auto p-8">
        <header className="text-center">
          <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
            Aldenvale · Emberhollow
          </p>
          <h1 className="font-display text-parchment-300 mt-1 text-4xl font-extrabold">
            Who walks in?
          </h1>
        </header>

        <motion.ul
          className="flex flex-wrap justify-center gap-4"
          initial="hidden"
          animate="visible"
          transition={staggerChildren()}
        >
          {CLASSES.map((definition) => {
            const selected = definition.id === classId;
            return (
              <motion.li key={definition.id} variants={listItemIn}>
                <motion.button
                  type="button"
                  onClick={() => setClassId(definition.id)}
                  whileHover={{ y: -3 }}
                  whileTap={{ y: 1, scale: 0.99 }}
                  transition={snappy}
                  aria-pressed={selected}
                  data-testid={`class-${definition.id}`}
                  className={`chamfer-md surface-timber w-52 border-2 p-4 text-left transition-colors ${
                    selected
                      ? 'bg-wood-700/90 border-amber-500 shadow-[0_0_28px_-10px_rgb(232_163_61/0.9)]'
                      : 'bg-wood-800/90 border-parchment-500/15 hover:border-amber-500/50'
                  }`}
                >
                  <span className="chamfer-sm bg-wood-900 mb-3 block h-28 w-full overflow-hidden">
                    <Image
                      src={definition.portrait}
                      alt=""
                      width={208}
                      height={112}
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span
                    className={`font-display block text-lg font-bold ${
                      selected ? 'text-amber-500' : 'text-parchment-300'
                    }`}
                  >
                    {definition.name}
                  </span>
                  <span className="text-parchment-500/50 block text-[11px] tracking-wider uppercase">
                    {DEMAND_LABEL[definition.demand]}
                  </span>
                  <span className="text-parchment-500/75 mt-2 block text-xs leading-snug">
                    {definition.feel}
                  </span>
                </motion.button>
              </motion.li>
            );
          })}
        </motion.ul>

        {chosen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={snappy}
            className="w-full max-w-2xl"
          >
            <TavernPanel title={chosen.epithet} animate={false} data-testid="class-detail">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <p className="font-display text-xs tracking-[0.2em] text-amber-500 uppercase">
                    {chosen.proc.name}
                  </p>
                  <p className="text-parchment-500/80 mt-1 text-sm leading-relaxed">
                    {chosen.proc.description}
                  </p>
                  <p className="text-parchment-500/60 mt-3 text-xs">
                    {chosen.weaponFamily} · {chosen.offhandFamily}
                  </p>
                </div>

                <div>
                  <p className="font-display text-parchment-500/50 text-xs tracking-[0.2em] uppercase">
                    Starting attributes
                  </p>
                  <ul className="mt-2 space-y-1">
                    {(Object.keys(chosen.startingStats) as AttributeId[]).map((attribute) => (
                      <li key={attribute} className="flex justify-between text-sm">
                        <span
                          className={
                            attribute === chosen.mainStat
                              ? 'text-amber-500'
                              : 'text-parchment-500/70'
                          }
                        >
                          {ATTRIBUTE_LABELS[attribute]}
                          {attribute === chosen.mainStat && ' ★'}
                        </span>
                        <span className="text-parchment-300">
                          {chosen.startingStats[attribute]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="border-parchment-500/15 mt-5 flex flex-wrap items-end gap-3 border-t pt-5">
                <label className="flex-1">
                  <span className="font-display text-parchment-500/60 mb-1 block text-[11px] tracking-[0.2em] uppercase">
                    Name
                  </span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submit();
                    }}
                    maxLength={16}
                    placeholder="Your hero's name"
                    data-testid="hero-name"
                    className="chamfer-sm bg-wood-900/80 text-parchment-300 placeholder:text-parchment-500/30 border-parchment-500/25 w-full border px-3 py-2 text-sm outline-none focus:border-amber-500/70"
                  />
                </label>

                <ActionButton
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setName(SUGGESTIONS[suggestionIndex % SUGGESTIONS.length] ?? '');
                    setSuggestionIndex((index) => index + 1);
                  }}
                  data-testid="suggest-name"
                >
                  Suggest
                </ActionButton>

                <ActionButton
                  size="md"
                  onClick={submit}
                  data-testid="confirm-hero"
                  {...(canSubmit
                    ? {}
                    : {
                        disabledReason: !validation.ok
                          ? validation.reason
                          : 'Choose a class first.',
                      })}
                >
                  {submitting ? 'Walking in…' : 'Enter the tavern'}
                </ActionButton>
              </div>

              {name.length > 0 && !validation.ok && (
                <p className="text-blood-600 mt-2 text-xs" data-testid="name-error">
                  {validation.reason}
                </p>
              )}
            </TavernPanel>
          </motion.div>
        )}

        {!chosen && (
          <KeeperBark
            keeper="Marla"
            line="Pick a trade, love. You can always regret it later — everyone does."
          />
        )}
      </div>
    </AmbientStage>
  );
}
