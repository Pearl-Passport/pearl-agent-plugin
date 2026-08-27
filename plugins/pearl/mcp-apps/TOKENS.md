# Pearl MCP Apps token bridge

The MCP Apps widget is a standalone, host-sandboxed bundle, so it cannot import
the application stylesheet. Instead, `src/styles.css` re-declares a reviewed
subset of Pearl's canonical design system as `--pearl-ui-*` tokens. This file
is the documented bridge: **every widget token maps to exactly one canonical
Pearl source** in `src/index.css` (the `[data-ui="pearl"]` scope). There is no
second design system — when a canonical value changes, update the mapped value
here and in `src/styles.css`, then run `npm run generate`.

Structural tokens stay host-overridable through the allowlisted
`hostContext.styles.variables` keys (see `allowedHostStyleKeys` in
`src/app.mjs`), matching the "Pearl identity inside a host-native shell"
model: system fonts and host-tunable structure, fixed Pearl brand accents.

## Structural tokens (host-overridable)

| Widget token | Canonical Pearl source | Light | Dark | Host override key |
| --- | --- | --- | --- | --- |
| `--pearl-ui-canvas` | `--pearl-bg` | `#FBFAF7` | `#15171B` | `--color-background-primary` |
| `--pearl-ui-surface` | `--pearl-paper` | `#FFFFFF` | `#1F2228` | `--color-background-secondary` |
| `--pearl-ui-subtle` | `--pearl-subtle` | `#F3EFE9` | `#23262C` | `--color-background-tertiary` |
| `--pearl-ui-text` | `--pearl-ink` | `#17212A` | `#F4F1EB` | `--color-text-primary` |
| `--pearl-ui-text-secondary` | `--pearl-ink-3` (light, AA body) / `--pearl-ink-2` (dark) | `#6B6B6B` | `#B8B4AB` | `--color-text-secondary` |
| `--pearl-ui-border` | `--pearl-ink-4` | `rgba(85,85,85,0.30)` | `rgba(244,241,235,0.28)` | `--color-border-primary` |
| `--pearl-ui-border-soft` | `--pearl-ink-4` at hairline strength | `rgba(85,85,85,0.16)` | `rgba(244,241,235,0.14)` | `--color-border-secondary` |
| `--pearl-ui-focus` | `--pearl-accent-on-tint` | `#8A4F36` | `#D89C7E` | `--color-ring-primary` |
| `--pearl-ui-danger` / `-bg` | `--pearl-danger-on-tint` / `--pearl-danger-tint` | `#843E3E` / `rgba(159,79,79,0.14)` | `#DE9393` / `rgba(159,79,79,0.22)` | `--color-text-danger` / `--color-background-danger` |
| `--pearl-ui-success` / `-bg` | `--pearl-success-on-tint` / `--pearl-success-tint` | `#2A5C54` / `rgba(60,120,112,0.14)` | `#82C6B9` / `rgba(60,120,112,0.22)` | `--color-text-success` / `--color-background-success` |
| `--pearl-ui-warning` / `-bg` | `--pearl-warning-on-tint` / `--pearl-warning-tint` | `#8A5A12` / `rgba(220,176,111,0.18)` | `#E5C48F` / `rgba(220,176,111,0.22)` | `--color-text-warning` / `--color-background-warning` |
| `--pearl-ui-font` | system sans (host constraint; Pearl app uses Inter) | system stack | system stack | `--font-sans` |
| `--pearl-ui-radius-sm/md/lg` | `--radius` ladder | `8 / 12 / 16px` | same | `--border-radius-sm/md/lg` |
| `--pearl-ui-shadow` | Pearl soft elevation | ink-tinted | black-tinted | `--shadow-sm` |

## Brand tokens (fixed — never host-overridden)

