# Open Channel Hub

> A self-hosted, official-first multichannel messaging hub.

**Status: Phase 4a alpha.** The repository contains a durable PostgreSQL
inbound-event ledger, account-scoped operator read APIs, a configured
multi-connection read-only inbox API, secret-backed runtime configuration for
official accounts, and narrow official Zalo Official Account (OA), Facebook
Page, and WhatsApp Business signed inbound-text boundaries. Phase 4a passed
final local checks, independent review, a synthetic Docker proof, and GitHub
CI/CodeQL for exact commit <code>705db0a</code>. Phase 1a remains incomplete
until an owner-authorized Telegram test bot works through public TLS; Phases
3a, 3b, and 3c likewise have no owner-authorized real provider proof.

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
The Phase 4a numeric ledger-order correction deliberately rejects a cursor
issued by an earlier release with <code>400</code>; restart that account read
from its first page after upgrading rather than risk silently skipping events.

Phase 2c adds a secret-backed runtime configuration document and a durable
connection registry. In multi-connection mode, each unique operator bearer
token selects one configured account inside the process; no operator route
accepts a caller-selected connection ID. Telegram uses the dynamic ingress
<code>POST /v1/webhooks/telegram-bot/:connectionId</code> and checks the
resolved account's separate Telegram webhook secret. The registry stores only
opaque connection ID and connector metadata for every connection, never tokens,
phone numbers, provider account names, or raw provider payloads.

Phase 3a adds official Zalo OA inbound text only. Its fixed
<code>POST /v1/webhooks/zalo-oa</code> route resolves the configured
<code>(appId, oaId)</code> from the signed provider payload, verifies
<code>X-ZEvent-Signature</code> against the exact raw JSON bytes, then returns
<code>200</code> only after the canonical event is durable. A unique operator
bearer exposes only that OA's canonical events at
<code>GET /v1/zalo-oa/inbound-events</code>. There is no OAuth, access-token
storage, outbound Zalo message, attachment, Zalo User, live provider call, or
automatic webhook registration.

For Zalo OA, Facebook Page, and WhatsApp Business, the registry also stores a domain-separated SHA-256
fingerprint of the configured <code>(appId, oaId)</code> pair. It is not the
plain provider identity or a credential; it prevents an opaque Zalo connection
ID with durable history from silently being reused for a different OA. Facebook
Page uses the same mechanism for its configured <code>(appId, pageId)</code>
pair. WhatsApp Business uses it for its configured
<code>(appId, wabaId, phoneNumberId)</code> triple. Telegram does not yet have
an equivalent non-secret provider-account identity in this configuration, so
its registry binding remains connector/channel/tier only.

Phase 3b adds official Facebook Page inbound text only. Its fixed
<code>GET</code>/<code>POST /v1/webhooks/facebook-page</code> endpoint handles
Meta's verification challenge, maps every untrusted `entry[].id` Page in a
batch to one configured App, verifies `X-Hub-Signature-256` over exact raw
request bytes, then returns <code>200</code> only after canonical text is
durable. A unique operator bearer exposes only that Page's canonical events at
<code>GET /v1/facebook-page/inbound-events</code>. There is no Facebook User,
OAuth, Page access-token storage, Graph API request, outbound Page message,
attachment, live provider call, or automatic webhook registration.

Phase 3c adds official WhatsApp Business inbound text only. A standalone
WhatsApp Meta App uses the fixed <code>GET</code>/<code>POST
/v1/webhooks/whatsapp-business</code> endpoint; one App configured for both
Facebook Page and WhatsApp uses the common <code>GET</code>/<code>POST
/v1/webhooks/meta</code> endpoint. Both paths handle Meta's verification
challenge, map untrusted WABA IDs in `entry[].id` to one configured App, verify
<code>X-Hub-Signature-256</code> over exact raw request bytes, then return
<code>200</code> only after canonical text is durable. A unique operator bearer
exposes only one business phone's canonical events at
<code>GET /v1/whatsapp-business/inbound-events</code>. There is no WhatsApp
User, OAuth, Graph API access-token storage, Graph API request, outbound
message, template, attachment, live provider call, or automatic webhook
registration.

Phase 4a adds an optional configured `inboxes` array to the same version-1
runtime secret document. Each inbox has a distinct bearer token and an explicit
allow-list of configured connection IDs. `GET /v1/inbox/inbound-events` reads
canonical events across that fixed server-side scope in stable reverse ledger
order. Its opaque cursor is bound to both the configured inbox and its
canonical connection set; a caller cannot select an inbox or connection ID.
This is a deliberately small read API, not a browser inbox, user login,
organization/RBAC model, conversation model, search service, or outbound
message path.

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
  secret-backed multi-connection mode for official Telegram Bot, Zalo OA,
  Facebook Page, and WhatsApp Business accounts. The latter maps each unique operator token to exactly one
  configured account.
- Optional configured read-only inbox principals, each with a separate bearer
  and an explicit server-side allow-list of one or more configured accounts.
- Dynamic multi-connection webhook ingress that resolves the account server
  side, uses a separate webhook secret, and gives unknown account IDs and wrong
  secrets the same <code>401</code> response.
- A PostgreSQL adapter behind a domain-owned inbound-event port. It writes
  canonical incoming text events with parameterized SQL and conflict-safe
  idempotency; raw Telegram payloads are deliberately not stored.
