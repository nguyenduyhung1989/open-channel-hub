# Phase 3c WhatsApp Business: signed inbound text only

**Status:** source implementation and synthetic verification only. This guide
does not authorize a real Meta App, WhatsApp Business Account (WABA), business
phone number, webhook subscription, Graph API call, access-token storage,
OAuth flow, or outbound message.

## Exact boundary

The official WhatsApp Business connector accepts only incoming text from a
signed WhatsApp Business Cloud API webhook. It does not implement media,
templates, status callbacks, delivery/read receipts, sends, access tokens,
OAuth, Graph API calls, automatic subscription, or any WhatsApp User surface.

| Concern        | Current behavior                                                                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ingress        | A WhatsApp-only Meta App uses `GET` and `POST /v1/webhooks/whatsapp-business`. An App configured for both Facebook Page and WhatsApp Business uses the one shared `GET` and `POST /v1/webhooks/meta` callback. Event notifications use `Content-Type: application/json`. |
| Verification   | The selected callback accepts `hub.mode=subscribe` only when `hub.verify_token` matches a configured Meta App token, then returns the exact `hub.challenge` with `200`. Invalid verification returns `403`.                                                              |
| Routing        | The POST body must identify `object: "whatsapp_business_account"`. Each `entry[].id` is a WABA ID. The service maps every WABA ID to configuration internally and requires the complete batch to resolve to one configured App before selecting its secret.              |
| Signature      | `X-Hub-Signature-256` must be `sha256=<lowercase hex>` for HMAC-SHA256 of the untouched raw request bytes with that App's `appSecret`. JSON is never reconstructed before comparison.                                                                                    |
| Accepted event | A `messages` change for `messaging_product: "whatsapp"`, with the configured WABA ID and `metadata.phone_number_id`, containing a text message with `from`, `id`, decimal-seconds `timestamp`, and string `text.body`.                                                   |
| Success        | A valid supported event returns `200` only after canonical data is durable. A valid unsupported item returns `200` without storage. Invalid JSON, WABA identity, batch identity, or signature returns the same generic `401`; storage failure returns generic `500`.     |
| Operator read  | `GET /v1/whatsapp-business/inbound-events` requires the unique bearer for one configured business phone and returns canonical fields only through phone-bound opaque cursors.                                                                                            |

Meta's [official WhatsApp Business getting-started documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
describes the Cloud API webhook model and its WABA/phone-number metadata. This
repository uses synthetic payloads only, so provider-facing prerequisites and
compatibility remain live-test work.

## Configure a secret document

Use the existing version-1 runtime connection document. It may contain
Telegram Bot, Zalo OA, Facebook Page, WhatsApp Business, or a permitted mixture
of those official entries. A WhatsApp Business entry has this shape:

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

Every value above is a placeholder. Put real values only in a Git-ignored local
secret or deployment secret store; never print the JSON, encode it in a shell
command, paste it into tickets, or commit it. The opaque internal `id` uses one
to 128 letters, digits, `.`, `_`, `:`, or `-`, except `.` and `..`; no webhook
or operator HTTP caller can choose it.

`appId`, `wabaId`, and `phoneNumberId` are decimal identifiers. `appSecret`,
`webhookVerifyToken`, and `operatorApiToken` must be distinct printable values
of 32–512 characters. A business phone ID and operator bearer must be unique.
One WABA must resolve to one configured Meta App. Several business phone
numbers and several WABAs may share one App only when its App secret and verify
token are exactly identical. The same App may also back Facebook Page entries
only with those exact credentials. A credential cannot be reused for another
App, another role, Telegram, or Zalo OA.

The optional `webhookUrl` may be the public HTTPS path
`/v1/webhooks/whatsapp-business` for an App configured only for WhatsApp, or
the common `/v1/webhooks/meta` path. It has no user info, query, fragment, or
secret. When one `appId` appears in both Facebook Page and WhatsApp Business
entries, every declared URL for that App must be the identical public
`/v1/webhooks/meta` URL; any entries may omit the field when no registration
URL is declared. The signed POST body selects configured WABAs and phone
numbers server side; it never accepts an internal connection ID.

