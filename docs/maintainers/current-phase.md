# Public checkpoint: Phase 4a–4g verified source; Phase 4h candidate

**Verified scope:** Phase 4a is a configured, read-only aggregate feed across
an explicit set of existing official connections. It builds on the Telegram
Bot, Zalo OA, Facebook Page, and WhatsApp Business runtime configuration and
durable PostgreSQL inbound-event ledger.

**Verified local scope:** Phase 4b adds an optional server-rendered
local-principal browser view over that same inbox scope. It is not a deployed
browser service or a full user login, organization/RBAC model,
conversation/thread model, search service, attachment store, outbound queue,
provider credential manager, real provider test, or production deployment.

**Verified source scope:** Phase 4c adds a durable, source-bound reply-command
ledger behind an existing configured inbox bearer. Phase 4d adds a scoped,
read-only history over those same immutable `queued` intents. Neither dispatches
a provider message, retries, tracks an attempt/receipt, or adds a dashboard
reply or history surface. Exact commit <code>160414e</code> passed final local
verification, a synthetic Compose proof, independent security review, and
GitHub CI/CodeQL.

**Verified Phase 4e source scope:** Phase 4e adds one server-rendered dashboard page
for an authenticated configured principal to inspect the Phase 4d queued
history of one already assigned inbox. It has no browser bearer, command form,
provider operation, command mutation, migration, or delivery semantics. Exact
commit <code>465186e</code> passed formatting, lint, strict type checking, 53
test files / 351 tests, build, low-threshold dependency audit, secret scan,
diff check, a synthetic Compose proof, and an independent security audit that
returned APPROVE with no high- or medium-severity finding. GitHub checks
<code>Verify Node 24.18.1</code> and CodeQL's
<code>Analyze JavaScript and TypeScript</code> succeeded for that exact commit.
This verifies the frozen source and synthetic local path; it does not prove
public TLS, a live provider, or production deployment.

**Verified Phase 4f source scope:** Phase 4f adds one opt-in,
source-bound dashboard write. A configured principal remains read-only unless
its optional `replyIntentInboxIds` allow-list explicitly includes a selected
readable inbox. For that inbox only, each persisted inbound event can render a
native reply-intent form whose editable value is text; the server creates the
operation ID and rechecks session, exact origin, anti-forgery, write scope, and
durable source before it invokes the existing Phase 4c command store. A
successful create or exact replay redirects to queued history; `queued` is
still not sent, delivered, or read. Exact commit <code>74fca30</code> passed
<code>npm run check</code> (54 test files / 358 tests and build),
<code>npm audit --audit-level=low</code> with zero findings, Gitleaks with no
secrets, <code>git diff --check</code>, a synthetic Compose smoke with cleanup,
an independent security audit APPROVE with zero high/medium findings, and
GitHub checks <code>Verify Node 24.18.1</code> and <code>Analyze JavaScript and
TypeScript</code>. This source evidence is not public TLS, live-provider, or
production evidence.

**Verified Phase 4g source scope:** Phase 4g adds one forward-only, append-only
PostgreSQL evidence migration. It can record at most one durable local attempt
fact per existing command and at most one optional known-outcome receipt for
that attempt. Its exact receipt outcomes are `provider_accepted`,
`provider_rejected`, and `outcome_unknown`; only acceptance has a provider
message ID. Absence of a durable attempt row supports only a derived
`not_attempted`-in-this-ledger label, never proof that an external call could
not have happened. A recorded attempt without a receipt is conservatively
unknown. It adds no route, dashboard projection, provider HTTP request, provider
credential, worker, retry, command mutation, delivery/read state, live-provider
test, or production claim. Exact commit <code>6444699</code> passed
<code>npm run check</code> (54 test files / 358 tests and build),
<code>npm audit --audit-level=low</code> with zero findings, Gitleaks with no
secrets, <code>git diff --check</code>, a synthetic Compose smoke with cleanup,
an independent security audit APPROVE with zero high/medium findings, and
GitHub checks <code>Verify Node 24.18.1</code> and
<code>Analyze JavaScript and TypeScript</code>. This verifies frozen source and
synthetic local evidence only; it does not prove public TLS, live provider I/O,
provider acceptance, delivery, read status, or production deployment.

