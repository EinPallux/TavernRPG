'use client';

/**
 * Set recipes (crafting spec §3).
 *
 * The mercy path. Dungeons are the chase and the chase is RNG; a recipe is the one way to buy a
 * *specific set's* progress with materials, and it can never hand back a duplicate — the engine
 * draws from what is missing until nothing is.
 *
 * Recipes the player does not hold are still shown, greyed, with where to find them. A locked
 * shelf that explains itself is a goal; an empty shelf is a bug report.
 */

import { motion } from 'motion/react';
import { setsForClass, type GearSetDef } from '@/data/gearSets';
import { RECIPE_COST, canAfford } from '@/engine/forge/forgeConfig';
import type { ClassId, MaterialBundle } from '@/engine/items/types';
import { ActionButton } from '@/components/ui/ActionButton';
import { Icon, LockIcon } from '@/components/icons';
import { listItemIn, snappy, staggerChildren } from '@/styles/motion';
import { MaterialCost } from './MaterialWallet';

export interface RecipeShelfProps {
  readonly classId: ClassId;
  readonly recipes: readonly string[];
  /** Slots of each set the hero owns anywhere, keyed by set id. */
  readonly ownedBySet: ReadonlyMap<string, number>;
  readonly wallet: MaterialBundle;
  readonly bagsFull: boolean;
  readonly onCraft: (setId: string) => void;
}

function RecipeCard({
  definition,
  held,
  owned,
  affordable,
  bagsFull,
  onCraft,
}: {
  definition: GearSetDef;
  held: boolean;
  owned: number;
  affordable: boolean;
  bagsFull: boolean;
  onCraft: () => void;
}) {
  const total = definition.pieces.length;
  const complete = owned >= total;

  return (
    <motion.div
      variants={listItemIn}
      className={`chamfer-md flex flex-col border p-3 ${
        held
          ? 'border-rarity-set/45 bg-wood-900/70'
          : 'border-parchment-500/10 bg-wood-900/40 opacity-70'
      }`}
      data-testid={`recipe-${definition.id}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`chamfer-sm bg-wood-800 grid h-10 w-10 shrink-0 place-items-center border ${
            held
              ? 'border-rarity-set/45 text-rarity-set'
              : 'border-parchment-500/15 text-parchment-500/40'
          }`}
        >
          {held ? <Icon name={definition.sigil} size={20} /> : <LockIcon size={17} />}
        </span>
        <div className="min-w-0">
          <p
            className={`font-display truncate text-sm font-bold ${held ? 'text-rarity-set' : 'text-parchment-500/60'}`}
          >
            {definition.name}
          </p>
          <p className="text-parchment-500/45 mt-0.5 text-[11px] tabular-nums">
            {owned}/{total} pieces held
          </p>
        </div>
      </div>

      {/* Five pips: what a recipe craft is buying, at a glance. */}
      <div className="mt-2.5 flex gap-1">
        {definition.pieces.map((piece, index) => (
          <motion.span
            key={piece.slot}
            initial={false}
            animate={{ opacity: index < owned ? 1 : 0.22 }}
            transition={snappy}
            className={`chamfer-sm h-1.5 flex-1 ${index < owned ? 'bg-rarity-set' : 'bg-parchment-500/30'}`}
          />
        ))}
      </div>

      {held ? (
        <>
          <p className="text-parchment-500/50 mt-2.5 text-[11px] leading-relaxed">
            {complete
              ? 'Whole. A craft now rolls a fresh copy at your level.'
              : 'Rolls a piece you are missing. Never a duplicate.'}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <MaterialCost bundle={RECIPE_COST} size={12} className="text-[11px]" />
          </div>
          <div className="mt-2">
            <ActionButton
              size="sm"
              fullWidth
              onClick={onCraft}
              {...(bagsFull
                ? { disabledReason: 'Your bags are full — sell, stow or melt something first.' }
                : !affordable
                  ? { disabledReason: 'Twenty Essence and two Starmetal. Not yet.' }
                  : {})}
              data-testid={`craft-recipe-${definition.id}`}
            >
              {complete ? 'Refresh a piece' : 'Forge a piece'}
            </ActionButton>
          </div>
        </>
      ) : (
        <p className="text-parchment-500/45 mt-2.5 text-[11px] leading-relaxed">
          Recipe not found yet. {definition.source}
        </p>
      )}
    </motion.div>
  );
}

export function RecipeShelf({
  classId,
  recipes,
  ownedBySet,
  wallet,
  bagsFull,
  onCraft,
}: RecipeShelfProps) {
  const affordable = canAfford(wallet, RECIPE_COST);
  const sets = setsForClass(classId);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      transition={staggerChildren(0.06)}
      className="grid gap-3 sm:grid-cols-2"
      data-testid="recipe-shelf"
    >
      {sets.map((definition) => (
        <RecipeCard
          key={definition.id}
          definition={definition}
          held={recipes.includes(definition.id)}
          owned={ownedBySet.get(definition.id) ?? 0}
          affordable={affordable}
          bagsFull={bagsFull}
          onCraft={() => onCraft(definition.id)}
        />
      ))}
    </motion.div>
  );
}
