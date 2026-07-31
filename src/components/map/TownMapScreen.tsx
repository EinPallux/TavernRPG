'use client';

/**
 * Emberhollow, from outside (style guide §2, town-map data in `data/townMap.ts`).
 *
 * The nav rail has always been a *list* of the town. This is the town. Fourteen painted buildings,
 * each with the signpost the artist put on it, each a door — and standing here is what "not being
 * in a room" means, which is why `/` lands on it. Neither way of getting around is the real one:
 * the rail is faster once you know where things are, the map is how you learn.
 *
 * **The painting and the doors are the same box.** The art is 16:9 and the stage almost never is,
 * so the frame is sized to the largest 16:9 that fits (`.town-map-frame`, container-query units)
 * and both the image and the hotspots live inside it. Percentages of *that* box are exact at every
 * window size; percentages of the room would put the Armory door in the road at 1366×768.
 *
 * **Plaques are a layer, not a child of the building.** The first version nested each plaque in its
 * own hotspot button, which was tidier and wrong twice over: `chamfer-sm` is a `clip-path`, and a
 * clip path clips descendants — so every plaque was cut off at the edge of its own building and
 * simply never appeared. Playwright reported it visible throughout, because `toBeVisible` knows
 * about `display`, `visibility` and `opacity` and nothing about clipping. A screenshot found it.
 * (The second bug it also fixes: fourteen absolutely-positioned siblings paint in DOM order, so a
 * plaque belonging to an early building would have gone *under* a later one.)
 *
 * **Locked buildings stay lit, and say the level.** Same rule as the rail: ambition you can see
 * beats a building that is mysteriously inert. The dimming is a feathered radial rather than a
 * scrim on the rectangle, because at level 1 twelve of the fourteen are shut and hard-edged boxes
 * would turn a painting into a spreadsheet.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PLACES_BY_ID, type PlaceId } from '@/data/places';
import {
  TOWN_HOTSPOTS,
  TOWN_MAP_ART,
  hotspotBox,
  hotspotFor,
  type MapHotspot,
} from '@/data/townMap';
import { gateFor } from '@/engine/progression/gates';
import { activeBeat } from '@/engine/tutorial/beats';
import { Icon, LockIcon } from '@/components/icons';
import { useGameStore } from '@/state/gameStore';
import { currentDayKey } from '@/state/clock';
import { play } from '@/state/sfx';
import { townSignals, type PlaceSignal } from '@/state/townSignals';
import { snappy, standard } from '@/styles/motion';

/** Buildings with a fire in them, and where the glow sits — percentages of the painting. */
const HEARTHS: readonly { readonly place: PlaceId; readonly x: number; readonly y: number }[] = [
  { place: 'tavern', x: 29, y: 38 },
  { place: 'forge', x: 45, y: 35 },
  { place: 'undertavern', x: 79.5, y: 73 },
];

