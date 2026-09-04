# Install Pearl in Codex, Claude, and Cursor

Pearl uses one authenticated Streamable HTTP MCP endpoint: `https://agent.joinpearl.co/mcp`. The host manifests are thin adapters over that connection and the shared Pearl Concierge skill.

Before setup, sign in to a Pearl account that is eligible for Pearl Access. The server independently enforces admission, live Access eligibility, and OAuth scopes; installing this package cannot widen access.

The live MCP `tools/list` response decides what the authenticated connection can use. Package `0.9.0` keeps Codex, Claude, ChatGPT, Registry, and CLI connections read-only while giving the exact reviewed Cursor client a separately scoped visit-action release and read-only live table availability. Missing workflows must be reported as unavailable.

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

## Cursor IDE, Cloud Agents, and Cursor Grok Bot

Package `0.9.0` supports these Cursor-hosted workflows. Read-only live availability can appear under an existing Cursor `reservations:read` grant after server activation; the visit actions require a new authorization for `visits:write`:

- review committed Pearl visits with `visits_list`;
- preview and explicitly confirm a new visit or a structured historical visit import;
- preview and explicitly confirm an edit to one owned visit;
- check current restaurant table availability for a canonical Pearl venue without holding or booking it;
- list existing linked or imported Pearl reservations with `reservations_list`;
- open one returned reservation with `reservation_get`; and
- use the other ten public read tools for venues, profile, saves, friends, and trips.

It does **not** hold, book, change, cancel, or pay for reservations. Editing a Pearl visit is not editing a provider reservation, and a reservation returned by Pearl is an existing member record, not proof that Pearl or Cursor made the booking.

Version `0.9.0` adds `visits:write` to Cursor only. Existing Cursor grants and tokens keep their old scope, so open the Pearl plugin, choose reconnect/authenticate, and approve the updated request before testing. Do not add a client secret.

### Test the package locally in Cursor desktop

For a local Cursor IDE canary:

```bash
mkdir -p ~/.cursor/plugins/local
test ! -e ~/.cursor/plugins/local/pearl-cursor
cp -R plugins/pearl/cursor ~/.cursor/plugins/local/pearl-cursor
```

Restart Cursor or run **Developer: Reload Window**, open **Customize → Plugins**, enable **Pearl Cursor**, and select **Authenticate**. After authorization, the Pearl Cursor detail view must show exactly one MCP. The authenticated inventory should contain the common 13 reads, `reservations_availability`, and the four reviewed visit tools (18 tools total); `tools/list` is the authority if the host summarizes the count differently.

Cursor's `cursor agent mcp` commands inspect the user-level MCP configuration, not a locally installed marketplace plugin. Use those commands only when testing a separate manual `~/.cursor/mcp.json` entry; they are not the verification path for this package.

The Cursor plugin and MCP server both use the host-specific identifier `pearl-cursor`. Keep that identifier unchanged: it prevents a Claude Code installation named `pearl` from shadowing Cursor's static OAuth configuration when Cursor discovers other host plugins.

The Cursor wrapper uses public client ID `pearl-cursor`, no client secret, and these exact callbacks:

```text
https://www.cursor.com/agents/mcp/oauth/callback
http://localhost:8787/callback
```

The HTTPS callback covers hosted Agents and Grok Bot; the fixed loopback callback covers the Cursor desktop app. Grok Bot uses the same Cursor account and plugin catalog, not a separate repository or OAuth client.

### Add Pearl to Cursor Grok Bot after marketplace listing

A local folder under `~/.cursor/plugins/local` is visible only to the local Cursor development host. It does not make Pearl available to a hosted Grok Bot. Grok Bot can install Pearl only after Cursor lists the reviewed plugin in its Marketplace, or after an eligible team administrator provisions the reviewed repository through a team marketplace.

Once Pearl is visible to the member's Cursor account:

1. Open **Grok Bot → Plugins**. On mobile, open the account menu and select **Plugins**.
2. Search for **Pearl**, choose **Add**, and complete Pearl authorization in the browser.
3. If Grok Bot remains on **Waiting for authorization**, choose **Reopen** and finish the same authorization request; do not reuse an old Pearl authorization URL.
4. Confirm Pearl appears under **Installed**. Team members who see **Disabled by team admin** need their Cursor administrator to allow the plugin or MCP server.
5. Start a fresh Bot and run the read canaries below.

```text
Use Pearl to show my five most recent committed visits.
Use Pearl to list my upcoming Pearl reservations, then open one reservation I own.
Use Pearl to check table availability at [venue] on [date] for [party size]. Do not book anything.
Use Pearl to log a visit to [venue] on [date]. Show me the exact preview and wait for my confirmation before committing it.
Use Pearl to change the note on visit [visit ID]. Show the before/after preview and wait for my confirmation.
Use Pearl to book the available table.
```

The first three requests are reads. Availability must distinguish `available`, `no_availability`, `pending`, and `unknown`; unknown never means sold out. The next two must stop after preview until the member explicitly confirms that exact change, then return a durable receipt and tolerate a safe retry without duplication. The final request is a negative canary: package `0.9.0` must say provider booking is unavailable and must not imply that a table was held or booked.

### Do not confuse Cursor Grok Bot with grok.com

The consumer and Business product at `grok.com` has its own custom MCP connector flow. It is a different host from Cursor Grok Bot. Pearl has not registered or reviewed a static xAI OAuth client, and Pearl keeps Dynamic Client Registration disabled, so do not add `https://agent.joinpearl.co/mcp` directly at `grok.com/connectors` yet. Supporting that host requires a separate exact callback/client registration and OAuth canary; never reuse `pearl-cursor` or add a client secret.

## Visit and import requests

Only the reviewed Cursor connection can commit an import or edit a visit in `0.9.0`; all other packaged hosts remain read-only. Calendar or email evidence must come through the host's separately authorized connector, be minimized to structured venue/date/location fields, and never include raw message bodies, attendee lists, unrelated text, or credentials. A calendar event or reservation is evidence, not attendance: the member must review the matched place and explicitly confirm which entries they actually attended. See the [Pearl Concierge skill](../skills/pearl-concierge/SKILL.md).

## Validate

```bash
npm --prefix plugins/pearl test
npm --prefix plugins/pearl run validate
npm --prefix plugins/pearl run validate:live
```

See [oauth.md](oauth.md) for the exact public-client boundaries and [releasing.md](releasing.md) for release checks.

For host-review prerequisites and the separate Claude plugin/connector paths, see [submission.md](submission.md).
