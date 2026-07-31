'use client';

/**
 * The Emberforge (crafting spec §2–§3).
 *
 * Three benches under one roof, and they are three *tabs* rather than three rooms because they
 * are one loop: melt what you do not want, spend what it gave you, and — once the dungeons have
 * been kind — spend it on a specific set instead. Making a player walk between routes to close
 * that loop would be making them walk between routes forty times an evening.
 *
 * The screen owns no rules. Quotes come from `quoteScrap`, odds come from `forgeConfig`, the
 * daily cap comes from the save and resets through the Reset Engine. It renders and it animates.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PLACES_BY_ID } from '@/data/places';
import { torvaldSays, type ForgeMoment } from '@/data/forgeBarks';
import { SCRAPS_PER_DAY, type ForgeTier } from '@/engine/forge/forgeConfig';
import { msUntilNextReset } from '@/engine/reset/resetEngine';
import type { Item, MaterialBundle, SlotId } from '@/engine/items/types';
import { quoteScrap, type ForgeRefusal } from '@/state/forgeActions';
import { useGameStore } from '@/state/gameStore';
import { play } from '@/state/sfx';
import { gameNow } from '@/state/clock';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { KeeperBark } from '@/components/ui/KeeperBark';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { formatRemaining } from '@/components/ui/TimerChip';
import { HourglassIcon } from '@/components/icons';
import { snappy, standard } from '@/styles/motion';
import { MaterialCost, MaterialWallet } from './MaterialWallet';
import { Crucible } from './Crucible';
import { ForgeBench } from './ForgeBench';
import { RecipeShelf } from './RecipeShelf';
import { AnvilStrike } from './AnvilStrike';

const PLACE = PLACES_BY_ID.forge;

type Bench = 'crucible' | 'bench' | 'recipes';

const BENCHES: readonly { readonly id: Bench; readonly label: string }[] = [
  { id: 'crucible', label: 'The crucible' },
  { id: 'bench', label: 'The anvil' },
  { id: 'recipes', label: 'Set recipes' },
];

/** Refusals become sentences here, so a copy edit never touches a transition. */
function phrase(refusal: ForgeRefusal): string {
  switch (refusal.kind) {
    case 'scrap-limit':
      return `The crucible has taken its ${refusal.limit} for today. It cools overnight.`;
    case 'insufficient-materials':
      return 'Not enough in the bucket for that one.';
    case 'no-recipe':
      return 'Torvald has no pattern for that.';
    case 'locked':
      return 'That one is locked. Unlock it first if you mean it.';
    case 'bags-full':
      return 'Your bags are full — nowhere to put it.';
    case 'no-such-item':
      return 'That is not in your bags.';
    case 'no-hero':
      return 'Nothing to do here.';
  }
}

/** What just came off the anvil, held while the ceremony plays. */
interface Reveal {
  readonly item: Item;
  readonly pitied: boolean;
  readonly refresh: boolean;
}

