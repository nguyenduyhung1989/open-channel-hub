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
- Phase 2c: a strict secret-backed runtime configuration document for one or
  more official Telegram Bot connections, with a temporary mutually exclusive
  legacy one-Bot environment mode.
- Phase 2c: a durable <code>connection_registry</code> containing only opaque
  connection ID and connector metadata, plus a forward migration that protects
  new inbound-event rows with a registry foreign key.
- Phase 2c: token-bound multi-connection operator routes, dynamic webhook
  ingress at <code>/v1/webhooks/telegram-bot/:connectionId</code>, and cursors
  bound to the token-resolved connection.
- Phase 2c: a two-connection synthetic Compose smoke-test source that checks
  registry rows, same-provider-ID isolation, duplicate idempotency, scoped
  operator reads, cross-connection cursor rejection, and secret-file mode.
- Phase 3a: an official Zalo OA receive-only connector package that supports
  canonical `user_send_text` normalization and rejects every provider command.
- Phase 3a: a fixed `POST /v1/webhooks/zalo-oa` boundary that verifies
  `X-ZEvent-Signature` against exact raw UTF-8 JSON, resolves the configured
  `(appId, oaId)` internally, and makes a canonical text event durable before
  acknowledging it.
- Phase 3a: a token-bound `GET /v1/zalo-oa/inbound-events` route with
  canonical-only fields and account-bound opaque cursors.
- Phase 3a: a forward-only PostgreSQL registry migration that binds each Zalo
  OA connection ID to a non-secret SHA-256 fingerprint of its configured
  `(appId, oaId)` pair, preventing silent rebinding after durable history
  exists.
- A synthetic Compose smoke-test source with two Zalo OA configurations. It
  checks raw-byte signature rejection, durable append before `200`, duplicate
  idempotency, provider-ID isolation, bearer/cursor isolation, registry
  metadata, secret-file mode, and PostgreSQL role safety without provider
  network access.
- Phase 3b: an official Facebook Page receive-only connector package that
  supports canonical customer-text normalization and rejects every provider
  command.
- Phase 3b: fixed `GET`/`POST /v1/webhooks/facebook-page` routes that handle
  Meta verification, resolve all batch Page IDs to one configured App, verify
  `X-Hub-Signature-256` over exact raw request bytes, and append canonical text
  before acknowledging it.
- Phase 3b: a token-bound `GET /v1/facebook-page/inbound-events` route with
  canonical-only fields and Page-bound opaque cursors.
- Phase 3b: a forward-only PostgreSQL registry migration that binds each
  Facebook Page connection ID to a non-secret SHA-256 fingerprint of its
  configured `(appId, pageId)` pair, preventing silent rebinding after durable
  history exists.
- A synthetic Compose smoke-test source with two Facebook Page configurations
  on one fake App. It checks verification challenge handling, raw-byte HMAC
  rejection, multi-Page durable append, duplicate idempotency, Page
  bearer/cursor isolation, registry metadata, secret-file mode, and PostgreSQL
  role safety without provider network access.

### Changed

- The documentation now distinguishes historical Phase 1a verification at
  <code>7141949</code>, completed Phase 2a GitHub CI/CodeQL at
  <code>f106bb8</code>, completed Phase 2b GitHub CI/CodeQL at exact commit
  <code>4d5a9c9</code>, completed Phase 2c GitHub CI/CodeQL at exact commit
  <code>8352b51</code>, and verification still required for the current Phase
  3a candidate.
- An accepted inbound Telegram text event now becomes durable when the
  PostgreSQL configuration is present; a local operator can now list canonical
  inbound events, but this still does not add an inbox, live Telegram proof,
  backup, or retention policy.
- The runtime has <code>/ready</code> for dependency readiness in addition to
  process liveness at <code>/health</code>.
- The former process-wide Telegram connection assumption now has a
  configuration-backed multi-connection path. Operator bearer tokens select
  one configured account inside the process; HTTP callers do not select an
  account identifier.
- The version-1 runtime document now also supports `zalo_oa` entries. It does
  not assume that OA entries sharing an App ID must share an OA secret; each
  configured `(appId, oaId)` pair resolves its own secret at webhook time.
- The version-1 runtime document now also supports `facebook_page` entries.
  Multiple Pages can share one configured App only when their App secret and
  verification token match exactly; Page IDs and operator bearers remain unique.

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
  reads to the configured connection, binds cursors to that connection, and
  does not expose raw provider payloads.
- Compose receives an unpadded base64url encoding of the multi-connection JSON
  as a Docker secret, avoiding <code>.env</code> expansion of credential
  <code>$</code> characters. The encoded value is not encryption, remains
  secret, and is mounted only for the API as <code>10001:10001 0400</code>. It
  is never stored in PostgreSQL, committed, or exposed through an API.
- Zalo OA webhook signatures are compared only after resolving the configured
  `(appId, oaId)` pair and are calculated from the original UTF-8 JSON bytes.
  Unknown identity and invalid signature receive the same `401` response; raw
  provider payloads and OA secrets never enter the database.
- Facebook Page webhook signatures are compared only after every batch Page ID
  resolves to one configured App. The HMAC uses the original raw request bytes;
  unknown/malformed/cross-App batches and invalid signatures return the same
  `401`, while raw payloads and App credentials never enter the database.
- The <code>main</code> branch now blocks force pushes and deletion, including
  for administrators. Required checks and pull-request reviews remain
  intentionally unset for the owner-controlled direct-push workflow.

There has been no official release. A version is dated here only when its
release tag is created after final checks.
