'use client';

/**
 * The placeholder screen every unbuilt place renders (Phase 1 deliverable).
 *
 * It is not a "coming soon" grey box: the place is already dressed — its backdrop, its
 * ambience, its keeper telling you why the doors are shut — so the town feels real while it
 * fills in, and each phase's work is visibly slotting into a finished frame.
 */

import { AmbientStage } from '@/components/ui/AmbientStage';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { KeeperBark } from '@/components/ui/KeeperBark';
import { Icon } from '@/components/icons';
import type { PlaceDef } from '@/data/places';

export function PlaceScreen({ place }: { place: PlaceDef }) {
  return (
    <AmbientStage
      backdrop={place.backdrop}
      {...(place.tint ? { tint: place.tint } : {})}
      {...(place.effects ? { effects: place.effects } : {})}
    >
      <div className="flex h-full items-center justify-center p-10">
        <div className="w-full max-w-xl">
          <TavernPanel
            title={place.name}
            headerSlot={
              <span className="text-parchment-500/45 text-xs tracking-[0.2em] uppercase">
                {place.buildPhase}
              </span>
            }
            elevation="floating"
            data-testid={`place-${place.id}`}
          >
            <div className="flex items-start gap-4">
              <span className="chamfer-sm bg-wood-900/70 grid h-11 w-11 shrink-0 place-items-center border border-amber-500/25 text-amber-500">
                <Icon name={place.icon} size={22} />
              </span>
              <div className="min-w-0">
                <p className="text-parchment-300/90 text-sm">{place.blurb}</p>
                <p className="text-parchment-500/50 mt-2 text-xs leading-relaxed">
                  This room is dressed but not yet furnished — {place.buildPhase} builds what
                  happens here. The frame around it is real: navigation, HUD, panels and motion all
                  work today.
                </p>
              </div>
            </div>

            {place.keeper && (
              <div className="mt-6">
                <KeeperBark
                  keeper={place.keeper}
                  line={place.constructionBark}
                  data-testid={`bark-${place.id}`}
                />
              </div>
            )}

            {!place.keeper && (
              <p className="text-parchment-500/60 border-parchment-500/15 mt-6 border-t pt-4 text-sm italic">
                {place.constructionBark}
              </p>
            )}
          </TavernPanel>
        </div>
      </div>
    </AmbientStage>
  );
}
