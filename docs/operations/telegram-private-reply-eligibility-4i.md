# Phase 4i Telegram private-reply eligibility

**Status: source verified at exact commit `52608e0`.** This phase records
the minimum durable evidence a future Telegram-specific sender would need to
consider a reply. It does **not** send a message, start a worker, call Telegram,
or make an existing `queued` command dispatchable. The combined Phase 4h–4j
revision passed final local checks, an independent audit, a synthetic
Compose/PostgreSQL proof, GitHub Continuous Integration, and CodeQL. It is not
public-TLS, live-provider, or production evidence.

## What changes

Migration `0012_telegram_private_reply_eligibility` adds three linked facts:

| Fact                       | Where it is stored                                  | Purpose                                                                                                    | Deliberate exclusions                                                                 |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Telegram chat type         | `inbound_events.telegram_chat_type`                 | Preserves whether a newly received Telegram text came from `private`, `group`, `supergroup`, or `channel`. | Raw webhook JSON, group membership, recipient policy, and public API projection.      |
| Bot identity binding       | `connection_registry.provider_identity_fingerprint` | Binds a Telegram `connection_id` to a domain-separated SHA-256 fingerprint of the numeric Bot ID prefix.   | Bot ID plaintext, token suffix, token rotation data, or a Telegram API call.          |
| Reply eligibility snapshot | `outbound_telegram_command_eligibility`             | Captures `private` plus the Bot fingerprint atomically with a new Telegram command.                        | Reply target, text, token, raw provider response, attempt, receipt, or mutable state. |

The eligibility table is one-to-one with a command and append-only: its primary
key/foreign key, constraints, and trigger reject a second, altered, or deleted
record. The row is internal; it is not an HTTP response or dashboard field.

## Token and connection cutover

Telegram configuration now requires the exact Bot token shape
`<numeric Bot user ID>:<secret>`. The application derives the non-secret
fingerprint from the numeric prefix only. Do not manually extract, print, hash,
or put the token in a command.

An existing Telegram registry row with inbound history but no fingerprint cannot
be upgraded automatically. Its historic events do not prove which Bot received
them. Keep that history unchanged and give the current Bot a new
`connection_id`; do not edit PostgreSQL, backfill a fingerprint, or reuse the
old ID to bypass the startup failure.

The temporary legacy one-Bot environment and the secret-backed multi-connection
document both enforce this token shape. See
[the Phase 1a guide](telegram-bot-1a.md) and
[the runtime multi-connection guide](runtime-multi-connection-2c.md).

## Command eligibility

For a Telegram source, `POST /v1/inbox/outbound-commands` can create a new
intent only when all of the following are true inside one PostgreSQL
transaction:

1. The configured inbox already contains the source connection.
2. The exact inbound source row exists and is recorded as `private`.
3. The current registry row is still bound to a valid Bot fingerprint.
4. The Phase 4h authorization record and this Phase 4i eligibility record can
   both be appended with the command.

`group`, `supergroup`, `channel`, missing historic chat evidence, a missing or
changed Bot binding, an absent source, and an out-of-scope source all fail
closed. The public route keeps its generic source-unavailable response so it
does not reveal which condition was missing.

An exact replay is accepted only when the stored command's source, text,
authorization provenance, private chat type, and Bot fingerprint still match.
A Telegram command created before this migration has no eligibility row and
cannot be adopted by replay.

## Safe local verification

Use only the repository's synthetic smoke path:

```bash
bash scripts/verify-compose-postgres.sh
```

It uses fake Bot-shaped tokens and fake private/supergroup payloads. It proves
that a private fake source can record an intent with an opaque fingerprint and
that a fake supergroup source receives its webhook acknowledgement but cannot
create a command. It also checks the twelfth migration and the immutable
eligibility schema. It does not contact Telegram or use a real credential.

## What remains outside this phase

- Current authorization and policy rechecks at send time.
- Command selection/lease, worker lifecycle, provider HTTP, timeout handling,
  receipt writing, retry rules, delivery/read semantics, and error disclosure.
- Group or channel reply policy.
- Owner-authorized Telegram test-Bot/TLS verification and production operation.

See [ADR-0018](../adr/0018-telegram-private-reply-eligibility.md) for the
rationale and [the Phase 4h provenance guide](outbound-command-authorization-provenance-4h.md)
for the separate historical-authority boundary.
