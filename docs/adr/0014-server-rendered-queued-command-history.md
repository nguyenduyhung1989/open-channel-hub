# ADR-0014: Server-rendered queued command history for configured dashboard principals

**Date:** 2026-08-13

**Status:** accepted

## Context

Phase 4c records immutable, source-bound reply intents, and Phase 4d exposes a
safe, inbox-scoped history of their `queued` rows through an inbox bearer API.
That API is intentionally not a browser API: an inbox bearer must never reach
HTML, browser JavaScript, a URL, or a client-side request.

The existing Phase 4b dashboard already authenticates configured local
principals with a server-held session and limits each principal to configured
inboxes. A small operational view of queued intent is useful, but it must not
grow into a command-creation surface, a provider dispatcher, or a delivery
timeline. This ADR records the decision implemented in the verified Phase 4e
source at exact commit <code>465186e</code>. Source verification does not claim
public TLS, a provider send, or production deployment.

## Decision

### Render one read-only history page through the existing dashboard boundary

Phase 4e adds `GET /operator/outbound-commands` only when the optional
server-rendered dashboard is configured. It uses the same signed dashboard
session, `Secure` `HttpOnly` cookie, configured principal, and preconfigured
inbox allow-list as `/operator`.

The route touches and validates the dashboard session before it interprets a
query or reads history. Its strict query permits only an optional `inbox`
identifier and an opaque `cursor`. The selected inbox must belong to the
authenticated principal; a URL never grants an additional inbox or connection
scope. The route has a fixed 50-row page size.

The dashboard composition receives a narrow server-side history-read closure,
not an inbox bearer. It reuses the Phase 4d history reader and its separate
cursor format, including the version, exact inbox ID, canonical connection-set
binding, and reverse command-ID snapshot. The history cursor is not
interchangeable with an inbound-event cursor.

### Keep the browser projection deliberately smaller than the API projection

The rendered page shows only the recorded creation time, the recorded text,
the source connection ID, and an unambiguous static label that the item was
recorded but not sent. Dynamic values are HTML-escaped and the response keeps
the dashboard's `Cache-Control: no-store` and restrictive page policy.

The page does not render a command ID, provider event ID, reply target, source
message ID, source channel, client operation ID, raw provider data,
credential, attempt, receipt, or delivery/read state. It contains no browser
bearer, browser API call, JavaScript, outbound-message form, recipient
selector, send button, retry button, cancellation action, or command-state
mutation. The inherited logout form remains only a session-management control.

### Preserve the existing database and provider boundaries

Phase 4e adds no runtime-secret field, migration, table, index, trigger,
outbound-command or inbound-event mutation, provider SDK/client, worker,
dispatch, retry, timeout, receipt, or delivery state. The only normal write
caused by viewing the page is the pre-existing dashboard-session touch used to
maintain its idle timeout; it does not alter a command or inbound event.

`queued` remains a durable operator intent only. It does not mean a provider
accepted, sent, delivered, or read a message. The legacy Phase 1a Telegram
direct-send endpoint remains separate compatibility behavior and is not a
dispatcher for Phase 4e rows.

## Alternatives considered

### Let browser JavaScript call the Phase 4d inbox-bearer API

Rejected. It would put an inbox bearer and a broad inbox write/read capability
in the browser. Server-side session authorization and the existing narrow
dashboard capability graph avoid that expansion.

### Show the complete command row or a synthetic delivery status

Rejected. Private target/source metadata and client operation IDs are not
needed for this operational view. No provider delivery model exists, so any
sent/delivered label would be false.

### Add reply, send, retry, or cancel controls with the history page

Rejected. Those controls require separate provider capability, authorization,
attempt, timeout, receipt, retry, and immutable-state design. A dashboard form
would materially expand the trust boundary without solving those requirements.

### Add a new dashboard-specific history cursor

Rejected. The Phase 4d cursor already binds the exact inbox scope and stable
command-ID snapshot. Reusing it avoids two similar pagination formats that
could drift apart.

## Consequences

- An authorized configured dashboard principal can inspect only the queued
  history for an inbox already assigned to that principal.
- Recorded reply text is now rendered into authenticated, server-generated
  HTML. It remains sensitive and untrusted data, so it must be escaped and
  protected by the same browser/session and operational handling rules as
  inbound text.
- Exact commit <code>465186e</code> completed focused dashboard-history tests,
  local checks, independent review, and fresh GitHub CI/CodeQL evidence.
  External HTTPS/proxy and production authorization proof remain separate work.
- A future dispatcher must introduce its own durable attempt/state model and
  provider-specific review. It must not infer a safe retry or delivery result
  from this read-only page.
