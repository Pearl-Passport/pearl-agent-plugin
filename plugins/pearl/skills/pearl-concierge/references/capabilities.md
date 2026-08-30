# Pearl capability snapshot

This public documentation snapshot is dated **2026-08-30** for package `0.8.11`. It is not a tool allowlist. The authenticated MCP `tools/list` response is authoritative and may vary by host, member, OAuth grant, or rollout.

## Current public read set

| Tool | Current workflow | Important boundary |
| --- | --- | --- |
| `venues_search` | Search Pearl restaurants, hotels, bars, or wineries and return a bounded comparison shortlist | Request, venue, profile, and social evidence remain separately labeled; search does not prove live availability or member-added provenance |
| `venues_recommend` | Get a bounded profile-aware venue shortlist with a supported top-pick rationale | Recommendation is not a reservation, availability check, or guarantee |
| `venues_new_openings` | Find coming-soon and newly opened venues | Established fallbacks must not be described as openings |
| `places_match` | Reconcile up to 20 supplied names with canonical venues | Returns review states and writes nothing |
| `profile_get` | Read the authenticated member's taste profile, authoritative available counts, and evidence-labeled patterns, travel, revisit, exploration, saves-to-visits, constraints, and recommendation rationale | Preserve coverage/freshness/confidence labels; full revisit analysis requires the exploration lens, constraints are relevance-gated, and a lens never changes member scope |
| `visits_list` | List committed visits, including complete recent-history pagination plus score-ranked favorites and city, cuisine/category, trip, or score filters | Filtered discovery can be explicitly partial; it does not import, edit, or delete visits |
| `saves_list` | List active canonical saved venues with complete-history pagination | Does not save or remove a venue |
| `friends_search` | Search Pearl's privacy-filtered member directory | Does not expose hidden data or send a request |
| `friends_list` | List accepted friends and pending request states | Does not change friendship state |
| `trips_list` | List owned trips and collections with exact-total pagination and exact stop counts | Does not create, share, or edit a trip |
| `trip_get` | Read stops from one owned trip or collection | Does not mutate stops or make bookings |
| `reservations_list` | List reservations recorded in Pearl with exact-total pagination | Does not book, change, or cancel a reservation |
| `reservation_get` | Read one selected reservation by returned source and ID | Does not expose booking credentials or provider actions |

## Workflow availability matrix

| Workflow | Current public package | Not currently available |
| --- | --- | --- |
| Search and recommendations | Search, new openings, and taste-aware recommendations | Live booking availability and booking actions |
| Member-added places | Search and matching may return provenance only when explicitly supplied | Direct place creation and provenance-only filtering |
| Saves and collections | Review existing saves and legacy trip/collection reads | Save/remove and collection management |
| Trips | List trips and read stops | Create, edit, share, delete, collaborate, or book |
| Reservations | List and read recorded reservation details | Provider booking, changes, cancellation, messaging, or payment |
| Visits and import | Review visits and match structured place evidence | Commit imports, edit/clean/delete visits, and photo workflows |
| Profile | Read available taste/profile signals | Profile, login, entitlement, privacy, or security changes |
| Friends | Search privacy-filtered members and read friend/request state | Send, accept, decline, cancel, remove, block, or import contacts |
| Matching | Match place names to canonical Pearl venues | People matching and taste-twin matching |

## Conditional dark workflow

The private application contains a guarded trip-creation preview/commit pair for separately approved internal canaries. It remains absent from every public registration and from the default runtime inventory. Even when an eligible connection exposes it, preview creates nothing, commit requires a fresh exact confirmation and a different idempotency key, and the created trip is private. It does not add stops, share the trip, or book travel.

Unavailable does not mean approved, implemented, or scheduled. If a workflow is absent from the current `tools/list`, report it as unavailable and do not simulate it.
