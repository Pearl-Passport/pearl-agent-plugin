# Pearl MCP Apps UI

This package contains Pearl's portable, read-only presentation layer for MCP
Apps hosts. It can render venue recommendations and comparisons plus a unified
journey family for trip indexes, day-grouped trip stops, reservations, and
flight or availability result shapes without owning
authentication, storage, network access, or Pearl business logic. The canonical
source now wires one versioned resource into both production MCP protocol paths
for seven reviewed read tools. Venue and profile cards have rendered
successfully in ChatGPT developer mode; public directory availability still
depends on OpenAI review and publication.

The primary integration is the open MCP Apps contract:

- tool metadata uses `_meta.ui.resourceUri`;
- tool metadata explicitly declares `ui.visibility: ["model", "app"]`;
- the resource uses `text/html;profile=mcp-app`;
- the iframe uses the `ui/*` JSON-RPC bridge over `postMessage`;
- the resource CSP allows no network, nested frame, or external asset origin;
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

`src/integration.mjs` exports the versioned resource URI, MIME type, zero-network
CSP, bounded resource definition, exact supported-tool list, and integration
helpers. Both protocol implementations register that same definition and return
fresh copies of its same read payload.

The current source allowlist is exactly `venues_search`, `venues_recommend`,
`venues_new_openings`, `profile_get`, `trips_list`, `trip_get`, and
`reservations_list`. They are current, public, read-only tools whose output
shapes the renderer handles. Profile results render member-scoped activity
counts, taste facets, top cities, and fixed follow-up questions without adding
a profile mutation. Place matching, visits, saves, friends, exact-reservation,
every write, and every dark tool remain data-only. The optional OpenAI compatibility
alias is emitted only on those seven tools for an authenticated OpenAI client
source; other hosts receive only the portable field.

Trip and reservation reads use the unified journey family today. Flight search,
protected-flight, and reservation-availability shapes have reviewed fixtures in
the same family so they can be host-tested before any future gate opens, but
their dark tools do not receive card metadata and are not advertised as public.
Flight cards repeat only an explicit returned status, source, freshness or fare
expiry, and currency amount. They always say that the result is read-only and
that fare and availability must be confirmed before booking; they expose no
booking control.

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
exactly match the finite seven-scope public read allowlist. Recovery messages
are fixed UI strings and never include tool-returned messages, scope text, or
other result data. The UI will retry a tool directly only when the host marks
that exact tool read-only; otherwise it sends a fixed user follow-up message.

## Design and accessibility

The standalone token subset is copied from reviewed Pearl semantic tokens. It
uses the accessible Pearl secondary text color instead of the lighter V1 text
steps that are not approved for body copy. No fonts or images are fetched. Host
theme variables are applied from the MCP Apps host context when provided.

The UI includes visible focus, native keyboard controls, 44-pixel targets,
320-pixel layouts, light and dark themes, reduced-motion support, accessible
status announcements, and loading, empty, partial, reconnect, missing-scope,
retry, and generic error states. Journey cards group reservation results and
trip stops by returned date, preserve tentative, confirmed, unavailable, and
unknown states as labeled text rather than color alone, and adapt to inline,
fullscreen, desktop, web, and mobile host context without horizontal scrolling.
Structural UI inherits the host/platform system font, and comparison cards stack
without nested scrolling.

Canonical source CI also exercises the built iframe in Chromium at 1000px and
390px. It checks two- and three-place comparison layouts, keyboard selection,
minimum target sizes, reduced motion, light/dark rendering, horizontal overflow,
and safe partial, empty, missing-scope, and injected-scope states. See
[HOST-TESTING.md](HOST-TESTING.md) for the separate real-host release canary;
browser fixtures do not substitute for ChatGPT rendering evidence.

This package is not an endorsement or approval by OpenAI, Anthropic, Cursor, or
any other host.

## Standards references

- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [OpenAI: add UI to an MCP server](https://developers.openai.com/plugins/build/chatgpt-ui)
- [OpenAI plugin UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines)
- [OpenAI plugin UI reference](https://developers.openai.com/plugins/reference)