| Widget token | Canonical Pearl source | Light | Dark |
| --- | --- | --- | --- |
| `--pearl-ui-accent` | `--pearl-accent-on-tint` | `#8A4F36` | `#D89C7E` |
| `--pearl-ui-accent-strong` | `--pearl-accent` | `#A8674B` | `#C28368` |
| `--pearl-ui-accent-bg` | `--pearl-accent-tint` | `rgba(168,103,75,0.12)` | `rgba(194,131,104,0.18)` |
| `--pearl-ui-saved` / `-bg` | `--pearl-saved` family (AA text via warning-on-tint) | `#8A5A12` / `rgba(184,137,60,0.14)` | `#E5C48F` / `rgba(210,160,78,0.20)` |
| `--pearl-ui-navy` | `--pearl-navy` | `#212F52` | `#F4F1EB` (canonical dark inversion) |
| `--pearl-ui-action` / `-hover` / `-fg` | `--pearl-accent-on-tint` / `--pearl-accent` / `--pearl-paper` | `#8A4F36` / `#A8674B` / `#FFFFFF` | `#D89C7E` / `#E2B09A` / `#15171B` |
| `--pearl-ui-font-display` | system-serif echo of Pearl display serif (Playfair) | `ui-serif, "New York", Georgia…` | same |

## Glass layer (derived, with mandatory fallbacks)

| Widget token | Derivation | Purpose |
| --- | --- | --- |
| `--pearl-ui-glass` / `-strong` | `--pearl-paper` at 60% / 78% (dark: `--pearl-paper` at 55% / 74%) | translucent card/chip surfaces |
| `--pearl-ui-glass-border` | white hairline over glass (dark: `rgba(255,255,255,0.14)`) | card hairlines |
| `--pearl-ui-glass-blur` | `16px` | backdrop blur radius |
| `--pearl-ui-wash-a/b/c` | `--pearl-accent-tint`, `--pearl-saved-tint`, navy tint | panel ambient wash |
| `--pearl-ui-irid-1…4` | Pearl-warmed variant of the app's `.card-glass` iridescent border (terracotta/honey/navy instead of lilac/mint) | panel hairline gradient |
| `--pearl-ui-cat-0…5` (+ `-deep`) | canonical category colors: restaurant `#9F4F4F`, bar `#B8862E`, hotel `#3E5C76`, winery `#8E5C7A`, cafe `#855A42`, spa/other `#3F7368` | deterministic fallback artwork |

Glass rules:

- Blur and translucency are progressive enhancement inside
  `@supports (backdrop-filter…)`. The base declarations are the opaque
  canonical surfaces, so unsupported hosts render correctly.
- `prefers-reduced-transparency: reduce` and `prefers-contrast: more` return
  every surface to opaque `--pearl-ui-surface`; `forced-colors: active`
  removes decorative gradients entirely.
- `prefers-reduced-motion: reduce` collapses all animation and the card hover
  lift.

## Shared primitives

All card families compose the same primitives — no per-family styling forks:

`panel` (glass shell + iridescent hairline) · `panel-header` / `eyebrow` (Pearl
mark + label) · `count-pill` / `chip` / `status-pill` (badges) · `metric-card`
· `facet-card` · `rank-list` · `result-card` (+ optional `media` block) ·
`comparison` / `comparison-card` / `comparison-row` · `button` (primary =
Pearl accent, secondary = glass) · `status-banner` · `empty-state` /
`error-state` (+ `state-icon`) · `skeleton`.

## Venue imagery

- Images render only from the approved origin `https://agent.joinpearl.co`
  (see `PEARL_MCP_APP_IMAGE_ORIGIN` in `src/integration.mjs`); the document
  CSP `img-src` and the resource-metadata CSP both pin the same single origin.
- URLs with query strings, fragments, credentials, other origins, or
  origin-lookalike hosts fail closed in `normalizeImage` (`src/model.mjs`).
- Every media block paints the deterministic category-tinted fallback first;
  the network image layers above it only after a successful load, and is
  removed on error. Attribution renders in the `media-credit` badge when the
  source record provides it.

## Icons

Inline SVG only (`icon()` in `src/app.mjs`): `pearl` mark (eyebrow), `info` /
`alert` / `check` (status), `compass` (empty/error states). All icons are
`aria-hidden`, stroke `currentColor`, and inherit token colors. No external
image, font, or icon-font requests exist anywhere in the bundle.
