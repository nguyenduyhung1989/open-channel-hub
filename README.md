# Open Channel Hub

> A self-hosted, official-first multichannel messaging hub.

**Status: Phase 4j alpha source verified.** The repository contains a durable
PostgreSQL inbound-event ledger, account-scoped operator read APIs, a
configured multi-connection inbox API, an optional server-rendered read-only
operator dashboard, a durable source-bound reply-command ledger, a scoped
queued-command history API, a verified server-rendered queued-command history
page, a verified opt-in server-rendered reply-intent form, secret-backed
runtime configuration for official accounts, verified immutable
authorization-provenance, Telegram private-reply eligibility, and Telegram
delivery-authorization evidence for newly created reply commands, and narrow
official Zalo Official Account (OA), Facebook Page, and WhatsApp Business
signed inbound-text boundaries. Phase 4a passed final local checks,
independent review, a synthetic Docker proof, and GitHub CI/CodeQL for exact
commit <code>705db0a</code>. Phase 4b passed the same local verification,
independent review, synthetic Docker proof, and GitHub CI/CodeQL for exact
commit <code>7672be9</code>. It still does not prove a TLS proxy or production
browser deployment. Phases 4c–4d passed the same local verification,
independent review, synthetic Docker proof, and GitHub CI/CodeQL for exact
commit <code>160414e</code>; they still record and list intent only, never send
a provider message. The Phase 4e dashboard-history source passed final local
verification, independent security review, a synthetic Docker proof, and
GitHub CI/CodeQL for exact commit <code>465186e</code>. That proves the frozen
source and synthetic local path only; it does not prove an external TLS proxy
or production browser deployment. The Phase 4f dashboard reply-intent source
passed its final local evidence, independent security review, synthetic Compose
smoke, and GitHub checks at exact commit <code>74fca30</code>. That verifies
the frozen source and synthetic local path only; it does not prove an external
TLS proxy, a live provider operation, or production browser deployment. Phase
1a remains
incomplete until an owner-authorized Telegram test bot works through public
TLS; Phases 3a, 3b, and 3c likewise have no owner-authorized real provider
proof.

The Phase 4g append-only delivery-evidence source passed final local checks,
independent security review, synthetic Compose smoke, and GitHub CI/CodeQL for
exact commit <code>6444699</code>. It records narrow local evidence for a
future dispatcher; it does not create a provider request, provider acceptance,
delivery, or read result.

The combined Phase 4h–4j source passed <code>npm run check</code> (56 test
files / 390 tests and build), a zero-finding dependency audit, Gitleaks,
<code>git diff --check</code>, a synthetic Compose/PostgreSQL proof, and an
independent audit with no high- or medium-severity finding. GitHub's
<code>Continuous Integration</code> and <code>CodeQL</code> checks both passed
for exact commit <code>52608e0</code>. This verifies frozen source and
synthetic local behavior only; it does not prove public TLS, a live Telegram
request, provider acceptance, delivery, or production deployment.

Phase 4h is a verified source extension.
Migration <code>0011_outbound_command_authorizations</code> records one
immutable authority-provenance row at most for each newly created command:
whether the server used a configured inbox bearer or an explicitly writable
dashboard principal/inbox closure, plus a non-secret fingerprint of its
evaluated connection scope. It stores no bearer, session, target, text,
provider credential, delivery result, or retry state. Existing commands are
not backfilled and remain provenance-free no-dispatch candidates. This does
not add a provider request, worker, dispatch, retry, browser send control, or
delivery claim.

Phase 4i is a second verified source extension. It records Telegram
`message.chat.type` only as internal durable evidence, requires a non-secret
SHA-256 Bot-identity fingerprint derived from the token's numeric Bot-ID prefix,
and writes a one-to-one immutable `private` eligibility record with each new
Telegram reply command. Group, supergroup, channel, missing historic chat type,
or a missing/changed Bot identity fail closed as a source-unavailable command.
Historic Telegram data and commands are not backfilled or adopted. This creates
no sender, provider request, worker, retry, delivery result, or live Telegram
claim.

