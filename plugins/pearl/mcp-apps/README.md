# Pearl MCP Apps UI

This package contains Pearl's portable, read-only presentation layer for MCP
Apps hosts. It can render venue recommendations and comparisons plus a unified
journey family for trip indexes, day-grouped trip stops, reservations, and
flight or availability result shapes without owning
authentication, storage, network access, or Pearl business logic. The canonical
source now wires one versioned resource into both production MCP protocol paths
for sixteen supported reads (five behind their own client gates) and ten action tools. Venue and profile cards have rendered
successfully in ChatGPT developer mode; public directory availability still
depends on OpenAI review and publication.

The primary integration is the open MCP Apps contract:

- tool metadata uses `_meta.ui.resourceUri`;
- read tools declare `ui.visibility: ["model", "app"]`; action tools declare `["model"]`;
- the resource uses `text/html;profile=mcp-app`;
- the iframe uses the `ui/*` JSON-RPC bridge over `postMessage`;
- the resource CSP allows only Pearl-hosted venue images, with no API network,
  nested frames, remote scripts, or fonts;
- the resource declares Pearl's verified MCP origin as its unique submitted
  component domain without widening that deny-by-default CSP;
- every tool must still return useful `content` and `structuredContent` for
  hosts that do not render UI.

The optional `openai/outputTemplate` alias is emitted only as compatibility
metadata. The renderer never branches on a host name and does not depend on
`window.openai`; it can read `window.openai.toolOutput` as a last-resort initial
result fallback when an older ChatGPT host exposes it.

## Build and validate

```sh
npm --prefix plugins/pearl/mcp-apps test
npm --prefix plugins/pearl/mcp-apps run validate
npm --prefix plugins/pearl/mcp-apps run build -- --out /tmp/pearl-concierge-v1.html
npm --prefix plugins/pearl/mcp-apps run generate
```

The build is deterministic and dependency-free. `src/artifact.generated.mjs` is
the one tracked runtime artifact; `generate` refreshes it from the UI source.
Validation builds the document twice, requires byte-for-byte and SHA-256 parity
with that artifact, verifies the exact source inventory, and checks the bridge,
CSP, response budgets, responsive/accessibility rules, and forbidden browser
capabilities.

## Server hook

`src/integration.mjs` exports the versioned resource URI, MIME type, restricted
CSP, bounded resource definition, exact supported-tool list, and integration
helpers. Both protocol implementations register that same definition and return
fresh copies of its same read payload.

Published/installed host snapshots can outlive the last few UI releases. Keep
the exact v4 URI pinned alongside v14/v13/v12/v11/v10/v9/v8/v7/v6/v5 compatibility aliases until host
refresh is verified; a live ChatGPT canary still requested v4 on 2026-09-04.
All aliases return the current v15 artifact with identical authentication and
CSP. This does not load old code or accept arbitrary resource URLs. Hosts cache
templates by URI, so any change to the artifact moves the resource to a new
version and keeps the previous one as an alias.

The supported read list is `venues_search`, `venues_recommend`,
`venues_new_openings`, `places_match`, `profile_get`, `saves_list`,
`visits_list`, `trips_list`, `trip_get`, `reservations_list` and
`reservation_get`, plus the gated reads `reservations_availability`,
`venue_get`, `flights_search`, `flights_list` and `flight_get`
(`PEARL_MCP_APP_GATED_READ_TOOL_NAMES`): a gated read carries the card only
where its own client, scope and dark-launch gates already list the tool. These
are read-only tools whose output shapes the renderer handles. Profile results
render member-scoped activity counts, strongest patterns and fixed follow-up
questions first; evidence, insights, facets and favorites fold into one
disclosure inline and show in full screen. Friends, the other discovery reads
and other gated tools remain data-only. The four
reviewed visit import/update tools and six existing save/trip prepare/commit tools
receive presentation metadata after their existing gates. Their visibility is model-only: cards never invoke a
mutation. OpenAI connections receive the optional output-template alias;
other hosts receive the portable field.

The v12 / 1.5.6 presentation adds `saves_change_prepare/commit`,
`trips_create_prepare/commit`, and `trip_stops_update_prepare/commit`. Previews
show the place, private trip details, or before/after itinerary changes; duplicate
names and dates outside the trip are called out. A receipt requires a matching
returned status, not an expected result. Unknown or incomplete results direct
the member back to chat before retrying. Cards never book or cancel reservations.
The existing host inventory and consent gates still apply: these bindings do not
make a tool available to another host or update a submitted marketplace snapshot.
The v13 / 1.5.7 refinement labels action cards as “Not saved yet”, “Receipt”,
or “Check in chat” instead of a result count. Receipts never imply every import
item was saved. Single-boundary review cards retain all before/after details
and warnings with more usable space on phones. Incomplete previews ask for
review before confirmation; incomplete receipts ask for verification before retry.
The v14 / 1.6.0 release adds cards for saved places and visits (visit date,
the member's own score and note, no compare), place matches (exact, to confirm,
to choose, not in Pearl), a single reservation in venue-local time, venue
details with grouped opening hours, and flights in airport-local time. Action
previews lead with what changes, collapse unchanged fields, show warnings as
warning banners and give the expiry in the viewer's local time.

