# UI/UX Style Guide — "The Gilded Tankard" Design Language

> The binding visual & interaction contract. Hard user requirements honored throughout: **no serif
> fonts · no rounded AI-slop panels · desktop-first full-viewport · highly animated · not the
> stock Kenney look everywhere · no generic AI design.**

## 1. Design concept

**"Weathered oak, wrought brass, faceted light."** The UI is the tavern itself: dark timber
structure, parchment work-surfaces, brass fittings — accented with the **low-poly facet motif**
from the prepared art (class portraits/backdrops), which appears in headers, dividers, XP bars and
loot beams as angular geometric cuts. Warm, physical, angular. Never glassy, never bubbly,
never neon-gradient dashboard.

## 2. Layout (desktop-first, full viewport)

```
┌────────────────────────────────────────────────────────────┐
│ TOP HUD (72px): portrait+level ring · XP sliver · Gold ·   │
│ Dice · Vigor tankard · mount chip · activity chip · ⚙      │
├──────────┬─────────────────────────────────────────────────┤
│ NAV RAIL │            STAGE (the current place)            │
│ (240px,  │   full-bleed backdrop, content panels float     │
│ collaps- │   on structured parchment/timber surfaces       │
│ ible 72) │                                                 │
└──────────┴─────────────────────────────────────────────────┘
```

- Optimized 1920×1080 & 2560×1440 (stage max-width 2200px, centers beyond); functional ≥1366×768
  (rail collapses, HUD condenses) — Q19. No mobile at 1.0.
- The stage is *scenic*: each place shows its backdrop with panels anchored to sensible surfaces
  (shop shelves align to the shelf line, mission cards sit on the quest table zone). Panels never
  cover >65% of the backdrop at 1080p — the world stays visible.
- Nav rail = town list with icon + name + state badges (timer chips, unclaimed dots, lock
  silhouettes with level tags). Active place gets an ember-glow edge.

### 2.1 Two ways to walk the town (post-1.0)

The **Town Map** is the same list as the rail, drawn as the painting it describes — Emberhollow
from above: fourteen buildings, each a door, and the road out through the gate. It is the game's
front door (`/` redirects to it),
because standing outside is a state the game should be able to be in.

- **Neither one is the real navigation.** The map teaches where things are; the rail is faster
  once you know. Whichever a player prefers has to be complete on its own, which means **every
  signal appears on both** — badges come from `state/townSignals.ts` and nothing else may hold a
  second copy. A dot on the rail and not on the map is a player missing a companion for a
  fortnight because they navigate by picture.
- **Locked buildings stay painted**, carrying their level plate, for the same reason the rail
  keeps locked rooms visible: ambition you can see beats mystery meat. The dimming is a feathered
  radial, not a scrim on the rectangle — at level 1 twelve of the fourteen are shut, and hard-edged
  boxes turn a painting into a spreadsheet.
- **The hotspots are percentages of the art, so the box holding them must be the box holding the
  art.** `.town-map-frame` sizes the largest 16:9 that fits the stage using container-query units
  (`min(100cqw, 100cqh × 16/9)`), and the image and the buttons are both inside it. A frame that
  letterboxes inside a larger box still renders fourteen buttons — on the grass.
  `e2e/map.spec.ts` measures the real boxes at three window sizes rather than trusting the CSS.

## 3. Shape language (the anti-rounded-slop rules)

- **Chamfers, not radii:** panels/buttons/cards use 45° corner cuts (`clip-path` token, 3 sizes:
  6/10/16px). `border-radius` allowed only ≤4px on tiny elements (chips, pips) — lint-guarded token.
