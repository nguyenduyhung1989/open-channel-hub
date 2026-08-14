# Phase 0–4i threat model

**Review date:** 2026-08-14

**Status:** GitHub CI and CodeQL succeeded for Phase 0 commit <code>8b80c3b</code>,
Phase 1a candidate <code>7141949</code>, Phase 2a candidate <code>f106bb8</code>,
Phase 2b candidate <code>4d5a9c9</code>, Phase 2c candidate
<code>8352b51</code>, Phase 3a Zalo OA commit <code>b930d29</code>, and Phase
3b Facebook Page commit <code>c933102</code>, and Phase 3c WhatsApp Business
commit <code>fd802cb</code>, and Phase 4a configured inbox commit
<code>705db0a</code>, and Phase 4b dashboard commit <code>7672be9</code>.
Phase 4b also passed final local checks, independent review, and a synthetic
Compose proof. The combined Phase 4c–4d reply-command revision
<code>160414e</code> also passed final local checks, independent security
review, a synthetic Compose proof, and fresh GitHub CI/CodeQL. The Phase 4e
dashboard-history source <code>465186e</code> passed formatting, lint, strict
type checking, 53 test files / 351 tests, build, low-threshold dependency
audit, secret scan, diff check, synthetic Compose proof, independent security
review, and fresh GitHub CI/CodeQL. The Phase 4f dashboard reply-intent source
<code>74fca30</code> passed <code>npm run check</code> (54 test files / 358
tests and build), <code>npm audit --audit-level=low</code> with zero findings,
Gitleaks with no secrets, <code>git diff --check</code>, a synthetic Compose
smoke with cleanup, an independent security audit APPROVE with zero high/medium
findings, and GitHub checks <code>Verify Node 24.18.1</code> and
<code>Analyze JavaScript and TypeScript</code>. The Phase 4g append-only
delivery-evidence source <code>6444699</code> passed <code>npm run check</code>
(54 test files / 358 tests and build), <code>npm audit --audit-level=low</code>
with zero findings, Gitleaks with no secrets, <code>git diff --check</code>, a
synthetic Compose smoke with cleanup, an independent security audit APPROVE
with zero high/medium findings, and those two GitHub checks. No live Telegram,
Zalo, Meta, public TLS, provider send, or production flow has been used. Phase
4g is a storage-only verified source; its evidence does not prove live provider
I/O, provider acceptance, delivery, read status, or production deployment.
Phases 4h–4i are candidate-only changes. They have not yet received final
local, independent, synthetic Compose, or GitHub verification and do not
authorize provider I/O. Phase 4i adds only internal Telegram private-chat and
Bot-identity evidence; it does not add a sender.

## Facts before plans

