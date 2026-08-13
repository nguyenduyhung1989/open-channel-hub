# Phase 4e dashboard queued-command history

Phase 4e is a small server-rendered dashboard page that lets a configured,
authenticated dashboard principal inspect `queued` reply intents for one of
that principal's configured inboxes. Phase 4e itself does **not** create, send,
retry, cancel, update, deliver, or mark any message read. The separate verified
Phase 4f source can record the existing source-bound intent from an explicitly
granted event form; it does not change this history page into a send or
delivery surface.

`queued` means PostgreSQL has recorded immutable operator intent. It is not a
provider acceptance, send attempt, delivery, or read status. Exact commit
<code>465186e</code> passed formatting, lint, strict type checking, 53 test
files / 351 tests, build, low-threshold dependency audit, secret scan, diff
check, synthetic Compose proof, and an independent security audit that returned
APPROVE with no high- or medium-severity finding. GitHub's
<code>Verify Node 24.18.1</code> and CodeQL's
<code>Analyze JavaScript and TypeScript</code> both succeeded for that exact
commit. This is source verification only; it is not a public-TLS, live-provider,
or production claim.

## Prerequisites

- The optional Phase 4b `dashboard` configuration and its configured
  principals must already be valid. The dashboard needs the exact external
  HTTPS origin described in the
  [operator dashboard guide](operator-dashboard-4b.md).
- The selected dashboard principal must already have at least one configured
  inbox in its server-side `inboxIds` allow-list.
- PostgreSQL must have `0009_outbound_reply_commands` and Phase 4d queued
  history available. It was the ninth migration at the verified Phase 4e
  revision; current installations also apply later forward migrations such as
  the verified Phase 4g source `0010_outbound_delivery_attempt_receipts`. No Phase
  4e migration or configuration field was added.
- A Phase 4c reply intent must already exist before the page has an item to
  display.

Do not configure an inbox bearer in a browser, a URL, a page source, or a
browser-side request. The dashboard has its own signed session and obtains the
read capability only inside the server process.

The verified Phase 4f source adds an optional dashboard-principal
`replyIntentInboxIds` field, not a Phase 4e history configuration field. It is
an explicit write subset of already readable inboxes and is documented in the
[Phase 4f reply-intent guide](operator-dashboard-reply-intents-4f.md).

## Open the page

After logging in through `/operator/login`, open:

```text
https://your-dashboard.example/operator/outbound-commands
```

The first inbox assigned to the authenticated principal is selected when no
query is supplied. A principal with more than one allowed inbox can select one
of its own inboxes using an opaque safe ID:

```text
https://your-dashboard.example/operator/outbound-commands?inbox=support-inbox
```

The route accepts only these optional query values:

| Query value | Meaning                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `inbox`     | One safe configured inbox ID already assigned to the authenticated principal. It cannot add a connection or select another principal's inbox. |
| `cursor`    | A previously rendered opaque Phase 4d history continuation. It is bound to the exact selected inbox and canonical connection set.             |

There is no `limit`, recipient, connection selector, state selector, provider
filter, command ID, source event ID, send setting, retry setting, or write
form. The server always reads 50 rows per page.

The dashboard authenticates and touches the browser session before it parses
these values or contacts the history reader. A missing or invalid session
redirects to `/operator/login`. A malformed query or cursor receives a generic
safe `400` page. An inbox outside the principal's configured allow-list
receives a generic safe `404` page and is not read. Do not try to edit or repair
a cursor; return to the first page instead.

## What the page displays

The page orders queued commands newest first and renders only:

- the recorded creation time;
- the static label **Recorded — not sent**;
- the exact recorded reply text; and
- the source connection ID.

The reply text is sensitive operational data and untrusted content. The server
escapes it before rendering, sets `Cache-Control: no-store`, and does not put
an inbox bearer or credential in the page. Do not copy real text into issue
threads, screenshots, public logs, or browser-based support tooling without a
separate data-handling decision.

The page deliberately omits the command ID, provider event ID, private reply
target, source message ID, source channel, client operation ID, raw provider
payload, credential, attempt data, receipt, and delivery/read state.

## Stable continuation

When more rows exist, the page links to a continuation using the existing Phase
4d history cursor. It has `orderVersion: 1`, binds the exact inbox ID and a
SHA-256 representation of its canonical connection set, and fixes a reverse
command-ID snapshot. Later queued commands cannot shift or duplicate an
already-started traversal.

That cursor is neither a credential nor an inbound-event cursor. It binds the
inbox ID and canonical connection set, not a principal. A principal that is not
assigned that inbox is rejected before the history reader runs; a different
inbox, changed scope, malformed value, or inbound-event cursor cannot read
command history.

## Explicit boundary

This page has no browser JavaScript or API bearer, no command creation form,
and no provider network operation. The normal dashboard logout form remains a
session-management control; it is not an outbound action. Phase 4f's verified
form is a separate `/operator` event-card control, available only after an
explicit per-principal inbox grant and still bounded to the existing durable
intent store.

Phase 4e does not change `outbound_commands`, the immutable-row trigger, the
Phase 4d reader, or the provider boundary. The only ordinary write while
viewing is the dashboard session's existing idle-timeout touch. Phase 4f's
verified source reuses the existing Phase 4c immutable write path but adds no schema
or provider behavior. A later dispatcher needs a separate provider-specific
design for capabilities, authorization, durable attempts, timeout uncertainty,
retries, receipts, and delivery state.
