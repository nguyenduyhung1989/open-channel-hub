# Runtime multi-connection configuration

This guide configures the current alpha's official Telegram Bot, Zalo Official
Account (OA), Facebook Page, WhatsApp Business, optional inbox entries, and
optional Phase 4b operator dashboard. The dashboard is a small
server-rendered local-principal surface, not a full user, organization,
public-connection, or permission model. The verified Phase 4f source adds an
explicit opt-in write subset for source-bound reply intents; it still has not
been verified with a real provider account or public TLS endpoint.

## What is configured

One secret JSON document can configure one to one hundred Telegram Bot, Zalo
OA, Facebook Page, and WhatsApp Business connections, plus up to one hundred
optional configured inboxes and up to one hundred optional dashboard
principals. It contains credentials and password verifiers, so treat the
entire document as a secret even though its IDs are opaque internal labels.

The strict document shape is:

```json
{
  "version": 1,
  "connections": [
    {
      "id": "telegram-bot-support",
      "type": "telegram_bot",
      "botToken": "<Telegram Bot token>",
      "operatorApiToken": "<unique 32-512 character operator token>",
      "webhookSecret": "<unique 32-256 character Telegram webhook secret>",
      "webhookUrl": "https://example.invalid/v1/webhooks/telegram-bot/telegram-bot-support"
    }
  ]
}
```

<code>webhookUrl</code> is optional. When present, it must be a public HTTPS
URL with no username, password, query string, or fragment, and its path must
match that entry's exact dynamic webhook route. Each connection ID uses only
letters, digits, <code>.</code>, <code>_</code>, <code>:</code>, and
<code>-</code>, and it must not be exactly <code>.</code> or <code>..</code>
because it becomes part of a dynamic webhook path. All IDs and all
Bot/operator/webhook credential values must be unique across the document.

The same version-1 document also accepts a Zalo OA entry:

```json
{
  "id": "zalo-oa-support",
  "type": "zalo_oa",
  "appId": "...",
  "oaId": "...",
  "oaSecretKey": "...",
  "operatorApiToken": "...",
  "webhookUrl": "https://your-public-host/v1/webhooks/zalo-oa"
}
```

For a Zalo OA entry, `appId` and `oaId` are decimal identifiers and an optional
`webhookUrl` must be the exact public HTTPS path
`/v1/webhooks/zalo-oa`, without user info, query, or fragment. The `(appId,
oaId)` pair and every operator token must be unique. Each `oaSecretKey` must
not collide with a Telegram or operator credential, but Zalo OA entries may use
the same or different OA secrets; the configuration deliberately makes no
undocumented secret-sharing claim. See the
[Phase 3a Zalo OA guide](zalo-oa-3a.md) for the raw-signature and live-test
boundary.

The same version-1 document also accepts a Facebook Page entry:

```json
{
  "id": "facebook-page-support",
  "type": "facebook_page",
  "appId": "...",
  "pageId": "...",
  "appSecret": "...",
  "webhookVerifyToken": "...",
  "operatorApiToken": "...",
  "webhookUrl": "https://your-public-host/v1/webhooks/facebook-page"
}
```

For a Facebook Page entry, `appId` and `pageId` are decimal identifiers and an
optional `webhookUrl` may be the exact public HTTPS path
`/v1/webhooks/facebook-page` or `/v1/webhooks/meta`, without user info, query,
or fragment. Page IDs and operator tokens are unique. Several Pages may share
one App only when their 32–512-character `appSecret` and
`webhookVerifyToken` are exactly identical; those credentials cannot collide
with another role, App, Telegram, or Zalo OA credential. See the
[Phase 3b Facebook Page guide](facebook-page-3b.md) for Meta verification,
raw-byte HMAC, and live-test boundaries.

The same version-1 document also accepts a WhatsApp Business entry:

```json
{
  "id": "whatsapp-business-support",
  "type": "whatsapp_business",
  "appId": "...",
  "wabaId": "...",
  "phoneNumberId": "...",
  "appSecret": "...",
  "webhookVerifyToken": "...",
  "operatorApiToken": "...",
  "webhookUrl": "https://your-public-host/v1/webhooks/whatsapp-business"
}
```