| Present in the source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Verified or historical evidence                                                                                                                                                                                                                                                                                                                                                                                                                                             | Absent or planned only                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A small HTTP API with liveness/readiness routes, source offer, official Telegram Bot/Zalo OA/Facebook Page/WhatsApp Business inbound text boundaries, account-scoped canonical readers, optional configured aggregate inbox reader, optional server-rendered operator dashboard, a source-bound reply-intent route, a scoped queued-command history route, a server-rendered dashboard history page at `/operator/outbound-commands`, a verified Phase 4f source-bound dashboard reply-intent form, and a verified Phase 4g storage-only evidence migration.                                | Final local checks, independent review, synthetic Compose proof, GitHub CI, and CodeQL passed for Phase 3a `b930d29`, Phase 3b `c933102`, Phase 3c `fd802cb`, Phase 4a `705db0a`, Phase 4b `7672be9`, the combined Phase 4c–4d revision `160414e`, Phase 4e `465186e`, Phase 4f `74fca30`, and Phase 4g `6444699`.                                                                                                                                                          | Live provider TLS flows, provider dispatch, and production deployment.                                                                                                       |
| PostgreSQL 18.4 on an internal Compose network; dedicated database/schema; non-superuser application role; forward migration ledger; connection registry; `NOT VALID` event foreign key; parameterized multi-connection feed and queued-command-history readers; optional HMAC-only dashboard-session store; immutable source-bound reply commands; and verified Phase 4g append-only attempt/receipt evidence tables.                                                                                                                                                                      | The Phase 4b Compose proof verified eight migrations, registry, role boundary, two business phones, one shared Facebook/WhatsApp App callback, and separate multi-account inbox scopes. The Phase 4c–4d proof at `160414e` verified the ninth migration, source-bound idempotency/target derivation, queued-history pagination, scope isolation, and safe projection. The Phase 4g smoke at `6444699` verified ten migrations and structural attempt/receipt evidence only. | Backups, restores, retention/deletion, password rotation, encryption-at-rest assurance, capacity policy, dispatch/receipt semantics, and production monitoring.              |
| Runtime multi-connection JSON is parsed only from an absolute secret file. It accepts strict `telegram_bot`, `zalo_oa`, `facebook_page`, and `whatsapp_business` entries, optional `inboxes`, and optional `dashboard` principals with an exact public HTTPS origin and exact-profile Argon2id password hashes. Phase 4f adds optional principal `replyIntentInboxIds` as an explicit subset of readable inboxes.                                                                                                                                                                           | Configuration loader tests use synthetic documents and reject malformed/duplicate/unsafe input without leaking content. A Meta App used by both Facebook Page and WhatsApp requires matching credentials and one common declared `/v1/webhooks/meta` callback. Phase 4f checks passed at `74fca30`.                                                                                                                                                                         | Managed secret store, rotation procedure, host hardening, and audit logging.                                                                                                 |
| Provider webhook routes resolve configured accounts internally; account bearers resolve one account; inbox bearers resolve one explicit connection set; dashboard sessions resolve one configured principal and then its configured inboxes. A configured inbox bearer can record a source-bound reply intent and read its queued history; the target remains private and history exposes recorded text only. Phase 4f requires an explicit principal write subset before a narrow dashboard closure can record the same intent. Zalo checks raw JSON hashing; Meta checks raw Buffer HMAC. | Route tests cover bearer scoping, wrong-secret/unknown-identity equivalence, raw-byte signature mismatch, Page/WABA batch isolation, Meta challenge handling, shared callback dispatch, inbox bearer/cursor scope rejection, canonical-only output, dashboard controls, and source-bound command/history controls with synthetic features. Phase 4f checks passed at `74fca30`.                                                                                             | Full user login/organization/RBAC model, distributed rate limit, audit trail, public connection administration, provider dispatch policy, and provider timing/load evidence. |
| Candidate Phase 4h code creates one immutable authorization-provenance row alongside each new reply command. It stores only kind, configured inbox ID, optional dashboard principal ID, scope fingerprint, and time; old command rows are not backfilled.                                                                                                                                                                                                                                                                                                                                   | Verification is pending. The candidate has no public API field or browser field for provenance and no provider I/O.                                                                                                                                                                                                                                                                                                                                                         | A current authorization recheck, legacy-command policy, provider eligibility, dispatcher, retry policy, and production deployment.                                           |
| Candidate Phase 4i code preserves the allowed Telegram chat type only internally, binds new Telegram registrations to an opaque Bot fingerprint, and records an immutable private-chat eligibility row with a new Telegram command. Historic rows are not backfilled or adopted.                                                                                                                                                                                                                                                                                                            | Verification is pending. The candidate does not project chat type or fingerprint to public readers/dashboard and makes no provider request.                                                                                                                                                                                                                                                                                                                                 | Current provider policy, command selection, sender, attempt ordering, timeout/receipt handling, live-provider/TLS, and production verification.                              |

Do not treat a source fact, historical CI result, or synthetic proof as a
production claim.

## Phase 4e verified source boundary

- `GET /operator/outbound-commands` exists only when the optional dashboard is
  configured. It touches and validates the signed dashboard session before
  strict query parsing, cursor decoding, or history access.
- The strict query permits only an optional safe configured `inbox` ID and an
  opaque Phase 4d history `cursor`; its page size is fixed at 50. The server
  resolves that inbox only through the authenticated principal's configured
  allow-list. A URL cannot supply a connection scope or inbox bearer.
