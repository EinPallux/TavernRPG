'use client';

/**
 * The shop (shops spec §1–§3).
 *
 * **One screen, two keepers.** The Armory and the Gilded Facet differ in what they stock, who
 * stands behind the counter and what the room looks like — none of which is a reason for two
 * components. Everything structural (the shelf, the sold gaps, the restock clock, the reroll,
 * the sell counter) is identical, and duplicating it would guarantee the two drift.
 *
 * The screen owns no rules. Prices come from `shopPrice`, what is sellable comes from
 * `disposeItem`, the shelf comes from the day seed. It renders and it animates.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { shopPrice, REROLL_DICE_COST, type ShopId } from '@/engine/shops/stock';
import { msUntilNextReset } from '@/engine/reset/resetEngine';
import { compareItem } from '@/engine/hero/derived';
import { canEquip } from '@/engine/hero/actions';
import type { Item } from '@/engine/items/types';
import { bramSays, selaSays, type ShopMoment } from '@/data/shopBarks';
import { PLACES_BY_ID, type PlaceDef } from '@/data/places';
import { quoteSale, shopStock } from '@/state/shopActions';
import { useGameStore } from '@/state/gameStore';
import { gameNow } from '@/state/clock';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { KeeperBark } from '@/components/ui/KeeperBark';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { formatRemaining } from '@/components/ui/TimerChip';
import { CoinIcon, HourglassIcon } from '@/components/icons';
import { dramatic, listItemIn, snappy, staggerChildren, standard } from '@/styles/motion';
import { StockCard } from './StockCard';
import { SellDrawer } from './SellDrawer';

interface ShopChrome {
  readonly place: PlaceDef;
  readonly keeper: string;
  readonly says: (moment: ShopMoment, index?: number) => string;
  readonly shelfLabel: string;
}

const CHROME: Readonly<Record<ShopId, ShopChrome>> = {
  armory: {
    place: PLACES_BY_ID.armory,
    keeper: 'Bram',
    says: bramSays,
    shelfLabel: 'On the racks',
  },
  facet: {
    place: PLACES_BY_ID.facet,
    keeper: 'Sela',
    says: selaSays,
    shelfLabel: 'Under the glass',
  },
};

export function ShopScreen({ shopId }: { shopId: ShopId }) {
  const save = useGameStore((state) => state.save);
  const openShop = useGameStore((state) => state.openShop);
  const buyStockItem = useGameStore((state) => state.buyStockItem);
  const sellItem = useGameStore((state) => state.sellItem);
  const rerollShopStock = useGameStore((state) => state.rerollShopStock);
  const refreshDay = useGameStore((state) => state.refreshDay);

  const [message, setMessage] = useState<string | null>(null);
  const [moment, setMoment] = useState<ShopMoment>('browse');
  const [barkIndex, setBarkIndex] = useState(0);
  const [selling, setSelling] = useState(false);
  const [now, setNow] = useState(() => gameNow());

  const chrome = CHROME[shopId];

  // The day has to be current *before* the shelf is drawn, or a player who left the tab open
  // overnight buys from yesterday.
  useEffect(() => {
    refreshDay();
    openShop(shopId);
  }, [openShop, refreshDay, shopId]);

  useEffect(() => {
    const id = setInterval(() => setNow(gameNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const hero = save?.hero ?? null;
  const stock = save ? shopStock(save, shopId) : null;

  const bags = useMemo(() => {
    if (!hero) return [] as Item[];
    return [...hero.backpack.filter((entry): entry is Item => entry !== null), ...hero.satchel];
  }, [hero]);

  const bagsFull = hero
    ? hero.backpack.every((cell) => cell !== null) && hero.satchel.length >= 5
    : true;

  const say = useCallback((next: ShopMoment) => {
    setMoment(next);
    setBarkIndex((index) => index + 1);
  }, []);

  const handleBuy = useCallback(
    (index: number, price: number) => {
      const result = buyStockItem(shopId, index, price);
      if ('kind' in result) {
        setMessage(
          result.kind === 'insufficient-gold'
            ? `You are ${(result.needed - result.available).toLocaleString()} gold short.`
            : result.kind === 'no-room'
              ? 'Your bags are full — sell or stow something first.'
              : 'That one has gone.',
        );
        say(result.kind === 'insufficient-gold' ? 'broke' : 'browse');
        return;
      }

      setMessage(null);
      say('bought');
    },
    [buyStockItem, say, shopId],
  );

  const handleSell = useCallback(
    (item: Item) => {
      const result = sellItem(item.uid);
      if ('kind' in result) {
        const heirloom = result.kind === 'cannot-dispose' && result.reason.kind === 'set-piece';
        setMessage(heirloom ? 'That is a set piece. It is not for sale.' : 'That cannot be sold.');
        say(heirloom ? 'heirloom' : 'browse');
        return;
      }

      setMessage(null);
      say('sold');
    },
    [say, sellItem],
  );

  const handleReroll = useCallback(() => {
    const refusal = rerollShopStock(shopId);
    if (refusal) {
      setMessage(
        refusal.kind === 'insufficient-dice'
          ? 'A fresh shelf costs a Golden Die, and you have none.'
          : 'Nothing to reroll.',
      );
      say('broke');
      return;
    }

    setMessage(null);
    say('rerolled');
  }, [rerollShopStock, say, shopId]);

  if (!save || !hero || !stock) return null;

  const soldOut = stock.sold.length >= stock.items.length;
  const activeMoment: ShopMoment = soldOut && moment === 'browse' ? 'cleaned-out' : moment;

  return (
    <div className="relative h-full w-full" data-testid={`place-${shopId}`}>
      <AmbientStage
        backdrop={chrome.place.backdrop}
        {...(chrome.place.tint ? { tint: chrome.place.tint } : {})}
        {...(chrome.place.effects ? { effects: chrome.place.effects } : {})}
      >
        {/* Full-viewport is a hard rule (CLAUDE.md #4): the shelf grows to fill the room rather
            than leaving a lake of backdrop under six small cards on a 1440p screen. */}
        <div className="relative flex h-full flex-col overflow-y-auto px-8 py-6">
          <header className="mb-5 flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
                Emberhollow
              </p>
              <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
                {chrome.place.name}
              </h1>
            </div>

            {/* Restock is a promise the player plans around, so it is a clock, not a footnote. */}
            <span
              className="chamfer-sm border-parchment-500/15 bg-wood-900/70 text-parchment-500/70 flex items-center gap-2 border px-3 py-1.5 text-xs"
              data-testid="restock-timer"
            >
              <HourglassIcon size={13} />
              Restocks in {formatRemaining(msUntilNextReset(now))}
            </span>
          </header>

          <div className="mb-5">
            <KeeperBark
              keeper={chrome.keeper}
              line={chrome.says(activeMoment, barkIndex)}
              data-testid={`bark-${shopId}`}
            />
          </div>

          <AnimatePresence>
            {message && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={standard}
                className="chamfer-sm border-blood-600/40 bg-blood-600/12 text-parchment-300 mb-4 border px-3 py-2 text-sm"
                data-testid="shop-message"
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <TavernPanel
              className="flex flex-col"
              bodyClassName="flex-1"
              title={chrome.shelfLabel}
              headerSlot={
                <ActionButton
                  size="sm"
                  variant="secondary"
                  cost={{ dice: REROLL_DICE_COST }}
                  {...(hero.dice < REROLL_DICE_COST
                    ? {
                        disabledReason:
                          'Golden Dice are earned, never bought — run a long mission.',
                      }
                    : {})}
                  onClick={handleReroll}
                  data-testid="reroll-stock"
                >
                  New stock
                </ActionButton>
              }
              data-testid="shop-shelf"
            >
              {/* The shimmer keys off the reroll count, so a fresh shelf visibly arrives. */}
              <motion.div
                key={stock.rerollsToday}
                initial="hidden"
                animate="visible"
                transition={staggerChildren(0.05)}
                className="grid h-full auto-rows-fr grid-cols-2 gap-3 lg:grid-cols-3"
              >
                {stock.items.map((item, index) => {
                  const price = shopPrice(item);
                  const wearable = canEquip(hero, item).ok;

                  return (
                    <StockCard
                      key={item.uid}
                      index={index}
                      item={item}
                      price={price}
                      sold={stock.sold.includes(index)}
                      affordable={hero.gold >= price}
                      noRoom={bagsFull}
                      comparison={
                        wearable
                          ? compareItem(
                              {
                                classId: hero.classId,
                                level: hero.level,
                                trained: hero.trained,
                                equipment: hero.equipment,
                              },
                              item,
                            )
                          : null
                      }
                      onBuy={() => handleBuy(index, price)}
                    />
                  );
                })}
              </motion.div>
            </TavernPanel>

            <div className="space-y-4">
              <TavernPanel
                title="Your purse"
                headerSlot={
                  <span className="flex items-center gap-1.5 text-sm text-amber-500 tabular-nums">
                    <CoinIcon size={14} />
                    {hero.gold.toLocaleString()}
                  </span>
                }
              >
                <p className="text-parchment-500/55 text-xs leading-relaxed">
                  {chrome.keeper} pays what a piece is worth and asks {'×'}3.2 for one off the
                  shelf. Selling is income; buying is a splurge.
                </p>

                <div className="mt-3">
                  <ActionButton
                    size="sm"
                    variant={selling ? 'primary' : 'secondary'}
                    fullWidth
                    onClick={() => setSelling((open) => !open)}
                    data-testid="toggle-sell"
                  >
                    {selling ? 'Done selling' : `Sell to ${chrome.keeper}`}
                  </ActionButton>
                </div>
              </TavernPanel>

              <AnimatePresence initial={false}>
                {selling && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={dramatic}
                  >
                    <TavernPanel title="Across the counter" data-testid="sell-panel">
                      <SellDrawer
                        items={bags}
                        keeper={chrome.keeper}
                        quoteFor={(item) => {
                          const quote = quoteSale(save, item.uid);
                          return quote?.ok
                            ? { gold: quote.quote.gold, confirm: quote.quote.confirm }
                            : null;
                        }}
                        onSell={handleSell}
                      />
                    </TavernPanel>
                  </motion.div>
                )}
              </AnimatePresence>

              {soldOut && (
                <motion.p
                  variants={listItemIn}
                  initial="hidden"
                  animate="visible"
                  transition={snappy}
                  className="chamfer-sm border-parchment-500/12 bg-wood-900/50 text-parchment-500/50 border border-dashed px-3 py-4 text-center text-xs"
                  data-testid="shelf-empty"
                >
                  Cleared out. New stock at midnight — or a Golden Die, if you cannot wait.
                </motion.p>
              )}
            </div>
          </div>
        </div>
      </AmbientStage>
    </div>
  );
}
