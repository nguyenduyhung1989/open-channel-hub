# Security Policy

## Report vulnerabilities privately

**Do not open a public issue, pull request, or discussion for a vulnerability.** Use GitHub's private vulnerability-reporting form:

<https://github.com/nguyenduyhung1989/open-channel-hub/security/advisories/new>

If the Security page does not show **Report a vulnerability**, a maintainer must enable GitHub Private Vulnerability Reporting before broadly promoting the repository. Do not substitute a public issue.

Include the version or commit, minimal reproduction conditions, expected impact, and a safe way to contact you. **Never paste** a Telegram token, cookie, API key, `.env` file, phone number, conversation content, real webhook payload, or customer data. Replace them with synthetic values and explain how to reproduce the case.

## Current scope

Open Channel Hub is in **Phase 2a / alpha**. The official `Telegram Bot` HTTP transport, startup wiring, a durable PostgreSQL inbound-event ledger, and synthetic offline tests exist. An unauthenticated HTTPS reachability probe to `api.telegram.org` succeeded, but no real Telegram Bot credential, Bot API method request, webhook registration or delivery, or production confirmation has occurred. Findings in source code, CI workflows, the Dockerfile, configuration handling, input validation, the HTTP transport, connector boundaries, PostgreSQL migrations, and durable-data handling are nevertheless in scope.

Do not perform destructive testing against infrastructure you do not own, use another person's account, or introduce a real token or public webhook URL into the system. Any live Telegram test requires explicit owner authorization.

## Handling

The project aims to acknowledge critical reports within 24 hours, high-severity reports within 72 hours, and other reports within seven business days. These are good-faith operating targets for an alpha project, not an SLA.

After confirming a report, a maintainer will assess severity, patch the issue, add an appropriate regression test, update release notes, and coordinate disclosure. If a secret may have leaked, revoke or rotate it immediately; a code change alone is not sufficient.

See the [Phase 0–2a threat model](docs/security/threat-model.md), [Phase 1a Telegram Bot operating boundary](docs/operations/telegram-bot-1a.md), and [Phase 2a PostgreSQL operations guide](docs/operations/postgresql-phase-2a.md) for the distinction between local evidence already obtained and work awaiting live or external verification.