- The source reuses the Phase 4d scope-bound `orderVersion: 1` cursor and
  history reader. Its server-rendered HTML escapes and displays only recorded
  creation time, text, source connection ID, and a recorded-not-sent label.
  It deliberately omits command/provider-event IDs, private target/source
  metadata, client operation IDs, credentials, and delivery data. Responses
  are `Cache-Control: no-store`.
- It adds no dashboard command-creation form, recipient selector, provider
  request, dispatch worker, send, retry, cancellation, command mutation,
  migration, or delivery-state model. The only ordinary write from a page view
  is the existing dashboard-session touch for its idle timeout. The separate
  verified Phase 4f source is not part of this verified Phase
  4e control set.

## Phase 4f verified source boundary

- An optional `dashboard.principals[].replyIntentInboxIds` is a strict unique
  subset of that principal's configured readable `inboxIds`. Omission becomes
  an empty immutable set, so an existing dashboard principal remains read-only.
  The browser cannot grant itself this capability through a URL or form value.
- An enabled `/operator` inbox renders one same-origin native form for each
  already persisted inbound event. Text is the only editable input. The server
  creates and escapes a UUIDv4 operation ID plus the canonical source reference
  as hidden transport values; those values are revalidated and do not create a
  caller-selected recipient. The inbound card renders only channel, occurrence
  time, message text, and connection ID; it omits `conversationId`, `senderId`,
  private target, and source-message ID.
- `POST /operator/reply-intents` requires an active signed dashboard session,
  exact configured HTTPS `Origin`, matching anti-forgery value, and a strict
  non-duplicated form body before it resolves the explicit principal/inbox
  write closure. The existing Phase 4c command store then checks the durable
  source event inside the fixed inbox scope and derives the private target.
- The URL-encoded form parser caps the entire body at 32 KiB before strict
  validation and recorder access; reply text remains separately bounded to
  2,000 characters. Operator HTML—including a parser-rejected `413`—remains
  `Cache-Control: no-store`.
- A created command or exact idempotent replay uses `303` post/redirect/get to
  the authenticated queued-history page without a command-result URL signal.
  The queued-history row is the only browser evidence of a durable record. It
  does not disclose a bearer, private target, command ID, provider result, or
  delivery state. The strict history query rejects an added `notice` value.
  `queued` remains a durable intent only.
- A bounded local in-process guard allows at most 20 recording attempts per
  rolling minute per configured principal. It is not a distributed, multi-host,
  or proxy rate-limit control.
- Phase 4f adds no provider client/request, provider credential/OAuth
  storage, recipient picker, worker, dispatch, retry, attempt, timeout,
  receipt, delivery/read state, command mutation, migration, table, index,
  trigger, or Compose service. Exact commit <code>74fca30</code> supplied the
  focused final local evidence and independent security audit APPROVE described
  above; it still does not prove public TLS, provider send, or production.

## Phase 4h candidate authorization-provenance boundary

- `0011_outbound_command_authorizations` has one row at most for a new command:
  `command_id` is its primary key and its foreign key to the immutable command.
  Its update/delete-rejection trigger makes it append-only.
- The only accepted kinds are `inbox_bearer` and `dashboard_principal`. The
  former requires no principal; the latter requires a valid principal. Both
  record the configured inbox ID and a SHA-256 fingerprint of the sorted scope
  evaluated by the server at creation. The table excludes bearer/session values,
  password material, anti-forgery values, target, text, provider data,
  delivery/receipt state, retry, and mutable state.
- The inbox API can create only server-injected `inbox_bearer` provenance. The
  dashboard can create only server-injected `dashboard_principal` provenance
  through a closure materialized after the authenticated principal's explicit
  `replyIntentInboxIds` grant. Its form carries an inbox ID already visible to
  that principal, but the server treats it as untrusted and accepts it only if
  the principal's pre-built writable capability resolves that exact inbox.
  Authority kind, dashboard principal ID, and scope fingerprint are never
  browser-supplied or returned.
