# Experimental Zalo User group bridge

**Status: local experimental source candidate.** This guide describes the
source and synthetic tests only. It is not evidence that Zalo accepts a real
account session, message, image, reconnect, or production deployment.

The bridge is for one narrow owner-operated task:

1. accept non-self plain text from a Zalo group;
2. make that canonical group event durable in Open Channel Hub; and
3. explicitly send plain text or one JPEG/PNG/WebP image to a group that this
   running bridge has already delivered successfully.

It uses `zca-js`, an unofficial Zalo Web implementation. Treat it as an
account-risk experiment. Do not use it for bulk sending, evasion, CAPTCHA
bypass, impersonation, direct-message automation, or unattended retries.

## What is isolated

The bridge is not a Compose service and is not built into the API image. Run it
on the owner's local host or a separately controlled host. The API runtime
configuration never contains a QR cookie, IMEI, or user agent. The bridge does
not persist them either; it creates a fresh QR login at process start.

The bridge control service binds only to `127.0.0.1`. It has a separate local
control token, so the Hub bridge bearer cannot also control group sends.

## Hub configuration

Add one strict `zalo_user` entry to the existing version-1 runtime connection
document. Replace each placeholder only in the mounted secret file.

```json
{
  "id": "zalo-user-support",
  "type": "zalo_user",
  "accountId": "<numeric Zalo account ID>",
  "bridgeToken": "<distinct 32-512 printable bridge token>",
  "operatorApiToken": "<distinct 32-512 printable operator token>"
}
```

`accountId` is a numeric binding, not a phone number. At startup the Hub stores
only a domain-separated SHA-256 account-binding fingerprint. It rejects an
attempt to reuse a Zalo User `connectionId` for a different account after
history exists.

The bridge sends events only to:

```text
POST /v1/experimental/zalo-user/<connectionId>/events
```

The endpoint requires the matching `bridgeToken` before parsing JSON. It
accepts group text only and returns `204` only after the canonical event is
durable. It rejects direct-message events.

## Local bridge configuration

Create two separate owner-only token files outside the repository, both mode
`0600`. The first contains the exact Hub `bridgeToken`; the second is a new,
different local-control token. Do not put either token in a shell history,
committed `.env` file, issue, or log.

Set these local environment variables:

```text
ZALO_USER_BRIDGE_ACCOUNT_ID=<same numeric accountId>
ZALO_USER_BRIDGE_CONNECTION_ID=zalo-user-support
ZALO_USER_BRIDGE_HUB_URL=https://hub.example.invalid
ZALO_USER_BRIDGE_TOKEN_FILE=/absolute/private/path/zalo-user-hub-bridge-token
ZALO_USER_BRIDGE_CONTROL_TOKEN_FILE=/absolute/private/path/zalo-user-control-token
ZALO_USER_BRIDGE_CONTROL_PORT=9472
```

`ZALO_USER_BRIDGE_HUB_URL` must be an HTTPS origin without a path, query,
fragment, or credentials. `http://localhost`, `http://127.0.0.1`, and
`http://[::1]` are permitted only for local development.

Start the bridge from a normal dependency-installed checkout:

```bash
npm run zalo-user:bridge:dev
```

The bridge prints the path of a temporary owner-only QR image. Scan that QR
once from the intended Zalo account. It deletes the QR directory on exit; it
does not save QR session material for a later restart.

## Sending to an observed group

First let the group produce a plain-text message while the bridge is connected.
The Hub must return `204`. The bridge then remembers that group only for this
running process. Read the group's canonical event through the authenticated
Zalo User inbound reader to obtain its `conversationId`; that value is the
local control path segment.

The local service does not enumerate groups. It accepts at most 20 explicit
sends across the bridge in a rolling minute. A rejected/ambiguous provider
request is returned once and is never automatically sent again.

### Send plain text

```bash
curl --fail-with-body --request POST \
  --header 'Authorization: Bearer <local control token>' \
  --header 'Content-Type: application/json' \
  --data '{"text":"Hello group"}' \
  http://127.0.0.1:9472/v1/groups/<conversationId>/text
```

### Send one image

The request body is JSON, not a local pathname. Supply canonical padded Base64
image data and a matching filename. The bridge accepts only JPEG, PNG, or WebP
magic bytes, matching extension, 1 byte–10 MiB decoded data, and an optional text
caption.

```json
{
  "filename": "status.png",
  "caption": "Current status",
  "dataBase64": "<base64 of one PNG/JPEG/WebP file>"
}
```

Send that JSON to:

```text
POST http://127.0.0.1:9472/v1/groups/<conversationId>/image
```

with the same `Authorization: Bearer <local control token>` header. A successful
send returns `204`. `404` means the running bridge has not admitted that group;
`429` means the local anti-bulk limit was reached; `502` means Zalo did not
complete the one provider call. None of these responses claims delivery or
read status.

## Reconnect behavior

The bridge does not delegate reconnect policy to `zca-js`. On close code
`1006`, it tries the same in-memory listener after 1 second, 5 seconds, then
30 seconds. No fourth retry is made. A duplicate-connection or kicked-session
close requires a human restart and a new QR scan; sending remains disabled
until a new listener reaches `connected`.

## Boundaries and residual risk

- No direct-message send or receive is exposed by this bridge route.
- No bulk recipient list, group enumeration, scheduled job, automatic reply,
  delivery receipt, retry worker, or browser send surface exists.
- The bridge keeps the group allow-list only in memory. A process restart
  requires a new inbound group text before that group is send-eligible again.
- The local control service is not public. Do not reverse-proxy it, bind it to
  `0.0.0.0`, or use a token shared with the Hub.
- The source does not prove that Zalo permits this use, that the unofficial
  dependency remains compatible, or that an account will not be restricted.