- An operator-authenticated, connection-scoped inbound-event read API with
  bounded keyset pagination and opaque cursors. It returns canonical events,
  not database rows or raw provider payloads.
- A narrow official Zalo OA receive-only boundary: a fixed signed raw-JSON
  webhook for text messages and a separate bearer-scoped canonical-event reader.
- A narrow official Facebook Page receive-only boundary: a fixed GET/POST
  signed raw-byte webhook for text messages and a separate bearer-scoped
  canonical-event reader.
- A narrow official WhatsApp Business receive-only boundary: standalone or
  shared-Meta GET/POST signed raw-byte webhook ingress for text messages and a
  separate bearer-scoped canonical-event reader.
- An isolated PostgreSQL database and schema, a non-superuser application role,
  immutable migration ledger, a runtime connection registry, and readiness that
  refuses traffic when the expected migration is unavailable.
- A Phase 2b local Docker proof of database migration, duplicate-event storage,
  and the operator event-read path using only synthetic data.
- Formatting, linting, type checking, tests, and builds that can run locally
  and in CI.

## What is not here yet?

The following remain plans or explicitly incomplete operational work:

- A browser-visible inbox/dashboard, conversation model, attachment storage, search,
  retention/deletion policy, backups, restore drills, or encryption-at-rest
  assurance.
- Redis, a queue, durable outbound delivery, retries, and an outbox.
- User accounts, role-based access control, multiple
  organizations, webhook administration, public connection management, or a
  connection listing API.
- A real Telegram Bot/TLS verification, real Zalo OA/TLS verification, real
  Facebook Page/TLS verification, real WhatsApp Business/TLS verification,
  Zalo OA OAuth/access tokens/outbound messages/attachments, Facebook Page or
  WhatsApp Business access-token handling/outbound messages, Facebook User,
  Zalo User, and WhatsApp User.

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
   or configure the shared multi-connection secret document. Do not mix the
   legacy Telegram variables with the shared document. See the
   [Phase 2c multi-connection guide](docs/operations/runtime-multi-connection-2c.md),
   [Phase 3a Zalo OA guide](docs/operations/zalo-oa-3a.md), and
   [Phase 3b Facebook Page guide](docs/operations/facebook-page-3b.md), and
   [Phase 3c WhatsApp Business guide](docs/operations/whatsapp-business-3c.md),
   and [Phase 4a unified inbox guide](docs/operations/unified-inbox-4a.md).

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

Telegram, Zalo OA, Facebook Page, and WhatsApp Business require public HTTPS webhooks. Put a TLS reverse proxy in
front of Compose, keep the operator API on loopback, and follow the
[Phase 2c multi-connection guide](docs/operations/runtime-multi-connection-2c.md),
[Phase 3a Zalo OA guide](docs/operations/zalo-oa-3a.md), or
[Phase 3b Facebook Page guide](docs/operations/facebook-page-3b.md), or
[Phase 3c WhatsApp Business guide](docs/operations/whatsapp-business-3c.md), or
[Phase 4a unified inbox guide](docs/operations/unified-inbox-4a.md), or
[Phase 1a legacy guide](docs/operations/telegram-bot-1a.md) only after an
authorized test is agreed. Starting Compose does not provide TLS or register a
webhook automatically.

## Read canonical inbound events

When a configured connector and PostgreSQL are enabled, a local operator can
call <code>GET /v1/telegram-bot/inbound-events</code> for Telegram,
<code>GET /v1/zalo-oa/inbound-events</code> for Zalo OA, or
<code>GET /v1/facebook-page/inbound-events</code> for Facebook Page with the
bearer token assigned to one configured account, or
<code>GET /v1/whatsapp-business/inbound-events</code> for WhatsApp Business
with the bearer token assigned to one configured business phone. Each route accepts an optional
<code>limit</code> from 1 to 100 (default 50) and an optional opaque
<code>cursor</code> returned by the preceding page. Neither accepts a connection
ID: in legacy Telegram mode it reads the one configured Bot, and in the shared
multi-connection mode the bearer token selects exactly one account server side.

When the optional runtime `inboxes` array is configured, a separate inbox
bearer can call <code>GET /v1/inbox/inbound-events</code> to read canonical
events across its explicit connection allow-list. It accepts the same bounded
<code>limit</code> and opaque <code>cursor</code>, but never an inbox or
connection ID. Its cursor binds both the configured inbox ID and its canonical
connection set, so another inbox or a changed set cannot reuse it. See the
[Phase 4a unified inbox guide](docs/operations/unified-inbox-4a.md) for the
configuration and explicit limits.

The response contains <code>events</code> and, when another page exists,
<code>nextCursor</code>. Treat the cursor as opaque. It is a stable snapshot
position, not an authorization mechanism; bearer authentication and
server-selected account or inbox scope remain mandatory. A cursor from one
account or inbox scope is rejected for another. This API is not a dashboard,
user login, role-based access control, search service, or a
raw-provider-payload archive.

Per-account cursors from releases before Phase 4a are intentionally no longer
accepted and return <code>400</code>. Those cursors used an older ordering
format; restart the traversal at page one after upgrading. Phase 4a inbox
cursors are new and already carry the current ordering version.

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