- A newly created command and provenance row are one transaction. Exact replay
  requires matching source/text plus kind, inbox, optional principal, and
  scope fingerprint. A mismatch fails rather than changing provenance.
- Historic commands have no row. Phase 4h does not infer/backfill it, and a
  provenance row is not current permission or a provider-send authorization.
  No provider request, worker, queue, dispatcher, retry, browser send control,
  delivery/read state, or live-provider test is in scope.

## Phase 4i candidate Telegram private-reply boundary

- `0012_telegram_private_reply_eligibility` stores only the four recognized
  Telegram chat types for new Telegram inbound rows. A non-Telegram row cannot
  carry this field, and historic missing data remains unknown rather than being
  inferred from a raw payload or command.
- The runtime accepts a Telegram Bot token only in `<numeric Bot ID>:<secret>`
  form and computes a domain-separated SHA-256 fingerprint from the numeric
  prefix only. It neither stores nor returns the prefix or secret. A Telegram
  registration requires the fingerprint; a historical registry row with
  inbound history and no fingerprint cannot be silently adopted.
- A new Telegram command needs a private source, a current registry fingerprint,
  Phase 4h provenance, and a matching one-to-one immutable eligibility record
  in the same transaction. Group, supergroup, channel, missing chat evidence,
  missing/changed Bot identity, missing source, and out-of-scope source fail
  closed through the existing generic source-unavailable boundary.
- The chat type and fingerprint do not enter account readers, inbox readers,
  queued history, dashboard HTML, or browser form fields. Old Telegram commands
  without eligibility are conflicts on replay rather than being adopted.
- No Telegram provider HTTP request, worker, dispatcher, retry, attempt/receipt
  write, delivery result, or live-provider test is in scope.

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
scope; it does not grant a provider send capability. The Phase 4e source
uses a dashboard session and a narrow server-side history closure instead of
moving that bearer or a generic database capability into the browser. The
verified Phase 4f source adds a distinct server-held intent-recording closure only
after an explicit configured principal/inbox write grant; it still exposes no
bearer, provider credential, recipient, or generic database capability.
The Phase 4h candidate keeps the authority tuple server-side as well: the
public inbox view has no dashboard factory, and a principal-specific dashboard
closure exists only for an explicitly writable inbox. A dashboard form can
submit its already-visible inbox ID, but it is untrusted and can select only a
pre-built writable closure for that session principal; kind, principal, scope
fingerprint, and the closure itself remain server-side.

### Zone C — durable PostgreSQL ledger

This zone contains the Docker volume, database, schema, migration ledger,
connection registry, dashboard session table, source-bound reply-command table,
candidate authorization-provenance and Telegram-eligibility tables, and
canonical inbound events. The registry contains opaque internal connection ID,
connector metadata, and domain-separated SHA-256 account-binding fingerprints
for Zalo OA, Facebook Page, WhatsApp Business, and candidate Telegram
registrations. The dashboard-session table contains only
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
role. The Phase 4e source reuses that history reader and reduces the HTML
projection further to escaped creation time, text, and source connection ID;
it adds no table, migration, or command-row mutation. The verified Phase 4f source
reuses the existing Phase 4c command transaction after server-side form,
session, origin, anti-forgery, write-scope, and source checks. It adds no new
database path, migration, or mutable command state.

The Phase 4h candidate adds a separate append-only provenance table. It retains
only the internal authority kind, configured inbox ID, optional dashboard
principal ID, scope fingerprint, and time. The adapter derives this evidence
from its server-owned scope and writes it atomically with a new command; it
does not persist any credential or make current authorization/delivery claims.

The Phase 4i candidate adds an internal inbound chat-type field and a separate
append-only Telegram eligibility table. It retains only a command reference,
opaque Bot fingerprint, `private`, and recording time. Neither field is a
current send authorization or provider delivery claim.

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

The Phase 4e dashboard-history path is:

