# Phase 0–3a threat model

**Review date:** 2026-08-13

**Status:** GitHub CI and CodeQL succeeded for the Phase 0 commit
<code>8b80c3b</code>, Phase 1a candidate <code>7141949</code>, Phase 2a
candidate <code>f106bb8</code>, and exact Phase 2b candidate
<code>4d5a9c9</code>. Phase 2c GitHub CI and CodeQL succeeded for exact commit
<code>8352b51</code>. The current Phase 3a Zalo OA source needs its own final
local and GitHub verification; no live Zalo account or public TLS flow has been
used.

## Facts before plans

| Present in the Phase 3a source                                                                                                                                                                                                                                                | Verified or historical evidence                                                                                                                                                                                                                                                                    | Absent or planned only                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A small HTTP API with liveness/readiness routes, source offer, official Telegram Bot boundary, official Zalo OA inbound-text boundary, canonical inbound-event reader, and token-bound multi-connection wiring.                                                               | Phase 2c local gates, independent review, two-account synthetic Compose proof, and GitHub CI/CodeQL passed at <code>8352b51</code>. Current Phase 3a source has route and connector tests only until its own final candidate checks run. No real provider credential or customer content was used. | Fresh Phase 3a local/GitHub checks, real Telegram/Zalo TLS flows, and production deployment.                                        |
| PostgreSQL 18.4 on an internal Compose network; dedicated database/schema; non-superuser application role; forward migration ledger; connection registry; and a <code>NOT VALID</code> event foreign key. Zalo rows require a non-secret SHA-256 App/OA identity fingerprint. | The Phase 2c synthetic Compose proof verified the migration path, registry, and role boundary with two Telegram accounts. The Phase 3a smoke source expands that proof to synthetic Zalo OA accounts and fingerprint presence but remains unverified until final candidate execution.              | Backups, restores, retention/deletion, password rotation, encryption-at-rest assurance, capacity policy, and production monitoring. |
| Runtime multi-connection JSON is parsed only from an absolute secret file. It accepts strict `telegram_bot` and `zalo_oa` entries. Compose injects unpadded base64url as a secret file, not an API environment value.                                                         | Configuration loader tests use synthetic documents and reject malformed/duplicate/unsafe input without leaking content. Zalo configuration prevents duplicate `(appId, oaId)` pairs but makes no claim about secret sharing across OA entries.                                                     | Managed secret store, rotation procedure, host hardening, and audit logging.                                                        |
| Telegram dynamic routes and Zalo's fixed route resolve configured accounts internally; operator bearer tokens resolve one account internally; cursors bind that connection. Zalo signature covers original raw JSON bytes.                                                    | Route tests cover bearer scoping, wrong-secret/unknown-identity equivalence, raw-byte signature mismatch, supported/unsupported event handling, and cursor rejection with synthetic features.                                                                                                      | User login, organization/RBAC model, rate limit, audit trail, public connection administration, and provider timing/load evidence.  |

Do not treat a source fact, historical CI result, or synthetic proof as a
production claim.

## Trust zones and data flow

### Zone A — external and untrusted

Every HTTP request, including Telegram and Zalo OA webhook payloads, message text,
authentication headers, issue/PR content, and user-provided data is untrusted.
It must be validated at the boundary and must not become SQL, a shell command,
an outbound URL, or HTML without appropriate controls.

### Zone B — operator-controlled application runtime

This zone contains reviewed code, API/migration containers, runtime connection
configuration, connector ports, and provider credentials. The JSON document is
a secret because it contains inline Bot, OA, operator, and webhook values. It is
trusted only to the extent that the operator controls the host and secret
source. Provider data remains untrusted after it crosses the boundary.

### Zone C — durable PostgreSQL ledger

This zone contains the Docker volume, database, schema, migration ledger,
connection registry, and canonical inbound events. The registry contains opaque
internal connection ID plus connector metadata and, for Zalo OA only, a
domain-separated SHA-256 fingerprint of `(appId, oaId)`. It contains neither
the raw provider identity nor a credential. The inbound ledger
contains message text and identifiers, which are sensitive operational data.
PostgreSQL is not exposed on a host TCP port; the application connects through
an internal network as its limited application role.

The intended path is:

<code>untrusted webhook → resolve configured connection → authenticate →
normalize canonical event → registered connection check → domain storage port
→ parameterized PostgreSQL ledger</code>.

Raw provider payloads and runtime credentials do not cross the storage
boundary.

## Assets to protect

- Integrity of source code, dependencies, CI, container artifacts, migrations,
  branch rules, and the source offer for the running version.
- Availability and integrity of the API, migration path, connection registry,
  and future connector actions.
- Telegram Bot tokens, Zalo OA secret keys, per-connection operator tokens,
  webhook signatures,
  PostgreSQL bootstrap password, application database password, and runtime
  configuration document.
- Canonical message text, sender/conversation/message identifiers, timestamps,
  registry metadata, and the PostgreSQL volume that holds them.
- The Docker host and any backup destination added later.

## Threats and controls

