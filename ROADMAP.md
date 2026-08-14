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
<code>b930d29</code> and Phase 3b Facebook Page commit <code>c933102</code>
also have both checks green. The exact Phase 3c WhatsApp Business commit
<code>fd802cb</code> passed final local checks, independent review, a synthetic
Compose proof, and both GitHub checks. No real Telegram Bot token,
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
      did not itself assert an equivalent Telegram provider-account identity;
      candidate Phase 4i adds that separate Telegram-specific boundary.
- [x] No OAuth, access-token storage/refresh, provider HTTP client, outbound
      messages, attachments, Zalo User, automatic webhook registration, or live
      provider request.
- [x] Final local candidate checks, synthetic Compose verification, and
      independent review.
- [x] Fresh GitHub CI/CodeQL for exact commit <code>b930d29</code>.
- [ ] Owner-authorized public TLS and real signed Zalo OA webhook proof without
      exposing a secret, header, or customer message.

### 3b — official Facebook Page signed inbound text

**Status: implementation, final local verification, synthetic Docker proof,
independent review, and fresh GitHub CI/CodeQL are complete for exact commit
<code>c933102</code>. A real provider acceptance test remains separate.**

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
- [x] Final local candidate checks, synthetic Compose verification, and
      independent review.
- [x] Fresh GitHub CI/CodeQL for exact commit <code>c933102</code>.
- [ ] Owner-authorized public TLS and real signed Facebook Page webhook proof
      without exposing a secret, header, or customer message.

### 3c — official WhatsApp Business signed inbound text

**Status: implementation, final local verification, a synthetic Compose proof,
independent review, and GitHub CI/CodeQL evidence are complete for exact commit
<code>fd802cb</code>.**

- [x] An official receive-only WhatsApp Business connector package that exposes
      only `message.receive.text` and rejects every outbound command.
- [x] A standalone `GET`/`POST /v1/webhooks/whatsapp-business` boundary for a
      WhatsApp-only Meta App, plus the shared `GET`/`POST /v1/webhooks/meta`
      boundary for an App configured for both Facebook Page and WhatsApp. Both
      handle Meta verification, resolve signed batches server side, verify
      `X-Hub-Signature-256` over exact raw request bytes, and make canonical
      customer text durable before acknowledging it.
- [x] A strict runtime-document entry for `whatsapp_business`, with opaque
      connection ID, `appId`, `wabaId`, `phoneNumberId`, App secret, verify
      token, unique operator bearer, and optional public webhook URL. Phone IDs
      are unique; a WABA maps to exactly one configured App. A shared Facebook
      Page/WhatsApp App must use one identical `/v1/webhooks/meta` URL whenever
      a callback URL is declared.
- [x] A bearer-scoped `GET /v1/whatsapp-business/inbound-events` route with
      canonical-only fields, bounded pagination, and business-phone-bound
      opaque cursors.
- [x] A forward-only registry migration that binds each WhatsApp Business
      connection ID to a non-secret SHA-256 fingerprint of its configured
      `(appId, wabaId, phoneNumberId)` triple, preventing silent rebinding after
      durable history exists.
- [x] No WhatsApp User, OAuth, Graph API access-token storage, Graph API
      client, outbound message, template, attachment, automatic subscription,
      or live provider request.
- [x] Final local candidate checks, synthetic Compose verification, and
      independent review.
- [x] Fresh GitHub CI/CodeQL for exact commit <code>fd802cb</code>.
- [ ] Owner-authorized public TLS, subscription, and real signed WhatsApp
      Business webhook proof without exposing a secret, header, or customer
      message.

### Later Phase 3 work

- A capability matrix, health state, and separate contract tests for each
  connector.

## Phase 4 — configured inbox foundation

### 4a — explicit multi-connection inbound feed

**Status: implementation, final local verification, a synthetic Compose proof,
independent review, and GitHub CI/CodeQL evidence are complete for exact commit
<code>705db0a</code>.**

- [x] An optional strict `inboxes` array in the version-1 runtime secret
      document. Each entry has an opaque ID, a unique bearer token that cannot
      collide with another configured credential, and one to one hundred unique
      configured connection IDs.
- [x] `GET /v1/inbox/inbound-events` authenticates a configured inbox bearer
      before parsing its bounded query or reading storage. The route accepts no
      caller-selected inbox ID, connection ID, or connection scope.
