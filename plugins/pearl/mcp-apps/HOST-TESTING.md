# Pearl MCP Apps real-host canary

Run this canary after deploying a changed MCP Apps artifact and before making a
host-rendering claim. Automated fixture tests validate the built iframe, but the
host controls resource loading, sandboxing, bridge delivery, resizing, themes,
and OAuth recovery.

## Safety boundary

- Use a designated test account with representative, non-sensitive Pearl data.
- Do not capture passwords, authorization codes, access or refresh tokens,
  cookies, request headers, or browser storage.
- Record only the host/product version, date, tool name, visible result, and a
  Pearl request ID when an error already exposes one.
- Do not create, change, book, cancel, save, message, or publish anything. The
  seven UI-enabled tools are reads. Trip creation remains a separate dark
  prepare/commit canary and is not part of this host-rendering test.

## Host and viewport matrix

Run the seven prompts in ChatGPT web and desktop. Repeat the venue comparison and
one journey result at a mobile-width viewport or in the supported mobile host.
Test light and dark appearance once each.

| Tool | Suggested test request | Required visible result |
| --- | --- | --- |
| `venues_search` | “Find three Pearl restaurants in Paris.” | Venue cards and a result count |
| `venues_recommend` | “Recommend three Pearl places for a quiet dinner.” | Taste-aware venue cards |
| `venues_new_openings` | “Show Pearl’s newest openings.” | Opening cards with honest fallback labeling when applicable |
| `profile_get` | “What are the strongest patterns in my Pearl taste profile?” | Member-scoped visits/cities/saves statistics, taste facets, and fixed follow-up questions |
| `trips_list` | “List my Pearl trips and collections.” | Owned trip/collection cards with dates and stop counts when returned |
| `trip_get` | First list trips in chat, then ask to open one returned trip. | Trip-stop cards; no booking claim |
| `reservations_list` | “Show my Pearl reservations.” | Reservation cards with date, status, and safe account details |

For trips and reservations, verify the unified journey family groups returned
stops or reservations by date, labels missing status as unknown, and never
converts tentative or unavailable data into confirmed copy. Flight and live
availability fixtures are pre-release coverage only while those tools are dark;
they are not part of the seven-tool public canary.

Use only trips and reservations returned by the same account. Never paste an ID
from another member into a screenshot or review artifact.

## Interaction checks

1. Select two venue cards. The comparison must contain exactly two equal columns
   on desktop and no blank third column.
2. Select a third venue. It must become three columns only when enough width is
   available; narrower hosts may wrap or stack without horizontal scrolling.
3. Use Tab and Enter instead of the pointer. Focus must stay visible and Enter
   must toggle the selected state.
4. Resize to 390px. No card, toolbar, comparison, or action may exceed the iframe.
5. Confirm light and dark surfaces remain legible and status colors are not the
   only way state is communicated.
6. Disconnect Pearl, make one read request, and reconnect through the host. The
   conversation must preserve a useful text result or recovery path even if the
   iframe cannot mount.

## Negative checks

- No visits, saves, friends, exact-reservation, write, dark, or flight tool
  should claim a card in this release.
- The local flight fixture must show source and freshness or fare expiry when
  supplied, preserve overnight dates and currency, say it is read-only, and
  offer no booking action. Passing that fixture is not a public flight claim.
- Profile follow-up buttons may send only the reviewed fixed questions. They
  must never insert returned profile text, member IDs, or credentials into a
  host message.
- No card may offer booking, cancellation, save, edit, friend-request, or other
  write actions.
- Browser network inspection must show no request initiated by the iframe. Its
  resource CSP has empty connection, asset, frame, and base-URI allowlists.
- An unsupported host must still receive useful text and structured tool output.

## Evidence record

For each host, retain:

- host/product and version;
- test date and account class (never account credentials);
- the seven tool outcomes;
- one two-place comparison screenshot;
- one 390px screenshot;
- one dark-mode journey screenshot;
- reconnect outcome;
- any Pearl request ID associated with a failure.

Mark the canary failed if a host does not fetch the current resource, a card
clips or scrolls horizontally, OAuth recovery loops, a dark/future tool renders,
or the text fallback is missing. A failed host canary does not make the MCP read
tools unavailable, but it blocks a successful UI-rendering claim for that host.