For a WhatsApp Business entry, `appId`, `wabaId`, and `phoneNumberId` are
decimal identifiers. The optional `webhookUrl` may be the exact public HTTPS
path `/v1/webhooks/whatsapp-business` or `/v1/webhooks/meta`, without user
info, query, or fragment. Business phone IDs and operator tokens are unique;
one WABA maps to one configured App. Several business phones or WABAs may share
an App only with identical App credentials. If a Meta App is configured for
both Facebook Page and WhatsApp Business, every declared callback URL for that
App must be the same public `/v1/webhooks/meta` URL; a product-specific URL is
valid only when that App does not configure the other product. See the
[Phase 3c WhatsApp Business guide](whatsapp-business-3c.md) for WABA/phone
selection, raw-byte HMAC, and live-test boundaries.

The root document may also include the optional `inboxes` array:

```json
{
  "inboxes": [
    {
      "id": "support-inbox",
      "token": "<unique 32-512 character inbox token>",
      "connectionIds": ["facebook-page-support", "telegram-bot-support"]
    }
  ]
}
```

An inbox is a configured read-only principal, not a provider connection. It
contains one to one hundred entries, each with a unique opaque `id`, a unique
printable non-whitespace `token` of 32 to 512 characters, and one to one
hundred unique `connectionIds` that already exist in the document's
`connections` array. Inbox IDs use the same safe identifier alphabet as
connection IDs and cannot be `.` or `..`. An inbox token cannot collide with
another inbox token or any Bot, webhook, provider, or account-operator
credential. Connection IDs are canonicalized in ascending order before the
inbox is used.

An inbox token grants canonical inbound-event reads for its explicit connection
set through `GET /v1/inbox/inbound-events`; Phase 4c permits it to record a
source-bound reply intent through `POST /v1/inbox/outbound-commands`; and Phase
4d permits it to read those queued intents through the same `GET` path. It is
distinct from the one-account operator bearer on each connection; neither token
works for the other's route. The write route accepts no arbitrary recipient and
the history route accepts no caller-selected scope/state: `queued` means only a
durable intent. Phase 4a did not create a browser UI; Phase 4b adds the separate
server-rendered dashboard described below, which remains read-only. The verified
Phase 4e source reuses that dashboard configuration for
`GET /operator/outbound-commands`, a smaller server-rendered queued-history
view that never puts this inbox token in the browser. None creates a full user,
organization, role, conversation summary, dispatch action, or provider
credential. See the [Phase 4a inbox-scope guide](unified-inbox-4a.md),
[Phase 4c reply-command guide](outbound-reply-commands-4c.md), and
[Phase 4d command-history guide](outbound-command-history-4d.md), and the
[Phase 4e guide](operator-dashboard-queued-history-4e.md) for the
API and dashboard-history boundaries.

The root document may additionally include `dashboard`, but only when
`inboxes` is present:

```json
{
  "dashboard": {
    "publicOrigin": "https://hub.example.invalid/",
    "sessionCookieSigningKeys": ["<current unique signing key>"],
    "sessionIdPepper": "<unique session HMAC pepper>",
    "principals": [
      {
        "id": "support-agent",
        "passwordHash": "<Argon2id PHC value>",
        "inboxIds": ["support-inbox"],
        "replyIntentInboxIds": ["support-inbox"]
      }
    ]
  }
}
```

`publicOrigin` is an exact public HTTPS origin with `/` as its only path. It
cannot use an IP address, local/private hostname, credentials, query, or
fragment. `sessionCookieSigningKeys` has one or two unique printable
32–512-character values; the current signing key is first. `sessionIdPepper`
is a different printable 32–512-character value. These secrets must not collide
with each other or any connection/inbox credential. Each of one to one hundred
principals has a unique safe opaque ID, an Argon2id PHC password hash using the
exact `m=19456,t=2,p=1` profile, and one to one hundred unique existing inbox
IDs. Its optional `replyIntentInboxIds` field is a unique subset of those
already readable inbox IDs. When omitted, it becomes an empty immutable set and
does not grant dashboard intent recording.

Dashboard configuration creates no browser bearer. It enables only
server-rendered `/operator` routes with signed `Secure` `HttpOnly`
`SameSite=Strict` cookies and server-selected inbox scope. The supplied Compose
runner is loopback HTTP and intentionally omits `dashboard`; a browser login
must be deployed behind a real TLS proxy. Follow the
[Phase 4b operator dashboard guide](operator-dashboard-4b.md) for password
hashing, proxy controls, session rotation, and limits. The Phase 4e source
adds no configuration field: it uses the same signed session to render one
assigned inbox's queued history with no browser bearer or outbound action. The
The verified Phase 4f source adds only `replyIntentInboxIds` and uses it to
gate one server-rendered source-bound intent form per persisted inbound event;
it does not add provider configuration, a browser bearer, recipient selection,
or a provider send. See the [Phase 4f reply-intent guide](operator-dashboard-reply-intents-4f.md).

