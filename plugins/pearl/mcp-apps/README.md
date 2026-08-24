# Pearl MCP Apps UI

This package contains Pearl's portable, read-only presentation layer for MCP
Apps hosts. It can render venue recommendations and comparisons, trip stops and
reservations, and flight or availability result shapes without owning
authentication, storage, network access, or Pearl business logic. The canonical
source now wires one versioned resource into both production MCP protocol paths
for five reviewed read tools. Final real-host rendering verification is still
pending, so this package does not claim that any host renders the UI
successfully.

The primary integration is the open MCP Apps contract:

- tool metadata uses `_meta.ui.resourceUri`;
- the resource uses `text/html;profile=mcp-app`;
- the iframe uses the `ui/*` JSON-RPC bridge over `postMessage`;
- the resource CSP allows no network, nested frame, or external asset origin;
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
`venues_new_openings`, `trip_get`, and `reservations_list`. They are current,
public, read-only tools whose output collections the renderer handles. Place
matching, profile, visits, saves, friends, trip-list, exact-reservation, every
write, and every dark tool remain data-only. The optional OpenAI compatibility
alias is emitted only on those five tools for an authenticated OpenAI client
source; other hosts receive only the portable field.

Keep search and read tools data-first. A render tool should receive final,
model-checked structured data and return that same data plus concise text. This
prevents repeated iframe mounts and keeps the tool useful without UI. The
runtime `tools/list` inventory remains authoritative; this package does not add
or enable any tool itself.

The resource uses the existing authenticated, stateless MCP endpoint. It adds no
second HTTP endpoint, session, subscription, OAuth flow, scope, executor, or
business-logic branch. Host-specific rendering verification remains a release
gate.

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
retry, and generic error states. Structural UI inherits the host/platform system
font, and comparison cards stack without nested scrolling.

This package is not an endorsement or approval by OpenAI, Anthropic, Cursor, or
any other host.

## Standards references

- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [OpenAI: add UI to an MCP server](https://developers.openai.com/plugins/build/chatgpt-ui)
- [OpenAI plugin UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines)
- [OpenAI plugin UI reference](https://developers.openai.com/plugins/reference)