- [x] A domain-owned PostgreSQL feed reader returns canonical inbound events
      across the explicit configured connection set in stable reverse-ledger
      order. It uses parameterized SQL, bounded input, and does not return raw
      provider payloads or database rows.
- [x] Opaque inbox cursors bind their ledger position to both the configured
      inbox ID and a SHA-256 representation of its canonical connection set.
      A different inbox or changed scope cannot reuse them.
- [x] No browser dashboard, user identity, organization/RBAC model,
      conversation summary, search, attachment, outbound action, provider
      access token, or live-provider call is implied by this read-only API.
- [x] Final local candidate checks, synthetic Compose verification, and
      independent review.
- [x] Fresh GitHub CI/CodeQL for exact commit <code>705db0a</code>.

### 4b — server-rendered local-principal dashboard

**Status: implementation, final local verification, synthetic Docker proof,
independent review, and GitHub CI/CodeQL evidence are complete for exact commit
<code>7672be9</code>. Public TLS/proxy and production evidence remain open.**

- [x] An optional strict `dashboard` object in the version-1 runtime secret.
      It requires configured inboxes, an exact external HTTPS origin, one or
      two unique signing keys, a separate session HMAC pepper, and configured
      local principals scoped only to existing inbox IDs.
- [x] Server-rendered, no-JavaScript `/operator` pages with no browser bearer,
      provider credential, connection selector, or client-side inbox API.
- [x] Exact-profile Argon2id (`m=19456,t=2,p=1`) password verification,
      signed `Secure` `HttpOnly` `SameSite=Strict` cookies, same-origin forms,
      anti-forgery tokens, a 30-minute idle timeout, eight-hour absolute
      timeout, server-side revocation, and a bounded in-process login throttle.
- [x] Forward-only PostgreSQL migration
      <code>0008_dashboard_sessions</code> that stores only HMACs of random
      browser tokens and session metadata, never raw token/password/provider
      credential/inbox bearer values.
- [x] Final local verification: formatting, lint, strict type checking, 48 test
      files / 319 tests, build, low-threshold dependency audit, secret scan,
      synthetic Compose proof, and independent review.
- [x] Fresh GitHub CI/CodeQL for exact commit <code>7672be9</code>.
- [ ] Configure and verify an external TLS reverse proxy, edge rate limiting,
      cookie/header logging policy, and the exact public browser origin before
      claiming a dashboard deployment.

### 4c — durable source-bound reply-command ledger

**Status: implementation, final local verification, synthetic Compose proof,
independent security review, and GitHub CI/CodeQL evidence are complete for
the combined Phase 4c–4d revision at exact commit <code>160414e</code>.**

- [x] `POST /v1/inbox/outbound-commands` resolves an existing configured inbox
      bearer before body parsing. It accepts only `clientOperationId`,
      `sourceConnectionId`, `sourceProviderEventId`, and `text`; there is no
      caller-selected recipient, channel, source-message ID, retry, or state.
- [x] The command store accepts only an already-durable source event inside the
      inbox's fixed connection allow-list. It derives and privately stores the
      reply target from canonical `conversation_id`, with the source message ID
      and channel, instead of trusting request input.
- [x] Migration <code>0009_outbound_reply_commands</code> creates an immutable
      `outbound_commands` table with a composite source-event foreign key,
      per-connection client-operation uniqueness, and a trigger that rejects
      update/delete. The only current state is <code>queued</code>.
- [x] A first commit returns <code>201</code>; an exact replay returns
      <code>200</code>; reuse of the same operation ID with different source
      or text returns <code>409</code>; missing and out-of-scope source events
      share one generic <code>404</code>. Public responses omit the reply
      target, text, source message/channel, raw payloads, and credentials.
- [x] No worker, dispatch, provider HTTP request, provider token/OAuth storage,
      retry, attempt, delivery/read receipt, state transition, or dashboard
      send form is part of this phase. <code>queued</code> records intent only;
      it is not a sent or delivered claim.
- [x] Exact commit <code>160414e</code> passed formatting, lint, strict type
      checking, 53 test files / 349 tests, build, low-threshold dependency
      audit, secret scan, synthetic Compose proof, independent security review,
      and fresh GitHub CI/CodeQL.

### 4d — scoped queued reply-command history

**Status: implementation, final local verification, synthetic Compose proof,
independent security review, and GitHub CI/CodeQL evidence are complete for
the combined Phase 4c–4d revision at exact commit <code>160414e</code>.**

