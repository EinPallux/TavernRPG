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
