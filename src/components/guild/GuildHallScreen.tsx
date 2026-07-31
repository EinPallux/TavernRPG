'use client';

/**
 * The Guild Hall (guilds spec §1–§4).
 *
 * Two faces, like the City Watch: an unguilded player is browsing sixty halls and thinking about
 * founding one; a member is standing in theirs. The screen picks between them and owns nothing
 * else — every rule lives in `guildActions` and the four engine modules behind it.
 *
 * The two moments that need to *land* rather than merely appear are handled here: the answer to
 * an application, which the player has been waiting five to ninety minutes for, and the Sunday
 * bounty chest, which is the payoff for a week of everybody's work.
 */

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PLACES_BY_ID } from '@/data/places';
import { hallOf, type GuildRefusal } from '@/state/guildActions';
import { useGameStore } from '@/state/gameStore';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { BannerIcon, CoinIcon, DiceIcon, LaurelIcon } from '@/components/icons';
import { dramatic, snappy, standard } from '@/styles/motion';
import { GuildBrowser } from './GuildBrowser';
import { HallInterior } from './HallInterior';

const PLACE = PLACES_BY_ID.guild;

/** Refusals become sentences here, so a copy edit never touches a transition. */
function phrase(refusal: GuildRefusal): string {
  switch (refusal.kind) {
    case 'apply':
      switch (refusal.reason.kind) {
        case 'already-in-a-guild':
          return 'You are already in a hall. Leave that one first.';
        case 'already-applied':
          return 'You have a letter out. One at a time.';
        case 'full':
          return `That hall is full at ${refusal.reason.capacity}.`;
        case 'folded':
          return 'That hall has folded.';
        case 'cooldown':
          return 'They asked you to try again tomorrow.';
        case 'below-requirements':
          return `They want level ${refusal.reason.requirements.minLevel} and ${refusal.reason.requirements.minHonor.toLocaleString()} honour.`;
      }
      break;
    case 'bad-name':
      return refusal.reason.kind === 'taken'
        ? `${refusal.reason.by} already goes by that name.`
        : 'That name will not do.';
    case 'insufficient-gold':
      return `You are ${(refusal.needed - refusal.available).toLocaleString()} gold short.`;
    case 'insufficient-dice':
      return 'Golden Dice are earned, never bought.';
    case 'full':
      return `The hall is full at ${refusal.capacity}.`;
    case 'not-guildmaster':
      return 'Only the Guildmaster can do that.';
    case 'not-in-a-guild':
      return 'You are not in a hall.';
    case 'no-hero':
    case 'no-world':
    case 'nothing-to-do':
      return 'Nothing to do there.';
  }
  return 'Nothing to do there.';
}

