'use client';

/**
 * One tab owns the save. The others watch (architecture.md §3).
 *
 * The autosave is serialised *within* a tab — Phase 8 fixed that, after a 145 KB save started
 * landing writes out of order and ate a level. Nothing coordinates *between* tabs, and two tabs
 * are strictly worse than two writes in one: each holds its own store, each believes it is
 * authoritative, and the second to flush silently overwrites everything the first did. A player
 * who opens the game twice loses whichever session they were not looking at, and never finds out
 * why. Sixteen phases of care about save integrity end at the tab boundary.
 *
 * So: a leader election over `BroadcastChannel`, and the game only runs in the leader.
 *
 * **The design is deliberately not a lock.** A held lock has to be released, and the release that
 * matters — a tab that crashed, or a laptop that slept — is exactly the one that never runs. This
 * is a heartbeat instead: the leader announces itself every second and a follower that stops
 * hearing it for three seconds promotes itself. A crashed tab therefore hands ownership back by
 * doing nothing at all, which is the only thing a crashed tab reliably does.
 *
 * **A follower is never stuck.** "Play here instead" broadcasts a takeover the current leader
 * obeys immediately. Whichever tab the player is actually looking at can always become the real
 * one — the guard exists to stop silent loss, not to pick a winner on the player's behalf.
 *
 * Elapsed time comes from `performance.now()`, which is per-document and never compared across
 * tabs: every decision here is "how long since *I* last heard something", never "whose clock is
 * ahead". That also keeps it clear of the GameClock rule, since none of this is game time.
 */

/** `[TUNE]` How often the leader says it is still there. */
const HEARTBEAT_MS = 1_000;
/** `[TUNE]` Silence longer than this and a follower takes over. Three beats of slack. */
const STALE_MS = 3_200;
/** `[TUNE]` How long a starting tab waits to hear an incumbent before claiming the save. */
const ELECTION_MS = 350;

const CHANNEL = 'tavernrpg:tab-lock';

type Message =
  | { readonly kind: 'claim'; readonly from: string }
  | { readonly kind: 'held'; readonly from: string }
  | { readonly kind: 'beat'; readonly from: string }
  | { readonly kind: 'takeover'; readonly from: string }
  | { readonly kind: 'released'; readonly from: string };

export type TabRole = 'electing' | 'leader' | 'follower';

export interface TabLock {
  /** Stop participating. Safe to call twice. */
  readonly release: () => void;
  /** Demand the save from whichever tab currently holds it. */
  readonly takeOver: () => void;
}

/**
 * A per-document identity.
 *
 * `crypto.randomUUID` rather than the seeded RNG: this is not simulation state, nobody replays it,
 * and giving two tabs the same id would be the one failure this module cannot recover from.
 */
function tabId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `tab-${performance.now()}`;
}

/**
 * Join the election. `onRole` fires whenever this tab's standing changes.
 *
 * Returns a no-op lock where `BroadcastChannel` is unavailable (SSR, jsdom, an old browser) and
 * reports `leader`, because a browser that cannot coordinate tabs must still be able to play.
 * Failing closed here would lock a player out of a game that works.
 */
export function claimTabLock(onRole: (role: TabRole) => void): TabLock {
  if (typeof BroadcastChannel === 'undefined') {
    onRole('leader');
    return { release: () => undefined, takeOver: () => undefined };
  }

  const me = tabId();
  const channel = new BroadcastChannel(CHANNEL);

  let role: TabRole = 'electing';
  let lastHeard = performance.now();
  let beat: ReturnType<typeof setInterval> | null = null;
  let watch: ReturnType<typeof setInterval> | null = null;
  let released = false;

  const post = (message: Message) => channel.postMessage(message);

  const setRole = (next: TabRole) => {
    if (role === next || released) return;
    role = next;
    onRole(next);
  };

  const lead = () => {
    setRole('leader');
    beat ??= setInterval(() => post({ kind: 'beat', from: me }), HEARTBEAT_MS);
  };

  const follow = () => {
    if (beat) {
      clearInterval(beat);
      beat = null;
    }
    lastHeard = performance.now();
    setRole('follower');
  };

  channel.onmessage = (event: MessageEvent<Message>) => {
    const message = event.data;
    if (message.from === me) return;

    switch (message.kind) {
      case 'claim':
        // Somebody new is starting up. If the save is mine, say so; they will stand down.
        if (role === 'leader') post({ kind: 'held', from: me });
        break;

      case 'held':
      case 'beat':
        // An incumbent exists. Stand down if I was electing; keep the clock fresh either way.
        lastHeard = performance.now();
        if (role !== 'follower') follow();
        break;

      case 'takeover':
        // The player is looking at another tab. It wins, immediately and without argument.
        if (role === 'leader') follow();
        break;

      case 'released':
        // A leader left cleanly. Claim it now rather than waiting out the stale timer.
        if (role === 'follower') lead();
        break;
    }
  };

  post({ kind: 'claim', from: me });
  const election = setTimeout(() => {
    if (role === 'electing') lead();
  }, ELECTION_MS);

  /*
   * The promotion path for a leader that never said goodbye.
   *
   * A closed tab fires `pagehide` and releases cleanly; a crashed one, a killed process or a
   * device that slept mid-write does not. Silence is the only signal that covers all of them.
   */
  watch = setInterval(() => {
    if (role === 'follower' && performance.now() - lastHeard > STALE_MS) lead();
  }, HEARTBEAT_MS);

  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(election);
    if (beat) clearInterval(beat);
    if (watch) clearInterval(watch);
    if (role === 'leader') post({ kind: 'released', from: me });
    channel.close();
  };

  // `pagehide` rather than `unload`: it fires for the back/forward cache too, where `unload`
  // is unreliable and increasingly ignored.
  window.addEventListener('pagehide', release);

  return {
    release: () => {
      window.removeEventListener('pagehide', release);
      release();
    },
    takeOver: () => {
      post({ kind: 'takeover', from: me });
      lead();
    },
  };
}

/** Test seam: the timings, so a test does not have to wait three real seconds. */
export const TAB_LOCK_TIMINGS = { HEARTBEAT_MS, STALE_MS, ELECTION_MS } as const;
