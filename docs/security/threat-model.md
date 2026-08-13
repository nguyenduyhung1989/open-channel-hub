# Phase 0–4a threat model

**Review date:** 2026-08-13

**Status:** GitHub CI and CodeQL succeeded for Phase 0 commit <code>8b80c3b</code>,
Phase 1a candidate <code>7141949</code>, Phase 2a candidate <code>f106bb8</code>,
Phase 2b candidate <code>4d5a9c9</code>, Phase 2c candidate
<code>8352b51</code>, Phase 3a Zalo OA commit <code>b930d29</code>, and Phase
3b Facebook Page commit <code>c933102</code>, and Phase 3c WhatsApp Business
commit <code>fd802cb</code>. Phase 3c also passed final local checks,
independent review, and a synthetic Compose proof. The current Phase 4a
configured-inbox source needs its own final local and GitHub verification. No
live Telegram, Zalo, Meta, public TLS, or production flow has been used.

## Facts before plans

| Present in the Phase 4a source                                                                                                                                                                                                                                                                                                                           | Verified or historical evidence                                                                                                                                                                                                                                                                  | Absent or planned only                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| A small HTTP API with liveness/readiness routes, source offer, official Telegram Bot/Zalo OA/Facebook Page/WhatsApp Business inbound text boundaries, account-scoped canonical readers, and an optional configured aggregate inbox reader.                                                                                                               | Phase 3a final local checks, independent review, synthetic Compose proof, GitHub CI, and CodeQL passed for `b930d29`; the same evidence passed for Phase 3b `c933102` and Phase 3c `fd802cb`. Current Phase 4a has direct route/config/storage tests only until its frozen candidate checks run. | Fresh Phase 4a local/GitHub checks, live provider TLS flows, and production deployment.                                             |
| PostgreSQL 18.4 on an internal Compose network; dedicated database/schema; non-superuser application role; forward migration ledger; connection registry; `NOT VALID` event foreign key; and a parameterized multi-connection feed reader. Zalo OA, Facebook Page, and WhatsApp Business rows require non-secret SHA-256 provider identity fingerprints. | The Phase 3c Compose proof verified seven migrations, registry, role boundary, two business phones, and one shared Facebook/WhatsApp App callback. The Phase 4a smoke source adds separate multi-account inbox scopes but remains unverified until final candidate execution.                    | Backups, restores, retention/deletion, password rotation, encryption-at-rest assurance, capacity policy, and production monitoring. |
| Runtime multi-connection JSON is parsed only from an absolute secret file. It accepts strict `telegram_bot`, `zalo_oa`, `facebook_page`, and `whatsapp_business` entries plus optional `inboxes` with a unique token and explicit configured connection allow-list. Compose injects unpadded base64url as a secret file, not an API environment value.   | Configuration loader tests use synthetic documents and reject malformed/duplicate/unsafe input without leaking content. A Meta App used by both Facebook Page and WhatsApp requires matching credentials and one common declared `/v1/webhooks/meta` callback.                                   | Managed secret store, rotation procedure, host hardening, and audit logging.                                                        |
| Provider webhook routes resolve configured accounts internally; account bearers resolve one account; inbox bearers resolve one explicit connection set; and cursors bind their resolved scope. Zalo checks raw JSON hashing; Meta checks raw Buffer HMAC.                                                                                                | Route tests cover bearer scoping, wrong-secret/unknown-identity equivalence, raw-byte signature mismatch, Page/WABA batch isolation, Meta challenge handling, shared callback dispatch, inbox bearer/cursor scope rejection, and canonical-only output with synthetic features.                  | User login, organization/RBAC model, rate limit, audit trail, public connection administration, and provider timing/load evidence.  |

Do not treat a source fact, historical CI result, or synthetic proof as a
production claim.

## Trust zones and data flow

### Zone A — external and untrusted

Every HTTP request, including Telegram, Zalo OA, Facebook Page, and WhatsApp
Business webhook payloads, message text, authentication headers, issue/PR
content, and user-provided data is untrusted. It must be validated at the
boundary and must not become SQL, a shell command, an outbound URL, or HTML
without appropriate controls.

### Zone B — operator-controlled application runtime

