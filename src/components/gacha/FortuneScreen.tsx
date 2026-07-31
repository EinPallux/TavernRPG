'use client';

/**
 * Fortune's Table (gacha spec §1–§7).
 *
 * Three banners across the top, the odds panel and the history log down the side, and Vesna
 * behind all of it. The layout is deliberate: **the odds are on screen at the same time as the
 * button**, always, on the same axis as the thing they describe. A rate that lives behind an
 * "i" is a rate the player has to go looking for, and the whole design position of this room is
 * that they never should.
 *
 * The screen owns no rules. The schedule comes from the calendar, the tables come from
 * `data/banners.ts`, the pity comes from the save, and every spin goes through `gachaActions`.
 * It renders and it animates.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PLACES_BY_ID } from '@/data/places';
import { vesnaSays, type VesnaMoment } from '@/data/vesnaBarks';
import { BANNER_IDS, banner, type BannerId } from '@/data/banners';
import { hasRoom } from '@/engine/hero/actions';
import { currentDayKey } from '@/state/clock';
import { bannerToday, freeRollAvailable, pityFor, type GachaRefusal } from '@/state/gachaActions';
import type { GachaResult } from '@/engine/gacha/roll';
import type { RollExtras } from '@/state/gachaActions';
import { useGameStore } from '@/state/gameStore';
import { gameNow } from '@/state/clock';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { KeeperBark } from '@/components/ui/KeeperBark';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { DiceIcon } from '@/components/icons';
import { listItemIn, snappy, staggerChildren, standard } from '@/styles/motion';
import { Explainer } from '@/components/tutorial/Explainer';
import { BannerCard } from './BannerCard';
import { OddsPanel } from './OddsPanel';
import { RollHistory } from './RollHistory';
import { RollCeremony } from './RollCeremony';

const PLACE = PLACES_BY_ID.fortune;

/** Refusals become sentences here, so a copy edit never touches a transition. */
function phrase(refusal: GachaRefusal): string {
  switch (refusal.kind) {
    case 'insufficient-dice':
      return refusal.needed > 1
        ? `Ten cards is ten dice, and you have ${refusal.held}.`
        : 'No dice, no reading. Golden Dice are earned — run a long mission.';
    case 'bags-full':
      return 'Your bags are full. Vesna will not deal onto a full table.';
    case 'no-ten-roll':
      return 'Only the Grand Reading takes a ten-card spread.';
    case 'no-free-roll':
      return 'Today’s free card has already been dealt.';
    case 'no-hero':
      return 'Nothing to read here.';
  }
}

/** The loudest thing that happened, so Vesna says something about *that*. */
function momentFor(results: readonly GachaResult[], extras: RollExtras): VesnaMoment {
  if (extras.snail) return 'snail';
  if (results.some((entry) => entry.pitied)) return 'pity';
  if (extras.rungs.length > 0) return 'track';
  if (results.some((entry) => entry.reward.kind === 'dupe')) return 'dupe';
  if (results.some((entry) => entry.outcome === 'featured')) return 'featured';
  if (results.some((entry) => entry.outcome === 'epic')) return 'epic';
  return results[0]?.outcome ?? 'browse';
}

