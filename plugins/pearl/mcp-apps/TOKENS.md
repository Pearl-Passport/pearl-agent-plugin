# Pearl MCP Apps · onboarding V1 bridge

The standalone widget adapts Zypsy onboarding V1 without importing the app
stylesheet or changing the global app theme. Canonical light values live in
the `--ds-*` section of `src/index.css`. Repository-only test
`scripts/pearl-mcp-design-tokens.test.mjs` compares 26 mapped values with that
source and checks body/action/focus contrast. The exported package stays
self-contained; CI runs the guard when either stylesheet changes.

## Reviewed mapping

Widget names below have the prefix `--pearl-ui-`.

| Widget | Canonical source | Light default |
| --- | --- | --- |
| canvas / surface / subtle | cream-50 / surface-default / action-secondary | #f8f6f4 / #ffffff / #f4f4f3 |
| text | text-primary | #3a3a39 |
| text-secondary | Accessible legacy --pearl-ink-3 exception | #6b6b6b |
| border / border-soft | border-strong / border-default | #d2d2d0 / #e6e6e5 |
| focus | V1 route uses text-primary | #3a3a39 |
| action / action-hover / action-fg | action-primary / action-primary-hover / action-primary-fg | #20201f / #3a3a39 / #fbfbfa |
| secondary-hover / danger | action-secondary-hover / action-destructive | #e6e6e5 / #85183e |
| radius-sm/md/lg/action | radius-8/12/24/full | 8 / 12 / 24 / 9999px |
| space-4/8/12/16/24 | corresponding space tokens | corresponding pixels |
| body-size/line, heading-size/line | size-14 / lh-20, size-24 / lh-28 | 14/20, 24/28px |
| shadow | shadow-sm | canonical restrained shell elevation |

Canonical source names above have the prefix `--ds-` unless stated otherwise.
Host structural variables retain precedence through the existing allowlist:
background/text/border/ring/status colors, system font, radii, and shadow.
Primary action colors stay paired for contrast. Existing reviewed Pearl
success/warning colors and status backgrounds are retained; V1's incomplete
status palette is not invented here.

## Intentional adaptations

- **Fonts:** platform system sans throughout; no font downloads.
  [ChatGPT typography guidance](https://developers.openai.com/plugins/concepts/ui-guidelines#typography)
  calls for system fonts even in fullscreen. Do not claim pixel-identical
  Gambetta/Geist typography to the app onboarding.
- **Contrast:** V1's lighter body text steps and decorative focus ring do not
  meet ordinary body/focus contrast. Retain accessible secondary ink and the
  route's strong ink outline; do not edit canonical design values.
- **Dark:** V1 has no approved dark palette. Preserve existing Pearl dark
  surfaces/ink, deriving neutral controls from that ink/surface pair. This is
  host compatibility, not a newly approved Zypsy dark theme.
- **Compact host:** 24px desktop / 16px mobile padding, 44px minimum controls,
  wrapping comparisons, no nested horizontal scrolling. Pill actions use
  medium weight, 50% disabled opacity, and fine-pointer-only hover to avoid
  sticky touch hover.
- **Surfaces:** flat opaque cards, no blur, terracotta wash, or iridescent
  border. Only the loading skeleton animates, respecting reduced motion.
  Status remains readable as words, not color alone.

## Artwork and safety

The builder inlines the exact approved `assets/icon.png` once as a data URI;
it does not redraw the mark, add an endpoint, or make a logo request. The
trademark restrictions in `assets/README.md` remain applicable.

Venue images load only from `https://agent.joinpearl.co`, with no-referrer
and lazy loading. Foreign, lookalike, credentialed, query-bearing, and non-HTTPS
URLs fail closed. Document and resource CSPs are unchanged. A neutral initial
placeholder appears immediately; photo and credit appear only after load.
Error removes both without blocking the result. An initial is not a fabricated
venue photograph. Other icons are decorative inline SVG with text labels.

All card families share primitives, bounded untrusted-text rendering, and the
complete text fallback. No script, font, analytics, credential, or arbitrary
network capability is added.

## Release checks

Run widget `generate`, `test`, `validate`, the repository token guard, and
MCP Apps browser suite. Coverage includes 1000/390/320px, light/dark, comparison,
focus, reduced motion, forced colors, image success/failure, and recovery.
Changed bytes require a new resource URI; bounded older URIs stay readable.
Real ChatGPT/Claude rendering remains a separate [host canary](HOST-TESTING.md),
not something proved by fixture screenshots.