This zone contains reviewed code, API/migration containers, runtime connection
configuration, connector ports, inbox principals, and provider credentials. The
JSON document is a secret because it contains inline Bot, OA, Meta App,
account-operator, inbox-bearer, and webhook values. It is trusted only to the
extent that the operator controls the host and secret source. Provider data
remains untrusted after it crosses the boundary.

### Zone C — durable PostgreSQL ledger

This zone contains the Docker volume, database, schema, migration ledger,
connection registry, and canonical inbound events. The registry contains opaque
internal connection ID, connector metadata, and — only for Zalo OA, Facebook
Page, and WhatsApp Business — domain-separated SHA-256 account-binding
fingerprints. It contains neither raw provider identifiers nor credentials. The
inbound ledger contains message text and identifiers, which are sensitive
operational data. PostgreSQL is not exposed on a host TCP port; the application
connects through an internal network as its limited application role.

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
- Telegram Bot tokens, Zalo OA secret keys, Meta App secrets and verify tokens,
  per-connection operator tokens, configured inbox bearer tokens, webhook
  signatures, PostgreSQL bootstrap password, application database password,
  and runtime configuration document.
- Canonical message text, sender/conversation/message identifiers, timestamps,
  registry metadata, and the PostgreSQL volume that holds them.
- The Docker host and any backup destination added later.

## Threats and controls

| Threat                                                   | Current control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Required before the related feature is production-ready                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Malformed or unexpected HTTP input                       | API body limits, command schemas, authenticated webhook boundaries, narrow text normalization, bounded queries/cursors, strict connection-document parsing, Zalo raw UTF-8 JSON verification, and Meta raw Buffer HMAC verification before normalization.                                                                                                                                                                                                                                                       | Final runtime testing, provider-specific limits, rate limiting, and observability.                                                                                             |
| Cross-account webhook or operator access                 | Telegram resolves a dynamic account then checks its secret. Zalo resolves `(appId, oaId)` then checks that OA secret. Facebook resolves every Page ID and WhatsApp resolves every WABA ID to exactly one App then checks its App secret. The shared Meta callback selects exactly one product/App. Unknown identity/path and wrong secret/signature are nondiagnostic `401`. Unique bearer selects one server-side connection; no operator route accepts a connection ID; cursors bind the resolved connection. | Real authorization/RBAC, audit logging, rate limiting, token rotation, and production load testing.                                                                            |
| Inbox scope escalation or cursor replay                  | A distinct configured inbox bearer resolves one explicit immutable-at-runtime connection set before query parsing or storage access. The route accepts no caller-selected inbox, connection, or scope. The opaque cursor carries the inbox ID plus a SHA-256 binding of the canonical connection set; another inbox or changed scope receives generic `400`. Inbox tokens cannot collide with provider, webhook, or per-account operator credentials.                                                           | User/organization/RBAC design, audit trail, managed rotation, rate limiting, and production authorization testing.                                                             |
| Unregistered or drifting connection identity             | Startup registers manifest-derived immutable metadata; PostgreSQL blocks new event rows without a registry row; changed metadata for an existing ID fails registration. Zalo OA, Facebook Page, and WhatsApp Business registrations require domain-separated SHA-256 fingerprints of configured provider identities, and the first identity binding is refused when pre-registry history already uses that ID. Telegram still lacks an equivalent configured non-secret provider-account identity.              | Historical-row reconciliation and a deliberate later foreign-key validation migration; a future Telegram account-identity design if a suitable non-secret value is configured. |
| SQL injection or query abuse                             | Storage uses fixed schema-qualified SQL and positional parameters. Read routes bound page size, reject malformed/cross-account/cross-inbox cursors before storage access, and exclude raw provider payloads.                                                                                                                                                                                                                                                                                                    | Adapter integration coverage against production-sized data and review of each new query.                                                                                       |
| Secret disclosure                                        | Git ignores local configuration; Compose mounts unpadded base64url configuration only as a `10001:10001 0400` secret file, avoiding `.env` expansion of credential `$` characters; docs avoid credential-bearing commands; generic errors omit config details. Inbox bearers, raw Zalo/Meta payloads, and signatures are not persisted.                                                                                                                                                                         | Managed secret store, rotation, host/process inspection hardening, log-redaction verification, history scanning, and incident drill.                                           |
| Durable message-data disclosure or loss                  | Only canonical fields are stored; raw payloads and credentials are excluded; normal Compose shutdown preserves the named volume.                                                                                                                                                                                                                                                                                                                                                                                | Data classification, encryption-at-rest decision, backup encryption, tested restore, retention/deletion workflow, and access review.                                           |
| Migration race, mismatch, or unsafe manual schema change | Migration and registry use transaction-scoped advisory locks; immutable checksums record applied IDs; Compose starts API only after migration; `/ready` checks known migrations.                                                                                                                                                                                                                                                                                                                                | Production-sized migration test, expand/contract design for later large tables, recovery plan, and foreign-key validation procedure.                                           |
| Container privilege or network exposure                  | API/migration are non-root, drop capabilities, use `no-new-privileges`, and use an internal data network. API host access is loopback-only.                                                                                                                                                                                                                                                                                                                                                                     | TLS proxy, resource limits, monitoring, host hardening, and a secret-delivery design that permits read-only roots.                                                             |
| Provider URL or SDK abuse for SSRF/unintended egress     | Telegram gateway fixes its destination, rejects redirects, bounds timeout, and validates responses. Telegram, Zalo, Facebook Page, and WhatsApp Business webhook URL validation excludes credentials, query, fragment, private hostnames, and non-HTTPS values. Zalo and Meta inbound code make no provider request.                                                                                                                                                                                            | Authorized live-provider check, bounded retry policy, and private-network/DNS controls if configurable destinations appear.                                                    |
| Source offer does not match network service              | `GET /source` and response `Link` expose the configured URL; production validates its HTTPS shape.                                                                                                                                                                                                                                                                                                                                                                                                              | Operator must publish exact unauthenticated corresponding source for the version running. This is an AGPL implementation aid, not legal advice.                                |
| Dependency, CI, or repository-history compromise         | `npm ci`, CodeQL, Dependabot, secret scanning, Private Vulnerability Reporting, and main-branch force-push/deletion protection are configured.                                                                                                                                                                                                                                                                                                                                                                  | Fresh checks for each candidate, alert review, SBOM/provenance work, and reassessment of PR/status requirements before collaboration expands.                                  |

