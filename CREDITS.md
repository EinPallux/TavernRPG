# Credits & Licenses

TavernRPG is built on the work of others. This file is the authoritative attribution list; it is
also rendered in-game under **Settings → Credits** (a 1.0 release gate — see `ROADMAP.md` P18).
Every third-party asset added to the project must be recorded here **in the same PR**.

## Art & audio

| Source | What | License | Attribution requirement |
|---|---|---|---|
| **Kenney** ([kenney.nl](https://kenney.nl)) | Fantasy UI pack (panels, borders, dividers), VFX particle pack — `game_assets/UI/Kenney_FantasyUIAssets`, `game_assets/VFX/Kenney_VFXParticles` | CC0 1.0 (public domain) | None required; credited by choice |
| **Project-owned art** | Scene backgrounds (23) and class portraits (5) in `game_assets/UI/` | Owned by the project author | — |
| **Project-drawn icons** | All 71 navigation, currency, status, item and pet glyphs — `src/components/icons/` | Owned by the project | — |

Every icon in the game is drawn in-house as one single-weight family, so the interface reads as a
designed whole rather than an icon-pack collage.

### game-icons.net — planned, never used

**Nothing from game-icons.net ships, and no CC BY 3.0 attribution is owed.** This section used to
claim the opposite: it listed a *required* per-icon author credit and promised a generated author
list "as icons are vendored". None ever were. The plan called for game-icons content because
variety is the point for items and monsters; what actually happened is that the hand-drawn family
grew to cover them, and two module headers in `src/components/icons/` still describe the plan
rather than the build.

Recording the absence rather than deleting the row, because an attribution list that credits work
you are not using is not generous — it is unreliable, and an unreliable list is the kind nobody
checks on the day it matters. Should game-icons artwork ever be vendored, the CC BY 3.0 obligation
is real and per-icon, and this is where it goes.

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
