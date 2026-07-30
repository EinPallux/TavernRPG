'use client';

/**
 * Inside the hall (guilds spec §2–§4).
 *
 * What a member sees: the roster, the two tracks and what they are worth, the week's bounty, and
 * the conversation. The Guildmaster gets the desk as well — applicants with resumes, promote,
 * kick, and the motto.
 *
 * The chat is the piece that has to feel alive, so it is the piece that moves: messages slide in
 * newest-last, the composer answers immediately, and the replies land a beat later because that
 * is how the engine timestamps them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { botIdentity } from '@/engine/world/identity';
import { classDef } from '@/data/classes';
import { bonusFor, stepCost, MAX_STEPS, TRACKS, TRACK_LABEL, type TrackId } from '@/engine/guilds/buffs';
import { GUILD_CAPACITY, resumeFor } from '@/engine/guilds/membership';
import { bountyView, hallOf, type Hall } from '@/state/guildActions';
import type { GuildRefusal } from '@/state/guildActions';
import { useGameStore } from '@/state/gameStore';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { Meter } from '@/components/ui/Meter';
import { CoinIcon, DiceIcon, HeroIcon, LaurelIcon } from '@/components/icons';
import { dramatic, listItemIn, snappy, staggerChildren } from '@/styles/motion';
import { GuildBanner } from './GuildBanner';

export function HallInterior({ onRefusal }: { onRefusal: (refusal: GuildRefusal) => void }) {
  const save = useGameStore((state) => state.save);
  const hall = save ? hallOf(save) : null;
  if (!save?.hero || !save.world || !hall) return null;

  return (
    <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,22rem)]">
      <div className="min-h-0 space-y-4 overflow-y-auto">
        <BannerPanel hall={hall} onRefusal={onRefusal} />
        <BountyPoster />
        <TracksPanel hall={hall} onRefusal={onRefusal} />
      </div>

      <GuildChat hall={hall} onRefusal={onRefusal} />

      <div className="min-h-0 space-y-4 overflow-y-auto">
        {hall.isOwn && <ApplicantsPanel onRefusal={onRefusal} />}
        <RosterPanel hall={hall} onRefusal={onRefusal} />
      </div>
    </div>
  );
}

/* ── Identity ──────────────────────────────────────────────────────────────────── */

function BannerPanel({ hall, onRefusal }: { hall: Hall; onRefusal: (r: GuildRefusal) => void }) {
  const leaveGuild = useGameStore((state) => state.leaveGuild);
  const setGuildMotto = useGameStore((state) => state.setGuildMotto);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(hall.motto);
  const [confirming, setConfirming] = useState(false);

  return (
    <TavernPanel title={hall.isOwn ? 'Your hall' : 'Your hall'} data-testid="hall-banner">
      <div className="flex items-start gap-3">
        <GuildBanner field={hall.field} charge={hall.charge} sigil={hall.sigil} size={44} animate />
        <div className="min-w-0 flex-1">
          <p className="font-display text-parchment-300 truncate text-lg font-extrabold">
            {hall.name}
          </p>
          {editing ? (
            <div className="mt-1 flex gap-1.5">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={80}
                className="chamfer-sm border-parchment-500/20 bg-wood-900/70 text-parchment-300 min-w-0 flex-1 border px-2 py-1 text-xs outline-none focus:border-amber-500/60"
                data-testid="motto-input"
              />
              <ActionButton
                size="sm"
                onClick={() => {
                  const refusal = setGuildMotto(draft);
                  if (refusal) onRefusal(refusal);
                  setEditing(false);
                }}
                data-testid="motto-save"
              >
                Set
              </ActionButton>
            </div>
          ) : (
            <p className="text-parchment-500/50 text-xs italic">
              {hall.motto || 'No motto yet.'}
              {hall.isOwn && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="ml-2 text-amber-500/70 not-italic hover:text-amber-500"
                  data-testid="edit-motto"
                >
                  edit
                </button>
              )}
            </p>
          )}
          <p className="text-parchment-500/45 mt-1 text-xs tabular-nums">
            {hall.memberCount}/{GUILD_CAPACITY} members
            {hall.isOwn && ' · you are Guildmaster'}
          </p>
        </div>
      </div>

      <div className="mt-4">
        {confirming ? (
          <div className="flex gap-2">
            <ActionButton
              size="sm"
              variant="danger"
              fullWidth
              onClick={() => {
                const refusal = leaveGuild();
                if (refusal) onRefusal(refusal);
                setConfirming(false);
              }}
              data-testid="confirm-leave"
            >
              {hall.isOwn ? 'Disband it' : 'Leave for good'}
            </ActionButton>
            <ActionButton size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              Stay
            </ActionButton>
          </div>
        ) : (
          <ActionButton
            size="sm"
            variant="ghost"
            fullWidth
            onClick={() => setConfirming(true)}
            data-testid="leave-guild"
          >
            {hall.isOwn ? 'Disband the hall' : 'Leave the hall'}
          </ActionButton>
        )}
        {confirming && (
          <p className="text-parchment-500/45 mt-2 text-xs leading-relaxed">
            The Treasury and Drillmaster stop paying you the moment you walk out.
          </p>
        )}
      </div>
    </TavernPanel>
  );
}