Phase 4j is a third verified source extension. It adds a separately scoped
dashboard-principal `telegramDeliveryAuthorizationInboxIds` grant and one
immutable Telegram authorization fact for a still-eligible queued command. The
server rechecks the configured inbox scope, Phase 4h provenance, Phase 4i
private-chat/Bot-identity evidence, and absence of an attempt before it writes
that fact. It exposes no bearer, Bot credential, target, fingerprint, provider
request, worker, retry, delivery result, or live Telegram claim. It is a
self-hosted one-operator alpha boundary, not a dual-control system.

The official Telegram Bot HTTP transport is wired for a deliberately narrow
legacy text send/receive slice. Legacy mode uses <code>OPERATOR_API_TOKEN</code>;
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
<code>(appId, wabaId, phoneNumberId)</code> triple. The verified Phase 4i source
derives a Telegram fingerprint from the configured token's numeric Bot-ID
prefix for new or history-free registry bindings only. It deliberately refuses
to attach that fingerprint to an old Telegram connection ID that already has
durable inbound history.

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

Phase 4b optionally adds a server-rendered read-only dashboard to that exact
inbox boundary. When the root runtime secret contains `dashboard`, PostgreSQL
is available, and a matching `inboxes` array already exists, `/operator/login`
and `/operator` use configured local principals, Argon2id password hashes, and
signed `Secure` `HttpOnly` session cookies. The browser never receives an inbox
bearer or provider credential. It is deliberately absent from the supplied
loopback HTTP Compose configuration because browser authentication requires an
external HTTPS origin and a TLS reverse proxy.

Phase 4c adds <code>POST /v1/inbox/outbound-commands</code> for a configured
inbox bearer. It records an immutable <code>queued</code> reply intent against
an existing canonical inbound event in the bearer-selected connection scope.
The body contains only a client operation ID, source connection ID, source
provider event ID, and text. PostgreSQL derives and privately stores the reply
target from the source event's canonical conversation; the caller cannot choose
or inspect a recipient. A new command returns <code>201</code>; an exact
idempotent replay returns <code>200</code>; a reused operation ID with different
source/text returns <code>409</code>; absent and out-of-scope sources share the
same <code>404</code>. <code>queued</code> means the intent is durable only: no
worker, provider call, retry, attempt, delivery receipt, OAuth/token storage,
or dashboard send form exists in this phase.

The earlier <code>POST /v1/telegram-bot/messages</code> remains a separate
Phase 1a legacy compatibility endpoint. It is not routed through the Phase 4c
ledger and does not prove that all sends are durable.

Phase 4d adds <code>GET /v1/inbox/outbound-commands</code>. It returns only
the configured inbox's queued reply intents in stable reverse command-ID order.
The response includes the recorded text, command/source identifiers,
<code>queued</code>, timestamp, and an optional opaque cursor; it omits the
private reply target, source message/channel, client operation ID, raw provider
data, and credentials. Its cursor has its own version and binds the exact inbox
ID plus configured connection set. Phase 4d added no migration; at that
revision, <code>0009_outbound_reply_commands</code> was the ninth immutable
migration. This is a history of durable intent, not delivery status or provider
activity.

Phase 4e adds
<code>GET /operator/outbound-commands</code> to the existing server-rendered
dashboard. After the dashboard authenticates its configured local principal,
it can render only that principal's configured inbox history through a
server-side read closure. The page has a fixed 50-row scope-bound continuation
and renders escaped creation time, text, source connection, and a recorded-not-
sent label. It exposes no browser bearer, command/source IDs, private target or
source metadata, client operation ID, or delivery data; it adds no outbound
command form, command mutation, migration, worker, provider call, retry, or
send action. The existing logout form remains session management only.
Exact commit <code>465186e</code> passed formatting, lint, strict type
checking, 53 test files / 351 tests, build, low-threshold dependency audit,
secret scan, diff check, a synthetic Compose proof, independent security
review, and GitHub CI/CodeQL. This is source verification only, not a
public-TLS or production deployment claim.

