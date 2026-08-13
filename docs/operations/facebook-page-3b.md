# Phase 3b Facebook Page: signed inbound text only

**Status:** final local verification, synthetic Docker proof, independent
review, GitHub CI, and CodeQL passed for exact commit `c933102`; live-provider
proof remains separate. This guide does not authorize a real Meta App, Facebook
Page, webhook registration, Graph API call, OAuth flow, Page access-token
storage, or outbound message.

## Exact boundary

The official Facebook Page connector accepts only customer-originated text
messages from a signed Messenger Platform Page webhook. It does not implement
Facebook User, attachments, postbacks, delivery/read events, sends, access
tokens, OAuth, or Graph API calls. The product-specific
`/v1/webhooks/facebook-page` callback remains valid for an App used only by
Facebook Page. If that same Meta App also configures WhatsApp Business, both
products must use the common `/v1/webhooks/meta` callback; see the
[Phase 3c WhatsApp Business guide](whatsapp-business-3c.md).

| Concern        | Current behavior                                                                                                                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingress        | A Facebook-only Meta App uses `GET` and `POST /v1/webhooks/facebook-page`. An App configured for both Facebook Page and WhatsApp Business uses the one shared `GET` and `POST /v1/webhooks/meta` callback. Event notifications use `Content-Type: application/json`.                      |
| Verification   | `GET` accepts `hub.mode=subscribe` only when `hub.verify_token` matches a configured App token, then returns the exact `hub.challenge` with `200`. Invalid verification returns `403`.                                                                                                    |
| Routing        | The POST body carries `object: "page"` and one or more `entry[].id` Page IDs, not an App ID. The service maps every Page ID to configuration internally and requires the whole batch to belong to exactly one configured App before selecting its secret.                                 |
| Signature      | `X-Hub-Signature-256` must be `sha256=<lowercase hex>` for HMAC-SHA256 of the untouched raw request bytes with that App's `appSecret`. JSON is never reconstructed before comparison: whitespace and escaped Unicode are significant.                                                     |
| Accepted event | A customer text item whose entry ID and `recipient.id` match the configured Page ID, with valid `sender.id`, `message.mid`, string `message.text`, and a valid millisecond timestamp. `message.is_echo: true` and unsupported items are acknowledged but never stored.                    |
| Success        | A valid supported event returns `200` only after canonical data is durable. A valid unsupported event returns `200` without storage. Invalid JSON, Page identity, batch identity, or signature returns the same generic `401`; a storage failure returns generic `500` so Meta can retry. |
| Operator read  | `GET /v1/facebook-page/inbound-events` requires the unique bearer for one configured Page and returns canonical fields only through Page-bound opaque cursors.                                                                                                                            |

