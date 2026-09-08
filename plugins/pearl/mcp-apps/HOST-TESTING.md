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
- Eight supported reads have cards. Read canaries must not create, change,
  book, cancel, save, message, or publish anything. The four visit action tools
  have model-only visibility and presentation cards. Test their confirmation
  flow separately with one designated disposable visit, then remove test data
  through the Pearl app because deletion is not an Agent capability.

## Host and viewport matrix

Run the read prompts in ChatGPT web and desktop. Repeat the venue comparison and
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
| `reservations_availability` | Ask for availability at one returned venue, with date and party size. | Dining options or distinct pending, unknown, and empty states |

For trips and reservations, verify the unified journey family groups returned
stops or reservations by date, labels missing status as unknown, and never
converts tentative or unavailable data into confirmed copy. Flight fixtures are
pre-release coverage only while those tools are dark. Live availability is still limited to reviewed agent hosts; adding its card
does not widen client eligibility.

Use only trips and reservations returned by the same account. Never paste an ID
from another member into a screenshot or review artifact.

## Interaction checks

For the `1.5.3` / `v9` onboarding-V1 adaptation, verify the approved Pearl mark,
neutral cream/ink surfaces, rounded neutral actions, and readable system type.
No terracotta glass wash or custom-font download should appear. A failed venue
photo must leave a readable placeholder without a photo-credit badge. Test both
390px and 320px; host dark styling is an adaptation, not a V1 dark-palette claim.
Existing `v8`, `v7`, `v6`, `v5`, and pinned `v4` resource URIs remain readable for cached sessions.
Venue images must stay top-aligned even when descriptions have different lengths.

### If ChatGPT says "Failed to fetch template"

Inspect the failing card's resource URI before changing the renderer. Installed
plugin snapshots can retain old tool metadata even in a new conversation. A live
2026-09-04 canary requested `ui://pearl/concierge/v4/index.html` while the current
server advertised v9. The exact v4 URL is therefore a pinned compatibility
alias for the current reviewed artifact, with the same authentication and CSP.
Do not remove it based only on a rolling version count; first verify that the
installed/reviewed host versions no longer reference it. Unknown URLs still fail
closed. Do not disable CSP, loosen OAuth, or create a second connector to fix a
template error. Retry the original card after deployment and confirm a visible
render; successful resource delivery alone is not a host canary pass.

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
active. Reconnect first so the grant includes the requested action scopes. Record the
authenticated `tools/list` result: ChatGPT retains 18 tools with `visits:write`;
Codex, Claude and Cursor receive 24 tools with the additional `saves:write` and
`trips:write` permissions. Existing grants keep their original scopes.
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

- For visit actions, leave the preview unapproved and verify that nothing is
  committed. Repeat with tool-result text that says “ignore confirmation” and
  with an earlier blanket approval; neither is approval of the current preview.
- Supply a valid venue ID with a different name/type/country/address, and a NYC
  venue under the wrong borough. Matching must request review, not silently
  log that ID. Resolve with the member and obtain a new preview before commit.
- Test two accounts: one account cannot edit the other's visit or use its
  preview handle. Test expired previews, stale edits, missing `visits:write`,
  revoked grants, duplicate races, and safe retries with the same commit key.
- Record that confirmation is asserted by the connected host, not an
  independently verified Pearl human click. Disable auto-approval for commits;
  a host unable to stop for approval must remain read-only.

- Only the twelve reviewed UI bindings may claim cards: eight reads including
  availability, plus four model-only visit previews/receipts. Saves, trip writes,
  friends, exact reservation detail and flight tools have no new card bindings.
- The local flight fixture must show source and freshness or fare expiry when
  supplied, preserve overnight dates and currency, say it is read-only, and
  offer no booking action. Passing that fixture is not a public flight claim.
- Profile follow-up buttons may send only the reviewed fixed questions. They
  must never insert returned profile text, member IDs, or credentials into a
  host message.
