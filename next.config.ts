import type { NextConfig } from 'next';

/**
 * TavernRPG is a client-rendered, local-first game (docs/tech/architecture.md §1):
 * no server runtime, no database — Vercel serves it as static output. All 24 routes
 * prerender at build time and `.next/routes-manifest.json` has zero dynamic routes;
 * `e2e/headers.spec.ts` asserts both, because "static" is a claim like any other.
 *
 * Everything below is verified against a real `next start` rather than read back off this
 * file — same discipline as the contrast and performance harnesses. See docs/tech/deployment.md.
 */

/**
 * The Content-Security-Policy, and the three things measurement changed about it.
 *
 * 1. `script-src` needs `'unsafe-inline'`. Next injects its bootstrap and the flight payload as
 *    inline `<script>` elements; under a policy without it the page serves, paints the shell and
 *    **never hydrates** — measured, not guessed: `<main>` came back with zero characters of text.
 *    A nonce would fix it properly and costs a middleware invocation on every request, which is a
 *    server runtime for a game that has none. Recorded as the trade it is.
 * 2. `style-src` needs it too. React writes `style` props as inline style attributes and Motion
 *    drives every animation through them; `style-src-attr` fires on the first frame otherwise.
 * 3. `'unsafe-eval'` is **not** here, and that took a code change rather than a config one. Zod 4
 *    feature-detects its JIT by calling `Function("")` inside a try/catch — harmless, caught, and
 *    still reported as a violation on every single load. `src/engine/save/schema.ts` now declares
 *    `jitless` up front, so nothing in the bundle reaches for eval at all. The interpreted path
 *    costs 0.96 ms on a 175 KB save (3.20 → 4.16 ms), once, at load.
 *
 * The result is a policy with no third-party origin in it anywhere — which for a game that stores
 * everything in the player's own IndexedDB is the directive that actually matters: there is no
 * endpoint a script could exfiltrate a save to.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Sent on every response, including the art and the chunks — a header on an image costs nothing
 * and forgetting one costs the thing it prevents.
 *
 * The CSP is production-only: `next dev` compiles through Turbopack and react-refresh, both of
 * which need `eval`, and a dev-only exemption is fine precisely because the e2e suite runs
 * against `npm run build && next start`. The policy is exercised in CI, not just declared here.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // frame-ancestors above is the modern half; this is the half old browsers still read.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=()',
  },
  // Vercel sets this itself on *.vercel.app; a custom domain gets it from here. Two identical
  // HSTS headers are harmless, a missing one on the custom domain would not be.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY }]
    : []),
];

/**
 * **`immutable` is a promise about the URL, not about the bytes.**
 *
 * `/_next/static/*` earns it: the filename contains a content hash, so a changed file is a
 * changed URL and a year-long cache can never be wrong. Next already sends exactly that and this
 * file deliberately does **not** restate it — a second copy of a rate is the mistake this codebase
 * has made with the guild bounty targets and the forge odds, and `e2e/headers.spec.ts` asserts
 * Next's value instead of ours.
 *
 * `/assets/*` does **not** earn it, which is the whole finding. Those 505 files are served at
 * stable authored paths — `/assets/backgrounds/tavern_background.webp` is written as a literal in
 * `data/places.ts`, `data/zones.ts` and a dozen components — and `scripts/sync-assets.mjs`
 * rewrites the bytes at that same path whenever the art or `WEBP_QUALITY` changes. Marking them
 * immutable would pin a superseded painting in a returning player's browser for a year with no
 * way to reach it. So: a day of freshness, then a week where the cached copy paints instantly and
 * refreshes behind it. Worst case after an art change is one stale room, once.
 *
 * The upgrade path, if the art ever churns often enough to care, is content-addressed asset URLs
 * — and then, and only then, `immutable` becomes true rather than convenient.
 */
const ART_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Game art is copied into public/assets by scripts/sync-assets.mjs and served
  // statically; Next's image optimizer is unnecessary for a static deploy.
  images: { unoptimized: true },
  // Type errors must fail the build; linting is its own CI step (`npm run lint`).
  typescript: { ignoreBuildErrors: false },
  // Next advertises itself in a header by default; nothing needs to know.
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      { source: '/assets/:path*', headers: [{ key: 'Cache-Control', value: ART_CACHE_CONTROL }] },
      // The dev harnesses ship with the build on purpose (they are how the game is inspected)
      // but they are not the game, and a search result pointing at /dev/boom helps nobody.
      { source: '/dev/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
    ];
  },
};

export default nextConfig;