function Building({
  spot,
  level,
  signal,
  beckoning,
  hovered,
  onPoint,
  onEnter,
}: {
  spot: MapHotspot;
  level: number;
  signal: PlaceSignal | undefined;
  /** The tutorial wants the player here next — the one building allowed to ask for attention. */
  beckoning: boolean;
  hovered: boolean;
  onPoint: (place: PlaceId | null) => void;
  onEnter: (place: PlaceId, locked: boolean) => void;
}) {
  const place = PLACES_BY_ID[spot.place];
  const gate = gateFor(spot.place, level);
  const locked = !gate.unlocked;

  const label = locked
    ? `${place.name} — locked, opens at level ${gate.gateLevel}`
    : `${place.name} — ${place.blurb}`;

  return (
    <motion.button
      type="button"
      style={hotspotBox(spot)}
      onClick={() => onEnter(spot.place, locked)}
      onHoverStart={() => onPoint(spot.place)}
      onHoverEnd={() => onPoint(null)}
      onFocus={() => onPoint(spot.place)}
      onBlur={() => onPoint(null)}
      whileHover={locked ? undefined : { scale: 1.015 }}
      whileTap={locked ? { scale: 0.995 } : { scale: 0.985 }}
      transition={snappy}
      aria-label={label}
      aria-disabled={locked || undefined}
      data-testid={`map-${spot.place}`}
      data-locked={locked ? 'true' : 'false'}
      /*
       * `aria-disabled` rather than `disabled`: a locked building must still take focus, because
       * the level it opens at is on its plaque and a `disabled` button is unreachable by keyboard.
       * Same rule as the rail, which keeps locked rooms visible instead of hiding them.
       *
       * No `chamfer-sm` here, ever — see the header. The chamfer belongs on the frame drawn
       * *inside* the button, which is a box of its own and clips nothing that matters.
       */
      className={`absolute ${locked ? 'cursor-not-allowed' : 'cursor-pointer'} focus-visible:outline-none`}
    >
      {/* The painting is the button; everything here is a state drawn on top of it. */}
      {locked && (
        <span
          aria-hidden
          className="absolute -inset-[6%]"
          style={{
            background:
              'radial-gradient(closest-side, rgb(24 17 12 / 0.66), rgb(24 17 12 / 0.34) 62%, transparent 100%)',
          }}
        />
      )}

      <span
        aria-hidden
        className={`chamfer-sm absolute inset-0 border transition-all duration-200 ${
          hovered
            ? locked
              ? 'border-parchment-500/45'
              : 'border-amber-400/80 bg-amber-400/12 shadow-[0_0_22px_2px_rgb(232_163_61/0.28)_inset]'
            : 'border-transparent'
        }`}
      />

      {locked && (
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center"
          data-testid={`map-lock-${spot.place}`}
        >
          <span className="chamfer-sm border-parchment-500/30 bg-wood-900/85 text-parchment-300/85 flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider">
            <LockIcon size={11} />
            Lv {gate.gateLevel}
          </span>
        </span>
      )}

      {/* Only the beat's building animates unbidden. Anything else and the map is a slot machine. */}
      {beckoning && !locked && (
        <motion.span
          aria-hidden
          animate={{ opacity: [0.75, 0.2, 0.75] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          className="chamfer-sm absolute -inset-1 border-2 border-amber-400"
          data-testid={`map-beckons-${spot.place}`}
        />
      )}

      {!locked && signal && signal.badge > 0 && (
        <span
          className="chamfer-sm absolute -top-1.5 -right-1.5 bg-amber-500 px-1.5 text-[11px] leading-[17px] font-bold text-black tabular-nums shadow shadow-black/50"
          data-testid={`map-badge-${spot.place}`}
        >
          {signal.badge}
        </span>
      )}
      {!locked && signal?.dot && (
        <motion.span
          aria-hidden
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 shadow shadow-black/50"
          data-testid={`map-dot-${spot.place}`}
        />
      )}
    </motion.button>
  );
}

/** The one plaque, wherever it is pointing. Above every building, clipped by nothing. */
function Plaque({ spot, level }: { spot: MapHotspot; level: number }) {
  const place = PLACES_BY_ID[spot.place];
  const gate = gateFor(spot.place, level);
  const [left, top, right, bottom] = spot.rect;

  return (
    <motion.div
      initial={{ opacity: 0, y: spot.plaque === 'below' ? -6 : 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={snappy}
      style={{
        left: `${(left + right) / 2}%`,
        ...(spot.plaque === 'below'
          ? { top: `calc(${bottom}% + 6px)` }
          : { bottom: `calc(${100 - top}% + 6px)` }),
      }}
      /*
       * `pointer-events-none` because a tooltip you can hover is a tooltip that flickers when the
       * cursor crosses its own edge — and this one deliberately overhangs its building.
       */
      className="pointer-events-none absolute z-30 w-max max-w-[15rem] -translate-x-1/2"
      data-testid="map-plaque"
    >
      <div className="chamfer-sm surface-timber bg-wood-900/95 border border-amber-500/45 px-2.5 py-1.5 shadow-lg shadow-black/40">
        <p className="font-display flex items-center gap-1.5 text-[12px] tracking-[0.1em] text-amber-500">
          <Icon name={place.icon} size={13} />
          {place.name}
        </p>
        <p className="text-parchment-500/72 mt-0.5 text-[11px] leading-snug">
          {gate.unlocked ? place.blurb : `Opens at level ${gate.gateLevel}.`}
        </p>
        {gate.unlocked && place.keeper && (
          <p className="text-parchment-500/72 mt-0.5 text-[10px] tracking-wide italic">
            {place.keeper} keeps it
          </p>
        )}
      </div>
    </motion.div>
  );
}

export function TownMapScreen() {
  const router = useRouter();
  const save = useGameStore((state) => state.save);
  const reduceMotion = useReducedMotion();
  const [pointing, setPointing] = useState<PlaceId | null>(null);

  const level = save?.hero?.level ?? 1;
  const signals = townSignals(save, currentDayKey());
  const beat = save?.hero ? activeBeat(save) : null;
  const pointed = pointing ? hotspotFor(pointing) : undefined;

  const enter = (place: PlaceId, locked: boolean) => {
    if (locked) {
      play('refuse');
      return;
    }
    play('panel');
    router.push(PLACES_BY_ID[place].route);
  };

  return (
    <div
      className="bg-wood-900 relative h-full w-full overflow-hidden"
      /*
       * `container-type: size` is what lets the frame below compare the stage's width against its
       * height in pure CSS. Set inline rather than in a class because it is load-bearing layout
       * for exactly one element, and a stray utility elsewhere would silently break the fit.
       */
      style={{ containerType: 'size' }}
      data-testid="place-map"
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 1.015 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={standard}
        className="town-map-frame absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the frame is already sized to
            the art's ratio, so `next/image` would only add a layout pass over a fixed box. */}
        <img
          src={TOWN_MAP_ART.src}
          alt=""
          width={TOWN_MAP_ART.width}
          height={TOWN_MAP_ART.height}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
        />

        {/* Firelight in the windows of the three buildings that have a fire. */}
        {!reduceMotion &&
          HEARTHS.map((hearth) => (
            <span
              key={hearth.place}
              aria-hidden
              className="animate-hearth pointer-events-none absolute h-[14%] w-[9%] -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${hearth.x}%`,
                top: `${hearth.y}%`,
                background:
                  'radial-gradient(closest-side, rgb(232 163 61 / 0.35), transparent 78%)',
              }}
            />
          ))}

        {/* A vignette, so the frame's edge reads as the edge of the map rather than a crop. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 50% 45%, transparent 52%, rgb(24 17 12 / 0.55) 100%)',
          }}
        />

        {TOWN_HOTSPOTS.map((spot) => (
          <Building
            key={spot.place}
            spot={spot}
            level={level}
            signal={signals[spot.place]}
            beckoning={beat?.place === spot.place}
            hovered={pointing === spot.place}
            onPoint={setPointing}
            onEnter={enter}
          />
        ))}

        {/*
         * Keyed on the plaque, never on the building it is describing (style guide §7.1).
         *
         * `key={pointed.place}` made moving the cursor from one building to the next an exit plus
         * an entrance, and `AnimatePresence` keeps the outgoing child mounted through its exit —
         * so there were briefly *two* plaques on screen, and the strict-mode locator found both.
         * There is only ever one plaque; which building it is about is state.
         */}
        <AnimatePresence>
          {pointed && <Plaque key="map-plaque" spot={pointed} level={level} />}
        </AnimatePresence>

        {/*
         * One line, in the empty road at the bottom: a picture full of invisible buttons has to
         * say so once. On a plate rather than in a text shadow, because the painting underneath
         * is bright grass in places and dark stone in others, and text that has to survive both
         * is text with no contrast floor at all.
         */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[2%] flex justify-center">
          <p className="chamfer-sm bg-wood-900/92 text-parchment-300/85 border border-amber-500/25 px-3 py-1 text-[11px] tracking-[0.22em] uppercase">
            Click a building to go inside
          </p>
        </div>
      </motion.div>
    </div>
  );
}
