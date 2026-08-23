# Pearl capability snapshot

This public documentation snapshot is dated **2026-08-23** for package `0.8.4`. It is not a tool allowlist. The authenticated MCP `tools/list` response is authoritative and may vary by host, member, OAuth grant, or rollout.

## Current public read set

| Tool | Current workflow | Important boundary |
| --- | --- | --- |
| `venues_search` | Search Pearl restaurants, hotels, bars, or wineries | Does not prove live availability or member-added provenance |
| `venues_recommend` | Get profile-aware venue recommendations | Recommendation is not a reservation or guarantee |
| `venues_new_openings` | Find coming-soon and newly opened venues | Established fallbacks must not be described as openings |
| `places_match` | Reconcile up to 20 supplied names with canonical venues | Returns review states and writes nothing |
| `profile_get` | Read the authenticated member's taste profile and available signals | Does not edit profile or account settings |
| `visits_list` | List committed visits with pagination and exact visit lookup | Does not import, edit, or delete visits |
| `saves_list` | List saved venues | Does not save or remove a venue |
| `friends_search` | Search Pearl's privacy-filtered member directory | Does not expose hidden data or send a request |
| `friends_list` | List accepted friends and pending request states | Does not change friendship state |
| `trips_list` | List owned trips and collections | Does not create, share, or edit a trip |
| `trip_get` | Read stops from one owned trip or collection | Does not mutate stops or make bookings |
| `reservations_list` | List reservations recorded in Pearl | Does not book, change, or cancel a reservation |
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

Unavailable does not mean approved, implemented, or scheduled. If a workflow is absent from the current `tools/list`, report it as unavailable and do not simulate it.
