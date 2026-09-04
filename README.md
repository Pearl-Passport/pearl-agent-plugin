# Pearl Agent Plugin

Pearl's installable package connects Codex, Claude, Cursor, and Grok Bot to Pearl's authenticated remote MCP server at `https://agent.joinpearl.co/mcp`.

Pearl Agent access currently requires an eligible Pearl Access member. The server independently enforces admission, live Access eligibility, and OAuth scopes; installing this package cannot widen access.

Package `0.9.0` keeps the common Codex, Claude, ChatGPT, Registry, and CLI surface read-only. The reviewed Cursor registration adds read-only live table availability and confirmed visit logging/editing behind the single `visits:write` scope; it does not add provider booking, change, cancellation, or payment. Runtime MCP `tools/list` is authoritative. The public package contains thin host manifests, current workflow guidance, public documentation, approved brand assets, a presentation-only MCP Apps resource, and zero-dependency validation. The resource is source-wired only to reviewed read tools. ChatGPT has rendered prior venue and profile card revisions successfully; the `1.4.0` / `v7` card resource and every non-ChatGPT host remain subject to their own real-host canaries. The package contains no application, OAuth server, database, executor, environment, deployment configuration, or credential.

Repository availability does not mean Anthropic, Cursor, or OpenAI has approved, endorsed, or listed Pearl.

## Install

### Codex Desktop and CLI

```bash
git clone --branch v0.9.0 --depth 1 https://github.com/Pearl-Passport/pearl-agent-plugin.git
cd pearl-agent-plugin
codex plugin marketplace add .
codex plugin add pearl@pearl-integrations
codex mcp login pearl
```

### Claude Code

```bash
git clone --branch v0.9.0 --depth 1 https://github.com/Pearl-Passport/pearl-agent-plugin.git
cd pearl-agent-plugin
claude plugin marketplace add .
claude plugin install pearl@pearl-integrations
claude mcp login plugin:pearl:pearl
```

For Claude web/desktop Chat, add `https://agent.joinpearl.co/mcp` as a custom connector, enter public client ID `pearl-claude-hosted`, and leave the secret empty.

### Cursor IDE, Cloud Agents, and Grok Bot

```bash
git clone --branch v0.9.0 --depth 1 https://github.com/Pearl-Passport/pearl-agent-plugin.git
cd pearl-agent-plugin
mkdir -p ~/.cursor/plugins/local
test ! -e ~/.cursor/plugins/local/pearl-cursor
cp -R plugins/pearl/cursor ~/.cursor/plugins/local/pearl-cursor
```

Reload Cursor and enable **Pearl Cursor** in **Customize**. The plugin and server use the collision-resistant identifier `pearl-cursor`, public client ID `pearl-cursor`, no secret, seven common read scopes plus only `visits:write`, and the official hosted and desktop callbacks documented in [OAuth setup](plugins/pearl/docs/oauth.md). Existing installations must reconnect to consent to the added scope.

## Validate

```bash
npm --prefix plugins/pearl test
npm --prefix plugins/pearl run validate
npm --prefix plugins/pearl/mcp-apps test
npm --prefix plugins/pearl/mcp-apps run validate
npm --prefix plugins/pearl run validate:live
npm --prefix plugins/pearl run validate:registry
npm --prefix plugins/pearl run validate:registry:schema
npm --prefix plugins/pearl run validate:registry:live
npm --prefix cli/pearl run check
npm --prefix cli/pearl test
npm --prefix cli/pearl run validate
```

### Pearl CLI release candidate

The same repository contains Pearl's standalone read-only CLI in
[`cli/pearl`](cli/pearl). After Pearl verifies ownership of the `@joinpearl`
npm scope and publishes through the protected Trusted Publishing workflow:

```bash
npm install --global @joinpearl/cli
pearl doctor --json
pearl login
pearl tools --json
```

Until that npm release exists, use the repository development instructions in
the CLI README. Do not install an unverified package with a similar name.

### MCP Registry release candidate

[`server.json`](server.json) is Pearl's remote-only metadata for the preview MCP Registry. It declares `io.github.Pearl-Passport/pearl-agent-plugin`, matching the case-sensitive public GitHub owner, and the same one Streamable HTTP endpoint used by every host wrapper. It contains no header, token, client secret, package runtime, or tool allowlist.

Registry publication is intentionally separate from source availability. It requires a reviewed `v0.9.0` release, a protected `mcp-registry-publish` GitHub environment with a required reviewer and release-tag restriction, and secretless GitHub OIDC. Until that protected workflow completes and the exact version is verified in the Registry, do not describe Pearl as listed there. The Registry is itself in preview.

See [cross-host setup](plugins/pearl/docs/setup.md), the [capability snapshot](plugins/pearl/skills/pearl-concierge/references/capabilities.md), and [source provenance](SOURCE.md).

Marketplace publication remains a separate host-review step. See [submission paths](plugins/pearl/docs/submission.md) for new applications and future release updates.

## Security, policies, and brand

- Support and security: `hello@joinpearl.co` (use `[Security]` in the subject line for vulnerability reports)
- Support: https://joinpearl.co/support
- Privacy: https://joinpearl.co/privacy
- Terms: https://joinpearl.co/terms
- Software license: [MIT](LICENSE)
- Pearl trademarks and artwork: [TRADEMARKS.md](TRADEMARKS.md)
