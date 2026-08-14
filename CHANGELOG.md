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
- Phase 3c: an official WhatsApp Business receive-only connector package that
  supports canonical incoming-text normalization and rejects every provider
  command.
- Phase 3c: standalone `GET`/`POST /v1/webhooks/whatsapp-business` routes for
  an App used only by WhatsApp, plus shared `GET`/`POST /v1/webhooks/meta`
  routes for one App configured for both Facebook Page and WhatsApp. Both
  handle Meta verification, resolve complete batches to one App, verify
  `X-Hub-Signature-256` over exact raw request bytes, and append canonical text
  before acknowledging it.
- Phase 3c: a token-bound `GET /v1/whatsapp-business/inbound-events` route
  with canonical-only fields and business-phone-bound opaque cursors.
- Phase 3c: a forward-only PostgreSQL registry migration that binds each
  WhatsApp Business connection ID to a non-secret SHA-256 fingerprint of its
  configured `(appId, wabaId, phoneNumberId)` triple, preventing silent
  rebinding after durable history exists.
- A synthetic Compose smoke-test source with two WhatsApp Business phones on
  one fake WABA and an App shared with two fake Facebook Pages. It checks the
  common Meta challenge callback, raw-byte HMAC rejection, multi-phone durable
  append, duplicate idempotency, business-phone bearer/cursor isolation,
  registry metadata, secret-file mode, and PostgreSQL role safety without
  provider network access.
- Phase 4a: an optional strict `inboxes` array in the version-1 runtime secret
  document. Each configured inbox has its own bearer token and an explicit
  allow-list of one or more configured connection IDs.
- Phase 4a: `GET /v1/inbox/inbound-events`, a canonical-only aggregate feed
  over one token-resolved inbox scope. It uses the durable ledger's stable
  reverse sequence and has no caller-selectable inbox or connection ID.
- Phase 4a: a PostgreSQL inbound-event feed reader and opaque cursors bound to
  the configured inbox ID plus a SHA-256 binding of its canonical connection
  set. A cursor cannot move across inboxes or a changed scope.
- A synthetic Compose smoke-test source with two configured inboxes spanning
  multiple fake provider accounts. It checks aggregate scope, bearer isolation,
  cursor-scope rejection, canonical-only output, secret-file mode, and
  PostgreSQL role safety without provider network access.
- Phase 4b: an optional server-rendered, no-JavaScript operator
  dashboard scoped to existing configured inboxes. It exposes HTML/CSS only;
  browser code never receives an inbox bearer, provider credential, or
  connection-selection capability.
- Phase 4b: an Argon2id password-hash CLI using the exact
  `m=19456,t=2,p=1` profile, configured local principals, signed secure
  browser cookies, anti-forgery forms, bounded session lifetime, and forward
  migration <code>0008_dashboard_sessions</code> for HMAC-only session
  metadata.
- Phase 4c: `POST /v1/inbox/outbound-commands`, authenticated by an existing
  configured inbox bearer before body parsing. It records a reply intent only
  for an already durable inbound source event in that inbox's server-selected
  connection scope.
- Phase 4c: forward migration <code>0009_outbound_reply_commands</code> and
  an immutable PostgreSQL command ledger. It snapshots private reply target,
  source message ID, and channel from canonical source data; callers never
  provide or receive those fields.
- Phase 4c: exact per-connection idempotency for a client operation ID, safe
  `201` create/`200` replay/`409` conflict behavior, and indistinguishable
  missing versus out-of-scope `404` responses. It adds no dispatch, provider
  request, retry, attempt, receipt, OAuth/token storage, or dashboard send UI.
- Phase 4d: `GET /v1/inbox/outbound-commands`, authenticated by the existing
  inbox bearer before application query/cursor validation. It returns a
  scope-bound read-only history of queued Phase 4c intents.
- Phase 4d: a separate version-1 base64url cursor bound to the exact inbox ID
  and canonical connection set. It uses a stable reverse command-ID snapshot
  and cannot be reused for inbound events, another inbox, or a changed scope.
- Phase 4d: a safe history projection containing command/source IDs, recorded
  text, `queued`, and creation time only. It exposes no reply target, source
  message/channel, client operation ID, raw provider data, credential, or
  future attempt/delivery field, and adds no database migration or dispatch.
- Phase 4e: `GET /operator/outbound-commands`, a server-rendered
  queued-command history page for an already authenticated dashboard principal.
  It selects only that principal's configured inbox, uses the existing
  scope-bound Phase 4d cursor, and fixes the page size at 50.
- Phase 4e: an intentionally smaller browser projection of queued
  history. It escapes and renders only creation time, recorded text, source
  connection ID, and a recorded-not-sent label; it exposes no browser bearer,
  command/provider-event ID, private target/source metadata, client operation
  ID, credential, or delivery data.
- Phase 4f: optional strict `dashboard.principals[]`
  `replyIntentInboxIds` entries. They are explicit unique subsets of each
  principal's readable inboxes; omission remains read-only.
