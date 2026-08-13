# ADR-0012: Source-bound durable reply commands before provider dispatch

**Date:** 2026-08-13

**Status:** accepted

## Context

The original Phase 1a Telegram endpoint can send a narrow text message through
its legacy one-Bot gateway. It does not create a durable, source-bound command
record, and it cannot establish that every future provider send is durable.

The configured inbox boundary already limits an inbox bearer to a server-owned
set of connections and can read canonical inbound events. A future reply path
must keep that scope, make an operator's intent durable before a provider call,
and avoid accepting an arbitrary provider recipient identifier. Canonical
provider fields have different meanings across channels, so client-chosen
recipient values would be unsafe and would make source auditing impossible.

Provider dispatch is not ready to add. It needs separate official-provider
review, capability policy, credential and authorization design, attempt and
receipt semantics, timeout handling, retry policy, and independent security
review.

## Decision

### Record an immutable source-bound reply intent

Phase 4c adds `POST /v1/inbox/outbound-commands` only when a configured inbox
exists. Its inbox bearer is resolved before body parsing. The request contains
only:

- `clientOperationId` for bounded idempotency;
- `sourceConnectionId` and `sourceProviderEventId` identifying an already
  durable inbound source event; and
- `text`, retained exactly after non-blank validation.

The route accepts no `recipientId`, provider target, channel, source message
ID, or delivery state. The PostgreSQL adapter resolves the source event inside
the bearer-selected connection scope. It derives the private reply target from
that event's canonical `conversation_id`, plus the source message ID and
channel, rather than trusting caller input.

### Use a dedicated forward-only command table

Migration `0009_outbound_reply_commands` creates
`open_channel_hub.outbound_commands`. Each row has a composite foreign key to
its source inbound event, a uniqueness constraint on
`(connection_id, client_operation_id)`, and a trigger that rejects updates and
deletes. The initial database state is only `queued`.

The public response returns only the command ID, source connection ID, source
provider event ID, `queued` state, and creation timestamp. It never returns
the reply target, message text, source message ID, source channel, raw provider
payload, or credential.

### Make idempotency and absence nondisclosing

The exact same command replay returns `200`; a newly recorded command returns
`201`. Reusing a client operation ID for a different source event or text on
the same connection returns `409`. A missing source event and a source outside
the inbox scope both return the same generic `404`, so the route does not turn
the command API into a cross-inbox event-existence oracle.

### Exclude all delivery work from this decision

There is no worker, provider dispatch, retry, attempt record, delivery/read
receipt, provider HTTP request, provider token/OAuth storage, or dashboard send
form. `queued` means a durable operator intent exists; it is not an accepted,
sent, delivered, or read message.

The existing legacy `POST /v1/telegram-bot/messages` endpoint remains a
separate Phase 1a compatibility path. This decision neither routes it through
the new table nor treats it as evidence that all sends are durable.

## Options considered

### Dispatch immediately from the inbox route

Rejected. A timeout or transport error cannot safely distinguish an unsent
message from an accepted message without provider-specific attempt and receipt
semantics. It would also expand the credential and provider-API boundary before
official review.

### Let the HTTP caller choose `recipientId`

Rejected. It would permit a bearer with one allowed inbox to target an
unrelated provider recipient, and it cannot express safe reply semantics
uniformly across channels.

### Persist only the source event reference and resolve all reply material later

Rejected for this slice. It postpones the integrity assertion that the command
was created from the exact canonical conversation/message/channel available at
creation time. The command instead snapshots those private source-derived
fields while retaining the foreign key.

### Add a dashboard reply form in the same phase

Rejected. The current dashboard is read-only and has a separate browser
authentication/threat boundary. The API-ledger slice can be verified without
adding a browser write surface.

## Consequences

- An inbox bearer now has one narrowly scoped write capability: record a reply
  intent against an existing inbound event inside its configured scope. It is
  no longer accurately described as read-only.
- The durable PostgreSQL volume now contains outgoing message text and private
  reply-target metadata in addition to inbound canonical text. They require the
  same data-handling, backup, retention, access-control, and incident care.
- A future dispatcher must add its own migration and state model. It must never
  reinterpret `queued` as proof of provider acceptance or blindly retry an
  uncertain timeout.
- The legacy Telegram send path remains intentionally separate until an
  explicit compatibility migration and provider-delivery design exists.
