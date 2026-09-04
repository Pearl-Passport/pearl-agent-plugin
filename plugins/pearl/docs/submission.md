# Host submission paths

Package validation and marketplace approval are different gates. Pearl must complete the release checks below before opening either host application, and a submitted or publicly available repository does not make Pearl an official or approved integration.

## Shared release gate

Cursor and Claude require a public GitHub repository for third-party marketplace review. OpenAI uses a versioned portal draft and server scan. Before changing repository visibility or submitting a new host version:

1. Finish legal and brand approval for the exact release.
2. Scan the complete reachable and previously published Git history for credentials and private implementation material.
3. Require pull requests, review, passing validation, signed commits, linear history, and no force pushes or branch deletion on `main`.
4. Enable GitHub secret scanning and push protection as soon as public visibility makes those controls available.
5. Run the package, strict manifest, skill, clean-export, clean-install, and live checks in [releasing.md](releasing.md).
6. Verify the static OAuth registrations without credentials or member data:

   ```bash
   npm --prefix plugins/pearl run validate:host-clients-live
   ```

The static-host validator intentionally supplies the wrong MCP resource. A correctly registered client and callback returns `invalid_target` before Pearl creates an authorization request. It verifies that each reviewed host accepts only the seven reads plus `visits:write` and rejects every other write scope.

## OpenAI app version

Changing `tools/list`, annotations, schemas, or scopes requires a new version in the OpenAI portal. Scan the same production-candidate endpoint and verify the exact 18-tool inventory: 13 common reads, read-only `reservations_availability`, and the four confirmed visit tools. The two prepare calls and import commit are non-destructive writes; visit update commit is destructive because it changes an existing record. Test approval prompts, prepare/confirm separation, idempotent retries, scope denial, and the negative provider-booking canary in the draft before submission.

Prepare the new ChatGPT portal draft from the reviewed commit before backend activation. Because the portal must scan the exact production contract, perform the scan immediately after the coordinated gateway/migration activation, verify the exact inventory with a fresh reviewer grant, and roll back ChatGPT eligibility if it differs. Existing grants are never widened, so the previously published version retains its consented scope set during this bounded window. Do not describe a successful scan as approval. If an older version is already under review, use the portal's supported update or cancel-and-resubmit flow; do not silently change the submitted version.

## Cursor Marketplace

Cursor distributes marketplace plugins from public Git repositories and manually reviews updates. Submit the public repository at [Cursor Marketplace Publish](https://cursor.com/marketplace/publish) only after the shared gate passes.

The repository contains the required `plugins/pearl/cursor/.cursor-plugin/plugin.json` and root `.cursor-plugin/marketplace.json`. Submit the marketplace entry `pearl-cursor`; the user-facing description and Pearl artwork remain branded Pearl. The submission must use public client ID `pearl-cursor`, no secret, exactly the two callbacks, the seven common read scopes, and only `visits:write` in addition, as recorded in [oauth.md](oauth.md). Test local installation in Cursor before applying; hosted Agents and Grok Bot require a separate hosted OAuth canary.

Do not claim Cursor approval, listing, endorsement, or availability until the reviewed release is visible in Cursor's marketplace.

A local Cursor plugin can validate the manifest, OAuth loopback, skills, and live tools, but it cannot be installed by a hosted Grok Bot. Grok Bot uses the Cursor Marketplace or an eligible team marketplace. After listing, run a hosted canary from **Grok Bot → Plugins** that proves `visits_list`, `reservations_list`, `reservation_get`, and read-only `reservations_availability`; then prove a visit import and edit each stop after preview until the member explicitly confirms. Verify that provider booking, change, cancellation, payment, visit deletion, and every unreviewed write remain absent.

## Claude plugin

The Claude Code plugin and the remote MCP connector are two separate review paths:

- Submit the public plugin repository through [Anthropic's plugin submission form](https://platform.claude.com/plugins/submit). Anthropic's current Claude Code documentation describes reviewed third-party submissions as community marketplace candidates. Anthropic separately curates its official marketplace at its discretion.
- Submit the remote MCP service separately to the Claude Connectors Directory by following Anthropic's [connector submission process](https://claude.com/docs/connectors/building/submission) and [pre-submission checklist](https://claude.com/docs/connectors/building/review-criteria).

The plugin repository contains `.claude-plugin/plugin.json`, a root Claude marketplace manifest, the shared Pearl Concierge skill, and the single URL-only `.mcp.json`. Claude Code authenticates the plugin-namespaced server through Anthropic-hosted CIMD. Claude web and desktop Chat require the static custom-connector settings in [setup.md](setup.md): client ID `pearl-claude-hosted` and an empty secret.

For connector review, prepare public setup/privacy/support documentation, a stable reviewer account, and three representative read-only examples. Exercise every advertised tool through MCP Inspector and a Claude custom connector. Never provide production credentials in the repository or application narrative; transmit reviewer access only through the host's approved private channel.

## MCP Registry preview

The MCP Registry is a distinct discovery channel, not a Codex, Claude, Cursor, or OpenAI approval path. The public repository exports one root `server.json` with the `2025-12-11` schema, case-sensitive GitHub namespace `io.github.Pearl-Passport/pearl-agent-plugin`, and the same URL-only Streamable HTTP remote. Publish only through the protected GitHub OIDC workflow described in [releasing.md](releasing.md); never add a PAT, static header, client secret, or tool inventory to registry metadata. Verify the exact name, version, and remote after publication before calling it listed.

Do not claim Anthropic approval, official-marketplace inclusion, connector-directory listing, or endorsement until Anthropic confirms the exact reviewed release.
