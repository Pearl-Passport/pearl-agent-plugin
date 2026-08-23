# Pearl Agent Plugin

Pearl's installable package connects Codex, Claude, Cursor, and Grok Bot to Pearl's authenticated remote MCP server at `https://agent.joinpearl.co/mcp`.

Pearl Agent access currently requires active Pearl Elite membership. The server enforces eligibility and OAuth scopes; installing this package cannot widen access.

Package `0.8.4` is read-only. Runtime MCP `tools/list` is authoritative. The public package contains thin host manifests, current workflow guidance, public documentation, approved brand assets, and zero-dependency validation—no application, OAuth server, database, executor, environment, deployment configuration, or credential.

Repository availability does not mean Anthropic, Cursor, or OpenAI has approved, endorsed, or listed Pearl.

## Install

### Codex Desktop and CLI

```bash
git clone https://github.com/Pearl-Passport/pearl-agent-plugin.git
cd pearl-agent-plugin
codex plugin marketplace add .
codex plugin add pearl@pearl-integrations
codex mcp login pearl
```

### Claude Code

```bash
git clone https://github.com/Pearl-Passport/pearl-agent-plugin.git
cd pearl-agent-plugin
claude plugin marketplace add .
claude plugin install pearl@pearl-integrations
claude mcp login plugin:pearl:pearl
```

For Claude web/desktop Chat, add `https://agent.joinpearl.co/mcp` as a custom connector, enter public client ID `pearl-claude-hosted`, and leave the secret empty.

### Cursor IDE, Cloud Agents, and Grok Bot

```bash
git clone https://github.com/Pearl-Passport/pearl-agent-plugin.git
cd pearl-agent-plugin
mkdir -p ~/.cursor/plugins/local
test ! -e ~/.cursor/plugins/local/pearl-cursor
cp -R plugins/pearl/cursor ~/.cursor/plugins/local/pearl-cursor
```

Reload Cursor and enable **Pearl Cursor** in **Customize**. The plugin and server use the collision-resistant identifier `pearl-cursor`, public client ID `pearl-cursor`, no secret, seven read scopes, and the official hosted and desktop callbacks documented in [OAuth setup](plugins/pearl/docs/oauth.md).

## Validate

```bash
npm --prefix plugins/pearl test
npm --prefix plugins/pearl run validate
npm --prefix plugins/pearl run validate:live
```

See [cross-host setup](plugins/pearl/docs/setup.md), the [capability snapshot](plugins/pearl/skills/pearl-concierge/references/capabilities.md), and [source provenance](SOURCE.md).

Marketplace publication is a separate host-review step. See [submission paths](plugins/pearl/docs/submission.md) before applying to Cursor or Anthropic.

## Security, policies, and brand

- Support and security: `hello@joinpearl.co` (use `[Security]` in the subject line for vulnerability reports)
- Support: https://joinpearl.co/support
- Privacy: https://joinpearl.co/privacy
- Terms: https://joinpearl.co/terms
- Software license: [MIT](LICENSE)
- Pearl trademarks and artwork: [TRADEMARKS.md](TRADEMARKS.md)
