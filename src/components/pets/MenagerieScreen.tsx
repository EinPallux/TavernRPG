'use client';

/**
 * The Menagerie (pets spec §3).
 *
 * Twelve stalls, a bag of Tavern Scraps, and one companion at your side. The room's whole
 * argument is in the layout: the collection is the *content* and the boost is a footnote, which
 * is why eleven-twelfths of the screen is stalls and the active pet gets a single chip.
 *
 * The screen owns no rules. Ownership is derived by `engine/pets/ownership.ts` from the history
 * that earned it, the boost curve lives in `engine/pets/feeding.ts`, and every refusal is quoted
 * by the same function that would decline it. It renders and it animates.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PLACES_BY_ID } from '@/data/places';
import { BOOST_LABELS, FEEDS_PER_DAY, PETS, SCRAPS_PER_FEED, type PetId } from '@/data/pets';
import { collectionProgress, ownedPets } from '@/engine/pets/ownership';
import { feedGoldCost, progressOf, quoteFeed, quoteUpgrade } from '@/engine/pets/feeding';
import { currentBoost, type PetRefusal } from '@/state/petActions';
import { useGameStore } from '@/state/gameStore';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { CoinIcon, Icon, PawIcon } from '@/components/icons';
import { listItemIn, snappy, staggerChildren, standard } from '@/styles/motion';
import { PetStall } from './PetStall';

const PLACE = PLACES_BY_ID.menagerie;

/** Refusals become sentences here, so a copy edit never touches a transition. */
function phrase(refusal: PetRefusal): string {
  switch (refusal.kind) {
    case 'not-owned':
      return 'That stall is still empty.';
    case 'no-hero':
      return 'Nothing to feed.';
    case 'feed':
      switch (refusal.reason.kind) {
        case 'max-level':
          return 'Fully grown. Nothing left to feed it.';
        case 'fed-out':
          return `Three a day is the rule, and it has had its three. Tomorrow.`;
        case 'no-scraps':
          return 'Out of Tavern Scraps — they turn up on contracts.';
        case 'insufficient-gold':
          return `That feed costs ${refusal.reason.needed.toLocaleString()} gold.`;
      }
      break;
    case 'upgrade':
      switch (refusal.reason.kind) {
        case 'fully-upgraded':
          return 'Nothing left to add.';
        case 'level-too-low':
          return `Not until level ${refusal.reason.needed}.`;
        case 'insufficient-materials':
          return 'Not enough Essence and Starmetal for that.';
      }
  }
  return 'Not right now.';
}

