# Roadmap

This roadmap describes priority order, not release dates. An item moves to “done” only after its criteria are met.

## Phase 0 — verifiable foundation (technical work complete)

- [x] Public repository, AGPL-3.0-or-later, community documentation, and security policy.
- [x] CI for formatting, linting, type checking, tests, builds, and code scanning.
- [x] GitHub CI and CodeQL succeeded at commit `8b80c3b`; Private Vulnerability Reporting, secret scanning, Dependabot alerts, and automatic security fixes are enabled.
- [x] `GET /health` and validated startup configuration.
- [x] Connector contracts, capability checks, and the original mocked `Telegram Bot` vertical slice.
- [ ] Owner decision on whether to create the `0.1.0` release tag. This is a release decision separate from the CI/CodeQL evidence for `8b80c3b`.

Branch protection is intentionally open pending an owner decision; it must not be described as enabled merely because other security services are active.

The Phase 0 evidence contains no real Telegram token or request, database, Redis, or web UI.

Checked boxes describe code and configuration in the repository. They do not replace green CI on a final release commit or production verification.

## Phase 1 — official Telegram Bot, deliberately small

**Status: Phase 1a implementation and final local candidate verification are complete; Phase 1a itself is not complete.** `npm run check` passed with seven test files, fifty tests, and a build; `npm audit --audit-level=low` found zero vulnerabilities; `docker compose config --quiet` passed; the non-root, read-only runtime image was built and checked; and an independent audit passed. No real token or network test has occurred, and GitHub CI/CodeQL has not yet run for this candidate.

### 1a — HTTP boundary and local operation

- [x] Official Telegram Bot HTTP transport for a narrow text send/receive scope, wired at startup when `TELEGRAM_BOT_ENABLED=true`.
- [x] Local operator API protected by `OPERATOR_API_TOKEN`; this is not user login or role-based access control.
- [x] Webhook requires `X-Telegram-Bot-Api-Secret-Token`, normalizes only valid text updates, and does not persist conversations before Phase 2.
- [x] Credential-safe configuration guidance; Compose keeps the host port on loopback and the webhook requires a public HTTPS URL. `TELEGRAM_WEBHOOK_URL` is optional and, when set, cannot contain userinfo, a query string, a fragment, or a secret.
- [x] Final local candidate verification: full suite (`npm run check`, seven files and fifty tests, plus build), dependency audit with zero reported vulnerabilities, Compose configuration, non-root/read-only Docker runtime checks, and independent audit.
- [ ] GitHub CI and CodeQL evidence for the final candidate; the last verified GitHub result remains `8b80c3b`.
- [ ] Authorized test-bot verification through a public TLS URL, without exposing a token, header, or payload in commands or logs.

- The transport, configuration, webhook authentication, and focused offline tests are complete.
- Phase 1a is complete only after fresh CI/CodeQL evidence for the final candidate and an authorized test-bot check through TLS. Neither has occurred.

## Phase 2 — durable data and minimal operation

- PostgreSQL, safe migrations, and a storage boundary with clear ownership.
- Redis, a queue, and a durable outbox only when retry needs or real load justify them.
- Structured logs, metrics, backups, and data retention/deletion policy.

## Phase 3 — administration experience and next official connectors

- A dashboard, accounts/organizations, and tested authorization.
- Evaluation of Facebook Page, Zalo OA, and WhatsApp against current official documentation and policy at implementation time.
- A capability matrix, health state, and separate contract tests for each connector.

## Phase 4 — experimental connectors, only with evidence

Facebook User and Zalo User are not feature promises. If researched, they must be separate, opt-in packages with constrained capabilities and clear policy/legal risk. They must not bypass automation controls, spoof fingerprints, evade CAPTCHA, or send bulk spam.

## Explicitly out of scope

- Bulk-sending bots, unlawful collection, or provider-limit evasion.
- Storing or publishing real data or secrets in the repository.
- Claiming “a complete Func equivalent” before independent slices are tested and operated.
