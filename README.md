# Open Channel Hub

> A self-hosted, official-first multichannel messaging hub.

**Status: Phase 2c alpha.** The repository contains a durable PostgreSQL
inbound-event ledger, an operator-only canonical-event API, and the first
runtime configuration foundation for more than one official Telegram Bot
account. GitHub CI and CodeQL succeeded for the exact Phase 2b commit
<code>4d5a9c9</code>. The current Phase 2c source passed its final local
verification and synthetic Compose proof; its exact commit still needs fresh
GitHub CI and CodeQL. Phase 1a remains incomplete until an
owner-authorized Telegram test bot works through public TLS.

The official Telegram Bot HTTP transport is wired for a deliberately narrow
text send/receive slice. Legacy mode uses <code>OPERATOR_API_TOKEN</code>;
multi-connection mode uses one unique configured operator token per account.
Telegram must supply a separate <code>X-Telegram-Bot-Api-Secret-Token</code>
webhook header. In Phase 2a, an accepted canonical inbound event is stored in
PostgreSQL before the webhook returns. The storage scope is intentionally small: database
<code>open_channel_hub</code>, schema <code>open_channel_hub</code>, and the
<code>inbound_events</code> ledger. It stores the canonical text fields needed
for the event, not the raw provider payload. A primary key on
<code>(connection_id, provider_event_id)</code> makes a repeated provider
delivery a no-op for the same configured connection.

Phase 2b adds <code>GET /v1/telegram-bot/inbound-events</code>. It returns only
canonical event fields through a stable reverse-chronological cursor, so newer
events do not shift or duplicate an operator's already-started page traversal.

Phase 2c adds a secret-backed runtime configuration document and a durable
connection registry. In multi-connection mode, each unique operator bearer
token selects one configured Telegram Bot account inside the process; neither
operator route accepts a caller-selected connection ID. Dynamic webhook ingress
uses <code>POST /v1/webhooks/telegram-bot/:connectionId</code>, and the route
checks the resolved account's separate Telegram webhook secret. The registry
stores only opaque connection ID, connector ID, channel, and tier, never tokens,
phone numbers, provider account names, or raw provider payloads.

Multi-connection IDs are opaque safe route labels; <code>.</code> and
<code>..</code> are rejected because webhook ingress places the ID in a dynamic
path. This restriction does not rewrite a historical legacy one-Bot environment
label.

Compose runs a pinned PostgreSQL 18.4 image on an internal data network, starts
an idempotent migration service before the API, and does not publish a database
port to the host. The API exposes <code>GET /health</code> for process
liveness and <code>GET /ready</code> for database/migration readiness. The
local proof used only fake values: the migration was run twice, the same
synthetic webhook was delivered twice, both responses were <code>204</code>,
and one ledger row existed. An unauthenticated HTTPS reachability probe to
<code>api.telegram.org</code> returned <code>200</code>; no real Telegram Bot
token, Bot API method request, webhook registration, message, or production
deployment was used.

Open Channel Hub is intended to give small teams a shared multichannel core
without hiding risk. Official APIs come first. Any session-based or unsupported
connector must remain experimental, isolated, opt-in, and must never include
CAPTCHA bypass, fingerprint spoofing, session theft, or bulk-spam capabilities.

## What works today?

- A minimal HTTP API with <code>GET /health</code>, <code>GET /ready</code>,
  and a corresponding-source endpoint.
- Data contracts, connector ports, and capability checks for the Telegram Bot
  slice.
- A temporary legacy one-Bot environment mode and a mutually exclusive,
  secret-backed multi-connection mode for official Telegram Bot accounts. The
  latter maps each unique operator token to exactly one configured account.
- Dynamic multi-connection webhook ingress that resolves the account server
  side, uses a separate webhook secret, and gives unknown account IDs and wrong
  secrets the same <code>401</code> response.
- A PostgreSQL adapter behind a domain-owned inbound-event port. It writes
  canonical incoming text events with parameterized SQL and conflict-safe
  idempotency; raw Telegram payloads are deliberately not stored.
- An operator-authenticated, connection-scoped inbound-event read API with
  bounded keyset pagination and opaque cursors. It returns canonical events,
  not database rows or raw Telegram payloads.