Phase 4f is a verified source extension of the existing dashboard. A
configured principal stays read-only unless its optional
<code>replyIntentInboxIds</code> field explicitly grants one of its already
readable inboxes. For a granted inbox, the server renders one native form per
persisted inbound event at <code>/operator</code>; the only editable value is
reply text. The inbound card renders only its canonical channel, occurrence
time, message text, and connection ID. It omits <code>conversationId</code>,
<code>senderId</code>, a reply target, and a source-message ID. The form's
hidden source connection/provider-event values and server-created client
operation ID are transport inputs only; the server revalidates the signed
session, exact HTTPS origin, anti-forgery token, write scope, and source event,
then records only the existing source-bound <code>queued</code> intent. Success
redirects to queued history without a command-result URL signal; the queued
history itself is the only browser evidence of a durable record. It does not
expose an inbox bearer or provider credential, accept a recipient, send, retry,
dispatch, or claim delivery. Exact commit <code>74fca30</code> passed
<code>npm run check</code> (54 test files / 358 tests and build), a
low-threshold dependency audit with zero findings, Gitleaks with no secrets,
<code>git diff --check</code>, a synthetic Compose smoke with cleanup, an
independent security audit APPROVE with zero high/medium findings, and GitHub
checks <code>Verify Node 24.18.1</code> and <code>Analyze JavaScript and
TypeScript</code>. This source verification is not public-TLS, live-provider,
or production evidence.

Phase 4g is a verified source append-only delivery-evidence foundation. Migration
<code>0010_outbound_delivery_attempt_receipts</code> adds at most one durable
attempt fact per command and at most one optional receipt per attempt. A receipt
can be <code>provider_accepted</code> only with a provider message ID,
<code>provider_rejected</code>, or <code>outcome_unknown</code>. Absence of a
durable attempt row supports a derived <code>not_attempted</code>-in-this-ledger
label only; it does not prove no provider call ever happened. An attempt with
no receipt is conservatively unknown. It adds no route, dashboard result,
worker, provider request, provider credential, retry, command mutation,
delivery/read state, or provider proof. Exact commit <code>6444699</code>
passed <code>npm run check</code> (54 test files / 358 tests and build),
<code>npm audit --audit-level=low</code> with zero findings, Gitleaks with no
secrets, <code>git diff --check</code>, a synthetic Compose smoke with cleanup,
an independent security audit APPROVE with zero high/medium findings, and
GitHub checks <code>Verify Node 24.18.1</code> and
<code>Analyze JavaScript and TypeScript</code>. This verifies the frozen source
and synthetic local path only; it does not prove public TLS, live provider I/O,
provider acceptance, delivery, read status, or production deployment.

Phase 4h adds verified immutable authorization provenance before any provider
dispatch. The new row is created atomically with a new source-bound command,
but it remains historical evidence rather than a current permission or send
authorization. A replay must prove the same authority kind, configured inbox,
optional dashboard principal, and evaluated scope fingerprint; it cannot fill
or alter provenance. A later sender must still separately recheck current
authorization and provider-specific eligibility.

Phase 4i adds verified Telegram private-reply evidence before any provider
dispatch. A new Telegram reply-intent needs both a source recorded as a private
chat and the current connection's opaque Bot fingerprint. The browser and public
read APIs do not receive the chat type or fingerprint. Existing Telegram inbound
rows with no chat type and old commands with no eligibility row remain
no-dispatch candidates; this phase neither guesses nor backfills either fact.

Phase 4j adds verified Telegram delivery-authorization evidence. A
dashboard principal remains unable to record it unless its optional
`telegramDeliveryAuthorizationInboxIds` subset explicitly includes the selected
readable inbox. For an already eligible queued command only, the server renders
a native form carrying a non-secret command reference, then rechecks signed
session, exact origin, anti-forgery value, the principal/inbox scope, Phase 4h
provenance, Phase 4i private/Bot evidence, current registry binding, and no
recorded attempt. The resulting row is an approval fact only; it does not send,
retry, create an attempt, call Telegram, or claim a provider outcome.

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
- Optional configured inbox principals, each with a separate bearer and an
  explicit server-side allow-list of one or more configured accounts. They can
  read canonical inbound events and queued reply-command history, and record a
  source-bound reply intent, but cannot choose an arbitrary recipient or
  dispatch a provider message.
