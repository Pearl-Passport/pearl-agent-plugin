# Pearl for AI Agents · Quick Start & Tester Guide

Pearl Reserve and Elite members can connect. Trip changes require Pearl Reserve or above, including Pearl Elite.

## What you can do

- Find restaurants, hotels, and other places, including new openings.
- Compare places with your preferences and match a venue by name and location.
- Explore your taste profile, visit history, saved places, and friends.
- Review your existing trips and reservations.
- On Codex, Claude and Cursor: venue hours, when bookings open, similar or nearby places, and events.
- On supported connections, check table availability, log or edit visits, save places, and create private trips or edit their stops.
- Where enabled, record flight details, update a recorded seat, record an existing restaurant reservation, and add dishes or wines to a visit. Review the exact preview before confirming.

Features vary by connection and permissions. Ask which actions are available. All changes show a preview and wait for your explicit confirmation.

## Membership and permissions

Save, trip and record-import changes require a supported Codex, Claude or Cursor connection and relevant permissions. They are not included in the current ChatGPT version.

Membership does not unlock unsupported actions. Reconnect to approve new permissions; existing connections do not gain them automatically.

**Request missing places:** selected direct Codex connections can opt in during rollout. Pearl checks its catalog first, then offers Google Maps candidates. Select the correct place and confirm the preview. Requests require review; places are saved when added. Other connections use Pearl's in-app request flow.

Booking, holding, changing, cancelling, or paying for reservations is not available through this MCP release. Reservation watchers, airline changes and visit deletion are also unavailable. Visit photo uploads are not included. Recording a flight or reservation changes Pearl only; it does not book or verify it with a provider. Use Pearl or the provider for other supported actions.

## Get connected

1. Use the [Pearl package and host setup instructions](https://github.com/Pearl-Passport/pearl-agent-plugin/blob/main/plugins/pearl/docs/setup.md) for your app.
2. Choose **Connect** or **Authenticate** and sign in to the Pearl account you want to use.
3. Review the requested permissions, then start a new conversation.
4. Ask: “Use Pearl to show my profile and tell me which actions are available.”

Connecting is not permission to book or spend.

Pearl's connection address is `https://agent.joinpearl.co/mcp`.

For Claude custom connectors, use Client ID `pearl-claude-hosted` and **leave Client Secret empty**. Other hosts use the linked setup steps.

Cursor Grok Bot uses Cursor's plugin access. A local Cursor installation does not automatically install Pearl in a hosted Bot. Direct grok.com connections are not currently supported.

A submitted application does not mean a host has approved or listed Pearl. Use a listing or the documented setup path.

## Try these prompts

- “Compare three romantic Italian restaurants in Manhattan and explain which fits my Pearl profile.”
- “Show my profile stats and explain the strongest patterns in my taste.”
- “Show my complete visit history, including any additional pages.”
- When available: “Preview saving this place and adding it to a private weekend trip.”
- When available: “Change the recorded seat on my [date, flight number, route] flight to 12A. Show me the change first.”
- When available: “Add the pasta and 2019 Barolo to my dinner visit, with these scores and notes.”

For visit logging, check the place, date, and possible duplicates before confirming. A calendar invitation or reservation alone does not prove you attended.

## Cards and photos

Supported apps show Pearl cards, with venue photos where available. Other apps show text; a missing card does not mean the connection failed.

## Manage or remove access

In Pearl, open **Settings → Account → Connected apps**, or [open Connected Apps directly](https://app.joinpearl.co/settings/connected-apps). Review the connection and choose **Revoke** to stop its access. Revoking a connection does not delete your Pearl visits or reservations.

## Need help?

- **Wrong profile or visit count:** confirm which Pearl account you connected; ask for complete history if results are paginated.
- **Expired connection or missing features:** reconnect from your AI app and review the permissions. Do not add permissions your connection does not offer.
- **Two Pearl entries:** use the intended Pearl connection in a fresh conversation.
- **No card or photo:** check the text result; presentation varies by app and available images.

Never share passwords, sign-in codes, tokens or payment details. For support, send the app name, what you tried and a redacted error.

Support: [hello@joinpearl.co](mailto:hello@joinpearl.co) · [Help](https://joinpearl.co/support) · [Privacy](https://joinpearl.co/privacy) · [Terms](https://joinpearl.co/terms)
