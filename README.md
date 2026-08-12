# Open Channel Hub

> A self-hosted, official-first multichannel messaging hub.

**Status: Phase 1a alpha; local and GitHub verification have passed, but an owner-authorized live Telegram/TLS check is still required.** GitHub CI and CodeQL succeeded for the Phase 1a candidate at commit `7141949`. That is evidence for that commit, not a release: creating a `0.1.0` tag remains a separate owner decision.

The official `Telegram Bot` HTTP transport and startup wiring are implemented. A local operator uses `OPERATOR_API_TOKEN`; Telegram must supply a separate `X-Telegram-Bot-Api-Secret-Token` webhook header. `npm run check` passed with seven test files, fifty tests, and a build; `npm audit --audit-level=low` found zero vulnerabilities; `docker compose config --quiet` passed; and an independent audit passed. The runtime image was built and checked as a non-root, read-only container: a missing `SOURCE_OFFER_URL` fails fast, while a synthetic non-secret source URL produced healthy `/health` and correct `/source` responses. The bundled webhook CLI exits safely while Telegram is disabled and no real environment is present. The implementation only normalizes inbound text messages and does **not** persist conversations or provide a durable inbox before Phase 2. No real Telegram token, network request, webhook registration, send/receive confirmation, or production verification has occurred.

Open Channel Hub is intended to give small teams a shared multichannel core without hiding risk. Official APIs come first. Any session-based or unsupported connector must remain experimental, isolated, opt-in, and must never include CAPTCHA bypass, fingerprint spoofing, session theft, or bulk-spam capabilities.

## What works today?

- A minimal HTTP server with `GET /health`.
- Data contracts, connector ports, and capability checks for the `Telegram Bot` slice.
- When `TELEGRAM_BOT_ENABLED=true`, the official Telegram HTTP transport is wired at startup: a local operator API sends text and a separately authenticated webhook receives text updates.
- A narrow Telegram text-update normalizer covered by 41 API and connector tests using synthetic, offline data; other update types are ignored.
- Formatting, linting, type checking, tests, and builds that can run locally and in CI.

`Telegram Bot` is not presented as an Internet-proven integration. The code, startup wiring, focused offline tests, local runtime verification, independent audit, GitHub CI, and CodeQL are complete for commit `7141949`. The remaining evidence is an owner-authorized real bot/TLS check. See [the Phase 1a Telegram Bot operations guide](docs/operations/telegram-bot-1a.md) for credential-safe setup instructions.

## What is not here yet?

The following are plans, not claims of existing functionality:

- PostgreSQL, Redis, a durable outbox, retries, and persisted conversations.
- A web dashboard, user accounts, role-based access control, multiple organizations, and webhook administration.
- Facebook Page, Facebook User, Zalo OA, Zalo User, and WhatsApp.

See [ROADMAP.md](ROADMAP.md) for the criteria before each phase can be called complete.

## Quick start

No secret or Telegram account is required for the Phase 0 baseline and offline checks. Leave `TELEGRAM_BOT_ENABLED=false` if you only want the health check and tests that do not make network requests.

```bash
git clone https://github.com/nguyenduyhung1989/open-channel-hub.git
cd open-channel-hub
npm ci
cp .env.example .env
npm run check
npm run dev
```

In another terminal, verify the server:

```bash
curl http://127.0.0.1:3000/health
```

The response should resemble:

```json
{ "success": true, "data": { "service": "open-channel-hub", "status": "ok" } }
```

`.env.example` contains no sample token. For Phase 1a configuration, enter secrets through a local editor or the deployment environment's secret store; never paste them into shell commands, issues, pull requests, or logs.

## Run with Docker

`compose.yaml` creates **one local operator alpha API**. It passes Phase 1a variables from `.env` into the container while keeping Telegram disabled by default. It does not create PostgreSQL, Redis, TLS, a public proxy, or a complete production environment.

```bash
cp .env.example .env
# Set SOURCE_OFFER_URL in .env to the public, unauthenticated exact corresponding source for this version.
docker compose up --build
curl http://127.0.0.1:3000/health
```

The host port is published only at `127.0.0.1`. Because Compose sets `NODE_ENV=production`, `docker compose up` requires a nonblank `SOURCE_OFFER_URL` in `.env`; do not use a synthetic or upstream URL unless it actually provides the exact source for the running version. Telegram can call a webhook only through a public HTTPS URL, so place a TLS reverse proxy in front of Compose, keep the operator API on loopback, and follow a secret-safe webhook setup process. `TELEGRAM_WEBHOOK_URL` is optional and may be blank. If it is set, it must be an absolute public `https://` URL for `/v1/webhooks/telegram-bot`, with no username, password, query string, fragment, or secret in the URL. Starting Compose does not provide TLS or register a webhook automatically; see [the operations guide](docs/operations/telegram-bot-1a.md) for the authorized runtime command.

## Corresponding-source offer

Every response includes a `Link: <SOURCE_OFFER_URL>; rel="source"` header, and unauthenticated `GET /source` returns the same source-offer URL in JSON. This is a practical implementation aid for the AGPL section 13 source-offer requirement; it is not legal advice.

`SOURCE_OFFER_URL` is required whenever `NODE_ENV=production`, including the supplied Compose service. It must be an absolute public HTTPS URL with no username, password, query string, fragment, or secret. The target must be available without authentication and provide the exact corresponding source for the version actually running. A fork or modified SaaS deployment must set its own corresponding-source URL; it must not leave the upstream repository as a placeholder.

## Develop and verify

CI and Docker use Node.js `24.18.1`. The main commands are:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run check
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Architecture decisions are in [docs/adr](docs/adr/README.md), and the current security boundary is in [docs/security/threat-model.md](docs/security/threat-model.md).

## License and network services

The source code is licensed under the [GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)](LICENSE).

In short: if you modify Open Channel Hub and let others interact with the **modified version** over a network, AGPL section 13 requires that version to offer remote users the corresponding source code of the running version at no charge. The `/source` endpoint and `Link` header support that operating practice, but this README is not legal advice. Read the full [LICENSE](LICENSE) before distributing, deploying, or combining the software.

AGPL does not prohibit selling software, operating a hosted service, or providing commercial support. The project does not promise an alternative commercial license; see [ADR-0004](docs/adr/0004-agpl-and-future-commercial-options.md) for the reasoning and conditions to consider if that changes.

## Community and security

- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Support: [SUPPORT.md](SUPPORT.md)
- Private vulnerability reporting: [SECURITY.md](SECURITY.md)
- Governance: [GOVERNANCE.md](GOVERNANCE.md)

Do not open a public issue for a vulnerability or paste a token, cookie, phone number, real conversation content, or `.env` file anywhere in the public repository.

## Open-source readiness record

This repository aims for a public, tested, accountable maintenance history, not cosmetic activity. Evidence and remaining work are recorded transparently in [docs/maintainers/oss-readiness.md](docs/maintainers/oss-readiness.md).
