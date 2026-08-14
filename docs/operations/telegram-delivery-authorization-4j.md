# Phase 4j Telegram delivery authorization evidence

**Status: source verified at exact commit `52608e0`.** Phase 4j records
one immutable human authorization fact for a narrowly eligible Telegram reply
command. It does **not** send a message, create an attempt, start a worker,
call Telegram, retry, or make `queued` mean delivered. The combined Phase 4h–4j
revision passed final local checks, an independent audit, a synthetic
Compose/PostgreSQL proof, GitHub Continuous Integration, and CodeQL. It is not
public-TLS, live-provider, or production evidence.

## Configuration boundary

Inside the existing secret-backed `dashboard` configuration, a principal may
optionally declare:

```json
{
  "id": "support-operator",
  "inboxIds": ["support"],
  "telegramDeliveryAuthorizationInboxIds": ["support"]
}
```

The array is optional. Omission becomes an empty immutable set, so current
dashboard principals do not gain approval authority during upgrade. Each value
must be unique, configured, and already included in that principal's readable
`inboxIds`. It is separate from `replyIntentInboxIds`: a principal can be an
approver without being able to create new reply intents.

The browser never receives an inbox bearer, Bot token, provider credential,
scope fingerprint, Bot fingerprint, private target, or generic storage
capability. A signed session selects the principal server side.

## What migration `0013` stores

`0013_outbound_telegram_delivery_authorizations` adds one append-only table:

| Field                      | Meaning                                                                  | Not stored                                                                                       |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `command_id`               | Primary key and foreign key to the Phase 4i Telegram-eligibility row.    | Target, source message ID, text, token, raw response, attempt, receipt, retry, or mutable state. |
| `inbox_id`                 | Configured inbox evaluated at authorization time.                        | Bearer or browser session.                                                                       |
| `dashboard_principal_id`   | Configured dashboard principal selected from the signed session.         | Password/hash, anti-forgery value, or browser identity artifact.                                 |
| `scope_fingerprint`        | Domain-separated SHA-256 of the sorted server-selected connection scope. | The scope list or a credential.                                                                  |
| `bot_identity_fingerprint` | Opaque SHA-256 binding for the current Telegram Bot account.             | Bot ID prefix and token secret.                                                                  |
| `authorized_at`            | PostgreSQL recording time.                                               | A provider acceptance, delivery, or read time.                                                   |

The row is one-to-one with the command and immutable. PostgreSQL rejects a
second altered row, `UPDATE`, and `DELETE`.

## Browser flow and rechecks

`GET /operator/outbound-commands` renders an approval form only when its
server-side history reader has already found all of these facts:

1. The command remains `queued` and belongs to the selected configured inbox
   scope.
2. Its Phase 4h provenance matches that inbox and the current canonical scope.
3. Its source is Telegram `private`, with Phase 4i eligibility evidence.
4. The current connection registry still matches the stored opaque Bot
   fingerprint.
5. No delivery-attempt row and no prior Telegram authorization row exist.

The native form posts only `csrf`, `inbox`, and `commandId` to
`/operator/telegram-delivery-authorizations`. The route requires exact HTTPS
`Origin`, an active signed session, matching anti-forgery value, and the
principal's separate approval scope before it calls the writer. The writer
repeats the durable checks in its transaction; the rendered form is never a
permission by itself.

The exact same principal/inbox/scope can replay safely. A different principal
within the same eligible scope receives a conflict. Absent, historic,
out-of-scope, non-Telegram, non-private, Bot-drifted, or already-attempted
commands share an unavailable result. This avoids using the approval endpoint
as an account or policy oracle.

The supplied local dashboard is deliberately one-operator alpha behavior:
the configured principal may authorize an intent it recorded. This is not
dual approval or separation of duties.

## Safe verification

Use the repository's synthetic smoke path:

```bash
bash scripts/verify-compose-postgres.sh
```

The loopback Compose stack supplies a disposable synthetic dashboard
configuration only for this test. It manually returns the signed `Secure`
cookie to `curl`, then exercises the server-rendered authorization route and
its PostgreSQL writer. It verifies thirteen migrations, the new table's exact
columns, foreign key, primary key, named constraints, and immutable trigger;
it also proves one create, exact replay, different-principal conflict, and
legacy/Bot-drifted/non-private/already-attempted unavailable outcomes against
PostgreSQL itself.

The disposable fixture directly seeds synthetic command/evidence rows and one
attempt only to reach the unavailable branches. The authorization writer never
creates an attempt. This is not browser-over-HTTP behavior or external HTTPS
cookie proof, and it does not call Telegram or create a provider receipt.

## What remains outside this phase

- A separate current policy and command-selection/lease design.
- Provider credential isolation, an explicitly authorized dispatcher, and
  source/authorization rechecks immediately before any request.
- Timeout handling that records `outcome_unknown` rather than retrying blindly.
- Receipt mapping, retry policy, multi-principal separation of duties,
  owner-authorized Telegram TLS testing, and production operation.

See [ADR-0019](../adr/0019-telegram-delivery-authorization-evidence.md),
[the Phase 4i guide](telegram-private-reply-eligibility-4i.md), and
[the Phase 4g evidence guide](outbound-delivery-evidence-4g.md).
