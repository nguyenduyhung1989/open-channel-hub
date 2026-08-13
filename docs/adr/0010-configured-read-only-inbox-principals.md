# ADR-0010: Configured read-only inbox principals

**Date:** 2026-08-13
**Status:** accepted

## Context

The first official connector slices store canonical inbound events durably and
expose one account per operator bearer. That is intentionally narrow, but it
does not let one trusted local operator inspect a controlled set of accounts
from one feed. A browser dashboard, user identity, organizations, roles,
invitations, audit logging, and durable authorization tables are not present.

The next useful vertical slice needs aggregate reads without accidentally
turning an account token into an all-account credential, accepting a
caller-supplied connection list, or making a future authorization system appear
implemented before it exists.

## Decision

Phase 4a adds an optional `inboxes` array to the existing version-1 runtime
secret document. Each entry has an opaque inbox ID, its own unique bearer token,
and an explicit allow-list of configured connection IDs.

- `GET /v1/inbox/inbound-events` authenticates the inbox bearer before parsing
  request input or reading PostgreSQL. It resolves exactly one configured
  inbox internally; route, query, and header fields cannot select an inbox or
  connection.
- The inbox's configured connection IDs are canonicalized in a stable order.
  A PostgreSQL feed reader returns canonical inbound events across that bounded
  set, newest durable ledger sequence first, with the same fixed-snapshot
  pagination property as the existing per-account readers.
- The public cursor embeds the inbox ID and a SHA-256 scope binding for the
  canonical connection set. The route rejects a cursor from another inbox or a
  former scope. It continues to require bearer authentication; the cursor is
  never treated as a credential.
- Inbox tokens are distinct from one another and from all configured provider,
  webhook, and account-operator credentials. The API returns canonical events
  only, not raw provider payloads, configuration, ledger IDs, or membership
  metadata.
- Inbox configuration remains runtime-secret data. It is not stored in
  PostgreSQL and creates no user, organization, or role record.

## Options considered

### Let an account-operator bearer submit several connection IDs

Rejected. A token intended for one account could be used to probe or expand its
scope. The server would also need a separate authorization rule for every
caller-supplied list.

### Add dashboard users, organizations, and RBAC first

Rejected for this slice. It would introduce a new durable identity and security
surface before there is an aggregate API whose behavior can be tested and
operated independently. A future identity/RBAC design can replace or coexist
with the configured-local-principal approach through its own migration and
authorization review.

### Expose an unrestricted cross-connection operator API

Rejected. It would make the bearer effectively a hub-wide credential with no
bounded membership, no least-privilege configuration, and no safe transition
path to a later multi-organization model.

### Build a dashboard before the aggregate API

Rejected. A UI would either duplicate scope and cursor rules in the browser or
need an undocumented aggregate endpoint. The read boundary is a smaller,
testable prerequisite for any later dashboard.

## Consequences

- A self-hosted operator can make a small, explicit cross-channel read scope
  useful before a dashboard or full user model exists.
- Scope is expressed in deployment configuration, so an operator must protect
  and rotate the secret document. Changing an inbox connection set invalidates
  its earlier pagination cursors by design.
- The numeric ledger ordering used by Phase 4a also has an explicit cursor
  version. Earlier per-account cursor formats are rejected rather than resumed
  under a different ordering; a caller restarts at the first page after the
  upgrade.
- The system still has no full authorization model. The inbox bearer is a
  configured local principal, not a login, organization, role, audit trail, or
  sharing mechanism.
- Conversation summaries, read/unread state, assignments, outbound delivery,
  attachments, search, retention, backups, encryption assurance, and live
  provider/TLS verification remain separate work.
