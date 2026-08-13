# Phase 0–4d threat model

**Review date:** 2026-08-13

**Status:** GitHub CI and CodeQL succeeded for Phase 0 commit <code>8b80c3b</code>,
Phase 1a candidate <code>7141949</code>, Phase 2a candidate <code>f106bb8</code>,
Phase 2b candidate <code>4d5a9c9</code>, Phase 2c candidate
<code>8352b51</code>, Phase 3a Zalo OA commit <code>b930d29</code>, and Phase
3b Facebook Page commit <code>c933102</code>, and Phase 3c WhatsApp Business
commit <code>fd802cb</code>, and Phase 4a configured inbox commit
<code>705db0a</code>, and Phase 4b dashboard commit <code>7672be9</code>.
Phase 4b also passed final local checks, independent review, and a synthetic
Compose proof. Phase 4c's source-bound reply-command ledger and Phase 4d's
scoped queued-command history are implementation candidates; their final local
verification, synthetic Compose proof, independent security review, and fresh
GitHub CI/CodeQL evidence remain pending. No live Telegram, Zalo, Meta, public
TLS, provider send, or production flow has been used.

## Facts before plans

| Present in the source                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Verified or historical evidence                                                                                                                                                                                                                                                                                                            | Absent or planned only                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A small HTTP API with liveness/readiness routes, source offer, official Telegram Bot/Zalo OA/Facebook Page/WhatsApp Business inbound text boundaries, account-scoped canonical readers, optional configured aggregate inbox reader, optional server-rendered read-only operator dashboard, a source-bound reply-intent route, and a scoped queued-command history route.                                                                                                 | Final local checks, independent review, synthetic Compose proof, GitHub CI, and CodeQL passed for Phase 3a `b930d29`, Phase 3b `c933102`, Phase 3c `fd802cb`, Phase 4a `705db0a`, and Phase 4b `7672be9`. Phase 4c–4d verification is pending.                                                                                             | Live provider TLS flows, provider dispatch, and production deployment.                                                                                                       |
| PostgreSQL 18.4 on an internal Compose network; dedicated database/schema; non-superuser application role; forward migration ledger; connection registry; `NOT VALID` event foreign key; parameterized multi-connection feed and queued-command-history readers; optional HMAC-only dashboard-session store; and an immutable source-bound reply-command table.                                                                                                          | The Phase 4b Compose proof verified eight migrations, registry, role boundary, two business phones, one shared Facebook/WhatsApp App callback, and separate multi-account inbox scopes. Phase 4c's ninth-migration and Phase 4d history proofs are pending.                                                                                | Backups, restores, retention/deletion, password rotation, encryption-at-rest assurance, capacity policy, dispatch/receipt semantics, and production monitoring.              |
| Runtime multi-connection JSON is parsed only from an absolute secret file. It accepts strict `telegram_bot`, `zalo_oa`, `facebook_page`, and `whatsapp_business` entries, optional `inboxes`, and optional `dashboard` principals with an exact public HTTPS origin and exact-profile Argon2id password hashes.                                                                                                                                                          | Configuration loader tests use synthetic documents and reject malformed/duplicate/unsafe input without leaking content. A Meta App used by both Facebook Page and WhatsApp requires matching credentials and one common declared `/v1/webhooks/meta` callback.                                                                             | Managed secret store, rotation procedure, host hardening, and audit logging.                                                                                                 |
| Provider webhook routes resolve configured accounts internally; account bearers resolve one account; inbox bearers resolve one explicit connection set; dashboard sessions resolve one configured principal and then its configured inboxes. A configured inbox bearer can record a source-bound reply intent and read its queued history; the target remains private and history exposes recorded text only. Zalo checks raw JSON hashing; Meta checks raw Buffer HMAC. | Route tests cover bearer scoping, wrong-secret/unknown-identity equivalence, raw-byte signature mismatch, Page/WABA batch isolation, Meta challenge handling, shared callback dispatch, inbox bearer/cursor scope rejection, canonical-only output, dashboard controls, and source-bound command/history controls with synthetic features. | Full user login/organization/RBAC model, distributed rate limit, audit trail, public connection administration, provider dispatch policy, and provider timing/load evidence. |

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
configuration, connector ports, inbox principals, dashboard principals, and
provider credentials. The JSON document is a secret because it contains inline
Bot, OA, Meta App, account-operator, inbox-bearer, password-hash, session-key,
pepper, and webhook values. It is trusted only to the extent that the operator
controls the host and secret source. Provider data and inbox-command text remain
untrusted after they cross the boundary. Possession of an inbox bearer grants
the bounded ability to record an intent and read recorded text for that fixed
scope; it does not grant a provider send capability.