## Phase 4h candidate source

Phase 4h is not verified yet. It adds one forward-only PostgreSQL migration,
`0011_outbound_command_authorizations`, for immutable historical provenance of
new reply commands. A command can have at most one row because `command_id` is
both the primary key and foreign key to `outbound_commands`.

The row says only whether the server recorded a command through the
`inbox_bearer` path or through a `dashboard_principal` write closure, which
configured inbox was evaluated, which dashboard principal was involved when
applicable, and a non-secret SHA-256 fingerprint of the sorted allowed
connection scope. It does not store an inbox bearer, browser session,
password/hash, anti-forgery value, reply target, text, provider credential, raw
provider response, delivery result, retry state, or mutable command state.

The runtime creates bearer provenance only inside the configured inbox feature.
It creates dashboard provenance only after the server has selected an
authenticated configured principal and an explicitly writable inbox. The
dashboard form carries an inbox ID already visible to that principal, but the
server treats it as untrusted and accepts it only when the fixed writable
capability for that principal resolves it. Authority kind, principal ID, and
scope fingerprint are not browser-supplied or returned. The PostgreSQL adapter
writes the command and provenance row in the same transaction; exact replay
must prove the same source, text, kind, inbox, optional principal, and scope
fingerprint or returns a conflict.

The migration does not invent provenance for historic commands. Any command
without its row remains provenance-free and must be excluded from a future
dispatch candidate set until separately reviewed policy says otherwise. A new
provenance row also is not current authorization and never authorizes provider
I/O. Phase 4h adds no provider request, worker, queue, dispatcher, retry,
browser send control, delivery/read state, or live-provider test.

## Exact verified history

- GitHub CI and CodeQL succeeded for the Phase 0 commit <code>8b80c3b</code>,
  Phase 1a Telegram Bot candidate <code>7141949</code>, Phase 2a ledger
  candidate <code>f106bb8</code>, Phase 2b reader candidate
  <code>4d5a9c9</code>, and Phase 2c multi-account candidate
  <code>8352b51</code>.
- Phase 3a's Zalo OA source passed final local checks, independent review, a
  synthetic Compose proof, and fresh GitHub CI/CodeQL for exact commit
  <code>b930d29</code>. Phase 3b's Facebook Page source passed the same
  evidence for exact commit <code>c933102</code>.
- Phase 3c's WhatsApp Business source passed final local checks, independent
  review, a synthetic Compose proof, and fresh GitHub CI/CodeQL for exact
  commit <code>fd802cb</code>.
- Phase 4a's configured inbox source passed final local checks, independent
  review, a synthetic Compose proof, and fresh GitHub CI/CodeQL for exact
  commit <code>705db0a</code>.
- Phase 4b's operator dashboard source passed final local checks, independent
  security review, a synthetic Compose proof, and fresh GitHub CI/CodeQL for
  exact commit <code>7672be9</code>.
- Phase 4c's source-bound reply-command ledger and Phase 4d's scoped queued
  history passed final local checks, independent security review, a synthetic
  Compose proof, and fresh GitHub CI/CodeQL for exact commit
  <code>160414e</code>.
- Phase 4e's server-rendered queued-command history passed final local checks,
  independent security review, a synthetic Compose proof, and fresh GitHub
  CI/CodeQL for exact commit <code>465186e</code>; its `Verify Node 24.18.1`
  and `Analyze JavaScript and TypeScript` checks both succeeded.
- Phase 4f's server-rendered source-bound reply-intent form passed final local
  evidence, independent security review, a synthetic Compose smoke with
  cleanup, and fresh GitHub checks for exact commit <code>74fca30</code>.
- Phase 4g's append-only delivery-evidence migration passed final local
  evidence, independent security review, a synthetic Compose smoke with
  cleanup, and fresh GitHub checks for exact commit <code>6444699</code>.