export function MenagerieScreen() {
  const save = useGameStore((state) => state.save);
  const feedPet = useGameStore((state) => state.feedPet);
  const upgradePet = useGameStore((state) => state.upgradePet);
  const setActivePet = useGameStore((state) => state.setActivePet);
  const markPetsSeen = useGameStore((state) => state.markPetsSeen);
  const refreshDay = useGameStore((state) => state.refreshDay);

  const [message, setMessage] = useState<string | null>(null);
  /**
   * Which stall just ate, for the chomp. Cleared by the animation itself.
   *
   * The `nonce` is the point: three feeds in a row are three clicks on the same pet, and a bare
   * id would not change between them — the second click would land on an animation already
   * playing and produce nothing. The stall keys off it to restart.
   */
  const [chomped, setChomped] = useState<{ id: string; nonce: number } | null>(null);

  // The day has to be current before the bowls are counted, or a player who left the tab open
  // overnight is looking at yesterday's feeds.
  useEffect(() => {
    refreshDay();
  }, [refreshDay]);

  // Visiting *is* seeing. Doing it on mount rather than on a button means the rail's "new
  // arrival" cue clears itself the moment it has done its job.
  useEffect(() => {
    markPetsSeen();
  }, [markPetsSeen]);

  const owned = useMemo(
    () => (save ? new Set(ownedPets(save).map((p) => p.id)) : new Set<string>()),
    [save],
  );

  /**
   * Yours first, then the rest in roster order.
   *
   * Not a preference — an owned stall carries a boost line, a level bar and three buttons, so it
   * is roughly twice the height of a locked one. Interleaved, every mixed row is padded out to
   * the tall card and the grid reads as holes. Grouped, there is exactly one uneven row.
   */
  const roster = useMemo(
    () => [...PETS].sort((a, b) => Number(owned.has(b.id)) - Number(owned.has(a.id))),
    [owned],
  );

  const handleFeed = useCallback(
    (id: PetId) => {
      const result = feedPet(id);
      if (!result.ok) {
        setMessage(phrase(result.refusal));
        return;
      }
      setMessage(null);
      setChomped((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 }));
    },
    [feedPet],
  );

  const handleUpgrade = useCallback(
    (id: PetId) => {
      const result = upgradePet(id);
      if (!result.ok) setMessage(phrase(result.refusal));
      else setMessage(null);
    },
    [upgradePet],
  );

  if (!save?.hero) return null;

  const hero = save.hero;
  const counter = collectionProgress(save);
  const boost = currentBoost(save);

  return (
    <div className="relative h-full w-full" data-testid="place-menagerie">
      <AmbientStage
        backdrop={PLACE.backdrop}
        {...(PLACE.tint ? { tint: PLACE.tint } : {})}
        {...(PLACE.effects ? { effects: PLACE.effects } : {})}
      >
        <div className="relative flex h-full flex-col overflow-hidden px-8 py-6">
          <header className="mb-4 flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
                Emberhollow
              </p>
              <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
                {PLACE.name}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="chamfer-sm border-parchment-500/15 bg-wood-900/70 text-parchment-500/70 flex items-center gap-2 border px-3 py-1.5 text-xs"
                data-testid="scraps-purse"
              >
                <PawIcon size={13} />
                {save.pets.scraps.toLocaleString()} Tavern Scraps
              </span>
              <span
                className="chamfer-sm border-parchment-500/15 bg-wood-900/70 flex items-center gap-2 border px-3 py-1.5 text-xs text-amber-500 tabular-nums"
                data-testid="collection-count"
              >
                {counter.owned}/{counter.of} companions
              </span>
            </div>
          </header>

          <AnimatePresence>
            {message && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={standard}
                className="chamfer-sm border-blood-600/40 bg-blood-600/12 text-parchment-300 mb-4 border px-3 py-2 text-sm"
                data-testid="menagerie-message"
                onAnimationComplete={() => setTimeout(() => setMessage(null), 4_000)}
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <motion.div
              initial="hidden"
              animate="visible"
              transition={staggerChildren(0.04)}
              className="grid auto-rows-min gap-3 overflow-y-auto pr-1 lg:grid-cols-2 2xl:grid-cols-3"
              data-testid="pet-stalls"
            >
              {roster.map((definition, index) => {
                const has = owned.has(definition.id);
                const progress = progressOf(save.pets.progress, definition.id);
                const feed = quoteFeed(progress, {
                  scraps: save.pets.scraps,
                  gold: hero.gold,
                });
                const upgrade = quoteUpgrade(progress, hero.materials);

                return (
                  <PetStall
                    key={definition.id}
                    definition={definition}
                    owned={has}
                    progress={progress}
                    active={save.pets.activeId === definition.id}
                    index={index}
                    feedReason={feed.ok ? null : phrase({ kind: 'feed', reason: feed.refusal })}
                    upgradeReason={
                      upgrade.ok ? null : phrase({ kind: 'upgrade', reason: upgrade.refusal })
                    }
                    justFed={chomped?.id === definition.id}
                    chompNonce={chomped?.nonce ?? 0}
                    onChompDone={() => setChomped(null)}
                    onFeed={() => handleFeed(definition.id)}
                    onUpgrade={() => handleUpgrade(definition.id)}
                    onActivate={() =>
                      setActivePet(save.pets.activeId === definition.id ? null : definition.id)
                    }
                  />
                );
              })}
            </motion.div>

            <motion.div
              variants={listItemIn}
              initial="hidden"
              animate="visible"
              transition={standard}
              className="space-y-4 overflow-y-auto pr-1"
            >
              <TavernPanel title="At your side" data-testid="active-panel">
                {boost ? (
                  <div>
                    <div className="flex items-center gap-3">
                      <motion.span
                        key={boost.petId}
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={snappy}
                        className="chamfer-sm bg-wood-800 grid h-12 w-12 shrink-0 place-items-center border border-amber-500/55 text-amber-400"
                      >
                        <Icon name={boost.definition.iconId} size={26} />
                      </motion.span>
                      <div className="min-w-0">
                        <p className="font-display text-parchment-300 text-sm font-bold">
                          {boost.name}
                        </p>
                        <p className="text-parchment-500/55 text-[11px]">
                          Level {boost.progress.level}
                        </p>
                      </div>
                    </div>

                    <p className="text-parchment-300 mt-3 text-sm" data-testid="active-boost">
                      <span className="text-parchment-500/60">{BOOST_LABELS[boost.stat]}</span>{' '}
                      <span className="font-bold text-amber-400">
                        +{(boost.share * 100).toFixed(1)}%
                      </span>
                    </p>
                    <p className="text-parchment-500/45 mt-1.5 text-[11px] leading-relaxed">
                      Applied wherever it counts — the fight, the paperdoll and the payout all read
                      this same figure.
                    </p>

                    <div className="mt-3">
                      <ActionButton
                        size="sm"
                        variant="ghost"
                        fullWidth
                        onClick={() => setActivePet(null)}
                        data-testid="dismiss-pet"
                      >
                        Leave it here
                      </ActionButton>
                    </div>
                  </div>
                ) : (
                  <p className="text-parchment-500/50 py-4 text-sm" data-testid="no-active-pet">
                    Nobody is coming with you. Pick one — switching is free, and always will be.
                  </p>
                )}
              </TavernPanel>

              <TavernPanel title="How this works">
                <ul className="text-parchment-500/60 space-y-2 text-[11px] leading-relaxed">
                  <li>
                    <span className="text-parchment-300">One at a time.</span> Only the companion at
                    your side boosts anything, and switching costs nothing.
                  </li>
                  <li>
                    <span className="text-parchment-300">
                      {SCRAPS_PER_FEED} Scrap and some gold a feed
                    </span>
                    , {FEEDS_PER_DAY} feeds a pet a day. Scraps turn up on contracts. Levels are
                    per-pet, so feeding the whole stable stays worth doing.
                  </li>
                  <li>
                    <span className="text-parchment-300">
                      Upgrades are a frame and half a percent.
                    </span>{' '}
                    Skipping every one of them costs you almost nothing — which is why the materials
                    price can be steep.
                  </li>
                  <li className="text-parchment-500/40">
                    Armour, gold-find and experience companions run at half rate: a percentage of
                    gold found is worth rather more over a month than a percentage of Strength.
                  </li>
                </ul>
              </TavernPanel>

              <TavernPanel title="Feeding costs">
                <dl className="space-y-1.5 text-xs">
                  {[1, 10, 25, 40].map((level) => (
                    <div key={level} className="flex items-baseline justify-between gap-3">
                      <dt className="text-parchment-500/55">
                        Level {level} → {level + 1}
                      </dt>
                      <dd className="flex items-center gap-1.5 text-amber-500 tabular-nums">
                        <CoinIcon size={12} />
                        {feedGoldCost(level).toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>
              </TavernPanel>
            </motion.div>
          </div>
        </div>
      </AmbientStage>
    </div>
  );
}
