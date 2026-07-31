'use client';

/**
 * Battle scene harness (`/dev/battle`).
 *
 * Phase 4 has no mission system to launch a fight from yet, so this is where the scene is
 * built and judged: pick a matchup, watch it, check the length against the ≤8s target, and
 * flip to reduced motion to confirm the fight is still followable without the ceremony.
 *
 * Missions (Phase 5) will mount `BattleScene` exactly like this page does.
 */

import { useMemo, useState } from 'react';
import { CLASSES } from '@/data/classes';
import { ARCHETYPES, type ArchetypeId } from '@/data/monsterArchetypes';
import { buildMonsterCombatant, buildReferenceCombatant } from '@/engine/combat/combatant';
import { fight } from '@/engine/combat/fight';
import { analyseBattle } from '@/engine/combat/analysis';
import { generateItem } from '@/engine/items/generate';
import { createRng } from '@/engine/rng';
import type { ClassId } from '@/engine/items/types';
import { BattleScene } from '@/components/battle/BattleScene';
import { BattleResult } from '@/components/battle/BattleResult';
import { buildTimeline, timelineDuration } from '@/components/battle/timeline';
import {
  DEFAULT_CHOREO,
  SPEED_OPTIONS,
  type PlaybackSpeed,
} from '@/components/battle/battleChoreo';
import { ActionButton } from '@/components/ui/ActionButton';
import { TavernPanel } from '@/components/ui/TavernPanel';

type Opponent = { kind: 'class'; id: ClassId } | { kind: 'monster'; id: ArchetypeId };

const BACKDROPS = [
  '/assets/backgrounds/mission_background_3.png',
  '/assets/backgrounds/mission_background_7.png',
  '/assets/backgrounds/mission_background_12.png',
  '/assets/backgrounds/arena_background.png',
  '/assets/backgrounds/dungeons_background.png',
] as const;