- An isolated PostgreSQL database and schema, a non-superuser application role,
  immutable migration ledger, a runtime connection registry, and readiness that
  refuses traffic when the expected migration is unavailable.
- A Phase 2b local Docker proof of database migration, duplicate-event storage,
  and the operator event-read path using only synthetic data.
- Formatting, linting, type checking, tests, and builds that can run locally
  and in CI.

## What is not here yet?

The following remain plans or explicitly incomplete operational work:

- A user-visible inbox, conversation model, attachment storage, search,
  retention/deletion policy, backups, restore drills, or encryption-at-rest
  assurance.
- Redis, a queue, durable outbound delivery, retries, and an outbox.
- A web dashboard, user accounts, role-based access control, multiple
  organizations, webhook administration, public connection management, or a
  connection listing API.
- A real Telegram Bot/TLS verification, Facebook Page, Facebook User, Zalo OA,
  Zalo User, and WhatsApp.

See [ROADMAP.md](ROADMAP.md) for the criteria before each phase can be called
complete.

## Quick start

No secret or Telegram account is required for offline checks. Leave
<code>TELEGRAM_BOT_ENABLED=false</code> if you only want the health check and
tests that do not make network requests. Direct development without PostgreSQL
does not exercise the Phase 2a durable-storage path.

```bash
git clone https://github.com/nguyenduyhung1989/open-channel-hub.git
cd open-channel-hub
npm ci
cp .env.example .env
npm run check
npm run dev
```

In another terminal:

```bash
curl http://127.0.0.1:3000/health
```

The response should resemble:

```json
{ "success": true, "data": { "service": "open-channel-hub", "status": "ok" } }
```

The example environment file contains no sample token or password. Edit the
Git-ignored local file or use a deployment secret store; never paste secrets
into shell commands, issues, pull requests, screenshots, or logs.

## Run with Docker and PostgreSQL

<code>compose.yaml</code> creates one local-operator alpha stack:
<code>postgres</code>, a one-shot <code>migrate</code> service, and
<code>api</code>. PostgreSQL has no host port. Only the API is published, and
only on <code>127.0.0.1:3000</code>.

Before the first start, copy <code>.env.example</code> to
<code>.env</code> and edit it locally:

1. Set <code>SOURCE_OFFER_URL</code> to the public, unauthenticated exact
   corresponding-source URL for the version that will run.
2. Set <code>POSTGRES_PASSWORD</code> and <code>DATABASE_PASSWORD</code> to
   two different 32–512-character visible, non-whitespace values.
   <code>POSTGRES_PASSWORD</code> is only for PostgreSQL bootstrap;
   <code>DATABASE_PASSWORD</code> belongs to the non-superuser
   <code>open_channel_hub</code> application role.
3. Either keep Telegram disabled, use the temporary legacy one-Bot variables,
   or configure the multi-connection secret document. Do not mix the two
   Telegram configuration modes. See the
   [Phase 2c multi-connection guide](docs/operations/runtime-multi-connection-2c.md).

```bash
docker compose up --build
curl http://127.0.0.1:3000/ready
```

If port <code>3000</code> is already in use on the local machine, set
<code>API_HOST_PORT</code> in <code>.env</code> to an unused loopback port and
use that port in the readiness request. The container port remains
<code>3000</code>.

Compose passes the two database passwords as Docker secrets. Neither password
is set in the API process environment. When
<code>CONNECTIONS_CONFIG_BASE64</code> is nonblank, Compose mounts its
unpadded base64url value only as the <code>runtime_connections_base64</code>
secret at <code>/run/secrets/runtime_connections_base64</code>; the API receives
only that file path. Base64url prevents Compose from expanding a credential's
<code>$</code>; it is not encryption and the encoded value remains secret. The
migration service applies schema-qualified forward migrations before the API
starts; <code>/ready</code> returns <code>503</code> if the database or expected
migration is unavailable.

