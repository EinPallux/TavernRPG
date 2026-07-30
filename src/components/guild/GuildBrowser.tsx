'use client';

/**
 * Sixty halls, and the door to one of your own (guilds spec §1).
 *
 * The screen an unguilded player sees. Its whole job is to make joining a *choice*: every card
 * carries the hall's vibe, the bar it sets, how full it is and what its two tracks are worth, so
 * "which one?" has an answer better than "whichever is first".
 *
 * The trade the spec asks for is stated outright at the bottom of the founding panel, because it
 * is the actual decision: **an established hall hands you up to a quarter more of everything on
 * your first day; your own starts at nothing and is yours.**
 */

import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { browseGuilds, FOUNDING_COST, type GuildProfile } from '@/engine/guilds/membership';
import { bonusFor } from '@/engine/guilds/buffs';
import {
  BANNER_COLOURS,
  SIGIL_ICONS,
  validateGuildName,
  type BannerColour,
  type SigilIcon,
} from '@/data/guilds';
import type { VibeTag } from '@/data/guildChat';
import { useGameStore } from '@/state/gameStore';
import { gameNow } from '@/state/clock';
import type { FoundOptions, GuildRefusal } from '@/state/guildActions';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { formatRemaining } from '@/components/ui/TimerChip';
import { BannerIcon, CoinIcon, HourglassIcon, LockIcon } from '@/components/icons';
import { dramatic, listItemIn, snappy, staggerChildren, standard } from '@/styles/motion';
import { GuildBanner } from './GuildBanner';

/** How each vibe presents itself, so the tag is a glance rather than a word to parse. */
const VIBE_LOOK: Readonly<Record<VibeTag, { label: string; tone: string }>> = {
  hardcore: { label: 'Hardcore', tone: 'border-blood-600/45 text-blood-600' },
  cozy: { label: 'Cozy', tone: 'border-moss-600/45 text-moss-600' },
  'night owls': { label: 'Night owls', tone: 'border-arcane-500/45 text-arcane-500' },
  'early risers': { label: 'Early risers', tone: 'border-amber-500/45 text-amber-500' },
  scrappers: { label: 'Scrappers', tone: 'border-ember-600/45 text-ember-600' },
  collectors: { label: 'Collectors', tone: 'border-amber-500/40 text-amber-400' },
  quiet: { label: 'Quiet', tone: 'border-parchment-500/25 text-parchment-500/70' },
  loud: { label: 'Loud', tone: 'border-ember-600/45 text-ember-600' },
};

const percent = (step: number) => `+${Math.round((bonusFor(step) - 1) * 1000) / 10}%`;