- Historical evidence proves only those exact revisions. It does not verify any
  live provider account, provider send, public TLS endpoint, production
  deployment, any Phase 4g provider result beyond its exact verified commit, or
  the Phase 4h candidate.

## Verified Phase 4g source

Migration `0010_outbound_delivery_attempt_receipts` adds
`outbound_delivery_attempts` and `outbound_delivery_attempt_receipts` without
changing `outbound_commands`. The attempt table has one immutable row at most
per command; the receipt table has one immutable row at most per attempt. Their
foreign keys keep the evidence source-bound, and their update/delete-rejection
triggers keep it append-only.

The receipt table contains only its attempt reference, exact outcome, optional
provider message ID, and observed time. It rejects a provider message ID unless
the outcome is `provider_accepted`, and it requires one for acceptance. It does
not store target, text, credential, raw provider response, error/reason, HTTP
detail, URL, retry setting, or mutable delivery state.

This is deliberately not a delivery timeline. `provider_accepted` is a recorded
provider-acknowledgement receipt with a provider message ID, not sent,
delivered, displayed, or read. `provider_rejected` is not automatic-retry authorization.
`outcome_unknown`, including a stored attempt with no receipt, must remain
unknown. Absence of an attempt row supports only `not_attempted` in this ledger;
that derived label does not prove a provider call never happened.

Exact commit <code>6444699</code> completed final local verification:
<code>npm run check</code> (54 test files / 358 tests and build),
<code>npm audit --audit-level=low</code> with zero findings, Gitleaks with no
secrets, <code>git diff --check</code>, and a synthetic Compose structural smoke
with cleanup. The independent security audit returned APPROVE with zero
high/medium findings, and both GitHub checks succeeded. This source verification
does not substitute for separate owner authorization and a provider-specific
design before any real provider call or public TLS exposure; it proves no live
provider I/O, provider acceptance, delivery, read status, or production
deployment.

## Verified Phase 4a source

The source now has a bounded configured-inbox vertical slice:

- The existing strict version-1 runtime document may contain optional
  `inboxes`. Each entry has an opaque ID, a unique printable bearer token, and
  an explicit non-empty set of existing connection IDs. The parser rejects
  duplicate inbox IDs, duplicate inbox tokens, duplicate or unknown scope
  members, and every inbox-token collision with a provider, webhook, or
  account-operator credential. The configured set is frozen in stable order.
- `GET /v1/inbox/inbound-events` appears only when an inbox is configured. It
  resolves its bearer before parsing query input or contacting storage. The
  route accepts bounded `limit` and opaque `cursor` only; an HTTP caller cannot
  select an inbox ID, connection ID, or connection scope.
- The new domain-owned PostgreSQL feed reader uses parameterized SQL to list
  canonical inbound events across the immutable configured scope. It fixes a
  first-page maximum ledger sequence, returns newest sequence first, and keeps
  a continuation below the preceding sequence. It never returns raw provider
  payloads or database rows.
- A public cursor contains the ledger position plus the inbox ID and a SHA-256
  binding of the canonical configured connection set. The route rejects a
  cursor issued to another inbox or a cursor retained after that inbox's scope
  changed. The cursor is not a credential; the inbox bearer remains required.
- The Phase 4a numeric ledger-order correction versions newly issued cursors.
  A per-account cursor issued before Phase 4a has no safe continuation under
  the corrected order, so the route deliberately returns `400`; callers must
  restart that traversal from its first page after upgrading.
- Inbox tokens are separate from the existing per-account operator tokens. A
  connection bearer cannot access the aggregate route, and an inbox bearer does
  not select an individual connection route. Configuration remains secret-file
  data and is not stored in PostgreSQL.

The [Phase 4a unified inbox guide](../operations/unified-inbox-4a.md) and
[ADR-0010](../adr/0010-configured-read-only-inbox-principals.md) describe the
contract, rationale, and boundaries.

## Exact Phase 4a evidence

- Frozen commit <code>705db0a</code> passed formatting, lint, strict type
  checking, 41 test files / 285 tests, build, low-threshold dependency audit,
  Compose configuration, secret scan, and the expanded synthetic Docker smoke
  test.
