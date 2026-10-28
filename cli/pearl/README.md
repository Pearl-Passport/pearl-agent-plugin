# Pearl CLI

Pearl CLI is a small client for Pearl's authenticated Agent API. It
uses the same remote service as the Pearl MCP connection:

```text
https://agent.joinpearl.co/mcp
```

The CLI does not contain Pearl business logic, database access, Supabase
credentials, or a second MCP server. It reads the live capability catalog and
keeps generic `call` read-only. The unreleased import commands below support
explicitly confirmed record workflows; they cannot make bookings.

## Requirements

- An eligible Pearl Reserve or Elite membership
- Node.js 22 or newer
- macOS Keychain or Linux Secret Service
- a Pearl account eligible for Agent connections
- the statically registered public OAuth client `pearl-cli`

Dynamic client registration is intentionally disabled. OAuth uses PKCE S256,
an ephemeral loopback callback, the exact Pearl MCP resource, seven default read
scopes, separately requested import scopes, access tokens lasting up to one hour, rotating refresh tokens, and RFC 9207 issuer
validation. No client secret is used or stored.

## Install

This source is **1.1.0-beta.1 (unreleased)**. The existing public package remains
read-only. Installing this candidate does not enable imports on the server;
each connection must receive the reviewed workflow and fresh permission.

From a reviewed repository checkout, prepare and validate the package locally:

```sh
cd cli/pearl
npm run check
npm test
npm run validate
npm pack
```

Publishing or uploading a release is a separate approved step. It requires the protected Trusted Publishing environment and verified `@joinpearl` scope ownership. This source change does not publish an npm package or a GitHub release. Verify the approved release's checksum before installing its tarball.

## Commands

```bash
pearl status
pearl tools --json
pearl search "sushi in Los Angeles"
pearl recommend --input '{"city":"Paris","limit":5}'
pearl new-openings --input '{"city":"New York","limit":8}'
pearl match ./places.json
pearl profile cuisines
pearl visits --input '{"city":"London","limit":20}'
pearl visits --all --json
pearl favorites --input '{"city":"Rome"}'
pearl saves
pearl friend-search "Alex" --input '{"limit":5}'
pearl friends
pearl trips
pearl trip "Summer in Japan"
pearl reservations
pearl reservation member_reservations 00000000-0000-4000-8000-000000000001
pearl call venues_search --input '{"query":"wine bar","city":"Paris"}'
pearl mcp-url
pearl logout
```

Use `--all` with `visits`, `saves`, `trips`, or `reservations` to follow history
pages with unchanged filters. It stops at 20 pages by default (`--max-pages`
accepts 1–100), the command timeout, or 2 MB of combined page responses. The
result combines the rows and reports `traversal.pages_fetched` and coverage.
Partial scans retain completed rows and a continuation cursor when available,
return exit code 6, and never claim to be complete. Resume with the same filters
and the returned cursor through `--input`. A cursor-loop result needs a fresh
request instead. `--timeout` bounds traversal as well as each ordinary read.

`pearl doctor --authenticated --json` reports which read workflows this
connection exposes. Temporary refresh failures keep the stored connection and
ask for a retry; an unusable authorization needs an access check and reconnect.

`pearl tools` is authoritative. Alias commands are conveniences for Pearl's
current public read workflows; they do not make unavailable tools appear.

`pearl call` refuses any tool whose `readOnlyHint` is not exactly `true`.
There is no generic write command or booking/payment command.

### Structured imports (unreleased; not enabled for public connections)

After rollout, `pearl import` can add a flight record (including seat/cabin),
record an existing restaurant reservation, or append named dishes/wines/drinks
to a visit. It never purchases a ticket, assigns a seat with an airline, books
a table, or creates a public catalog entry. Existing flight records are reused
unchanged. A separate `flight-seat` command updates only the recorded seat
on an existing flight; attaching flights to trips is not included.

For “add seat 12A to my LA flight,” identify the exact flight first. Use a
`booking_id` returned by flight discovery, a `ledger_id` returned by flight
import, or the confirmed local departure date and arrival airport. These IDs
are not interchangeable. If several flights match, narrow by departure
airport or flight number. Pearl will not pick one arbitrarily.

After enablement, a seat preview file could contain:

```json
{"idempotency_key":"seat-preview-01","departure_date":"2026-11-12","arrival_airport":"LAX","seat":"12A"}
```

Run `pearl import flight-seat prepare --input-file seat.json --json`, review
the route, date and previous/new seat, then confirm its handle with
`pearl import flight-seat commit --input-file commit.json --confirm --json`.
This updates Pearl only; it does not reserve or change a seat with the airline.

Use `pearl tools --json` to check availability. Imports need the complete
prepare/commit pair, an eligible account, and explicit OAuth consent for
`flights:write`, `reservations:write` or `visits:write`. Default login still
requests reads only. Do not reconnect repeatedly while a workflow is disabled.

Example **after** reviewed enablement:

```sh
pearl login --scope profile:read,venues:read,visits:read,visits:write
pearl import visit-items prepare --input-file visit-items.json --json
# Review the returned preview. Then create commit.json with only
# action_handle and a NEW idempotency_key, and explicitly confirm:
pearl import visit-items commit --input-file commit.json --confirm --json
```

`visit-items.json` example (replace the visit ID with your own):

```json
{"idempotency_key":"dinner-items-preview-01","visit_id":"00000000-0000-4000-8000-000000000001","items":[{"kind":"dish","name":"Tagliatelle","rating":9},{"kind":"wine","name":"Producer Barolo","vintage":2019,"vintage_kind":"vintage","notes":"Rose and cherry"}]}
```

Keep input and receipt files private and out of Git. Send structured facts, not
raw emails, passports, payment details or booking credentials. A timeout is not
proof of failure: retry the identical step with the same key. If the record
changed or the preview expired, prepare and review again. Item additions keep
existing items and follow the visit's existing visibility.
Unmatched wines retain the supplied year or NV in their saved name; they are
not presented as catalog-linked vintages.

Use `--json` for stable machine-readable output and errors. `--timeout` accepts
1,000–120,000 milliseconds. Alternate servers must be HTTPS origins without
credentials, paths, queries, or fragments. HTTP is accepted only for an exact
loopback host with the explicit `--allow-loopback-http` development flag.

## Credential safety

Tokens are never written to a project file, shell profile, command argument,
log message, or tracked configuration. On macOS the session is supplied to the
`security` command over stdin; on Linux it is supplied to `secret-tool` over
stdin. Concurrent refreshes are serialized with a private temporary lock.

## Support and status

Contact [hello@joinpearl.co](mailto:hello@joinpearl.co). This package is
maintained by Pearl and does not claim approval or endorsement by OpenAI,
Anthropic, Cursor, or the MCP Registry.

Doctor keeps completed checks in its stdout report when a later check fails,
including in `--json` mode. Its exit status still distinguishes missing or
unusable authorization, insufficient scope, network failures and server failures.
Recovery messages use recognized error codes and HTTP status only; upstream
messages, details, request IDs and token values are not copied into the report.
A bare denial or unusable grant does not establish that membership expired.
Public server checks use server-recovery guidance; sign-in and membership
guidance is reserved for the authenticated catalog check.