Do not paste a real document in a terminal command, issue, pull request,
screenshot, log, or repository file. The samples above contain placeholders,
not usable credentials.

## Choose exactly one configuration mode

### Direct or other non-Compose runtime

Create a local secret document at
<code>runtime-connections.local.json</code> or outside the repository. The
recommended repository-local filename is ignored by Git and Docker. For direct
development, point the Git-ignored <code>.env</code> file at its absolute path;
another non-Compose runtime can mount the raw secret file and set the same
environment variable:

```dotenv
CONNECTIONS_CONFIG_FILE=/absolute/path/to/open-channel-hub/runtime-connections.local.json
```

PostgreSQL configuration is required in this mode because accepted webhook
events must be registered and written durably. Start the runtime only after the
database configuration exists.

### Docker Compose

Compose does **not** consume raw JSON from <code>.env</code>. Provider
credentials may contain <code>$</code>, which Compose would otherwise treat as
an interpolation marker. Put the one-line, unpadded base64url encoding of the
exact JSON document in the local Git-ignored <code>.env</code> as
<code>CONNECTIONS_CONFIG_BASE64</code>. The base64url alphabet is limited to
letters, digits, <code>-</code>, and <code>_</code>; omit <code>=</code>
padding and line breaks.

Base64url is **not encryption**. The encoded value remains a credential-bearing
secret: generate/store it with a trusted local or deployment-secret workflow
without printing it to a terminal, issue, pull request, screenshot, or log.
Compose mounts the encoded bytes only as the
<code>runtime_connections_base64</code> Docker secret at
<code>/run/secrets/runtime_connections_base64</code> with UID/GID
<code>10001:10001</code> and mode <code>0400</code>. It gives the API only the
path through <code>CONNECTIONS_CONFIG_BASE64_FILE</code>; the encoded value and
decoded JSON are never API environment values.

Edit the local file with an editor rather than building a shell command that
contains credentials. Start normally:

```bash
docker compose up --build
```

Changing the document requires recreating the API container. A normal
<code>docker compose down</code> preserves the database volume;
<code>docker compose down --volumes</code> destroys its canonical events and
must not be used as a routine restart.

### Temporary legacy one-bot mode

The original environment configuration remains for one Bot only. It uses
<code>TELEGRAM_BOT_ENABLED=true</code>, <code>TELEGRAM_BOT_TOKEN</code>,
<code>OPERATOR_API_TOKEN</code>, <code>TELEGRAM_WEBHOOK_SECRET</code>, and an
optional <code>TELEGRAM_WEBHOOK_URL</code>.

Historical legacy <code>TELEGRAM_CONNECTION_ID</code> values are not rewritten
by this phase. In contrast, the multi-connection JSON document rejects
<code>.</code> and <code>..</code> specifically because its IDs appear in the
dynamic webhook route.

Do not set multi-connection mode together with any of these: a process refuses
to start if <code>CONNECTIONS_CONFIG_FILE</code> or
<code>CONNECTIONS_CONFIG_BASE64_FILE</code> is combined with
<code>TELEGRAM_BOT_ENABLED=true</code> or a nonblank legacy Bot token, operator
token, webhook secret, or webhook URL. The temporary
<code>TELEGRAM_CONNECTION_ID</code> has no effect in multi-connection mode.

## Routes and account isolation

