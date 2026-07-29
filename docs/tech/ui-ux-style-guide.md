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

Two distinct icon jobs, deliberately sourced differently:

- **UI chrome — drawn in-house** (`src/components/icons/`): navigation, currencies, status. One
  single-weight "line-carved" family (24×24, `currentColor`, 1.5 stroke, round caps) so the
  interface reads as one designed system instead of an icon-pack collage. The icon *vocabulary*
  is declared in `src/data/icons.ts` and implemented in the components layer, so a missing glyph
  is a type error. The Vigor tankard is not a static glyph — it fills with ale as the meter drains.
- **Content icons — game-icons.net** (asset doc §2, from Phase 2): items, weapons, armour,
  monsters, pets, where variety is the whole point. Rendered on rarity backplates: chamfered tile,
  rarity frame + subtle inner glow, glyph in warm off-white; Set pieces add a sigil watermark corner.

Icons must be legible at **19px** — the nav rail size. Thin radial detail (a gear's spokes, a
horse's head) turns to mush; silhouettes survive. Test at size, not zoomed in.

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

## 8. Components (the kit — built ours, Kenney-assisted)

`<TavernPanel>` (chamfer+brackets, 3 elevations) · `<ActionButton>` (primary amber / secondary
timber / danger blood; press mechanics; cost badges for gold/dice actions) · `<ItemCard>` +
`<ItemTooltip>` (single source, items doc §4) · `<StatRow>` (+buy buttons w/ cost) · `<Meter>`
(vigor/xp/hp variants) · `<TimerChip>` · `<LadderRow>` (virtualized) · `<KeeperBark>` (speech
bubble, auto-dismiss 4s) · `<Toast>` stack (max 3, collapse to summary) · `<Modal>` (chamfered,
darkened stage, never stacks >1) · `<RevealCeremony>` (loot/gacha shared) · `<AmbientStage>`.
Storybook-style harness page (`/dev/kit`, dev-only route) shows every component & state for review.

## 9. UX rules (opinionated, binding)

1. **No dead ends:** every empty state names the next action ("No missions? The board refreshes at
   midnight — or ask Marla to shuffle it. [1 🎲]").
2. **Costs visible pre-click** (button badges), confirmations only for: Rare+ selling, Set
   scrapping, mount replacement, guild leave. Everything else is undo-free but cheap.
3. **One primary CTA per screen state**; hint chip system (tutorial doc §4) never competes with it.
4. **Tooltips everywhere numbers appear** (breakdowns: where a stat comes from, what a % means);
   glossary terms dotted-underlined.
5. **Timers show absolute + relative** on hover ("in 7m · 14:32").
6. **Keyboard:** 1–9 place switching, Esc closes, Enter confirms primary, arrows navigate cards;
   focus-visible brass outline (a11y pass in P17).
7. **The player is never mocked** for losses/bad luck; keeper barks tease systems, not the player.
