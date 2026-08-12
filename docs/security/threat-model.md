# Phase 0–2a threat model

**Review date:** 2026-08-12

**Status:** Phase 0 has GitHub CI/CodeQL evidence at <code>8b80c3b</code>, and
the Phase 1a candidate has historical GitHub CI/CodeQL evidence at
<code>7141949</code>. Phase 2a adds a durable PostgreSQL event ledger and a
synthetic local Docker proof. Final local candidate verification has passed;
fresh GitHub evidence, a real Telegram test, and production approval remain
open.

## Facts before plans

| Present in the Phase 2a source                                                                                                                                            | Verified local synthetic evidence                                                                                                                                                                                                                                                                                     | Absent or planned only                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A small HTTP API with liveness and readiness routes; typed startup configuration; source-offer route/header; official Telegram Bot boundary.                              | A fake migration ran twice, a fake duplicate webhook returned <code>204</code> twice, and one ledger row remained. An unauthenticated HTTPS reachability probe to <code>api.telegram.org</code> returned <code>200</code>; no real token, Bot API method request, webhook registration, or customer content was used. | Fresh GitHub checks for this change, a real Telegram/TLS flow, and a production deployment.                                                  |
| PostgreSQL 18.4 on an internal Compose network; database/schema <code>open_channel_hub</code>; non-superuser application role; forward migration ledger.                  | Migration uses a transaction-scoped advisory lock and the API waits for migration completion in Compose.                                                                                                                                                                                                              | Backups, restores, retention/deletion, password rotation, encryption-at-rest assurance, capacity policy, and production monitoring.          |
| Canonical inbound text-event persistence with parameterized SQL and a primary key on <code>(connection_id, provider_event_id)</code>; raw provider payloads are excluded. | The duplicate synthetic provider event was stored only once.                                                                                                                                                                                                                                                          | A user inbox, read/query API, attachments, user/organization authorization, Redis, queue/outbox, retry, and audit trail.                     |
| API/migration containers are non-root, drop capabilities, use <code>no-new-privileges</code>, and have no host source/data bind mount. PostgreSQL has no host port.       | Docker passwords were synthetic and supplied as separate secret files.                                                                                                                                                                                                                                                | Read-only root filesystems for API/migration services; the current environment-sourced Compose secret mechanism prevents that configuration. |

Do not treat any source fact or local proof as a production claim.

## Trust zones and data flow

### Zone A — external and untrusted

Every HTTP request, including Telegram webhook payloads, message text,
authentication headers, issue/PR content, and user-provided data is untrusted.
It must be validated at the boundary and must not become SQL, a shell command,
an outbound URL, or HTML without appropriate controls.

### Zone B — operator-controlled application runtime

This zone contains reviewed code, API/migration containers, environment
configuration, connector ports, and Telegram secrets. It is trusted only to
the extent that the operator controls the host and secret source. A secret in
an environment file is not inherently safe, and provider data remains
untrusted after it crosses the HTTP boundary.

### Zone C — durable PostgreSQL ledger

This zone contains the Docker volume, database, schema, migration ledger, and
canonical inbound events. It stores message text and identifiers, which are
sensitive operational data. PostgreSQL is not exposed on a host TCP port; the
application connects through an internal Docker network as its limited
application role.

The intended path is:

<code>untrusted webhook → validate/authenticate → canonical event → domain
storage port → parameterized PostgreSQL ledger</code>.

Raw provider payloads do not cross the storage boundary.

## Assets to protect

- Integrity of source code, dependencies, CI, container artifacts, migrations,
  and the source offer for the running version.
- Availability and integrity of the API, migration path, and future connector
  actions.
- Telegram tokens, operator token, webhook secret, PostgreSQL bootstrap
  password, and application database password.
- Canonical message text, sender/conversation/message identifiers, timestamps,
  and the PostgreSQL volume that holds them.
- The Docker host and any backup destination added later.

## Threats and controls

