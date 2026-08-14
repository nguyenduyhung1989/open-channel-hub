# Phase 4h immutable outbound-command authorization provenance

**Status: candidate source; not yet verified.** Phase 4h records a narrow,
append-only answer to “which server-side authority path created this command?”
It does **not** send a message, authorize a future send, or prove delivery.

## What migration `0011` adds

Migration `0011_outbound_command_authorizations` adds one table:

| Table                             | Cardinality                                                                    | Stored fields                                                                                                            | Deliberate exclusions                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outbound_command_authorizations` | Zero or one row per command; `command_id` is both primary key and foreign key. | Command ID, authority kind, configured inbox ID, optional dashboard principal ID, scope fingerprint, and recording time. | Inbox bearer, browser session, password/hash, anti-forgery value, reply target, message text, provider credential, raw provider data, delivery result, retry, and mutable state. |

The only accepted kinds are:

- `inbox_bearer`: `inbox_id` is present and `dashboard_principal_id` must be
  `NULL`. It records that the server used a configured inbox-bearer path; it
  never stores the bearer.
- `dashboard_principal`: both `inbox_id` and `dashboard_principal_id` are
  present. It records that the server used the principal's explicitly writable
  inbox closure; it never stores a browser session or grants the principal a
  future send permission.

`scope_fingerprint` is a domain-separated SHA-256 digest made inside the
PostgreSQL adapter from the sorted connection IDs that were allowed when the
command was recorded. It is evidence of the evaluated scope, not a credential,
a scope list, or a substitute for a fresh permission check.

The table is append-only. Its trigger rejects `UPDATE` and `DELETE`; its
constraints reject unknown authority kinds, malformed IDs/fingerprints, and
wrong principal/kind combinations.

## How a new command gains provenance

The public inbox command route and the server-rendered dashboard form keep
their existing inputs and responses. Neither accepts or exposes an authority
kind, dashboard principal ID, or fingerprint. The dashboard form does carry
the selected inbox ID, which its authenticated principal can already see; the
server treats it as untrusted input and accepts it only when it resolves to a
pre-built writable capability for that exact principal and inbox.

The server supplies the provenance internally:

| Server-owned path                                               | Durable authority record                                                                                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Configured inbox-bearer API                                     | `inbox_bearer` plus the configured inbox ID.                                                                                                                                                                       |
| Configured dashboard principal with `replyIntentInboxIds` grant | `dashboard_principal` plus the configured writable inbox ID and authenticated principal ID; the browser can submit only an untrusted inbox selection, never the kind, principal, scope fingerprint, or capability. |

The adapter creates the source-bound `outbound_commands` row and its
authorization row in one PostgreSQL transaction. An exact idempotent replay
requires the same source, text, authority kind, inbox, optional principal, and
scope fingerprint. A mismatch is a conflict, not a rewrite.

## Historic commands and dispatch boundary

Commands created before `0011` have no authorization row. Phase 4h does not
backfill or guess one, because a connection/source event cannot tell which
authority created an old command. These provenance-free rows remain no-dispatch
candidates.

Even a new command with a provenance row remains `queued`. The row proves only
what durable authority context was recorded at creation time. A future sender
must separately recheck current authorization and provider-specific eligibility
before it could call a provider. This phase has no provider HTTP request,
worker, queue, retry, delivery/read state, OAuth/token storage, dashboard send
control, or live-provider test.

## Safe verification

Use the normal migration service; do not manually insert, update, delete, or
backfill authorization rows in a deployed database. Schema inspection is safe
when it avoids real command data and credentials:

```bash
docker compose exec postgres psql --username=postgres --dbname=open_channel_hub -c '\\d open_channel_hub.outbound_command_authorizations'
```

The disposable Compose smoke keeps its Phase 4c API POST checks so it still
proves source-bound command behavior. Those ordinary API calls necessarily
create a provenance row in the same transaction. The Phase 4h part of the
smoke adds no direct SQL/DML and no authorization-row semantic assertion: it
checks only the eleventh migration, the table's exact column shape, foreign key,
primary key, named constraints, and immutable trigger. It makes no provider
call.

## What remains before provider dispatch

- A current authorization recheck and an explicit policy for legacy commands.
- Provider-specific account identity and private-recipient eligibility,
  including a Telegram private-chat/account-identity design.
- Credential isolation, capability policy, attempt-write ordering, timeout
  uncertainty, receipt mapping, retry prohibition or policy, redaction, and
  production verification.

See [ADR-0017](../adr/0017-immutable-outbound-command-authorization-provenance.md)
for the rationale, and [the Phase 4g evidence guide](outbound-delivery-evidence-4g.md)
for the separate no-dispatch attempt/receipt storage foundation.
