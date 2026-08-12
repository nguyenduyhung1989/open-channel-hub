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

Branch protection is intentionally open pending an owner decision; it must not
be described as enabled merely because other security services are active.

The Phase 0 evidence contains no real Telegram token or request, database,
Redis, or web UI. Checked boxes describe repository state, not production
verification.

## Phase 1 — official Telegram Bot, deliberately small

**Status: the Phase 1a implementation is present, but Phase 1a is not
complete.** Historical local and GitHub evidence exists for candidate
<code>7141949</code>. The current Phase 2a work adds storage and has passed its
own final local verification; fresh GitHub evidence remains pending. No real
Telegram Bot token, authenticated Bot API request, or test-bot flow has
occurred.

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

**Status: implementation, final local checks, and a local synthetic Docker
proof are present; fresh GitHub evidence is pending.**

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
- [ ] Fresh GitHub CI/CodeQL for the actual Phase 2a commit.
- [ ] A retention/deletion policy, backup automation, restore drill,
      access/audit model, encryption-at-rest decision, and capacity limits before
      real customer data is operated.

### Later Phase 2 work

- Redis, a queue, and a durable outbox only when retry needs or real load
  justify them.
- Structured logs, metrics, alerts, backups, recovery testing, and data
  retention/deletion operations.

## Phase 3 — administration experience and next official connectors

- A dashboard, accounts/organizations, and tested authorization.
- Evaluation of Facebook Page, Zalo OA, and WhatsApp against current official
  documentation and policy at implementation time.
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