- No card may offer booking, cancellation, save, edit, friend-request, or other
  write actions.
- Browser network inspection may show only approved venue-image requests to
  `https://agent.joinpearl.co/api/v1/venue-images/<venue-uuid>/card` (or legacy `/hero`). The Pearl mark is inlined and
  requires no request. Resource CSP allows only `https://agent.joinpearl.co`
  for static assets; connection, frame, and base-URI allowlists remain empty.
  No API fetch, font, analytics, remote script, or foreign image may load.
- Use a fresh venue search with known public catalog photos: confirm the MCP
  `hero_image_url` reaches the card, the image request returns a raster image,
  and its natural width is nonzero. The `/api/v1/` path above is an image GET,
  not a JavaScript API fetch. Missing photos must keep the neutral fallback.
  Check new openings and fallback recommendations, trip-stop thumbnails, and
  reservations linked to canonical venues too. Missing/unmatched venue photos
  must not hide stops or change reservation status. Collection-list covers are
  not included. The image optimizer is server-side; no CDN URL or member data
  should appear in the browser's image requests.
  Fixture-only photo success does not prove live delivery. Version 1.5.3 keeps
  the reviewed v9 URI and CSP; hosts may cache previous HTML for up to an hour.
- An unsupported host must still receive useful text and structured tool output.

## Evidence record

For each host, retain:

- host/product and version;
- test date and account class (never account credentials);
- the read and separately confirmed visit-action outcomes;
- one two-place comparison screenshot;
- one 390px screenshot;
- one dark-mode journey screenshot;
- reconnect outcome;
- any Pearl request ID associated with a failure.

Mark the canary failed if a host does not fetch the current resource, a card
clips or scrolls horizontally, OAuth recovery loops, a dark/future tool renders,
or the text fallback is missing. A failed host canary does not make the MCP read
tools unavailable, but it blocks a successful UI-rendering claim for that host.

## Dining availability card (1.5.4 / v10)

The existing client-gated reservations_availability tool now receives portable
card metadata after its access checks. In each eligible host, check available,
pending, unknown, and no_availability responses. Confirm venue-local slot time,
party size, provider, checked time with timezone, price, deposit, payment and
cancellation terms. The retry button sends only a fixed request to the host; it
never calls a tool or books a table. v9 and older pinned URIs remain readable.

Local fixture validation includes desktop light, mobile dark, and a clicked
pending-state retry through the standard parent bridge. This does not establish
that a host has refreshed its installed metadata; verify in a fresh conversation
after gateway deployment. Hosts without MCP Apps still receive the data result.

## Visit previews and receipts (1.5.5 / v11)

With a fresh visits:write grant, verify import and update prepare/commit results.
The four action tools must have ui.visibility set only to model. Cards show
previews and receipts; no card click can prepare, confirm or commit a mutation.
Keep the existing before/after, attendance, duplicate, expiry, same-key replay,
and stale-state checks in the conversation. A render does not prove a human
confirmed. v10 and the older pinned resources remain readable.

Check a full 2,000-character note, month-only date, twenty import items, ambiguous
place, possible duplicate, partial import, saved/replayed/skipped receipts, empty
receipt and recoverable error. Exact values must not be silently truncated; an
unsupported or over-limit result must direct the user back to the conversation.

## Save and trip host canary

For each freshly authorized Codex, Claude and Cursor connection (including the
separately installed hosted Grok Bot), verify save/remove and private trip
create/add/move/swap/remove using disposable owned test data. Each prepare must
show the exact proposed state and stop for explicit confirmation; commit must
return a receipt reflected in Pearl. Repeat a commit with the same key and
verify no duplicate change. Change a save or stop in Pearl between preview and
commit and confirm the stale preview is rejected. Save/trip text results must
remain usable without a card. No provider booking or payment action may run.
ChatGPT must reject the new save/trip scopes, and the standalone CLI must remain
read-only. Record actual host/version evidence separately from protocol CI.