| Threat                                                   | Current control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Required before the related feature is production-ready                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Malformed or unexpected HTTP input                       | API body limits, command schemas, authenticated webhook boundary, narrow text normalization, bounded queries/cursors, strict connection-document parsing, and Zalo raw UTF-8 JSON verification before normalization.                                                                                                                                                                                                                                                                                                  | Final runtime testing, provider-specific limits, rate limiting, and observability.                                                                                             |
| Cross-account webhook or operator access                 | Telegram dynamic webhook path resolves a configured feature then checks its secret. Zalo's fixed route resolves `(appId, oaId)` from a signed body then checks that configured OA secret. Unknown identity/path and wrong secret/signature are nondiagnostic <code>401</code>. Unique bearer token selects one server-side connection; no operator route accepts a connection ID; cursors bind the resolved connection.                                                                                               | Real authorization/RBAC, audit logging, rate limiting, token rotation, and production load testing.                                                                            |
| Unregistered or drifting connection identity             | Startup registers manifest-derived immutable metadata; PostgreSQL blocks new event rows without a registry row; changed metadata for an existing ID fails registration. A Zalo OA registration additionally requires a domain-separated SHA-256 fingerprint of its configured `(appId, oaId)` pair, and an existing Zalo ID cannot change it. The first Zalo fingerprint is refused if pre-registry history already uses that ID. Telegram still lacks an equivalent configured non-secret provider-account identity. | Historical-row reconciliation and a deliberate later foreign-key validation migration; a future Telegram account-identity design if a suitable non-secret value is configured. |
| SQL injection or query abuse                             | Storage uses fixed schema-qualified SQL and positional parameters. Read routes bound page size, reject malformed/cross-account cursors before storage access, and exclude raw provider payloads.                                                                                                                                                                                                                                                                                                                      | Adapter integration coverage against production-sized data and review of each new query.                                                                                       |
| Secret disclosure                                        | Git ignores the recommended direct configuration filename; Compose mounts the unpadded base64url configuration only as a <code>10001:10001 0400</code> secret file, avoiding <code>.env</code> expansion of credential <code>$</code> characters; docs avoid credential-bearing commands; generic errors omit config details. Raw Zalo payloads and signatures are not persisted.                                                                                                                                     | Managed secret store, rotation, host/process inspection hardening, log-redaction verification, history scanning, and incident drill.                                           |
| Durable message-data disclosure or loss                  | Only canonical fields are stored; raw payloads and credentials are excluded; normal Compose shutdown preserves the named volume.                                                                                                                                                                                                                                                                                                                                                                                      | Data classification, encryption-at-rest decision, backup encryption, tested restore, retention/deletion workflow, and access review.                                           |
| Migration race, mismatch, or unsafe manual schema change | Migration and registry use transaction-scoped advisory locks; immutable checksums record applied IDs; Compose starts API only after migration; <code>/ready</code> checks known migrations.                                                                                                                                                                                                                                                                                                                           | Production-sized migration test, expand/contract design for later large tables, recovery plan, and foreign-key validation procedure.                                           |
| Container privilege or network exposure                  | API/migration are non-root, drop capabilities, use <code>no-new-privileges</code>, and use an internal data network. API host access is loopback-only.                                                                                                                                                                                                                                                                                                                                                                | TLS proxy, resource limits, monitoring, host hardening, and a secret-delivery design that permits read-only roots.                                                             |
| Provider URL or SDK abuse for SSRF/unintended egress     | Telegram gateway fixes its destination, rejects redirects, bounds timeout, and validates responses. Telegram and Zalo webhook URL validation excludes credentials, query, fragment, private hostnames, and non-HTTPS values. Phase 3a Zalo inbound code makes no provider request.                                                                                                                                                                                                                                    | Authorized live-provider check, bounded retry policy, and private-network/DNS controls if configurable destinations appear.                                                    |
| Source offer does not match network service              | <code>GET /source</code> and response <code>Link</code> expose the configured URL; production validates its HTTPS shape.                                                                                                                                                                                                                                                                                                                                                                                              | Operator must publish exact unauthenticated corresponding source for the version running. This is an AGPL implementation aid, not legal advice.                                |
| Dependency, CI, or repository-history compromise         | <code>npm ci</code>, CodeQL, Dependabot, secret scanning, Private Vulnerability Reporting, and main-branch force-push/deletion protection are configured.                                                                                                                                                                                                                                                                                                                                                             | Fresh checks for each candidate, alert review, SBOM/provenance work, and reassessment of PR/status requirements before collaboration expands.                                  |

## Assumptions and limits

- A compromised Docker host, operator workstation, deployment secret source, or
  GitHub account can expose secrets and message data; the repository cannot
  protect a lost root trust platform.
- The runtime JSON document deliberately holds inline credentials to support an
  arbitrary number of connections in one mounted secret. Compose stores its
  unpadded base64url encoding so <code>.env</code> does not expand credential
  <code>$</code> characters. Base64url is not encryption; neither representation
  is less sensitive merely because its file path is protected.
- The current API/migration root filesystems are not read-only. This is a
  documented compromise imposed by the selected Compose environment-secret
  mechanism, not a completed hardening control.
- <code>NOT VALID</code> means PostgreSQL enforces the new foreign key for new
  rows but does not assert that every historical Phase 2a row already has a
  registry parent.
- Zalo OA's opaque provider-identity fingerprint binds a configured
  `(appId, oaId)` pair without retaining the raw pair. It protects Zalo
  connection-ID reuse after history exists; it does not make the same claim for
  Telegram, whose configuration currently lacks an equivalent non-secret Bot
  account identity.
- No backup, restore drill, retention/deletion flow, password/token rotation,
  or encryption-at-rest guarantee exists.
- A liveness response does not prove database availability; only
  <code>/ready</code> checks expected migrations.
- A green test, synthetic Docker proof, historical CI, or webhook registration
  does not prove an Internet-facing deployment is safe.
- No real Telegram Bot token, authenticated Bot API request, Zalo OA secret,
  OAuth/access token, webhook registration, or test-account flow has occurred.
  Historical reachability and synthetic tests do not establish provider
  compatibility.

## Review trigger

Update this model before a real Telegram or Zalo OA test, public webhook/TLS exposure,
backup or retention work, secret rotation, foreign-key validation, new database
access path, queue/outbox, login/RBAC, AI feature, production deployment, or
a branch-protection change.
