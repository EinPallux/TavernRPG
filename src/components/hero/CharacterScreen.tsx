'use client';

/**
 * The character screen (character spec §4): paperdoll, derived stats, attributes, backpack.
 *
 * Three columns at 1080p and above, all visible without scrolling, because comparing a drop
 * against what you wear is the game's most repeated action and must never require a scroll.
 *
 * Since Phase 12 it is also two **tabs**. The Set Collections page wants the whole width — five
 * silhouettes and three bonus rows per set, twice — and it is a page you visit deliberately
 * rather than glance at, so it gets its own view instead of being squeezed into a fourth column.
 */

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { classDef } from '@/data/classes';
import { compareItem, deriveStats, type Equipment } from '@/engine/hero/derived';
import { canEquip } from '@/engine/hero/actions';
import { levelProgress, xpNeeded } from '@/engine/progression/xp';
import { equippedSetCounts } from '@/engine/items/sets';
import { boostedArmour, boostedAttribute } from '@/engine/pets/boost';
import { BOOST_LABELS } from '@/data/pets';
import { currentBoost } from '@/state/petActions';
import { SLOT_LABELS, type Item, type SlotId } from '@/engine/items/types';
import type { Hero } from '@/engine/save/schema';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { Meter } from '@/components/ui/Meter';
import { ActionButton } from '@/components/ui/ActionButton';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { Term } from '@/components/ui/Term';
import { ItemSlot } from '@/components/items/ItemSlot';
import { Icon } from '@/components/icons';
import { AttributePanel } from './AttributePanel';
import { DevItemDrawer } from './DevItemDrawer';
import { SetCollections } from './SetCollections';
import { useGameStore } from '@/state/gameStore';
import { snappy, standard } from '@/styles/motion';

/** Paperdoll layout: weapon/offhand flank the portrait, armour down the left, jewellery right. */
const LEFT_COLUMN: SlotId[] = ['helmet', 'chest', 'gloves'];
const RIGHT_COLUMN: SlotId[] = ['amulet', 'ring', 'trinket'];
const BOTTOM_ROW: SlotId[] = ['boots', 'belt'];

/**
 * One derived number.
 *
 * `term` wires the label to the glossary when the game has a definition for it — this panel is
 * the densest patch of jargon in Emberhollow ("damage reduction cap", "main stat", "crit"), and
 * it is the screen a confused player opens first (tutorial spec §1).
 */
function StatLine({
  label,
  value,
  hint,
  term,
}: {
  label: string;
  value: string;
  hint?: string;
  term?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm" title={hint}>
      <span className="text-parchment-500/65">
        {term ? <Term name={term}>{label}</Term> : label}
      </span>
      <span className="text-parchment-300">{value}</span>
    </div>
  );
}

type Tab = 'gear' | 'sets';

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'gear', label: 'Gear & training' },
  { id: 'sets', label: 'Set collections' },
];