The v15 / 1.6.1 release makes previews expire live. A stale preview is labelled
“Expired” and missing or invalid expiry data “Expiry unverified”, both as a
do-not-confirm banner. Open previews recheck at expiry, at least every minute,
and when the tab regains focus or visibility. A local clock rollback cannot
revive a card already observed expired. Timers stop when a new result, loading
state, page hide, or resource teardown replaces the preview. Receipts never
expire. These states guide the member to check an existing receipt or ask for a
fresh preview in chat; they do not call tools or send messages automatically.
The local clock is advisory: the server still validates expiry and permissions.
Real-host v15 rendering remains unverified until the canary below is completed.

Trip and reservation reads use the unified journey family. Restaurant availability
has a dedicated dining presentation with venue-local times, party size, provider,
checked time, price, deposit, payment and cancellation terms. Pending, unknown,
and confirmed empty results remain distinct. The card never holds or books a table.
Its metadata is attached only after existing client, scope, and capability gates;
adding the card does not enable this tool for another client. Flight tools keep
their internal canary gate; their card appears only where that gate lists them.

Keep search and read tools data-first. A render tool should receive final,
model-checked structured data and return that same data plus concise text. This
prevents repeated iframe mounts and keeps the tool useful without UI. The
runtime `tools/list` inventory remains authoritative; this package does not add
or enable any tool itself.

The resource uses the existing authenticated, stateless MCP endpoint. It adds no
second HTTP endpoint, session, subscription, OAuth flow, scope, executor, or
business-logic branch. Host-specific rendering remains a release gate for every
new reviewed metadata version; successful developer-mode canaries do not imply
OpenAI approval.

## Result contract

The renderer accepts ordinary Pearl tool result envelopes. It reads
`structuredContent` first and falls back to a normalized `structuredContent.view`
shape when supplied. It caps collection sizes and text lengths, treats all tool
data as untrusted, and inserts values only through DOM `textContent`.

Errors use Pearl's structured envelope (`code`, `message`, `user_action`, and
optional public details). Required scope labels are displayed only when they
exactly match the seven common read scopes or the reviewed `visits:write` action
scope. Recovery messages
are fixed UI strings and never include tool-returned messages, scope text, or
other result data. The UI will retry a tool directly only when the host marks
that exact tool read-only; otherwise it sends a fixed user follow-up message.

## Design and accessibility

The `1.6.1` / `v15` presentation adapts onboarding V1's neutral ink, cream,
flat surfaces, pill actions, and spacing. A repository-only drift test compares
the mapped values with canonical `--ds-*` tokens. Accessible secondary ink
and strong focus are retained. See [TOKENS.md](TOKENS.md) for the mapping and
intentional host-font/dark-theme adaptations.

The exact approved Pearl mark is inlined once. No fonts are fetched; only
approved Pearl-hosted venue images may load. Host theme variables remain
supported, and image failure never blocks the text or placeholder.

The UI includes visible focus, native keyboard controls, 44-pixel targets,
320-pixel layouts, light and dark themes, reduced-motion support, accessible
status announcements, and loading, empty, partial, reconnect, missing-scope,
retry, and generic error states. Journey cards group reservation results and
trip stops by returned date, preserve tentative, confirmed, unavailable, and
unknown states as labeled text rather than color alone, and adapt to inline,
fullscreen, desktop, web, and mobile host context without horizontal scrolling.
Structural UI inherits the host/platform system font, and comparison cards stack
without nested scrolling.

Canonical source CI also exercises the built iframe in Chromium at 1000px,
390px, and 320px. It checks two- and three-place comparison layouts, keyboard selection,
minimum target sizes, reduced motion, light/dark rendering, horizontal overflow,
forced colors, approved-image success/failure, and safe partial, empty,
missing-scope, and injected-scope states. See
[HOST-TESTING.md](HOST-TESTING.md) for the separate real-host release canary;
browser fixtures do not substitute for ChatGPT rendering evidence.

This package is not an endorsement or approval by OpenAI, Anthropic, Cursor, or
any other host.

## Standards references

- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [OpenAI: add UI to an MCP server](https://developers.openai.com/plugins/build/chatgpt-ui)
- [OpenAI plugin UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines)
- [OpenAI plugin UI reference](https://developers.openai.com/plugins/reference)

Visit previews show exact before/after values, full notes up to the registry limit,
month-only date precision, duplicate warnings, and expiry. Import previews show
all twenty supported items with attendance, match and duplicate review reminders.
Receipts distinguish saved, replayed, skipped and unverified results. Confirmation
stays in the host conversation using the existing prepared action. A card is not
independent evidence of human confirmation and never carries a commit control.