- Phase 4f: `POST /operator/reply-intents`, a server-rendered native
  event-card form that requires signed dashboard session, exact origin,
  anti-forgery value, explicit per-inbox write grant, strict source-bound
  fields, and the existing immutable Phase 4c command capability. It uses
  `303` post/redirect/get to queued history after a create or exact replay.
- Phase 4f: server-generated UUIDv4 operation IDs, a bounded local
  20-attempt-per-principal rolling-minute guard, and no browser bearer,
  recipient field, provider request, worker, dispatch, retry, delivery state,
  command mutation, migration, or Compose change.
- Phase 4g: forward migration
  <code>0010_outbound_delivery_attempt_receipts</code> with append-only
  `outbound_delivery_attempts` and `outbound_delivery_attempt_receipts` tables.
  They record at most one durable attempt fact per command and one optional
  receipt per attempt; they add no provider I/O, worker, retry, route, browser
  result, command mutation, or delivery/read claim.
- Phase 4g: the receipt constraint permits exactly
  `provider_accepted`, `provider_rejected`, or `outcome_unknown`. Only
  `provider_accepted` has a provider message ID. Absence of a durable attempt
  row supports a derived `not_attempted`-in-this-ledger label only; it never
  proves no external call happened. A stored attempt with no receipt is
  conservatively unknown.
- Phase 4h candidate: forward migration
  <code>0011_outbound_command_authorizations</code> adds one immutable
  authorization-provenance row at most per new source-bound command. It records
  only `inbox_bearer` or `dashboard_principal`, configured inbox ID, optional
  dashboard principal ID, a scope fingerprint, and recording time.
- Phase 4h candidate: the server supplies provenance only inside the inbox
  feature boundary. The PostgreSQL adapter derives the fingerprint from the
  sorted allowed connection scope, writes the row atomically with a new
  command, and treats a mismatched authority provenance on replay as a
  conflict. It adds no provider I/O, provider credential, worker, dispatch,
  retry, browser send control, or delivery/read claim.
- Phase 4i candidate: forward migration
  <code>0012_telegram_private_reply_eligibility</code> retains a recognized
  Telegram chat type only for newly stored Telegram inbound rows, requires an
  opaque Bot fingerprint from the numeric prefix of a configured token, and
  writes immutable `private` eligibility evidence with each new Telegram reply
  command. Historic Telegram rows/commands are not backfilled or adopted.
- Phase 4i candidate: group, supergroup, channel, unknown historic chat type,
  and missing/changed Bot identity fail closed before a Telegram intent can be
  created. The field/fingerprint stay out of public readers and dashboard HTML;
  this adds no Telegram request, worker, dispatch, retry, attempt/receipt,
  delivery state, or live-provider claim.
- Phase 4j candidate: optional strict
  `dashboard.principals[].telegramDeliveryAuthorizationInboxIds` grants a
  separate immutable-authorization capability only for an already readable
  inbox. Omission is read-only and does not grant approval authority.
- Phase 4j candidate: forward migration
  <code>0013_outbound_telegram_delivery_authorizations</code> records one
  immutable approval fact at most for a current private Telegram command with
  matching Phase 4h provenance, current Bot identity, and no delivery attempt.
  It stores no target, text, credential, provider request, attempt, receipt,
  retry, or mutable state, and it does not dispatch a provider message.

### Changed

- The documentation now distinguishes historical Phase 1a verification at
  <code>7141949</code>, completed Phase 2a GitHub CI/CodeQL at
  <code>f106bb8</code>, completed Phase 2b GitHub CI/CodeQL at exact commit
  <code>4d5a9c9</code>, completed Phase 2c GitHub CI/CodeQL at exact commit
  <code>8352b51</code>, completed Phase 3a GitHub CI/CodeQL at
  <code>b930d29</code>, completed Phase 3b GitHub CI/CodeQL at
  <code>c933102</code>, and completed Phase 3c final local checks,
  independent review, synthetic Compose proof, and GitHub CI/CodeQL at exact
  commit <code>fd802cb</code>; Phase 4a completed the same evidence at exact
  commit <code>705db0a</code>; Phase 4b completed the same evidence at exact
  commit <code>7672be9</code>; and the combined Phase 4c–4d reply-intent and
  history revision completed the same evidence at exact commit
  <code>160414e</code>.
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
- The version-1 runtime document now also supports `whatsapp_business` entries.
  Business phone IDs and operator bearers remain unique, one WABA resolves to
  one configured App, and an App shared with Facebook Page uses one declared
  public `/v1/webhooks/meta` callback rather than conflicting product URLs.
- The version-1 runtime document now optionally supports configured
  read-only `inboxes`. Their unique bearer credentials resolve a fixed,
  explicit connection allow-list server side; this does not create a user,
  organization, role, or dashboard.
- Per-account inbound-event cursors issued before Phase 4a are intentionally
  rejected with <code>400</code>. The durable ledger now orders by its numeric
  sequence rather than a text alias; callers must restart from page one after
  upgrading so a mixed ordering cannot silently skip events.