<code>signed dashboard session → touch and authenticate before query/cursor →
resolve configured principal inbox → scope-bound Phase 4d cursor and history
reader → escaped no-store HTML projection</code>.

The Phase 4f dashboard-intent path is:

<code>exact origin → strict form parse → signed dashboard session and
anti-forgery check → resolve explicit principal/inbox write grant → Phase 4c
source-scope check and private target derivation → immutable queued command →
303 queued-history view</code>.

The Phase 4h candidate records provenance inside that final storage
transaction. A caller can submit an untrusted inbox selection, but the server
does not copy an authority tuple from that form/API input: it resolves the
fixed principal-and-inbox closure, then supplies kind, principal, and scope
fingerprint itself.

For a candidate Phase 4i Telegram command, the same transaction additionally
requires private chat evidence and a current Bot binding before it writes the
eligibility snapshot. Neither comes from the caller's request body.

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
- Dashboard session integrity, anti-forgery values, exact public origin,
  principal-to-readable-inbox and Phase 4f principal-to-write-inbox boundaries,
  the server-generated operation ID, and the server-rendered queued-text and
  Phase 4f reply-intent responses.
- Canonical inbound and outgoing message text, sender/conversation/message
  identifiers, private reply targets, command state/operation identifiers,
  timestamps, registry metadata, the inbox bearer that can read scoped command
  text, authenticated dashboard HTML that renders a smaller queued-text
  projection, the Phase 4f form's hidden source transport values, and the
  PostgreSQL volume that holds them.
- Candidate Telegram chat-type evidence and opaque Bot-identity fingerprints.
  They are sensitive operational linkage data even though they are not tokens,
  raw Bot IDs, or authorization to send.
- The Docker host and any backup destination added later.

## Threats and controls

