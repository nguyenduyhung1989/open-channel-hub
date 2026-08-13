# Phase 4d scoped queued reply-command history

Phase 4d adds a read-only history of the queued reply intents recorded by
Phase 4c. It does **not** send, retry, update, deliver, or mark a message read.
Every returned `queued` record means only that an immutable intent was already
committed to PostgreSQL.

Exact commit <code>160414e</code> passed final local checks, a synthetic
Compose proof, independent review, and GitHub CI/CodeQL for the combined Phase
4c–4d revision. This is not evidence of a live provider send, public TLS, or
production operation.

The history route is API-only. The Phase 4b dashboard remains read-only and
does not show or create reply commands.

## Prerequisites

- PostgreSQL must be available with the existing ninth migration,
  `0009_outbound_reply_commands`.
- The version-1 runtime secret document must configure an `inboxes` entry.
  Its bearer selects a fixed server-side set of existing connections.
- At least one Phase 4c source-bound command must already have been committed
  for the history to contain an item.

No runtime-secret field, environment variable, Docker service, provider token,
or database migration is added by Phase 4d.

## Read the history

Use the configured inbox bearer with `GET /v1/inbox/outbound-commands`:

```bash
curl \
  --header 'Authorization: Bearer <inbox token>' \
  'http://127.0.0.1:3000/v1/inbox/outbound-commands?limit=50'
```

The bearer is checked before the application validates query input or decodes a
cursor. It never accepts an inbox ID, connection ID, state selector, recipient,
or provider-specific filter. A connection-level operator bearer cannot use this
route.

`limit` is optional, defaults to 50, and accepts integers from 1 through 100.
The only other accepted query parameter is an opaque `cursor` received from a
previous page. Extra, malformed, or caller-scope parameters return `400`.

A successful page resembles:

```json
{
  "success": true,
  "data": {
    "commands": [
      {
        "id": "42",
        "sourceConnectionId": "telegram-bot-support",
        "sourceProviderEventId": "9001",
        "text": "Thank you; we are checking this now.",
        "state": "queued",
        "createdAt": "2026-08-13T00:00:00.000Z"
      }
    ],
    "nextCursor": "<opaque value when another page exists>"
  }
}
```

The returned `text` is the exact message text recorded by Phase 4c and is
sensitive operational data. Do not paste real text or a bearer into terminal
history, an issue, pull request, screenshot, or log.

The response deliberately does **not** contain `replyTargetId`, source message
ID, source channel, `clientOperationId`, raw provider payload, credentials,
future attempt data, provider receipt, or a delivery/read state.

## Stable scope-bound pagination

History is ordered by immutable PostgreSQL command ID, newest first. The first
page fixes a maximum queued command ID in the configured inbox scope. A
continuation reads below the previous row inside that snapshot, so commands
created later cannot shift or duplicate the traversal.

`nextCursor` is base64url-encoded opaque data with its own
`orderVersion: 1`. It binds the continuation to the exact inbox ID and a
SHA-256 representation of its canonical connection set. It is not a credential:
the inbox bearer remains required. A malformed, foreign-inbox,
scope-changed, unversioned, or unsupported-version cursor returns the same
generic `400`; restart at the first page rather than trying to repair it.

The history cursor is distinct from inbound-event cursors and cannot be reused
for an inbound route.

## Boundaries and failure behavior

| Result | Meaning                                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| `200`  | A page of queued source-bound intents in the configured inbox scope. An empty `commands` array is valid.             |
| `400`  | Authenticated query input or cursor is invalid, unsupported, or not bound to this exact inbox scope.                 |
| `401`  | The inbox bearer is absent, malformed, or unknown. The same generic response is used before query/cursor validation. |
| `404`  | No configured inbox feature exists in the runtime; this is not a valid empty-history response.                       |

The reader returns only `queued` rows. It does not offer a state filter because
no dispatch-state model exists. `queued` is not proof of provider acceptance,
send attempt, delivery, or read status.

## What this deliberately does not do

- No new migration, table, mutable state, worker, provider HTTP request,
  provider token/OAuth storage, attempt record, timeout policy, retry, receipt,
  delivery/read status, attachment, template, or media support.
- No command mutation, cancel/send button, browser dashboard history page, or
  public connection discovery.
- No real Telegram, Zalo OA, Facebook Page, WhatsApp Business, public TLS, or
  production authorization proof.

The legacy Phase 1a `POST /v1/telegram-bot/messages` endpoint remains separate
compatibility behavior. It is not a source for this history and does not turn a
Phase 4d row into a provider send.
