'use client';

/**
 * Dev item drawer — conjures gear so the character screen can be exercised before loot exists.
 *
 * Explicitly a development tool: collapsed by default and labelled as such. Missions, shops and
 * dungeons all hand out real loot now, but a harness that can put *any* combination of gear on
 * the paperdoll on demand is still the only way to review comparisons, class locks and set glows
 * without playing for a week first.
 */

import { useRef, useState } from 'react';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { createRng, deriveSeed } from '@/engine/rng';
import { generateItem } from '@/engine/items/generate';
import { rollLegendary } from '@/engine/items/legendary';
import { legendariesFor } from '@/data/legendaries';
import { xpNeeded } from '@/engine/progression/xp';
import { RARITIES, SLOT_IDS, type Rarity, type SlotId } from '@/engine/items/types';
import type { Hero } from '@/engine/save/schema';
import { useGameStore } from '@/state/gameStore';
import { useShellStore } from '@/state/shellStore';

export function DevItemDrawer({ hero }: { hero: Hero }) {
  const grantItem = useGameStore((state) => state.grantItem);
  const grantXp = useGameStore((state) => state.grantXp);
  const grantGold = useGameStore((state) => state.grantGold);
  const pushToast = useShellStore((state) => state.pushToast);
  const [open, setOpen] = useState(false);
  const [rarity, setRarity] = useState<Rarity>('rare');
  /** Varies the seed per conjure without reaching for unseeded randomness. */
  const conjureCount = useRef(0);

  const conjure = (slot: SlotId) => {
    conjureCount.current += 1;
    const rng = createRng(
      deriveSeed(hero.createdAt, 'dev-conjure', conjureCount.current),
      'dev:conjure',
    );
    /*
     * Legendaries do not come out of `generateItem` — a legendary without its rolled affixes is
     * an item wearing the tier's colour and nothing else. The named draw is filtered to the slot
     * the button asked for, and comes back null when this class has nothing for it.
     */
    const item =
      rarity === 'legendary'
        ? (rollLegendary({
            classId: hero.classId,
            level: hero.level,
            rng,
            defId: legendariesFor(hero.classId).find((entry) => entry.slot === slot)?.id,
          }) ?? null)
        : generateItem({ level: hero.level, slot, rarity, classId: hero.classId, rng });
    if (!item) {
      pushToast({ title: 'Nothing to conjure', detail: `No legendary for ${slot}.`, tone: 'info' });
      return;
    }
    grantItem(item);
    pushToast({ title: item.name, detail: 'Conjured into your backpack.', tone: 'reward' });
  };

  const conjureFullSet = () => {
    for (const slot of SLOT_IDS) conjure(slot);
  };

  return (
    <TavernPanel
      title="Dev: conjure gear"
      headerSlot={
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          data-testid="dev-drawer-toggle"
          className="text-parchment-500/72 text-xs underline underline-offset-2 hover:text-amber-500"
        >
          {open ? 'hide' : 'show'}
        </button>
      }
      elevation="flush"
      data-testid="dev-drawer"
    >
      {open ? (
        <div className="space-y-3">
          <p className="text-parchment-500/72 text-[11px]">
            A development tool. Missions, shops and dungeons drop the real thing; this exists so any
            combination of gear can be put on the paperdoll on demand.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {RARITIES.map((option) => (
              <ActionButton
                key={option}
                size="sm"
                variant={option === rarity ? 'primary' : 'secondary'}
                onClick={() => setRarity(option)}
                data-testid={`dev-rarity-${option}`}
              >
                {option}
              </ActionButton>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SLOT_IDS.map((slot) => (
              <ActionButton
                key={slot}
                size="sm"
                variant="secondary"
                onClick={() => conjure(slot)}
                data-testid={`dev-conjure-${slot}`}
              >
                {slot}
              </ActionButton>
            ))}
          </div>

          <ActionButton size="sm" onClick={conjureFullSet} data-testid="dev-conjure-all">
            Conjure one of everything
          </ActionButton>

          <div className="border-parchment-500/15 flex flex-wrap gap-1.5 border-t pt-3">
            <ActionButton
              size="sm"
              variant="secondary"
              onClick={() => grantXp(xpNeeded(hero.level))}
              data-testid="dev-level-up"
            >
              Gain a level
            </ActionButton>
            <ActionButton
              size="sm"
              variant="secondary"
              onClick={() => {
                // Enough to open every gated place, for reviewing the rail.
                for (let level = hero.level; level < 10; level += 1) grantXp(xpNeeded(level));
              }}
              data-testid="dev-level-10"
            >
              Reach level 10
            </ActionButton>
            <ActionButton
              size="sm"
              variant="secondary"
              onClick={() => grantGold(10_000)}
              data-testid="dev-gold"
            >
              +10,000 gold
            </ActionButton>
          </div>
        </div>
      ) : (
        <p className="text-parchment-500/72 text-xs">
          Hidden. Open to spawn gear while loot sources are still being built.
        </p>
      )}
    </TavernPanel>
  );
}
