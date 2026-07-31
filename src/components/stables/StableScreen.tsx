'use client';

/**
 * The Wandering Stables (shops spec §4).
 *
 * Four stalls, one of which may be occupied. The screen's one real job beyond selling: make the
 * cost of switching **visible before the click**. Odo's confirm names the animal being turned
 * out and the days being thrown away, because those days were paid for and losing them quietly
 * is the kind of thing that makes a player stop trusting a shop.
 */

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MOUNTS, type MountDef, type MountId } from '@/data/mounts';
import { odoSays } from '@/data/shopBarks';
import { PLACES_BY_ID } from '@/data/places';
import {
  MOUNT_TERM_DAYS,
  activeMount,
  daysRemainingOnMount,
  mountPrice,
  mountedMinutes,
  needsRenewalSoon,
} from '@/engine/stables/mounts';
import { MISSION_DURATIONS } from '@/engine/progression/rewards';
import { quoteMount } from '@/state/stableActions';
import { useGameStore } from '@/state/gameStore';
import { gameNow } from '@/state/clock';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { KeeperBark } from '@/components/ui/KeeperBark';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { Icon, HourglassIcon } from '@/components/icons';
import { dramatic, listItemIn, snappy, staggerChildren, standard } from '@/styles/motion';

const PLACE = PLACES_BY_ID.stables;

/** The idle sway that makes a stall look occupied rather than illustrated. */
function StallPortrait({ mount, active }: { mount: MountDef; active: boolean }) {
  return (
    <motion.span
      className={`chamfer-sm grid h-16 w-16 shrink-0 place-items-center border ${
        active
          ? 'border-amber-500/60 bg-amber-500/12 text-amber-400'
          : 'border-parchment-500/18 bg-wood-900/60 text-parchment-500/60'
      }`}
      animate={{ y: [0, -2.5, 0] }}
      transition={{
        duration: 3.2 + mount.speedBonus * 2,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'easeInOut',
      }}
    >
      <Icon name={mount.iconId} size={34} />
    </motion.span>
  );
}

