# Phase 0–3b threat model

**Review date:** 2026-08-13

**Status:** GitHub CI and CodeQL succeeded for Phase 0 commit <code>8b80c3b</code>,
Phase 1a candidate <code>7141949</code>, Phase 2a candidate <code>f106bb8</code>,
Phase 2b candidate <code>4d5a9c9</code>, Phase 2c candidate
<code>8352b51</code>, and Phase 3a Zalo OA commit <code>b930d29</code>. The
current Phase 3b Facebook Page source needs its own final local and GitHub
verification. No live Telegram, Zalo, Facebook, public TLS, or production flow
has been used.

## Facts before plans

| Present in the Phase 3b source                                                                                                                                                                                                                                                           | Verified or historical evidence                                                                                                                                                                                                                     | Absent or planned only                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A small HTTP API with liveness/readiness routes, source offer, official Telegram Bot boundary, official Zalo OA inbound text, official Facebook Page inbound text, canonical inbound-event readers, and token-bound multi-connection wiring.                                             | Phase 3a final local checks, independent review, synthetic Compose proof, GitHub CI, and CodeQL passed for `b930d29`. Current Phase 3b has direct route/connector/config/storage tests only until its own frozen candidate checks run.              | Fresh Phase 3b local/GitHub checks, live provider TLS flows, and production deployment.                                             |
| PostgreSQL 18.4 on an internal Compose network; dedicated database/schema; non-superuser application role; forward migration ledger; connection registry; and a `NOT VALID` event foreign key. Zalo OA and Facebook Page rows require non-secret SHA-256 provider identity fingerprints. | Phase 3a Compose proof verified five migrations, registry, role boundary, and two Zalo configurations. The Phase 3b smoke source expands the proof to six migrations and two Facebook Pages but remains unverified until final candidate execution. | Backups, restores, retention/deletion, password rotation, encryption-at-rest assurance, capacity policy, and production monitoring. |
| Runtime multi-connection JSON is parsed only from an absolute secret file. It accepts strict `telegram_bot`, `zalo_oa`, and `facebook_page` entries. Compose injects unpadded base64url as a secret file, not an API environment value.                                                  | Configuration loader tests use synthetic documents and reject malformed/duplicate/unsafe input without leaking content. Facebook configuration requires Page uniqueness and identical App credentials inside one App.                               | Managed secret store, rotation procedure, host hardening, and audit logging.                                                        |
| Telegram dynamic routes, Zalo's fixed route, and Facebook's fixed GET/POST route resolve configured accounts internally; operator bearer tokens resolve one account internally; cursors bind that connection. Zalo checks raw JSON hashing; Facebook checks raw Buffer HMAC.             | Route tests cover bearer scoping, wrong-secret/unknown-identity equivalence, raw-byte signature mismatch, Page batch isolation, Meta challenge handling, supported/unsupported event handling, and cursor rejection with synthetic features.        | User login, organization/RBAC model, rate limit, audit trail, public connection administration, and provider timing/load evidence.  |

Do not treat a source fact, historical CI result, or synthetic proof as a
production claim.

## Trust zones and data flow

### Zone A — external and untrusted

Every HTTP request, including Telegram, Zalo OA, and Facebook Page webhook
payloads, message text, authentication headers, issue/PR content, and
user-provided data is untrusted. It must be validated at the boundary and must
not become SQL, a shell command, an outbound URL, or HTML without appropriate
controls.

### Zone B — operator-controlled application runtime

This zone contains reviewed code, API/migration containers, runtime connection
configuration, connector ports, and provider credentials. The JSON document is
a secret because it contains inline Bot, OA, Facebook App, operator, and
webhook values. It is trusted only to the extent that the operator controls the
host and secret source. Provider data remains untrusted after it crosses the
boundary.

### Zone C — durable PostgreSQL ledger

This zone contains the Docker volume, database, schema, migration ledger,
connection registry, and canonical inbound events. The registry contains opaque
internal connection ID, connector metadata, and — only for Zalo OA and Facebook
Page — domain-separated SHA-256 account-binding fingerprints. It contains
neither raw provider identifiers nor credentials. The inbound ledger contains
message text and identifiers, which are sensitive operational data. PostgreSQL
is not exposed on a host TCP port; the application connects through an internal
network as its limited application role.

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
- Telegram Bot tokens, Zalo OA secret keys, Facebook App secrets and verify
  tokens, per-connection operator tokens, webhook signatures, PostgreSQL
  bootstrap password, application database password, and runtime configuration
  document.
- Canonical message text, sender/conversation/message identifiers, timestamps,
  registry metadata, and the PostgreSQL volume that holds them.
- The Docker host and any backup destination added later.

## Threats and controls

