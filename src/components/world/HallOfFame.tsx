'use client';

/**
 * The Hall of Fame (arena spec §2).
 *
 * Three tabs over the same world: every hero by honor, every guild by its top twenty, and the
 * weekly Legends archive. The Heroes tab is the load-bearing one — 1,501 rows that must scroll at
 * 60fps, which `LadderList` handles by mounting only the visible window.
 *
 * The room's job is to make rank *legible*. A number in the HUD is a number; a list where you can
 * see the ten people you have to get past, by name, is a plan.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { botIdentity } from '@/engine/world/identity';
import { guildStandings } from '@/engine/world/halls';
import { PLAYER_LADDER_ID } from '@/engine/world/ladder';
import { isAttackable } from '@/engine/arena/arena';
import { classDef } from '@/data/classes';
import { guild } from '@/data/guilds';
import { PLACES_BY_ID } from '@/data/places';
import { rankOfPlayer } from '@/state/arenaActions';
import { useGameStore } from '@/state/gameStore';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { BannerIcon, HeroIcon, LaurelIcon } from '@/components/icons';
import { dramatic, listItemIn, snappy, staggerChildren } from '@/styles/motion';
import { LadderList, RankDelta, type LadderEntry } from './LadderList';
import { GuildBanner } from '@/components/guild/GuildBanner';

const PLACE = PLACES_BY_ID.hall;

type Tab = 'heroes' | 'guilds' | 'legends';

const TABS: readonly { id: Tab; label: string; icon: typeof HeroIcon }[] = [
  { id: 'heroes', label: 'Heroes', icon: HeroIcon },
  { id: 'guilds', label: 'Guilds', icon: BannerIcon },
  { id: 'legends', label: 'Legends', icon: LaurelIcon },
];

export function HallOfFame() {
  const save = useGameStore((state) => state.save);
  const markLadderSeen = useGameStore((state) => state.markLadderSeen);

  const [tab, setTab] = useState<Tab>('heroes');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<LadderEntry | null>(null);
  const [listHeight, setListHeight] = useState(560);
  const frame = useRef<HTMLDivElement>(null);

  const world = save?.world ?? null;
  const hero = save?.hero ?? null;
  const playerRank = save ? rankOfPlayer(save) : 0;
  /**
   * The rank as of the *previous* visit, captured on mount.
   *
   * A lazy initialiser rather than a read of the live save, because opening this room banks the
   * current rank — without the snapshot the "▲ 12" chip would compute against the number it just
   * wrote and always read zero. `GatedPlace` does not mount this component until the save is
   * ready, so the initialiser always sees one.
   */
  const [seenRank] = useState(() => save?.arena.lastSeenRank ?? 0);

  /** The list wants a pixel height, and the room is full-viewport, so it is measured. */
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setListHeight(Math.max(240, entry.contentRect.height));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Banking the visit is what makes the *next* one able to say "▲ 12 overnight".
  useEffect(() => {
    markLadderSeen();
  }, [markLadderSeen]);

  const rivalIds = useMemo(() => new Set(world?.rivals.map((rival) => rival.botId) ?? []), [world]);

  /**
   * Every rung, resolved.
   *
   * Built once per world change rather than per render: 1,501 `botIdentity` calls is a few
   * milliseconds, and doing it on every keystroke in the search box would be felt.
   */
  const entries = useMemo((): LadderEntry[] => {
    if (!world || !hero) return [];

    return world.ladder.map((id, index): LadderEntry => {
      if (id === PLAYER_LADDER_ID) {
        return {
          id,
          rank: index + 1,
          name: hero.name,
          level: hero.level,
          honor: hero.honor,
          guildId: -1,
          portrait: classDef(hero.classId).portrait,
          isPlayer: true,
          legend: false,
          dormant: false,
          rival: false,
        };
      }

      const record = world.bots[id];
      const identity = botIdentity(world.seed, id);
      return {
        id,
        rank: index + 1,
        name: identity.name,
        level: record?.level ?? 1,
        honor: record?.honor ?? 0,
        guildId: record?.guildId ?? -1,
        portrait: classDef(identity.classId).portrait,
        isPlayer: false,
        legend: identity.legend,
        dormant: (record?.dormantUntil ?? 0) > world.lastSimAt,
        rival: rivalIds.has(id),
      };
    });
    // Dormancy is measured against the world's own `lastSimAt` rather than the wall clock, so
    // the list agrees with the simulation that produced it — and so this stays a pure derivation
    // that does not re-run every second.
  }, [hero, rivalIds, world]);

  /**
   * Search filters; jump-to-rank scrolls.
   *
   * A bare number is a rank to jump to, not a name to filter by — typing "412" almost always
   * means "show me rank 412", and filtering 1,501 rows down to the handful whose *honor* contains
   * those digits is never what anybody wanted.
   */
  const asRank = /^\d+$/.test(query.trim()) ? Number(query.trim()) : null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || asRank !== null) return entries;
    return entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) ||
        (guild(entry.guildId)?.name.toLowerCase().includes(needle) ?? false),
    );
  }, [asRank, entries, query]);

  const focusRank =
    asRank !== null && asRank >= 1 && asRank <= entries.length
      ? asRank
      : query.trim() === ''
        ? playerRank
        : undefined;

  const standings = useMemo(() => {
    if (!world) return [];
    return guildStandings({
      seed: world.seed,
      createdAt: world.createdAt,
      lastSimAt: world.lastSimAt,
      bots: world.bots,
      guilds: world.guilds,
      ladder: world.ladder,
    });
  }, [world]);

  const close = useCallback(() => setSelected(null), []);

  if (!save || !hero || !world) return null;

  const delta = seenRank > 0 ? seenRank - playerRank : 0;

  return (
    <div className="relative h-full w-full" data-testid="place-hall">
      <AmbientStage
        backdrop={PLACE.backdrop}
        {...(PLACE.tint ? { tint: PLACE.tint } : {})}
        {...(PLACE.effects ? { effects: PLACE.effects } : {})}
      >
        <div className="relative flex h-full flex-col px-8 py-6">
          <header className="mb-4 flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
                Aldenvale
              </p>
              <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
                {PLACE.name}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-parchment-500/60 text-xs tabular-nums">
                You stand{' '}
                <span className="font-bold text-amber-500">#{playerRank.toLocaleString()}</span> of{' '}
                {entries.length.toLocaleString()}
              </span>
              <RankDelta delta={delta} />
            </div>
          </header>

          {/* Tabs: chamfered, never pills. */}
          <div className="mb-4 flex gap-1.5" role="tablist">
            {TABS.map(({ id, label, icon: TabIcon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`chamfer-sm font-display relative flex items-center gap-2 border px-4 py-2 text-sm font-bold tracking-wide transition-colors ${
                  tab === id
                    ? 'text-ink-900 border-amber-500 bg-amber-500'
                    : 'border-parchment-500/20 bg-wood-900/60 text-parchment-500/70 hover:text-parchment-300 hover:border-amber-500/50'
                }`}
                data-testid={`hall-tab-${id}`}
              >
                <TabIcon size={15} />
                {label}
              </button>
            ))}
          </div>

          <div ref={frame} className="min-h-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={snappy}
                className="h-full"
              >
                {tab === 'heroes' && (
                  <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
                    <TavernPanel
                      className="flex min-h-0 flex-col"
                      bodyClassName="flex-1 min-h-0"
                      title="Every hero in Aldenvale"
                      headerSlot={
                        <input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Name, guild, or a rank to jump to"
                          className="chamfer-sm border-parchment-500/20 bg-wood-900/70 text-parchment-300 placeholder:text-parchment-500/40 w-72 border px-3 py-1.5 text-xs outline-none focus:border-amber-500/60"
                          data-testid="hall-search"
                        />
                      }
                      data-testid="hall-heroes"
                    >
                      {filtered.length === 0 ? (
                        <p className="text-parchment-500/55 py-10 text-center text-sm">
                          Nobody by that name has set foot in Aldenvale.
                        </p>
                      ) : (
                        <LadderList
                          entries={filtered}
                          height={listHeight - 96}
                          {...(focusRank !== undefined ? { focusRank } : {})}
                          selectedId={selected?.id ?? null}
                          onSelect={setSelected}
                        />
                      )}
                    </TavernPanel>

                    <div className="min-h-0">
                      {selected ? (
                        <ProfileCard entry={selected} playerRank={playerRank} onClose={close} />
                      ) : (
                        <TavernPanel title="A name, please">
                          <p className="text-parchment-500/55 text-xs leading-relaxed">
                            Pick anyone on the list to see who they are. Search by name or guild, or
                            type a rank to jump straight to it.
                          </p>
                          <p className="text-parchment-500/40 mt-3 text-xs leading-relaxed">
                            ★ marks a legend — the ten names at the top of Aldenvale since the realm
                            opened. Faded rows have not been seen in a while.
                          </p>
                        </TavernPanel>
                      )}
                    </div>
                  </div>
                )}

                {tab === 'guilds' && (
                  <TavernPanel
                    className="flex h-full min-h-0 flex-col"
                    bodyClassName="flex-1 min-h-0 overflow-y-auto"
                    title="Sixty halls, by the honour of their best twenty"
                    data-testid="hall-guilds"
                  >
                    <motion.ol
                      initial="hidden"
                      animate="visible"
                      transition={staggerChildren(0.015)}
                      className="space-y-1.5"
                    >
                      {standings.map((standing, index) => {
                        const banner = guild(standing.guildId);
                        return (
                          <motion.li
                            key={standing.guildId}
                            variants={listItemIn}
                            className="chamfer-sm border-parchment-500/10 bg-wood-900/45 flex items-center gap-3 border px-3 py-2"
                            data-testid={`guild-row-${standing.guildId}`}
                          >
                            <span className="font-display text-parchment-500/60 w-10 shrink-0 text-right text-xs font-bold tabular-nums">
                              #{index + 1}
                            </span>
                            {banner && <GuildBanner field={banner.field} charge={banner.charge} size={20} />}
                            <span className="min-w-0 flex-1">
                              <span className="font-display text-parchment-300 block truncate text-sm font-bold">
                                {standing.name}
                              </span>
                              <span className="text-parchment-500/45 block truncate text-xs italic">
                                {standing.motto}
                              </span>
                            </span>
                            <span className="text-parchment-500/50 w-28 shrink-0 text-right text-xs tabular-nums">
                              {standing.memberCount} members
                            </span>
                            <span className="text-parchment-500/50 w-24 shrink-0 text-right text-xs tabular-nums">
                              best #{standing.bestRank.toLocaleString()}
                            </span>
                            <span className="w-28 shrink-0 text-right text-sm text-amber-500 tabular-nums">
                              {standing.honor.toLocaleString()}
                            </span>
                          </motion.li>
                        );
                      })}
                    </motion.ol>
                  </TavernPanel>
                )}

                {tab === 'legends' && (
                  <TavernPanel
                    className="flex h-full min-h-0 flex-col"
                    bodyClassName="flex-1 min-h-0 overflow-y-auto"
                    title="The weekly ten"
                    data-testid="hall-legends"
                  >
                    {save.arena.legends.length === 0 ? (
                      <p className="text-parchment-500/55 py-10 text-center text-sm">
                        The first archive is written on Sunday. Come back then and every week after
                        it will be here.
                      </p>
                    ) : (
                      <ol className="space-y-3">
                        {save.arena.legends.map((week) => (
                          <li
                            key={week.weekKey}
                            className="chamfer-sm border-parchment-500/10 bg-wood-900/45 border px-4 py-3"
                            data-testid={`legends-week-${week.weekKey}`}
                          >
                            <div className="mb-2 flex items-baseline justify-between">
                              <p className="font-display text-sm font-bold text-amber-500">
                                Week ending {week.weekKey}
                              </p>
                              <p className="text-parchment-500/50 text-xs tabular-nums">
                                You finished #{week.playerRank.toLocaleString()}
                              </p>
                            </div>
                            <ol className="grid gap-1 sm:grid-cols-2">
                              {week.ids.map((id, place) => {
                                const name =
                                  id === PLAYER_LADDER_ID
                                    ? hero.name
                                    : botIdentity(world.seed, id).name;
                                return (
                                  <li
                                    key={`${week.weekKey}:${id}`}
                                    className={`flex items-baseline gap-2 text-xs ${
                                      id === PLAYER_LADDER_ID
                                        ? 'font-bold text-amber-500'
                                        : 'text-parchment-500/65'
                                    }`}
                                  >
                                    <span className="w-5 shrink-0 text-right tabular-nums opacity-60">
                                      {place + 1}
                                    </span>
                                    <span className="truncate">{name}</span>
                                  </li>
                                );
                              })}
                            </ol>
                          </li>
                        ))}
                      </ol>
                    )}
                  </TavernPanel>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </AmbientStage>
    </div>
  );
}

/**
 * A hero's profile card.
 *
 * No honor-history sparkline, which the spec asks for: the save keeps one honor figure per bot,
 * not a series, and storing a fortnight of samples for 1,500 heroes would add roughly 40 KB to
 * every write for a line nobody makes decisions on. Logged in the Phase 9 notes; the card shows
 * what the world actually knows.
 */
function ProfileCard({
  entry,
  playerRank,
  onClose,
}: {
  entry: LadderEntry;
  playerRank: number;
  onClose: () => void;
}) {
  const hall = guild(entry.guildId);
  const challengeable = !entry.isPlayer && isAttackable(playerRank, entry.rank);

  return (
    <motion.div
      key={entry.id}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={dramatic}
    >
      <TavernPanel
        title={entry.isPlayer ? 'You' : 'Who they are'}
        headerSlot={
          <button
            type="button"
            onClick={onClose}
            className="text-parchment-500/50 text-xs hover:text-amber-500"
          >
            Close
          </button>
        }
        data-testid="hall-profile"
      >
        <div className="flex items-start gap-3">
          <span className="chamfer-sm border-parchment-500/20 relative h-20 w-20 shrink-0 overflow-hidden border">
            <Image
              src={entry.portrait}
              alt=""
              width={80}
              height={80}
              className="h-full w-full object-cover"
            />
          </span>
          <div className="min-w-0">
            <p className="font-display text-parchment-300 truncate text-lg font-extrabold">
              {entry.name}
              {entry.legend && <span className="ml-2 text-amber-500">★</span>}
            </p>
            <p className="text-parchment-500/60 text-xs">
              Rank #{entry.rank.toLocaleString()} · level {entry.level}
            </p>
            <p className="text-parchment-500/60 text-xs">{hall ? hall.name : 'Unguilded'}</p>
            <p className="mt-1 text-xs text-amber-500 tabular-nums">
              {entry.honor.toLocaleString()} honour
            </p>
          </div>
        </div>

        {hall && <p className="text-parchment-500/45 mt-3 text-xs italic">“{hall.motto}”</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.rival && (
            <span className="chamfer-sm border-blood-600/50 bg-blood-600/12 text-blood-600 border px-2 py-0.5 text-[0.6rem] font-bold tracking-wider uppercase">
              Your rival
            </span>
          )}
          {entry.dormant && (
            <span className="chamfer-sm border-parchment-500/20 bg-wood-900/60 text-parchment-500/55 border px-2 py-0.5 text-[0.6rem] font-bold tracking-wider uppercase">
              Not been seen
            </span>
          )}
        </div>

        {!entry.isPlayer && (
          <div className="mt-4">
            <ActionButton
              size="sm"
              variant="secondary"
              fullWidth
              {...(challengeable ? {} : { disabledReason: 'Too far from your rung to challenge.' })}
              onClick={() => {
                window.location.href = '/arena';
              }}
              data-testid="hall-challenge"
            >
              {challengeable ? 'Take it to the sand' : 'Out of reach'}
            </ActionButton>
            <p className="text-parchment-500/40 mt-2 text-xs leading-relaxed">
              {challengeable
                ? 'They are near enough your rung to be drawn at the Proving Grounds.'
                : 'Only heroes near your own rung sign up to fight you. Climb first.'}
            </p>
          </div>
        )}
      </TavernPanel>
    </motion.div>
  );
}