On startup, Phase 3c derives a domain-separated SHA-256 fingerprint from each
configured `(appId, wabaId, phoneNumberId)` triple and stores only that opaque
value beside the connection registry metadata. Migration
`0007_connection_registry_whatsapp_business_provider_identity` requires it for
every `whatsapp_business` registry row. Restarting with the same triple is
safe; changing App, WABA, or phone number under an existing connection ID
fails before provider traffic is accepted. A first WhatsApp binding is also
refused if older pre-registry inbound history already uses that ID. The database
never stores the raw triple, App secret, verify token, operator bearer, access
token, or raw provider payload.

For direct non-Compose execution, store raw JSON in the ignored
`runtime-connections.local.json` convention or an external mounted secret and
set `CONNECTIONS_CONFIG_FILE` to its absolute path. For Compose, set only the
unpadded base64url representation in the Git-ignored
`CONNECTIONS_CONFIG_BASE64` value. Base64url prevents Compose `.env`
interpolation of `$` in a credential; it is not encryption.

Do not combine the shared runtime document with the temporary legacy Telegram
environment variables. The two configuration modes are mutually exclusive.

## Public webhook prerequisites

Before a real business phone is ever used, the owner must explicitly authorize
the provider test and public exposure. Then, separately:

1. Use Meta's official flow to connect the intended App, WABA, and business
   phone number. For an App used only by WhatsApp, configure the public HTTPS
   callback `/v1/webhooks/whatsapp-business`. For an App also used by Facebook
   Page, configure the one common `/v1/webhooks/meta` callback with the
   matching verify token. Subscribe only to the required WhatsApp message
   field. Provider-side
   subscription/admin permissions and any access token stay outside this
   receive-only runtime configuration.
2. Put a TLS reverse proxy in front of the fixed path. Keep operator APIs
   loopback-only and ensure the proxy does not log authorization headers,
   `X-Hub-Signature-256`, or request bodies.
3. Complete the provider's then-current App Review and access requirements
   before treating customer traffic as available. Configuration or a local
   `200` is not evidence that a live business account is eligible.
4. Deliver one owner-authorized harmless text message, then verify only the
   expected canonical event through that business phone's bearer-scoped read
   route without displaying a real secret, header, or customer message in
   shared output.

Webhook configuration or a `200` response alone does not prove TLS setup,
signature compatibility, subscription state, account isolation, durable
storage, backup/restore, data retention, or production readiness.

## Synthetic Compose proof

`scripts/verify-compose-postgres.sh` never contacts Meta, WhatsApp, Facebook,
Zalo, or Telegram. It starts a disposable local stack with eight fake
connections: two Telegram Bots, two Zalo OAs, two Facebook Pages and two
WhatsApp business phones on one fake shared Meta App, and a common `/meta`
callback. It runs seven forward migrations twice, then checks:

- The common Meta verification endpoint returns its synthetic challenge only
  for the configured verify token.
- The HMAC covers the original request bytes: a one-byte-different body with
  the original signature receives `401`.
- Signed Facebook Page and WhatsApp payloads both pass through the common
  callback. One signed multi-phone WhatsApp payload dispatches canonical text
  to both configured business phones. Repeating it is idempotent inside each
  phone connection, while the same provider message ID can exist in another
  connection.
- Every WhatsApp registry row has an opaque 64-character identity fingerprint;
  the proof does not print it, a WABA ID, a phone ID, a secret, or a raw
  provider payload.
- Each WhatsApp bearer reads only its assigned business phone, and a cursor
  from one phone is rejected for another.
- The runtime secret remains owned by `10001:10001` with mode `0400`, and the
  PostgreSQL application role remains non-superuser.

The test removes only its own named disposable Compose project and volume on
exit. It is not a safe reset procedure for a real deployment.

## Still required before operation

- An owner-authorized real Meta App/WABA/business phone, public TLS, signed
  webhook, subscription, and harmless inbound text test.
- Rate limiting, structured monitoring, alerting, timeout/load evidence, and a
  retry/overload design compatible with current provider behavior.
- Backup/restore, retention/deletion, encryption-at-rest decision, audit access
  model, secret rotation, and incident procedures.
- A product-level authorization model before giving people a UI, organizations,
  connection administration, or broader inbox access.
- Separate design, official-document review, and verification before access
  token handling, outbound messages, templates, media, statuses, or any other
  WhatsApp surface.