- An independent bounded review found no remaining actionable high- or
  medium-severity issue in that frozen source.
- GitHub CI and CodeQL both succeeded for exact commit <code>705db0a</code>.

The synthetic proof must use fake IDs, secrets, tokens, and messages only. It
must verify multiple provider connections in each of two configured inboxes,
aggregate canonical output, connection-bearer rejection at the inbox route,
cross-inbox cursor rejection, unchanged per-account cursor isolation,
secret-file permission, and PostgreSQL role safety. It is not a live-provider,
TLS, dashboard, or production-authorization proof.

## Verified Phase 4b source

The current source adds a bounded browser surface without moving a bearer into
the browser:

- The optional root `dashboard` object is accepted only with configured
  `inboxes` and PostgreSQL. It requires an exact public HTTPS origin, one or
  two distinct cookie-signing keys, a distinct session HMAC pepper, and one to
  one hundred configured principals. A principal has an opaque ID, an exact
  Argon2id `m=19456,t=2,p=1` PHC hash, and an explicit allow-list of existing
  inbox IDs.
- `/operator/login`, `/operator`, and same-origin CSS are server-rendered with
  no dashboard JavaScript, browser bearer, provider credential, or
  caller-selected connection scope. The server uses the Phase 4a inbox reader
  only after it authenticates and scopes the configured principal.
- Session cookies are signed `__Host-` cookies with `Secure`, `HttpOnly`,
  `SameSite=Strict`, and `Path=/`. Login/logout require an exact `Origin` and a
  hidden anti-forgery token. Sessions use a 30-minute idle limit, an eight-hour
  absolute limit, server-side revocation, and a bounded in-process failed-login
  throttle.
- `0008_dashboard_sessions` retains only HMACs of random browser session and
  anti-forgery tokens plus principal ID and lifecycle timestamps. It contains
  no raw token, password, password hash, inbox bearer, provider credential, or
  inbox membership.
- The local Compose smoke is intentionally HTTP on loopback and leaves
  `dashboard` absent. It verifies the eighth migration but cannot prove a
  browser login that depends on external HTTPS cookies and origin semantics.

Exact commit <code>7672be9</code> passed formatting, lint, strict type
checking, 48 test files / 319 tests, build, low-threshold dependency audit,
secret scan, Compose configuration, and the synthetic Docker proof. An
independent security review found no remaining actionable high- or
medium-severity issue, and GitHub CI plus CodeQL both succeeded for that exact
commit. An external TLS proxy, edge rate limit, cookie/header log policy, and
real public origin remain separate operational proof.

## Verified Phase 4c–4d source

The verified source adds one narrow write capability to a configured inbox bearer:

- `POST /v1/inbox/outbound-commands` resolves that bearer before Fastify parses
  the request body. The body is strict and accepts only `clientOperationId`,
  `sourceConnectionId`, `sourceProviderEventId`, and `text`. It never accepts a
  recipient ID, channel, source message ID, retry, or delivery-state value.
- The domain-owned PostgreSQL store resolves the source event only after it
  applies the bearer-selected immutable connection scope. It derives the
  private reply target from the event's canonical conversation and snapshots
  the private source message/channel fields. A caller cannot supply or inspect
  those values.
- `0009_outbound_reply_commands` creates `outbound_commands`: a composite
  foreign key binds each command to its exact inbound source; unique
  `(connection_id, client_operation_id)` supplies idempotency; a database
  trigger rejects every update and delete. The only stored state is `queued`.
- A first accepted intent returns `201`; the exact same operation replays with
  `200`; reusing an operation ID with different source or text returns `409`.
  Missing and out-of-scope sources intentionally share the same generic `404`.
  Public data omits outgoing text, target, source message/channel, raw provider
  data, and credentials.
- There is no worker, provider HTTP call, provider credential/OAuth storage,
  attempt, timeout/retry behavior, receipt, delivery/read state, or dashboard
  send UI. `queued` proves a database commit only. The legacy Phase 1a Telegram
  direct-send route remains separate compatibility behavior and is not proof
  that all sends are durable.