- [x] `GET /v1/inbox/outbound-commands` resolves a configured inbox bearer
      before it validates query input or decodes a cursor. It accepts only an
      optional 1–100 `limit` and an opaque `cursor`; an HTTP caller cannot
      choose an inbox, connection, recipient, command state, or provider.
- [x] A domain-owned PostgreSQL history reader returns only queued Phase 4c
      commands inside the inbox's fixed connection allow-list, newest command
      ID first. Its public projection contains command/source IDs, recorded
      text, `queued`, and creation time; it omits target, source message/channel,
      client operation ID, raw provider data, credentials, and future
      attempt/delivery fields.
- [x] An independent base64url cursor uses `orderVersion: 1`, binds the inbox
      ID and SHA-256 canonical connection set, and freezes a command-ID
      snapshot. Foreign, changed-scope, malformed, unversioned, and unsupported
      cursors return generic <code>400</code> before storage access.
- [x] No database migration or state transition was added in Phase 4d. At that
      revision, <code>0009_outbound_reply_commands</code> was the ninth
      immutable migration, and the history reader explicitly filters `queued`
      rows only.
- [x] No dashboard history UI, worker, dispatch, provider HTTP call, token/OAuth
      storage, retry, attempt, timeout policy, receipt, delivery/read state, or
      command mutation is part of this phase.
- [x] Exact commit <code>160414e</code> passed formatting, lint, strict type
      checking, 53 test files / 349 tests, build, low-threshold dependency
      audit, secret scan, synthetic Compose proof, independent security review,
      and fresh GitHub CI/CodeQL.

### 4e — server-rendered queued reply-command history

**Status: source verified at exact commit <code>465186e</code>. This is not a
public-TLS or production claim.**

- [x] `GET /operator/outbound-commands` uses the existing signed dashboard
      session and touches it before query parsing, cursor decoding, or history
      access. It accepts only an optional safe `inbox` ID and the existing
      opaque queued-history `cursor`; the page size is fixed at 50.
- [x] The server resolves the selected inbox only from the authenticated
      principal's configured inbox allow-list. A browser URL cannot add a
      connection, select another principal's inbox, or use an inbox bearer.
- [x] The page reuses the Phase 4d history reader and `orderVersion: 1` cursor,
      including its exact inbox/scope binding and reverse command-ID snapshot.
      It renders escaped creation time, recorded text, source connection ID,
      and a clear recorded-not-sent label only.
- [x] The browser projection omits command and provider-event IDs, private
      target/source metadata, client operation ID, raw provider data,
      credential, attempt, receipt, and delivery/read state. It remains
      server-rendered without browser JavaScript or a browser API bearer.
- [x] No runtime configuration change, database migration, command mutation,
      reply form, recipient selector, send/retry/cancel control, worker,
      provider HTTP request, provider credential/OAuth storage, attempt,
      timeout policy, receipt, or delivery/read transition is added.
- [x] Exact commit <code>465186e</code> passed formatting, lint, strict type
      checking, 53 test files / 351 tests, build, low-threshold dependency
      audit, secret scan, diff check, synthetic Compose proof, independent
      security review, and fresh GitHub CI/CodeQL. The Compose proof is
      synthetic and loopback-only; it does not prove external HTTPS cookies or
      a production deployment.

### 4f — opt-in server-rendered source-bound reply intents

**Status: source verified at exact commit <code>74fca30</code>. It passed
<code>npm run check</code> (54 test files / 358 tests and build),
<code>npm audit --audit-level=low</code> with zero findings, Gitleaks with no
secrets, <code>git diff --check</code>, a synthetic Compose smoke with cleanup,
an independent security audit APPROVE with zero high/medium findings, and
GitHub checks <code>Verify Node 24.18.1</code> and <code>Analyze JavaScript and
TypeScript</code>. The synthetic smoke remains loopback-only and this evidence
does not prove external HTTPS cookies, public TLS, a live provider send, or a
production deployment.**

- [x] An optional strict `replyIntentInboxIds` array belongs to each configured
      dashboard principal. It must be a unique subset of that principal's
      existing readable `inboxIds`; omission becomes an empty immutable
      allow-list so every existing principal remains read-only by default.
- [x] `POST /operator/reply-intents` requires an active signed dashboard
      session, exact configured HTTPS origin, matching anti-forgery value, and
      a strict single-value native form. The server resolves a per-principal,
      per-inbox write closure before it calls the existing Phase 4c source-bound
      command capability.
