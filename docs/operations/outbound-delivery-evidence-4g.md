# Phase 4g append-only outbound delivery evidence

**Status: source verified at exact commit <code>6444699</code>.** It passed
<code>npm run check</code> (54 test files / 358 tests and build),
<code>npm audit --audit-level=low</code> with zero findings, Gitleaks with no
secrets, <code>git diff --check</code>, a synthetic Compose smoke with cleanup,
an independent security audit APPROVE with zero high/medium findings, and
GitHub checks <code>Verify Node 24.18.1</code> and
<code>Analyze JavaScript and TypeScript</code>. This verifies frozen source and
synthetic local evidence only; it does not prove public TLS, live provider I/O,
provider acceptance, delivery, read status, or production deployment.

Phase 4g adds a durable evidence foundation for a future outbound dispatcher.
It does **not** send a message. The existing Phase 4c command remains an
immutable `queued` intent, and no Phase 4g process talks to Telegram, Zalo OA,
Facebook Page, WhatsApp Business, or another provider.

## Prerequisites

- PostgreSQL must apply forward migration
  `0010_outbound_delivery_attempt_receipts` after the existing `0009` command
  migration.
- An immutable source-bound command already exists in
  `open_channel_hub.outbound_commands`.
- The normal migration service, not a manual SQL edit, must own the schema
  change. Never edit an applied migration or create evidence rows by hand in a
  deployed database.

## Evidence model

The migration adds two tables:

| Table                                | One row means                                              | Cardinality                      | Deliberate exclusions                                                               |
| ------------------------------------ | ---------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `outbound_delivery_attempts`         | A durable local attempt fact was recorded for one command. | At most one attempt per command. | Target, text, credential, raw provider data, HTTP detail, retry, and mutable state. |
| `outbound_delivery_attempt_receipts` | A known outcome was recorded for one attempt.              | Zero or one receipt per attempt. | Provider response body, error/reason detail, HTTP detail, retry, and mutable state. |

Both tables are append-only: their own PostgreSQL triggers reject updates and
deletes. The attempt references its command; the receipt references its
attempt. A command remains `queued` even when evidence exists.

## Read the evidence without overstating it

There is no Phase 4g HTTP endpoint, dashboard page, or command-history change.
The following meanings are for a future audited reader; they are not a send or
delivery interface:

| Current ledger condition                                       | Conservative label             | Safe statement                                                     | Unsafe statement                                                      |
| -------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| No `outbound_delivery_attempts` row                            | `not_attempted` (derived only) | No durable attempt fact currently exists in this ledger.           | No provider request could ever have occurred.                         |
| Attempt row, no receipt row                                    | `outcome_unknown` (derived)    | A durable attempt fact exists, but no known outcome is recorded.   | The provider rejected it, or retry is safe.                           |
| Receipt outcome `outcome_unknown`                              | `outcome_unknown`              | A durable observed result is explicitly unknown.                   | The provider did nothing.                                             |
| Receipt outcome `provider_rejected`                            | `provider_rejected`            | A known provider rejection is recorded.                            | A later retry is safe, or no other provider effect happened.          |
| Receipt outcome `provider_accepted` with `provider_message_id` | `provider_accepted`            | A provider-acknowledgement receipt is recorded with an identifier. | The message was sent over the network, delivered, displayed, or read. |

`not_attempted` is not a stored outcome. It is only a shorthand supported by
the absence of a durable attempt row. The database cannot prove the absence of
every conceivable external event.

The allowed receipt outcomes are exactly `provider_accepted`,
`provider_rejected`, or `outcome_unknown`. PostgreSQL requires a valid
non-empty printable
`provider_message_id` for `provider_accepted` and rejects that field for the
other two outcomes.

## Safe inspection

Use schema inspection only when confirming an installation. Do not put message
data, provider IDs, credentials, or raw responses in a terminal command, issue,
pull request, screenshot, or log.

```bash
docker compose exec postgres psql --username=postgres --dbname=open_channel_hub -c '\d open_channel_hub.outbound_delivery_attempts'
docker compose exec postgres psql --username=postgres --dbname=open_channel_hub -c '\d open_channel_hub.outbound_delivery_attempt_receipts'
```

The disposable Compose smoke test checks that all ten migrations apply and that
the Phase 4g tables, foreign keys, attempt uniqueness, receipt primary key,
outcome constraints, and immutable triggers exist. It deliberately does not
insert an attempt or receipt, start a worker, or contact a provider.

## What this deliberately does not do

- No provider credential, OAuth/access-token storage, HTTP request, SDK call,
  webhook registration, worker, queue, dispatch loop, or real account.
- No API route, dashboard control, browser bearer, command mutation, recipient
  picker, or new configuration variable.
- No automatic retry, retry count, timeout policy, cancellation, delivery/read
  receipt, template, media, attachment, provider response storage, or alerting.
- No claim that `queued`, `not_attempted`, an attempt, or `provider_accepted`
  means sent, delivered, displayed, or read.

The legacy Phase 1a `POST /v1/telegram-bot/messages` route remains separate
compatibility behavior. It is not a writer for these tables and cannot provide
delivery evidence for a Phase 4c command.

Before any provider dispatch is introduced, define one bounded official-provider
path, its capability and credential policy, attempt-write ordering, timeout
uncertainty handling, authorization, receipt mapping, retry prohibition or
policy, redaction, and production verification plan. Obtain separate owner
authorization before calling a real provider or exposing public TLS.
