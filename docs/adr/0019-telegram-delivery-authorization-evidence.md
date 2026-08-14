# ADR-0019: Immutable Telegram delivery authorization before dispatch

**Date:** 2026-08-14
**Status:** accepted

## Context

Phase 4c records a durable `queued` reply intent, Phase 4g can record
append-only attempt/receipt evidence, Phase 4h preserves the authority context
that created a command, and Phase 4i preserves private-chat and Bot-identity
evidence for a new Telegram command. None of those facts says that a human
explicitly approved a future Telegram provider request.

Treating every `queued` command as eligible would silently reinterpret old
intent-only data as send permission. Reusing the legacy
`POST /v1/telegram-bot/messages` route would be worse: that route accepts a
caller-selected recipient and bypasses the source-bound command ledger.

## Decision

1. Add optional
   `dashboard.principals[].telegramDeliveryAuthorizationInboxIds`. Omission
   becomes a frozen empty set, and every listed inbox must already be readable
   by that principal. This is independent of `replyIntentInboxIds`: an
   approver may review a command without being able to create one.
2. Materialize a separate server-only dashboard capability for this grant. The
   inbox-bearer catalog, rendered HTML, and browser form never receive its
   factory, an inbox bearer, a provider credential, a reply target, or a
   generic database capability.
3. Render a native form at
   `POST /operator/telegram-delivery-authorizations` only for a history entry
   whose PostgreSQL reader has already determined that it is currently
   eligible. The form carries only the signed-session anti-forgery value, an
   already visible inbox ID, and a non-secret command ID. The handler still
   treats all of them as untrusted and rechecks exact HTTPS origin, session,
   anti-forgery value, configured principal/inbox scope, and the store result.
4. Add forward migration
   `0013_outbound_telegram_delivery_authorizations`. Its one-to-one primary
   key/foreign key points to `outbound_telegram_command_eligibility`, so only a
   command with Phase 4i evidence can gain one immutable authorization row.
   The row contains only command ID, inbox ID, dashboard principal ID,
   SHA-256 scope fingerprint, opaque Bot fingerprint, and recording time. An
   update/delete-rejection trigger makes it append-only.
5. On insert and replay, the PostgreSQL boundary requires the fixed inbox
   connection scope, matching Phase 4h provenance, a Telegram private source,
   matching Phase 4i Bot evidence and current registry binding, no recorded
   delivery attempt, and no changed account identity. Missing, historical,
   out-of-scope, non-private, drifted, or already-attempted commands share the
   same unavailable result. The exact same principal/inbox/scope replays; a
   different principal in the same still-eligible scope conflicts.
6. This alpha is intentionally a one-operator approval boundary: a configured
   principal may authorize a command that it previously recorded. It is not a
   four-eyes control, and an immutable approval fact still does not start a
   worker, call Telegram, create an attempt, retry, or claim delivery.

## Options considered

### Auto-authorize every eligible `queued` command

Rejected. Eligibility and provenance are necessary evidence, not a human
delivery decision. Auto-authorization would reinterpret accumulated intent as
permission.

### Let every dashboard reader approve

Rejected. Read access does not imply durable-write authority. The independent
per-principal inbox subset keeps the capability explicit and revocable through
runtime configuration for future commands.

### Require a second distinct principal now

Rejected for the self-hosted one-operator alpha. There is no user or role model
to make a two-person claim trustworthy. A future multi-principal deployment
must introduce explicit separation-of-duties policy rather than infer it from
this row.

### Start Telegram delivery in the same phase

Rejected. There is no dispatcher/lease, current send policy, provider
credential boundary, timeout/unknown handling, receipt writer, retry policy,
or owner-authorized live verification. `sendMessage` has no request-side
idempotency key that would make a timeout safe to retry blindly.

## Consequences

Newly authorized commands gain one narrow, immutable human-authorization fact.
Historic commands and commands without all Phase 4h/4i evidence remain
unavailable. A future sender must still re-evaluate current policy and every
provider-specific condition immediately before any external request.
