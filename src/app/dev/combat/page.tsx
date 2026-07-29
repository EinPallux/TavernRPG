'use client';

/**
 * Dev combat viewer (`/dev/combat`) — Phase 3's only UI.
 *
 * The engine emits logs; Phase 4 turns them into a choreographed scene. In between, this page
 * exists so the maths can be *watched* rather than inferred from test output: pick two
 * fighters, run the seed, read every roll. It is also the fastest way to sanity-check a
 * balance change before committing to it.
 */

import { useMemo, useState } from 'react';
import { CLASSES } from '@/data/classes';
import { ARCHETYPES } from '@/data/monsterArchetypes';
import { buildMonsterCombatant, buildReferenceCombatant } from '@/engine/combat/combatant';
import { fight } from '@/engine/combat/fight';
import { simulate } from '@/engine/combat/simulate';
import { VERSES } from '@/engine/combat/verses';
import type { BattleEvent } from '@/engine/combat/types';
import type { ClassId } from '@/engine/items/types';
import type { ArchetypeId } from '@/data/monsterArchetypes';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';

type Opponent = { kind: 'class'; id: ClassId } | { kind: 'monster'; id: ArchetypeId };

function eventLine(event: BattleEvent): { text: string; tone: string } {
  switch (event.t) {
    case 'battle_start':
      return {
        text: `${event.a.name} (${event.a.maxHealth} hp) vs ${event.b.name} (${event.b.maxHealth} hp) — ${event.first === 'a' ? event.a.name : event.b.name} moves first`,
        tone: 'text-amber-500',
      };
    case 'round_start':
      return { text: `Round ${event.n}`, tone: 'text-parchment-500/45 mt-2' };
    case 'verse_change':
      return {
        text: `  ${event.side.toUpperCase()} strikes up ${VERSES[event.verse].name} — ${VERSES[event.verse].blurb}`,
        tone: 'text-arcane-500',
      };
    case 'attack':
      return {
        text: `  ${event.source.toUpperCase()} attacks${event.followUp ? ' again' : ''}: ${event.final}${event.crit ? '  ✦ CRIT' : ''}${event.raw !== event.final ? `  (${event.raw} before armour)` : ''}`,
        tone: event.crit ? 'text-amber-400' : 'text-parchment-300/85',
      };
    case 'blocked':
      return { text: `  ${event.target.toUpperCase()} blocks`, tone: 'text-parchment-500/60' };
    case 'dodged':
      return { text: `  ${event.target.toUpperCase()} slips aside`, tone: 'text-parchment-500/60' };
    case 'missed':
      return { text: `  ${event.source.toUpperCase()} swings wide`, tone: 'text-parchment-500/60' };
    case 'damage':
      return {
        text: `      ${event.target.toUpperCase()} −${event.amount} → ${event.hpAfter} hp`,
        tone: 'text-blood-600/90',
      };
    case 'ko':
      return {
        text: `  ${event.target.toUpperCase()} goes down`,
        tone: 'text-blood-600 font-bold',
      };
    case 'battle_end':
      return {
        text: `${event.winner.toUpperCase()} wins after ${event.rounds} rounds (${event.reason.replace('_', ' ')})`,
        tone: 'text-moss-600 font-bold mt-2',
      };
  }
}

