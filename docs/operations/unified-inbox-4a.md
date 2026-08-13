# Phase 4a unified read-only inbox

Phase 4a adds one deliberately small aggregate read API. A configured inbox
can return canonical inbound events from an explicit set of existing
connections through one bearer credential. It does not add a web dashboard,
user account, organization, role model, conversation summary, search, outbound
message, provider token, or live-provider operation.

The word "inbox" in this phase means a server-selected read scope, not a
complete customer-support product. The PostgreSQL ledger remains the source of
the events, and raw provider payloads remain outside storage and this API.

## Prerequisites and configuration

The existing secret-backed version-1 runtime document must already contain one
or more official connections and PostgreSQL must be configured. Add the
optional `inboxes` array at the document root:

```json
{
  "version": 1,
  "connections": [
    {
      "id": "telegram-bot-support",
      "type": "telegram_bot",
      "botToken": "<Telegram Bot token>",
      "operatorApiToken": "<unique connection operator token>",
      "webhookSecret": "<Telegram webhook secret>"
    },
    {
      "id": "facebook-page-support",
      "type": "facebook_page",
      "appId": "<Meta App ID>",
      "pageId": "<Facebook Page ID>",
      "appSecret": "<Meta App secret>",
      "webhookVerifyToken": "<Meta verify token>",
      "operatorApiToken": "<unique connection operator token>"
    }
  ],
  "inboxes": [
    {
      "id": "support-inbox",
      "token": "<unique 32-512 character inbox token>",
      "connectionIds": ["facebook-page-support", "telegram-bot-support"]
    }
  ]
}
```

`inboxes` is optional; omitting it leaves the account-scoped APIs unchanged.
When present, it must contain one to one hundred entries. Each entry has:

- `id`: an opaque inbox label of one to 128 letters, digits, `.`, `_`, `:`, or
  `-`, except `.` and `..`. It is unique among inbox entries.
- `token`: one unique printable non-whitespace secret of 32 to 512 characters.
  It must not equal another inbox token or any configured provider, webhook, or
  account-operator credential.
- `connectionIds`: one to one hundred unique IDs already present in
  `connections`. The process canonicalizes the resulting set before use; a
  caller cannot add, remove, or choose an account in an HTTP request.

The whole document remains a secret. It contains provider credentials and
inbox bearer tokens; do not commit it, print it, attach it to an issue, or put
it in a screenshot. For Docker Compose, use the existing unpadded base64url
secret-file workflow from the
[runtime multi-connection guide](runtime-multi-connection-2c.md). Recreate the
API container after changing the document.

## Read the aggregate event feed

Use the configured inbox token with `GET /v1/inbox/inbound-events`:

```bash
curl \
  --header 'Authorization: Bearer <inbox token>' \
  'http://127.0.0.1:3000/v1/inbox/inbound-events?limit=50'
```

`limit` is optional and ranges from 1 to 100, with a default of 50. `cursor`
is optional and must be an opaque `nextCursor` returned by the preceding page.
The API returns canonical events only:

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "facebook-page:facebook-page-support:event:example",
        "providerEventId": "example",
        "type": "message.received",
        "connectionId": "facebook-page-support",
        "channel": "facebook_page",
        "occurredAt": "2026-08-13T00:00:00.000Z",
        "message": {
          "id": "example",
          "senderId": "example-sender",
          "conversationId": "example-conversation",
          "text": "Example canonical text"
        }
      }
    ],
    "nextCursor": "<opaque value when another page exists>"
  }
}
```

The feed is ordered by the durable inbound-ledger sequence, newest first. Its
first page fixes a maximum sequence for that inbox scope, so later arrivals do
not shift or duplicate an already-started traversal. It is not ordered by a
provider's clock and is not a conversation/thread view.

## Isolation and failure behavior

The route authenticates the inbox bearer before parsing the query or reading
storage. It then resolves the configured inbox internally. It has no inbox ID,
connection ID, or scope parameter, so an HTTP caller cannot widen the allowed
connections.

Each opaque cursor carries the configured inbox ID and a SHA-256 binding to the
canonical connection set in addition to its ledger position. A cursor from a
different inbox, or one created before that inbox's connection set changes, is
rejected with `400`. A malformed cursor is also rejected with `400`. The cursor
is not an authorization credential: the inbox bearer is always required.

An absent, malformed, or unknown inbox bearer returns the same generic `401`
response. A connection-level operator token cannot authenticate the aggregate
route, and an inbox token cannot select an individual connection route. Keep
the two credentials separate and rotate them through the secret-management
workflow when one is suspected exposed.

The endpoint returns canonical fields already retained by the ledger. It does
not return raw provider payloads, configuration values, provider secrets,
inbox membership metadata, database ledger IDs, or an account listing.

## What remains outside Phase 4a

- No browser UI, user identity, organization, role-based access control,
  invitation flow, audit log, public connection administration, or token
  rotation endpoint.
- No conversation aggregation, read/unread state, assignment, labels, search,
  attachment handling, retention/deletion workflow, backup/restore proof, or
  encryption-at-rest assurance.
- No outbound queue, retry policy, delivery status, template, Graph API call,
  OAuth, provider access-token storage, or live-provider request.
- No public TLS deployment or live Telegram, Zalo OA, Facebook Page, or
  WhatsApp Business verification.

The repository's disposable Compose smoke test exercises multiple synthetic
connections in two separate configured inboxes, bearer isolation, cursor-scope
rejection, and canonical-only output. It makes no provider network request and
does not prove a live account, TLS endpoint, or production authorization model.
