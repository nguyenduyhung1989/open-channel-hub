# Changelog

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The public Phase 0 foundation for Open Channel Hub.
- The original mocked Telegram Bot vertical slice, connector contracts, and
  health-check API.
- CI, CodeQL, Dependabot, community-policy files, ADRs, and an initial threat
  model.
- Phase 1a: Telegram Bot HTTP transport, startup wiring, local operator API,
  separately authenticated webhook, and credential-safe configuration and
  operations documentation.
- An unauthenticated <code>GET /source</code> endpoint and
  <code>Link: &lt;SOURCE_OFFER_URL&gt;; rel="source"</code> response header to
  surface the configured corresponding-source offer.
- Phase 2a: a PostgreSQL 18.4 Compose service, dedicated
  <code>open_channel_hub</code> database/schema, non-superuser application
  role, migration ledger, and readiness check.
- Phase 2a: a domain-owned PostgreSQL inbound-event adapter that stores
  canonical text events with parameterized SQL and conflict-safe uniqueness on
  <code>(connection_id, provider_event_id)</code>, without raw provider
  payloads.
- A local synthetic Docker proof that an idempotent migration can run twice and
  duplicate fake webhook delivery produces one durable ledger row.
- Phase 2b: an operator-authenticated
  <code>GET /v1/telegram-bot/inbound-events</code> route that returns canonical
  events only for the configured Telegram connection.
- Phase 2b: stable, opaque cursor pagination backed by a forward-only ledger
  sequence and a connection-scoped PostgreSQL index.
- A disposable Compose smoke test in CI source that verifies migration,
  duplicate webhook idempotency, and the operator inbound-event read path using
  synthetic values only.

### Changed

- The current documentation now distinguishes historical Phase 1a verification
  at <code>7141949</code>, completed Phase 2a GitHub CI/CodeQL at
  <code>f106bb8</code>, and verification still required for the Phase 2b
  candidate.
- An accepted inbound Telegram text event now becomes durable when the
  PostgreSQL configuration is present; a local operator can now list canonical
  inbound events, but this still does not add an inbox, live Telegram proof,
  backup, or retention policy.
- The runtime has <code>/ready</code> for dependency readiness in addition to
  process liveness at <code>/health</code>.

### Security

- PostgreSQL remains on an internal Compose network and has no host port.
- Compose injects distinct bootstrap and application database passwords as
  Docker secrets; the application database password is read from a secret file,
  not placed in the API environment.
- The API and migration services remain non-root, drop Linux capabilities, use
  <code>no-new-privileges</code>, and have no host source/data bind mount.
  Their root filesystems are not currently read-only because the available
  Compose environment-secret injection cannot support that configuration; this
  is a known limitation, not a hardening claim.
- Real secrets and data are prohibited in the repository, issues, pull
  requests, and tests. A database volume can contain canonical message text, so
  <code>docker compose down --volumes</code> is destructive and must not be
  used as a routine shutdown.
- The read API validates bounded opaque cursors before storage access, fixes
  reads to the configured connection, and does not expose raw provider
  payloads.

There has been no official release. A version is dated here only when its
release tag is created after final checks.
