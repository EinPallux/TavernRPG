# Credits & Licenses

TavernRPG is built on the work of others. This file is the authoritative attribution list; it is
also rendered in-game under **Settings → Credits** (a 1.0 release gate — see `ROADMAP.md` P18).
Every third-party asset added to the project must be recorded here **in the same PR**.

## Art & audio

| Source | What | License | Attribution requirement |
|---|---|---|---|
| **Kenney** ([kenney.nl](https://kenney.nl)) | Fantasy UI pack (panels, borders, dividers), VFX particle pack — `game_assets/UI/Kenney_FantasyUIAssets`, `game_assets/VFX/Kenney_VFXParticles` | CC0 1.0 (public domain) | None required; credited by choice |
| **Project-owned art** | Scene backgrounds (23) and class portraits (5) in `game_assets/UI/` | Owned by the project author | — |
| **game-icons.net** (5 artists, listed below) | 67 of the game's 69 glyphs — `game_assets/icons/`, compiled to `src/components/icons/vendored.ts` | CC BY 3.0 | **Required**, per icon, per artist |
| **Project-drawn icons** | The remaining 2 — the chevron and the Vigor tankard — `src/components/icons/index.tsx` | Owned by the project | — |

### game-icons.net — the per-artist credit

**Icons made by Lorc, Delapouite, Skoll, Carl Olsen and Willdabeast**, from
[game-icons.net](https://game-icons.net), under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

That sentence is the attribution, and the names in it are the point: **CC BY credits the artist,
not the website.** game-icons.net publishes per author — the upstream archive is one directory per
contributor, and its licence asks for "a mention *Icons made by {author}*" — so a single line
reading "game-icons.net" would name nobody the licence names. The full upstream notice is vendored
verbatim at `game_assets/icons/LICENSE.txt`, next to the artwork it covers.

| Artist | Icons | Where |
|---|---|---|
| **Lorc** ([lorcblog.blogspot.com](https://lorcblog.blogspot.com)) | 43 | anvil, battle-axe, battle-gear, beer-stein, belt-buckles, breastplate, broadsword, bubbling-flask, cat, crystal-ball, crystal-wand, flying-flag, fox-head, frog, gears, gem-pendant, gems, hourglass, hunting-horn, imp, key, laurels, leather-boot, lyre, metal-bar, metal-scales, owl, padlock, paw-print, plain-dagger, raven, sabers-choc, scarab-beetle, scroll-unfurled, snail, spark-spirit, spiked-mace, stiletto, sword-clash, treasure-map, turtle, visored-helm, wizard-staff |
| **Delapouite** ([delapouite.com](https://delapouite.com)) | 20 | bow-arrow, cave-entrance, character, drum, gauntlet, griffin-symbol, horizon-road, horse-head, horseshoe, perspective-dice-six-faces-random, quiver, rat, ring, sitting-dog, sparkles, spell-book, star-medal, trophy-cup, two-coins, watchtower |
| **Skoll** | 2 | donkey, mounted-knight |
| **Carl Olsen** ([@unstoppableCarl](https://twitter.com/unstoppableCarl)) | 1 | crossbow |
| **Willdabeast** ([wjbstories.blogspot.com](https://wjbstories.blogspot.com)) | 1 | round-shield |

The names above are the upstream file names, which is deliberate: the drawing a TavernRPG icon id
resolves to is a decision recorded in `scripts/icon-map.mjs` (`tankard: 'beer-stein'`,
`stairsDown: 'cave-entrance'`), and the two lists have to be traceable to one another for this
table to mean anything. The author is carried from the vendored directory name into the generated
module and read back out by `src/components/icons/icons.test.ts`, which fails if a sixth artist
ever ships without appearing here — a census, not a promise. The last version of this section was
a promise.

**Nothing was modified except the packaging.** The vendoring step strips the site's black preview
backing and the hard-coded `fill="#fff"` so each drawing inherits `currentColor`; the path
coordinates are byte-identical to upstream.

### The two that are not drawings

The chevron and the Vigor tankard stay in-house. A chevron is a direction rather than a thing —
no themed drawing of "next" beats an arrow — and the tankard is a *meter*: its clip path is tied
to the mug it draws so the ale level can be a real liquid line. Swapping either for artwork would
make it worse at its job.

### Sound effects

**No audio files ship with the game and no sound is licensed from anyone.** Every one of the 24
cues is synthesized in the browser from an oscillator recipe in `src/data/sfx.ts`
(`docs/tech/asset-pipeline.md` §6) — the plan named Kenney's CC0 audio pack, and the built game
uses none of it. This row exists to say so: an attribution list is only useful if it is also
accurate about what is *not* in it.

### Background music

The game plays an optional player-supplied `public/assets/audio/bgm.mp3` if present
(`docs/tech/asset-pipeline.md` §6). No music ships with the game, so no music license applies —
whoever supplies the file is responsible for its rights.

## Fonts

| Font | Use | License | Attribution requirement |
|---|---|---|---|
| **Alegreya Sans SC** (Juan Pablo del Peral, Huerta Tipográfica) | Display / headings | SIL Open Font License 1.1 | **Required** |
| **Inter** (Rasmus Andersson) | Body / UI | SIL Open Font License 1.1 | **Required** |

**These are the build's only mandatory attributions, and they were the ones not listed as such.**
`next/font/google` does not link out to Google — it downloads both families at build time and
serves the `.woff2` from this origin, so the game *redistributes* them. The OFL travels with a
redistributed font: the copyright notice and the licence must accompany it. Naming the designers
here and on the in-game credits screen is the notice; the licence itself is linked from both.

→ Open question for release: whether to vendor the full OFL 1.1 text next to the served fonts
rather than link it. Linking is common practice and the licence is unambiguous about the notice;
whether it satisfies "shall be included in all copies" for a webfont is a judgement call that
should be made deliberately rather than by default. Logged in `USER_QUESTIONS.md` (Q24).

## Software

Next.js · React · TypeScript · Tailwind CSS · Zustand · Immer · Motion · Zod · idb · Vitest ·
Playwright · ESLint · Prettier — each under its own open-source license (MIT unless stated by the
package). Full dependency licenses resolve from `package-lock.json`.

## Inspiration

TavernRPG is heavily inspired by **Shakes & Fidget** (Playa Games GmbH) in feel and structure. No
code, art, text or data from that game is used; systems research and the deliberate differences are
documented in `docs/research/shakes-and-fidget-reference.md`. TavernRPG is an independent,
unaffiliated project.
