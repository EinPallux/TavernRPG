# Deployment & production configuration

> What Vercel actually serves, and why each header says what it says. Companion:
> `architecture.md` §1 (stack, static-first claim), `asset-pipeline.md` §5b (the WebP transcode).
>
> **Everything in this document is asserted by `e2e/headers.spec.ts` against a live
> `next build && next start`.** Not one of these values is trusted because `next.config.ts` says
> it — the config went through three rounds where the running server disagreed with it, and a
> header you can only prove by reading the file that sets it is a tautology.

## 1. Shape of the deploy

The game is client-rendered and local-first (`architecture.md` §1): no server runtime, no
database, no accounts. Every one of the 24 routes prerenders at build time and
`.next/routes-manifest.json` carries **zero** dynamic routes, so Vercel serves the whole thing off
its CDN and never provisions a function.

That is a claim, so it is a test. `e2e/headers.spec.ts` reads the build's own
`routes-manifest.json` and `prerender-manifest.json` and fails if a dynamic route appears or a
place stops being prerendered. Vercel would happily provision a function for one dynamic route and
the game would still work — it would just quietly stop being the thing this document describes.

**There is no `vercel.json`.** Every setting a project this shape needs — headers, caching,
framework detection — is either a Next default or lives in `next.config.ts`. A second file
restating the same rules is the failure mode this codebase has hit twice (the guild bounty
targets, the forge odds): two copies of one number, and the day they disagree nobody notices.

## 2. Caching: `immutable` is a promise about the URL

| Path | `Cache-Control` | Who sets it |
|---|---|---|
| `/_next/static/*` | `public, max-age=31536000, immutable` | **Next** — not restated by us |
| `/assets/*` | `public, max-age=86400, stale-while-revalidate=604800` | `next.config.ts` |
| documents | Next/Vercel default (CDN-cached per deploy, browser revalidates) | Next |

The split is the finding, and it is the opposite of what "cache the static assets hard" suggests.

`/_next/static/*` **earns** `immutable`: the build puts a content hash in the filename, so changed
bytes are a changed URL and a year-long cache cannot ever be wrong. Next already sends exactly
that header and `next.config.ts` deliberately does not repeat it; the e2e asserts Next's value
instead of mirroring ours.

`/assets/*` does **not** earn it. Those 505 files are served at their authored paths —
`/assets/backgrounds/tavern_background.webp` is written as a literal in `data/places.ts`,
`data/zones.ts`, `data/dungeons.ts`, `data/classes.ts` and a dozen components — and
`scripts/sync-assets.mjs` rewrites the bytes *at that same path* whenever a painting is re-authored
or `WEBP_QUALITY` moves. Marking them immutable would pin a superseded backdrop in a returning
player's browser for a year with no URL that could reach past it. Instead: fresh for a day, then a
week in which the cached copy paints instantly and refreshes behind the player. Worst case after
an art change is one stale room, once.

The revalidation has to be cheap or the policy is just a slower way of not caching, so the suite
checks that too: a conditional `If-None-Match` on a portrait comes back **304**.

If the art ever churns often enough for a day of staleness to matter, the fix is content-addressed
asset URLs (a generated fingerprint in the path) — and *then* `immutable` becomes true rather than
convenient. Not before.

## 3. Security headers

Sent on every response, documents and art and chunks alike. A header on an image costs nothing;
forgetting one costs the thing it prevents.

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | `DENY` (the half old browsers still read; `frame-ancestors` is the modern one) |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Content-Security-Policy` | see §4 — **production only** |

`X-Powered-By` is off. Vercel sets its own HSTS on `*.vercel.app`; ours is what a custom domain
would otherwise not get, and two identical HSTS headers are harmless where a missing one is not.

## 4. The CSP, and the three things measuring it changed

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self'; media-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

**1. `script-src` needs `'unsafe-inline'`.** Next hydrates from an inline bootstrap script and
streams the flight payload through more of them. Under a policy without it the page still serves
and still paints the server-rendered shell — and never hydrates. Measured, not guessed: `<main>`
came back with **zero characters** of text and exactly **one** violation. That is the shape of
this mistake and the reason `e2e/headers.spec.ts` does not stop at counting violations but makes a
hero, which is client state, a store write and an IndexedDB round trip. A dead page is quiet.

A nonce would fix it properly. A nonce needs middleware, middleware is a server runtime invoked on
every request, and this game does not have one — §1 is not a slogan, it is the deployment. Recorded
as the trade it is rather than left to look like an oversight.

**2. `style-src` needs it too.** React writes `style` props as inline style attributes and Motion
drives every animation through them; `style-src-attr` fires on the first frame otherwise.

**3. `'unsafe-eval'` is absent, and that took a code change rather than a config one.** Zod 4
compiles a fast validator with `new Function` and feature-detects the capability by calling
`Function("")` inside a try/catch. The throw is caught, the library degrades correctly to its
interpreted path, and the browser reports a `script-src` violation **on every single load** for a
capability we had already decided not to grant. Left alone it would have been a permanent line of
console noise that trains you to ignore console noise.

`src/engine/save/schema.ts` — the only module in the app that imports Zod — now declares
`z.config({ jitless: true })` up front, which skips the probe entirely. Measured cost on the real
175 KB v16 fixture: **3.20 ms → 4.16 ms**, once, at load. The difference between a policy that
forbids eval and one that merely watches it fail is 0.96 ms.

**What the policy is actually for.** No directive names a third-party origin, because the game
loads nothing from one — fonts are self-hosted by `next/font`, the art is ours, and the only
`fetch()` in the codebase is a same-origin HEAD probe for the optional `bgm.mp3`. For a game whose
entire save lives in the player's own IndexedDB, `connect-src 'self'` is the directive that
matters: there is nowhere off-origin for anything to send it.

**Dev is exempt.** `next dev` compiles through Turbopack and react-refresh, both of which need
`eval`, so the CSP is gated on `NODE_ENV === 'production'`. That exemption is only acceptable
because the e2e suite runs against `npm run build && npx next start` — the policy is exercised in
CI on every run, not merely declared in a config file.

## 5. The dev harnesses

`/dev/kit`, `/dev/combat`, `/dev/battle`, `/dev/economy`, `/dev/world` and `/dev/boom` ship with
the production build on purpose: they are how this game is inspected, they are cited throughout
`CLAUDE.md`, and three of them are load-bearing for the e2e suite. They are not the game, though,
so `/dev/*` carries `X-Robots-Tag: noindex` — a search result pointing at `/dev/boom`, which
throws on render by design, helps nobody. The suite also checks the tavern *lacks* the tag, which
is the half that would be a real bug.

## 6. Deploy checklist

1. `npm run verify` (typecheck → lint → unit → build) and `npm run test:e2e`.
2. `npm run perf` — Lighthouse ≥ 90 on the four stage screens, bundle within budget
   (`asset-pipeline.md` §5b).
3. Confirm the build log ends with 24 `○ (Static)` routes and no `ƒ`.
4. Tag the release; Vercel builds production from the tag. Previews come from branches.
5. In a **fresh browser profile**, play the opening: create a hero, take a contract, come back to
   the fight, reload mid-session. That is the Phase 18 acceptance line and no harness replaces it.