export function StableScreen() {
  const save = useGameStore((state) => state.save);
  const rentMount = useGameStore((state) => state.rentMount);
  const refreshDay = useGameStore((state) => state.refreshDay);

  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MountId | null>(null);
  const [barkIndex, setBarkIndex] = useState(0);
  const [now, setNow] = useState(() => gameNow());

  useEffect(() => {
    refreshDay();
  }, [refreshDay]);

  useEffect(() => {
    const id = setInterval(() => setNow(gameNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const hero = save?.hero ?? null;
  const rental = save?.activity.mount ?? null;
  const current = activeMount(rental, now);
  const expiring = needsRenewalSoon(rental, now);

  const handleRent = useCallback(
    (mountId: MountId, confirmed: boolean) => {
      if (!save) return;

      // Switching forfeits the remainder. Ask once, and say exactly what it costs.
      const quote = quoteMount(save, mountId, now);
      if (!confirmed && quote?.ok && quote.quote.replaces) {
        setConfirming(mountId);
        return;
      }

      setConfirming(null);
      const result = rentMount(mountId);
      setBarkIndex((index) => index + 1);

      if ('kind' in result) {
        setMessage(
          result.kind === 'insufficient-gold'
            ? `Odo wants ${result.needed.toLocaleString()} gold; you have ${result.available.toLocaleString()}.`
            : result.kind === 'insufficient-dice'
              ? `The Griffin costs ${result.needed} Golden Dice. Earn them; they are never sold.`
              : result.kind === 'runway-full'
                ? `Odo will not book a stall more than ${result.maxDays} days ahead.`
                : 'No hero to put in the saddle.',
        );
        return;
      }

      setMessage(null);
    },
    [now, rentMount, save],
  );

  if (!save || !hero) return null;

  const bark = confirming
    ? odoSays('switching', barkIndex)
    : expiring
      ? odoSays('expiring', barkIndex)
      : current
        ? odoSays('mounted', barkIndex)
        : odoSays('browse', barkIndex);

  return (
    <div className="relative h-full w-full" data-testid="place-stables">
      <AmbientStage
        backdrop={PLACE.backdrop}
        {...(PLACE.tint ? { tint: PLACE.tint } : {})}
        {...(PLACE.effects ? { effects: PLACE.effects } : {})}
      >
        {/* Four stalls is not a wall of UI. The panel is composed and centred in the room
            rather than stretched to fill it — the backdrop is doing the filling. */}
        <div className="relative flex h-full flex-col justify-center overflow-y-auto px-8 py-6">
          <header className="mb-5 flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
                Emberhollow
              </p>
              <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
                {PLACE.name}
              </h1>
            </div>

            {current && (
              <motion.span
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={standard}
                className={`chamfer-sm flex items-center gap-2 border px-3 py-1.5 text-xs ${
                  expiring
                    ? 'border-ember-600/55 bg-ember-600/12 text-ember-600'
                    : 'border-parchment-500/15 bg-wood-900/70 text-parchment-500/70'
                }`}
                data-testid="mount-remaining"
              >
                <HourglassIcon size={13} />
                {current.name} — {daysRemainingOnMount(rental, now)} day
                {daysRemainingOnMount(rental, now) === 1 ? '' : 's'} left
              </motion.span>
            )}

            {/* The empty stall says so. A header that shows a chip when you have a mount and
                nothing at all when you do not reads as a rendering gap, not as a state. */}
            {!current && (
              <span
                className="chamfer-sm border-parchment-500/15 bg-wood-900/70 text-parchment-500/55 flex items-center gap-2 border px-3 py-1.5 text-xs"
                data-testid="mount-none"
              >
                Stall empty. You are walking everywhere.
              </span>
            )}
          </header>

          <div className="mb-5">
            <KeeperBark keeper="Odo" line={bark} data-testid="bark-stables" />
          </div>

          <AnimatePresence>
            {message && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={standard}
                className="chamfer-sm border-blood-600/40 bg-blood-600/12 text-parchment-300 mb-4 border px-3 py-2 text-sm"
                data-testid="stable-message"
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          <TavernPanel
            className="w-full max-w-6xl"
            title="The stalls"
            headerSlot={
              <span className="text-parchment-500/50 text-xs">
                {MOUNT_TERM_DAYS}-day rentals · one at a time · mission timers only
              </span>
            }
            data-testid="stalls"
          >
            <motion.ul
              initial="hidden"
              animate="visible"
              transition={staggerChildren(0.06)}
              className="grid auto-rows-fr gap-3 md:grid-cols-2"
            >
              {MOUNTS.map((mount) => {
                const price = mountPrice(mount, hero.level);
                const isCurrent = current?.id === mount.id;
                const quote = quoteMount(save, mount.id, now);
                const affordable = quote?.ok ?? false;
                const isConfirming = confirming === mount.id;

                return (
                  <motion.li
                    key={mount.id}
                    variants={listItemIn}
                    className={`chamfer-md flex flex-col border p-4 ${
                      isCurrent
                        ? 'border-amber-500/55 bg-amber-500/8'
                        : 'border-parchment-500/14 bg-wood-900/72'
                    }`}
                    data-testid={`stall-${mount.id}`}
                    data-active={isCurrent ? 'true' : 'false'}
                  >
                    <div className="flex items-start gap-3.5">
                      <StallPortrait mount={mount} active={isCurrent} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline gap-2">
                          <span
                            className={`font-display text-base font-bold ${
                              isCurrent ? 'text-amber-400' : 'text-parchment-300'
                            }`}
                          >
                            {mount.name}
                          </span>
                          <span className="font-display text-sm font-bold text-amber-500 tabular-nums">
                            −{Math.round(mount.speedBonus * 100)}%
                          </span>
                        </p>
                        <p className="text-parchment-500/55 mt-1 text-xs leading-snug">
                          {mount.blurb}
                        </p>
                        {isCurrent && (
                          <p
                            className="mt-1.5 text-[11px] text-amber-500"
                            data-testid={`stall-active-${mount.id}`}
                          >
                            {/* Not "n of 7": renewing extends the term, so a runway of 14 days
                                is legitimate and "14 of 7" reads as a bug. */}
                            In the saddle — {daysRemainingOnMount(rental, now)} days left.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* What the tier is actually worth, in the units the player books missions
                        in. "−30%" is a number; "20 → 14 min" is a decision. */}
                    <dl
                      className="border-parchment-500/10 mt-3.5 grid grid-cols-4 gap-1.5 border-t pt-3"
                      data-testid={`stall-times-${mount.id}`}
                    >
                      {MISSION_DURATIONS.map((minutes) => (
                        <div key={minutes} className="text-center">
                          <dt className="text-parchment-500/40 text-[10px] tabular-nums">
                            {minutes}m
                          </dt>
                          {/* Body font, not display: Alegreya Sans SC renders the trailing
                              "m" as a small cap, which reads as a different unit to the "m"
                              in the row above it. */}
                          <dd className="text-sm font-bold text-amber-500 tabular-nums">
                            {Math.round(mountedMinutes(minutes, mount))}m
                          </dd>
                        </div>
                      ))}
                    </dl>

                    <div className="mt-auto pt-3.5">
                      <AnimatePresence mode="wait" initial={false}>
                        {isConfirming ? (
                          <motion.div
                            key="confirm"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={snappy}
                            data-testid={`switch-confirm-${mount.id}`}
                          >
                            <p className="text-ember-600 mb-2 text-xs leading-snug">
                              {quote?.ok && quote.quote.replaces
                                ? `Turning out the ${quote.quote.replaces.name} loses ${quote.quote.daysForfeited} paid day${quote.quote.daysForfeited === 1 ? '' : 's'}. No refunds.`
                                : 'This replaces your current mount.'}
                            </p>
                            <div className="flex gap-2">
                              <ActionButton
                                size="sm"
                                variant="danger"
                                onClick={() => handleRent(mount.id, true)}
                                data-testid={`switch-yes-${mount.id}`}
                              >
                                Swap anyway
                              </ActionButton>
                              <ActionButton
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirming(null)}
                                data-testid={`switch-no-${mount.id}`}
                              >
                                Keep the old one
                              </ActionButton>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="rent"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={snappy}
                          >
                            <ActionButton
                              size="sm"
                              fullWidth
                              variant={isCurrent ? 'secondary' : 'primary'}
                              cost={price.dice > 0 ? { dice: price.dice } : { gold: price.gold }}
                              {...(!affordable
                                ? {
                                    disabledReason:
                                      quote?.ok === false && quote.refusal.kind === 'runway-full'
                                        ? `Already booked ${quote.refusal.maxDays} days ahead.`
                                        : price.dice > 0
                                          ? 'Golden Dice are earned, never bought.'
                                          : 'Not enough gold.',
                                  }
                                : {})}
                              onClick={() => handleRent(mount.id, false)}
                              data-testid={`rent-${mount.id}`}
                            >
                              {isCurrent ? `Renew ${MOUNT_TERM_DAYS} days` : 'Rent for a week'}
                            </ActionButton>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.li>
                );
              })}
            </motion.ul>
          </TavernPanel>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...dramatic, delay: 0.2 }}
            className="text-parchment-500/40 mt-4 text-center text-xs"
          >
            A mount shortens the road, not the work — mission timers only, never Vigor, rewards or
            patrol.
          </motion.p>
        </div>
      </AmbientStage>
    </div>
  );
}
