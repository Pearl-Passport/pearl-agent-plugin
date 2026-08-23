# Pearl agent integration package

Pearl's installable package connects Codex, Claude, Cursor, and Grok Bot to one authenticated Streamable HTTP MCP endpoint:

`https://agent.joinpearl.co/mcp`

The package contains host manifests, the Pearl Concierge skill, public setup documentation, brand assets, and validation code. It contains no application, database, OAuth server, MCP executor, deployment configuration, access token, or client secret.

## Current release

Package `0.8.7` is read-only. The live MCP `tools/list` response is authoritative; manifests do not pin tools. The documented public set contains 13 reads for venue search, recommendations, new openings, place matching, profile, visits, saves, friends and requests, trips, and reservations.

See the [capability snapshot](skills/pearl-concierge/references/capabilities.md) for exact current tools and honest unavailable-workflow labels. The package does not claim that a host has approved or listed Pearl.

## Included artifacts

- `.codex-plugin/plugin.json`: Codex metadata and starter prompts.
- `.claude-plugin/plugin.json`: Claude Code and Cowork metadata.
- `cursor/.cursor-plugin/plugin.json`: the isolated Cursor source plus the host-specific `pearl-cursor` identifier and secretless public OAuth configuration.
- `.mcp.json`: the single shared URL-only Codex and Claude connection; Cursor's isolated thin wrapper uses the same endpoint with its required static public client.
- `skills/pearl-concierge/`: the canonical discovery-first workflow skill for Codex and Claude; Cursor ships a byte-for-byte validated mirror under its isolated source subtree.
- `docs/`: host setup, OAuth, and release instructions.
- `assets/`: approved Pearl marketplace artwork; see [assets/README.md](assets/README.md). Cursor's isolated source contains a hash-validated logo mirror.
- `scripts/` and `test/`: zero-dependency validation.

## Validate

From the repository root:

```bash
npm --prefix plugins/pearl test
npm --prefix plugins/pearl run validate
npm --prefix plugins/pearl run validate:live
claude plugin validate plugins/pearl --strict
claude plugin validate . --strict
```

Live validation performs only public discovery and unauthenticated challenge checks. It does not use credentials or invoke member tools.

Pearl maintainers who have Codex's bundled `plugin-creator` and `skill-creator` skills installed should additionally run those skills' validators against `plugins/pearl` and both packaged Pearl Concierge skill directories. These are maintainer checks, not public package dependencies.

Before a marketplace release, also run the safe static-host registration probes documented in [docs/submission.md](docs/submission.md). Those probes use an intentionally invalid MCP resource and never create an authorization request or invoke a member tool.

## Security and support

Never add credentials, environment files, authorization headers, private implementation details, or member data to this package. Report vulnerabilities privately to `hello@joinpearl.co` with `[Security]` in the subject line.

- Setup: [docs/setup.md](docs/setup.md)
- OAuth: [docs/oauth.md](docs/oauth.md)
- Releases: [docs/releasing.md](docs/releasing.md)
- Host submission: [docs/submission.md](docs/submission.md)
- Privacy: https://joinpearl.co/privacy
- Terms: https://joinpearl.co/terms
- Support: https://joinpearl.co/support
