# ADR-0017: Immutable authorization provenance before provider dispatch

**Date:** 2026-08-14

**Status:** accepted

## Context

Phase 4c records an immutable, source-bound `queued` reply command. A
configured inbox bearer can create one through the inbox API, and Phase 4f can
create the same command through a configured dashboard principal's narrow
server-side write closure. Before this decision, the durable command row did
not say which of those two server-side authority paths had recorded it, which
configured inbox scope was evaluated, or which dashboard principal was bound
to a dashboard-originated command.

A future provider dispatcher must not scan every `queued` command and infer
permission from today's configuration. Configuration can change after a command
was recorded; a browser session or bearer must never be copied into PostgreSQL;
and the historical authority record must not itself become a send permission.

## Decision

### Add a one-to-one immutable authorization-provenance row

Forward migration `0011_outbound_command_authorizations` adds
`open_channel_hub.outbound_command_authorizations`. Its primary key and foreign
key are both `command_id`, so a Phase 4h command has at most one provenance row
and that row always belongs to one existing immutable command.

For every newly created command, the PostgreSQL adapter writes this row in the
same transaction as the source-bound command. If either insert fails, the
transaction fails rather than leaving a newly created command with partial
Phase 4h provenance.

The only authority kinds are:

| `authorization_kind`  | Durable fields                                 | Meaning                                                                                             | It does not mean                                                                            |
| --------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `inbox_bearer`        | `inbox_id`; `dashboard_principal_id` is `NULL` | The server recorded the command through one configured inbox-bearer boundary.                       | The bearer token was stored, is still valid, or may send a provider request.                |
| `dashboard_principal` | `inbox_id` and `dashboard_principal_id`        | The server recorded the command through one configured principal's explicit writable inbox closure. | A browser session was stored, the principal still has permission, or a message may be sent. |

PostgreSQL rejects any other kind and rejects a mismatched principal/kind pair.
The table also records a SHA-256 `scope_fingerprint`. The adapter derives it
from a domain-separated representation of the sorted connection IDs allowed at
recording time. It binds the row to the exact evaluated scope without storing a
bearer, session, reply target, message text, provider credential, raw provider
data, delivery result, or retry state.

### Treat old command rows as provenance-free

This is a forward-only schema change. It does not guess, backfill, or manually
invent provenance for commands created before `0011`. A command without an
authorization row is a legacy provenance-free row. It must remain outside any
future dispatch candidate set unless a separately reviewed migration and
authorization decision establishes an honest rule for it.

An idempotent replay must match not only the existing source and text, but also
the recorded authority kind, inbox, optional dashboard principal, and scope
fingerprint. A replay that cannot establish the same provenance is a conflict;
it does not fill or overwrite a row.

### Keep provenance evidence separate from current authorization and delivery

The new table has its own PostgreSQL update/delete-rejection trigger. It is an
append-only historical fact, not a current-access table. Every eventual send
path must separately re-evaluate the current inbox/principal authorization,
provider eligibility, credential boundary, recipient safety, timeout result,
and provider-specific delivery rules.

Phase 4h adds no provider request, provider SDK, worker, queue, dispatcher,
retry, token/OAuth storage, browser bearer, dashboard result, command mutation,
delivery/read state, or live-provider test.

## Options considered

### Infer authority only from current runtime configuration

Rejected. Current configuration cannot faithfully prove which authority was
used at the time of the original command. A later permission change could make
the inference misleading or unsafe.

### Store the bearer, browser session, or password-derived value

Rejected. These are credentials or authentication material, not provenance.
Persisting them would enlarge the sensitive-data boundary without making a
future provider send safe.

### Backfill old commands by inspecting their source connection

Rejected. A source connection does not establish which inbox bearer or which
dashboard principal created a historical command. Guessing would turn missing
evidence into a false authority claim.

### Start provider dispatch in the same phase

Rejected. Provenance is only one prerequisite. Dispatch still needs a separate
official-provider authorization, capability, credential, recipient, timeout,
receipt, retry, and production-verification design.

## Consequences

- New commands gain a narrow immutable historical authority record without
  changing the `queued` command state or its source-bound target derivation.
- Existing provenance-free commands remain non-dispatch candidates by default.
- A future dispatcher must require both a suitable immutable provenance row and
  a fresh authorization decision. Neither condition by itself authorizes a
  provider call.
- Phase 4h remains a source candidate until its frozen code, local checks,
  independent review, synthetic Compose proof, and GitHub checks are complete.