export default function BattleDevPage() {
  const [heroClass, setHeroClass] = useState<ClassId>('swashbuckler');
  const [opponent, setOpponent] = useState<Opponent>({ kind: 'monster', id: 'bruiser' });
  const [level, setLevel] = useState(25);
  const [seed, setSeed] = useState(7);
  const [backdrop, setBackdrop] = useState<string>(BACKDROPS[0]);
  /** Forces a fresh mount so entrances replay from the top. */
  const [take, setTake] = useState(0);

  /**
   * Local, not persisted. This page sits outside the game shell so it has no save to write
   * to; the real screens hand `onSpeedChange` the store's `setBattleSpeed` instead.
   */
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);

  const { result, analysis, lootDrop, opponentName } = useMemo(() => {
    const hero = buildReferenceCombatant(heroClass, level, heroClass);
    const archetype = ARCHETYPES.find((a) => a.id === opponent.id);
    const foe =
      opponent.kind === 'class'
        ? buildReferenceCombatant(opponent.id, level, `${opponent.id}-foe`)
        : buildMonsterCombatant({
            id: opponent.id,
            name: archetype?.name ?? opponent.id,
            archetypeId: opponent.id,
            level,
          });

    const battle = fight(hero, foe, seed);
    return {
      result: battle,
      analysis: analyseBattle(battle.log, 'a'),
      lootDrop: generateItem({
        slot: 'chest',
        rarity: 'rare',
        classId: heroClass,
        level,
        rng: createRng(seed, 'dev/loot'),
      }),
      opponentName: foe.name,
    };
  }, [heroClass, opponent, level, seed]);

  const runtime = useMemo(() => {
    const timeline = buildTimeline(result.log, DEFAULT_CHOREO);
    return timelineDuration(timeline, speed) / 1000;
  }, [result.log, speed]);

  const victory = result.winner === 'a';
  const withinTarget = runtime <= 8;

  return (
    <div className="min-h-screen p-6">
      <header className="mb-5">
        <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
          TavernRPG · Scene
        </p>
        <h1 className="font-display text-parchment-300 text-4xl font-extrabold">Battle Scene</h1>
        <p className="text-parchment-500/72 mt-1.5 max-w-2xl text-sm">
          The same seeded log the engine viewer prints, choreographed. Nothing here can change the
          outcome — the fight is already decided before the first frame draws.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <TavernPanel title="Matchup" animate={false}>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-parchment-500/72 mb-1.5 text-xs tracking-widest uppercase">
                  Hero
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CLASSES.map((definition) => (
                    <ActionButton
                      key={definition.id}
                      size="sm"
                      variant={definition.id === heroClass ? 'primary' : 'secondary'}
                      onClick={() => setHeroClass(definition.id)}
                      data-testid={`scene-hero-${definition.id}`}
                    >
                      {definition.name}
                    </ActionButton>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-parchment-500/72 mb-1.5 text-xs tracking-widest uppercase">
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
                <span className="text-parchment-500/72 mb-1 block text-xs tracking-widest uppercase">
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

              <div>
                <p className="text-parchment-500/72 mb-1.5 text-xs tracking-widest uppercase">
                  Backdrop
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {BACKDROPS.map((path) => (
                    <ActionButton
                      key={path}
                      size="sm"
                      variant={path === backdrop ? 'primary' : 'secondary'}
                      onClick={() => setBackdrop(path)}
                    >
                      {path.split('/').pop()?.replace('_background', '').replace('.png', '')}
                    </ActionButton>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ActionButton
                  size="sm"
                  onClick={() => {
                    setSeed((value) => value + 1);
                    setTake((value) => value + 1);
                  }}
                  data-testid="scene-next-seed"
                >
                  Next seed ({seed})
                </ActionButton>
                <ActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() => setTake((value) => value + 1)}
                  data-testid="scene-restage"
                >
                  Re-stage
                </ActionButton>
              </div>
            </div>
          </TavernPanel>

          <TavernPanel title="Pacing" animate={false}>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-parchment-500/72">Events</dt>
                <dd className="text-parchment-300">{result.log.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-parchment-500/72">Rounds</dt>
                <dd className="text-parchment-300">{result.rounds}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-parchment-500/72">Run time at ×{speed}</dt>
                <dd
                  className={withinTarget ? 'text-moss-400' : 'text-blood-400'}
                  data-testid="scene-runtime"
                >
                  {runtime.toFixed(1)}s
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-parchment-500/72">Target (mission, ×1)</dt>
                <dd className="text-parchment-500/72">≤ 8.0s</dd>
              </div>
            </dl>
            <div className="mt-3 flex gap-1.5">
              {SPEED_OPTIONS.map((option) => (
                <ActionButton
                  key={option}
                  size="sm"
                  variant={option === speed ? 'primary' : 'secondary'}
                  onClick={() => setSpeed(option)}
                >
                  ×{option}
                </ActionButton>
              ))}
            </div>
          </TavernPanel>
        </div>

        <div
          className="chamfer-md edge-etched border-parchment-500/15 relative min-h-[640px] overflow-hidden border"
          data-testid="scene-host"
        >
          <BattleScene
            key={`${heroClass}-${opponent.kind}-${opponent.id}-${level}-${seed}-${take}`}
            log={result.log}
            backdrop={backdrop}
            initialSpeed={speed}
            onSpeedChange={setSpeed}
            result={
              <BattleResult
                victory={victory}
                analysis={analysis}
                heroName={CLASSES.find((c) => c.id === heroClass)?.name ?? 'Hero'}
                opponentName={opponentName}
                rewards={
                  victory
                    ? {
                        gold: 120 + level * 34,
                        xp: 80 + level * 26,
                        item: lootDrop,
                        bonuses: [{ label: 'Guild Treasury', amount: '+8%' }],
                      }
                    : undefined
                }
                onContinue={() => setTake((value) => value + 1)}
                continueLabel="Fight again"
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