export function ForgeScreen() {
  const save = useGameStore((state) => state.save);
  const scrapItem = useGameStore((state) => state.scrapItem);
  const craftItem = useGameStore((state) => state.craftItem);
  const craftSetPiece = useGameStore((state) => state.craftSetPiece);
  const refreshDay = useGameStore((state) => state.refreshDay);

  const [bench, setBench] = useState<Bench>('crucible');
  const [slot, setSlot] = useState<SlotId>('weapon');
  const [message, setMessage] = useState<string | null>(null);
  const [moment, setMoment] = useState<ForgeMoment>('browse');
  const [barkIndex, setBarkIndex] = useState(0);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  /**
   * The last smelt's yield, shown as chips flying to the wallet.
   *
   * Keyed by a plain counter rather than a timestamp: two melts of identical Commons a second
   * apart must still be two separate animations, and the clock is not ours to read here anyway.
   */
  const [smelted, setSmelted] = useState<{ id: number; gained: MaterialBundle } | null>(null);
  const smeltCount = useRef(0);
  const [now, setNow] = useState(() => gameNow());

  // The day has to be current *before* the cap is read, or a player who left the tab open
  // overnight is still looking at yesterday's spent crucible.
  useEffect(() => {
    refreshDay();
  }, [refreshDay]);

  useEffect(() => {
    const timer = setInterval(() => setNow(gameNow()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const say = useCallback((next: ForgeMoment) => {
    setMoment(next);
    setBarkIndex((index) => index + 1);
  }, []);

  const hero = save?.hero ?? null;

  const bags = useMemo(() => {
    if (!hero) return [] as Item[];
    return [...hero.backpack.filter((entry): entry is Item => entry !== null), ...hero.satchel];
  }, [hero]);

  /** How many pieces of each set the hero holds anywhere — the recipe cards' progress pips. */
  const ownedBySet = useMemo(() => {
    const counts = new Map<string, number>();
    if (!hero) return counts;
    const everything = [...Object.values(hero.equipment), ...bags].filter((item): item is Item =>
      Boolean(item),
    );
    const seen = new Set<string>();
    for (const item of everything) {
      if (!item.setId) continue;
      const key = `${item.setId}:${item.slot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
    }
    return counts;
  }, [hero, bags]);

  const bagsFull = hero
    ? hero.backpack.every((cell) => cell !== null) && hero.satchel.length >= 5
    : true;

  const handleScrap = useCallback(
    (item: Item) => {
      const result = scrapItem(item.uid);
      if (!result.ok) {
        setMessage(phrase(result.refusal));
        say(result.refusal.kind === 'scrap-limit' ? 'capped' : 'browse');
        play('refuse');
        return;
      }

      setMessage(null);
      smeltCount.current += 1;
      setSmelted({ id: smeltCount.current, gained: result.gained });
      say('smelted');
      play('smelt');
    },
    [say, scrapItem],
  );

  const handleCraft = useCallback(
    (tier: ForgeTier) => {
      const result = craftItem(tier, slot);
      if (!result.ok) {
        setMessage(phrase(result.refusal));
        say(result.refusal.kind === 'insufficient-materials' ? 'broke' : 'browse');
        return;
      }

      setMessage(null);
      setReveal({ item: result.item, pitied: result.pitied, refresh: false });
      say(
        result.pitied
          ? 'pity'
          : result.item.rarity === 'epic'
            ? 'epic'
            : result.item.rarity === 'rare'
              ? 'good'
              : 'dud',
      );
    },
    [craftItem, say, slot],
  );

  const handleRecipe = useCallback(
    (setId: string) => {
      const result = craftSetPiece(setId);
      if (!result.ok) {
        setMessage(phrase(result.refusal));
        say(result.refusal.kind === 'insufficient-materials' ? 'broke' : 'browse');
        return;
      }

      setMessage(null);
      setReveal({ item: result.item, pitied: false, refresh: result.refresh ?? false });
      say('set');
    },
    [craftSetPiece, say],
  );

  if (!save || !hero) return null;

  const scrapsLeft = Math.max(0, SCRAPS_PER_DAY - save.forge.scrapsUsedToday);
  const capped = scrapsLeft === 0;
  const activeMoment: ForgeMoment = capped && moment === 'browse' ? 'capped' : moment;

  return (
    <div className="relative h-full w-full" data-testid="place-forge">
      <AmbientStage
        backdrop={PLACE.backdrop}
        {...(PLACE.tint ? { tint: PLACE.tint } : {})}
        {...(PLACE.effects ? { effects: PLACE.effects } : {})}
      >
        <div className="relative flex h-full flex-col overflow-y-auto px-8 py-6">
          <header className="mb-5 flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
                Emberhollow
              </p>
              <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
                {PLACE.name}
              </h1>
            </div>

            {/* The wallet lives here and nowhere else — three numbers that only mean
                something at this bench (crafting spec §2). */}
            <div className="flex items-center gap-2">
              <MaterialWallet materials={hero.materials} />
              <span
                className={`chamfer-sm flex items-center gap-2 border px-3 py-1.5 text-xs ${
                  capped
                    ? 'border-ember-600/45 bg-ember-600/12 text-ember-400'
                    : 'border-parchment-500/15 bg-wood-900/70 text-parchment-500/72'
                }`}
                data-testid="scrap-cap"
              >
                <HourglassIcon size={13} />
                {capped
                  ? `Crucible cools in ${formatRemaining(msUntilNextReset(now))}`
                  : `${scrapsLeft}/${SCRAPS_PER_DAY} melts left today`}
              </span>
            </div>
          </header>

          {/* A fixed height: Torvald's lines wrap to two lines about half the time, and a bark
              row that grows makes the whole bench jump a row down mid-sentence. */}
          <div className="mb-4 flex min-h-[5.5rem] items-start justify-between gap-6">
            <KeeperBark
              keeper="Torvald"
              line={torvaldSays(activeMoment, barkIndex)}
              data-testid="bark-forge"
            />

            {/* Material chips flying out of the crucible toward the wallet (spec §2). */}
            <div className="relative h-10 w-56 shrink-0">
              <AnimatePresence>
                {smelted && (
                  <motion.span
                    key={smelted.id}
                    initial={{ opacity: 0, y: 18, scale: 0.85 }}
                    animate={{ opacity: [0, 1, 1, 0], y: -26, scale: 1 }}
                    transition={{ duration: 1.5, times: [0, 0.15, 0.7, 1] }}
                    onAnimationComplete={() => setSmelted(null)}
                    className="chamfer-sm border-ember-600/45 bg-wood-900/90 absolute top-2 right-0 border px-3 py-1.5"
                    data-testid="smelt-yield"
                  >
                    <MaterialCost bundle={smelted.gained} size={12} signed className="text-xs" />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>

          <AnimatePresence>
            {message && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={standard}
                className="chamfer-sm border-blood-600/40 bg-blood-600/12 text-parchment-300 mb-4 border px-3 py-2 text-sm"
                data-testid="forge-message"
                onAnimationComplete={() => setTimeout(() => setMessage(null), 4_000)}
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          {/* ── Benches ─────────────────────────────────────────────── */}
          <div
            className="border-parchment-500/12 mb-4 flex shrink-0 gap-1 border-b"
            role="tablist"
            data-testid="forge-benches"
          >
            {BENCHES.map((entry) => {
              const active = entry.id === bench;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setBench(entry.id)}
                  // Unlike every other tab strip in the game these sit straight on the
                  // backdrop, and the forge's is pale cold metal — the labels measured 1.6:1
                  // against it. A chamfered fill gives them a surface of their own (§10.3).
                  className={`font-display chamfer-sm relative px-4 py-2 text-sm tracking-wide transition-colors ${
                    active
                      ? 'bg-wood-900/85 text-amber-300'
                      : 'bg-wood-900/70 text-parchment-500/72 hover:text-parchment-300'
                  }`}
                  data-testid={`bench-${entry.id}`}
                >
                  {entry.label}
                  {active && (
                    <motion.span
                      layoutId="forge-bench-underline"
                      transition={snappy}
                      className="absolute inset-x-2 -bottom-px h-0.5 bg-amber-500"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Plain props rather than `variants` + an inline `exit`: `listItemIn` declares no
              exit variant, and `mode="wait"` then sits forever waiting for one that never
              resolves — the underline moves and the panel does not. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={bench}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={standard}
              className="min-h-0 flex-1"
            >
              {bench === 'crucible' && (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                  <TavernPanel title="Into the fire" data-testid="crucible-panel">
                    <Crucible
                      items={bags}
                      quoteFor={(item) => {
                        const quote = quoteScrap(save, item.uid);
                        return quote
                          ? { materials: quote.materials, confirm: quote.confirm }
                          : null;
                      }}
                      onScrap={handleScrap}
                      capReason={capped ? 'The crucible is spent for today.' : null}
                    />
                  </TavernPanel>

                  <TavernPanel title="Sell or scrap?">
                    <p className="text-parchment-500/72 text-xs leading-relaxed">
                      Bram pays gold, and gold buys attributes. Torvald pays materials, and
                      materials buy the slot you actually want. Sell what is cheap; scrap what is
                      interesting.
                    </p>
                    <div className="facet-rule my-3" />
                    <dl className="space-y-1.5 text-xs">
                      {[
                        ['Common', '3–5 Scrap'],
                        ['Uncommon', '6–9 Scrap'],
                        ['Rare', '4–6 Essence'],
                        ['Epic', '9–14 Essence, sometimes Starmetal'],
                        ['Set', '10 Essence + 3 Starmetal'],
                      ].map(([rarity, yieldText]) => (
                        <div key={rarity} className="flex items-baseline justify-between gap-3">
                          <dt className="text-parchment-500/72">{rarity}</dt>
                          <dd className="text-parchment-300/85">{yieldText}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-parchment-500/72 mt-3 text-[11px] leading-relaxed">
                      Yields are rolled when the piece is made and stored on it — the same sword
                      melts the same either today or a month from now.
                    </p>
                  </TavernPanel>
                </div>
              )}

              {bench === 'bench' && (
                <TavernPanel title="On the anvil" data-testid="bench-panel">
                  <ForgeBench
                    slot={slot}
                    onSlot={setSlot}
                    wallet={hero.materials}
                    emberMeter={save.forge.emberMeter}
                    bagsFull={bagsFull}
                    onCraft={handleCraft}
                  />
                </TavernPanel>
              )}

              {bench === 'recipes' && (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                  <TavernPanel title="Patterns Torvald knows" data-testid="recipes-panel">
                    <RecipeShelf
                      classId={hero.classId}
                      recipes={save.forge.recipes}
                      ownedBySet={ownedBySet}
                      wallet={hero.materials}
                      bagsFull={bagsFull}
                      onCraft={handleRecipe}
                    />
                  </TavernPanel>

                  <TavernPanel title="How a set is finished">
                    <p className="text-parchment-500/72 text-xs leading-relaxed">
                      Dungeon floors are the chase: below floor four, a Set piece replaces an Epic
                      one time in five, and a cleared boss is a coin-flip. Neither will ever hand
                      you a piece you already own.
                    </p>
                    <div className="facet-rule my-3" />
                    <p className="text-parchment-500/72 text-xs leading-relaxed">
                      Patterns turn up on the fifth and tenth floors. Spending one is the only way
                      to aim at a <em>specific</em> set — it always rolls a piece you are missing,
                      and once the five are yours it rolls a fresh copy at your current level.
                    </p>
                    <div className="facet-rule my-3" />
                    <p className="text-parchment-500/72 text-[11px] leading-relaxed">
                      Set pieces cannot be sold. Bram will not put an heirloom on a shelf, and
                      Torvald asks twice before melting one.
                    </p>
                  </TavernPanel>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </AmbientStage>

      {/* The forge moment. It takes the room, because it is the reason for the room. */}
      <AnimatePresence>
        {reveal && (
          <AnvilStrike
            key={reveal.item.uid}
            item={reveal.item}
            pitied={reveal.pitied}
            refresh={reveal.refresh}
            onDone={() => setReveal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