The [official Messenger Platform webhook guide](https://developers.facebook.com/docs/messenger-platform/webhooks)
documents the HTTPS endpoint, verification request, raw-body HMAC header,
delivery retries, and five-second response expectation. The
[message-received reference](https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received)
documents the Page messaging envelope. This repository uses synthetic payloads
only, so those provider-facing conditions remain live-test work.

## Configure a secret document

Use the existing version-1 runtime connection document. It may contain
Telegram Bot, Zalo OA, Facebook Page, WhatsApp Business, or a permitted mixture
of those official entries. A Facebook Page entry has this shape:

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

Every value above is a placeholder. Put real values only in a Git-ignored local
secret or deployment secret store; never print the JSON, encode it in a shell
command, paste it into tickets, or commit it. The opaque internal `id` uses one
to 128 letters, digits, `.`, `_`, `:`, or `-`, except `.` and `..`; no webhook
or operator HTTP caller can choose it.

`appId` and `pageId` are decimal identifiers. `appSecret`,
`webhookVerifyToken`, and `operatorApiToken` must be distinct printable values
of 32–512 characters. A Page ID and operator bearer must be unique globally.
Multiple Pages may share one App only when their `appSecret` and
`webhookVerifyToken` are exactly the same. A token or secret cannot be reused
for another App, another role, Telegram, or Zalo OA credential.

The optional `webhookUrl` may be
`https://your-public-host/v1/webhooks/facebook-page` or the shared
`https://your-public-host/v1/webhooks/meta`, with no username, password, query,
fragment, or secret. If the App also has WhatsApp Business entries, every
declared callback URL for that App must be the identical `/v1/webhooks/meta`
URL. The POST payload selects configured Pages server side; an HTTP caller never
chooses an internal connection ID.

On startup, Phase 3b derives a domain-separated SHA-256 fingerprint from each
configured `(appId, pageId)` pair and stores only that opaque value beside the
connection registry metadata. Migration
`0006_connection_registry_facebook_page_provider_identity` requires it for
every `facebook_page` registry row. Restarting with the same Page is safe;
changing App or Page under an existing connection ID fails before provider
traffic is accepted. A first Facebook binding is also refused if older
pre-registry inbound history already uses that ID. The database never stores
the raw pair, App secret, verify token, operator bearer, Page access token, or
raw provider payload.

For direct non-Compose execution, store raw JSON in the ignored
`runtime-connections.local.json` convention or an external mounted secret and
set `CONNECTIONS_CONFIG_FILE` to its absolute path. For Compose, set only the
unpadded base64url representation in the Git-ignored
`CONNECTIONS_CONFIG_BASE64` value. Base64url prevents Compose `.env`
interpolation of `$` in a credential; it is not encryption.

Do not combine the shared runtime document with the temporary legacy Telegram
environment variables. The two configuration modes are mutually exclusive.

## Public webhook prerequisites

Before a real Page is ever used, the owner must explicitly authorize the
provider test and public exposure. Then, separately:

1. Create the Meta App and attach it to the intended Page using Meta's official
   flow. For an App used only by Facebook Page, configure the public HTTPS
   callback `/v1/webhooks/facebook-page`. For an App also used by WhatsApp
   Business, configure the one common `/v1/webhooks/meta` callback and the same
   verify token as the runtime document. Meta requires a valid public TLS
   certificate; self-signed certificates are not supported.
2. Subscribe only to the required `messages` webhook field. Meta's official
   Page subscription flow requires an appropriate Page access token plus
   `pages_messaging` and `pages_manage_metadata`; this Phase stores none of
   those access tokens and does not call `/{page-id}/subscribed_apps`.
3. For real non-role customers, obtain the relevant Meta Advanced Access before
   treating message delivery as available. Standard Access is not proof that
   customer traffic works.
4. Put a TLS reverse proxy in front of the configured callback path. Keep operator APIs
   loopback-only and ensure the proxy does not log authorization headers,
   `X-Hub-Signature-256`, or request bodies.
5. Deliver one owner-authorized harmless text message, then verify only the
   expected canonical event through that Page's bearer-scoped read route without
   displaying a real secret, header, or customer message in shared output.

Webhook configuration or a `200` response alone does not prove TLS setup,
signature compatibility, retry behavior, account isolation, durable storage,
backup/restore, data retention, or production readiness.

## Synthetic Compose proof

`scripts/verify-compose-postgres.sh` never contacts Meta, Facebook, WhatsApp,
Zalo, or Telegram. It starts a disposable local stack with eight fake
connections: two Telegram Bots, two Zalo OAs, two Facebook Pages, and two
WhatsApp business phones on one fake shared Meta App. It runs seven forward
migrations twice, then proves:

- The common Meta callback returns its synthetic challenge only for the
  configured verify token.
- The HMAC covers the original request bytes: a one-byte-different body with
  the original signature receives `401`.
- One signed multi-Page payload dispatches canonical text to each configured
  Page through the common callback. Repeating it is idempotent inside each
  Page, while the same provider `mid` can exist in another Page connection.
- Every Facebook registry row has an opaque 64-character identity fingerprint;
  the proof does not print it, a Page ID, a secret, or a raw provider payload.
- Each Facebook bearer reads only its assigned Page, and a cursor from one Page
  is rejected for another.
- The runtime secret remains owned by `10001:10001` with mode `0400`, and the
  PostgreSQL application role remains non-superuser.

The test removes only its own named disposable Compose project and volume on
exit. It is not a safe reset procedure for a real deployment.

## Still required before operation

- An owner-authorized real Meta App/Page, public TLS, signed webhook, and
  harmless inbound text test.
- Rate limiting, structured monitoring, alerting, timeout/load evidence, and
  a retry/overload design compatible with Meta's five-second expectation.
- Backup/restore, retention/deletion, encryption-at-rest decision, audit access
  model, secret rotation, and incident procedures.
- A product-level authorization model before giving people a UI, organizations,
  connection administration, or broader inbox access.
- Separate design, official-document review, and verification before Facebook
  User, outbound messages, Page access-token handling, attachments, or any
  other Meta surface.