export function GuildHallScreen() {
  const save = useGameStore((state) => state.save);
  const openGuildHall = useGameStore((state) => state.openGuildHall);
  const guildDecision = useGameStore((state) => state.guildDecision);
  const dismissGuildDecision = useGameStore((state) => state.dismissGuildDecision);
  const guildChest = useGameStore((state) => state.guildChest);
  const dismissGuildChest = useGameStore((state) => state.dismissGuildChest);

  const [message, setMessage] = useState<string | null>(null);
  const guildId = save?.guild.guildId ?? null;

  /**
   * The day and any pending answer, both settled before the screen reads the save.
   *
   * Watches `guildId` as well as running on mount, because *joining* is the moment a hall's week
   * starts existing: the first pass runs while the player is still unguilded and has no bounty to
   * post, and without this the poster would stay blank until they next opened the room.
   */
  useEffect(() => {
    openGuildHall();
  }, [openGuildHall, guildId]);

  const onRefusal = useCallback((refusal: GuildRefusal) => {
    setMessage(phrase(refusal));
  }, []);

  if (!save?.hero) return null;
  const hall = hallOf(save);

  return (
    <div className="relative h-full w-full" data-testid="place-guild">
      <AmbientStage
        backdrop={PLACE.backdrop}
        {...(PLACE.tint ? { tint: PLACE.tint } : {})}
        {...(PLACE.effects ? { effects: PLACE.effects } : {})}
      >
        <div className="relative flex h-full flex-col px-8 py-6">
          <header className="mb-5 flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
                Emberhollow
              </p>
              <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
                {hall ? hall.name : PLACE.name}
              </h1>
            </div>

            {hall && (
              <div className="flex items-center gap-2">
                <span
                  className="chamfer-sm border-parchment-500/15 bg-wood-900/70 flex items-center gap-2 border px-3 py-1.5 text-xs text-amber-500"
                  data-testid="hall-gold-buff"
                >
                  <CoinIcon size={13} />+{Math.round(hall.treasuryStep * 0.25 * 10) / 10}% gold
                </span>
                <span
                  className="chamfer-sm border-parchment-500/15 bg-wood-900/70 text-arcane-500 flex items-center gap-2 border px-3 py-1.5 text-xs"
                  data-testid="hall-xp-buff"
                >
                  <LaurelIcon size={13} />+{Math.round(hall.drillmasterStep * 0.25 * 10) / 10}% xp
                </span>
              </div>
            )}
          </header>

          <AnimatePresence>
            {message && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={standard}
                className="chamfer-sm border-blood-600/40 bg-blood-600/12 text-parchment-300 mb-4 border px-3 py-2 text-sm"
                data-testid="guild-message"
                onAnimationComplete={() => setTimeout(() => setMessage(null), 4_000)}
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          {hall ? <HallInterior onRefusal={onRefusal} /> : <GuildBrowser onRefusal={onRefusal} />}
        </div>
      </AmbientStage>

      {/* The answer to a letter. Worth stopping the room for — they have been waiting for it. */}
      <AnimatePresence>
        {guildDecision && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={dramatic}
            className="bg-wood-900/85 absolute inset-0 z-50 grid place-items-center p-8 backdrop-blur-sm"
            data-testid="guild-decision"
          >
            <motion.div
              initial={{ scale: 0.9, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              transition={dramatic}
              className="w-full max-w-md"
            >
              <TavernPanel
                title={guildDecision.accepted ? 'They said yes' : 'They wrote back'}
                elevation="floating"
              >
                <div className="flex items-start gap-3">
                  <motion.span
                    initial={{ scale: 1.6, opacity: 0, rotate: -12 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={snappy}
                    className={`chamfer-sm grid h-11 w-11 shrink-0 place-items-center border ${
                      guildDecision.accepted
                        ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
                        : 'border-parchment-500/20 bg-wood-900/70 text-parchment-500/72'
                    }`}
                  >
                    <BannerIcon size={20} />
                  </motion.span>
                  <p className="text-parchment-300/90 text-sm leading-relaxed">
                    {guildDecision.reason}
                  </p>
                </div>
                <div className="mt-5">
                  <ActionButton fullWidth onClick={dismissGuildDecision} data-testid="dismiss-decision">
                    {guildDecision.accepted ? 'Walk in' : 'Fair enough'}
                  </ActionButton>
                </div>
              </TavernPanel>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sunday's chest. Everybody's week, paid at once. */}
      <AnimatePresence>
        {guildChest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={dramatic}
            className="bg-wood-900/85 absolute inset-0 z-50 grid place-items-center p-8 backdrop-blur-sm"
            data-testid="bounty-chest"
          >
            <motion.div
              initial={{ scale: 0.85, rotate: -3 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={dramatic}
              className="w-full max-w-sm"
            >
              <TavernPanel
                title={guildChest.full ? 'Bounty cleared' : 'Half a chest'}
                elevation="floating"
              >
                <p className="text-parchment-500/72 text-sm leading-relaxed">
                  {guildChest.full
                    ? 'The hall finished the week. Everybody gets one.'
                    : 'Not all the way, but far enough to be paid for it.'}
                </p>
                <ul className="mt-4 space-y-1.5">
                  <ChestLine icon={<CoinIcon size={14} />} label="Gold" amount={guildChest.gold} />
                  {guildChest.dice > 0 && (
                    <ChestLine icon={<DiceIcon size={14} />} label="Golden Dice" amount={guildChest.dice} />
                  )}
                </ul>
                {guildChest.scrap > 0 && (
                  <p className="text-parchment-500/72 mt-3 text-xs leading-relaxed">
                    {guildChest.scrap} scrap and {guildChest.essence} essence are set aside for you
                    at the Emberforge, once Torvald opens it.
                  </p>
                )}
                <div className="mt-5">
                  <ActionButton fullWidth onClick={dismissGuildChest} data-testid="dismiss-chest">
                    Take it
                  </ActionButton>
                </div>
              </TavernPanel>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChestLine({
  icon,
  label,
  amount,
}: {
  icon: React.ReactNode;
  label: string;
  amount: number;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...standard, delay: 0.2 }}
      className="border-parchment-500/10 flex items-center justify-between border-b pb-1.5 text-sm"
    >
      <span className="text-parchment-500/72 flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="font-bold text-amber-500 tabular-nums">+{amount.toLocaleString()}</span>
    </motion.li>
  );
}