/* ── The two tracks ────────────────────────────────────────────────────────────── */

const AMOUNTS = [500, 2_500, 10_000] as const;

function TracksPanel({ hall, onRefusal }: { hall: Hall; onRefusal: (r: GuildRefusal) => void }) {
  const save = useGameStore((state) => state.save);
  const donateToGuild = useGameStore((state) => state.donateToGuild);
  const [track, setTrack] = useState<TrackId>('treasury');

  const hero = save?.hero;
  if (!hero) return null;

  const step = track === 'treasury' ? hall.treasuryStep : hall.drillmasterStep;
  const pool = track === 'treasury' ? hall.treasuryPool : hall.drillmasterPool;
  const next = stepCost(step + 1);

  const give = (gold: number, dice: number) => {
    const refusal = donateToGuild({ track, gold, dice });
    if (refusal) onRefusal(refusal);
  };

  return (
    <TavernPanel title="The pot" data-testid="tracks-panel">
      <div className="mb-3 flex gap-1.5">
        {TRACKS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTrack(id)}
            aria-pressed={track === id}
            className={`chamfer-sm font-display flex-1 border px-2 py-1.5 text-xs font-bold transition-colors ${
              track === id
                ? 'text-ink-900 border-amber-500 bg-amber-500'
                : 'border-parchment-500/20 bg-wood-900/60 text-parchment-500/70 hover:border-amber-500/50'
            }`}
            data-testid={`track-${id}`}
          >
            {TRACK_LABEL[id]}
          </button>
        ))}
      </div>

      <div className="flex items-baseline justify-between">
        <span className="font-display text-2xl font-extrabold text-amber-500 tabular-nums">
          +{Math.round((bonusFor(step) - 1) * 1000) / 10}%
        </span>
        <span className="text-parchment-500/50 text-xs tabular-nums">
          step {step} of {MAX_STEPS}
        </span>
      </div>
      <p className="text-parchment-500/50 mt-0.5 text-xs">
        {track === 'treasury' ? 'gold from missions and the Watch' : 'experience from missions'}
      </p>

      {/*
        Shown for both kinds of hall. A donation into one of the sixty lands in a treasury with
        seven digits in it, so without this the player gives ten thousand gold and the panel says
        exactly what it said before — the pot has to have a visible near edge or giving to it is
        an act of faith.
      */}
      <div className="mt-3">
        <Meter value={pool} max={next} tone="xp" showNumbers={false} />
        <p className="text-parchment-500/45 mt-1 text-xs tabular-nums">
          <motion.span
            key={`${track}-${pool}`}
            initial={{ color: 'rgb(232 163 61)' }}
            animate={{ color: 'rgb(216 203 180 / 0.45)' }}
            transition={{ duration: 0.9 }}
          >
            {pool.toLocaleString()}
          </motion.span>{' '}
          / {next.toLocaleString()} toward step {step + 1}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {AMOUNTS.map((amount) => (
          <ActionButton
            key={amount}
            size="sm"
            variant="secondary"
            cost={{ gold: amount }}
            {...(hero.gold < amount ? { disabledReason: 'Not enough gold.' } : {})}
            onClick={() => give(amount, 0)}
            data-testid={`donate-${amount}`}
          >
            Give
          </ActionButton>
        ))}
        <ActionButton
          size="sm"
          variant="secondary"
          cost={{ dice: 1 }}
          {...(hero.dice < 1 ? { disabledReason: 'No Golden Dice.' } : {})}
          onClick={() => give(0, 1)}
          data-testid="donate-die"
        >
          Give
        </ActionButton>
      </div>

      {!hall.isOwn && (
        <p className="text-parchment-500/45 mt-3 text-xs leading-relaxed">
          This hall has been filling its pot since long before you arrived. Anything you add goes
          in with the rest.
        </p>
      )}

      <WeeklyContributions />
    </TavernPanel>
  );
}