### Zone C — durable PostgreSQL ledger

This zone contains the Docker volume, database, schema, migration ledger,
connection registry, dashboard session table, source-bound reply-command table,
and canonical inbound events. The
registry contains opaque internal connection ID, connector metadata, and — only
for Zalo OA, Facebook Page, and WhatsApp Business — domain-separated SHA-256
account-binding fingerprints. The dashboard-session table contains only
domain-separated HMACs of random browser token values, local principal ID, and
lifecycle timestamps. Neither table contains raw provider identifiers,
credentials, raw browser tokens, or password hashes. The reply-command table
contains outgoing text and private target/source metadata derived from an
inbound event; it has no raw payload, provider credential, attempt, receipt, or
delivery state. Phase 4d reads queued rows through a parameterized projection
that returns command/source IDs, recorded text, state, and creation time, but
never private target/source fields or the client operation ID. The inbound
ledger and command table contain message text and identifiers, which are
sensitive operational data. PostgreSQL is not exposed on a host TCP port; the
application connects through an internal network as its limited application
role.

The intended path is:

<code>untrusted webhook → resolve configured connection → authenticate →
normalize canonical event → registered connection check → domain storage port
→ parameterized PostgreSQL ledger</code>.

The current reply-intent path is:

<code>inbox bearer → resolve fixed inbox scope → authenticate before body parse
→ validate source reference/text → source-bound storage port → parameterized
PostgreSQL command ledger</code>.

The current queued-command history path is:

<code>inbox bearer → resolve fixed inbox scope → authenticate before application
query/cursor validation → validate bounded limit and scope-bound cursor →
parameterized PostgreSQL queued-history reader → safe command projection</code>.

Raw provider payloads, runtime credentials, and caller-chosen recipient IDs do
not cross the storage boundary.

## Assets to protect

- Integrity of source code, dependencies, CI, container artifacts, migrations,
  branch rules, and the source offer for the running version.
- Availability and integrity of the API, migration path, connection registry,
  and future connector actions.
- Telegram Bot tokens, Zalo OA secret keys, Meta App secrets and verify tokens,
  per-connection operator tokens, configured inbox bearer tokens, dashboard
  password hashes, cookie signing keys, session pepper, webhook signatures,
  PostgreSQL bootstrap password, application database password, and runtime
  configuration document.
- Dashboard session integrity, anti-forgery values, exact public origin, and
  read-only principal-to-inbox authorization boundary.
- Canonical inbound and outgoing message text, sender/conversation/message
  identifiers, private reply targets, command state/operation identifiers,
  timestamps, registry metadata, the inbox bearer that can read scoped command
  text, and the PostgreSQL volume that holds them.
- The Docker host and any backup destination added later.

## Threats and controls

