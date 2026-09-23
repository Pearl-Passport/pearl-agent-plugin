# Host registration and review

This page is for Pearl operators, host reviewers and developers. Members should use [Connect Pearl to your AI app](setup.md).

Pearl uses one authenticated Streamable HTTP MCP endpoint: `https://agent.joinpearl.co/mcp`. The host manifests are thin adapters over that connection and the shared Pearl Concierge skill. The server independently enforces admission, live Pearl Reserve or Elite eligibility, and OAuth scopes; installing this package cannot widen access. See [oauth.md](oauth.md) for the exact public-client boundaries and [releasing.md](releasing.md) for release checks.

## Tool inventory by host

The live MCP `tools/list` response decides what an authenticated connection can use.

| Connection | Scopes | Tools |
| --- | --- | --- |
| Reviewed Codex, Claude and Cursor, fresh consent | Seven reads plus `visits:write`, `saves:write`, `trips:write` | 24: the 13 common reads, `reservations_availability`, and the ten confirmed-action tools for visits, saved places and trips |
| ChatGPT (submitted app) | Seven reads plus `visits:write` | 18: the 13 common reads, `reservations_availability`, and the four visit tools |
| Unknown clients, MCP Registry-generic clients, direct grok.com connectors, standalone Pearl CLI | Seven reads | 13 common reads |

Existing grants are never widened: a member who connected earlier keeps the old scopes until they reconnect. No connection holds, books, changes, cancels or pays for a provider reservation.

## ChatGPT

ChatGPT scans a versioned portal draft; a backend deployment does not update its tool snapshot. Adding tools requires a new portal scan, version test, and submission or publish step. A ChatGPT version that adds the save/trip tools is prepared as a separate draft and has not been submitted. Never keep a legacy private Pearl connector and the reviewed Pearl app enabled in the same test chat.

## Codex

Codex uses OpenAI-hosted CIMD. Current Codex releases present the shared client ID `https://chatgpt.com/oauth/codex/client.json`; earlier releases used a per-install `https://chatgpt.com/oauth/codex/<opaque-id>/client.json` identity. Both declare RFC 8252 loopback callbacks, and Pearl validates the metadata and allows only loopback port variation. No client ID is embedded in `.mcp.json` or pasted by the member.

## Claude

Claude web and desktop use the pre-registered public client `pearl-claude-hosted` with an empty secret and the exact callback `https://claude.ai/api/mcp/auth_callback`. Pearl keeps Dynamic Client Registration disabled, so leaving the client ID blank fails.

Claude Code namespaces plugin-provided servers as `plugin:<plugin>:<server>`, so the installed server is `plugin:pearl:pearl`. It uses Anthropic-hosted CIMD with an ephemeral loopback port on the registered `localhost` or `127.0.0.1` callback. Do not add a static client ID, secret, or fixed callback-port override.

## Cursor, Cloud Agents and Grok Bot

The Cursor plugin and MCP server both use the host-specific identifier `pearl-cursor`. Keep it unchanged: it prevents a Claude Code installation named `pearl` from shadowing Cursor's static OAuth configuration when Cursor discovers other host plugins.

The Cursor wrapper uses public client ID `pearl-cursor`, no client secret, and these exact callbacks:

```text
https://www.cursor.com/agents/mcp/oauth/callback
http://localhost:8787/callback
```

The HTTPS callback covers hosted Agents and Grok Bot; the fixed loopback callback covers Cursor desktop. Grok Bot uses the same Cursor account and plugin catalog, not a separate repository or OAuth client. A local folder under `~/.cursor/plugins/local` is visible only to the local Cursor desktop host and does not make Pearl available to a hosted Grok Bot.

Cursor's `cursor agent mcp` commands inspect the user-level MCP configuration, not a marketplace plugin. Use them only for a separate manual `~/.cursor/mcp.json` entry.

After authorization, the Pearl Cursor detail view must show exactly one MCP, and a fresh full-scope grant should list 24 tools.

The consumer product at `grok.com` has its own custom MCP connector flow and is a different host from Cursor Grok Bot. Pearl has not registered a static xAI OAuth client and keeps Dynamic Client Registration disabled, so do not add `https://agent.joinpearl.co/mcp` at `grok.com/connectors`. Supporting that host needs a separate exact callback/client registration and OAuth canary; never reuse `pearl-cursor` or add a client secret.

## Host canaries

Run these in each real host after a release or reconnection. The Grok Bot run starts from **Grok Bot → Plugins** in a fresh Bot.

```text
Use Pearl to show my five most recent committed visits.
Use Pearl to list my upcoming Pearl reservations, then open one reservation I own.
Use Pearl to check table availability at [venue] on [date] for [party size]. Do not book anything.
Use Pearl to log a visit to [venue] on [date]. Show me the exact preview and wait for my confirmation before committing it.
Use Pearl to change the note on visit [visit ID]. Show the before/after preview and wait for my confirmation.
Use Pearl to book the available table.
```

The first three are reads (`visits_list`, `reservations_list` then `reservation_get`, and `reservations_availability`). Availability must keep `available`, `no_availability`, `pending` and `unknown` distinct; unknown never means sold out. The next two must stop after preview until the member explicitly confirms that exact change, then return a durable receipt and tolerate a safe retry without duplication. The last is a negative canary: the connection does **not** hold, book, change, cancel or pay for reservations, so it must say provider booking is unavailable.

Editing a Pearl visit is not editing a provider reservation, and a reservation returned by Pearl is an existing member record, not proof that Pearl or the host made the booking.

On reviewed Codex, Claude and Cursor connections, also try "Preview saving this place" and "Preview a private trip for my weekend, then help me add a stop", including add, move, swap and remove through the same preview flow. A missing companion tool means the action is unavailable. If a response is interrupted, retry only with the same commit key; if the preview is stale, obtain a new preview and confirmation. A backend protocol test does not prove a host's confirmation UI or marketplace availability.

## Visit import evidence

Only reviewed ChatGPT, Codex, Claude and Cursor connections can commit an import or edit a visit, and only when live discovery exposes the complete pair after fresh `visits:write` consent. Calendar or email evidence must come through the host's separately authorized connector, be minimized to structured venue/date/location fields, and never include raw message bodies, attendee lists, unrelated text, or credentials. A calendar event or reservation is evidence, not attendance. See the [Pearl Concierge skill](../skills/pearl-concierge/SKILL.md).

## Developer install from a clone

To test an unreleased checkout, add the clone as a local marketplace. Local marketplaces do not receive updates; use the GitHub source in [setup.md](setup.md) for normal installs.

```bash
git clone https://github.com/Pearl-Passport/pearl-agent-plugin.git
cd pearl-agent-plugin
codex plugin marketplace add .
claude plugin marketplace add .
```

## Validate

```bash
npm --prefix plugins/pearl test
npm --prefix plugins/pearl run validate
npm --prefix plugins/pearl run validate:live
```

For host-review prerequisites and the separate Claude plugin/connector paths, see [submission.md](submission.md).
