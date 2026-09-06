# Pearl Agent Plugin

Connect Pearl to Codex, Claude, Cursor, and supported AI apps to find places,
explore your taste, and review your visits, saved places, trips, and reservations.
An eligible Pearl Access membership is required.

Start with the [Quick Start & Tester Guide](plugins/pearl/docs/quick-start.md)
for features, example prompts, cards, and troubleshooting.

Pearl uses one authenticated MCP address: `https://agent.joinpearl.co/mcp`.
Features depend on the connected app and the permissions you approve; the live
MCP `tools/list` response is authoritative. Where available, visit logging and
editing require a preview and your explicit confirmation. Table availability
does not hold or book a reservation. This MCP release cannot book, change,
cancel, or pay for reservations.

Repository availability does not mean Anthropic, Cursor, or OpenAI has approved,
endorsed, or listed Pearl.

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

For Claude web/desktop Chat, add `https://agent.joinpearl.co/mcp` as a custom
connector, enter public client ID `pearl-claude-hosted`, and leave Client Secret
empty.

### Cursor desktop

```bash
git clone --branch v0.9.0 --depth 1 https://github.com/Pearl-Passport/pearl-agent-plugin.git
cd pearl-agent-plugin
mkdir -p ~/.cursor/plugins/local
test ! -e ~/.cursor/plugins/local/pearl-cursor
cp -R plugins/pearl/cursor ~/.cursor/plugins/local/pearl-cursor
```

Reload Cursor, enable **Pearl Cursor** in **Customize**, and authenticate.
A local install does not automatically reach hosted Cloud Agents or Grok Bot.
See [host setup](plugins/pearl/docs/setup.md) for hosted access and reconnecting.

## Manage access

Open **Pearl → Settings → Account → Connected apps**, or
[open Connected Apps](https://app.joinpearl.co/settings/connected-apps).
Choose **Revoke** to stop a connection without deleting your Pearl data.

Never share passwords, sign-in codes, access tokens, or payment details in chat.

## Developer reference

- [Host setup](plugins/pearl/docs/setup.md) and [OAuth configuration](plugins/pearl/docs/oauth.md)
- [Capability reference](plugins/pearl/skills/pearl-concierge/references/capabilities.md)
- [Standalone CLI](cli/pearl/README.md)
- [Release instructions](plugins/pearl/docs/releasing.md) and [source provenance](SOURCE.md)

CLI, Registry, and marketplace releases are separate from repository updates.
Check the relevant release instructions before installing or publishing.

```bash
npm --prefix plugins/pearl test
npm --prefix plugins/pearl run validate
npm --prefix plugins/pearl run validate:live
```

## Help and policies

- Support and security: [hello@joinpearl.co](mailto:hello@joinpearl.co)
- [Help](https://joinpearl.co/support) · [Privacy](https://joinpearl.co/privacy) · [Terms](https://joinpearl.co/terms)
- Software: [MIT license](LICENSE) · Pearl artwork: [Trademarks](TRADEMARKS.md)
