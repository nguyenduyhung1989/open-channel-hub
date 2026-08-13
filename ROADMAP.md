# Roadmap

This roadmap describes priority order, not release dates. A checked item means
the named repository change exists; a phase is not complete until all of its
verification and operating criteria are met.

## Phase 0 — verifiable foundation (technical work complete)

- [x] Public repository, AGPL-3.0-or-later, community documentation, and
      security policy.
- [x] CI for formatting, linting, type checking, tests, builds, and code
      scanning.
- [x] GitHub CI and CodeQL succeeded at commit <code>8b80c3b</code>; Private
      Vulnerability Reporting, secret scanning, Dependabot alerts, and automatic
      security fixes are enabled.
- [x] <code>GET /health</code> and validated startup configuration.
- [x] Connector contracts, capability checks, and the original mocked Telegram
      Bot vertical slice.
- [ ] Owner decision on whether to create the <code>0.1.0</code> release tag.
      This is separate from CI/CodeQL evidence for <code>8b80c3b</code>.

The <code>main</code> branch is protected against force pushing and deletion,
including by administrators. Required status checks and pull-request reviews
are intentionally absent so the current owner-controlled direct-push workflow
remains usable; this is not a claim that all collaboration risks are solved.

The Phase 0 evidence contains no real Telegram token or request, database,
Redis, or web UI. Checked boxes describe repository state, not production
verification.

## Phase 1 — official Telegram Bot, deliberately small

**Status: the Phase 1a implementation is present, but Phase 1a is not
complete.** Historical local and GitHub evidence exists for candidate
<code>7141949</code>. Phase 2a GitHub CI and CodeQL succeeded at
<code>f106bb8</code>, and the exact Phase 2b commit <code>4d5a9c9</code> also
has both checks green. The exact Phase 2c multi-connection commit
<code>8352b51</code> and the exact Phase 3a Zalo OA commit
<code>b930d29</code> also have both checks green. The current Phase 3b Facebook
Page candidate needs its own verification. No real Telegram Bot token,
authenticated Bot API request, or test-bot flow has occurred.

### 1a — HTTP boundary and local operation

- [x] Official Telegram Bot HTTP transport for a narrow text send/receive
      scope, wired at startup when <code>TELEGRAM_BOT_ENABLED=true</code>.
- [x] Local operator API protected by <code>OPERATOR_API_TOKEN</code>; this is
      not user login or role-based access control.
- [x] Webhook requires
      <code>X-Telegram-Bot-Api-Secret-Token</code>, normalizes only valid text
      updates, and ignores other update types.
- [x] Credential-safe Telegram configuration guidance; Compose keeps the API
      host port on loopback and a webhook requires a public HTTPS URL.
- [x] Historical Phase 1a candidate evidence: full local check, low-threshold
      dependency audit, Compose configuration, independent audit, GitHub CI, and
      CodeQL at <code>7141949</code>. Its read-only runtime check was specific to
      that earlier candidate; the current Phase 2a Compose services have a
      documented read-only limitation.
- [ ] Owner-authorized test-bot verification through a public TLS URL, without
      exposing a token, header, or payload in commands or logs.

The Phase 2a ledger makes an authenticated canonical inbound text event durable
when PostgreSQL is configured. That is not a real Telegram proof, a user inbox,
or complete deduplication/rate-limit/operational assurance.

## Phase 2 — durable data and minimal operation

### 2a — scoped PostgreSQL inbound-event ledger

**Status: implementation, final local checks, a local synthetic Docker proof,
and GitHub CI/CodeQL evidence at <code>f106bb8</code> are present.**

- [x] A pinned PostgreSQL 18.4 Compose service on an internal data network,
      with no database host port.
- [x] A dedicated <code>open_channel_hub</code> database and
      <code>open_channel_hub</code> schema, plus a non-superuser
      <code>open_channel_hub</code> application role.
- [x] An idempotent, forward-only migration CLI and migration ledger run before
      the API. The API exposes <code>/ready</code> only when the expected migration
      can be checked.
- [x] A domain-owned inbound-event storage port and PostgreSQL adapter that
      stores canonical text fields with parameterized SQL, no raw provider payload,
      and a primary key on <code>(connection_id, provider_event_id)</code>.
- [x] A synthetic local Docker proof: the migration ran twice, a duplicate
      fake webhook returned <code>204</code> twice, and only one ledger row
      remained.
- [x] Final local candidate checks: formatting, lint, type checking, 63 tests,
      build, low-threshold dependency audit, Compose configuration, synthetic
      Docker verification, and independent audit.
- [x] GitHub CI and CodeQL succeeded for the actual Phase 2a commit
      <code>f106bb8</code>.
- [ ] A retention/deletion policy, backup automation, restore drill,
      access/audit model, encryption-at-rest decision, and capacity limits before
      real customer data is operated.

### 2b — operator event read path

**Status: implementation, final local verification, synthetic Compose proof,
independent review, and GitHub CI/CodeQL evidence are present for exact commit
<code>4d5a9c9</code>.**

- [x] <code>GET /v1/telegram-bot/inbound-events</code> requires the local
      operator token, never accepts a caller-selected connection ID, and returns
      only canonical events for the configured Telegram connection.
- [x] The PostgreSQL ledger has a forward-only stable sequence and a
      connection-scoped index for keyset pagination.
- [x] Opaque cursors hold a stable snapshot ceiling, so a page traversal does
      not skip or duplicate events when new events arrive later.
- [x] Ledger appends serialize sequence allocation and commit before readers
      establish a snapshot. This preserves the stable-pagination invariant.