## Assumptions and limits

- A compromised Docker host, operator workstation, deployment secret source, or
  GitHub account can expose secrets and message data; the repository cannot
  protect a lost root trust platform.
- The runtime JSON document deliberately holds inline connection and configured
  inbox credentials to support an arbitrary number of bounded scopes in one
  mounted secret. Base64url is not encryption; neither representation is less
  sensitive merely because its file path is protected.
- The current API/migration root filesystems are not read-only. This is a
  documented compromise imposed by the selected Compose environment-secret
  mechanism, not a completed hardening control.
- `NOT VALID` means PostgreSQL enforces the new foreign key for new rows but
  does not assert that every historical Phase 2a row already has a registry
  parent.
- Zalo OA, Facebook Page, and WhatsApp Business fingerprints protect configured
  provider-identity reuse after history exists without retaining raw account
  IDs. They do not make the same claim for Telegram.
- No backup, restore drill, retention/deletion flow, password/token rotation,
  encryption-at-rest guarantee, user/organization/RBAC model, or audit trail
  exists. A configured inbox bearer is not a substitute for those controls.
- A liveness response does not prove database availability; only `/ready`
  checks expected migrations.
- A green test, synthetic Docker proof, historical CI, or webhook registration
  does not prove an Internet-facing deployment is safe.
- No real Telegram Bot token, authenticated Bot API request, Zalo OA secret,
  Meta App secret, OAuth/access token, webhook registration, or customer test
  flow has occurred. Historical reachability and synthetic tests do not
  establish provider compatibility.

## Review trigger

Update this model before a real Telegram, Zalo OA, Facebook Page, or WhatsApp
Business test, public webhook/TLS exposure, inbox-scope expansion or
credential-rotation change, backup or retention work, foreign-key validation,
new database access path, queue/outbox, login/RBAC, AI feature, production
deployment, or a branch-protection change.
