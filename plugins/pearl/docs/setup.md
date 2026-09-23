# Connect Pearl to your AI app

Eligible Pearl Reserve and Elite members can connect. Sign in to that Pearl account when your app asks. For features and example prompts, see the [Quick Start & Tester Guide](quick-start.md).

Every app connects to the same Pearl address: `https://agent.joinpearl.co/mcp`. What you can do depends on the app and the permissions you approve. Changes such as logging a visit, saving a place or editing a trip always show a preview and wait for your confirmation. No app can book, hold, change, cancel or pay for a reservation.

Operators and host reviewers: see [Host registration and review](host-operators.md).

## ChatGPT

**Status:** the published ChatGPT app can search places, read your Pearl history, check table availability, and log or edit visits. Saving places and changing trips are not in the ChatGPT app yet; ask for the Pearl link and finish those in Pearl.

1. In ChatGPT, open **Apps**, search for **Pearl**, and choose **Connect**. If Pearl isn't listed for your account, use Codex, Claude or Cursor instead.
2. Approve the permissions, then start a new chat and select Pearl.

Use one Pearl entry per chat. If you also added Pearl as a custom connector earlier, turn one of them off.

## Codex (desktop and CLI)

```bash
codex plugin marketplace add Pearl-Passport/pearl-agent-plugin
codex plugin add pearl@pearl-integrations
codex mcp login pearl
```

Codex signs in with its own OpenAI-hosted identity; there is no client ID to paste. Start a new task, then ask: `Use $pearl-concierge to show my saved places and recommend one for my next trip.` Check with `codex plugin list` and `codex mcp list`.

- **Update:** `codex plugin marketplace upgrade pearl-integrations`, then start a new task.
- **Remove:** `codex plugin remove pearl@pearl-integrations` and `codex plugin marketplace remove pearl-integrations`.

## Claude web and desktop

Claude chat uses Pearl as a custom connector.

1. Open **Customize → Connectors → Add custom connector**.
2. Name it `Pearl` and enter `https://agent.joinpearl.co/mcp`.
3. Open **Advanced settings** and enter OAuth Client ID `pearl-claude-hosted`.
4. OAuth Client Secret: **leave it empty**.
5. Add the connector and sign in to Pearl.

Never paste a token into the URL or settings. Connectors are served live, so there is nothing to update. To remove Pearl, delete the connector in **Customize → Connectors**.

## Claude Code

```bash
claude plugin marketplace add Pearl-Passport/pearl-agent-plugin
claude plugin install pearl@pearl-integrations
claude mcp login plugin:pearl:pearl
```

Start a new session (or run `/reload-plugins`), then invoke `/pearl:pearl-concierge` or just ask about places, visits, saves, trips or reservations. Check the connection with `/mcp` or `claude mcp get plugin:pearl:pearl`. Do not add a client ID or secret.

- **Update:** Claude Code refreshes third-party marketplaces automatically. To update now, run `claude plugin marketplace update pearl-integrations` and `claude plugin update pearl@pearl-integrations`, then restart.
- **Remove:** `claude plugin uninstall pearl@pearl-integrations` and `claude plugin marketplace remove pearl-integrations`.

## Cursor

Use the first option that is available to you.

- **Cursor Marketplace:** if Pearl is listed, open **Customize**, find **Pearl**, and choose **Install**.
- **Team marketplace:** a Cursor team admin can open **Dashboard → Plugins & MCPs → Team Marketplaces → Add Marketplace**, choose **Import from Repo** with `https://github.com/Pearl-Passport/pearl-agent-plugin`, and turn on **Enable Auto Refresh** so updates arrive automatically.
- **Local install (Cursor desktop only):**

  ```bash
  git clone --depth 1 https://github.com/Pearl-Passport/pearl-agent-plugin.git ~/pearl-agent-plugin
  mkdir -p ~/.cursor/plugins/local
  rsync -a --delete ~/pearl-agent-plugin/plugins/pearl/cursor/ ~/.cursor/plugins/local/pearl-cursor/
  ```

  To update, run `git -C ~/pearl-agent-plugin pull --ff-only` and the same `rsync` line. To remove, run `rm -rf ~/.cursor/plugins/local/pearl-cursor`.

Restart Cursor or run **Developer: Reload Window**, open **Customize → Plugins**, enable **Pearl Cursor**, and choose **Authenticate**. Do not add a client secret.

## Cursor Grok Bot

A local folder on your computer does not make Pearl available to a hosted Grok Bot. Grok Bot can use Pearl once it is in the Cursor Marketplace or your team marketplace.

1. Open **Grok Bot → Plugins**. On mobile, open the account menu and select **Plugins**.
2. Search for **Pearl**, choose **Add**, and sign in to Pearl in the browser.
3. If Grok Bot stays on **Waiting for authorization**, choose **Reopen** and finish that request; don't reuse an old Pearl sign-in link.
4. If you see **Disabled by team admin**, ask your Cursor administrator to allow Pearl.

The consumer app at grok.com is a different host from Cursor Grok Bot; adding Pearl directly at grok.com is not supported yet.

## When new features arrive: reconnect

Existing connections keep the permissions you approved at the time. If Pearl can read your history but says it can't log a visit, save a place or change a trip, reconnect Pearl in your app and approve the new permission:

- Codex: `codex mcp login pearl`
- Claude Code: `claude mcp login plugin:pearl:pearl`
- Claude web and desktop: disconnect and reconnect the Pearl connector
- Cursor and Grok Bot: open the Pearl plugin and choose **Authenticate** or **Reconnect**

Reconnecting never unlocks features your membership or app doesn't include.

## Manage or revoke access

In Pearl, open **Settings → Account → Connected apps**, or [open Connected Apps](https://app.joinpearl.co/settings/connected-apps), and choose **Revoke**. This stops that app's access and does not delete your Pearl data.