- An optional server-rendered, no-JavaScript, read-only operator dashboard.
  It uses local configured password principals and browser session cookies;
  it never exposes an inbox bearer or provider credential to the browser. The
  verified Phase 4e source adds a principal-scoped queued-command history page.
  The verified Phase 4f source adds a source-bound intent form only for an explicit
  per-principal, per-inbox write allow-list; it is not a send action.
- Dynamic multi-connection webhook ingress that resolves the account server
  side, uses a separate webhook secret, and gives unknown account IDs and wrong
  secrets the same <code>401</code> response.
- A PostgreSQL adapter behind a domain-owned inbound-event port. It writes
  canonical incoming text events with parameterized SQL and conflict-safe
  idempotency; raw Telegram payloads are deliberately not stored.
- Verified Phase 4i internal evidence for a future Telegram private-reply
  decision: chat type, a non-secret Bot-account fingerprint, and an immutable
  command eligibility snapshot. It is not a sender or provider integration.
- Verified Phase 4j internal evidence for one configured dashboard principal's
  Telegram delivery authorization of a still-eligible command. It records no
  provider request and is not a sender or provider integration.
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

- A full browser identity system, organization/RBAC model, password reset,
  audit trail, proxy/TLS deployment proof, conversation model, attachment
  storage, search, retention/deletion policy, backups, restore drills, or
  encryption-at-rest assurance. The narrow Phase 4b dashboard is not a claim
  to provide those capabilities.
- Redis, a dispatch queue/worker, provider delivery, retries, delivery/read
  status, and a provider-specific outbox policy. Phase 4g adds only immutable
  attempt/receipt evidence with no dispatcher: it must not be mistaken for
  provider I/O or delivery. Phase 4c–4d store and list immutable reply intent
  only; Phase 4e renders that history through the dashboard and the verified
  Phase 4f source can record it through a narrower dashboard form. Phase 4i
  supplies Telegram-specific no-dispatch evidence and Phase 4j adds one
  immutable human authorization fact only; neither must be mistaken for a send
  permission.
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
   Do not add `dashboard` for this loopback HTTP runner; see the
   [Phase 4b operator dashboard guide](docs/operations/operator-dashboard-4b.md)
   and the [Phase 4f dashboard reply-intent guide](docs/operations/operator-dashboard-reply-intents-4f.md)
   only when an external HTTPS proxy is in scope.

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
the named PostgreSQL volume and therefore every stored inbound event and reply
intent. Backups and restore drills are not implemented yet.

Telegram, Zalo OA, Facebook Page, and WhatsApp Business require public HTTPS webhooks. Put a TLS reverse proxy in
front of Compose, keep the operator API on loopback, and follow the
[Phase 2c multi-connection guide](docs/operations/runtime-multi-connection-2c.md),
[Phase 3a Zalo OA guide](docs/operations/zalo-oa-3a.md), or
[Phase 3b Facebook Page guide](docs/operations/facebook-page-3b.md), or
[Phase 3c WhatsApp Business guide](docs/operations/whatsapp-business-3c.md), or
[Phase 4a unified inbox guide](docs/operations/unified-inbox-4a.md), or
[Phase 4d queued command-history guide](docs/operations/outbound-command-history-4d.md), or
[Phase 4e dashboard queued-command history guide](docs/operations/operator-dashboard-queued-history-4e.md), or
[Phase 4f dashboard reply-intent guide](docs/operations/operator-dashboard-reply-intents-4f.md), or
[Phase 4g delivery-evidence guide](docs/operations/outbound-delivery-evidence-4g.md), or
[Phase 4h authorization-provenance guide](docs/operations/outbound-command-authorization-provenance-4h.md), or
[Phase 4i Telegram private-reply eligibility guide](docs/operations/telegram-private-reply-eligibility-4i.md), or
[Phase 4j Telegram delivery-authorization guide](docs/operations/telegram-delivery-authorization-4j.md), or
[Phase 4b operator dashboard guide](docs/operations/operator-dashboard-4b.md), or
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

