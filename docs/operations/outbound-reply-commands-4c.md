# Phase 4c durable source-bound reply commands

Phase 4c records a durable operator intent to reply to one already stored
inbound event. It does **not** send that reply. The initial command state
`queued` means only that PostgreSQL committed the intent; it is not a provider
acceptance, sent, delivered, or read status.

This is a deliberately small API boundary, not a dispatcher, worker, retry
queue, delivery tracker, browser reply feature, or provider-integration proof.
No provider request is made by this route.

## Prerequisites

- PostgreSQL and migration `0009_outbound_reply_commands` must be available.
- The version-1 runtime secret document must configure at least one `inboxes`
  entry. Its token is a secret and selects a fixed server-side set of existing
  connections.
- The source inbound event must already be durable in
  `open_channel_hub.inbound_events` and belong to that inbox's configured
  connection set.

The inbox token now grants two narrow capabilities: read canonical inbound
events and record a source-bound reply intent. It is not a user account, role,
provider credential, arbitrary-recipient grant, or delivery authorization.

## Record one reply intent

Send an authenticated JSON request to
`POST /v1/inbox/outbound-commands`:

```bash
curl \
  --header 'Authorization: Bearer <inbox token>' \
  --header 'Content-Type: application/json' \
  --data '{
    "clientOperationId": "support-reply-0001",
    "sourceConnectionId": "telegram-bot-support",
    "sourceProviderEventId": "9001",
    "text": "Thank you; we are checking this now."
  }' \
  http://127.0.0.1:3000/v1/inbox/outbound-commands
```

Use a local secret workflow for the bearer; never paste a real token or message
into shell history, an issue, a pull request, screenshot, or log. The example
contains placeholders and synthetic text only.

The body is strict and contains exactly these fields:

| Field                   | Requirement                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clientOperationId`     | A 1–128-character opaque identifier using letters, digits, `.`, `_`, `:`, or `-`; it cannot be `.` or `..`. It is idempotent only within the source connection. |
| `sourceConnectionId`    | A configured, in-scope connection ID using the same safe 1–128-character identifier rules.                                                                      |
| `sourceProviderEventId` | The exact already-durable provider event ID: 1–512 printable non-space ASCII characters.                                                                        |
| `text`                  | 1–2,000 characters after non-blank validation. The service retains the supplied text exactly; it does not trim or rewrite it.                                   |

There is intentionally no `recipientId`, `replyTargetId`, provider channel,
source message ID, delivery state, or retry setting in the body. The storage
adapter loads the source event after scope enforcement and derives its private
reply target from canonical `conversation_id`, plus its source message ID and
channel.

## Safe response and status rules

A new command returns `201` and only safe metadata:

```json
{
  "success": true,
  "data": {
    "id": "42",
    "sourceConnectionId": "telegram-bot-support",
    "sourceProviderEventId": "9001",
    "state": "queued",
    "createdAt": "2026-08-13T00:00:00.000Z"
  }
}
```

The response does not include message text, a reply target, source message ID,
source channel, raw provider payload, inbox membership, or credential.

| Result | Meaning                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `201`  | A new immutable `queued` intent was committed.                                                                                                               |
| `200`  | The exact same command was already committed for that connection and `clientOperationId`; this is a safe idempotent replay.                                  |
| `409`  | The same `clientOperationId` was reused on that connection with different source event or text. Do not retry with another payload under the same identifier. |
| `404`  | The source event is absent **or** outside the selected inbox scope. The response deliberately does not distinguish the two cases.                            |
| `400`  | The authenticated body is malformed, has an extra field, or violates a field bound.                                                                          |
| `401`  | The inbox bearer is absent, malformed, or unknown. Authentication happens before Fastify parses the body.                                                    |

Use one stable `clientOperationId` only when retrying a request whose outcome is
unknown to the caller. If the source or text changes, choose a new operation
identifier after deciding whether the earlier intent should remain in the
immutable ledger.

## Storage and integrity boundary

Migration `0009_outbound_reply_commands` creates
`open_channel_hub.outbound_commands`. It stores the command ID, source
connection/provider-event identifiers, client operation ID, private derived
reply target, source message ID/channel, message text, `queued` state, and
creation time. A composite foreign key binds the row to the exact inbound
event. `(connection_id, client_operation_id)` is unique. PostgreSQL rejects any
update or delete through an immutable-row trigger.

Outgoing message text and private reply-target metadata are sensitive
operational data. They remain inside PostgreSQL and never belong in repository
fixtures, issue text, screenshots, logs, or diagnostic commands. Phase 4d adds
one scope-bound history route that returns the text with safe command metadata,
but never the private target/source fields or client operation ID. The Phase 4e
source renders a smaller escaped dashboard projection through a signed
session, not a browser bearer; see the
[queued command-history guide](outbound-command-history-4d.md) and
[Phase 4e guide](operator-dashboard-queued-history-4e.md).

## What this deliberately does not do

- No provider dispatch, HTTP client, provider token, OAuth, template, media,
  attachment, delivery/read receipt, attempt record, retry, or timeout policy.
- No mutation of the command after `queued`; no claim that it was sent.
- No dashboard reply form. The Phase 4e source only renders queued-history
  text and source connection IDs through the existing read-only dashboard; it
  adds no command creation, recipient, send, retry, cancellation, or provider
  action.
- No real Telegram, Zalo OA, Facebook Page, WhatsApp Business, public TLS, or
  production authorization proof.

The legacy Phase 1a `POST /v1/telegram-bot/messages` endpoint is separate
compatibility behavior. It is not routed through this command ledger and is
not evidence that every provider send is durable. Do not use its existence to
infer delivery behavior for a Phase 4c command.

Before a dispatcher can exist, define and independently review provider
capabilities, authorization, credential handling, delivery receipts, timeout
uncertainty, retry safety, audit/retention behavior, and a new migration/state
model.
