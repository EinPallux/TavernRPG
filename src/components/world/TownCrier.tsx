'use client';

/**
 * The Town Crier board (world-simulation spec §6).
 *
 * This panel is the only place the simulation is *visible*. Fifteen hundred heroes levelling and
 * swapping ranks changes numbers nobody looks at; the feed is what turns that into a world the
 * player believes in. So it gets the polish the spec asks for: entries slide in under a wax
 * seal, categories collapse, and nothing here ever blocks input.
 *
 * The one rule the component inherits from the engine: it renders `FeedEntry` values and never
 * composes a headline of its own. If the Crier is saying it, the simulation did it.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { CrierCategory } from '@/data/crierTemplates';
import type { CrierRelation, FeedEntry } from '@/engine/world/crier';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { Icon, type IconId } from '@/components/icons';
import { listItemIn, snappy, staggerChildren, standard } from '@/styles/motion';

/** How each category presents itself. Order here is the order of the filter chips. */
const CATEGORY_LOOK: Readonly<
  Record<CrierCategory, { label: string; icon: IconId; tone: string }>
> = {
  milestone: { label: 'Milestones', icon: 'laurel', tone: 'text-amber-400' },
  ladder: { label: 'The ladder', icon: 'arena', tone: 'text-arcane-500' },
  taunt: { label: 'Rivals', icon: 'banner', tone: 'text-blood-400' },
  levelUp: { label: 'Level-ups', icon: 'spark', tone: 'text-moss-400' },
  guild: { label: 'Guilds', icon: 'gem', tone: 'text-amber-500' },
  lifecycle: { label: 'Comings and goings', icon: 'hero', tone: 'text-parchment-500/72' },
  flavour: { label: 'Emberhollow', icon: 'tankard', tone: 'text-ember-400' },
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LOOK) as CrierCategory[];

/** Names the player knows are marked, because that is the whole point of the priority rule. */
const RELATION_BADGE: Partial<Record<CrierRelation, string>> = {
  rival: 'Rival',
  guildmate: 'Guild',
  neighbour: 'Nearby',
};

function ago(at: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/** The wax seal each entry arrives under. Pressed on, then settles. */
function Seal({ category, sealed }: { category: CrierCategory; sealed: boolean }) {
  const look = CATEGORY_LOOK[category];
  return (
    <motion.span
      className={`chamfer-sm bg-wood-900/80 grid h-8 w-8 shrink-0 place-items-center border border-amber-500/25 ${look.tone}`}
      initial={sealed ? { scale: 1.6, rotate: -14, opacity: 0 } : false}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={snappy}
      aria-hidden
    >
      <Icon name={look.icon} size={17} />
    </motion.span>
  );
}

export interface TownCrierProps {
  readonly entries: readonly FeedEntry[];
  readonly now: number;
  /** Cap the rendered list; the board is a glance, not an archive. */
  readonly limit?: number;
}

export function TownCrier({ entries, now, limit = 14 }: TownCrierProps) {
  const reduced = useReducedMotion();
  const [muted, setMuted] = useState<ReadonlySet<CrierCategory>>(new Set());

  const present = useMemo(() => {
    const seen = new Set<CrierCategory>();
    for (const entry of entries) seen.add(entry.category);
    return CATEGORY_ORDER.filter((category) => seen.has(category));
  }, [entries]);

  /**
   * The visible board, newest first — but not simply the newest `limit`.
   *
   * The feed itself is already balanced across categories, and taking a plain slice off the top
   * threw that away: the last hours of a tick are ladder-heavy, so the board came out fourteen
   * ladder passes even though the feed behind it was mixed. Selection keeps the same per-category
   * ceiling the engine uses, then restores time order for display.
   */
  const shown = useMemo(() => {
    const visible = entries.filter((entry) => !muted.has(entry.category));
    const perCategory = Math.max(2, Math.round(limit * 0.4));

    const used = new Map<CrierCategory, number>();
    const picked: FeedEntry[] = [];
    const held: FeedEntry[] = [];

    for (const entry of visible) {
      if (picked.length >= limit) break;
      const count = used.get(entry.category) ?? 0;
      if (count >= perCategory) {
        held.push(entry);
        continue;
      }
      used.set(entry.category, count + 1);
      picked.push(entry);
    }

    // A one-note day still fills the board rather than showing a short list.
    for (const entry of held) {
      if (picked.length >= limit) break;
      picked.push(entry);
    }

    return picked.sort((a, b) => b.at - a.at);
  }, [entries, limit, muted]);

  const toggle = (category: CrierCategory) => {
    setMuted((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <TavernPanel
      title="The Town Crier"
      headerSlot={
        <span className="text-parchment-500/72 text-xs">{entries.length} in the book</span>
      }
      data-testid="town-crier"
    >
      {/* Collapsible categories (spec §6). Muting is local and disposable — a filter the
          player forgot they set would be worse than no filter. */}
      {present.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5" data-testid="crier-filters">
          {present.map((category) => {
            const look = CATEGORY_LOOK[category];
            const on = !muted.has(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggle(category)}
                aria-pressed={on}
                data-testid={`crier-filter-${category}`}
                className={`chamfer-sm flex items-center gap-1.5 border px-2 py-1 text-[11px] tracking-wide transition-colors ${
                  on
                    ? `bg-wood-900/60 border-amber-500/35 ${look.tone}`
                    : 'border-parchment-500/10 bg-wood-900/25 text-parchment-500/72'
                }`}
              >
                <Icon name={look.icon} size={11} />
                {look.label}
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-parchment-500/72 py-6 text-center text-sm" data-testid="crier-empty">
          The board is bare. Emberhollow is having a quiet morning.
        </p>
      ) : (
        <motion.ul
          initial="hidden"
          animate="visible"
          transition={staggerChildren(0.035)}
          className="space-y-1.5"
          data-testid="crier-entries"
        >
          <AnimatePresence initial={false}>
            {shown.map((entry) => {
              const badge = RELATION_BADGE[entry.relation];
              return (
                <motion.li
                  key={entry.id}
                  variants={listItemIn}
                  layout={!reduced}
                  exit={{ opacity: 0, x: -8 }}
                  transition={standard}
                  className="chamfer-sm border-parchment-500/10 bg-wood-900/45 flex items-start gap-2.5 border px-2.5 py-2"
                  data-testid={`crier-entry-${entry.category}`}
                  data-relation={entry.relation}
                >
                  <Seal category={entry.category} sealed={!reduced} />
                  <span className="min-w-0 flex-1">
                    <span className="text-parchment-300/90 block text-xs leading-snug">
                      {entry.text}
                    </span>
                    <span className="text-parchment-500/72 mt-0.5 flex items-center gap-2 text-[10px]">
                      {ago(entry.at, now)}
                      {badge && (
                        <span
                          className={`chamfer-sm border px-1 py-px tracking-wider uppercase ${
                            entry.relation === 'rival'
                              ? 'border-blood-600/45 text-blood-400'
                              : 'border-parchment-500/20 text-parchment-500/72'
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                    </span>
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}
    </TavernPanel>
  );
}
