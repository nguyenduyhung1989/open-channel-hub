# ADR-0016: Append-only outbound delivery evidence before provider dispatch

**Date:** 2026-08-13

**Status:** accepted

## Context

Phase 4c records an immutable, source-bound `queued` reply intent. It does not
establish whether a provider accepted a message, whether a call was attempted,
or whether a recipient received or read anything. A future provider dispatcher
cannot safely treat a network timeout as unsent: the provider may have accepted
the request even when the local process did not receive a response.

The next persistence step must make that uncertainty explicit without turning
an intent into a mutable delivery state or adding a provider credential, HTTP
call, worker, retry loop, or browser control surface.

## Decision

### Add immutable attempt facts, separate from the queued command

Forward migration `0010_outbound_delivery_attempt_receipts` adds
`open_channel_hub.outbound_delivery_attempts`. An attempt row belongs to one
immutable Phase 4c command, and `command_id` is unique, so this bounded
foundation records at most one durable attempt fact per command. It contains
only an identity, the command reference, and the time it was recorded.

The existing `outbound_commands` row remains immutable and remains `queued`.
No command state is changed or reinterpreted as a send result.

### Store a receipt only when there is a known outcome

`open_channel_hub.outbound_delivery_attempt_receipts` is optional for a stored
attempt and has exactly one row at most for that attempt. Its only valid
outcomes are:

| Outcome             | Required evidence                           | What it proves                                                                         | What it does not prove                                                    |
| ------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `provider_accepted` | A non-empty printable `provider_message_id` | A provider-acknowledgement receipt was recorded with that identifier.                  | Network delivery, recipient delivery, display, or read.                   |
| `provider_rejected` | No provider message ID                      | A provider-rejection receipt was recorded.                                             | That a later retry is safe or that the text was never otherwise accepted. |
| `outcome_unknown`   | No provider message ID                      | An observed result was recorded as not safely classifiable as acceptance or rejection. | That the provider did nothing.                                            |

The database permits `provider_message_id` only with `provider_accepted` and
requires it there. It stores no provider response body, error/reason text,
HTTP status, URL, credential, target, message text, retry count, or mutable
delivery state.

### Make missing evidence conservative

`not_attempted` is a derived ledger-view label only. Absence of a durable row
in `outbound_delivery_attempts` for the command supports that label. It is not
a stored outcome and does **not** prove that no external provider call or other
external event ever happened.

For a stored attempt with no receipt row, the current result is conservatively
unknown. A later reader may present that as `outcome_unknown`, just as it would
for a receipt whose exact outcome is `outcome_unknown`; neither case may be
silently converted into a retry or a delivery claim.

### Make the evidence append-only

Both tables reject `UPDATE` and `DELETE` through their own PostgreSQL triggers.
The command foreign key and receipt foreign key preserve a one-way evidence
chain:

`outbound_commands` → `outbound_delivery_attempts` →
`outbound_delivery_attempt_receipts`.

This migration is a storage foundation only. It exposes no HTTP route, inbox
reader, dashboard result, provider dispatcher, worker, retry policy, provider
credential, OAuth/access-token storage, provider request, webhook registration,
or live-provider test.

## Options considered

### Mutate `outbound_commands.state` from `queued` to a delivery result

Rejected. One mutable state would erase the distinction between durable intent,
a recorded local attempt, an unobserved outcome, and a provider acknowledgement.
It would also make later correction destructive rather than append-only.

### Dispatch a provider request in the same phase

Rejected. Safe dispatch requires a provider-specific capability policy,
credential boundary, timeout semantics, authorization, idempotency analysis,
and an independently reviewed retry rule. This migration intentionally creates
none of those capabilities.

### Record provider response bodies or arbitrary failure text

Rejected. Those values can contain sensitive data and tend to blur known
provider acknowledgement with local transport observations. The narrow receipt
schema stores only the smallest stable evidence needed for the three outcomes.

### Treat a missing attempt row as proof of no external side effect

Rejected. The database can establish only what durable evidence it currently
contains. It cannot make a retrospective claim about every possible external
event.

## Consequences

- The database gains a tenth immutable migration and two narrow tables, but no
  process can create provider-side effects through this feature.
- `queued` remains an intent label. A recorded `provider_accepted` receipt is
  stronger ledger evidence than `queued`, but it still is not sent, delivered,
  or read status and does not establish a live provider result in this
  candidate.
- A future dispatcher must write an attempt fact before or with a carefully
  designed provider boundary, handle an absent receipt as unknown, and receive
  a separate security/provider review before any retry behavior exists.
- Operators must treat the new records as sensitive operational metadata and
  must not insert, update, or delete them manually in a deployed database.