| Threat                                                                                 | Current control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Required before the related feature is production-ready                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malformed or unexpected HTTP input                                                     | API body limits, strict command schemas, authenticated webhook boundaries, narrow text normalization, bounded queries/cursors, strict connection-document parsing, Zalo raw UTF-8 JSON verification, and Meta raw Buffer HMAC verification before normalization. The reply-command route resolves an inbox bearer before body parsing and rejects extra/caller-chosen target fields. The history route authenticates before application query/cursor validation, accepts only `limit` 1–100 plus an opaque cursor, and rejects malformed input generically. The Phase 4e source touches an authenticated dashboard session before its strict optional inbox/cursor query and returns a generic safe failure for malformed values.                                                                                                                                                                                             | Final runtime testing, provider-specific limits, rate limiting, and observability.                                                                                                                               |
| Cross-account webhook or operator access                                               | Telegram resolves a dynamic account then checks its secret. Zalo resolves `(appId, oaId)` then checks that OA secret. Facebook resolves every Page ID and WhatsApp resolves every WABA ID to exactly one App then checks its App secret. The shared Meta callback selects exactly one product/App. Unknown identity/path and wrong secret/signature are nondiagnostic `401`. Unique bearer selects one server-side connection; no operator route accepts a connection ID; cursors bind the resolved connection.                                                                                                                                                                                                                                                                                                                                                                                                               | Real authorization/RBAC, audit logging, rate limiting, token rotation, and production load testing.                                                                                                              |
| Inbox scope escalation, source probing, target injection, or history disclosure        | A distinct configured inbox bearer resolves one explicit immutable-at-runtime connection set before query parsing or storage access. Neither route accepts a caller-selected inbox or scope. Feed and command-history cursors each bind the inbox ID and canonical connection set; malformed or foreign history cursors share generic `400`. The command route requires a source event inside that set, derives its private target from canonical `conversation_id`, and accepts no `recipientId`; missing and out-of-scope sources share one generic `404`. History returns recorded text only with safe identifiers and omits private target/source metadata and the client operation ID. Inbox tokens cannot collide with provider, webhook, or per-account operator credentials. The Phase 4e source separately resolves an assigned inbox after dashboard authentication; an unassigned inbox reaches no history reader. | User/organization/RBAC design, audit trail, managed rotation, rate limiting, and production authorization testing.                                                                                               |
| Dashboard session theft, CSRF, or scope escalation                                     | The optional dashboard is server-rendered without a browser bearer or client-side inbox API. It authenticates only configured principals with exact-profile Argon2id hashes, signed `__Host-` `Secure` `HttpOnly` `SameSite=Strict` cookies, exact-origin form checks, and hidden anti-forgery values. Session/anti-forgery values are random; PostgreSQL retains HMACs only. The server resolves only the principal's preconfigured inboxes; URL input cannot add a connection. The Phase 4e source uses that same session before query/cursor/history access, reuses the inbox/scope-bound cursor, returns no-store escaped HTML, and introduces no outbound browser action.                                                                                                                                                                                                                                                | Public TLS/proxy proof, cross-instance edge rate limiting, cookie/header log-redaction verification, password/secret rotation drill, audit trail, and a full authorization design.                               |
| Unregistered or drifting connection identity                                           | Startup registers manifest-derived immutable metadata; PostgreSQL blocks new event rows without a registry row; changed metadata for an existing ID fails registration. Zalo OA, Facebook Page, WhatsApp Business, and candidate Telegram registrations require domain-separated SHA-256 fingerprints of configured provider identities. The first identity binding is refused when pre-registry history already uses that ID; Telegram's fingerprint derives only from the configured token's numeric Bot-ID prefix.                                                                                                                                                                                                                                                                                                                                                                                                         | Historical-row reconciliation, a deliberate later foreign-key validation migration, and a provider-specific live identity policy before dispatch.                                                                |
| SQL injection or query abuse                                                           | Storage uses fixed schema-qualified SQL and positional parameters. Read routes bound page size, reject malformed/cross-account/cross-inbox cursors before storage access, and exclude raw provider payloads. The queued-command history reader filters `queued` rows in the bearer-selected scope and projects no private columns. The command store parameterizes source lookup/insert, validates bounded IDs/text/scope, and never interpolates a caller target into SQL. The Phase 4e source uses only the existing scoped history closure; it adds no SQL text or browser-selected database scope.                                                                                                                                                                                                                                                                                                                        | Adapter integration coverage against production-sized data and review of each new query.                                                                                                                         |
| Secret disclosure                                                                      | Git ignores local configuration; Compose mounts unpadded base64url configuration only as a `10001:10001 0400` secret file, avoiding `.env` expansion of credential `$` characters; docs avoid credential-bearing commands; generic errors omit config details. Inbox bearers, dashboard raw browser tokens, raw Zalo/Meta payloads, and signatures are not persisted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Managed secret store, rotation, host/process inspection hardening, log-redaction verification, history scanning, and incident drill.                                                                             |
| Durable message-data disclosure or loss                                                | Canonical inbound fields plus Phase 4c outgoing text and private source-derived reply metadata are stored; raw payloads and credentials are excluded. Candidate Phase 4i adds internal Telegram chat type and opaque Bot identity only to the PostgreSQL boundary, never public projections. Phase 4c create/replay responses omit text and private fields; Phase 4d history intentionally returns recorded text only with safe command metadata. The Phase 4e source renders a still-smaller escaped subset in authenticated no-store HTML. Verified Phase 4g evidence tables exclude target, text, credential, raw provider response, error/reason, HTTP detail, URL, retry, and mutable state; a provider message ID remains sensitive operational metadata. Normal Compose shutdown preserves the named volume.                                                                                                           | Data classification, encryption-at-rest decision, backup encryption, tested restore, retention/deletion workflow, and access review.                                                                             |
| Migration race, mismatch, unsafe manual schema change, or overstated delivery evidence | Migration, registry, reply-command creation, and the verified Phase 4g migration use transaction-scoped advisory locks; immutable checksums record applied IDs; Compose starts API only after migration; `/ready` checks known migrations. The command row has a source-event foreign key, unique operation key, and update/delete-rejection trigger. At Phase 4d's verified revision, `0009_outbound_reply_commands` was the ninth entry. Verified Phase 4g `0010_outbound_delivery_attempt_receipts` adds source-bound attempt/receipt foreign keys and separate immutable triggers, without changing command state. The absence of an attempt row supports only the derived `not_attempted` in this ledger label, never proof an external call did not happen; a stored attempt with no receipt remains unknown.                                                                                                           | Production-sized migration test, expand/contract design for later large tables, recovery plan, foreign-key validation procedure, provider-specific attempt ordering, and independently reviewed receipt mapping. |
| Container privilege or network exposure                                                | API/migration are non-root, drop capabilities, use `no-new-privileges`, and use an internal data network. API host access is loopback-only. The local loopback Compose configuration intentionally omits the dashboard, whose browser cookies require an external HTTPS origin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | TLS proxy, resource limits, monitoring, host hardening, and a secret-delivery design that permits read-only roots.                                                                                               |
| Provider URL or SDK abuse for SSRF/unintended egress                                   | Telegram gateway fixes its destination, rejects redirects, bounds timeout, and validates responses. Telegram, Zalo, Facebook Page, and WhatsApp Business webhook URL validation excludes credentials, query, fragment, private hostnames, and non-HTTPS values. Zalo and Meta inbound code make no provider request; Phases 4c–4g create no provider client, dispatch worker, or provider request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Authorized live-provider check, bounded retry policy, and private-network/DNS controls if configurable destinations appear.                                                                                      |
| Source offer does not match network service                                            | `GET /source` and response `Link` expose the configured URL; production validates its HTTPS shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Operator must publish exact unauthenticated corresponding source for the version running. This is an AGPL implementation aid, not legal advice.                                                                  |
| Dependency, CI, or repository-history compromise                                       | `npm ci`, CodeQL, Dependabot, secret scanning, Private Vulnerability Reporting, and main-branch force-push/deletion protection are configured.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Fresh checks for each candidate, alert review, SBOM/provenance work, and reassessment of PR/status requirements before collaboration expands.                                                                    |

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
- Zalo OA, Facebook Page, WhatsApp Business, and candidate Telegram
  fingerprints protect configured provider-identity reuse after history exists
  without retaining raw account IDs. Telegram's candidate binding comes only
  from its token's numeric Bot-ID prefix and does not establish historic identity
  continuity for pre-existing rows.
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
- The Phase 4e source renders that sensitive, untrusted outgoing text only
  after dashboard-session and principal-inbox checks. Its HTML escapes the
  text, returns `Cache-Control: no-store`, and omits IDs and private source or
  target data; this is a smaller authenticated view, not a delivery result or
  a substitute for a browser-data handling policy.
