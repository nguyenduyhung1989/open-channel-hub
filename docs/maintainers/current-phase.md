# Public checkpoint: Phase 2a

**Updated:** 2026-08-12

**Objective:** add the smallest durable PostgreSQL vertical slice: a dedicated
database/schema, a non-superuser application role, forward migrations, and
idempotent persistence of canonical inbound Telegram text events. This
checkpoint does not authorize a real Telegram call or a production deployment.

## Historical evidence that remains true

- Phase 0 GitHub CI and CodeQL succeeded at commit <code>8b80c3b</code>.
- GitHub Private Vulnerability Reporting, secret scanning, Dependabot alerts,
  and automatic security fixes are enabled.
- GitHub CI and CodeQL succeeded for the Phase 1a candidate at
  <code>7141949</code>. The earlier final local Phase 1a evidence also applies
  to that candidate.
- The <code>0.1.0</code> release tag has not been created; that is a separate
  owner decision.
- Branch protection is intentionally open pending an owner decision. Do not
  describe it as an existing safeguard.

Historical checks are not evidence for the current uncommitted Phase 2a
candidate. In particular, the older read-only runtime check does not describe
the current Compose secret-mount limitation.

## Current code and local synthetic evidence

- Compose contains PostgreSQL 18.4 with no host database port, an internal data
  network, a one-shot migration service, and an API that waits for migration
  completion.
- Database <code>open_channel_hub</code> and schema
  <code>open_channel_hub</code> are dedicated to this hub. The
  <code>open_channel_hub</code> application role is non-superuser and cannot
  create databases, roles, replicas, or bypass row-level security.
- The migration CLI takes a transaction-scoped advisory lock, keeps an
  immutable <code>schema_migrations</code> ledger, and creates the
  <code>inbound_events</code> table. <code>/ready</code> checks that the
  expected migration is available; <code>/health</code> remains liveness only.
- The domain owns an inbound-event storage port. The PostgreSQL adapter writes
  canonical text-event fields using parameterized SQL. It excludes raw provider
  payloads and treats a repeated
  <code>(connection_id, provider_event_id)</code> as a conflict-safe no-op.
- Compose receives two different database passwords as Docker secrets:
  <code>POSTGRES_PASSWORD</code> for bootstrap and
  <code>DATABASE_PASSWORD</code> for the application role. The API receives
  the latter through a secret file, not an environment variable.
- API and migration containers are non-root, drop capabilities, use
  <code>no-new-privileges</code>, no host source/data bind mount, and a
  temporary <code>/tmp</code>. Their root filesystems are **not** read-only in
  this Compose revision because the available environment-sourced secret
  mechanism cannot be mounted into a read-only service.
- A local proof used only fake source, passwords, event data, and webhook
  authentication. The migration ran twice; the same fake webhook was submitted
  twice; both responses were <code>204</code>; and exactly one ledger row
  remained. An unauthenticated HTTPS reachability probe to
  <code>api.telegram.org</code> returned <code>200</code>; no real Telegram
  Bot token, API method request, webhook registration, or message was used.

## Final local verification

- <code>npm run check</code> passed: formatting, lint, type checking, ten test
  files with 63 tests, coverage, and the production build.
- <code>npm audit --audit-level=low</code> found zero vulnerabilities;
  <code>docker compose config --quiet</code> passed.
- The final synthetic Compose proof rebuilt the runtime image, completed the
  migration twice, served <code>/ready</code>, accepted the same fake webhook
  twice with <code>204</code>, and left one ledger row. The schema-migration
  checksum and non-superuser role were verified; PostgreSQL had no host port.
- The API container ran as UID <code>10001</code> and read the application
  secret file as <code>10001:10001 0400</code>. It attached to both the
  internal data network and the edge network. An independent audit found no
  Critical, High, or Medium actionable finding.

## Not yet verified or implemented

- No fresh GitHub CI or CodeQL result exists for the eventual Phase 2a commit.
- No owner-authorized Telegram Bot test through a public TLS endpoint has
  occurred. Phase 1a is therefore still not complete.
- There is no user inbox, event-query API, attachment persistence, Redis,
  queue/outbox, outbound retry, user/organization model, RBAC, TLS proxy,
  rate limit, or production observability.
- There is no retention/deletion policy, backup schedule, encrypted backup,
  restore procedure, recovery drill, encryption-at-rest assurance, or password
  rotation procedure.

## Open risks

- Canonical sender/conversation identifiers and message text are now durable
  data. Excluding raw provider payload reduces data collected but does not make
  the ledger non-sensitive.
- A routine <code>docker compose down</code> preserves the database volume.
  <code>docker compose down --volumes</code> deletes it and every stored
  event; backups are not implemented.
- The application role is deliberately limited, but the Docker host and
  PostgreSQL bootstrap credential remain high-trust assets.
- The current root filesystem limitation is documented rather than concealed.
  It must not be described as read-only hardening until a different secret
  delivery path is implemented and verified.
- Offline and synthetic Docker tests do not prove Telegram compatibility,
  public TLS security, or production reliability.

## Exact next verification

1. After an authorized push, GitHub CI and CodeQL must be read for the exact
   resulting commit before any release claim.
2. Only with owner authorization, use a test bot and public TLS URL to verify
   one real Telegram flow without printing a token, header, payload, or
   persisted message.
3. Before operating real data, design and test backup/restore, retention and
   deletion, password rotation, access controls, rate limits, monitoring, and
   an encryption-at-rest decision.
