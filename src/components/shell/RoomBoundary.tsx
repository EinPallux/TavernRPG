'use client';

/**
 * A room that throws is still a room (architecture.md §7).
 *
 * Without this, one bad render takes the whole document: React unmounts the tree, the player gets
 * a white page, and — because the nav rail went with it — there is no way back to a room that
 * *does* work. The save is fine, the game is fine, and the player has no evidence of either.
 *
 * Scoped to the place stage on purpose. The rail and the HUD stay mounted, so the failure reads
 * as "this room is broken" rather than "the game is broken", and the fix is one click away.
 *
 * **It resets on navigation.** An error boundary that latches would keep showing the failure after
 * the player walked somewhere else, which is the behaviour that teaches people to reload. The key
 * is the pathname, so leaving the room clears the error by construction rather than by a handler
 * somebody has to remember to call.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ActionButton } from '@/components/ui/ActionButton';

interface Props {
  readonly children: ReactNode;
  /** Where to send someone whose current room will not render. */
  readonly onLeave: () => void;
}

interface State {
  readonly error: Error | null;
}

class Boundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is the only place this can go: there is no telemetry, by design (Q1 — the game
    // talks to no server), so the stack has to be reachable by whoever is helping the player.
    console.error('[TavernRPG] a room failed to render', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid h-full w-full place-items-center px-8" data-testid="room-error">
        <div className="chamfer-md surface-timber bg-wood-800/96 edge-etched border-l-blood-600 max-w-lg border-l-2 px-7 py-6">
          <p className="font-display text-xs tracking-[0.32em] text-amber-500 uppercase">
            Emberhollow
          </p>
          <h1 className="font-display text-parchment-300 mt-1 text-2xl font-extrabold">
            This room would not open
          </h1>

          <p className="text-parchment-500/72 mt-3 text-sm leading-relaxed">
            Something went wrong drawing it. Your save is untouched — the rest of the town is still
            there, and this is a rendering fault rather than anything that reached the disk.
          </p>

          <p
            className="chamfer-sm border-parchment-500/25 text-parchment-500/72 mt-3 border px-3 py-2 font-mono text-[11px] break-words"
            data-testid="room-error-detail"
          >
            {error.message || String(error)}
          </p>

          <div className="mt-4">
            <ActionButton onClick={this.props.onLeave} data-testid="room-error-leave">
              Back out to the town
            </ActionButton>
          </div>
        </div>
      </div>
    );
  }
}

export function RoomBoundary({ children, onLeave }: Props) {
  // Re-keying on the route is what makes the boundary forget: a new key is a new instance, and a
  // new instance has no error. No reset handler to remember, no stale failure to explain.
  const pathname = usePathname();
  return (
    <Boundary key={pathname} onLeave={onLeave}>
      {children}
    </Boundary>
  );
}