export function CharacterScreen({ hero }: { hero: Hero }) {
  const equipItem = useGameStore((state) => state.equipItem);
  const unequipItem = useGameStore((state) => state.unequipItem);
  const trainAttribute = useGameStore((state) => state.trainAttribute);
  const toggleItemLock = useGameStore((state) => state.toggleItemLock);
  const discardItem = useGameStore((state) => state.discardItem);
  const setOpeningVerse = useGameStore((state) => state.setOpeningVerse);
  /**
   * The companion at your side (pets spec §2).
   *
   * Read here rather than passed in so the breakdown, the derived panel and the fight all see
   * the same number — `deriveStats` is the one place a hero's stats are computed, and the pet
   * goes in through the same door as gear.
   */
  const save = useGameStore((state) => state.save);
  const pet = save ? currentBoost(save) : null;
  /**
   * Track the selection by uid, not by object: locking or equipping replaces the item in the
   * store, and a held snapshot would go stale (a just-locked item still offering "Discard").
   */
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('gear');

  const definition = classDef(hero.classId);
  const equipment = hero.equipment as Equipment;

  /**
   * How many pieces of each set are worn — what the paperdoll glow and the card's set band both
   * count. Spread onto a slot rather than passed as a possibly-undefined prop, because
   * `exactOptionalPropertyTypes` is on and `setWorn={undefined}` is not the same as absent.
   */
  const setCounts = useMemo(() => equippedSetCounts(equipment), [equipment]);
  const withSetGlow = (item: Item | null | undefined) =>
    item?.setId ? { setWorn: setCounts.get(item.setId) ?? 0 } : {};

  const petBoost = useMemo(() => {
    const attribute = boostedAttribute(pet);
    if (attribute) return { stat: attribute.stat, share: attribute.share } as const;
    const armour = boostedArmour(pet);
    return armour > 0 ? ({ stat: 'armour', share: armour } as const) : null;
  }, [pet]);

  const derived = useMemo(
    () =>
      deriveStats({
        classId: hero.classId,
        level: hero.level,
        trained: hero.trained,
        equipment,
        petBoost,
      }),
    [hero.classId, hero.level, hero.trained, equipment, petBoost],
  );

  const comparisonFor = (item: Item) =>
    compareItem(
      { classId: hero.classId, level: hero.level, trained: hero.trained, equipment },
      item,
    );

  const bagItems = [
    ...hero.backpack.map((item, index) => ({ item, key: `bag-${index}` })),
    ...hero.satchel.map((item, index) => ({ item, key: `satchel-${index}` })),
  ];

  const selected = bagItems.find(({ item }) => item?.uid === selectedUid)?.item ?? null;

  return (
    <AmbientStage
      backdrop="/assets/backgrounds/tavern_background.png"
      tint="from-wood-900 via-wood-900/90 to-wood-900/75"
      effects={['motes']}
    >
      <div className="h-full overflow-y-auto p-6">
        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div
          className="border-parchment-500/12 mx-auto mb-4 flex max-w-[2000px] gap-1 border-b"
          role="tablist"
          data-testid="character-tabs"
        >
          {TABS.map((entry) => {
            const active = entry.id === tab;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(entry.id)}
                className={`font-display relative px-4 py-2 text-sm tracking-wide transition-colors ${
                  active ? 'text-amber-400' : 'text-parchment-500/50 hover:text-parchment-300'
                }`}
                data-testid={`character-tab-${entry.id}`}
              >
                {entry.label}
                {active && (
                  <motion.span
                    layoutId="character-tab-underline"
                    transition={snappy}
                    className="absolute inset-x-2 -bottom-px h-0.5 bg-amber-500"
                  />
                )}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'sets' ? (
            <motion.div
              key="sets"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={standard}
              className="mx-auto max-w-[2000px]"
            >
              <SetCollections hero={hero} onChooseVerse={setOpeningVerse} />
            </motion.div>
          ) : (
            <motion.div
              key="gear"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={standard}
            >
              <div className="mx-auto grid max-w-[2000px] gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)_minmax(0,460px)]">
                {/* ── Paperdoll ─────────────────────────────────────────────── */}
                <TavernPanel
                  title={hero.name}
                  headerSlot={
                    <span className="text-parchment-500/50 text-xs tracking-wider uppercase">
                      Level {hero.level} {definition.name}
                    </span>
                  }
                  data-testid="paperdoll"
                >
                  <div className="flex items-start justify-center gap-3">
                    <div className="flex flex-col gap-2">
                      {LEFT_COLUMN.map((slot) => (
                        <ItemSlot
                          key={slot}
                          slot={slot}
                          item={equipment[slot] ?? null}
                          {...withSetGlow(equipment[slot])}
                          onClick={() => unequipItem(slot)}
                          data-testid={`equip-${slot}`}
                        />
                      ))}
                    </div>

                    <div className="flex flex-col items-center gap-2">
                      <div className="chamfer-md bg-wood-900 relative h-40 w-32 overflow-hidden border border-amber-500/30">
                        <Image
                          src={definition.portrait}
                          alt={`${hero.name}, ${definition.name}`}
                          width={128}
                          height={160}
                          className="h-full w-full object-cover"
                          priority
                        />
                      </div>
                      <div className="flex gap-2">
                        <ItemSlot
                          slot="weapon"
                          item={equipment.weapon ?? null}
                          size="lg"
                          onClick={() => unequipItem('weapon')}
                          data-testid="equip-weapon"
                        />
                        <ItemSlot
                          slot="offhand"
                          item={equipment.offhand ?? null}
                          size="lg"
                          onClick={() => unequipItem('offhand')}
                          data-testid="equip-offhand"
                        />
                      </div>
                      <div className="flex gap-2">
                        {BOTTOM_ROW.map((slot) => (
                          <ItemSlot
                            key={slot}
                            slot={slot}
                            item={equipment[slot] ?? null}
                            {...withSetGlow(equipment[slot])}
                            onClick={() => unequipItem(slot)}
                            data-testid={`equip-${slot}`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {RIGHT_COLUMN.map((slot) => (
                        <ItemSlot
                          key={slot}
                          slot={slot}
                          item={equipment[slot] ?? null}
                          onClick={() => unequipItem(slot)}
                          data-testid={`equip-${slot}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* The companion sits with the gear because that is what it is: a worn thing
                      you chose. Small, because the boost is small by design (pets spec §3). */}
                  {pet && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={snappy}
                      className="chamfer-sm mt-4 flex items-center gap-2.5 border border-amber-500/35 bg-amber-500/8 px-2.5 py-2"
                      data-testid="pet-chip"
                    >
                      <span className="text-amber-400">
                        <Icon name={pet.definition.iconId} size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-parchment-300 block truncate text-xs font-semibold">
                          {pet.name}
                        </span>
                        <span className="text-parchment-500/55 block text-[10px]">
                          {BOOST_LABELS[pet.stat]} +{(pet.share * 100).toFixed(1)}% · level{' '}
                          {pet.progress.level}
                        </span>
                      </span>
                    </motion.div>
                  )}

                  <div className="mt-5">
                    <Meter
                      value={hero.xp}
                      max={xpNeeded(hero.level)}
                      tone="xp"
                      label={`Experience — ${Math.round(levelProgress(hero.level, hero.xp) * 100)}% to level ${hero.level + 1}`}
                    />
                  </div>

                  <p className="text-parchment-500/40 mt-3 text-[11px]">
                    Click an equipped piece to take it off. Hover anything to compare.
                  </p>
                </TavernPanel>

                {/* ── Attributes + derived ──────────────────────────────────── */}
                <div className="space-y-5">
                  <AttributePanel
                    hero={hero}
                    derived={derived}
                    mainStat={definition.mainStat}
                    onTrain={trainAttribute}
                  />

                  <TavernPanel title="In a fight" data-testid="derived-panel">
                    <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                      <StatLine
                        label="Health"
                        value={derived.health.toLocaleString()}
                        hint={`Constitution ${derived.attributes.con} × (level ${hero.level} + 1) × ${definition.hpFactor}`}
                      />
                      <StatLine
                        label="Damage per hit"
                        value={`${derived.damage.min}–${derived.damage.max}`}
                        hint={`Weapon roll × (1 + ${definition.mainStat.toUpperCase()} ${derived.attributes[definition.mainStat]} / 10)`}
                      />
                      <StatLine
                        label="Critical chance"
                        term="Crit"
                        value={`${(derived.critChance * 100).toFixed(1)}%`}
                        hint="Luck × 5 ÷ (2 × opponent level), capped at 50%"
                      />
                      <StatLine label="Critical damage" value={`×${derived.critMultiplier}`} />
                      <StatLine
                        label="Armour"
                        term="Armour"
                        value={derived.armour.toLocaleString()}
                        hint="Total armour from equipped pieces"
                      />
                      <StatLine
                        label="Damage reduction"
                        term="Damage reduction cap"
                        value={`${(derived.damageReduction * 100).toFixed(1)}% of ${(derived.damageReductionCap * 100).toFixed(0)}% cap`}
                        hint="Against an opponent of your own level"
                      />
                      {derived.goldFind > 0 && (
                        <StatLine label="Gold found" value={`+${derived.goldFind}%`} />
                      )}
                      {derived.xpBonus > 0 && (
                        <StatLine label="Experience" value={`+${derived.xpBonus}%`} />
                      )}
                    </div>

                    <div className="border-parchment-500/15 mt-4 border-t pt-3">
                      <p className="font-display text-xs tracking-[0.2em] text-amber-500 uppercase">
                        {definition.proc.name}
                      </p>
                      <p className="text-parchment-500/70 mt-1 text-sm">
                        {definition.proc.description}
                      </p>
                    </div>
                  </TavernPanel>
                </div>

                {/* ── Backpack ──────────────────────────────────────────────── */}
                <div className="space-y-5">
                  <TavernPanel
                    title="Backpack"
                    headerSlot={
                      <span className="text-parchment-500/45 text-xs">
                        {hero.backpack.filter(Boolean).length}/{hero.backpack.length}
                        {hero.satchel.length > 0 && ` · satchel ${hero.satchel.length}`}
                      </span>
                    }
                    data-testid="backpack"
                  >
                    <div className="grid grid-cols-5 gap-2">
                      {bagItems.map(({ item, key }) => (
                        <ItemSlot
                          key={key}
                          slot={item?.slot ?? 'trinket'}
                          item={item}
                          {...(item ? { comparison: comparisonFor(item) } : {})}
                          {...withSetGlow(item)}
                          onClick={() => setSelectedUid(item?.uid ?? null)}
                          data-testid={item ? `bag-item-${item.uid}` : undefined}
                          {...(item && !canEquip(hero, item).ok
                            ? {
                                disabledReason: canEquip(hero, item).ok
                                  ? undefined
                                  : `${classDef(item.classLock!).name}s only`,
                              }
                            : {})}
                          badge={
                            item?.locked ? (
                              <span className="pointer-events-none absolute -top-1 -right-1 text-[10px] text-amber-500">
                                ●
                              </span>
                            ) : undefined
                          }
                        />
                      ))}
                    </div>

                    {bagItems.every(({ item }) => !item) && (
                      <p className="text-parchment-500/45 mt-4 text-sm">
                        Empty. Take a contract at the Gilded Tankard and it will not stay that way.
                      </p>
                    )}

                    {selected && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={snappy}
                        className="border-parchment-500/15 mt-4 border-t pt-4"
                        data-testid="selected-item"
                      >
                        <p className="font-display text-parchment-300 text-sm">{selected.name}</p>
                        <p className="text-parchment-500/50 mb-3 text-xs">
                          {SLOT_LABELS[selected.slot]}
                        </p>

                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            size="sm"
                            onClick={() => {
                              equipItem(selected);
                              setSelectedUid(null);
                            }}
                            data-testid="equip-selected"
                            {...(canEquip(hero, selected).ok
                              ? {}
                              : {
                                  disabledReason: `${classDef(selected.classLock!).name}s only — your hero cannot use this.`,
                                })}
                          >
                            Equip
                          </ActionButton>
                          <ActionButton
                            size="sm"
                            variant="secondary"
                            onClick={() => toggleItemLock(selected.uid)}
                            data-testid="lock-selected"
                          >
                            {selected.locked ? 'Unlock' : 'Lock'}
                          </ActionButton>
                          <ActionButton
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              discardItem(selected.uid);
                              setSelectedUid(null);
                            }}
                            data-testid="discard-selected"
                            {...(selected.locked
                              ? { disabledReason: 'Locked items are protected. Unlock it first.' }
                              : {})}
                          >
                            Discard
                          </ActionButton>
                        </div>
                        <p className="text-parchment-500/35 mt-2 text-[11px]">
                          Bram buys what you do not want; Torvald melts it. Both are one street
                          over.
                        </p>
                      </motion.div>
                    )}
                  </TavernPanel>

                  <DevItemDrawer hero={hero} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AmbientStage>
  );
}