The API and migration containers run as a non-root user, drop Linux
capabilities, use <code>no-new-privileges</code>, have no host source/data bind
mount, and use a temporary <code>/tmp</code>. Their root filesystems are
**not** currently read-only: the available Compose implementation cannot inject
environment-sourced Docker secrets into a read-only service. That limitation is
intentional and documented, not a claim of read-only hardening. See the
[Phase 2a PostgreSQL operations guide](docs/operations/postgresql-phase-2a.md)
for the exact boundary, safe inspection, and shutdown warning.

To stop the stack while retaining the durable ledger:

```bash
docker compose down
```

Do **not** casually run <code>docker compose down --volumes</code>. It deletes
the named PostgreSQL volume and therefore every stored inbound event. Backups
and restore drills are not implemented yet.

Telegram can call a webhook only through a public HTTPS URL. Put a TLS reverse
proxy in front of Compose, keep the operator API on loopback, and follow the
[Phase 2c multi-connection guide](docs/operations/runtime-multi-connection-2c.md)
or [Phase 1a legacy guide](docs/operations/telegram-bot-1a.md) only after an
authorized test is agreed. Starting Compose does not provide TLS or register a
webhook automatically.

## Read canonical inbound events

When Telegram and PostgreSQL are enabled, a local operator can call
<code>GET /v1/telegram-bot/inbound-events</code> with the bearer token assigned
to one configured account. The route accepts an optional <code>limit</code>
from 1 to 100 (default 50) and an optional opaque <code>cursor</code> returned
by the preceding page. It does not accept a connection ID: in legacy mode it
reads the one configured Bot, and in multi-connection mode the bearer token
selects exactly one account server side.

The response contains <code>events</code> and, when another page exists,
<code>nextCursor</code>. Treat the cursor as opaque. It is a stable snapshot
position, not an authorization mechanism; bearer authentication and
server-selected account scope remain mandatory. A cursor from one account is
rejected for another. This API is not a dashboard, user login, role-based
access control, search service, or a raw-provider-payload archive.

## Corresponding-source offer

Every response includes a <code>Link: &lt;SOURCE_OFFER_URL&gt;; rel="source"</code>
header, and unauthenticated <code>GET /source</code> returns the same
source-offer URL in JSON. This is a practical implementation aid for the AGPL
section 13 source-offer requirement; it is not legal advice.

<code>SOURCE_OFFER_URL</code> is required whenever
<code>NODE_ENV=production</code>, including the supplied Compose service. It
must be an absolute public HTTPS URL with no username, password, query string,
fragment, or secret. The target must be available without authentication and
provide the exact corresponding source for the version actually running. A fork
or modified SaaS deployment must set its own corresponding-source URL; it must
not leave the upstream repository as a placeholder.

## Develop and verify

CI and Docker use Node.js <code>24.18.1</code>. The main commands are:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run check
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
Architecture decisions are in [docs/adr](docs/adr/README.md), the current
security boundary is in [docs/security/threat-model.md](docs/security/threat-model.md),
and the current work checkpoint is in
[docs/maintainers/current-phase.md](docs/maintainers/current-phase.md).

## License and network services

The source code is licensed under the
[GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)](LICENSE).

In short: if you modify Open Channel Hub and let others interact with the
**modified version** over a network, AGPL section 13 requires that version to
offer remote users the corresponding source code of the running version at no
charge. The <code>/source</code> endpoint and <code>Link</code> header support
that operating practice, but this README is not legal advice. Read the full
[LICENSE](LICENSE) before distributing, deploying, or combining the software.

AGPL does not prohibit selling software, operating a hosted service, or
providing commercial support. The project does not promise an alternative
commercial license; see
[ADR-0004](docs/adr/0004-agpl-and-future-commercial-options.md) for the
reasoning and conditions to consider if that changes.

## Community and security

- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Support: [SUPPORT.md](SUPPORT.md)
- Private vulnerability reporting: [SECURITY.md](SECURITY.md)
- Governance: [GOVERNANCE.md](GOVERNANCE.md)

Do not open a public issue for a vulnerability or paste a token, password,
cookie, phone number, real conversation content, or <code>.env</code> file
anywhere in the public repository.

## Open-source readiness record

This repository aims for a public, tested, accountable maintenance history, not
cosmetic activity. Evidence and remaining work are recorded transparently in
[docs/maintainers/oss-readiness.md](docs/maintainers/oss-readiness.md).
