import '@testing-library/jest-dom/vitest';

/**
 * jsdom ships no canvas implementation, and `getContext` logs a "Not implemented" error every
 * time something asks for one. The battle scene's particle layer is *designed* to no-op when
 * there is no 2D context (the same path reduced motion takes), so the behaviour under test is
 * correct — only the noise is not. Returning null explicitly keeps the graceful path and drops
 * several hundred lines of console output per run.
 *
 * Guarded because the default environment is Node, where HTMLCanvasElement does not exist.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => null;
}

/**
 * jsdom has no `ResizeObserver` either, and the battle scene needs one: the VFX pass measures
 * where the fighters actually stand so that sparks bloom on them rather than near them, and it
 * re-measures when the window changes.
 *
 * A no-op stub rather than a polyfill, deliberately. jsdom lays nothing out — every rect it
 * returns is zero — so a real observer would fire with numbers that mean nothing. `useStageAnchors`
 * already refuses a zero-sized frame and keeps its fallback anchors, which is exactly the state
 * these tests should be exercising: the scene renders correctly before anything has been measured.
 * The real geometry is asserted where geometry exists, in `e2e/battle.spec.ts`.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}