- [x] Final local candidate checks, synthetic Compose verification of the read
      path, independent review, and fresh GitHub CI/CodeQL for exact commit
      <code>4d5a9c9</code>.

### 2c — runtime multi-connection foundation

**Status: implementation, final local verification, a synthetic Compose proof,
independent review, and GitHub CI/CodeQL evidence are complete for exact commit
<code>8352b51</code>.**

- [x] A strict, secret-backed runtime configuration document for one or more
      official Telegram Bot connections, with no startup provider call.
- [x] Mutually exclusive temporary legacy one-Bot configuration and
      multi-connection configuration modes.
- [x] Token-bound operator routes and dynamic webhook routes that resolve the
      configured account server side; callers cannot select a connection ID.
- [x] An immutable PostgreSQL connection registry and an inbound-event foreign
      key that protects new rows while retaining pre-registry Phase 2a history
      through <code>NOT VALID</code>.
- [x] A synthetic two-connection Compose smoke-test source that covers registry
      registration, per-connection idempotency, bearer isolation, and
      cross-connection cursor rejection.
- [x] Final local candidate checks, independent review, and a synthetic
      Compose verification using two configured accounts.
- [x] Fresh GitHub CI/CodeQL for the exact Phase 2c commit
      <code>8352b51</code>.

### Later Phase 2 work

- Redis, a queue, and a durable outbox only when retry needs or real load
  justify them.
- Structured logs, metrics, alerts, backups, recovery testing, and data
  retention/deletion operations.

## Phase 3 — administration experience and next official connectors

### 3a — official Zalo OA signed inbound text

**Status: implementation, final local verification, synthetic Docker proof,
independent review, and fresh GitHub CI/CodeQL are complete for exact commit
<code>b930d29</code>. A real provider acceptance test remains separate.**

- [x] An official receive-only Zalo OA connector package that exposes only
      `message.receive.text` and rejects every outbound command.
- [x] A fixed `POST /v1/webhooks/zalo-oa` route that verifies
      `X-ZEvent-Signature` over the exact raw UTF-8 JSON, resolves a configured
      `(appId, oaId)` server side, and returns `200` only after a canonical text
      event is durable.
- [x] A strict runtime-document entry for `zalo_oa`, with opaque connection ID,
      `appId`, `oaId`, `oaSecretKey`, operator bearer, and optional fixed public
      webhook URL. It does not impose an undocumented secret-sharing rule on OA
      entries that happen to use the same App ID.
- [x] A bearer-scoped `GET /v1/zalo-oa/inbound-events` route with canonical-only
      fields, bounded pagination, and account-bound opaque cursors.
- [x] A forward-only registry migration that binds each Zalo connection ID to a
      non-secret SHA-256 fingerprint of its configured `(appId, oaId)` pair. It
      prevents an ID with durable Zalo history from being silently rebound; it
      does not assert an equivalent Telegram provider-account identity.
- [x] No OAuth, access-token storage/refresh, provider HTTP client, outbound
      messages, attachments, Zalo User, automatic webhook registration, or live
      provider request.
- [x] Final local candidate checks, synthetic Compose verification, and
      independent review.
- [x] Fresh GitHub CI/CodeQL for exact commit <code>b930d29</code>.
- [ ] Owner-authorized public TLS and real signed Zalo OA webhook proof without
      exposing a secret, header, or customer message.

### 3b — official Facebook Page signed inbound text

**Status: source implementation is present; final local candidate verification,
synthetic Docker proof, independent review, and fresh GitHub CI/CodeQL remain
required for its exact commit.**

- [x] An official receive-only Facebook Page connector package that exposes only
      `message.receive.text` and rejects every outbound command.
- [x] A fixed `GET`/`POST /v1/webhooks/facebook-page` boundary that handles
      Meta verification, resolves all batch Page IDs internally, verifies
      `X-Hub-Signature-256` over exact raw request bytes, and makes canonical
      customer text durable before acknowledging it.
- [x] A strict runtime-document entry for `facebook_page`, with opaque
      connection ID, `appId`, `pageId`, App secret, verify token, unique operator
      bearer, and optional fixed public webhook URL. It permits several Pages on
      one App only with matching App credentials.
- [x] A bearer-scoped `GET /v1/facebook-page/inbound-events` route with
      canonical-only fields, bounded pagination, and Page-bound opaque cursors.
- [x] A forward-only registry migration that binds each Facebook Page connection
      ID to a non-secret SHA-256 fingerprint of its configured `(appId, pageId)`
      pair, preventing silent rebinding after durable history exists.
- [x] No Facebook User, OAuth, Page access-token storage, Graph API client,
      outbound message, attachment, automatic subscription, or live provider
      request.
- [ ] Final local candidate checks, synthetic Compose verification, and
      independent review.
- [ ] Fresh GitHub CI/CodeQL for the exact Phase 3b commit.
- [ ] Owner-authorized public TLS and real signed Facebook Page webhook proof
      without exposing a secret, header, or customer message.

### Later Phase 3 work

- A dashboard, accounts/organizations, and tested authorization.
- Evaluation of WhatsApp against current official documentation and policy at
  implementation time.
- A capability matrix, health state, and separate contract tests for each
  connector.

## Phase 4 — experimental connectors, only with evidence

Facebook User and Zalo User are not feature promises. If researched, they must
be separate, opt-in packages with constrained capabilities and clear
policy/legal risk. They must not bypass automation controls, spoof
fingerprints, evade CAPTCHA, or send bulk spam.

## Explicitly out of scope

- Bulk-sending bots, unlawful collection, or provider-limit evasion.
- Storing or publishing real data or secrets in the repository.
- Claiming a complete Func equivalent before independent slices are tested and
  operated.