- Phase 4d adds `GET /v1/inbox/outbound-commands`. It resolves the existing
  inbox bearer before application query/cursor validation, accepts only an
  optional `limit` from 1 through 100 and an opaque cursor, and reads only
  `queued` rows from that fixed server-side connection scope.
- Its separate base64url cursor has `orderVersion: 1`, binds the exact inbox ID,
  a SHA-256 canonical connection-set hash, and a fixed reverse command-ID
  snapshot. Malformed, foreign-inbox, and changed-scope cursors share generic
  `400`; a caller cannot use an inbound-event cursor or select a different
  scope.
- History returns only `id`, `sourceConnectionId`, `sourceProviderEventId`,
  recorded `text`, `queued` state, creation time, and optional `nextCursor`.
  Recorded text is sensitive. The projection omits the private reply target,
  source message/channel, client operation ID, raw provider data, credentials,
  attempt data, and delivery/read state. Phase 4d added no migration: at that
  revision, `0009` was the ninth immutable migration.
- At the verified Phase 4d revision, there was no dashboard history page,
  state mutation, provider HTTP call, dispatch worker, retry, attempt, timeout,
  receipt, delivery/read tracking, provider token/OAuth storage, or browser
  send UI. The route is a read-only view of durable intent, not a delivery
  engine. The verified Phase 4e dashboard view is documented separately below.

Exact commit <code>160414e</code> passed formatting, lint, strict type
checking, 53 test files / 349 tests, build, low-threshold dependency audit,
secret scan, the synthetic Compose proof, independent security review, and
GitHub CI/CodeQL. This is source verification only; it is not a provider-send,
public-TLS, or production claim.

## Verified Phase 4e source

The source adds a narrow browser view without moving an inbox bearer or
outbound capability into the browser:

- `GET /operator/outbound-commands` appears only with the optional dashboard.
  It validates and touches the signed dashboard session before it parses a
  query, decodes a history cursor, or reads storage. A missing session redirects
  to the login page.
- The strict query accepts only an optional configured `inbox` ID and an opaque
  Phase 4d history `cursor`; it fixes page size at 50. The server resolves the
  inbox only from the authenticated principal's existing allow-list. A URL
  cannot add a connection or select another principal's inbox.
- The dashboard capability graph receives only a server-side history-read
  closure. It never contains an inbox bearer, provider credential, dispatcher,
  or generic database client. The cursor stays `orderVersion: 1` and binds the
  exact inbox/scope/snapshot as it does for the API history reader.
- The HTML renders escaped `createdAt`, recorded `text`, and
  `sourceConnectionId` with a static recorded-not-sent label. It deliberately
  omits command ID, provider event ID, private target/source metadata, client
  operation ID, raw provider data, credential, attempt, receipt, and
  delivery/read state. Responses remain `no-store` server-rendered pages.
- There is no migration, runtime-secret change, reply form, recipient picker,
  command creation/mutation, send/retry/cancel control, worker, provider HTTP
  request, token/OAuth storage, attempt, timeout policy, receipt, or state
  transition. A page view only performs the existing dashboard-session touch.
  The separate verified Phase 4f source is documented separately and is not part of
  this verified Phase 4e boundary.

Exact commit <code>465186e</code> completed focused dashboard-history tests,
the relevant local checks, independent security review, and fresh GitHub
CI/CodeQL evidence. It still does not prove external HTTPS/proxy behavior or a
production deployment.

## Verified Phase 4f source

The verified source adds a deliberately smaller dashboard write than the existing
inbox-bearer API:

- `dashboard.principals[].replyIntentInboxIds` is optional. It is a strict
  unique subset of the principal's configured readable `inboxIds`; absence
  freezes to an empty allow-list, preserving read-only behavior. It remains
  deployment-secret configuration, not a database membership or provider
  credential.
- `POST /operator/reply-intents` needs an active signed dashboard session, the
  exact configured HTTPS `Origin`, a matching anti-forgery value, and one strict
  single-value form body. It resolves the explicit per-principal inbox write
  grant before the narrow server-side Phase 4c command closure is called.