- The supplied loopback-only HTTP Compose smoke advances the Phase 4h–4j
  candidate to thirteen immutable schema migrations. Its disposable synthetic
  dashboard configuration manually forwards a signed `Secure` cookie to `curl`
  so the server-rendered authorization route exercises the PostgreSQL writer.
  It checks the authorization-provenance, Telegram private-reply eligibility,
  and Telegram delivery-authorization tables, their foreign keys, primary
  keys, named constraints, exact columns, and immutable triggers. It also
  proves authorization create, exact replay, different-principal conflict, and
  unavailable legacy/Bot-drifted/non-private/already-attempted branches on
  PostgreSQL. Direct fixture SQL creates only disposable synthetic candidates
  and one existing attempt; the authorization writer never creates an attempt
  or provider receipt. This is not browser-over-HTTP or external HTTPS-cookie
  proof, and it does not contact a provider.
- Exact commit <code>465186e</code> completed Phase 4e local verification:
  formatting, lint, strict type checking, 53 test files / 351 tests, build,
  low-threshold dependency audit, secret scan, diff check, and synthetic
  Compose proof. An independent security review approved it with no remaining
  high- or medium-severity finding, and GitHub CI plus CodeQL succeeded for
  that exact commit. This remains no public-TLS, live-provider, or production
  deployment claim.
- Exact commit <code>74fca30</code> completed Phase 4f source verification:
  <code>npm run check</code> (54 test files / 358 tests and build),
  <code>npm audit --audit-level=low</code> with zero findings, Gitleaks with no
  secrets, <code>git diff --check</code>, a synthetic Compose smoke with
  cleanup, and an independent security audit APPROVE with zero high/medium
  findings. GitHub checks <code>Verify Node 24.18.1</code> and
  <code>Analyze JavaScript and TypeScript</code> succeeded for that exact
  commit. This remains no public-TLS, live-provider, provider-send, or
  production-deployment claim.
- Exact commit <code>6444699</code> completed Phase 4g source verification:
  <code>npm run check</code> (54 test files / 358 tests and build),
  <code>npm audit --audit-level=low</code> with zero findings, Gitleaks with no
  secrets, <code>git diff --check</code>, a synthetic Compose smoke with
  cleanup, and an independent security audit APPROVE with zero high/medium
  findings. GitHub checks <code>Verify Node 24.18.1</code> and
  <code>Analyze JavaScript and TypeScript</code> succeeded for that exact
  commit. This remains no public-TLS, live-provider-I/O, provider-acceptance,
  delivery, read-status, or production-deployment claim.

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
- WhatsApp Business webhook signatures are compared only after every batch WABA
  ID resolves to one configured App. The HMAC uses the original raw request
  bytes; unknown/malformed/cross-App batches and invalid signatures return the
  same `401`, while raw payloads and App credentials never enter the database.
- The aggregate inbox route authenticates its configured bearer before query
  parsing or storage access, never accepts a caller-selected scope, keeps inbox
  tokens distinct from connection credentials, and binds cursors to the inbox
  ID plus canonical connection set. It returns canonical events only.
- The optional dashboard stores Argon2id password hashes only in the runtime
  secret, and PostgreSQL stores only HMACs of random browser token values. Its
  cookie signing keys and session pepper must be distinct from each other and
  every provider, webhook, account-operator, and inbox credential. Login and
  logout enforce the exact configured external HTTPS origin and anti-forgery
  tokens. The feature is locally verified, but has not verified a TLS proxy or
  production deployment.
- The durable reply-command route authenticates the inbox bearer before body
  parsing, accepts no caller-selected recipient, and stores only a private
  target derived from an in-scope canonical source event. Its public response
  omits message text and private source/target fields; `queued` is a durable
  intent, not a provider-delivery claim.
- The queued command-history route authenticates the inbox bearer before
  application query/cursor validation, fixes its scope server side, and returns
  recorded text only with safe command metadata. Its separate cursor binds the
  inbox/scope/snapshot; private target/source fields, client operation IDs,
  credentials, dispatch behavior, and delivery semantics remain absent.
- The Phase 4e dashboard-history source authenticates and touches the
  signed browser session before query/cursor processing, then resolves only a
  configured principal's inbox. It makes no provider request and adds no
  dashboard write, command mutation, or browser bearer capability.
- The verified Phase 4f source requires a signed dashboard session, exact configured
  HTTPS origin, anti-forgery form value, and explicit principal/inbox write
  grant before it invokes the existing source-bound command store. Its hidden
  source and UUID operation fields are revalidated transport inputs, not
  authorization. The local 20-attempt-per-principal guard is not a
  cross-process or edge rate limit, and `queued` remains not sent.
- The <code>main</code> branch now blocks force pushes and deletion, including
  for administrators. Required checks and pull-request reviews remain
  intentionally unset for the owner-controlled direct-push workflow.

There has been no official release. A version is dated here only when its
release tag is created after final checks.