- The Phase 4f `replyIntentInboxIds` field is deployment-secret
  authorization data. Omission means no dashboard write grant. Browser-hidden
  source values and the generated operation ID remain untrusted on submission;
  the server and existing source-bound store must enforce the actual scope and
  derived target. Its 20-attempt per-principal guard exists only in one process
  and is not evidence of a public distributed rate limit.
- The Phase 4h candidate's authority kind, configured inbox ID, optional
  dashboard principal ID, and scope fingerprint are sensitive operational
  provenance. They are not credentials and do not prove current authorization.
  A command without this row must remain a no-dispatch candidate; a command
  with it still needs a fresh authorization and provider-eligibility recheck.
- The Phase 4i candidate's `private` eligibility record is a historical
  snapshot, not current authorization or proof that a provider will accept a
  send. Group/supergroup/channel and historic missing chat type remain
  no-dispatch candidates. A new Bot fingerprint must not be attached to a
  historic Telegram connection with inbound data.
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
Phase 4e history-projection or scope-boundary change, any Phase 4f
reply-intent authorization, form, source-binding, rate-limit, or projection
change, any Phase 4h authorization-provenance or Phase 4i Telegram
chat-type/identity/eligibility schema, transaction, replay, scope-fingerprint,
or projection change,
inbox-scope/password/session-key rotation change, backup or retention work,
foreign-key validation, new database access path or history projection,
dispatch/attempt/retry work, full login/RBAC, AI feature, production deployment,
or a branch-protection change.