| Threat                                                                          | Current control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Required before the related feature is production-ready                                                                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malformed or unexpected HTTP input                                              | API body limits, strict command schemas, authenticated webhook boundaries, narrow text normalization, bounded queries/cursors, strict connection-document parsing, Zalo raw UTF-8 JSON verification, and Meta raw Buffer HMAC verification before normalization. The reply-command route resolves an inbox bearer before body parsing and rejects extra/caller-chosen target fields. The history route authenticates before application query/cursor validation, accepts only `limit` 1–100 plus an opaque cursor, and rejects malformed input generically.                                                                                                                                                                                                                          | Final runtime testing, provider-specific limits, rate limiting, and observability.                                                                                                 |
| Cross-account webhook or operator access                                        | Telegram resolves a dynamic account then checks its secret. Zalo resolves `(appId, oaId)` then checks that OA secret. Facebook resolves every Page ID and WhatsApp resolves every WABA ID to exactly one App then checks its App secret. The shared Meta callback selects exactly one product/App. Unknown identity/path and wrong secret/signature are nondiagnostic `401`. Unique bearer selects one server-side connection; no operator route accepts a connection ID; cursors bind the resolved connection.                                                                                                                                                                                                                                                                      | Real authorization/RBAC, audit logging, rate limiting, token rotation, and production load testing.                                                                                |
| Inbox scope escalation, source probing, target injection, or history disclosure | A distinct configured inbox bearer resolves one explicit immutable-at-runtime connection set before query parsing or storage access. Neither route accepts a caller-selected inbox or scope. Feed and command-history cursors each bind the inbox ID and canonical connection set; malformed or foreign history cursors share generic `400`. The command route requires a source event inside that set, derives its private target from canonical `conversation_id`, and accepts no `recipientId`; missing and out-of-scope sources share one generic `404`. History returns recorded text only with safe identifiers and omits private target/source metadata and the client operation ID. Inbox tokens cannot collide with provider, webhook, or per-account operator credentials. | User/organization/RBAC design, audit trail, managed rotation, rate limiting, and production authorization testing.                                                                 |
| Dashboard session theft, CSRF, or scope escalation                              | The optional dashboard is server-rendered without a browser bearer or client-side inbox API. It authenticates only configured principals with exact-profile Argon2id hashes, signed `__Host-` `Secure` `HttpOnly` `SameSite=Strict` cookies, exact-origin form checks, and hidden anti-forgery values. Session/anti-forgery values are random; PostgreSQL retains HMACs only. The server resolves only the principal's preconfigured inboxes; URL input cannot add a connection.                                                                                                                                                                                                                                                                                                     | Public TLS/proxy proof, cross-instance edge rate limiting, cookie/header log-redaction verification, password/secret rotation drill, audit trail, and a full authorization design. |
| Unregistered or drifting connection identity                                    | Startup registers manifest-derived immutable metadata; PostgreSQL blocks new event rows without a registry row; changed metadata for an existing ID fails registration. Zalo OA, Facebook Page, and WhatsApp Business registrations require domain-separated SHA-256 fingerprints of configured provider identities, and the first identity binding is refused when pre-registry history already uses that ID. Telegram still lacks an equivalent configured non-secret provider-account identity.                                                                                                                                                                                                                                                                                   | Historical-row reconciliation and a deliberate later foreign-key validation migration; a future Telegram account-identity design if a suitable non-secret value is configured.     |
| SQL injection or query abuse                                                    | Storage uses fixed schema-qualified SQL and positional parameters. Read routes bound page size, reject malformed/cross-account/cross-inbox cursors before storage access, and exclude raw provider payloads. The queued-command history reader filters `queued` rows in the bearer-selected scope and projects no private columns. The command store parameterizes source lookup/insert, validates bounded IDs/text/scope, and never interpolates a caller target into SQL.                                                                                                                                                                                                                                                                                                          | Adapter integration coverage against production-sized data and review of each new query.                                                                                           |
| Secret disclosure                                                               | Git ignores local configuration; Compose mounts unpadded base64url configuration only as a `10001:10001 0400` secret file, avoiding `.env` expansion of credential `$` characters; docs avoid credential-bearing commands; generic errors omit config details. Inbox bearers, dashboard raw browser tokens, raw Zalo/Meta payloads, and signatures are not persisted.                                                                                                                                                                                                                                                                                                                                                                                                                | Managed secret store, rotation, host/process inspection hardening, log-redaction verification, history scanning, and incident drill.                                               |
| Durable message-data disclosure or loss                                         | Canonical inbound fields plus Phase 4c outgoing text and private source-derived reply metadata are stored; raw payloads and credentials are excluded. Phase 4c create/replay responses omit text and private fields; Phase 4d history intentionally returns recorded text only with safe command metadata. Normal Compose shutdown preserves the named volume.                                                                                                                                                                                                                                                                                                                                                                                                                       | Data classification, encryption-at-rest decision, backup encryption, tested restore, retention/deletion workflow, and access review.                                               |
| Migration race, mismatch, or unsafe manual schema change                        | Migration, registry, and reply-command creation use transaction-scoped advisory locks; immutable checksums record applied IDs; Compose starts API only after migration; `/ready` checks known migrations. The command row has a source-event foreign key, unique operation key, and update/delete-rejection trigger. Phase 4d adds no migration or mutable command state; `0009_outbound_reply_commands` remains the ninth immutable entry.                                                                                                                                                                                                                                                                                                                                          | Production-sized migration test, expand/contract design for later large tables, recovery plan, and foreign-key validation procedure.                                               |
| Container privilege or network exposure                                         | API/migration are non-root, drop capabilities, use `no-new-privileges`, and use an internal data network. API host access is loopback-only. The local loopback Compose configuration intentionally omits the dashboard, whose browser cookies require an external HTTPS origin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | TLS proxy, resource limits, monitoring, host hardening, and a secret-delivery design that permits read-only roots.                                                                 |
| Provider URL or SDK abuse for SSRF/unintended egress                            | Telegram gateway fixes its destination, rejects redirects, bounds timeout, and validates responses. Telegram, Zalo, Facebook Page, and WhatsApp Business webhook URL validation excludes credentials, query, fragment, private hostnames, and non-HTTPS values. Zalo and Meta inbound code make no provider request; Phase 4c–4d create no provider client, dispatch worker, or provider request.                                                                                                                                                                                                                                                                                                                                                                                    | Authorized live-provider check, bounded retry policy, and private-network/DNS controls if configurable destinations appear.                                                        |
| Source offer does not match network service                                     | `GET /source` and response `Link` expose the configured URL; production validates its HTTPS shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Operator must publish exact unauthenticated corresponding source for the version running. This is an AGPL implementation aid, not legal advice.                                    |
| Dependency, CI, or repository-history compromise                                | `npm ci`, CodeQL, Dependabot, secret scanning, Private Vulnerability Reporting, and main-branch force-push/deletion protection are configured.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Fresh checks for each candidate, alert review, SBOM/provenance work, and reassessment of PR/status requirements before collaboration expands.                                      |

