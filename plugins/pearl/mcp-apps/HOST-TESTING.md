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
- The seven UI-enabled tools are reads. The card canary must not create, change,
  book, cancel, save, message, or publish anything. A separate text/structured
  canary in each reviewed ChatGPT, Codex, Claude, and Cursor host may create and
  edit one designated disposable visit through the reviewed confirmation flow;
  remove test data later through the Pearl app because deletion is not an Agent
  capability.

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
converts tentative or unavailable data into confirmed copy. Flight fixtures are
pre-release coverage only while those tools are dark. Live availability remains
outside this seven-tool card canary: package `0.10.0` exposes it to reviewed
agent hosts through text/structured output and does not attach a card.

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

## Reviewed-host action canary

Run steps 2–8 below separately in ChatGPT, Codex, Claude web/desktop, Claude
Code, and Cursor after the exact host version and backend eligibility are both
active. Reconnect first so the grant includes `visits:write`. Record the
authenticated `tools/list` result: it must contain 18 tools and no other write.
Unknown clients and the standalone Pearl CLI must still return only the 13
common reads.

### Cursor Grok Bot installation

Run this only after Pearl is visible in the Cursor Marketplace or an eligible
team marketplace. A local `~/.cursor/plugins/local` installation does not reach
the hosted Grok Bot.

1. In Grok Bot, open **Plugins**, add Pearl, complete browser authorization, and
   confirm it appears under **Installed**.
2. Ask Pearl to show the five most recent committed visits. Confirm
   `visits_list` is member-scoped and does not imply that Grok Bot created a
   visit.
3. Ask Pearl to list upcoming reservations, then open one returned reservation.
   Confirm `reservation_get` uses the `source` and ID returned by
   `reservations_list` and exposes no booking credentials or provider action.
4. Ask Pearl to check table availability at a canonical venue for an exact local
   date and party size. Confirm `available`, `no_availability`, `pending`, and
   `unknown` remain distinct; unknown must not be described as sold out, and no
   slot may be held or booked.
5. Ask Pearl to log one designated test visit. Confirm the first action only
   returns a preview. After reviewing it, explicitly confirm the exact visit and
   verify the receipt plus `visits_list`. A repeat with the same commit
   idempotency key must not create a duplicate.
6. Ask Pearl to edit only that visit's note. Confirm the before/after preview is
   shown and no change occurs before a second explicit confirmation. Verify the
   receipt and exact visit read afterward.
7. Ask Pearl to book, change, and cancel a reservation. Each request must report
   that the provider action is unavailable. Any hold, booking claim, provider
   cancellation, or request for payment credentials fails the canary.
8. Record text/structured fallback as a valid host result when Cursor does not
   render the optional MCP Apps iframe.

## Negative checks

- No visit write, availability, saves, friends, exact-reservation, dark, or
  flight tool should claim a card in this release.
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
