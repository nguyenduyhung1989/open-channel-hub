# ADR-0018: Telegram private-chat and Bot-identity evidence before dispatch

**Date:** 2026-08-14
**Status:** accepted

## Context

Phase 4c can record an immutable `queued` reply intent from a durable inbound
event, but it must not turn every historical Telegram event into permission to
send. Before this decision, the canonical ledger deliberately omitted Telegram
`message.chat.type`, and the connection registry did not bind a Telegram
connection ID to a Bot account. A future sender could therefore not prove both
that a reply came from a private chat and that the configured Bot was still the
same account that received it.

The existing Phase 1a direct-send compatibility route is not a substitute: it
accepts a caller-selected recipient and does not use the durable reply-command
ledger.

## Decision

1. Normalize only the documented Telegram chat types `private`, `group`,
   `supergroup`, and `channel`. Store the type as internal canonical evidence
   in `inbound_events.telegram_chat_type`; do not return it through an account
   or inbox API and do not render it in the dashboard.
2. Require a Telegram Bot token to have the documented
   `<numeric Bot user ID>:<secret>` shape. Derive a domain-separated SHA-256
   provider-identity fingerprint from the numeric prefix only. The prefix and
   secret are not stored. Token rotation for the same Bot keeps the fingerprint
   stable; a different Bot changes it.
3. Require that fingerprint in a Telegram registry registration. A legacy
   Telegram registry row with durable inbound history and no fingerprint cannot
   be silently upgraded or adopted. Configure the Bot under a new
   `connection_id` instead; historical data remains intact and no backfill is
   attempted.
4. On a new Telegram reply command, require a durable source event with
   `telegram_chat_type = 'private'` and a current registered Bot fingerprint.
   Write one immutable `outbound_telegram_command_eligibility` row in the same
   PostgreSQL transaction as the command and its Phase 4h authorization row.
   It records only the non-secret fingerprint, `private`, and time.
5. A Telegram idempotent replay must still match the stored private-chat and
   Bot-identity evidence. Old Telegram commands with no eligibility row remain
   no-dispatch candidates and return an idempotency conflict rather than being
   adopted. Non-Telegram behavior remains unchanged.

## Options considered

### Infer private eligibility from historical payloads or command fields

Rejected. Raw payloads are intentionally not stored, and command fields do not
retain a reliable Telegram chat type. Guessing would convert missing evidence
into permission.

### Bind a historical connection ID to the current Bot automatically

Rejected. Historical Telegram inbound rows cannot prove the Bot account that
received them. Updating a missing binding after history exists would make an
unverified claim about account continuity.

### Ask Telegram with `getMe` during startup

Rejected for this phase. It adds provider network traffic and availability
coupling without repairing historic evidence. The local token structure gives a
stable non-secret identity input without a provider call.

### Permit group, supergroup, or channel sources

Rejected. This phase prepares only a narrow private-chat eligibility fact. Any
group policy needs a separate explicit design and review.

## Consequences

Migration `0012_telegram_private_reply_eligibility` is forward-only and leaves
old rows unchanged. It adds nullable chat evidence to the inbound ledger, a
`NOT VALID` constraint for new Telegram rows and registry writes, and the
append-only eligibility table.

This does not dispatch, retry, queue, call Telegram, create a worker, add a
delivery state, alter `outbound_commands.state`, or make a `queued` command
sendable. A future provider-specific sender still needs current authorization,
explicit command selection policy, attempt ordering, timeout handling, receipt
mapping, and owner-authorized live verification.
