# Pearl Agent Plugin

Connect Pearl to Codex, Claude, Cursor, and supported AI apps to find places,
explore your taste, and review your visits, saved places, trips, and reservations.
Eligible Pearl Reserve and Elite members can connect.

Start with the [Quick Start & Tester Guide](plugins/pearl/docs/quick-start.md)
for features, example prompts, cards, and troubleshooting.

Pearl uses one authenticated MCP address: `https://agent.joinpearl.co/mcp`.
Features depend on the connected app and the permissions you approve; the live
MCP `tools/list` response is authoritative. Where available, visit edits, saved places and private trip changes require a preview and your explicit confirmation. Reconnect Codex, Claude or Cursor to approve the new permissions; ChatGPT keeps its submitted visit-only action set. Table availability
does not hold or book a reservation. This MCP release cannot book, change,
cancel, or pay for reservations.

Repository availability does not mean Anthropic, Cursor, or OpenAI has approved,
endorsed, or listed Pearl.

## Install

Install from this GitHub repository so your app can pull updates. Full per-app
steps, including ChatGPT and Claude web, are in
[Connect Pearl to your AI app](plugins/pearl/docs/setup.md).

### Codex Desktop and CLI

```bash
codex plugin marketplace add Pearl-Passport/pearl-agent-plugin
codex plugin add pearl@pearl-integrations
codex mcp login pearl
```

Update with `codex plugin marketplace upgrade pearl-integrations`. Remove with
`codex plugin remove pearl@pearl-integrations`.

### Claude Code

```bash
claude plugin marketplace add Pearl-Passport/pearl-agent-plugin
claude plugin install pearl@pearl-integrations
claude mcp login plugin:pearl:pearl
```

Claude Code refreshes the marketplace automatically; to update now, run
`claude plugin marketplace update pearl-integrations` and
`claude plugin update pearl@pearl-integrations`. Remove with
`claude plugin uninstall pearl@pearl-integrations`.

For Claude web/desktop Chat, add `https://agent.joinpearl.co/mcp` as a custom
connector, enter public client ID `pearl-claude-hosted`, and leave Client Secret
empty.

### Cursor desktop

Install Pearl from the Cursor Marketplace or your team marketplace when it is
listed there. Otherwise, install it locally:

```bash
git clone --depth 1 https://github.com/Pearl-Passport/pearl-agent-plugin.git ~/pearl-agent-plugin
mkdir -p ~/.cursor/plugins/local
rsync -a --delete ~/pearl-agent-plugin/plugins/pearl/cursor/ ~/.cursor/plugins/local/pearl-cursor/
```

Reload Cursor, enable **Pearl Cursor** in **Customize**, and authenticate. To
update, run `git -C ~/pearl-agent-plugin pull --ff-only` and the same `rsync`
line; to remove, delete `~/.cursor/plugins/local/pearl-cursor`. A local install
does not reach hosted Cloud Agents or Grok Bot.

## Manage access

Open **Pearl → Settings → Account → Connected apps**, or
[open Connected Apps](https://app.joinpearl.co/settings/connected-apps).
Choose **Revoke** to stop a connection without deleting your Pearl data.

Never share passwords, sign-in codes, access tokens, or payment details in chat.

## Developer reference

- [Host registration and review](plugins/pearl/docs/host-operators.md) and [OAuth configuration](plugins/pearl/docs/oauth.md)
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
