'use client';

/**
 * The town rail (style guide §2).
 *
 * Navigation is meant to feel like walking Emberhollow, so places are grouped the way the
 * town is laid out and locked places stay *visible* as dimmed silhouettes with their level
 * tag — ambition you can see beats mystery-meat menus.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { GROUP_LABELS, NAV_GROUPS, PLACES, type PlaceDef } from '@/data/places';
import { gateFor, nextUnlock } from '@/engine/progression/gates';
import { Icon, ChevronIcon, LockIcon } from '@/components/icons';
import { useShellStore } from '@/state/shellStore';
import { useGameStore } from '@/state/gameStore';
import { snappy } from '@/styles/motion';

const RAIL_WIDTH = 240;
const RAIL_WIDTH_COLLAPSED = 72;

function RailItem({
  place,
  level,
  active,
  collapsed,
}: {
  place: PlaceDef;
  level: number;
  active: boolean;
  collapsed: boolean;
}) {
  const gate = gateFor(place.id, level);

  const body = (
    <>
      {/* Active marker: an amber bar with an ember glow, not a filled pill. */}
      <span
        aria-hidden
        className={`absolute top-1 bottom-1 left-0 w-[3px] transition-all ${
          active ? 'bg-amber-500 shadow-[0_0_10px_1px_rgb(232_163_61/0.65)]' : 'bg-transparent'
        }`}
      />
      <span
        className={`grid w-6 shrink-0 place-items-center transition-colors ${
          active
            ? 'text-amber-500'
            : gate.unlocked
              ? 'text-parchment-500/70'
              : 'text-parchment-500/25'
        }`}
      >
        {gate.unlocked ? <Icon name={place.icon} size={19} /> : <LockIcon size={16} />}
      </span>

      {!collapsed && (
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
          <span
            className={`font-display truncate text-[13px] tracking-[0.1em] transition-colors ${
              active
                ? 'text-amber-500'
                : gate.unlocked
                  ? 'text-parchment-300/90 group-hover:text-parchment-300'
                  : 'text-parchment-500/35'
            }`}
          >
            {place.railName ?? place.name}
          </span>
          {!gate.unlocked && (
            <span className="text-parchment-500/40 shrink-0 text-[10px] tracking-wider">
              Lv {gate.gateLevel}
            </span>
          )}
        </span>
      )}
    </>
  );

  const shared =
    'group relative flex items-center gap-3 py-2.5 pr-3 pl-4 transition-colors duration-150';

  if (!gate.unlocked) {
    return (
      <li>
        <div
          className={`${shared} cursor-not-allowed`}
          title={`${place.name} — unlocks at level ${gate.gateLevel} (${gate.levelsRemaining} to go)`}
          aria-disabled="true"
          data-testid={`nav-${place.id}`}
          data-locked="true"
        >
          {body}
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={place.route}
        title={collapsed ? `${place.name} — ${place.blurb}` : place.blurb}
        aria-current={active ? 'page' : undefined}
        data-testid={`nav-${place.id}`}
        data-locked="false"
        className={`${shared} hover:bg-wood-700/45 ${active ? 'bg-wood-700/60' : ''}`}
      >
        {body}
      </Link>
    </li>
  );
}

export function NavRail() {
  const pathname = usePathname();
  const collapsed = useShellStore((state) => state.settings.navCollapsed);
  const toggleNav = useShellStore((state) => state.toggleNav);
  const previewLevel = useShellStore((state) => state.preview.level);
  const heroLevel = useGameStore((state) => state.save?.hero?.level);
  // The hero's real level drives the gates; the preview value only stands in before creation.
  const level = heroLevel ?? previewLevel;

  const upcoming = nextUnlock(level);
  const settingsPlace = PLACES.find((place) => place.id === 'settings');

  return (
    <motion.nav
      aria-label="Emberhollow"
      initial={false}
      animate={{ width: collapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH }}
      transition={snappy}
      className="surface-timber bg-wood-800/95 relative z-20 flex h-full flex-col border-r border-amber-500/20"
    >
      <div className="flex items-center gap-2 px-4 py-4">
        <span aria-hidden className="text-amber-500">
          {/* Facet emblem — the same angular motif as the dividers and meters. */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 1l7 4.5v7L9 17l-7-4.5v-7L9 1Z" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9 5l3.5 2.2v3.6L9 13l-3.5-2.2V7.2L9 5Z" fill="currentColor" opacity={0.7} />
          </svg>
        </span>
        {!collapsed && (
          <span className="font-display flex-1 text-[11px] tracking-[0.3em] text-amber-500/85 uppercase">
            Emberhollow
          </span>
        )}
        <button
          type="button"
          onClick={toggleNav}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          data-testid="nav-toggle"
          className="text-parchment-500/45 transition-colors hover:text-amber-500"
        >
          <ChevronIcon size={16} className={collapsed ? '' : 'rotate-180'} />
        </button>
      </div>

      <div className="facet-rule mx-4 mb-2" />

      <div className="flex-1 overflow-y-auto">
        {NAV_GROUPS.map((group) => {
          const places = PLACES.filter((place) => place.group === group);
          if (places.length === 0) return null;

          return (
            <div key={group} className="mb-3">
              {!collapsed && (
                <p className="font-display text-parchment-500/35 px-4 py-1 text-[10px] tracking-[0.28em] uppercase">
                  {GROUP_LABELS[group]}
                </p>
              )}
              <ul>
                {places.map((place) => (
                  <RailItem
                    key={place.id}
                    place={place}
                    level={level}
                    active={pathname === place.route}
                    collapsed={collapsed}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Footer: what opens next, then settings. */}
      {!collapsed && upcoming && (
        <p className="text-parchment-500/40 border-parchment-500/10 border-t px-4 py-2.5 text-[11px] leading-snug">
          <span className="text-amber-500/70">{upcoming.place.name}</span> opens at level{' '}
          {upcoming.place.gateLevel}.
        </p>
      )}

      {settingsPlace && (
        <ul className="border-parchment-500/10 border-t py-1">
          <RailItem
            place={settingsPlace}
            level={level}
            active={pathname === settingsPlace.route}
            collapsed={collapsed}
          />
        </ul>
      )}
    </motion.nav>
  );
}