## Assumptions and limits

- A compromised Docker host, operator workstation, deployment secret source, or
  GitHub account can expose secrets and message data; the repository cannot
  protect a lost root trust platform.
- The runtime JSON document deliberately holds inline connection and configured
  inbox credentials plus optional dashboard password hashes/session secrets to
  support an arbitrary number of bounded scopes in one mounted secret.
  Base64url is not encryption; neither representation is less sensitive merely
  because its file path is protected.
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
  encryption-at-rest guarantee, full user/organization/RBAC model, or audit
  trail exists. A configured inbox bearer or dashboard local principal is not a
  substitute for those controls.
- Dashboard password changes do not revoke an existing browser session by
  themselves. Rotating `sessionIdPepper` forces all dashboard sessions to fail,
  which is an operator procedure that needs a documented/verified incident
  drill before production use.
- A Phase 4c `queued` command records a durable operator intent, not a provider
  acceptance, send attempt, delivery, or read receipt. No automatic retry can
  be assumed for a future timeout because outcome uncertainty needs its own
  provider-specific design.
- Phase 4d returns the exact recorded outgoing text to the authorized inbox
  bearer for its fixed scope. That text remains untrusted and sensitive; it is
  not a private-target disclosure, delivery event, provider acceptance, or a
  safe value to render without the consumer's own output handling.
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
Business test, public webhook/TLS exposure, dashboard public deployment,
inbox-scope/password/session-key rotation change, backup or retention work,
foreign-key validation, new database access path or history projection,
dispatch/attempt/retry work, full login/RBAC, AI feature, production deployment,
or a branch-protection change.