export function GuildBrowser({ onRefusal }: { onRefusal: (refusal: GuildRefusal) => void }) {
  const save = useGameStore((state) => state.save);
  const applyToGuild = useGameStore((state) => state.applyToGuild);
  const [founding, setFounding] = useState(false);
  // Through the GameClock, never `Date.now` — the clock is the one source of wall time and a
  // rewound device must not reopen a cooldown (architecture §4).
  const [now] = useState(() => gameNow());

  const halls = useMemo(() => {
    const world = save?.world;
    if (!world) return [];
    return browseGuilds({
      seed: world.seed,
      createdAt: world.createdAt,
      lastSimAt: world.lastSimAt,
      bots: world.bots,
      guilds: world.guilds,
      ladder: world.ladder,
    });
  }, [save?.world]);

  const handleApply = useCallback(
    (guildId: number) => {
      const refusal = applyToGuild(guildId);
      if (refusal) onRefusal(refusal);
    },
    [applyToGuild, onRefusal],
  );

  if (!save?.hero) return null;
  const { hero, guild } = save;

  // One letter at a time (spec §1), so the whole list goes quiet while one is out.
  const pending = guild.application;

  return (
    <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <TavernPanel
        className="flex min-h-0 flex-col"
        bodyClassName="flex-1 min-h-0 overflow-y-auto"
        title="Halls of Aldenvale"
        headerSlot={
          <span className="text-parchment-500/50 text-xs">
            {halls.length} taking members · best funded first
          </span>
        }
        data-testid="guild-browser"
      >
        {pending && <PendingLetter guildId={pending.guildId} decidesAt={pending.decidesAt} now={now} />}

        <motion.ul
          initial="hidden"
          animate="visible"
          transition={staggerChildren(0.02)}
          className="space-y-2"
        >
          {halls.map((hall) => (
            <HallCard
              key={hall.id}
              hall={hall}
              heroLevel={hero.level}
              heroHonor={hero.honor}
              locked={pending !== null}
              refusedAt={guild.refusedAt[String(hall.id)] ?? 0}
              now={now}
              onApply={() => handleApply(hall.id)}
            />
          ))}
        </motion.ul>
      </TavernPanel>

      <div className="min-h-0 space-y-4 overflow-y-auto">
        <TavernPanel title="Or found your own" data-testid="found-panel">
          <p className="text-parchment-500/60 text-xs leading-relaxed">
            Five hundred gold and a name nobody has taken. You are Guildmaster from the first day,
            and heroes will start knocking within hours — sooner the higher you stand.
          </p>
          <p className="text-parchment-500/45 mt-3 text-xs leading-relaxed">
            An established hall hands you its Treasury and Drillmaster the moment you join — up to
            a quarter more gold and experience. Your own starts at nothing.{' '}
            <span className="text-parchment-300">Identity or income.</span>
          </p>

          <div className="mt-4">
            <ActionButton
              size="sm"
              variant={founding ? 'secondary' : 'primary'}
              fullWidth
              cost={{ gold: FOUNDING_COST }}
              {...(hero.gold < FOUNDING_COST
                ? { disabledReason: `You are ${(FOUNDING_COST - hero.gold).toLocaleString()} gold short.` }
                : {})}
              onClick={() => setFounding((open) => !open)}
              data-testid="toggle-founding"
            >
              {founding ? 'Not just yet' : 'Found a hall'}
            </ActionButton>
          </div>
        </TavernPanel>

        <AnimatePresence initial={false}>
          {founding && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={dramatic}
            >
              <FoundingFlow onRefusal={onRefusal} onDone={() => setFounding(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        <TavernPanel title="What a hall is worth">
          <ul className="text-parchment-500/55 space-y-1.5 text-xs leading-relaxed">
            <li>
              <span className="text-parchment-300">Treasury</span> pays gold on missions and the
              Watch. <span className="text-parchment-300">Drillmaster</span> pays experience.
            </li>
            <li>Each step is +0.25%, to a cap of +25% on either track.</li>
            <li>Anyone&rsquo;s donation buys a step. The pot is the hall&rsquo;s, not yours.</li>
            <li>A weekly bounty pays every member a chest — half a chest for a near miss.</li>
            <li>The buffs stop the moment you leave. They are a benefit of standing here.</li>
          </ul>
        </TavernPanel>
      </div>
    </div>
  );
}

/** The letter that is out, and how long the hall has been sitting on it. */
function PendingLetter({
  guildId,
  decidesAt,
  now,
}: {
  guildId: number;
  decidesAt: number;
  now: number;
}) {
  const halls = useGameStore((state) => state.save?.world?.guilds);
  const name = halls ? `hall #${guildId + 1}` : 'the hall';
  const waiting = Math.max(0, decidesAt - now);

  return (
    <motion.p
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={standard}
      className="chamfer-sm border-amber-500/40 bg-amber-500/10 text-parchment-300 mb-3 flex items-center gap-2 border px-3 py-2 text-sm"
      data-testid="pending-application"
    >
      <HourglassIcon size={14} />
      Your letter is with {name}. They will answer within {formatRemaining(waiting)}.
    </motion.p>
  );
}

function HallCard({
  hall,
  heroLevel,
  heroHonor,
  locked,
  refusedAt,
  now,
  onApply,
}: {
  hall: GuildProfile;
  heroLevel: number;
  heroHonor: number;
  locked: boolean;
  refusedAt: number;
  now: number;
  onApply: () => void;
}) {
  const look = VIBE_LOOK[hall.vibe];
  const full = hall.memberCount >= hall.capacity;
  const qualified = heroLevel >= hall.requirements.minLevel && heroHonor >= hall.requirements.minHonor;
  const cooling = refusedAt > 0 && now - refusedAt < 24 * 3_600_000;

  const reason = full
    ? 'This hall is full.'
    : cooling
      ? 'They asked you to try again tomorrow.'
      : !qualified
        ? `They are looking for level ${hall.requirements.minLevel} and ${hall.requirements.minHonor.toLocaleString()} honour.`
        : locked
          ? 'You already have a letter out.'
          : undefined;

  return (
    <motion.li
      variants={listItemIn}
      className={`chamfer-sm border-parchment-500/10 bg-wood-900/45 flex items-center gap-3 border px-3 py-2.5 ${
        full ? 'opacity-55' : ''
      }`}
      data-testid={`hall-card-${hall.id}`}
    >
      <GuildBanner field={hall.field} charge={hall.charge} size={22} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display text-parchment-300 truncate text-sm font-bold">
            {hall.name}
          </span>
          <span
            className={`chamfer-sm shrink-0 border px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider uppercase ${look.tone}`}
            data-testid={`vibe-${hall.id}`}
          >
            {look.label}
          </span>
        </div>
        <p className="text-parchment-500/45 truncate text-xs italic">{hall.motto}</p>
      </div>

      <div className="hidden w-32 shrink-0 text-right text-xs lg:block">
        <p className="text-parchment-500/60 tabular-nums">
          {hall.memberCount}/{hall.capacity} members
        </p>
        <p className="text-parchment-500/40 tabular-nums">around level {hall.medianLevel}</p>
      </div>

      {/* The two tracks, which are most of why one hall beats another. */}
      <div className="w-28 shrink-0 text-right text-xs">
        <p className="text-amber-500 tabular-nums">{percent(hall.treasuryStep)} gold</p>
        <p className="text-arcane-500 tabular-nums">{percent(hall.drillmasterStep)} xp</p>
      </div>

      <div className="w-28 shrink-0">
        <ActionButton
          size="sm"
          variant="secondary"
          fullWidth
          {...(reason ? { disabledReason: reason } : {})}
          onClick={onApply}
          data-testid={`apply-${hall.id}`}
        >
          {full ? 'Full' : cooling ? 'Tomorrow' : 'Apply'}
        </ActionButton>
      </div>
    </motion.li>
  );
}

/* ── The banner builder ────────────────────────────────────────────────────────── */

/**
 * Name it, dress it, found it.
 *
 * The preview is the real `GuildBanner`, not a mock-up, so what the player builds is exactly
 * what appears on the browse list, in the Hall of Fame and at the top of their own hall.
 */
function FoundingFlow({
  onRefusal,
  onDone,
}: {
  onRefusal: (refusal: GuildRefusal) => void;
  onDone: () => void;
}) {
  const foundGuild = useGameStore((state) => state.foundGuild);

  const [name, setName] = useState('');
  const [motto, setMotto] = useState('');
  const [field, setField] = useState<BannerColour>('moss');
  const [charge, setCharge] = useState<BannerColour>('amber');
  const [sigil, setSigil] = useState<SigilIcon>('tankard');

  // Validated as they type, because finding out the name is taken *after* paying would be the
  // one unforgivable moment in this flow.
  const check = name.trim().length === 0 ? null : validateGuildName(name);
  const nameProblem =
    check && !check.ok
      ? check.refusal.kind === 'taken'
        ? `${check.refusal.by} already goes by that.`
        : check.refusal.kind === 'too-short'
          ? `At least ${check.refusal.min} characters.`
          : check.refusal.kind === 'too-long'
            ? `At most ${check.refusal.max} characters.`
            : 'Letters, numbers and the odd apostrophe.'
      : null;

  const submit = useCallback(() => {
    const options: FoundOptions = { name: name.trim(), motto: motto.trim(), field, charge, sigil };
    const refusal = foundGuild(options);
    if (refusal) {
      onRefusal(refusal);
      return;
    }
    onDone();
  }, [charge, field, foundGuild, motto, name, onDone, onRefusal, sigil]);

  return (
    <TavernPanel title="Raise a banner" data-testid="founding-flow">
      <div className="flex items-start gap-4">
        <div className="shrink-0 text-center">
          <GuildBanner field={field} charge={charge} sigil={sigil} size={56} animate />
          <p className="text-parchment-500/40 mt-2 text-[0.6rem] tracking-widest uppercase">
            Preview
          </p>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <label className="block">
            <span className="text-parchment-500/60 text-xs">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="The Quiet Kettle"
              maxLength={28}
              className="chamfer-sm border-parchment-500/20 bg-wood-900/70 text-parchment-300 placeholder:text-parchment-500/35 mt-1 w-full border px-2.5 py-1.5 text-sm outline-none focus:border-amber-500/60"
              data-testid="guild-name"
            />
          </label>
          <AnimatePresence>
            {nameProblem && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={snappy}
                className="text-blood-600 text-xs"
                data-testid="name-problem"
              >
                {nameProblem}
              </motion.p>
            )}
          </AnimatePresence>

          <label className="block">
            <span className="text-parchment-500/60 text-xs">Motto</span>
            <input
              value={motto}
              onChange={(event) => setMotto(event.target.value)}
              placeholder="We put it on at six."
              maxLength={80}
              className="chamfer-sm border-parchment-500/20 bg-wood-900/70 text-parchment-300 placeholder:text-parchment-500/35 mt-1 w-full border px-2.5 py-1.5 text-sm outline-none focus:border-amber-500/60"
              data-testid="guild-motto"
            />
          </label>
        </div>
      </div>

      <Swatches label="Field" selected={field} onSelect={setField} testId="field" />
      <Swatches label="Charge" selected={charge} onSelect={setCharge} testId="charge" />

      <div className="mt-3">
        <p className="text-parchment-500/60 mb-1.5 text-xs">Sigil</p>
        <div className="flex flex-wrap gap-1.5">
          {SIGIL_ICONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSigil(option)}
              aria-label={option}
              aria-pressed={sigil === option}
              className={`chamfer-sm grid h-8 w-8 place-items-center border transition-colors ${
                sigil === option
                  ? 'text-ink-900 border-amber-500 bg-amber-500'
                  : 'border-parchment-500/20 bg-wood-900/60 text-parchment-500/70 hover:border-amber-500/50'
              }`}
              data-testid={`sigil-${option}`}
            >
              <GuildBanner field="ink" charge={sigil === option ? 'ink' : 'parchment'} sigil={option} size={16} />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <ActionButton
          variant="primary"
          fullWidth
          cost={{ gold: FOUNDING_COST }}
          {...(check?.ok ? {} : { disabledReason: nameProblem ?? 'Give it a name first.' })}
          onClick={submit}
          icon={<BannerIcon size={15} />}
          data-testid="confirm-founding"
        >
          Found it
        </ActionButton>
      </div>
    </TavernPanel>
  );
}

function Swatches({
  label,
  selected,
  onSelect,
  testId,
}: {
  label: string;
  selected: BannerColour;
  onSelect: (colour: BannerColour) => void;
  testId: string;
}) {
  return (
    <div className="mt-3">
      <p className="text-parchment-500/60 mb-1.5 text-xs">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {BANNER_COLOURS.map((colour) => (
          <button
            key={colour}
            type="button"
            onClick={() => onSelect(colour)}
            aria-label={`${label} ${colour}`}
            aria-pressed={selected === colour}
            className={`chamfer-sm h-7 w-7 border-2 transition-transform ${
              selected === colour ? 'scale-110 border-amber-500' : 'border-parchment-500/20'
            }`}
            style={{ backgroundColor: SWATCH[colour] }}
            data-testid={`${testId}-${colour}`}
          />
        ))}
      </div>
    </div>
  );
}

const SWATCH: Readonly<Record<BannerColour, string>> = {
  amber: '#e8a33d',
  ember: '#d96c2f',
  blood: '#a73a2e',
  moss: '#4c7a3f',
  arcane: '#6b5b95',
  parchment: '#d8cbb4',
  wood: '#5c4630',
  ink: '#241b12',
};

export { CoinIcon, LockIcon };
