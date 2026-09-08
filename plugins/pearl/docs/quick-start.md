# Pearl for AI Agents · Quick Start & Tester Guide

Connect Pearl to your AI assistant to discover places and make plans informed by your taste. An eligible Pearl Access membership is required.

## What you can do

- Find restaurants, hotels, and other places, including new openings.
- Compare places with your preferences and match a venue by name and location.
- Explore your taste profile, visit history, saved places, and friends.
- Review your existing trips and reservations.
- On supported connections, check table availability, log or edit visits, save places, and create private trips or edit their stops.

Features vary by app, connection, and permissions. Ask your assistant what Pearl actions are available before starting. All changes must show a preview and wait for your explicit confirmation.

Booking, holding, changing, cancelling, or paying for reservations is not available through this MCP release. Flight management and visit deletion are also unavailable. Save and trip changes require a freshly connected Codex, Claude or Cursor integration; they are not in the submitted ChatGPT app. Use Pearl or the reservation provider for supported actions outside the assistant. An availability result is not a booking.

## Get connected

1. Use the [Pearl package and host setup instructions](https://github.com/Pearl-Passport/pearl-agent-plugin/blob/main/plugins/pearl/docs/setup.md) for your app.
2. Choose **Connect** or **Authenticate** and sign in to the Pearl account you want to use.
3. Review the requested permissions, then start a new conversation.
4. Ask: “Use Pearl to show my profile and tell me which actions are available.”

Pearl's connection address is `https://agent.joinpearl.co/mcp`.

For Claude web/desktop custom connectors, use public Client ID `pearl-claude-hosted` and **leave Client Secret empty**. Follow the linked instructions for Codex, Claude Code, and Cursor; their setup steps differ.

Cursor Grok Bot uses Cursor's plugin access. A local Cursor installation does not automatically install Pearl in a hosted Bot. Direct grok.com connections are not currently supported.

Marketplace availability varies by host. A public repository or a submitted application does not mean a host has approved or listed Pearl. Use an available listing or the documented setup path.

## Try these prompts

- “Compare three romantic Italian restaurants in Manhattan and explain which fits my Pearl profile.”
- “Show my profile stats and explain the strongest patterns in my taste.”
- “Show my complete visit history, including any additional pages.”
- “Show my upcoming reservations and open the details of one.”
- When available: “Preview saving this place and adding it to a private weekend trip.”
- When available: “Preview logging my visit to [venue, city] on [date]. Wait for my confirmation.”

For visit logging, check the place, date, and possible duplicates before confirming. A calendar invitation or reservation alone does not prove you attended.

## Cards and photos

Supported apps may show Pearl cards for places, your profile, trips, and reservations, with venue photos where available. Other apps show text results. Not every action has a card; a missing card does not necessarily mean the connection failed.

## Manage or remove access

In Pearl, open **Settings → Account → Connected apps**, or [open Connected Apps directly](https://app.joinpearl.co/settings/connected-apps). Review the connection and choose **Revoke** to stop its access. Revoking a connection does not delete your Pearl visits or reservations.

Profile visit loading and the Connected apps shortcut have recently been improved.

## Need help?

- **Wrong profile or visit count:** confirm which Pearl account you connected; ask for complete history if results are paginated.
- **Expired connection or missing features:** reconnect from your AI app and review the permissions. Do not add permissions your connection does not offer.
- **Two Pearl entries:** use the intended Pearl connection in a fresh conversation.
- **No card or photo:** check the text result; presentation varies by app and available images.

Never paste passwords, sign-in codes, access tokens, or payment details into a conversation or support screenshot. Share only the app name, what you tried, and a redacted error message.

Support: [hello@joinpearl.co](mailto:hello@joinpearl.co) · [Help](https://joinpearl.co/support) · [Privacy](https://joinpearl.co/privacy) · [Terms](https://joinpearl.co/terms)
