# Runtime multi-connection configuration

This guide configures the current alpha's official Telegram Bot, Zalo Official
Account (OA), Facebook Page, and WhatsApp Business entries. It does not create
a dashboard, user login, organization, public connection API, or permission
model. It has not been
verified with a real provider account or public TLS endpoint.

## What is configured

One secret JSON document can configure one to one hundred Telegram Bot, Zalo
OA, Facebook Page, and WhatsApp Business connections. It contains credentials,
so treat the entire document as a secret even though the connection IDs are
opaque internal labels.

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

| Purpose                   | Multi-connection route                                                             | How the account is selected                                                                                                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telegram webhook ingress  | <code>POST /v1/webhooks/telegram-bot/:connectionId</code>                          | The path resolves a configured connection, then its webhook secret must match. Unknown ID and wrong secret both return <code>401</code>.                                                                                                                                |
| Send text                 | <code>POST /v1/telegram-bot/messages</code>                                        | The unique <code>Authorization: Bearer</code> value maps to exactly one configured connection.                                                                                                                                                                          |
| Read canonical events     | <code>GET /v1/telegram-bot/inbound-events</code>                                   | The same bearer token maps to exactly one configured connection. Cursor continuation is bound to that connection.                                                                                                                                                       |
| Zalo OA webhook ingress   | <code>POST /v1/webhooks/zalo-oa</code>                                             | The exact signed JSON identifies the configured <code>(appId, oaId)</code>; the route then checks that entry's OA secret. Unknown identity and invalid signature both return <code>401</code>.                                                                          |
| Read Zalo OA events       | <code>GET /v1/zalo-oa/inbound-events</code>                                        | The unique <code>Authorization: Bearer</code> value maps to exactly one configured OA. Cursor continuation is bound to that connection.                                                                                                                                 |
| Facebook verification     | <code>GET /v1/webhooks/facebook-page</code> or <code>/v1/webhooks/meta</code>      | The product-specific route is for an App used only by Facebook Page. A shared Facebook/WhatsApp App uses `/meta`; its `hub.verify_token` must match one configured App before the exact `hub.challenge` is returned.                                                    |
| Facebook Page ingress     | <code>POST /v1/webhooks/facebook-page</code> or <code>/v1/webhooks/meta</code>     | Every untrusted batch Page ID must resolve to one configured App before raw-byte `X-Hub-Signature-256` HMAC is checked. A shared App selects the product from the signed envelope at `/meta`; unknown/cross-App identity and invalid signature return <code>401</code>. |
| Read Facebook Page events | <code>GET /v1/facebook-page/inbound-events</code>                                  | The unique <code>Authorization: Bearer</code> value maps to exactly one configured Page. Cursor continuation is bound to that connection.                                                                                                                               |
| WhatsApp verification     | <code>GET /v1/webhooks/whatsapp-business</code> or <code>/v1/webhooks/meta</code>  | The product-specific route is for an App used only by WhatsApp. A shared Facebook/WhatsApp App uses `/meta`; its `hub.verify_token` must match one configured App before the exact `hub.challenge` is returned.                                                         |
| WhatsApp Business ingress | <code>POST /v1/webhooks/whatsapp-business</code> or <code>/v1/webhooks/meta</code> | Every untrusted WABA ID must resolve to one configured App before raw-byte `X-Hub-Signature-256` HMAC is checked. A shared App selects the product from the signed envelope at `/meta`; unknown/cross-App identity and invalid signature return <code>401</code>.       |
| Read WhatsApp events      | <code>GET /v1/whatsapp-business/inbound-events</code>                              | The unique <code>Authorization: Bearer</code> value maps to exactly one configured business phone. Cursor continuation is bound to that connection.                                                                                                                     |

The caller cannot select a connection ID on either operator route. A cursor
from one account is rejected when presented with another account's bearer
token. This limits the current operator API to one account per token; it is not
user authentication or RBAC.

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
and two synthetic WhatsApp business phones on one fake shared Meta App. It
migrates the seven immutable schema entries twice, verifies registry rows and
Zalo/Facebook/WhatsApp fingerprint presence without printing them, checks
Telegram dynamic webhook behavior, proves Zalo raw-byte hashing and shared Meta
raw-byte HMAC boundaries, checks duplicate idempotency within every connection,
verifies bearer-scoped reads, and rejects cross-account cursors. It makes no
provider network request and uses no real credential or message.

Before a real account is used, still complete TLS/proxy, rate limiting,
monitoring, backup/restore, retention/deletion, secret rotation, access/audit,
and production verification work.
