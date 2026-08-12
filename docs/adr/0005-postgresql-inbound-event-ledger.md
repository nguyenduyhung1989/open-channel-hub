# ADR-0005: Dedicated PostgreSQL schema and canonical inbound-event ledger

**Date:** 2026-08-12
**Status:** accepted

## Context

The first official Telegram Bot slice can authenticate and normalize an inbound
text update, but without durable storage it cannot survive restarts or make a
provider retry idempotent. The product boundary calls for self-hosted
operations, and the owner requested a PostgreSQL schema dedicated to this hub.

The project must add persistence without prematurely building a complete CRM,
dashboard, queue, or raw webhook archive. Provider payloads and message content
are sensitive, so the data boundary should collect no more than the current
vertical slice needs.

## Decision

Use PostgreSQL for the first durable slice. Compose creates database
<code>open_channel_hub</code> and schema <code>open_channel_hub</code>. A
non-superuser application role with the same name owns the database/schema and
is used by the API; the bootstrap PostgreSQL credential is not used by the
application.

The domain owns an inbound-event storage port. The PostgreSQL adapter implements
it with parameterized, schema-qualified SQL. It stores canonical event fields
in <code>open_channel_hub.inbound_events</code> and intentionally excludes raw
provider payloads. The primary key
<code>(connection_id, provider_event_id)</code> makes duplicate provider
delivery for a connection a no-op.

Migrations are forward-only repository code. A one-shot migration service runs
before the API, takes a transaction-scoped PostgreSQL advisory lock, and records
immutable IDs in <code>open_channel_hub.schema_migrations</code>. The
<code>/ready</code> endpoint checks that the expected migration is available.
PostgreSQL has no host port and remains on an internal Compose network.

## Options considered

### Use the public schema and static initialization only

- Benefit: fewer files and a familiar default.
- Cost: weak ownership boundary, no migration ledger, and no way for readiness
  to distinguish a new database from the expected schema.
- Rejected: a dedicated schema and explicit migration path are required for
  self-hosted maintenance.

### Persist raw provider payloads or build an inbox immediately

- Benefit: more future fields appear available without another migration.
- Cost: unnecessarily broad sensitive-data collection, unclear retention
  obligations, and a much larger authorization/UI surface.
- Rejected: Phase 2a stores only canonical fields needed for the present
  receive path.

### Introduce Redis, queue, and durable outbox before a ledger

- Benefit: a future retry architecture starts earlier.
- Cost: additional operational services with no currently proven retry/load
  requirement.
- Rejected: durable inbound idempotency is the smallest current need; later
  delivery concerns require their own evidence and ADR.

### Use an ORM for the first slice

- Benefit: generated models and higher-level query helpers.
- Cost: an additional abstraction/dependency for a single fixed event ledger
  and migration boundary.
- Rejected for now: the pinned <code>pg</code> driver plus a small adapter
  keeps the SQL and dependency direction explicit. Revisit only if real query
  complexity justifies it.

## Consequences

- Canonical message text and identifiers are now durable sensitive data. A
  retention/deletion policy, backup/restore process, access model, and
  encryption-at-rest decision are required before real customer operation.
- Applied migrations must never be edited or deleted. Any later change needs a
  new forward migration and an appropriate compatibility plan.
- A normal <code>docker compose down</code> preserves the named volume;
  <code>docker compose down --volumes</code> deletes stored messages. The
  operations guide must keep that warning prominent.
- The current environment-sourced Compose secret mechanism does not allow the
  API/migration services to use read-only root filesystems. They remain
  non-root with dropped capabilities and <code>no-new-privileges</code>, but
  this limitation must remain documented until a different secret delivery
  design is implemented and verified.
- This decision does not add a complete inbox, raw payload archive, public
  database access, queue/outbox, retry, real Telegram proof, or production
  readiness.