/** Who has put in what this week (spec §2). Slackers included, by name. */
function WeeklyContributions() {
  const save = useGameStore((state) => state.save);
  const rows = useMemo(() => {
    if (!save?.world) return [];
    return Object.entries(save.guild.contributions)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => ({
        key,
        name: key === 'player' ? (save.hero?.name ?? 'You') : botIdentity(save.world!.seed, Number(key)).name,
        value,
        isPlayer: key === 'player',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [save]);

  if (rows.length === 0) return null;

  return (
    <div className="border-parchment-500/10 mt-4 border-t pt-3">
      <p className="text-parchment-500/45 mb-1.5 text-[0.6rem] tracking-[0.25em] uppercase">
        This week
      </p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li
            key={row.key}
            className={`flex items-baseline justify-between text-xs ${
              row.isPlayer ? 'text-amber-500' : 'text-parchment-500/60'
            }`}
          >
            <span className="truncate">{row.name}</span>
            <span className="shrink-0 tabular-nums">{row.value.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── The bounty ────────────────────────────────────────────────────────────────── */

function BountyPoster() {
  const save = useGameStore((state) => state.save);
  const view = save ? bountyView(save) : null;
  if (!view) return null;

  return (
    <TavernPanel title="This week" data-testid="bounty-poster">
      <p className="font-display text-parchment-300 text-sm font-bold">{view.title}</p>
      <p className="text-parchment-500/45 mt-0.5 text-xs italic">{view.blurb}</p>

      <div className="mt-3">
        <Meter
          value={view.progress}
          max={view.target}
          tone={view.complete ? 'vigor' : 'xp'}
          showNumbers={false}
        />
        <div className="mt-1 flex items-baseline justify-between text-xs tabular-nums">
          <span className="text-parchment-500/55">
            {view.progress.toLocaleString()} / {view.target.toLocaleString()}
          </span>
          <span className={view.complete ? 'text-moss-600' : 'text-parchment-500/45'}>
            {Math.round(view.share * 100)}%
          </span>
        </div>
      </div>

      {view.playerShare > 0 && (
        <p className="text-parchment-500/45 mt-2 text-xs">
          Your share of it: {Math.round(view.playerShare * 100)}%.
        </p>
      )}
      <p className="text-parchment-500/40 mt-2 text-xs leading-relaxed">
        {view.complete
          ? 'Cleared. The chest is handed out on Sunday.'
          : view.partial
            ? 'Past sixty percent — half a chest is already safe.'
            : 'Sixty percent by Sunday pays half a chest. All of it pays the lot.'}
      </p>
    </TavernPanel>
  );
}

/* ── The roster ────────────────────────────────────────────────────────────────── */

function RosterPanel({ hall, onRefusal }: { hall: Hall; onRefusal: (r: GuildRefusal) => void }) {
  const save = useGameStore((state) => state.save);
  const promote = useGameStore((state) => state.promoteGuildMember);
  const kick = useGameStore((state) => state.kickGuildMember);

  const members = useMemo(() => {
    const world = save?.world;
    if (!world) return [];
    return hall.roster
      .map((botId) => {
        const record = world.bots[botId];
        if (!record) return null;
        const identity = botIdentity(world.seed, botId);
        return {
          botId,
          name: identity.name,
          level: record.level,
          rank: world.ladder.indexOf(botId) + 1,
          portrait: classDef(identity.classId).portrait,
          officer: save!.guild.officers.includes(botId),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => a.rank - b.rank);
  }, [hall.roster, save]);

  if (!save?.hero) return null;

  return (
    <TavernPanel
      title="The roster"
      headerSlot={
        <span className="text-parchment-500/50 text-xs tabular-nums">
          {hall.memberCount}/{GUILD_CAPACITY}
        </span>
      }
      data-testid="roster-panel"
    >
      <ul className="space-y-1">
        {/* The player first and pinned, because a roster you cannot find yourself in is a list. */}
        <li className="chamfer-sm flex items-center gap-2 border border-amber-500/50 bg-amber-500/12 px-2 py-1.5 text-sm">
          <span className="chamfer-sm border-parchment-500/20 relative h-6 w-6 shrink-0 overflow-hidden border">
            <Image
              src={classDef(save.hero.classId).portrait}
              alt=""
              width={24}
              height={24}
              className="h-full w-full object-cover"
            />
          </span>
          <span className="text-parchment-300 min-w-0 flex-1 truncate">{save.hero.name}</span>
          {hall.isOwn && (
            <span className="shrink-0 text-[0.6rem] font-bold tracking-wider text-amber-500 uppercase">
              Master
            </span>
          )}
          <span className="text-parchment-500/50 shrink-0 text-xs tabular-nums">
            L{save.hero.level}
          </span>
        </li>

        {members.map((member) => (
          <li
            key={member.botId}
            className="chamfer-sm border-parchment-500/8 bg-wood-900/40 group flex items-center gap-2 border px-2 py-1.5 text-sm"
            data-testid={`member-${member.botId}`}
          >
            <span className="chamfer-sm border-parchment-500/15 relative h-6 w-6 shrink-0 overflow-hidden border">
              <Image
                src={member.portrait}
                alt=""
                width={24}
                height={24}
                className="h-full w-full object-cover"
              />
            </span>
            <span className="text-parchment-500/75 min-w-0 flex-1 truncate">{member.name}</span>
            {member.officer && (
              <span className="text-arcane-500 shrink-0 text-[0.6rem] font-bold tracking-wider uppercase">
                Officer
              </span>
            )}
            <span className="text-parchment-500/45 shrink-0 text-xs tabular-nums">
              L{member.level}
            </span>

            {hall.isOwn && (
              <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!member.officer && (
                  <button
                    type="button"
                    onClick={() => {
                      const refusal = promote(member.botId);
                      if (refusal) onRefusal(refusal);
                    }}
                    className="text-parchment-500/50 text-xs hover:text-amber-500"
                    data-testid={`promote-${member.botId}`}
                  >
                    promote
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const refusal = kick(member.botId);
                    if (refusal) onRefusal(refusal);
                  }}
                  className="text-parchment-500/50 hover:text-blood-600 text-xs"
                  data-testid={`kick-${member.botId}`}
                >
                  kick
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {members.length === 0 && (
        <p className="text-parchment-500/50 py-6 text-center text-xs leading-relaxed">
          Just you so far. Word gets around — expect a knock before long.
        </p>
      )}
    </TavernPanel>
  );
}

/* ── The Guildmaster's desk ────────────────────────────────────────────────────── */

function ApplicantsPanel({ onRefusal }: { onRefusal: (r: GuildRefusal) => void }) {
  const save = useGameStore((state) => state.save);
  const accept = useGameStore((state) => state.acceptGuildApplicant);
  const decline = useGameStore((state) => state.declineGuildApplicant);

  const resumes = useMemo(() => {
    const world = save?.world;
    if (!world) return [];
    return save!.guild.applicants
      .map((applicant) =>
        resumeFor(
          {
            seed: world.seed,
            createdAt: world.createdAt,
            lastSimAt: world.lastSimAt,
            bots: world.bots,
            guilds: world.guilds,
            ladder: world.ladder,
          },
          applicant,
        ),
      )
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [save]);

  if (resumes.length === 0) return null;

  return (
    <TavernPanel
      title="At the door"
      headerSlot={
        <span className="chamfer-sm border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-xs font-bold text-amber-400 tabular-nums">
          {resumes.length}
        </span>
      }
      data-testid="applicants-panel"
    >
      <motion.ul
        initial="hidden"
        animate="visible"
        transition={staggerChildren(0.05)}
        className="space-y-2"
      >
        <AnimatePresence mode="popLayout">
          {resumes.map((resume) => (
            <motion.li
              key={resume.botId}
              layout
              variants={listItemIn}
              exit={{ opacity: 0, x: 20 }}
              transition={snappy}
              className="chamfer-sm border-parchment-500/10 bg-wood-900/50 border px-2.5 py-2"
              data-testid={`applicant-${resume.botId}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-parchment-300 truncate text-sm font-bold">
                  {resume.name}
                </span>
                <span className="text-parchment-500/45 shrink-0 text-xs tabular-nums">
                  #{resume.rank.toLocaleString()}
                </span>
              </div>
              <p className="text-parchment-500/50 text-xs">
                Level {resume.level} · {resume.honor.toLocaleString()} honour
              </p>
              <p className="text-parchment-500/40 text-xs italic">{resume.activity}</p>

              <div className="mt-2 flex gap-1.5">
                <ActionButton
                  size="sm"
                  fullWidth
                  onClick={() => {
                    const refusal = accept(resume.botId);
                    if (refusal) onRefusal(refusal);
                  }}
                  data-testid={`accept-${resume.botId}`}
                >
                  Take them
                </ActionButton>
                <ActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const refusal = decline(resume.botId);
                    if (refusal) onRefusal(refusal);
                  }}
                  data-testid={`decline-${resume.botId}`}
                >
                  No
                </ActionButton>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </TavernPanel>
  );
}

/* ── The conversation ──────────────────────────────────────────────────────────── */

function GuildChat({ hall, onRefusal }: { hall: Hall; onRefusal: (r: GuildRefusal) => void }) {
  const save = useGameStore((state) => state.save);
  const postGuildMessage = useGameStore((state) => state.postGuildMessage);
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  const messages = save?.guild.chat ?? [];
  const count = messages.length;

  // Pinned to the bottom, like every chat anyone has ever used.
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [count]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0) return;
    const refusal = postGuildMessage(text);
    if (refusal) {
      onRefusal(refusal);
      return;
    }
    setDraft('');
  }, [draft, onRefusal, postGuildMessage]);

  return (
    <TavernPanel
      className="flex min-h-0 flex-col"
      bodyClassName="flex-1 min-h-0 flex flex-col"
      title={`${hall.name} — the hall`}
      data-testid="guild-chat"
    >
      <div ref={scroller} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {messages.every((message) => message.author.kind === 'system') ? (
          <p className="text-parchment-500/50 py-10 text-center text-sm">
            {messages.length > 0 && (
              <span className="text-parchment-500/40 mb-3 block text-xs italic">
                {messages[messages.length - 1]!.text}
              </span>
            )}
            Nobody has said anything yet. Somebody has to go first.
          </p>
        ) : (
          messages.map((message) => (
            <motion.div
              key={message.id}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={snappy}
              className={
                message.author.kind === 'system'
                  ? 'text-parchment-500/40 py-1 text-center text-xs italic'
                  : 'flex gap-2 text-sm'
              }
              data-testid={`chat-${message.id}`}
            >
              {message.author.kind === 'system' ? (
                message.text
              ) : (
                <>
                  <span
                    className={`w-32 shrink-0 truncate text-right text-xs ${
                      message.author.kind === 'player' ? 'font-bold text-amber-500' : 'text-parchment-500/55'
                    }`}
                  >
                    {message.author.name}
                  </span>
                  <span className="text-parchment-300/85 min-w-0 flex-1">{message.text}</span>
                </>
              )}
            </motion.div>
          ))
        )}
      </div>

      <div className="border-parchment-500/10 mt-3 flex gap-2 border-t pt-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') send();
          }}
          placeholder="Say something to the hall"
          maxLength={200}
          className="chamfer-sm border-parchment-500/20 bg-wood-900/70 text-parchment-300 placeholder:text-parchment-500/35 min-w-0 flex-1 border px-3 py-2 text-sm outline-none focus:border-amber-500/60"
          data-testid="chat-input"
        />
        <ActionButton
          size="sm"
          {...(draft.trim().length === 0 ? { disabledReason: 'Type something first.' } : {})}
          onClick={send}
          data-testid="chat-send"
        >
          Post
        </ActionButton>
      </div>
    </TavernPanel>
  );
}

export { CoinIcon, DiceIcon, HeroIcon, LaurelIcon, dramatic };