| Threat                                                   | Current control                                                                                                                                                                                                                              | Required before the related feature is production-ready                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malformed or unexpected HTTP input                       | API body limits, command schemas, webhook authentication, and narrow text-update normalization.                                                                                                                                              | Exercise malformed input through the final runtime path; source-specific limits, rate limiting, and observability.                                |
| Spoofed or replayed Telegram webhook                     | A separate webhook secret is checked before normalization. Canonical inbound storage has a primary key on <code>(connection_id, provider_event_id)</code>, so a duplicate provider delivery for one connection does not create a second row. | Owner-authorized live verification, replay/ordering policy, rate limit, load handling, and metrics.                                               |
| SQL injection or query abuse                             | The storage adapter uses fixed schema-qualified SQL and positional parameters. Raw provider payloads are not stored.                                                                                                                         | Adapter integration coverage against production-sized data and ongoing review of every new query.                                                 |
| Excessive database privilege                             | The application role is non-superuser and cannot create databases, roles, replicas, or bypass RLS. PostgreSQL is not published to the host.                                                                                                  | Separate operational roles, least-privilege review for every schema change, audit/access model, and host hardening.                               |
| Secret disclosure                                        | Git ignores <code>.env</code>; documentation avoids secret-bearing commands; Compose uses separate Docker secret files rather than putting database passwords in API environment variables.                                                  | Managed secret store, rotation procedure, log redaction verification, history scanning, and incident response drill.                              |
| Durable message-data disclosure or loss                  | Only canonical fields are stored; raw payloads are excluded; normal Compose shutdown preserves the named volume.                                                                                                                             | Data classification, encryption-at-rest decision, backup encryption, tested restore, retention/deletion workflow, and access review.              |
| Accidental volume deletion                               | The operations guide warns that <code>docker compose down --volumes</code> destroys the named volume and every stored event.                                                                                                                 | Backup/restore tested before operating data that matters.                                                                                         |
| Migration race, mismatch, or unsafe manual schema change | Migration takes a transaction-scoped advisory lock and records applied IDs in <code>schema_migrations</code>; Compose starts the API only after migration succeeds; <code>/ready</code> checks known migrations.                             | Immutable deployment discipline, production-sized migration test, expand/contract design for later large changes, and a documented recovery plan. |
| Container privilege or network exposure                  | API/migration run non-root, drop capabilities, use <code>no-new-privileges</code>, and use an internal database network. API host access is loopback-only.                                                                                   | TLS proxy, resource limits, monitoring, host hardening, and a secret delivery design that permits read-only roots.                                |
| Provider URL or SDK abuse for SSRF/unintended egress     | The Telegram HTTP gateway fixes its destination, rejects redirects, bounds timeout, and validates responses. Webhook URL validation excludes credentials, query, fragment, and non-HTTPS values.                                             | Authorized live-provider check, bounded retry policy, and private-network/DNS controls if configurable destinations appear.                       |
| Source offer does not match network service              | <code>GET /source</code> and response <code>Link</code> expose the configured URL; production validates its HTTPS shape.                                                                                                                     | Operator must publish exact unauthenticated corresponding source for the running version. This is an AGPL implementation aid, not legal advice.   |
| Dependency or CI compromise                              | <code>npm ci</code>, CodeQL, Dependabot, secret scanning, and Private Vulnerability Reporting are configured.                                                                                                                                | Owner branch-protection decision, alert review, SBOM/provenance work, and fresh checks for each release candidate.                                |

## Assumptions and limits

- A compromised Docker host, operator workstation, or GitHub account can expose
  secrets and message data; the repository cannot protect a lost root trust
  platform.
- The bootstrap PostgreSQL credential is a high-trust secret. The application
  role reduces blast radius but does not protect against a compromised Docker
  host.
- The current API/migration root filesystems are not read-only. This is a
  documented compromise imposed by the selected Compose environment-secret
  mechanism, not a completed hardening control.
- No backup, restore drill, retention/deletion flow, password rotation, or
  encryption-at-rest guarantee exists.
- A liveness response does not prove database availability; only
  <code>/ready</code> checks the expected migration.
- A green test, synthetic Docker proof, historical CI, or webhook
  registration does not prove an Internet-facing deployment is safe.
- No real Telegram Bot token, authenticated Bot API request, or test-bot flow
  has occurred. The unauthenticated reachability probe does not establish
  provider compatibility.

## Review trigger

Update this model before a real Telegram test, public webhook/TLS exposure,
backup or retention work, secret rotation, new database access path, queue or
outbox, login/RBAC, AI feature, or production deployment.
