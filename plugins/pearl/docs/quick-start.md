# Pearl for AI Agents · Quick Start & Tester Guide

Pearl Reserve and Elite members can connect. Trip changes require Pearl Reserve or above, including Pearl Elite.

## What you can do

- Find restaurants, hotels, and other places, including new openings.
- Compare places with your preferences and match a venue by name and location.
- Explore your taste profile, visit history, saved places, and friends.
- Review your existing trips and reservations.
- On eligible Codex, Claude and Cursor connections: venue hours, when bookings open, similar or nearby places, and events.
- On supported connections, check table availability, log or edit visits, save places, and create private trips or edit their stops.

Ask which actions are available. All changes show a preview and wait for your explicit confirmation.

## Membership and permissions

Save and trip changes require a freshly connected Codex, Claude or Cursor integration. They are not included in the current ChatGPT version.

Reconnect to approve supported new permissions; existing connections do not gain them automatically.

**Request missing places:** selected direct Codex connections can opt in. Pearl checks its catalog before offering Google Maps candidates. Select the place and confirm. Requests require review; places are saved when added. Other connections use Pearl's in-app request flow.

Booking, holding, changing, cancelling, or paying for reservations is unavailable. Reservation watchers, flight management and visit deletion are also unavailable. Visit photo uploads are not included. Use Pearl or the provider for other actions. Availability is not a booking.

## Get connected

1. Use the [Pearl package and host setup instructions](https://github.com/Pearl-Passport/pearl-agent-plugin/blob/main/plugins/pearl/docs/setup.md) for your app.
2. Choose **Connect** or **Authenticate** and sign in to the Pearl account you want to use.
3. Review the requested permissions, then start a new conversation.
4. Ask: “Use Pearl to show my profile and tell me which actions are available.”

Review the named app and permissions. Choose **Allow connection** or **Not now**. Connecting is not permission to book or spend.

Pearl's connection address is `https://agent.joinpearl.co/mcp`.

For Claude web/desktop, use public Client ID `pearl-claude-hosted` and **leave Client Secret empty**. Other apps have different setup steps; follow the linked instructions.

Cursor Grok Bot uses Cursor's plugin access. Local installation does not install Pearl in a hosted Bot. Direct grok.com connections are unsupported.

A public repository or submitted application does not mean a host has approved or listed Pearl. Use an available listing or documented setup path.

## Try these prompts

- “Compare three romantic Italian restaurants in Manhattan and explain which fits my Pearl profile.”
- “Show my profile stats and explain the strongest patterns in my taste.”
- “Show my complete visit history, including any additional pages.”
- “Show my upcoming reservations and open the details of one.”
- When available: “Preview saving this place and adding it to a private weekend trip.”
- When available: “Preview logging my visit to [venue, city] on [date]. Wait for my confirmation.”

For visit logging, check the place, date, and possible duplicates before confirming. A calendar invitation or reservation alone does not prove you attended.

## Cards and photos

Supported apps show Pearl cards, with venue photos where available. Other apps show text; a missing card does not mean the connection failed.

## Manage or remove access

In Pearl, open **Settings → Account → Connected apps**, or [open Connected Apps directly](https://app.joinpearl.co/settings/connected-apps). Review the connection and choose **Revoke** to stop its access. Revoking a connection does not delete your Pearl visits or reservations.

## Need help?

- **Wrong profile or count:** check the connected account and request complete history.
- **Expired or revoked connection:** check your Pearl account and reconnect from the affected AI app. Signing in to another app does not repair this connection.
- **Missing permission or feature:** ask what this connection supports before reconnecting. Reconnecting cannot unlock an unsupported feature or change membership eligibility.
- **Temporary error or timeout:** keep the connection and retry later; contact support if it persists.
- **Unsupported app:** contact Pearl support. Do not reuse another app's client ID or paste a sign-in callback into chat.
- **Two Pearl entries:** use the intended Pearl connection in a fresh conversation.
- **No card or photo:** check the text result; presentation varies by app and available images.
- **Watchers or automatic booking:** unavailable here. Manage them in Pearl where supported.

Never share passwords, sign-in codes, callback URLs, tokens or payment details. For support, send the app name, what you tried and a redacted error.

Support: [hello@joinpearl.co](mailto:hello@joinpearl.co) · [Help](https://joinpearl.co/support) · [Privacy](https://joinpearl.co/privacy) · [Terms](https://joinpearl.co/terms)