| Purpose                                  | Multi-connection route                                                             | How the account is selected                                                                                                                                                                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telegram webhook ingress                 | <code>POST /v1/webhooks/telegram-bot/:connectionId</code>                          | The path resolves a configured connection, then its webhook secret must match. Unknown ID and wrong secret both return <code>401</code>.                                                                                                                                |
| Send text                                | <code>POST /v1/telegram-bot/messages</code>                                        | The unique <code>Authorization: Bearer</code> value maps to exactly one configured connection.                                                                                                                                                                          |
| Read canonical events                    | <code>GET /v1/telegram-bot/inbound-events</code>                                   | The same bearer token maps to exactly one configured connection. Cursor continuation is bound to that connection.                                                                                                                                                       |
| Zalo OA webhook ingress                  | <code>POST /v1/webhooks/zalo-oa</code>                                             | The exact signed JSON identifies the configured <code>(appId, oaId)</code>; the route then checks that entry's OA secret. Unknown identity and invalid signature both return <code>401</code>.                                                                          |
| Read Zalo OA events                      | <code>GET /v1/zalo-oa/inbound-events</code>                                        | The unique <code>Authorization: Bearer</code> value maps to exactly one configured OA. Cursor continuation is bound to that connection.                                                                                                                                 |
| Facebook verification                    | <code>GET /v1/webhooks/facebook-page</code> or <code>/v1/webhooks/meta</code>      | The product-specific route is for an App used only by Facebook Page. A shared Facebook/WhatsApp App uses `/meta`; its `hub.verify_token` must match one configured App before the exact `hub.challenge` is returned.                                                    |
| Facebook Page ingress                    | <code>POST /v1/webhooks/facebook-page</code> or <code>/v1/webhooks/meta</code>     | Every untrusted batch Page ID must resolve to one configured App before raw-byte `X-Hub-Signature-256` HMAC is checked. A shared App selects the product from the signed envelope at `/meta`; unknown/cross-App identity and invalid signature return <code>401</code>. |
| Read Facebook Page events                | <code>GET /v1/facebook-page/inbound-events</code>                                  | The unique <code>Authorization: Bearer</code> value maps to exactly one configured Page. Cursor continuation is bound to that connection.                                                                                                                               |
| WhatsApp verification                    | <code>GET /v1/webhooks/whatsapp-business</code> or <code>/v1/webhooks/meta</code>  | The product-specific route is for an App used only by WhatsApp. A shared Facebook/WhatsApp App uses `/meta`; its `hub.verify_token` must match one configured App before the exact `hub.challenge` is returned.                                                         |
| WhatsApp Business ingress                | <code>POST /v1/webhooks/whatsapp-business</code> or <code>/v1/webhooks/meta</code> | Every untrusted WABA ID must resolve to one configured App before raw-byte `X-Hub-Signature-256` HMAC is checked. A shared App selects the product from the signed envelope at `/meta`; unknown/cross-App identity and invalid signature return <code>401</code>.       |
| Read WhatsApp events                     | <code>GET /v1/whatsapp-business/inbound-events</code>                              | The unique <code>Authorization: Bearer</code> value maps to exactly one configured business phone. Cursor continuation is bound to that connection.                                                                                                                     |
| Read configured inbox                    | <code>GET /v1/inbox/inbound-events</code>                                          | The unique inbox <code>Authorization: Bearer</code> value maps to its configured connection allow-list. The caller supplies no inbox or connection ID. Cursor continuation is bound to that inbox and exact canonical connection set.                                   |
| Read dashboard                           | <code>GET /operator</code>                                                         | The signed-in configured dashboard principal selects only one of its preconfigured inboxes server side. The browser never receives an inbox bearer or connection credential.                                                                                            |
| Read dashboard queued history (Phase 4e) | <code>GET /operator/outbound-commands</code>                                       | The signed dashboard session selects only a preconfigured inbox server side. The browser receives no inbox bearer; the fixed 50-row continuation reuses the Phase 4d inbox/scope-bound history cursor.                                                                  |

The caller cannot select a connection ID on any read route. A cursor from one
account is rejected when presented with another account's bearer token. An
inbox cursor is rejected for a different inbox bearer or after that inbox's
connection set changes. This limits the current operator API to a configured
account or configured inbox scope per token; it is not user authentication or
RBAC.

The Phase 4a numeric ledger-order correction invalidates all per-account
cursors issued by earlier releases. They deliberately return `400` rather than
continue under mixed ordering and risk skipping an event; restart from the
first page after upgrading. Newly issued account and inbox cursors carry the
current ordering version.

The legacy one-bot mode retains
<code>POST /v1/webhooks/telegram-bot</code> only for compatibility. New
multi-connection configuration uses the dynamic path exclusively.

## Durable registry and migration boundary

At startup, the application derives each configured connection's connector ID,
channel, and tier from the compiled connector manifest. It writes only that
metadata plus the opaque connection ID to
<code>open_channel_hub.connection_registry</code>. It does not store Bot
names, phone numbers, provider account IDs, tokens, webhook secrets, the JSON
document, or raw provider payloads.

For Zalo OA, migration
<code>0005_connection_registry_provider_identity</code> adds a required,
domain-separated SHA-256 fingerprint of the configured
<code>(appId, oaId)</code> pair. It is not the raw pair or a credential. It
binds a Zalo connection ID to that pair after registration: an existing Zalo ID
cannot be restarted with a different fingerprint, and a first Zalo binding is
refused if pre-registry history already uses that ID. This configuration does
not contain an equivalent non-secret Telegram provider-account identifier, so
Telegram registry entries retain their existing connector/channel/tier binding.

