# ADR-0013: Scoped queued reply-command history without delivery semantics

**Date:** 2026-08-13

**Status:** accepted

This ADR records the Phase 4d design decision. Its combined Phase 4c–4d
revision at exact commit <code>160414e</code> passed final local checks, a
synthetic Compose proof, independent review, and GitHub CI/CodeQL. That
evidence does not prove a live provider send, public TLS, or production flow.

## Context

Phase 4c creates immutable source-bound reply intents, but an operator cannot
inspect the intent after a request finishes. A read path is needed for the same
configured inbox scope without exposing the private reply target, source
message/channel metadata, client idempotency key, raw provider data, or a
future delivery model.

The existing inbound-event feed already demonstrates stable, scope-bound
pagination. Outbound commands have their own global PostgreSQL identity order
and their own meaning, so an inbound-event cursor cannot safely paginate them.
No provider has been asked to accept a message, and the only current command
state is `queued`.

## Decision

### Add one read-only, inbox-scoped history route

Phase 4d adds `GET /v1/inbox/outbound-commands` when a configured inbox
exists. It resolves the inbox bearer before application query or cursor
validation. The bearer selects a fixed server-side connection set; the HTTP
caller cannot choose an inbox, connection, state, provider recipient, or other
scope.

The route accepts only an optional `limit` from 1 through 100 and an optional
opaque `cursor`. Its default page size is 50. The public result contains
`id`, `sourceConnectionId`, `sourceProviderEventId`, `text`, `state`,
`createdAt`, and an optional `nextCursor`.

Message text is intentionally visible in this operator history because it is
the operator's recorded intent. It remains sensitive operational data. The
projection deliberately omits private reply target, source message ID, source
channel, client operation ID, raw provider payload, credentials, and all
future attempt/delivery data.

### Bind a separate versioned cursor to the exact inbox scope

The cursor is canonical base64url JSON with `orderVersion: 1`, inbox ID,
SHA-256 scope hash, fixed snapshot maximum command ID, and the exclusive
continuation position. It is valid only for the exact configured inbox and its
canonical connection set. Malformed, unversioned, foreign-inbox,
scope-changed, or unsupported-version cursors return one generic `400` without
storage access.

The history query uses a reverse command-ID snapshot. The first page fixes the
largest queued command ID in scope; subsequent pages stay below both that
snapshot and the previous position. Later commands therefore cannot shift or
duplicate an already started traversal.

### Read queued intents only

The reader filters `state = 'queued'` explicitly, even though the current
immutable schema permits no other state. This makes the current contract clear:
history is not a delivery timeline. No migration is added in Phase 4d;
`0009_outbound_reply_commands` remains the ninth immutable migration.

## Options considered

### Expose all stored columns for operator debugging

Rejected. The reply target, source metadata, and client operation ID are not
needed to read a recorded intent and would widen the disclosure surface.

### Reuse the inbound-event cursor

Rejected. It has a separate ordering/version contract and an inbound sequence
does not identify a stable command-history position.

### Add delivery state, attempts, or a retry button with history

Rejected. `queued` is durable intent only. Provider dispatch, uncertainty,
retry, receipts, and state transitions require separate official-provider
policy, storage, migration, and security review.

### Add a dashboard history page in the same phase

Rejected. The current dashboard has a deliberately read-only, bounded browser
surface. API history can be verified without expanding browser data disclosure
or creating an operator workflow that appears to send messages.

## Consequences

- A configured inbox bearer can now read source-bound queued intent text in
  addition to inbound events and recording new intents. The bearer remains
  unable to select an arbitrary recipient or dispatch a provider message.
- The database has no new table or state transition. Phase 4d is an adapter and
  projection change over the Phase 4c immutable rows.
- Cursor use remains safe only while the bearer and its configured inbox scope
  remain valid. A caller must restart from the first page after a scope change
  or an incompatible cursor version.
- Operators must handle returned text as sensitive customer-support data. This
  is not a generic audit log, delivery dashboard, or proof that any provider
  received a message.
