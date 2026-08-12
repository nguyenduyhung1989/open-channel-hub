# Contributing to Open Channel Hub

Thank you for helping improve the project. It is in Phase 2a / alpha: the official `Telegram Bot` HTTP transport, startup wiring, durable PostgreSQL inbound-event storage, and synthetic offline tests exist. An unauthenticated HTTPS reachability probe succeeded, but no real credential, authenticated Bot API request, webhook, or production verification has occurred. The most useful contribution is therefore a small, well-reasoned change with matching checks.

## Before you begin

1. Read [README.md](README.md), [ROADMAP.md](ROADMAP.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), the [Phase 0–2a threat model](docs/security/threat-model.md), the [Phase 1a Telegram Bot operating boundary](docs/operations/telegram-bot-1a.md), the [Phase 2a PostgreSQL operations guide](docs/operations/postgresql-phase-2a.md), and any relevant [ADRs](docs/adr/README.md).
2. Search existing issues and pull requests to avoid duplicate work.
3. Open a discussion issue first for significant architecture, connector, or privacy changes. Do not drop an unbounded design into a pull request.

## Set up your environment

Use Node.js `24.18.1`, the exact version pinned by CI and Docker.

```bash
git clone https://github.com/nguyenduyhung1989/open-channel-hub.git
cd open-channel-hub
npm ci
cp .env.example .env
npm run check
```

No token or provider account is required for offline tests. If an offline workflow requires a contributor to possess a real secret, report it as a design defect. A live Telegram test is a separate operational step and requires owner authorization.

## Make a change

- Create a descriptive branch, such as `feature/telegram-normalizer` or `fix/health-response`.
- Keep business rules in `packages/domain`; connectors translate provider data through contracts in `packages/connector-sdk` and `packages/contracts`.
- Treat data from HTTP, webhooks, and providers as untrusted. Validate it at the boundary before use.
- A send action must be blocked before a provider call when the connector does not advertise that capability.
- Write behavioral tests for success, invalid input, and unavailable capability. Tests must not make real network calls.
- Do not add another database, Redis, a queue, or a UI merely because it may be useful later. PostgreSQL exists for the current inbound ledger; further operational services require a demonstrated need.

Before opening a pull request, run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Or run all checks at once:

```bash
npm run check
```

## Pull requests

A pull request should address one main idea and clearly state:

- The problem and why the change is needed.
- What is in scope and what is intentionally not included.
- The verification commands that ran and their results.
- Compatibility, security, or data risks.
- Documentation or ADRs that require an update.

Do not put secrets in Git history. Bot tokens, cookies, API keys, real webhook payloads, phone numbers, and conversation content are prohibited. Use synthetic data in code, tests, issues, and screenshots.

## Contribution license

By submitting a contribution, you confirm that you have the right to submit it and agree that it may be distributed under [AGPL-3.0-or-later](LICENSE). This is an inbound-equals-outbound policy; the project currently has no CLA or separate copyright assignment.

If the project later considers dual licensing or a commercial exception, it must be discussed publicly first: current contributions do not automatically give maintainers all relicensing rights.

## Conduct and security

Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report security vulnerabilities through [SECURITY.md](SECURITY.md), never through a public issue or pull request.