export function FortuneScreen() {
  const save = useGameStore((state) => state.save);
  const rollBanner = useGameStore((state) => state.rollBanner);
  const refreshDay = useGameStore((state) => state.refreshDay);

  const [selected, setSelected] = useState<BannerId>('weekly');
  const [message, setMessage] = useState<string | null>(null);
  const [moment, setMoment] = useState<VesnaMoment>('browse');
  const [barkIndex, setBarkIndex] = useState(0);
  const [spin, setSpin] = useState<{
    results: readonly GachaResult[];
    extras: RollExtras;
  } | null>(null);
  const [now, setNow] = useState(() => gameNow());

  // The day has to be current *before* the table is read, or a player who left the tab open
  // overnight is looking at yesterday's cards and yesterday's free roll.
  useEffect(() => {
    refreshDay();
  }, [refreshDay]);

  useEffect(() => {
    const timer = setInterval(() => setNow(gameNow()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const say = useCallback((next: VesnaMoment) => {
    setMoment(next);
    setBarkIndex((index) => index + 1);
  }, []);

  const today = currentDayKey();
  const hero = save?.hero ?? null;

  const banners = useMemo(() => {
    if (!save) return [];
    return BANNER_IDS.map((id) => bannerToday(save, id, today)).filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    );
  }, [save, today]);

  const handleRoll = useCallback(
    (id: BannerId, ten: boolean) => {
      const result = rollBanner(id, ten);
      if (!result.ok) {
        setMessage(phrase(result.refusal));
        say(result.refusal.kind === 'insufficient-dice' ? 'broke' : 'full');
        return;
      }

      setMessage(null);
      setSpin({ results: result.results, extras: result.extras });
      say(momentFor(result.results, result.extras));
    },
    [rollBanner, say],
  );

  if (!save || !hero || banners.length === 0) return null;

  const free = freeRollAvailable(save);
  const bagsFull = !hasRoom(hero);
  const activeMoment: VesnaMoment =
    moment === 'browse' && free ? 'free' : moment === 'browse' && bagsFull ? 'full' : moment;
  const selectedDefinition = banner(selected);

  return (
    <div className="relative h-full w-full" data-testid="place-fortune">
      <AmbientStage
        backdrop={PLACE.backdrop}
        {...(PLACE.tint ? { tint: PLACE.tint } : {})}
        {...(PLACE.effects ? { effects: PLACE.effects } : {})}
      >
        {/* `overflow-hidden` here and a scroller on each column below: at 1366×768 the three
            cards are genuinely taller than the fold, and a page that scrolls as a whole would
            take the odds panel off screen with them — which is the one thing this room must
            never do. */}
        <div className="relative flex h-full flex-col overflow-hidden px-8 py-6">
          <header className="mb-4 flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
                Behind the curtain
              </p>
              <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
                {PLACE.name}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {free && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={snappy}
                  className="chamfer-sm flex items-center gap-2 border border-amber-500/50 bg-amber-500/12 px-3 py-1.5 text-xs text-amber-400"
                  data-testid="free-card-chip"
                >
                  A free card, waiting
                </motion.span>
              )}
              <span
                className="chamfer-sm border-parchment-500/15 bg-wood-900/70 flex items-center gap-2 border px-3 py-1.5 text-xs text-amber-500 tabular-nums"
                data-testid="dice-purse"
              >
                <DiceIcon size={13} />
                {hero.dice}
              </span>
            </div>
          </header>

          <div className="mb-4 min-h-[4.5rem]">
            <KeeperBark
              keeper="Madame Vesna"
              line={vesnaSays(activeMoment, barkIndex)}
              data-testid="bark-fortune"
            />
          </div>

          <AnimatePresence>
            {message && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={standard}
                className="chamfer-sm border-blood-600/40 bg-blood-600/12 text-parchment-300 mb-4 border px-3 py-2 text-sm"
                data-testid="fortune-message"
                onAnimationComplete={() => setTimeout(() => setMessage(null), 4_000)}
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            <motion.div
              initial="hidden"
              animate="visible"
              transition={staggerChildren(0.07)}
              // `auto-rows-fr`: three cards of equal height, so the Draw buttons land on one
              // line. `mt-auto` inside the card is what actually pushes them there.
              className="grid auto-rows-fr gap-4 overflow-y-auto pr-1 lg:grid-cols-3"
              data-testid="banner-shelf"
            >
              {banners.map((active) => (
                <BannerCard
                  key={active.definition.id}
                  active={active}
                  pity={pityFor(save, active)}
                  monthlyRolls={save.gacha.monthlyRolls}
                  dice={hero.dice}
                  freeAvailable={free}
                  bagsFull={bagsFull}
                  now={now}
                  selected={selected === active.definition.id}
                  onSelect={() => setSelected(active.definition.id)}
                  onRoll={(ten) => handleRoll(active.definition.id, ten)}
                />
              ))}
            </motion.div>

            <motion.div
              variants={listItemIn}
              initial="hidden"
              animate="visible"
              transition={standard}
              className="space-y-4 overflow-y-auto pr-1"
            >
              <TavernPanel
                title="The odds"
                headerSlot={
                  <span className="text-parchment-500/45 text-xs">{selectedDefinition.name}</span>
                }
              >
                <OddsPanel definition={selectedDefinition} />
              </TavernPanel>

              <TavernPanel
                title="What you drew"
                headerSlot={
                  <span className="text-parchment-500/45 text-xs tabular-nums">
                    {save.gacha.rolls.toLocaleString()} lifetime
                  </span>
                }
              >
                <RollHistory entries={save.gacha.history} />
              </TavernPanel>

              {/* The published floor actually catching somebody is the moment it stops being a
                  number on a panel and starts being a promise kept (tutorial spec §4). */}
              <Explainer
                id="first-pity"
                when={(spin?.results ?? []).some((entry) => entry.pitied)}
              />
            </motion.div>
          </div>
        </div>
      </AmbientStage>

      <AnimatePresence>
        {spin && (
          <RollCeremony
            key={save.gacha.rolls}
            results={spin.results}
            extras={spin.extras}
            onDone={() => setSpin(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