| Threat                                                   | Current control                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Required before the related feature is production-ready                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Malformed or unexpected HTTP input                       | API body limits, command schemas, authenticated webhook boundaries, narrow text normalization, bounded queries/cursors, strict connection-document parsing, Zalo raw UTF-8 JSON verification, and Facebook raw Buffer HMAC verification before normalization.                                                                                                                                                                                                             | Final runtime testing, provider-specific limits, rate limiting, and observability.                                                                                             |
| Cross-account webhook or operator access                 | Telegram resolves a dynamic account then checks its secret. Zalo resolves `(appId, oaId)` then checks that OA secret. Facebook resolves every Page ID in a batch to exactly one App then checks its App secret. Unknown identity/path and wrong secret/signature are nondiagnostic `401`. Unique bearer selects one server-side connection; no operator route accepts a connection ID; cursors bind the resolved connection.                                              | Real authorization/RBAC, audit logging, rate limiting, token rotation, and production load testing.                                                                            |
| Unregistered or drifting connection identity             | Startup registers manifest-derived immutable metadata; PostgreSQL blocks new event rows without a registry row; changed metadata for an existing ID fails registration. Zalo OA and Facebook Page registrations require domain-separated SHA-256 fingerprints of configured provider pairs, and the first identity binding is refused when pre-registry history already uses that ID. Telegram still lacks an equivalent configured non-secret provider-account identity. | Historical-row reconciliation and a deliberate later foreign-key validation migration; a future Telegram account-identity design if a suitable non-secret value is configured. |
| SQL injection or query abuse                             | Storage uses fixed schema-qualified SQL and positional parameters. Read routes bound page size, reject malformed/cross-account cursors before storage access, and exclude raw provider payloads.                                                                                                                                                                                                                                                                          | Adapter integration coverage against production-sized data and review of each new query.                                                                                       |
| Secret disclosure                                        | Git ignores local configuration; Compose mounts unpadded base64url configuration only as a `10001:10001 0400` secret file, avoiding `.env` expansion of credential `$` characters; docs avoid credential-bearing commands; generic errors omit config details. Raw Zalo and Facebook payloads/signatures are not persisted.                                                                                                                                               | Managed secret store, rotation, host/process inspection hardening, log-redaction verification, history scanning, and incident drill.                                           |
| Durable message-data disclosure or loss                  | Only canonical fields are stored; raw payloads and credentials are excluded; normal Compose shutdown preserves the named volume.                                                                                                                                                                                                                                                                                                                                          | Data classification, encryption-at-rest decision, backup encryption, tested restore, retention/deletion workflow, and access review.                                           |
| Migration race, mismatch, or unsafe manual schema change | Migration and registry use transaction-scoped advisory locks; immutable checksums record applied IDs; Compose starts API only after migration; `/ready` checks known migrations.                                                                                                                                                                                                                                                                                          | Production-sized migration test, expand/contract design for later large tables, recovery plan, and foreign-key validation procedure.                                           |
| Container privilege or network exposure                  | API/migration are non-root, drop capabilities, use `no-new-privileges`, and use an internal data network. API host access is loopback-only.                                                                                                                                                                                                                                                                                                                               | TLS proxy, resource limits, monitoring, host hardening, and a secret-delivery design that permits read-only roots.                                                             |
| Provider URL or SDK abuse for SSRF/unintended egress     | Telegram gateway fixes its destination, rejects redirects, bounds timeout, and validates responses. Telegram, Zalo, and Facebook webhook URL validation excludes credentials, query, fragment, private hostnames, and non-HTTPS values. Zalo and Facebook inbound code make no provider request.                                                                                                                                                                          | Authorized live-provider check, bounded retry policy, and private-network/DNS controls if configurable destinations appear.                                                    |
| Source offer does not match network service              | `GET /source` and response `Link` expose the configured URL; production validates its HTTPS shape.                                                                                                                                                                                                                                                                                                                                                                        | Operator must publish exact unauthenticated corresponding source for the version running. This is an AGPL implementation aid, not legal advice.                                |
| Dependency, CI, or repository-history compromise         | `npm ci`, CodeQL, Dependabot, secret scanning, Private Vulnerability Reporting, and main-branch force-push/deletion protection are configured.                                                                                                                                                                                                                                                                                                                            | Fresh checks for each candidate, alert review, SBOM/provenance work, and reassessment of PR/status requirements before collaboration expands.                                  |

## Assumptions and limits

- A compromised Docker host, operator workstation, deployment secret source, or
  GitHub account can expose secrets and message data; the repository cannot
  protect a lost root trust platform.
- The runtime JSON document deliberately holds inline credentials to support an
  arbitrary number of connections in one mounted secret. Base64url is not
  encryption; neither representation is less sensitive merely because its file
  path is protected.
- The current API/migration root filesystems are not read-only. This is a
  documented compromise imposed by the selected Compose environment-secret
  mechanism, not a completed hardening control.
- `NOT VALID` means PostgreSQL enforces the new foreign key for new rows but
  does not assert that every historical Phase 2a row already has a registry
  parent.
- Zalo OA and Facebook Page fingerprints protect configured provider-pair
  reuse after history exists without retaining raw account IDs. They do not make
  the same claim for Telegram.
- No backup, restore drill, retention/deletion flow, password/token rotation,
  or encryption-at-rest guarantee exists.
- A liveness response does not prove database availability; only `/ready`
  checks expected migrations.
- A green test, synthetic Docker proof, historical CI, or webhook registration
  does not prove an Internet-facing deployment is safe.
- No real Telegram Bot token, authenticated Bot API request, Zalo OA secret,
  Meta App secret, OAuth/access token, webhook registration, or customer test
  flow has occurred. Historical reachability and synthetic tests do not
  establish provider compatibility.

## Review trigger

Update this model before a real Telegram, Zalo OA, or Facebook Page test, public
webhook/TLS exposure, backup or retention work, secret rotation, foreign-key
validation, new database access path, queue/outbox, login/RBAC, AI feature,
production deployment, or a branch-protection change.
