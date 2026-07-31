'use client';

/**
 * The locked-door screen, and the guard that shows it.
 *
 * The nav rail already refuses to link to a place the hero has not unlocked, which was enough
 * while every gated room was a dressed placeholder. It stopped being enough in Phase 6: the
 * City Watch pays real gold, and a level-1 hero could reach it by typing the URL.
 *
 * A gate is a game rule, so it is enforced where the room is rendered rather than only where it
 * is linked. The room itself stays ignorant of gating — it is wrapped, not modified.
 */

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { gateFor } from '@/engine/progression/gates';
import type { PlaceDef } from '@/data/places';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { KeeperBark } from '@/components/ui/KeeperBark';
import { Icon, LockIcon } from '@/components/icons';
import { useGameStore } from '@/state/gameStore';
import { dramatic } from '@/styles/motion';

export function GatedPlace({ place, children }: { place: PlaceDef; children: ReactNode }) {
  const level = useGameStore((state) => state.save?.hero?.level ?? null);
  const status = useGameStore((state) => state.status);

  // Nothing loaded yet: render nothing rather than flashing a locked door at someone who has
  // every right to be here.
  if (status !== 'ready' || level === null) return null;

  const gate = gateFor(place.id, level);
  if (gate.unlocked) return <>{children}</>;

  return (
    <AmbientStage
      backdrop={place.backdrop}
      {...(place.tint ? { tint: place.tint } : {})}
      {...(place.effects ? { effects: place.effects } : {})}
    >
      <div className="flex h-full items-center justify-center p-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={dramatic}
          className="w-full max-w-lg"
        >
          <TavernPanel title={place.name} elevation="floating" data-testid={`locked-${place.id}`}>
            <div className="flex items-start gap-4">
              <span className="chamfer-sm bg-wood-900/70 text-parchment-500/72 grid h-11 w-11 shrink-0 place-items-center border border-amber-500/20">
                <LockIcon size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-parchment-300/90 text-sm">{place.blurb}</p>
                <p className="text-parchment-500/72 mt-2 text-sm">
                  Opens at <span className="font-bold text-amber-500">level {gate.gateLevel}</span>
                  {' — '}
                  {gate.levelsRemaining === 1
                    ? 'one more level to go.'
                    : `${gate.levelsRemaining} more levels to go.`}
                </p>
              </div>
            </div>

            {place.keeper && (
              <div className="mt-6">
                <KeeperBark
                  keeper={place.keeper}
                  line={`Not yet. Come back when you have a few more miles on you.`}
                  data-testid={`bark-locked-${place.id}`}
                />
              </div>
            )}

            <p className="text-parchment-500/72 border-parchment-500/12 mt-6 flex items-center gap-2 border-t pt-4 text-xs">
              <Icon name={place.icon} size={14} />
              Run missions from the Gilded Tankard to get there.
            </p>
          </TavernPanel>
        </motion.div>
      </div>
    </AmbientStage>
  );
}