- [x] A form appears only for an explicitly enabled inbox and one already
      rendered durable inbound event. It has editable reply text only; the
      server generates the UUIDv4 operation ID and renders the canonical source
      reference as escaped hidden input. Hidden inputs never replace server-side
      scope and source verification.
- [x] The native form parser has a fixed 32 KiB whole-body cap before strict
      validation; text remains separately bounded to 2,000 characters. An
      oversized submission returns `413` before the recorder is called.
- [x] A created command or exact idempotent replay redirects with `303` to the
      authenticated queued-history page without a command-result URL signal.
      The queued-history row is the only browser evidence of a durable record.
      A `queued` row remains intent only, never a provider acceptance, send,
      delivery, or read result.
- [x] A bounded in-process guard limits one configured principal to 20
      recording attempts in a rolling minute. It is not a multi-process,
      multi-host, or edge rate limit; proxy controls remain required before
      public exposure.
- [x] No inbox bearer/browser API, recipient picker, provider credential or
      HTTP request, dispatch worker, retry, attempt, timeout policy, receipt,
      delivery/read state, command mutation, database migration, table, index,
      trigger, or Compose service is part of this phase.

### 4g — append-only outbound delivery evidence

**Status: source verified at exact commit <code>6444699</code>.** It passed
<code>npm run check</code> (54 test files / 358 tests and build),
<code>npm audit --audit-level=low</code> with zero findings, Gitleaks with no
secrets, <code>git diff --check</code>, a synthetic Compose smoke with cleanup,
an independent security audit APPROVE with zero high/medium findings, and
GitHub checks <code>Verify Node 24.18.1</code> and
<code>Analyze JavaScript and TypeScript</code>. This verifies frozen source and
synthetic local evidence only; it does not prove provider dispatch, live
provider I/O, provider acceptance, delivery, public TLS, or production
deployment.

- [x] Forward migration
      <code>0010_outbound_delivery_attempt_receipts</code> creates immutable
      `outbound_delivery_attempts` and
      `outbound_delivery_attempt_receipts` tables. A command has at most one
      attempt row; an attempt has at most one receipt row.
- [x] The receipt constraint permits exactly `provider_accepted`,
      `provider_rejected`, and `outcome_unknown`. A recorded
      `provider_accepted` receipt requires a printable provider message ID; the
      other outcomes forbid it.
- [x] Absence of a durable attempt row supports `not_attempted` only as a
      derived current-ledger label. It never proves that no external provider
      event occurred. A durable attempt without a receipt is conservatively
      unknown.
- [x] The command remains immutable and `queued`; both evidence tables reject
      updates and deletes. No route, reader, dashboard result, provider HTTP
      request, credential, worker, queue, retry, command mutation, or delivery/
      read state is introduced.
- [x] Final local verification, independent security review, synthetic Compose
      proof with cleanup, and fresh GitHub CI/CodeQL for exact commit
      <code>6444699</code>.

### 4h — immutable reply-command authorization provenance

**Status: candidate source; verification is not complete.**

- [x] Forward migration
      <code>0011_outbound_command_authorizations</code> adds one immutable,
      one-to-one authorization-provenance row per newly created command. Its
      `command_id` is both primary key and foreign key to `outbound_commands`.
- [x] A row records only `inbox_bearer` or `dashboard_principal`, one configured
      inbox ID, an optional dashboard principal ID valid only for the latter,
      a SHA-256 scope fingerprint, and recording time. It stores no bearer,
      session, password/hash, anti-forgery value, target, text, provider data,
      delivery result, retry, or mutable state.
- [x] The PostgreSQL adapter derives the fingerprint from the sorted connection
      scope and writes provenance in the same transaction as a new command.
      Exact replay requires the same authority provenance; a mismatch conflicts
      instead of filling or mutating a row.
- [x] The runtime supplies provenance only server-side: an inbox bearer binds
      its configured inbox; a dashboard form may carry an inbox ID already
      visible to its authenticated principal, but the server treats it as
      untrusted and resolves only that principal's explicitly writable inbox
      capability. Authority kind, principal ID, and scope fingerprint are not
      browser-supplied or returned.
- [x] Commands predating `0011` remain provenance-free and are no-dispatch
      candidates. The migration does not guess or backfill historical authority.
- [x] No provider request, SDK, credential/OAuth storage, worker, queue,
      dispatcher, retry, browser bearer, dashboard send control, command
      mutation, delivery/read state, or live-provider test is introduced.
