# ADR-0015: Opt-in source-bound reply intents from the server-rendered dashboard

**Date:** 2026-08-13

**Status:** proposed

## Context

Phase 4c already records an immutable, source-bound reply intent through an
inbox-bearer API. Phase 4e lets a configured dashboard principal inspect the
same `queued` history without moving that bearer into the browser. The next
small operational step is to let a trusted principal record an intent from a
persisted inbound event, without turning every dashboard reader into a writer,
letting a browser choose a recipient, or implying that the message was sent.

The dashboard is still a configured-local principal boundary, not a complete
identity, organization, RBAC, audit, or delivery system. A dashboard form is a
state-changing browser boundary and must therefore retain the existing exact
origin, signed-session, anti-forgery, scope, and data-minimization controls.

## Decision

### Make dashboard write access an explicit per-inbox opt-in

Phase 4f proposes an optional `replyIntentInboxIds` array on each configured
`dashboard.principals[]` entry. It is a strict, unique subset of that
principal's already readable `inboxIds`, and every entry must name an existing
configured inbox. When the field is absent, it becomes an empty immutable
allow-list: the principal remains read-only.

The server creates a distinct narrow write closure only for an inbox in that
allow-list. The existing dashboard read closure remains read-only. Neither
closure contains an inbox bearer, provider credential, generic database client,
dispatcher, or recipient-selection capability.

### Bind one native form to one already rendered source event

For an enabled principal and inbox, the server renders one same-origin native
form inside each persisted inbound event card. The form has only one editable
field: reply text. It carries the selected inbox, canonical source connection
ID, canonical provider event ID, anti-forgery value, and a fresh server-created
UUIDv4 client operation ID as escaped hidden fields.

Hidden fields are transport inputs, not authorization. On
`POST /operator/reply-intents`, the server requires an active signed dashboard
session, the exact configured HTTPS `Origin`, a valid anti-forgery value, and
a strict single-value form shape. It resolves the principal's explicit write
grant before calling the source-bound Phase 4c command capability. The
underlying command path independently verifies that the source event is in the
configured inbox scope and derives the private reply target from that source.
The browser never supplies a recipient or receives that target. Its ordinary
inbound-event card may display canonical channel data read-only, but the form
does not carry a caller-editable channel or source-message field.

The form body is capped at 32 KiB before parsing. This is a transport bound,
not a message-length exception: the editable text still has its own 2,000
character limit and the server rejects an oversized body before the recorder
can run. Operator HTML, including a parser-rejected `413` page, retains
`Cache-Control: no-store`; the same-origin stylesheet has its separate cache
policy.

### Use post/redirect/get for durable intent only

A newly recorded command or an exact idempotent replay receives a `303`
redirect to the authenticated queued-history page without a command-result URL
signal. The queued-history row, not a redirect query value, is the only browser
evidence of a durable record. `queued` still means only that the immutable
intent was committed; it does not mean a provider accepted, sent, delivered, or
read a message. The history query remains strict, so a manufactured `notice`
parameter is rejected rather than becoming a forgeable success signal.

The dashboard applies a bounded in-process guard of at most 20 recording
attempts per configured principal in a rolling minute. This protects one
running process from a browser write burst; it is not a distributed or edge
rate limit. An external HTTPS proxy still owns cross-process rate limiting,
request logging hygiene, and public exposure controls.

### Preserve the existing provider and storage boundaries

Phase 4f adds no provider credential, OAuth/access-token storage, provider
HTTP call, worker, dispatch, retry, attempt, timeout, receipt, delivery/read
state, recipient picker, command mutation, database migration, table, index,
trigger, or Compose service. It uses the existing Phase 4c immutable command
store and `0009_outbound_reply_commands` migration unchanged.

The legacy Phase 1a Telegram direct-send route remains separate compatibility
behavior. It is not a dispatcher for Phase 4f rows and cannot establish a
delivery result for an intent recorded by this form.

## Options considered

### Let every dashboard reader record replies

Rejected. Reading a configured inbox and recording durable outbound intent are
different powers. An omitted configuration field must preserve the existing
read-only behavior rather than silently grant a new write capability.

### Put an inbox bearer or the Phase 4c API in browser JavaScript

Rejected. A bearer would broaden the browser's exposure and allow a
client-side caller to exercise an API intended for server-owned scope
resolution. Native forms plus a server-held session retain the existing
authorization boundary.

### Let the form accept a recipient or arbitrary source identifiers

Rejected. The private target must be derived from a durable canonical source
event after inbox-scope enforcement. A caller-selected recipient would bypass
the durable source relationship that makes an intent auditable and bounded.

### Treat a durable intent as a send result or automatically retry failures

Rejected. No provider dispatch or outcome model exists. An uncertain timeout
cannot safely be retried without a provider-specific attempt, idempotency, and
receipt design.

## Consequences

- Operators must deliberately review `replyIntentInboxIds` in the runtime
  secret before a dashboard principal can record a command. Removing an inbox
  from this subset removes the server-side form capability on the next
  configuration load.
- Browser-visible source IDs and the generated operation ID are still
  untrusted input on submission. The authorization and source relationship are
  enforced again on the server and in the existing durable command boundary.
- The per-principal throttle is an abuse guard, not a production multi-instance
  control. A public deployment needs edge rate limiting and verified proxy,
  logging, TLS, and incident procedures.
- Final local verification, independent security review, and fresh GitHub
  checks are still required before this proposed candidate becomes an accepted
  source decision. None of those checks would by themselves prove public TLS,
  a real provider send, or production deployment.