## Read queued reply-command history

When a configured inbox bearer has recorded Phase 4c reply intents, call
<code>GET /v1/inbox/outbound-commands</code> to list only `queued` commands in
that inbox's fixed connection scope. It accepts the same bounded 1–100
<code>limit</code> convention (default 50) and its own opaque
<code>nextCursor</code>. It returns recorded message text, so treat the result
as sensitive operational data. It does not return a recipient, source
message/channel, client operation ID, credential, attempt, provider receipt, or
delivery/read state.

The history cursor is not interchangeable with an inbound-event cursor. It is
bound to the exact inbox and canonical connection set; malformed, foreign, or
scope-changed cursors return <code>400</code>. See the
[Phase 4d queued command-history guide](docs/operations/outbound-command-history-4d.md)
for the exact response and operational boundary.

## Use the optional browser dashboard

The dashboard is configured inside the same secret document as connections and
inboxes, not by a browser token or `DASHBOARD_*` environment variable. It is
absent by default. A valid configuration needs an exact public HTTPS origin,
one or two unique cookie-signing keys, a separate session HMAC pepper, and one
or more configured principals scoped to existing inboxes. Password values are
stored only as exact-profile Argon2id PHC hashes.

Its read-only HTML pages are `/operator/login` and `/operator`; Phase 4e also
adds `/operator/outbound-commands` for queued command history. Phase 4f adds
an optional `replyIntentInboxIds` subset to each configured
principal. When it explicitly includes the selected readable inbox,
`/operator` renders one native source-bound intent form per persisted inbound
event. The browser may edit reply text only; the server supplies the source
reference and client operation ID, then rechecks the signed session, exact
origin, anti-forgery token, configured write scope, and durable source.
The whole form is capped at 32 KiB and its editable text remains limited to
2,000 characters; an oversized request reaches no recorder.
The CSS is same-origin at `/operator/assets/dashboard.css`. Login and logout
require the configured browser origin and anti-forgery tokens. Sessions expire
after 30 minutes idle or eight hours absolute. The supplied Compose smoke
deliberately does not submit a dashboard login through HTTP; that would not
prove the required HTTPS cookie behavior.

Read [the Phase 4b operator dashboard guide](docs/operations/operator-dashboard-4b.md)
before configuring a proxy, password hash, or session-key rotation. It records
the current limits: no self-service accounts, role model, audit trail,
production TLS proof, cross-instance rate-limit proof, or provider delivery.
The
[Phase 4e dashboard queued-command history guide](docs/operations/operator-dashboard-queued-history-4e.md)
records the verified source's separate no-send/history boundary. The
[Phase 4f dashboard reply-intent guide](docs/operations/operator-dashboard-reply-intents-4f.md)
records the verified source's explicit opt-in write scope, per-principal local rate
guard, and no-send boundary. The [Phase 4g delivery-evidence guide](docs/operations/outbound-delivery-evidence-4g.md)
records the separate verified source attempt/receipt foundation; it adds no dashboard
delivery result or provider action. The [Phase 4h authorization-provenance guide](docs/operations/outbound-command-authorization-provenance-4h.md)
records verified historical authority evidence for new commands only; it grants
no browser or provider send capability. The
[Phase 4i Telegram private-reply eligibility guide](docs/operations/telegram-private-reply-eligibility-4i.md)
records the separate verified chat/identity evidence; it grants no provider
send capability either. The
[Phase 4j Telegram delivery-authorization guide](docs/operations/telegram-delivery-authorization-4j.md)
records one verified human-authorization fact after current durable rechecks;
it grants no provider send capability either.

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
