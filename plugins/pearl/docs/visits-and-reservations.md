# Visits and reservations with Pearl

Use the same authenticated MCP connection in every host. Installing a package
does not grant capabilities. Runtime `tools/list` is authoritative; eligibility,
OAuth scopes and the reviewed client must all allow the requested action.

## Available workflows

| Workflow | Current boundary |
| --- | --- |
| Read visits and reservations | Common read tools; only the connected member's data |
| Open one reservation | Use its returned `source` and ID, not an invented ID |
| Check live table availability | Eligible reviewed hosts; exact canonical venue, local date and party size; read-only |
| Log/import visits | Eligible reviewed hosts with `visits:write`; preview then explicit attendance/match/duplicate confirmation |
| Edit a visit | Same scope; date/precision, recommendation, score, note or note visibility; before/after preview then confirmation |
| Delete visits | Not released through MCP; manage in Pearl |
| Link reservations to venues/trips | Internal gated implementation, not released to public hosts |
| Book, hold, change or cancel a reservation; pay; arm a watch | Not available through this MCP release |

Reviewed ChatGPT, Codex, Claude and Cursor clients can receive 18 tools: the
13 common reads, live availability and four visit prepare/commit tools. Existing
grants need reconnection and consent to `visits:write`. An eligible read-only
grant may have availability but no visit actions. Standalone CLI, generic and
unknown clients remain read-only. This is not a marketplace approval claim.

## Try it

- “Show my five most recent Pearl visits.”
- “Show my upcoming reservations, then open the first one.”
- “Check availability at [venue] on [local date] for two at 7 pm. Do not book.”
- “I visited [venue, city] on [date]. Preview logging it with a score of 8.”
- After reading the preview: “Confirm that exact visit; I attended.”
- “Preview changing the note on that visit to [note], visible only to me.”
- After reading the before/after preview: “Confirm that exact edit.”

The agent must use `visits_import_prepare` / `visits_import_commit` or
`visits_update_prepare` / `visits_update_commit`; it must not claim success from
a preview or a timeout. A calendar invitation or reservation is evidence to
review, not proof of attendance. Name, city, country, address and venue identity
must agree. Ambiguous matches and possible duplicates need review before commit.
Retried commits reuse their commit idempotency key; prepare and commit keys differ.

Availability distinguishes `available`, `no_availability`, `pending` and
`unknown`. Neither pending nor unknown means sold out. A returned slot is not a
hold or booking, and may expire. Booking changes and cancellation must be
completed in Pearl or with the reservation provider where supported.

## Cards and the next increment

Current cards cover seven read tools, including reservation lists and trip
details. Linked canonical venues can show public catalog photos; missing images
show a neutral placeholder and never change the reservation's status. Live
availability and visit actions currently use text/structured results, not cards.

Next: availability cards with freshness and honest status, then visit
preview/confirmation/receipt cards using the existing action contract. A card
must never auto-commit, bypass matching, widen scopes, or collect credentials.
Adding those tool-to-UI bindings requires host metadata review and real-host
canaries; they are not enabled by this photo update.

## Acceptance checklist

Use designated non-sensitive test data; never put tokens or raw logs in evidence.

1. Confirm the host's inventory after reconnecting and consenting.
2. Read owned visits and reservations; check text output even without cards.
3. Check available, empty, pending and unknown reservation results.
4. Preview one disposable visit; verify nothing commits without confirmation.
5. Confirm it, read it back, and retry the same commit key: no duplicate.
6. Preview an edit, confirm, and verify the changed fields only.
7. Test mismatched venue/city, duplicate visits, expired previews, stale edits,
   missing scope, revoked access and cross-member IDs: fail closed.
8. Ask to book/cancel a reservation: no provider action or success claim.

The connected host currently asserts human confirmation; Pearl does not
independently verify a human click. Disable commit auto-approval. Hosts unable
to stop for confirmation must remain read-only. Remove disposable visits later
in Pearl, not through an invented delete tool. See [host testing](../mcp-apps/HOST-TESTING.md).
