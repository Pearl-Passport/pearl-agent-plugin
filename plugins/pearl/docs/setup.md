# Install Pearl in Codex, Claude, and Cursor

Pearl uses one authenticated Streamable HTTP MCP endpoint: `https://agent.joinpearl.co/mcp`. The host manifests are thin adapters over that connection and the shared Pearl Concierge skill.

Before setup, sign in to a Pearl account with active Pearl Elite membership. The server enforces eligibility and OAuth scopes; installing this package cannot widen access.

The live MCP `tools/list` response decides what the authenticated connection can use. Package `0.8.4` documents a read-only public release. Missing workflows must be reported as unavailable.

## Codex Desktop and CLI

From a clone of the distribution repository:

```bash
codex plugin marketplace add .
codex plugin add pearl@pearl-integrations
codex mcp login pearl
```

Codex Desktop and CLI share the same user configuration. Start a new task after installation so the skill and tools load.

Verify:

```bash
codex plugin list
codex mcp list
```

Then ask: `Use $pearl-concierge to show my saved places and recommend one for my next trip.`

## Claude web and desktop Chat

Claude Chat uses Pearl as a remote custom connector; it does not load the Claude Code skill.

1. Open **Customize → Connectors → Add custom connector**.
2. Name it `Pearl` and enter `https://agent.joinpearl.co/mcp`.
3. Open **Advanced settings** and enter OAuth Client ID `pearl-claude-hosted`.
4. For **OAuth Client Secret**, **leave the field empty**.
5. Add the connector and complete Pearl authorization.

Use this exact callback when registering the public client:

`https://claude.ai/api/mcp/auth_callback`

Pearl keeps Dynamic Client Registration disabled. Do not leave the client ID blank and do not paste a bearer token into the URL or settings.

## Claude Code

```bash
claude plugin marketplace add .
claude plugin install pearl@pearl-integrations
claude
```

In the new session, run `/reload-plugins`, then:

```bash
claude mcp login plugin:pearl:pearl
```

Claude Code namespaces plugin-provided servers as `plugin:<plugin>:<server>`, so the installed server is `plugin:pearl:pearl`. Claude Code uses Anthropic-hosted CIMD with an ephemeral loopback port on the registered `localhost` or `127.0.0.1` callback. Do not add a static client ID, secret, or fixed callback-port override. Verify with `/mcp`, `claude mcp list`, or `claude mcp get plugin:pearl:pearl`.

Invoke `/pearl:pearl-concierge`, or ask Claude to use Pearl Concierge for venue discovery, matching, profile context, visits, saves, friends, trips, or reservations.

## Cursor IDE, Cloud Agents, and Grok Bot

For a local Cursor IDE canary:

```bash
mkdir -p ~/.cursor/plugins/local
test ! -e ~/.cursor/plugins/local/pearl-cursor
cp -R plugins/pearl/cursor ~/.cursor/plugins/local/pearl-cursor
```

Restart Cursor or run **Developer: Reload Window**, open **Customize → Plugins**, enable **Pearl Cursor**, and select **Authenticate**. After authorization, the Pearl Cursor detail view must show exactly one MCP and `13 tools enabled`.

Cursor's `cursor agent mcp` commands inspect the user-level MCP configuration, not a locally installed marketplace plugin. Use those commands only when testing a separate manual `~/.cursor/mcp.json` entry; they are not the verification path for this package.

The Cursor plugin and MCP server both use the host-specific identifier `pearl-cursor`. Keep that identifier unchanged: it prevents a Claude Code installation named `pearl` from shadowing Cursor's static OAuth configuration when Cursor discovers other host plugins.

The Cursor wrapper uses public client ID `pearl-cursor`, no client secret, and these exact callbacks:

```text
https://www.cursor.com/agents/mcp/oauth/callback
http://localhost:8787/callback
```

The HTTPS callback covers hosted Agents and Grok Bot; the fixed loopback callback covers the Cursor desktop app. Grok Bot uses the same Cursor account and plugin catalog, not a separate repository or OAuth client.

## Visit and import requests

The current public package can review existing visits and match structured place evidence, but it cannot commit an import or edit a visit. Calendar or email evidence must come through the host's separately authorized connector, be minimized to structured venue/date/location fields, and never include raw message bodies or credentials. See the [Pearl Concierge skill](../skills/pearl-concierge/SKILL.md).

## Validate

```bash
npm --prefix plugins/pearl test
npm --prefix plugins/pearl run validate
npm --prefix plugins/pearl run validate:live
```

See [oauth.md](oauth.md) for the exact public-client boundaries and [releasing.md](releasing.md) for release checks.

For host-review prerequisites and the separate Claude plugin/connector paths, see [submission.md](submission.md).
