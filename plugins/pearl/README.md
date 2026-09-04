# Pearl agent integration package

Pearl's installable package gives Codex, Claude, Cursor, and Cursor's Grok Bot a thin host integration for one authenticated Streamable HTTP MCP endpoint:

`https://agent.joinpearl.co/mcp`

The package contains host manifests, the Pearl Concierge skill, public setup documentation, brand assets, a presentation-only MCP Apps resource, and validation code. The MCP Apps resource remains attached only to reviewed reads. Reviewed ChatGPT, Codex, Claude, and Cursor connections can use confirmed visit imports/edits plus read-only live availability; those tools do not receive cards. The standalone Pearl CLI and unknown clients remain read-only. The package contains no application, database, OAuth server, MCP executor, deployment configuration, access token, or client secret.

## Current release

Package `0.10.0` keeps one common 13-tool read set for every authenticated connection. Reviewed ChatGPT, Codex, Claude, and Cursor registrations may additionally discover read-only `reservations_availability` under `reservations:read`. Their four preview/commit visit tools appear only after the member reconnects and consents to `visits:write`. Current Codex uses host-controlled per-install CIMD identities, so Pearl recognizes only the exact official Codex CIMD family; it does not treat arbitrary OpenAI-source clients as eligible.

See the [capability snapshot](skills/pearl-concierge/references/capabilities.md) for the exact host matrix and honest unavailable-workflow labels. No host can book, hold, change, cancel, or pay for a reservation in this release. The package does not claim that a host has approved or listed Pearl.

## Included artifacts

- `.codex-plugin/plugin.json`: Codex metadata and starter prompts.
- `.claude-plugin/plugin.json`: Claude Code and Cowork metadata.
- `cursor/.cursor-plugin/plugin.json`: the isolated Cursor source plus the host-specific `pearl-cursor` identifier and secretless public OAuth configuration.
- `.mcp.json`: the single shared URL-only Codex and Claude connection; Cursor's isolated thin wrapper uses the same endpoint with its required static public client.
- `server.json`: the MCP Registry preview entry for the same remote URL; it contains no headers, credentials, package runtime, or tool inventory.
- `skills/pearl-concierge/`: the canonical discovery-first workflow skill for Codex and Claude; Cursor ships a byte-for-byte validated mirror under its isolated source subtree.
- `docs/`: host setup, OAuth, and release instructions.
- `assets/`: approved Pearl marketplace artwork; see [assets/README.md](assets/README.md). Cursor's isolated source contains a hash-validated logo mirror.
- `mcp-apps/`: the dependency-free, versioned inline UI resource and integration helpers. It adds no tools, auth, network endpoint, or business logic; see [mcp-apps/README.md](mcp-apps/README.md).
- `scripts/` and `test/`: zero-dependency validation.

## Validate

From the repository root:

```bash
npm --prefix plugins/pearl test
npm --prefix plugins/pearl run validate
npm --prefix plugins/pearl run validate:live
npm --prefix plugins/pearl run validate:registry
npm --prefix plugins/pearl run validate:registry:schema
npm --prefix plugins/pearl run validate:registry:live
claude plugin validate plugins/pearl --strict
claude plugin validate . --strict
```

Live validation performs only public discovery and unauthenticated challenge checks. It does not use credentials or invoke member tools.

Pearl maintainers who have Codex's bundled `plugin-creator` and `skill-creator` skills installed should additionally run those skills' validators against `plugins/pearl` and both packaged Pearl Concierge skill directories. These are maintainer checks, not public package dependencies.

Before a marketplace release, also run the safe static-host registration probes documented in [docs/submission.md](docs/submission.md). Those probes use an intentionally invalid MCP resource and never create an authorization request or invoke a member tool.

The official MCP Registry is in preview. Keeping `server.json` in the package does not publish it or imply Registry, Anthropic, Cursor, or OpenAI approval. Registry publication is a separate protected release action documented in [docs/releasing.md](docs/releasing.md).

## Security and support

Never add credentials, environment files, authorization headers, private implementation details, or member data to this package. Report vulnerabilities privately to `hello@joinpearl.co` with `[Security]` in the subject line.

- Setup: [docs/setup.md](docs/setup.md)
- OAuth: [docs/oauth.md](docs/oauth.md)
- Releases: [docs/releasing.md](docs/releasing.md)
- Host submission: [docs/submission.md](docs/submission.md)
- Privacy: https://joinpearl.co/privacy
- Terms: https://joinpearl.co/terms
- Support: https://joinpearl.co/support
