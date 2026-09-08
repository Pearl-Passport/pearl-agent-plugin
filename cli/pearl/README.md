# Pearl CLI

Pearl CLI is a small, read-only client for Pearl's authenticated Agent API. It
uses the same remote service as the Pearl MCP connection:

```text
https://agent.joinpearl.co/mcp
```

The CLI does not contain Pearl business logic, database access, Supabase
credentials, or a second MCP server. It reads the live capability catalog and
will only execute tools whose runtime annotation is `readOnlyHint: true`.

## Requirements

- Node.js 22 or newer
- macOS Keychain or Linux Secret Service
- a Pearl account eligible for Agent connections
- the statically registered public OAuth client `pearl-cli`

Dynamic client registration is intentionally disabled. OAuth uses PKCE S256,
an ephemeral loopback callback, the exact Pearl MCP resource, seven fixed read
scopes, ten-minute access tokens, rotating refresh tokens, and RFC 9207 issuer
validation. No client secret is used or stored.

## Install

The read-only CLI is distributed with the versioned [Pearl v0.11.0 GitHub release](https://github.com/Pearl-Passport/pearl-agent-plugin/releases/tag/v0.11.0). Download and verify the release tarball before installing:

```bash
curl -fLO https://github.com/Pearl-Passport/pearl-agent-plugin/releases/download/v0.11.0/joinpearl-cli-1.0.0.tgz
curl -fLO https://github.com/Pearl-Passport/pearl-agent-plugin/releases/download/v0.11.0/SHA256SUMS
shasum -a 256 -c SHA256SUMS && npm install --global ./joinpearl-cli-1.0.0.tgz
pearl doctor --json
pearl login
```

npm registry publication is still pending publisher access. Do not assume
`npm install --global @joinpearl/cli` is available yet. GitHub distribution uses
the same validated package, read-only API and secure local credential storage.

For development from this repository:

```bash
npm --prefix cli/pearl test
npm --prefix cli/pearl link
pearl doctor --json
```

The npm package is release-ready but must not be published until the protected
Trusted Publishing environment and `@joinpearl` scope ownership are verified.

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
pearl friend-search "Austin" --input '{"limit":5}'
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

The public CLI does not ship Pearl's private prototype write, cleanup,
collection, photo, or prepare/commit commands. `pearl call` also refuses any
runtime tool whose advertised `readOnlyHint` is not exactly `true`.

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
