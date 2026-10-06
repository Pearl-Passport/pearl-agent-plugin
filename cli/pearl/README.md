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

- An eligible Pearl Reserve or Elite membership
- Node.js 22 or newer
- macOS Keychain or Linux Secret Service
- a Pearl account eligible for Agent connections
- the statically registered public OAuth client `pearl-cli`

Dynamic client registration is intentionally disabled. OAuth uses PKCE S256,
an ephemeral loopback callback, the exact Pearl MCP resource, seven fixed read
scopes, access tokens lasting up to one hour, rotating refresh tokens, and RFC 9207 issuer
validation. No client secret is used or stored.

## Install

Use CLI 1.0.1 or newer. Version 1.0.0 rejects the service's current token lifetime
and can fail during login or refresh; do not install the older archive to recover
a connection. After upgrading, run `pearl login` again if authorization is no
longer usable.

Check the [GitHub releases](https://github.com/Pearl-Passport/pearl-agent-plugin/releases)
for a published `joinpearl-cli-1.0.1.tgz` and its `SHA256SUMS`. Verify the downloaded
archive with `shasum -a 256 -c SHA256SUMS` before installing it. If that archive is
not yet published, use the validated 1.0.1 source checkout below; a package version
in the source is not proof of a published download.

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

`pearl status` reports only credentials stored locally; it does not verify live
access. `pearl doctor --authenticated --json` checks the gateway, the exact OAuth
discovery contract, and which read workflows this CLI connection exposes.
Without `--authenticated`, doctor does not read or refresh stored credentials.

Doctor stops at the first failed check, preserves completed checks in its JSON
report on stdout, and retains the existing nonzero exit codes. Ordinary command
errors still use stderr. Its fixed
diagnostic wording distinguishes missing/unusable authorization, explicit scope
or membership denials, rejected OAuth client registration, and temporary
failures. An unclassified 403 does not establish the cause. Reports omit upstream
messages, details, request IDs, credentials and unrecognized tool names.

Temporary refresh failures keep the stored connection and ask for a retry.
Check Pearl access before reconnecting an unusable authorization: the server
may not distinguish lost membership from an expired or revoked grant. A rejected
client needs Pearl to verify host support and registration; repeated sign-in
does not add host support. These checks cover only the CLI, not another host's
MCP connection or an automatic review-scanner grant. Doctor uses the existing
request timeout and response-size limits, makes no tool-execution calls, and
only refreshes credentials when `--authenticated` requires it.

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
