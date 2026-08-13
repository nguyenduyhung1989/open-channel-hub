# Public checkpoint: Phase 4a–4b verified; Phase 4c–4d candidates

**Verified scope:** Phase 4a is a configured, read-only aggregate feed across
an explicit set of existing official connections. It builds on the Telegram
Bot, Zalo OA, Facebook Page, and WhatsApp Business runtime configuration and
durable PostgreSQL inbound-event ledger.

**Verified local scope:** Phase 4b adds an optional server-rendered
local-principal browser view over that same inbox scope. It is not a deployed
browser service or a full user login, organization/RBAC model,
conversation/thread model, search service, attachment store, outbound queue,
provider credential manager, real provider test, or production deployment.

**Current candidate scope:** Phase 4c adds a durable, source-bound reply-command
ledger behind an existing configured inbox bearer. Phase 4d adds a scoped,
read-only history over those same immutable `queued` intents. Neither candidate
dispatches a provider message, retries, tracks an attempt/receipt, or adds a
dashboard reply or history surface. Final local verification, synthetic Compose
proof, independent security review, and fresh GitHub CI/CodeQL evidence remain
pending for the frozen Phase 4c–4d candidate.

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
- Historical evidence proves only those exact revisions. It does not verify any
  live provider account or the current Phase 4c–4d candidate.

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

## Current Phase 4c–4d candidates

The candidate adds one narrow write capability to a configured inbox bearer:

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
  attempt data, and delivery/read state. It adds no migration: `0009` remains
  the ninth immutable migration.
- There is no dashboard history page, state mutation, provider HTTP call,
  dispatch worker, retry, attempt, timeout, receipt, delivery/read tracking,
  provider token/OAuth storage, or browser send UI. The route is a read-only
  view of durable intent, not a delivery engine.

The candidates must not be described as locally verified until their exact
frozen revision completes the relevant checks and independent review.

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
- No dispatch queue/worker, retry, attempt/timeout policy, delivery/read status,
  template, media, OAuth, provider access-token storage, Graph API request,
  Facebook User, Zalo User, or WhatsApp User surface exists. Phase 4c has only
  an immutable intent ledger and Phase 4d has only its scoped history, not a
  delivery engine.
- A `200` from the local synthetic feed or a green test/GitHub check does not
  prove a TLS endpoint, provider eligibility, live message operation, or a
  production-ready access model.

## Next authorized work

Freeze and verify Phase 4c–4d before claiming either candidate: run the frozen
candidate's full local checks, synthetic Compose proof, independent security
review, and fresh GitHub CI/CodeQL. Keep all live provider use separate: require explicit owner
authorization before connecting a real account or exposing public TLS. Any later
full user/organization authorization, conversation model, dispatch engine, or
dashboard deployment must start with its own bounded design, migration/security
review, and verification criteria.
