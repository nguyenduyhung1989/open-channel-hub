# Phase 3a Zalo Official Account: signed inbound text only

**Status:** source implementation and synthetic verification only. This guide
does not authorize a real Zalo account, webhook registration, OAuth flow, or
outbound message.

## Exact boundary

The current official Zalo Official Account (OA) connector accepts only a
signed `user_send_text` webhook and only after its canonical event is durably
appended to PostgreSQL:

| Concern        | Current behavior                                                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ingress        | `POST /v1/webhooks/zalo-oa` with `Content-Type: application/json`                                                                                                                                                                                                                    |
| Routing        | The application reads `app_id` and `recipient.id` from the provider payload, finds the configured `(appId, oaId)` pair internally, then verifies its configured `oaSecretKey`. The HTTP caller never selects an internal connection ID.                                              |
| Signature      | `X-ZEvent-Signature` must equal SHA-256 over the exact UTF-8 JSON bytes: `appId + raw JSON + timestamp + oaSecretKey`. Whitespace, key order, and Unicode bytes are significant; the body is not reconstructed before verification.                                                  |
| Accepted event | `event_name: "user_send_text"`, with a nonempty message ID, string text, sender ID, app ID, OA recipient ID, and valid millisecond timestamp.                                                                                                                                        |
| Success        | The API returns `200` only after the canonical event reaches durable storage. A signed unsupported event is acknowledged with `200` without storage. Invalid identity/signature returns the same `401` response. Storage failure returns a generic `500`, so the provider may retry. |
| Operator read  | `GET /v1/zalo-oa/inbound-events` requires the unique bearer token configured for that OA. It returns only canonical fields for that connection and has account-bound opaque cursors.                                                                                                 |

This is not a user inbox, a dashboard, OAuth, token refresh, outbound
messaging, attachments, Zalo User, or a real provider proof. It makes no Zalo
network request at startup or from this inbound-only route.

The [official Zalo OA event reference](https://docs.zaloplatforms.com/docs/OA/webhook/tin-nhan/su-kien-nguoi-dung-gui-tin-nhan)
documents the POST JSON event and the exact signature concatenation. The
[official webhook overview](https://docs.zaloplatforms.com/docs/OA/webhook/tong-quan)
requires HTTPS, a `200` response, and a response within two seconds; it also
documents provider retries. This repository validates locally with synthetic
payloads only, so those provider-facing constraints remain live-test work.

## Configure a secret document

Use the existing version-1 runtime connection document. It may contain
Telegram Bot entries, Zalo OA entries, or both. A Zalo OA entry has this shape:

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

All shown values are placeholders. Put real values only in the Git-ignored
local secret or a deployment secret store. Do not print the JSON, encode it in
a shell command, paste it in tickets, or commit it. The `id` is an opaque
internal label (one to 128 letters, digits, `.`, `_`, `:`, or `-`, except `.`
and `..`); it is never supplied by a webhook or operator HTTP caller.

`appId` and `oaId` are decimal identifiers. `oaSecretKey` is the exact secret
configured for that OA connection. The loader rejects duplicate `(appId, oaId)`
pairs, duplicate operator tokens, and credential-role collisions. It does not
assert that OA entries sharing an App ID must share a secret: configure each
entry with the secret that belongs to its own connection.

On startup, Phase 3a derives a domain-separated SHA-256 fingerprint from each
configured `(appId, oaId)` pair and stores only that opaque value beside the
connection registry metadata. Migration `0005_connection_registry_provider_identity`
requires a fingerprint for a `zalo_oa` registry row. Restarting with the same
connection ID and pair is safe; changing the pair for an existing Zalo ID fails
before provider traffic is accepted. The first Zalo fingerprint is also refused
when that ID already has pre-registry inbound history, avoiding an unsafe
retroactive claim about the old data. The database never stores the raw pair,
the OA secret, the operator token, or provider payload.

For direct non-Compose execution, store raw JSON in the ignored
`runtime-connections.local.json` convention or an external mounted secret and
set `CONNECTIONS_CONFIG_FILE` to its absolute path. For Compose, set only the
unpadded base64url representation in the Git-ignored
`CONNECTIONS_CONFIG_BASE64` value. Compose mounts that value at
`/run/secrets/runtime_connections_base64` as `10001:10001 0400`; the API sees
only `CONNECTIONS_CONFIG_BASE64_FILE`. Base64url prevents Compose `.env`
interpolation of `$` in a credential; it is not encryption.

Do not combine the shared runtime document with the temporary legacy Telegram
environment variables. The two configuration modes are mutually exclusive.

## Public webhook prerequisites

Before a real account is ever used, the owner must explicitly authorize the
provider test and the public exposure. Then, separately:

1. Create/configure the Zalo App and link/authorize the intended OA through
   Zalo's official management flow. The official setup guide states that an App
   can be linked to one or more OAs. Zalo's webhook overview states that the OA
   must grant `Official_Account_Access_Token` to the linked App before webhook
   events can be received. That provider-side authorization is a prerequisite,
   not a Phase 3a runtime credential: this repository does not store, refresh,
   transmit, or place that access token in the runtime document.
2. Put an HTTPS reverse proxy in front of the fixed path
   `/v1/webhooks/zalo-oa`. Keep the operator API loopback-only and ensure the
   proxy does not log authorization headers, `X-ZEvent-Signature`, or request
   bodies.
3. Register the same exact public HTTPS URL in the Zalo App settings and enable
   only the required text-message event. The current connector does not register
   it automatically.
4. Deliver one owner-authorized harmless text message, then verify only the
   expected canonical event through the OA's bearer-scoped read route without
   displaying a real header, secret, or message in shared output.

Provider registration or a `200` response alone does not prove TLS setup,
signature compatibility, retry behavior, account isolation, durable storage,
backup/restore, data retention, or production readiness.

## Synthetic Compose proof

`scripts/verify-compose-postgres.sh` never contacts Zalo or Telegram. It starts
a disposable local stack with four synthetic connections (two Telegram Bots and
two Zalo OAs), runs migrations twice, then proves:

- Zalo's signature is calculated over the original raw JSON bytes; the same
  signature paired with a one-byte-different body receives `401`.
- A valid synthetic Zalo text event returns `200` only after durable append.
- A duplicate Zalo delivery is idempotent within its connection, while the same
  provider message ID can exist under a different configured connection.
- The connection registry contains exactly the expected official metadata; it
  contains no secret or provider payload, and both Zalo rows have an opaque
  64-character identity fingerprint without printing it.
- Each Zalo bearer reads only its assigned account, and a cursor from one OA is
  rejected for another.
- The runtime secret remains owned by `10001:10001` with mode `0400`, and the
  PostgreSQL application role remains non-superuser.

The test removes only its own named disposable Compose project and volume on
exit. It is not a safe reset procedure for a real deployment.

## Still required before operation

- An owner-authorized real Zalo App/OA, public TLS, and signed webhook test.
- Rate limiting, structured monitoring, alerting, timeout/load evidence, and
  a retry/overload design compatible with the two-second provider expectation.
- Backup/restore, data retention/deletion, encryption-at-rest decision, audit
  access model, secret rotation, and incident procedures.
- A product-level authorization model before giving people a UI, organizations,
  connection administration, or broader inbox access.
- Separate design, official-document review, and verification before OAuth,
  access tokens, outbound messages, attachments, Zalo User, or any other Zalo
  surface.