export default function CombatDevPage() {
  const [heroClass, setHeroClass] = useState<ClassId>('warrior');
  const [opponent, setOpponent] = useState<Opponent>({ kind: 'monster', id: 'bruiser' });
  const [level, setLevel] = useState(25);
  const [seed, setSeed] = useState(1);

  const { result, summary } = useMemo(() => {
    const hero = buildReferenceCombatant(heroClass, level, heroClass);
    const foe =
      opponent.kind === 'class'
        ? buildReferenceCombatant(opponent.id, level, `${opponent.id}-foe`)
        : buildMonsterCombatant({
            id: opponent.id,
            name: ARCHETYPES.find((a) => a.id === opponent.id)!.name,
            archetypeId: opponent.id,
            level,
          });

    return {
      result: fight(hero, foe, seed),
      summary: simulate(hero, foe, { fights: 600, seed: 4242 }),
    };
  }, [heroClass, opponent, level, seed]);

  return (
    <div className="min-h-screen p-8">
      <header className="mb-6">
        <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
          TavernRPG · Engine
        </p>
        <h1 className="font-display text-parchment-300 text-4xl font-extrabold">Combat Viewer</h1>
        <p className="text-parchment-500/60 mt-2 max-w-2xl text-sm">
          Every roll the engine made, for one seeded fight. Phase 4 turns this same log into an
          animated scene — nothing about the maths changes, only how it is shown.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <TavernPanel title="Matchup" animate={false}>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-parchment-500/60 mb-1.5 text-xs tracking-widest uppercase">
                  Hero
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CLASSES.map((definition) => (
                    <ActionButton
                      key={definition.id}
                      size="sm"
                      variant={definition.id === heroClass ? 'primary' : 'secondary'}
                      onClick={() => setHeroClass(definition.id)}
                      data-testid={`dev-hero-${definition.id}`}
                    >
                      {definition.name}
                    </ActionButton>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-parchment-500/60 mb-1.5 text-xs tracking-widest uppercase">
                  Opponent
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ARCHETYPES.map((template) => (
                    <ActionButton
                      key={template.id}
                      size="sm"
                      variant={
                        opponent.kind === 'monster' && opponent.id === template.id
                          ? 'primary'
                          : 'secondary'
                      }
                      onClick={() => setOpponent({ kind: 'monster', id: template.id })}
                    >
                      {template.name}
                    </ActionButton>
                  ))}
                  {CLASSES.map((definition) => (
                    <ActionButton
                      key={definition.id}
                      size="sm"
                      variant={
                        opponent.kind === 'class' && opponent.id === definition.id
                          ? 'primary'
                          : 'secondary'
                      }
                      onClick={() => setOpponent({ kind: 'class', id: definition.id })}
                    >
                      vs {definition.name}
                    </ActionButton>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="text-parchment-500/60 mb-1 block text-xs tracking-widest uppercase">
                  Level {level}
                </span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={level}
                  onChange={(event) => setLevel(Number(event.target.value))}
                  className="w-full accent-amber-500"
                />
              </label>

              <div className="flex items-center gap-2">
                <ActionButton size="sm" onClick={() => setSeed((value) => value + 1)}>
                  Next seed ({seed})
                </ActionButton>
                <ActionButton size="sm" variant="secondary" onClick={() => setSeed(1)}>
                  Reset
                </ActionButton>
              </div>
            </div>
          </TavernPanel>

          <TavernPanel title="Over 600 fights" animate={false}>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-parchment-500/65">Hero win rate</dt>
                <dd className="text-parchment-300">{(summary.winRateA * 100).toFixed(1)}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-parchment-500/65">Average length</dt>
                <dd className="text-parchment-300">{summary.averageRounds.toFixed(1)} rounds</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-parchment-500/65">Hit the round limit</dt>
                <dd className="text-parchment-300">{(summary.roundLimitRate * 100).toFixed(1)}%</dd>
              </div>
            </dl>
          </TavernPanel>
        </div>

        <TavernPanel
          title="Battle log"
          headerSlot={
            <span className="text-parchment-500/45 text-xs">
              {result.log.length} events · seed {seed}
            </span>
          }
          animate={false}
        >
          <ol className="max-h-[70vh] overflow-y-auto font-mono text-xs leading-relaxed">
            {result.log.map((event, index) => {
              const line = eventLine(event);
              return (
                <li key={index} className={line.tone}>
                  {line.text}
                </li>
              );
            })}
          </ol>
        </TavernPanel>
      </div>
    </div>
  );
}