- **Structured borders:** 2px etched dual-line borders (dark outer, light inner) + brass corner
  brackets on primary panels (SVG caps, not Kenney's rounded frames). Kenney 9-slice textures may
  fill *surfaces* (parchment/wood grain) but edges are always ours.
- **Facet accents:** header underlines, dividers, meter fills, and the loot beam use angular facet
  strips (echoing portrait backgrounds) — this is the signature element that keeps the UI "ours".
- Density: generous but firm — 8px base grid, panel padding 20/24px, no floating cards in a void.

## 4. Color tokens (dark, warm, readable)

| Token | Value | Use |
|---|---|---|
| `--wood-900/800/700` | `#17110C / #221913 / #2E231A` | app frame, rail, panel bases |
| `--parchment-500/300` | `#E8D9B0 / #F2E8CB` | content surfaces, cards |
| `--ink-900` | `#241B12` | text on parchment |
| `--amber-500` | `#E8A33D` | primary accent, CTAs, XP/facets |
| `--ember-600` | `#D96C2F` | vigor, warnings-warm, fire accents |
| `--arcane-500` | `#3FA7A0` | INT/mage accents, info |
| `--blood-600` | `#A73A2E` | damage, danger, defeat |
| `--moss-600` | `#4C7A3F` | success, gold-gain ticks |
| rarity | grey `#9A938B` · green `#6FA84E` · blue `#4A8FD4` · purple `#9B5FD0` · gold `#E8A33D` | frames/beams/text |

Contrast: all text pairs ≥ 4.5:1 (checked in CI via token test). Dark theme only at 1.0.

## 5. Typography (no serifs — hard rule)

- **Display: Alegreya Sans SC** (small-caps humanist sans — medieval air with zero serifs):
  headers, panel titles, place names, battle banners.
- **Body/UI: Inter** (variable): everything else; **tabular numerals** (`font-variant-numeric`)
  for gold/damage/timers so counters don't jitter.
- Scale: 12 / 14 / 16 / 20 / 26 / 34 / 48 (battle numbers larger, animated). Self-hosted WOFF2,
  `font-display: swap`, subset latin. Fonts pending user taste-check (Q14).

## 6. Iconography & item presentation

**One family: game-icons.net silhouettes, 512-grid, filled, `currentColor`.**

The icon *vocabulary* is declared in `src/data/icons.ts` — 69 ids the content layer can name while
staying React-free — and implemented in `src/components/icons/`, so a missing glyph is a type
error rather than a blank square in the nav rail. Every id but two resolves to a game-icons.net
drawing, chosen per id in `scripts/icon-map.mjs`, vendored under
`game_assets/icons/<author>/<name>.svg` and compiled by `npm run icons:sync`.

This replaced a hand-drawn single-weight line family (24×24, 1.5 stroke, round caps) that had
covered the whole vocabulary since Phase 1. The trade was deliberate and it went one way: a
uniform line weight is a real virtue, and it is worth less than a beer stein that reads as a beer
stein and twelve companions a player can tell apart at a glance. **Coherence comes from the
family being one family** — every icon on the same grid, filled, tinted by `color`, sized by one
prop — not from every icon having been drawn by the same hand.

- **The two exceptions.** A chevron is a *direction*, not a thing; no themed drawing of "next"
  beats an arrow. The Vigor tankard is a *meter* — its clip path is tied to the mug it draws so
  the ale level can be a real liquid line (§7). Both would get worse as artwork, so both stay
  hand-drawn on the 24 grid.
- **The licence is per icon.** game-icons.net is CC BY 3.0 and CC BY credits the **artist**, not
  the site. The author travels with the drawing from the vendored directory name into the
  generated module and on into the CREDITS.md table; `src/components/icons/icons.test.ts` fails
  if a shipped artist is missing from it, or if a stated count is wrong.
- **Never hand-edit `vendored.ts`, and never rewrite path data with a regex.** SVG path data is
  compact — in `M10.5.75l3.25.5` the token `10.5.75` is *two* numbers — so a `\d+\.\d+` match eats
  the first and leaves the second glued on. That is not hypothetical: it shipped once, collapsed
  every drawing into a sliver, and passed typecheck, lint and the production build. A screenshot
  found it. The census now asserts the generated path is byte-identical to the vendored file.
- **Item and pet icons** are the same family, rendered on rarity backplates: chamfered tile,
  rarity frame + subtle inner glow, glyph in warm off-white; Set pieces add a sigil watermark
  corner.

Icons must be legible at **19px** — the nav rail size. Thin radial detail turns to mush;
silhouettes survive, which is most of why filled artwork beat the stroke family here. Test at
size, not zoomed in.

## 7. Motion system (the "alive" contract)

Foundation: Motion (Framer) springs — `snappy` (chips, hovers: stiffness 500/damping 30),
`standard` (panels: 380/32), `dramatic` (loot/battle: 260/26). Durations 120–400ms UI, up to 1.4s
ceremonies. **Everything that changes, moves; nothing blocks input > 400ms except designed
ceremonies (all skippable).**

- **Place transitions:** stage crossfade + 12px directional drift (rail order = direction), 240ms;
  backdrop parallax settle. No door-slam gimmick between every screen (fatigue) — reserved for
  dungeon descent.
- **Panels/cards:** stagger-in 40ms/item (mission cards, shop stock, ladder rows on jump).
- **Counters:** gold/XP/honor always tick-count with easing + a "+N" flyout from source to HUD
  (coin arc on collect moments).
- **Meters:** Vigor tankard drains with liquid slosh keyframe; XP facet-bar fills with edge shimmer
  on gain; HP bars per battle spec.
- **Loot reveal (shared ceremony):** card back → rarity beam (angular facet rays, rarity color)
  → flip → statline cascade (60ms/line). Epic+: half-second hold + particle ring. Used by missions,
  dungeons, forge, gacha (gacha adds the dice tumble + tarot fan, its spec §6).
- **Battle scene:** full choreography in `combat.md` §4 (lunges, shakes, crit slow-mo, verse
  banners) — the quality bar for everything else.
- **Ambient:** every place gets its recipe (asset doc §5): tavern fire pulse + motes, forge
  sparks, stable straw drift, arena torch flicker, gacha candle sway.
- **Feedback floor:** every click acks in ≤100ms (press-in 2px + brass tick); disabled states
  explain themselves on hover (tooltip with the *reason*, never bare grey).
- Reduced-motion: `prefers-reduced-motion` collapses ceremonies to fades, disables shakes —
  without breaking information delivery.

### 7.1 An element on its way out is still an element (Phase 18)

**`AnimatePresence mode="wait"` keeps the outgoing child mounted, and mounted means clickable.**
The tutorial chip was keyed on `${beat.id}:${folded ? 'folded' : 'away'}`, so a label change was
an exit plus a re-entrance rather than a re-render. Walking to the beat's room unmounted the "go
here" chip; folding the card a moment later asked for the "show me again" one; and in the couple
of hundred milliseconds between, the chip a player saw was the *old* one, still animating out,
still taking clicks, and running a handler whose closure said there was nothing to do. It looked
live and did nothing — reproducible at zero settle and gone at 600ms, which is the signature of
an animation deciding behaviour.

Two rules fall out, and they apply to every presence-animated control:

1. **Key on identity, not on state.** The key answers "is this a different thing?", not "does it
   look different?". A changed label is a re-render; a changed beat is a new chip.
2. **A click handler reads the store, not its closure.** An element that outlives the render that
   drew it will answer for the state it was born in. `useShellStore.getState()` in the handler
   costs nothing and cannot be stale.

Both have since been re-learned twice, which is why they are rules rather than anecdotes: the
save-slot delete confirm keyed on *which slot*, and the town map's plaque keyed on *which
building*. Same shape every time — one element that changes what it is about, keyed as though it
were several. The map's version put two plaques on screen at once and tripped a strict-mode
locator; the slot picker's put two "Delete for good" buttons in the DOM, the stale one first.

### 7.2 A `clip-path` clips its descendants, and no test framework will tell you

The town map's plaque started life inside its hotspot button, which carries `chamfer-sm` — and a
chamfer is a `clip-path`. Every plaque was therefore cut off at the edge of the building it
belonged to, and never appeared on screen at all. **The e2e test asserting it was visible passed
throughout**, because `toBeVisible` knows about `display`, `visibility`, `opacity` and box size,
and nothing whatsoever about clipping; `boundingBox()` is no better. A screenshot found it.

So, for anything that deliberately overhangs its parent — tooltips, plaques, badges pinned outside
a box: **it goes in a layer, not in the thing it describes.** The map draws one plaque as a sibling
of every hotspot, which also settles the paint order (absolutely-positioned siblings paint in DOM
order, so an early building's plaque would have gone under a later one).
When the invariant matters, assert it directly — `e2e/map.spec.ts` walks the plaque's ancestors and
fails if any of them has a `clip-path`.

## 8. Components (the kit — built ours, Kenney-assisted)

`<TavernPanel>` (chamfer+brackets, 3 elevations) · `<ActionButton>` (primary amber / secondary
timber / danger blood; press mechanics; cost badges for gold/dice actions) · `<ItemCard>` +
`<ItemTooltip>` (single source, items doc §4) · `<StatRow>` (+buy buttons w/ cost) · `<Meter>`
(vigor/xp/hp variants) · `<TimerChip>` · `<LadderRow>` (virtualized) · `<KeeperBark>` (speech
bubble, auto-dismiss 4s) · `<Toast>` stack (max 3, collapse to summary) · `<Modal>` (chamfered,
darkened stage, never stacks >1) · `<RevealCeremony>` (loot/gacha shared) · `<AmbientStage>`.
Storybook-style harness page (`/dev/kit`, dev-only route) shows every component & state for review.

### 8.1 Tooltips are ours, and `title=` is banned

A native `title` is the one piece of another product's interface the game cannot restyle: a grey OS
rectangle, in a system font, after a second and a half, hover-only and never on focus. All
twenty-six of them are `useTooltip()` now, and `src/components/ui/tooltips.test.ts` reads the source
so the twenty-seventh cannot arrive by accident — a rendered `title` breaks nothing, it just quietly
looks like Windows in one corner of Emberhollow. (`title` as a *prop* stays: `<TavernPanel
title="Backpack">` is a heading.)

The design, and the reasons that are not taste:

- **One element, at shell level.** Triggers publish to `state/tooltipStore`; `TooltipLayer` renders
  the only tooltip in the game. Not tidiness — §7.2: nearly everything here wears a chamfer, a
  chamfer is a `clip-path`, and a clip path clips descendants. A tooltip nested in the thing it
  describes is a tooltip that vanishes inside a panel.
- **Hover waits 340 ms, focus does not, and the row stays warm for 600 ms.** Dragging the cursor
  across the HUD must not fire six tooltips; reading along the same row must not cost a third of a
  second per chip. Keyboard focus opens at once — that user asked for it and cannot hover past it.
- **Press, scroll, resize and Escape all close it — and cancel the ones on the way.** A dismissal
  that only clears what is open lets a hover timer started before it fire afterwards, which is a
  tooltip appearing *because* the player dismissed one.
- **Two lines, not one.** `title` and an optional `detail`; a plain string containing `" — "` splits
  itself, which is how half the old ones were already written.
- **It works on a `disabled` button**, because Chromium fires `pointerenter` on one even though it
  never fires `click` — so the one control the browser refuses to let you use can still explain
  itself. That is UX rule 2's other half, and the most valuable tooltip in the game.
- **Placement is measured, not guessed** (`place()`, unit-tested): under the trigger, flipped above
  when the window runs out, clamped inside both edges.

## 9. UX rules (opinionated, binding)

1. **No dead ends:** every empty state names the next action ("No missions? The board refreshes at
   midnight — or ask Marla to shuffle it. [1 🎲]").
2. **Costs visible pre-click** (button badges), confirmations only for: Rare+ selling, Set
   scrapping, mount replacement, guild leave. Everything else is undo-free but cheap.
3. **One primary CTA per screen state**; hint chip system (tutorial doc §4) never competes with it.
4. **Tooltips everywhere numbers appear** (breakdowns: where a stat comes from, what a % means);
   glossary terms dotted-underlined. Ours, never the browser's — §8.1.
5. **Timers show absolute + relative** on hover ("in 7m · 14:32").
6. **Keyboard:** 1–9 place switching, Esc closes, Enter confirms primary, arrows navigate cards;
   focus-visible brass outline (a11y pass in P17).
7. **The player is never mocked** for losses/bad luck; keeper barks tease systems, not the player.

## 10. Contrast (Phase 17 pass) — the ladder, and the debt

**Text colour is not a free choice.** The Phase 17 accessibility pass measured every text run in
every room against the pixels actually painted behind it (`e2e/contrast.ts`) and found **500+**
below WCAG AA. It is now at eleven. What follows is the rule that got it there and the list of
what is left.

### 10.1 The muted ladder

Three tiers, and no more, because you cannot have six perceptible grades of muted text and have
all six readable on timber:

| token | use |
|---|---|
| `text-parchment-300` | Headings and anything the eye should land on first. |
| `text-parchment-500/85`–`/75` | Body text with emphasis. |
| `text-parchment-500/72` | **The floor.** Every hint, caption, unit and aside. |

Below `/72` is banned. The pass rewrote 408 usages spread across `/18` to `/70`; the old ladder
measured 2.5:1 to 4.3:1 against the panels it sat on.

### 10.2 Two families, and which surface each belongs on

Emberhollow is dark timber with one light surface — parchment (keeper barks, duelling posters,
the tutorial card). Semantic colours therefore come in pairs, and using the wrong half is the
single most common way to reintroduce a failure:

| on dark timber | on parchment | meaning |
|---|---|---|
| `text-blood-400` | `text-blood-700` | damage taken, a loss |
| `text-moss-400` | `text-moss-600` | a gain, a heal |
| `text-ember-400` | `text-ember-700` | a warning, a keeper's flourish |
| `text-amber-300` / `-400` | `text-amber-800` | gold, currency, emphasis |

The `-500`/`-600` shades stay exactly as they are **as fills, borders and bar glows** — that is
what they were chosen for. They are simply not foreground colours.

Two related findings worth keeping: keeper names were `text-amber-700/80` for sixteen phases, and
`amber-700` was never a project token — it fell through to Tailwind's stock amber and nobody
noticed. And the rarity colours were lifted a step; the *fills* are unchanged, but epic at
`#9b5fd0` read 3.7:1 as a label.

### 10.3 The debt — closed in Phase 18, bar two readings

Eleven remained at the end of Phase 17. **Two remain now, and neither has a surface behind it.**

**Type on backdrop art is done.** Five places had it and all five now carry a scrim: the Hall of
Fame header over bright water, a zone card's name over a wheat field, the forge's bench tabs on
cold metal, and the patrol and arena eyebrow labels on blue. The rule that came out of it: *a tint
is a mood, a scrim is for type* — `AmbientStage`'s per-room tint sets the atmosphere and does not
make a surface, so anything with words on it needs its own.

**A highlight that forces every child to flip is the wrong highlight.** The Hall's own row was
filled amber, making the single light surface in a list of 1,501 dark ones; three of its four
columns were given the ink half of the pair and the fourth still failed. That is the tell — the
surface was wrong, not the text. It is a bright border on a dark fill now, like every other row.

**The keeper-bark and level-badge readings were the tutorial spotlight**, not a cross-fade. Its
`0 0 0 100vmax rgb(6 5 4 / 0.68)` shadow dims the whole page except its target, so every audited
element outside the hole came back at 32% of its real colour — the level badge reported a stable
**1.52:1** across a dozen runs while genuinely being amber-on-ink at 7.9:1. *A wrong number that
repeats exactly looks like a defect;* three harness fixes went past it before the cause turned out
to be a modal overlay the audit had walked into. The audit opts the tour out now.

The two survivors are budgeted in `e2e/a11y.spec.ts` with the evidence written down: in both, the
reported text colour belongs to the *other variant of the same component* from the one whose
background was sampled — a pairing the DOM cannot emit, which points at the rect and the pixel
being read at different scroll positions rather than at a colour being wrong.

### 10.4 Measuring it

`npx playwright test e2e/a11y.spec.ts`. Contrast is read from a screenshot with every glyph made
transparent, sampling the band the text occupies — `axe-core` cannot do this job here, because it
gives up (honestly) at a `background-image`, and every room in the game has one. On the tavern it
could resolve **one** element out of 104. A green audit that inspected one node is worse than no
audit; that is why this harness exists rather than a call to `axe.run`.


## 11. Performance (Phase 17 pass)

`npm run perf` — Lighthouse on the stage screens, a bundle budget, and the battle scene's
main-thread cost. Needs a production server on :3100.

| measure | budget | measured (P17 → P18) |
|---|---|---|
| Lighthouse performance, `/tavern` `/character` `/arena` `/hall` | ≥ 90 | 98 · 98 · 98 · 99 → **97 · 97 · 98 · 97** |
| LCP | — | 1.0–1.1s → 1.0–1.2s (was **21.5s**) |
| Total blocking time | — | 10–30ms → 20–40ms (was 530ms) |
| Cumulative layout shift | — | 0 |
| First-load JS per room | 600 KB | 225–326 KB → 258–324 KB |
| Largest single chunk | 400 KB | 312 KB |
| Battle scene, main thread | 8ms/frame | 0.7ms → **0.8ms** |

**The whole score was one asset decision.** See asset-pipeline §5b: 56 MB of backdrop PNGs served
as authored. Nothing about the code changed to take Lighthouse from 49 to 98.

**Lighthouse measures the machine as much as the build, and near a boundary that matters.** Idle,
the four rooms sit at 97–98 against a gate of 90. With anything else resident, one of them drops
under it — a *different* one each attempt, which is contention rather than a slow screen. The
sharpest version: the identical check sequence passed when driven straight from `node` and failed
through `npm run`, on nothing but the npm wrapper still being alive.

So `npm run release` gates the deterministic half (bundle, per-route JS, main-thread cost — same
numbers every run) and hands Lighthouse to `npm run perf` with "on an idle machine" attached. The
gate is not weakened: `npm run perf` still fails under 90 and is step 2 of the deploy checklist.
A release command that cries wolf teaches you to re-run it until it agrees with you.

**The point or two Phase 18 gave back is the tab-lock election, and it was bought deliberately.**
The shell now paints nothing until the save has loaded (architecture §3), so the largest element
arrives after a 350ms election rather than during it. Every room stays comfortably over the ≥ 90
gate. The alternative was a room drawn over an empty store, which is not a faster game — it is a
wrong one that renders sooner.

### 11.1 Frame rate is not a gate here, and that is deliberate

The pass measured a ×4 fight at 20fps against a 60fps baseline on a static room — and then found
the container renders through **SwiftShader**, with no GPU, so every composited layer, blur,
shadow and canvas blit is CPU work. Reporting that as a defect would be reporting the absence of
a graphics card.

So the gate is **main-thread cost** — script, layout and style recalc per frame, read from CDP,
all GPU-independent. The scene spends **0.7ms** of an 8ms budget. The raw fps is still printed
because it is the number a human wants to see; it is just not the number that can fail a build.

Two things were fixed along the way, and both are rules rather than one-offs:

- **A value the timeline already computed is `style`, not `animate`.** The fighter's lunge offset
  was in Motion's `animate`, which asked it to start a new tween toward a target that changed
  again on the next frame — sixty times a second, for two fighters — paired with a `transition`
  object whose identity swapped every tick, so each tween tore down the last. `animate` is for
  state changes; per-frame values go through `style`.
- **`filter` is the most expensive thing Motion can tween.** The knockout desaturation is binary,
  so it is a CSS transition now.

`frameAt` was the first suspect and was exonerated by measurement: **9 microseconds** a call,
folding the whole timeline from beat zero. The pure-fold design costs nothing worth naming.