- An enabled `/operator` inbox renders one same-origin native form per already
  persisted inbound event. Text is the only editable field; source connection,
  provider event, selected inbox, anti-forgery token, and fresh UUIDv4 client
  operation ID are escaped hidden inputs. They are revalidated and do not grant
  a recipient or bypass source-scope enforcement. The rendered inbound card
  shows only channel, occurrence time, message text, and connection ID; it
  omits `conversationId`, `senderId`, private target, and source-message ID.
- The URL-encoded form has a fixed 32 KiB whole-body cap before strict parsing;
  text remains separately limited to 2,000 characters. An oversized form is
  rejected with `413` before the recorder is called. Operator HTML responses,
  including that `413`, remain `Cache-Control: no-store`.
- A new record or exact idempotent replay uses `303` post/redirect/get to
  `/operator/outbound-commands` without a command-result URL signal. The
  queued-history row is the only browser evidence of a durable record and does
  not expose a bearer, command ID, target, provider result, or delivery status.
  A fabricated `notice` query value is rejected by the strict history query.
- Phase 4f has a bounded local guard of 20 recording attempts per rolling
  minute per configured principal. It is not a distributed/edge rate limit;
  public deployment still requires verified proxy rate limiting and log
  redaction.
- It introduces no provider HTTP/client, token/OAuth storage, recipient picker,
  worker, dispatch, retry, attempt, timeout/receipt/delivery model, command
  mutation, migration, table, index, trigger, or Compose change. It reuses the
  existing Phase 4c immutable `queued` command store and migration `0009`.

Exact commit <code>74fca30</code> completed the focused behavior/security
checks and final local evidence: <code>npm run check</code> (54 test files / 358
tests and build), <code>npm audit --audit-level=low</code> with zero findings,
Gitleaks with no secrets, <code>git diff --check</code>, and a synthetic Compose
smoke with cleanup. The independent security audit returned APPROVE with zero
high/medium findings, and both GitHub checks succeeded. This does not prove
public TLS, a real provider send, or production deployment.

## Explicitly not proven or not implemented

- No owner-authorized Telegram Bot, Zalo OA, Facebook Page, Meta App, WABA,
  business phone, public HTTPS endpoint, webhook subscription, signed live
  delivery, or real customer message has been used.
- No full user identity, organization/RBAC, invitation/password-reset flow,
  audit log, public connection management, token rotation endpoint, live
  session administration, or multi-host authorization model exists. Phase 4b
  principals are configured-local dashboard entries, not a substitute for
  those capabilities.
- No conversation summary, read/unread state, assignment, labels, search,
  attachment, retention/deletion workflow, backup/restore proof,
  encryption-at-rest assurance, rate-limit, structured observability,
  alerting, or production deployment exists.
- No dispatch queue/worker, retry or timeout policy, delivery/read status,
  template, media, OAuth, provider access-token storage, Graph API request,
  Facebook User, Zalo User, or WhatsApp User surface exists. Phase 4g has only
  append-only delivery evidence and is not a delivery engine. Phase 4h has only
  historical authorization provenance and is not current send permission.
  Phase 4c has an immutable intent ledger, Phase 4d has scoped history, Phase
  4e renders that history, and the verified Phase 4f source can record the same
  source-bound intent through an explicit dashboard write grant.
- A `200` from the local synthetic feed or a green test/GitHub check does not
  prove a TLS endpoint, provider eligibility, live message operation, or a
  production-ready access model.

## Next authorized work

Keep the verified Phase 4e, Phase 4f, and Phase 4g evidence frozen at
<code>465186e</code>, <code>74fca30</code>, and <code>6444699</code>. First
close Phase 4h with its frozen candidate, final local checks, independent
review, synthetic Compose proof, and exact GitHub CI/CodeQL. Keep all live
provider use separate: require explicit owner authorization before connecting a
real account or exposing public TLS. Any later full user/organization
authorization, conversation model, dispatcher, retry policy, or dashboard
deployment must start with its own bounded design, migration/security review,
and verification criteria.
