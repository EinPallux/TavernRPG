'use client';

/**
 * A room that throws, on purpose (dev only).
 *
 * `RoomBoundary` is the one piece of the shell that cannot be verified by using the game
 * correctly: the whole point is what happens when a render fails, and no amount of playing
 * produces that on demand. Without a way to trigger it, the boundary is code nobody has ever
 * seen run — which is the same as not having one.
 *
 * Throws during render rather than in a handler, because that is the failure React boundaries
 * actually catch; an error inside an event handler is not one and would prove nothing.
 *
 * Lives inside the `(game)` route group rather than beside the other dev harnesses, and that is
 * the whole point: `RoomBoundary` is part of the *shell*, and the other `/dev` pages render
 * outside it. A test route that skipped the shell would have proved nothing about the shell.
 */

import { useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';

export default function BoomPage() {
  const [broken, setBroken] = useState(false);

  if (broken) throw new Error('The floorboards gave way.');

  return (
    <div className="grid h-full w-full place-items-center px-8" data-testid="place-boom">
      <div className="chamfer-md surface-timber bg-wood-800/96 edge-etched max-w-md px-6 py-5">
        <h1 className="font-display text-parchment-300 text-xl font-extrabold">
          A room that breaks
        </h1>
        <p className="text-parchment-500/72 mt-2 text-sm leading-relaxed">
          Throws during render, so the shell&rsquo;s error boundary has something real to catch.
          The rail and the HUD should survive; this room should not.
        </p>
        <div className="mt-4">
          <ActionButton variant="danger" onClick={() => setBroken(true)} data-testid="dev-boom">
            Break it
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
