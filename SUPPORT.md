# Support

Open Channel Hub is a Phase 2a / alpha project maintained on a limited-time basis. It has no response-time commitment or production support. The `Telegram Bot` HTTP transport, startup wiring, durable PostgreSQL inbound-event ledger, and synthetic offline tests exist. An unauthenticated HTTPS reachability probe succeeded, but no live credential, authenticated Bot API request, webhook, or production verification has occurred.

## Where to ask

- Read [README.md](README.md), [ROADMAP.md](ROADMAP.md), [CONTRIBUTING.md](CONTRIBUTING.md), and the documentation in `docs/` first.
- If GitHub Discussions is enabled, use it for usage questions and ideas.
- If Discussions is not enabled, open the **Support question** issue form with a minimal, sanitized example.
- For a reproducible defect, use the **Bug report** form.
- For a vulnerability, use [SECURITY.md](SECURITY.md) only; do not use any public channel.

## Include enough context

State the version or commit, operating system, Node.js version, commands run, expected result, actual result, and minimal synthetic data. Do not paste tokens, phone numbers, cookies, real payloads, or logs containing customer information.

## Not currently supported

- Maintainer-provided production deployment or hosting.
- Maintainer-operated live Telegram use, webhook registration, or public TLS/production verification.
- Platforms outside the narrow Phase 1a `Telegram Bot` and Phase 2a storage scope.
- Connectors that depend on unsupported provider login sessions or APIs.

Read the [Phase 1a Telegram Bot operating boundary](docs/operations/telegram-bot-1a.md), [Phase 2a PostgreSQL operations guide](docs/operations/postgresql-phase-2a.md), and [Phase 0–2a threat model](docs/security/threat-model.md) before asking about configuration or security.