- [ ] Freeze the exact source, run final local verification, complete
      independent review, run the synthetic Compose proof, and verify GitHub
      CI/CodeQL before calling this source verified.

### 4i — Telegram private-reply eligibility evidence

**Status: candidate source; verification is not complete.**

- [x] Forward migration
      <code>0012_telegram_private_reply_eligibility</code> preserves one of
      Telegram's documented chat types (`private`, `group`, `supergroup`, or
      `channel`) for a newly stored Telegram inbound event. It leaves historic
      rows as unknown and does not expose this internal field through public
      readers or dashboard HTML.
- [x] A Telegram connection registration now requires a domain-separated
      non-secret SHA-256 fingerprint derived from the numeric Bot-ID prefix of
      the configured `<bot-id>:<secret>` token. It never stores the prefix or
      secret. A historic connection with inbound rows and no prior fingerprint
      cannot be silently adopted; use a new connection ID instead.
- [x] A new Telegram reply command can be recorded only from a durable private
      source with a current Bot fingerprint. Its command, Phase 4h authority
      provenance, and one immutable `outbound_telegram_command_eligibility`
      row are one PostgreSQL transaction.
- [x] Group, supergroup, channel, unknown historic chat type, missing/changed
      Bot binding, missing source, and out-of-scope source fail closed. A
      Telegram command predating this row is not adopted by an idempotent
      replay. Non-Telegram command behavior stays unchanged.
- [x] No provider request, SDK, credential/OAuth storage, worker, dispatcher,
      retry, attempt write, receipt write, browser field, command mutation,
      delivery/read state, or live-provider test is introduced.
- [ ] Freeze the exact source, run final local verification, complete
      independent review, run the synthetic Compose proof, and verify GitHub
      CI/CodeQL before calling this source verified.

### 4j — Telegram delivery-authorization evidence

**Status: candidate source; verification is not complete.**

- [x] Optional strict
      `dashboard.principals[].telegramDeliveryAuthorizationInboxIds` is an
      independent unique subset of each principal's readable inboxes. Omission
      stays read-only and does not grant approval authority.
- [x] A separate server-only dashboard capability can record one immutable
      Telegram authorization fact only for an already server-eligible queued
      command. The inbox bearer catalog and browser never receive this
      capability, a provider credential, or a recipient.
- [x] Forward migration
      <code>0013_outbound_telegram_delivery_authorizations</code> stores one
      row at most per Phase 4i eligible command: configured inbox/principal,
      SHA-256 scope fingerprint, opaque Bot fingerprint, and recording time.
      It rejects updates and deletes.
- [x] The PostgreSQL writer rechecks current private source, Phase 4h
      provenance, current Bot binding, fixed inbox scope, no delivery attempt,
      and no existing authorization. Missing, historic, out-of-scope,
      non-private, drifted, and attempted commands fail closed.
- [x] No provider request, SDK, worker, dispatcher, retry, attempt/receipt
      write, command mutation, delivery/read state, or live-provider test is
      introduced. The one-operator alpha permits self-authorization and is not
      dual control.
- [ ] Freeze the exact source, run final local verification, complete
      independent review, run the synthetic Compose proof, and verify GitHub
      CI/CodeQL before calling this source verified.

### Later Phase 4 work

- Full user accounts/organizations, tested RBAC, invitation/password-reset
  flow, audit trail, live session administration, and managed secret rotation.
- Conversation summaries, read/unread state, assignment, labels, search,
  attachments, retention/deletion, backups/restore, and encryption-at-rest
  assurance.
- Provider-specific dispatch policy/capabilities, timeout uncertainty,
  delivery/read status, and retries only after official provider review and a
  separate security boundary. Phase 4g evidence, Phase 4h provenance, Phase
  4i private-reply evidence, and Phase 4j delivery-authorization evidence are
  not any of those delivery capabilities.

## Phase 5 — experimental connectors, only with evidence

Facebook User and Zalo User are not feature promises. If researched, they must
be separate, opt-in packages with constrained capabilities and clear
policy/legal risk. They must not bypass automation controls, spoof
fingerprints, evade CAPTCHA, or send bulk spam.

## Explicitly out of scope

- Bulk-sending bots, unlawful collection, or provider-limit evasion.
- Storing or publishing real data or secrets in the repository.
- Claiming a complete Func equivalent before independent slices are tested and
  operated.
