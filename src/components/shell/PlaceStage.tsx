'use client';

/**
 * The stage wrapper that gives place-to-place navigation a sense of geography.
 *
 * Direction comes from nav-rail order: walking *down* the town list drifts content upward,
 * walking back up reverses it. Subtle on purpose — 12px and 240ms. A door-slam between every
 * screen would be exhausting; that gesture is saved for the dungeon descent (style guide §7).
 */

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { PLACES } from '@/data/places';
import { duration, standard } from '@/styles/motion';

function railIndex(pathname: string): number {
  const index = PLACES.findIndex((place) => place.route === pathname);
  return index === -1 ? 0 : index;
}

export function PlaceStage({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Direction is derived by adjusting state during render (React's documented pattern for
  // "state that depends on a prop changing") rather than by reading a ref mid-render.
  const [previousPath, setPreviousPath] = useState(pathname);
  const [direction, setDirection] = useState(1);

  if (previousPath !== pathname) {
    setDirection(railIndex(pathname) >= railIndex(previousPath) ? 1 : -1);
    setPreviousPath(pathname);
  }

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={pathname}
        custom={direction}
        initial={{ opacity: 0, y: direction >= 0 ? 12 : -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: direction >= 0 ? -12 : 12 }}
        transition={{ ...standard, opacity: { duration: duration.base } }}
        className="h-full w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
