# Credits & Licenses

TavernRPG is built on the work of others. This file is the authoritative attribution list; it is
also rendered in-game under **Settings → Credits** (a 1.0 release gate — see `ROADMAP.md` P18).
Every third-party asset added to the project must be recorded here **in the same PR**.

## Art & audio

| Source | What | License | Attribution requirement |
|---|---|---|---|
| **Kenney** ([kenney.nl](https://kenney.nl)) | Fantasy UI pack (panels, borders, dividers), VFX particle pack — `game_assets/UI/Kenney_FantasyUIAssets`, `game_assets/VFX/Kenney_VFXParticles` | CC0 1.0 (public domain) | None required; credited by choice |
| **game-icons.net** ([game-icons.net](https://game-icons.net)) | Item, weapon, armour, monster and pet icons (from Phase 2) | **CC BY 3.0** | **Required** — per-icon author credit |
| **Project-owned art** | Scene backgrounds (23) and class portraits (5) in `game_assets/UI/` | Owned by the project author | — |
| **Project-drawn UI icons** | Navigation, currency and status glyphs — `src/components/icons/` | Owned by the project | — |

The interface chrome (rail, HUD, status glyphs) is drawn in-house as one single-weight family so
the UI reads as a designed whole rather than an icon-pack collage; game-icons.net supplies the far
larger set of *content* icons — items, weapons, monsters, pets — where variety is the point.

### game-icons.net attribution (CC BY 3.0)

Icons are vendored per `docs/tech/asset-pipeline.md` §2, and each entry in the generated icon
manifest carries its original author. Icons land with Phase 2, at which point the per-icon author
list is generated into this section and the in-game credits screen. Contributors whose work is
commonly used from that site include (non-exhaustive, filled in as icons are vendored):
Lorc, Delapouite, John Colburn, Felbrigg, Skoll, Sbed, Willdabeast, Carl Olsen — all licensed
under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

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

| Font | Use | License |
|---|---|---|
| **Alegreya Sans SC** (Juan Pablo del Peral, Huerta Tipográfica) | Display / headings | SIL Open Font License 1.1 |
| **Inter** (Rasmus Andersson) | Body / UI | SIL Open Font License 1.1 |

## Software

Next.js · React · TypeScript · Tailwind CSS · Zustand · Immer · Motion · Zod · idb · Vitest ·
Playwright · ESLint · Prettier — each under its own open-source license (MIT unless stated by the
package). Full dependency licenses resolve from `package-lock.json`.

## Inspiration

TavernRPG is heavily inspired by **Shakes & Fidget** (Playa Games GmbH) in feel and structure. No
code, art, text or data from that game is used; systems research and the deliberate differences are
documented in `docs/research/shakes-and-fidget-reference.md`. TavernRPG is an independent,
unaffiliated project.
