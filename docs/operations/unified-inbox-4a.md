# Phase 4a inbox scope and Phase 4c–4e reply-command boundary

Phase 4a adds one deliberately small aggregate read API. A configured inbox
can return canonical inbound events from an explicit set of existing
connections through one bearer credential. Phase 4a itself did not add an
outbound message path. Phase 4c now allows that same bearer to record a
source-bound reply intent and Phase 4d lets it read the same scope's queued
intent history. The Phase 4e source adds a server-rendered view of that
history for a configured dashboard principal. The Phase 4f candidate adds a
separate opt-in source-bound dashboard form, but none of these additions adds a
user account, organization, role model, conversation summary, search, provider
token, or live-provider operation. See the
[operator dashboard guide](operator-dashboard-4b.md) and the
[Phase 4e guide](operator-dashboard-queued-history-4e.md) and
[Phase 4f guide](operator-dashboard-reply-intents-4f.md).

The word "inbox" in these phases means a server-selected scope, not a complete
customer-support product. The PostgreSQL ledger remains the source of the
events, and raw provider payloads remain outside storage and these APIs.

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

The read endpoint returns canonical fields already retained by the ledger. It does
not return raw provider payloads, configuration values, provider secrets,
inbox membership metadata, database ledger IDs, or an account listing.

## Phase 4c source-bound command addition

The same configured inbox bearer can call
`POST /v1/inbox/outbound-commands` to record a durable reply intent for one
already stored event in its configured connection set. The strict body contains
only `clientOperationId`, `sourceConnectionId`, `sourceProviderEventId`, and
`text`. It has no caller-selected recipient or provider delivery setting.

The database derives the private reply target from the canonical source event's
`conversationId`, stores it alongside the source message/channel and message
text, and returns none of those private fields. A new command returns `201`;
the exact same command returns `200`; reusing that client operation ID with a
different source or text returns `409`; a missing event and an event outside
the selected scope both return the same `404`. See the dedicated
[Phase 4c reply-command guide](outbound-reply-commands-4c.md) for the request,
idempotency, and data boundary.

`queued` means the intent is durably recorded only. There is no worker,
provider dispatch, retry, receipt, or delivery state in Phase 4c.

## Phase 4d queued command-history addition

The same configured inbox bearer can call
`GET /v1/inbox/outbound-commands` to read `queued` Phase 4c commands across
its fixed connection set. The only accepted query fields are a 1–100 `limit`
(default 50) and the history route's own opaque `cursor`. The result includes
the recorded text, command/source IDs, `queued`, creation time, and optional
`nextCursor`; it never includes private reply target, source message/channel,
client operation ID, raw provider data, credentials, or delivery-attempt data.

This cursor is separate from an inbound-event cursor. It has `orderVersion: 1`
and binds its command-ID snapshot to the exact inbox ID plus canonical
connection set. A malformed, foreign, or changed-scope cursor returns `400`.
The history has no state filter and deliberately lists only `queued` intents;
it is not a delivery timeline. See the dedicated
[Phase 4d command-history guide](outbound-command-history-4d.md).

## Phase 4e dashboard-history source

The verified Phase 4e source adds `GET /operator/outbound-commands` only inside the
optional server-rendered dashboard. It authenticates and touches the dashboard
session before query parsing, cursor decoding, or storage access. The route
selects only an inbox already assigned to the configured principal; it never
accepts an inbox bearer or caller-selected connection scope.

The page fixes its history read at 50 rows and reuses the Phase 4d
`orderVersion: 1` cursor, including its exact inbox and connection-set binding.
It renders only escaped creation time, recorded text, source connection ID, and
a recorded-not-sent label. It deliberately omits command/provider-event IDs,
private target/source metadata, client operation ID, credentials, and delivery
data. It adds no runtime-secret field, migration, command write, provider
request, worker, send, retry, cancel, or delivery state; a page view only
performs the existing dashboard-session touch.

Exact commit <code>465186e</code> passed final local verification, independent
security review, a synthetic Compose proof, and fresh GitHub CI/CodeQL. It does
not change the Phase 4d inbox-bearer API or make `queued` into a delivery
result. It is not a public-TLS or production deployment claim. See the dedicated
[Phase 4e dashboard-history guide](operator-dashboard-queued-history-4e.md).

## Phase 4f candidate dashboard write subset

The Phase 4f candidate keeps read scope and write scope distinct. An optional
`dashboard.principals[].replyIntentInboxIds` array must be a unique subset of
that same principal's readable `inboxIds`; absence resolves to an empty list.
The server therefore renders a reply-intent form only for an explicitly enabled
principal/inbox pair, while the same principal can continue to read any inbox
already granted by `inboxIds`.

Each form belongs to one rendered durable inbound event. Its editable value is
reply text; the server provides the source connection ID, source provider-event
ID, and fresh UUIDv4 operation ID as hidden transport inputs. On submission it
requires the signed dashboard session, exact configured HTTPS origin,
anti-forgery token, strict non-duplicated form, explicit write grant, and the
existing Phase 4c source-bound command store. The browser never receives an
inbox bearer, provider credential, recipient, or private target.

A created command or exact replay redirects to the existing queued-history
page and says only that the intent was recorded, not sent. The candidate adds no
provider request, dispatch, retry, delivery model, command mutation, or schema
change. Its local in-process guard allows at most 20 record attempts per
rolling minute per configured dashboard principal; an HTTPS proxy still needs
its own rate limit and safe log handling. See the
[Phase 4f reply-intent guide](operator-dashboard-reply-intents-4f.md).

## What remains outside the Phase 4f candidate

- No full user identity, organization, role-based access control, invitation
  flow, audit log, public connection administration, or token rotation
  endpoint. The separate Phase 4b dashboard and Phase 4e source are
  configured-local principal views, not replacements for those capabilities.
- No conversation aggregation, read/unread state, assignment, labels, search,
  attachment handling, retention/deletion workflow, backup/restore proof, or
  encryption-at-rest assurance.
- No dispatch worker, provider HTTP client, retry policy, attempt record,
  delivery/read status, template, Graph API call, OAuth, provider access-token
  storage, or live-provider request. The separate legacy Phase 1a Telegram
  direct-send endpoint is not part of the durable command path.
- No public TLS deployment or live Telegram, Zalo OA, Facebook Page, or
  WhatsApp Business verification.

The repository's disposable Compose smoke test exercises multiple synthetic
connections in two separate configured inboxes, bearer isolation, cursor-scope
rejection, canonical-only inbound output, and queued-command history scope/safe
projection. That verified Phase 4a–4d evidence does not verify the Phase 4f
candidate dashboard write path. It makes no provider network request and does
not prove a live account, TLS endpoint, delivery, or production authorization
model.