For Facebook Page, migration
<code>0006_connection_registry_facebook_page_provider_identity</code> requires
the same opaque fingerprint field for every `facebook_page` row. It derives
from `(appId, pageId)`, never stores raw identifiers or a credential, rejects a
changed pair for an existing Page ID, and refuses a first Page binding when
pre-registry history already uses that internal connection ID.

For WhatsApp Business, migration
<code>0007_connection_registry_whatsapp_business_provider_identity</code>
requires the same opaque fingerprint field for every `whatsapp_business` row.
It derives from `(appId, wabaId, phoneNumberId)`, never stores raw identifiers
or a credential, rejects a changed triple for an existing business-phone ID,
and refuses a first WhatsApp binding when pre-registry history already uses that
internal connection ID.

When the optional dashboard is enabled, migration
<code>0008_dashboard_sessions</code> creates a separate session table. It
stores only HMACs of random browser session/anti-forgery values, a configured
principal ID, and session times/revocation state. It does not store a raw
browser token, password, password hash, inbox bearer, provider credential, or
inbox membership.

Migration <code>0009_outbound_reply_commands</code> adds immutable
source-bound reply intents. It records outgoing message text and private
source-derived target/message/channel metadata in PostgreSQL, but never a
provider credential, raw payload, attempt, receipt, or delivery state. The
runtime secret does not add a new field for this feature: an existing configured
inbox bearer selects its allowed source connections. See the
[Phase 4c reply-command guide](outbound-reply-commands-4c.md) before using the
write endpoint.

Phase 4d adds no runtime-secret setting or migration. It reads the same
`0009_outbound_reply_commands` rows through an inbox-scoped `GET` route that
projects recorded text with safe command metadata and filters `queued` state
only. Its independent history cursor binds a command-ID snapshot to the inbox
ID and canonical connection set; it must not be used as an inbound-event
cursor. See the [Phase 4d command-history guide](outbound-command-history-4d.md)
before exposing recorded message text to an operator.

Migration <code>0004_inbound_events_connection_registry_fk</code> is a
PostgreSQL foreign key marked <code>NOT VALID</code>. New event writes must
reference a registered connection. Existing Phase 2a event rows can remain
without an immediate data rewrite; a future, explicit reconciliation and
validation migration is required before claiming the historical ledger is fully
validated. Do not manually modify the registry or foreign key in a deployed
database.

Connection IDs are durable. Restarting with the same ID and the same compiled
connector metadata is safe. Reusing an ID for a different connector, channel,
or tier deliberately fails startup. Removing a connection from the secret
document stops its runtime feature; it does not delete historical events or its
registry row.

## Optional webhook registration

The webhook setter makes real Telegram network requests. In multi-connection
mode it processes every configured entry with a <code>webhookUrl</code>. It
never accepts a token on the command line and reports only a general result:

```bash
docker compose exec api npm run telegram:webhook:set
```

Run it only after the owner has explicitly authorized a test Bot and public TLS
route. Confirm that the reverse proxy keeps the operator API loopback-only and
does not log authorization headers, Telegram webhook secrets, or message
payloads. Registration acceptance alone does not prove webhook delivery,
account isolation, durable storage, or production readiness.

## Safe local proof

The repository's disposable Compose smoke test uses two synthetic Telegram Bot
connections, two synthetic Zalo OA connections, two synthetic Facebook Pages,
and two synthetic WhatsApp business phones on one fake shared Meta App. It also
configures separate support and sales inboxes, each spanning four of those
accounts. The Phase 4g candidate migrates all ten immutable schema entries
twice, verifies the delivery-evidence schema structurally without inserting an
attempt or receipt, then verifies
registry rows and Zalo/Facebook/WhatsApp fingerprint presence without printing
them, checks Telegram dynamic webhook behavior, proves Zalo raw-byte hashing
and shared Meta raw-byte HMAC boundaries, checks duplicate idempotency within
every connection, verifies account and inbox bearer scopes, and rejects both
cross-account and cross-inbox cursors. It also records synthetic source-bound
reply commands, proves exact idempotency/conflict/scope behavior, verifies a
source-derived private target in PostgreSQL, and exercises queued history's safe
projection/scope/cursor continuation and rejection. It deliberately omits
`dashboard` and does not attempt browser login over HTTP. It makes no provider
network request and uses no real credential or message.

Before a real account is used, still complete TLS/proxy, rate limiting,
monitoring, backup/restore, retention/deletion, secret rotation, access/audit,
and production verification work.
