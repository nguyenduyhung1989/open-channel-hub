# ADR-0006: Stable, connection-scoped inbound-event pagination

**Date:** 2026-08-13
**Status:** accepted

## Context

Phase 2a made canonical Telegram inbound events durable, but an operator had no
application-level way to inspect them. The first read path must not become an
unbounded database export, expose another configured account through a caller
parameter, or return raw provider payloads.

Offset pagination is unsafe for an inbound ledger: a newly inserted event can
shift later offsets and cause duplicates or omissions. A timestamp alone is
also insufficient because rows can share a timestamp and transactions can
commit in a different order from a database sequence allocation.

## Decision

Add a forward-only migration that gives each inbound ledger row an immutable
<code>ledger_id bigint GENERATED ALWAYS AS IDENTITY</code> and a
<code>(connection_id, ledger_id DESC)</code> index.

The PostgreSQL inbound-event writer takes one transaction-scoped advisory lock
before any insert allocates an identity value and holds it until commit or
rollback. Every writer for this ledger must follow that rule. This deliberately
serializes the small alpha write path so a reader cannot observe a committed
larger ID while an earlier allocated ID is still waiting to commit.

The first reader page obtains the maximum committed <code>ledger_id</code> for
one fixed connection and returns rows at or below that ceiling in descending
keyset order. A continuation cursor preserves both that snapshot ceiling and
the final row ID of its preceding page. The next query remains below both
positions. It reads one additional row to decide whether to issue another
cursor.

The HTTP route encodes this cursor as bounded base64url JSON, but treats it as
untrusted and opaque to callers. Bearer authentication and the process-fixed
Telegram connection ID are the authorization boundary; a cursor is not a
credential. The route returns canonical event fields only.

## Alternatives considered

### Offset pagination

- Benefit: familiar URLs and simple SQL.
- Rejected: concurrent inbound rows move offsets and invalidate a traversal.

### Timestamp plus event ID cursor

- Benefit: avoids a schema migration.
- Rejected: timestamps can tie, and provider IDs do not define local commit
  order or a stable cross-provider ordering rule.

### Unserialized identity allocation

- Benefit: higher concurrent write throughput.
- Rejected for this alpha: PostgreSQL sequences allocate outside transaction
  rollback semantics, so a later transaction can receive and commit a larger
  value while an earlier transaction with a smaller value remains uncommitted.
  A snapshot based on the later value could then skip the earlier row.

## Consequences

- Event listing is deterministic within one snapshot for the configured
  connection and does not expose raw provider payloads.
- The append advisory lock is a conscious throughput trade-off. Revisit it only
  with measured load, a replacement ordering design, and concurrency proof.
- Future direct writers to <code>inbound_events</code> must use the same lock;
  bypassing it invalidates the pagination guarantee.
- This is an operator API, not a user inbox, search service, audit trail, or
  authorization model. Retention, backups, access logging, rate limits, and
  RBAC remain separate work.
